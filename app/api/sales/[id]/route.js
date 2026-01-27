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

    // Restore inventory - reverse all changes made during sale creation
    try {
      const InventoryItem = (await import('@/models/InventoryItem')).default
      
      for (const item of sale.items) {
        if (!item.product || !item.product._id) continue
        
        const product = item.product
        const category = item.category || product.category || 'gas'
        const quantity = Number(item.quantity) || 0
        
        console.log(`🔄 Reversing inventory for: ${product.name} (${category}), Qty: ${quantity}`)
        
        if (category === 'gas') {
          // Gas sale reversal:
          // 1. Restore gas stock in InventoryItem
          const gasInventory = await InventoryItem.findOne({ product: product._id })
          if (gasInventory) {
            await InventoryItem.findByIdAndUpdate(gasInventory._id, {
              $inc: { currentStock: quantity },
              lastUpdatedAt: new Date()
            })
            console.log(`✅ Restored gas inventory: ${product.name} +${quantity} units`)
          }
          
          // 2. Reverse cylinder conversion (Empty back to Full) if cylinderProductId exists
          const cylinderProductId = item.cylinderProductId
          if (cylinderProductId) {
            const cylinderInventory = await InventoryItem.findOne({ product: cylinderProductId })
            if (cylinderInventory) {
              // Reverse: Empty cylinders back to Full
              await InventoryItem.findByIdAndUpdate(cylinderInventory._id, {
                $inc: {
                  availableFull: quantity,
                  availableEmpty: -quantity
                },
                lastUpdatedAt: new Date()
              })
              const cylinderProduct = await Product.findById(cylinderProductId)
              console.log(`✅ Reversed cylinder conversion: ${cylinderProduct?.name || 'Cylinder'} - ${quantity} moved from Empty back to Full`)
            }
          }
          
          // 3. Restore Product model currentStock
          const currentProduct = await Product.findById(product._id)
          if (currentProduct) {
            await Product.findByIdAndUpdate(product._id, {
              currentStock: (currentProduct.currentStock || 0) + quantity
            })
            console.log(`✅ Restored Product.currentStock: ${product.name} +${quantity} units`)
          }
          
        } else if (category === 'cylinder') {
          // Cylinder sale reversal:
          const cylinderStatus = item.cylinderStatus || 'empty'
          const cylinderInventory = await InventoryItem.findOne({ product: product._id })
          
          if (cylinderInventory) {
            if (cylinderStatus === 'empty') {
              // Restore empty cylinders
              await InventoryItem.findByIdAndUpdate(cylinderInventory._id, {
                $inc: { availableEmpty: quantity },
                lastUpdatedAt: new Date()
              })
              console.log(`✅ Restored empty cylinders: ${product.name} +${quantity} units`)
            } else if (cylinderStatus === 'full') {
              // Restore full cylinders
              await InventoryItem.findByIdAndUpdate(cylinderInventory._id, {
                $inc: { availableFull: quantity },
                lastUpdatedAt: new Date()
              })
              console.log(`✅ Restored full cylinders: ${product.name} +${quantity} units`)
              
              // Also restore gas stock if gasProductId exists (full cylinder contains gas)
              const gasProductId = item.gasProductId
              if (gasProductId) {
                const gasInventory = await InventoryItem.findOne({ product: gasProductId })
                if (gasInventory) {
                  await InventoryItem.findByIdAndUpdate(gasInventory._id, {
                    $inc: { currentStock: quantity },
                    lastUpdatedAt: new Date()
                  })
                  const gasProduct = await Product.findById(gasProductId)
                  console.log(`✅ Restored gas from full cylinder: ${gasProduct?.name || 'Gas'} +${quantity} units`)
                  
                  // Also restore Product model
                  const gasProductModel = await Product.findById(gasProductId)
                  if (gasProductModel) {
                    await Product.findByIdAndUpdate(gasProductId, {
                      currentStock: (gasProductModel.currentStock || 0) + quantity
                    })
                  }
                }
              }
            }
          }
          
          // Restore Product model currentStock
          const currentProduct = await Product.findById(product._id)
          if (currentProduct) {
            await Product.findByIdAndUpdate(product._id, {
              currentStock: (currentProduct.currentStock || 0) + quantity
            })
            console.log(`✅ Restored Product.currentStock: ${product.name} +${quantity} units`)
          }
        } else {
          // Other products - simple stock restoration
          const currentProduct = await Product.findById(product._id)
          if (currentProduct) {
            await Product.findByIdAndUpdate(product._id, {
              currentStock: (currentProduct.currentStock || 0) + quantity
            })
            console.log(`✅ Restored Product.currentStock: ${product.name} +${quantity} units`)
          }
        }
      }
    } catch (stockError) {
      console.error('❌ Failed to restore inventory after sale deletion:', stockError)
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
