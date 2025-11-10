import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeeSale from "@/models/EmployeeSale"
import Product from "@/models/Product"

import { verifyToken } from "@/lib/auth"

// PUT /api/employee-sales/[id]
// Aligns with POST schema: items[], totalAmount, paymentMethod, paymentStatus, receivedAmount, notes, customer
export async function PUT(request, { params }) {
  try {
    await dbConnect()

    // Verify user authentication and check if admin
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    // Only allow admins to edit employee sales
    if (user.role !== 'admin') {
      return NextResponse.json({ error: "Access denied. Only admins can edit sales." }, { status: 403 })
    }

    const { id } = params
    const body = await request.json()

    const {
      customer,
      items,
      totalAmount,
      paymentMethod,
      paymentStatus,
      receivedAmount,
      notes,
      customerSignature,
    } = body

    const existing = await EmployeeSale.findById(id)
    if (!existing) {
      return NextResponse.json({ error: "Employee sale not found" }, { status: 404 })
    }

    const updateData = {}

    if (customer !== undefined) updateData.customer = customer
    if (items !== undefined) updateData.items = items
    if (totalAmount !== undefined) {
      const ta = Number(totalAmount)
      if (Number.isNaN(ta)) {
        return NextResponse.json({ error: "totalAmount must be a number" }, { status: 400 })
      }
      updateData.totalAmount = ta
    }
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod
    if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus
    if (receivedAmount !== undefined) {
      const ra = Number(receivedAmount)
      if (Number.isNaN(ra) || ra < 0) {
        return NextResponse.json({ error: "receivedAmount must be a non-negative number" }, { status: 400 })
      }
      updateData.receivedAmount = ra
    }
    if (notes !== undefined) updateData.notes = notes
    if (customerSignature !== undefined) updateData.customerSignature = customerSignature

    const updated = await EmployeeSale.findByIdAndUpdate(id, updateData, { new: true })
      .populate("customer", "name email phone")
      .populate("items.product", "name category")
      .populate("employee", "name email")

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error updating employee sale:", error)
    return NextResponse.json({ error: "Failed to update employee sale" }, { status: 500 })
  }
}

// DELETE /api/employee-sales/[id]
export async function DELETE(request, { params }) {
  try {
    await dbConnect()

    // Verify user authentication and check if admin
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    // Only allow admins to delete employee sales
    if (user.role !== 'admin') {
      return NextResponse.json({ error: "Access denied. Only admins can delete sales." }, { status: 403 })
    }

    const { id } = params

    // Load sale with populated items to get product ids
    const sale = await EmployeeSale.findById(id).populate('items.product')
    if (!sale) {
      return NextResponse.json({ error: "Employee sale not found" }, { status: 404 })
    }

    // Restore product stock
    try {
      for (const item of sale.items) {
        if (item.product && item.product._id) {
          const productId = item.product._id
          const current = await Product.findById(productId)
          if (current) {
            const newStock = current.currentStock + item.quantity
            await Product.findByIdAndUpdate(productId, { currentStock: newStock })
            console.log(`✅ Restored ${item.product.name} stock from ${current.currentStock} to ${newStock} (returned ${item.quantity} units)`) 
          }
        }
      }
    } catch (stockErr) {
      console.error('Failed to restore product stock for employee sale deletion:', stockErr)
      // Continue deletion even if stock restoration fails
    }

    await EmployeeSale.findByIdAndDelete(id)
    return NextResponse.json({ message: 'Employee sale deleted successfully' })
  } catch (error) {
    console.error('Error deleting employee sale:', error)
    return NextResponse.json({ error: 'Failed to delete employee sale' }, { status: 500 })
  }
}
