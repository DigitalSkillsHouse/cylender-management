import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeePurchaseOrder from "@/models/EmployeePurchaseOrder"
import Supplier from "@/models/Supplier"
import Product from "@/models/Product"
import { verifyToken } from "@/lib/auth"

// GET - Fetch employee purchase orders (filtered by employee ID)
export async function GET(request) {
  try {
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()
    
    // For employees, only show their own purchase orders
    // For admins, show all employee purchase orders
    const filter = user.role === 'employee' ? { employee: user.id } : {}
    
    const purchaseOrders = await EmployeePurchaseOrder.find(filter)
      .populate('supplier', 'companyName')
      .populate('product', 'name')
      .populate('employee', 'name email')
      .sort({ createdAt: -1 })
    
    return NextResponse.json({ data: purchaseOrders })
  } catch (error) {
    console.error("Error fetching employee purchase orders:", error)
    return NextResponse.json({ error: "Failed to fetch employee purchase orders", details: error.message }, { status: 500 })
  }
}

// POST - Create new employee purchase order
export async function POST(request) {
  try {
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()
    
    const body = await request.json()
    const {
      supplier,
      product,
      purchaseDate,
      purchaseType,
      cylinderSize,
      quantity,
      unitPrice,
      totalAmount,
      notes,
      status = "pending",
      invoiceNumber,
    } = body

    // Validate required fields
    if (!supplier || !product || !purchaseDate || !purchaseType || !quantity || !invoiceNumber) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Handle cylinder size validation
    let effectiveCylinderSize = cylinderSize
    if (purchaseType === 'cylinder' && !effectiveCylinderSize) {
      const prod = await Product.findById(product)
      if (prod && prod.cylinderSize) {
        effectiveCylinderSize = prod.cylinderSize === 'large' ? '45kg' : '5kg'
      } else {
        return NextResponse.json(
          { error: "cylinderSize is required for cylinder purchases" },
          { status: 400 }
        )
      }
    }

    // Normalize legacy values
    if (purchaseType === 'cylinder' && effectiveCylinderSize) {
      if (effectiveCylinderSize === 'large') effectiveCylinderSize = '45kg'
      if (effectiveCylinderSize === 'small') effectiveCylinderSize = '5kg'
    }

    // Generate employee-specific PO number
    const poNumber = `EMP-${String(invoiceNumber).trim()}`

    const qtyNum = Number(quantity)
    const unitPriceNum = (unitPrice !== undefined && unitPrice !== null && unitPrice !== "") ? Number(unitPrice) : 0
    const computedTotal = (totalAmount !== undefined && totalAmount !== null && totalAmount !== "")
      ? Number(totalAmount)
      : (qtyNum * unitPriceNum)

    const employeePurchaseOrder = new EmployeePurchaseOrder({
      supplier,
      product,
      employee: user.id, // Always use the logged-in employee's ID
      purchaseDate,
      purchaseType,
      ...(purchaseType === 'cylinder' ? { cylinderSize: effectiveCylinderSize } : {}),
      quantity: qtyNum,
      unitPrice: unitPriceNum,
      totalAmount: computedTotal,
      notes: notes || "",
      status,
      poNumber
    })

    await employeePurchaseOrder.save()
    
    // Populate the saved order before returning
    const populatedOrder = await EmployeePurchaseOrder.findById(employeePurchaseOrder._id)
      .populate('supplier', 'companyName')
      .populate('product', 'name')
      .populate('employee', 'name email')
    
    return NextResponse.json({ data: populatedOrder }, { status: 201 })
  } catch (error) {
    console.error("Error creating employee purchase order:", error)
    return NextResponse.json({ error: "Failed to create employee purchase order" }, { status: 500 })
  }
}
