import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import Sale from "@/models/Sale"
import Product from "@/models/Product"

// Align PUT with POST schema: items[], totalAmount, paymentMethod, paymentStatus, receivedAmount, notes, customer, invoiceNumber
export async function PUT(request, { params }) {
  try {
    await dbConnect()

    const { id } = params
    const body = await request.json()

    // Basic validation to avoid NaN casts
    const {
      invoiceNumber,
      customer,
      items,
      totalAmount,
      paymentMethod,
      paymentStatus,
      receivedAmount,
      notes,
    } = body

    // Ensure sale exists
    const existingSale = await Sale.findById(id)
    if (!existingSale) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 })
    }

    // Optional: allow partial updates; but make sure numbers are valid when provided
    const updateData = {}

    if (invoiceNumber !== undefined) updateData.invoiceNumber = invoiceNumber
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

    const sale = await Sale.findByIdAndUpdate(id, updateData, { new: true })
      .populate("customer", "name phone address email trNumber")
      .populate("items.product", "name price category")

    return NextResponse.json({ data: sale, message: "Sale updated successfully" })
  } catch (error) {
    console.error("Error updating sale:", error)
    return NextResponse.json({ error: "Failed to update sale" }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    await dbConnect()

    const { id } = params

    // Get the sale with populated product details
    const sale = await Sale.findById(id).populate('items.product')
    if (!sale) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 })
    }

    console.log('Deleting sale:', sale.invoiceNumber)

    // Restore stock quantities back to products
    try {
      for (const item of sale.items) {
        if (item.product && item.product._id) {
          const currentProduct = await Product.findById(item.product._id)
          if (currentProduct) {
            const newStock = currentProduct.currentStock + item.quantity
            await Product.findByIdAndUpdate(item.product._id, {
              currentStock: newStock
            })
            console.log(`✅ Restored ${item.product.name} stock from ${currentProduct.currentStock} to ${newStock} (returned ${item.quantity} units)`)
          }
        }
      }
    } catch (stockError) {
      console.error('❌ Failed to restore product stock after sale deletion:', stockError)
      // Continue with deletion even if stock restoration fails
    }

    // Delete the sale
    await Sale.findByIdAndDelete(id)

    return NextResponse.json({ message: "Sale deleted successfully" })
  } catch (error) {
    console.error("Error deleting sale:", error)
    return NextResponse.json({ error: "Failed to delete sale" }, { status: 500 })
  }
}

// GET /api/sales/[id] - fetch single sale with populated refs (for receipt)
export async function GET(request, { params }) {
  try {
    await dbConnect()
    const { id } = params
    const sale = await Sale.findById(id)
      .populate('customer', 'name phone address email trNumber')
      .populate('items.product', 'name price category cylinderSize')
    if (!sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    }
    return NextResponse.json({ data: sale })
  } catch (error) {
    console.error('Error fetching sale:', error)
    return NextResponse.json({ error: 'Failed to fetch sale' }, { status: 500 })
  }
}
