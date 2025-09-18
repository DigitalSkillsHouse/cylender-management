import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeePurchaseOrder from "@/models/EmployeePurchaseOrder"
import { verifyToken } from "@/lib/auth"

// GET - Fetch single employee purchase order
export async function GET(request, { params }) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()
    
    const purchaseOrder = await EmployeePurchaseOrder.findById(params.id)
      .populate('supplier', 'companyName')
      .populate('product', 'name')
      .populate('employee', 'name email')

    if (!purchaseOrder) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 })
    }

    // Employees can only access their own purchase orders
    if (user.role === 'employee' && purchaseOrder.employee._id.toString() !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    return NextResponse.json({ data: purchaseOrder })
  } catch (error) {
    console.error("Error fetching employee purchase order:", error)
    return NextResponse.json({ error: "Failed to fetch employee purchase order" }, { status: 500 })
  }
}

// PUT - Update employee purchase order
export async function PUT(request, { params }) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()
    
    const existingOrder = await EmployeePurchaseOrder.findById(params.id)
    if (!existingOrder) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 })
    }

    // Employees can only update their own purchase orders
    if (user.role === 'employee' && existingOrder.employee.toString() !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

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
      status
    } = body

    // Handle cylinder size validation
    let effectiveCylinderSize = cylinderSize
    if (purchaseType === 'cylinder' && !effectiveCylinderSize) {
      const prod = await Product.findById(product)
      if (prod && prod.cylinderSize) {
        effectiveCylinderSize = prod.cylinderSize === 'large' ? '45kg' : '5kg'
      }
    }

    // Normalize legacy values
    if (purchaseType === 'cylinder' && effectiveCylinderSize) {
      if (effectiveCylinderSize === 'large') effectiveCylinderSize = '45kg'
      if (effectiveCylinderSize === 'small') effectiveCylinderSize = '5kg'
    }

    const qtyNum = Number(quantity)
    const unitPriceNum = (unitPrice !== undefined && unitPrice !== null && unitPrice !== "") ? Number(unitPrice) : 0
    const computedTotal = (totalAmount !== undefined && totalAmount !== null && totalAmount !== "")
      ? Number(totalAmount)
      : (qtyNum * unitPriceNum)

    const updateData = {
      supplier,
      product,
      purchaseDate,
      purchaseType,
      ...(purchaseType === 'cylinder' ? { cylinderSize: effectiveCylinderSize } : {}),
      quantity: qtyNum,
      unitPrice: unitPriceNum,
      totalAmount: computedTotal,
      notes: notes || "",
      status
    }

    const updatedOrder = await EmployeePurchaseOrder.findByIdAndUpdate(
      params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('supplier', 'companyName')
      .populate('product', 'name')
      .populate('employee', 'name email')

    return NextResponse.json({ data: updatedOrder })
  } catch (error) {
    console.error("Error updating employee purchase order:", error)
    return NextResponse.json({ error: "Failed to update employee purchase order" }, { status: 500 })
  }
}

// DELETE - Delete employee purchase order
export async function DELETE(request, { params }) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()
    
    const existingOrder = await EmployeePurchaseOrder.findById(params.id)
    if (!existingOrder) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 })
    }

    // Employees can only delete their own purchase orders
    if (user.role === 'employee' && existingOrder.employee.toString() !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    await EmployeePurchaseOrder.findByIdAndDelete(params.id)
    
    return NextResponse.json({ message: "Employee purchase order deleted successfully" })
  } catch (error) {
    console.error("Error deleting employee purchase order:", error)
    return NextResponse.json({ error: "Failed to delete employee purchase order" }, { status: 500 })
  }
}
