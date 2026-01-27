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

    // Restore employee inventory - reverse all changes made during sale creation
    try {
      const EmployeeInventoryItem = (await import('@/models/EmployeeInventoryItem')).default
      const employeeId = sale.employee
      
      for (const item of sale.items) {
        if (!item.product || !item.product._id) continue
        
        const product = item.product
        const category = (item as any).category || product.category || 'gas'
        const quantity = Number(item.quantity) || 0
        
        console.log(`🔄 [EMPLOYEE SALES DELETE] Reversing inventory for: ${product.name} (${category}), Qty: ${quantity}, Employee: ${employeeId}`)
        
        if (category === 'gas') {
          // Gas sale reversal:
          // 1. Restore gas stock in EmployeeInventoryItem
          const gasInventory = await EmployeeInventoryItem.findOne({
            employee: employeeId,
            product: product._id
          })
          if (gasInventory) {
            gasInventory.currentStock = (gasInventory.currentStock || 0) + quantity
            gasInventory.lastUpdatedAt = new Date()
            await gasInventory.save()
            console.log(`✅ [EMPLOYEE SALES DELETE] Restored gas inventory: ${product.name} +${quantity} units, new stock: ${gasInventory.currentStock}`)
          }
          
          // 2. Reverse cylinder conversion (Empty back to Full) if cylinderProductId exists
          const cylinderProductId = (item as any).cylinderProductId
          if (cylinderProductId) {
            const cylinderInventory = await EmployeeInventoryItem.findOne({
              employee: employeeId,
              product: cylinderProductId
            })
            if (cylinderInventory) {
              // Reverse: Empty cylinders back to Full
              cylinderInventory.availableFull = (cylinderInventory.availableFull || 0) + quantity
              cylinderInventory.availableEmpty = Math.max(0, (cylinderInventory.availableEmpty || 0) - quantity)
              cylinderInventory.lastUpdatedAt = new Date()
              await cylinderInventory.save()
              const cylinderProduct = await Product.findById(cylinderProductId)
              console.log(`✅ [EMPLOYEE SALES DELETE] Reversed cylinder conversion: ${cylinderProduct?.name || 'Cylinder'} - ${quantity} moved from Empty back to Full, Full: ${cylinderInventory.availableFull}, Empty: ${cylinderInventory.availableEmpty}`)
            }
          }
          
          // 3. Restore Product model currentStock
          const currentProduct = await Product.findById(product._id)
          if (currentProduct) {
            await Product.findByIdAndUpdate(product._id, {
              currentStock: (currentProduct.currentStock || 0) + quantity
            })
            console.log(`✅ [EMPLOYEE SALES DELETE] Restored Product.currentStock: ${product.name} +${quantity} units`)
          }
          
        } else if (category === 'cylinder') {
          // Cylinder sale reversal:
          const cylinderStatus = (item as any).cylinderStatus || 'empty'
          const cylinderInventory = await EmployeeInventoryItem.findOne({
            employee: employeeId,
            product: product._id
          })
          
          if (cylinderInventory) {
            if (cylinderStatus === 'empty') {
              // Restore empty cylinders
              cylinderInventory.availableEmpty = (cylinderInventory.availableEmpty || 0) + quantity
              cylinderInventory.lastUpdatedAt = new Date()
              await cylinderInventory.save()
              console.log(`✅ [EMPLOYEE SALES DELETE] Restored empty cylinders: ${product.name} +${quantity} units, new stock: ${cylinderInventory.availableEmpty}`)
            } else if (cylinderStatus === 'full') {
              // Restore full cylinders
              cylinderInventory.availableFull = (cylinderInventory.availableFull || 0) + quantity
              cylinderInventory.lastUpdatedAt = new Date()
              await cylinderInventory.save()
              console.log(`✅ [EMPLOYEE SALES DELETE] Restored full cylinders: ${product.name} +${quantity} units, new stock: ${cylinderInventory.availableFull}`)
              
              // Also restore gas stock if gasProductId exists (full cylinder contains gas)
              const gasProductId = (item as any).gasProductId
              if (gasProductId) {
                const gasInventory = await EmployeeInventoryItem.findOne({
                  employee: employeeId,
                  product: gasProductId
                })
                if (gasInventory) {
                  gasInventory.currentStock = (gasInventory.currentStock || 0) + quantity
                  gasInventory.lastUpdatedAt = new Date()
                  await gasInventory.save()
                  const gasProduct = await Product.findById(gasProductId)
                  console.log(`✅ [EMPLOYEE SALES DELETE] Restored gas from full cylinder: ${gasProduct?.name || 'Gas'} +${quantity} units, new stock: ${gasInventory.currentStock}`)
                  
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
            console.log(`✅ [EMPLOYEE SALES DELETE] Restored Product.currentStock: ${product.name} +${quantity} units`)
          }
        } else {
          // Other products - simple stock restoration
          const currentProduct = await Product.findById(product._id)
          if (currentProduct) {
            await Product.findByIdAndUpdate(product._id, {
              currentStock: (currentProduct.currentStock || 0) + quantity
            })
            console.log(`✅ [EMPLOYEE SALES DELETE] Restored Product.currentStock: ${product.name} +${quantity} units`)
          }
        }
      }
    } catch (stockErr) {
      console.error('❌ [EMPLOYEE SALES DELETE] Failed to restore inventory for employee sale deletion:', stockErr)
      // Continue deletion even if stock restoration fails
    }

    await EmployeeSale.findByIdAndDelete(id)
    return NextResponse.json({ message: 'Employee sale deleted successfully' })
  } catch (error) {
    console.error('Error deleting employee sale:', error)
    return NextResponse.json({ error: 'Failed to delete employee sale' }, { status: 500 })
  }
}
