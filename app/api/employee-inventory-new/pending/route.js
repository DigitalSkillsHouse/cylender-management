import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeePurchaseOrder from "@/models/EmployeePurchaseOrder"
import Product from "@/models/Product"
import Supplier from "@/models/Supplier"

export async function GET(request) {
  try {
    console.log('🔍 Employee pending inventory API called')
    await dbConnect()
    
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    
    if (!employeeId) {
      return NextResponse.json({ error: "Employee ID is required" }, { status: 400 })
    }

    console.log('📋 Fetching pending purchase orders for employee:', employeeId)
    
    // Fetch employee's pending purchase orders (approved by admin but not yet accepted by employee)
    const pendingOrders = await EmployeePurchaseOrder.find({
      employee: employeeId,
      status: 'approved' // Admin approved but employee hasn't accepted yet
    })
    .populate('product', 'name productCode category cylinderSize')
    .populate('supplier', 'name')
    .populate('employee', 'name email')
    .sort({ createdAt: -1 })
    .lean()

    console.log('📊 Found pending orders:', {
      count: pendingOrders.length,
      orders: pendingOrders.map(order => ({
        id: order._id,
        product: order.product?.name,
        status: order.status,
        quantity: order.quantity
      }))
    })

    // Transform to match frontend interface
    const transformedOrders = pendingOrders.map((order, index) => ({
      id: `${order._id}-${index}`,
      poNumber: order.poNumber || `PO-${order._id.toString().slice(-6)}`,
      productName: order.product?.name || 'Unknown Product',
      productCode: order.product?.productCode || '',
      supplierName: order.supplier?.name || 'Unknown Supplier',
      purchaseDate: order.purchaseDate || order.createdAt,
      quantity: order.quantity || 0,
      unitPrice: order.unitPrice || 0,
      totalAmount: (order.quantity || 0) * (order.unitPrice || 0),
      status: 'pending', // For frontend display
      purchaseType: order.purchaseType || 'gas',
      cylinderStatus: order.cylinderStatus,
      gasType: order.gasType,
      emptyCylinderId: order.emptyCylinderId,
      emptyCylinderName: order.emptyCylinderName,
      employeeName: order.employee?.name || '',
      employeeId: order.employee?._id || employeeId,
      originalOrderId: order._id.toString(),
      itemIndex: index
    }))

    console.log('📤 Returning pending orders:', {
      totalOrders: transformedOrders.length,
      employeeId: employeeId
    })

    return NextResponse.json({ success: true, data: transformedOrders })
  } catch (error) {
    console.error("❌ Error fetching employee pending inventory:", error)
    return NextResponse.json({ error: `Failed to fetch pending orders: ${error.message}` }, { status: 500 })
  }
}
