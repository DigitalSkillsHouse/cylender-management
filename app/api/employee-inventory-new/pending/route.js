import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeePurchaseOrder from "@/models/EmployeePurchaseOrder"

// Disable caching for this route - force dynamic rendering
export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function GET(request) {
  try {
    await dbConnect()

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get("employeeId")

    if (!employeeId) {
      return NextResponse.json({ error: "Employee ID is required" }, { status: 400 })
    }

    // Keep this query lightweight to avoid slow/infinite loading.
    // Include auto-approved + legacy rows, but exclude completed/cancelled and already received.
    const pendingOrders = await EmployeePurchaseOrder.find({
      employee: employeeId,
      status: { $nin: ["cancelled", "completed"] },
      $or: [
        { autoApproved: true, inventoryStatus: { $in: ["approved", "pending"] } },
        { autoApproved: true, inventoryStatus: { $exists: false } },
        { status: "approved", inventoryStatus: "approved" },
        { status: "approved", inventoryStatus: "pending" },
        { status: "approved", inventoryStatus: { $exists: false } },
        { status: "pending", inventoryStatus: "pending", autoApproved: true },
      ],
    })
      .select(
        "poNumber product supplier purchaseDate quantity unitPrice purchaseType cylinderStatus gasType emptyCylinderId emptyCylinderName employee createdAt",
      )
      .populate("product", "name productCode category cylinderSize")
      .populate("supplier", "companyName name")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean()

    const transformedOrders = pendingOrders.map((order, index) => ({
      id: `${order._id}-${index}`,
      poNumber: order.poNumber || `PO-${order._id.toString().slice(-6)}`,
      productName: order.product?.name || "Unknown Product",
      productCode: order.product?.productCode || "",
      supplierName: order.supplier?.companyName || order.supplier?.name || "Unknown Supplier",
      purchaseDate: order.purchaseDate || order.createdAt,
      quantity: order.quantity || 0,
      unitPrice: order.unitPrice || 0,
      totalAmount: (order.quantity || 0) * (order.unitPrice || 0),
      status: "pending", // frontend expects pending in this section
      purchaseType: order.purchaseType || "gas",
      cylinderStatus: order.cylinderStatus,
      gasType: order.gasType,
      emptyCylinderId: order.emptyCylinderId,
      emptyCylinderName: order.emptyCylinderName,
      employeeName: "",
      employeeId: order.employee || employeeId,
      originalOrderId: order._id.toString(),
      itemIndex: index,
    }))

    return NextResponse.json({ success: true, data: transformedOrders })
  } catch (error) {
    console.error("Error fetching employee pending inventory:", error)
    return NextResponse.json({ error: `Failed to fetch pending orders: ${error.message}` }, { status: 500 })
  }
}
