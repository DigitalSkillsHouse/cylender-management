import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import PurchaseOrder from "@/models/PurchaseOrder"
import EmployeePurchaseOrder from "@/models/EmployeePurchaseOrder"
import Product from "@/models/Product"
import StockManager from "@/lib/stock-manager"
import { verifyToken } from "@/lib/auth"

// GET - Fetch single inventory item
export async function GET(request, { params }) {
  try {
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()
    
    // Try to find in both admin and employee purchase orders
    let purchaseOrder = await PurchaseOrder.findById(params.id)
      .populate('product', 'name category')
      .populate('supplier', 'companyName')
    
    let isEmployeePurchase = false
    
    if (!purchaseOrder) {
      // Try employee purchase orders
      purchaseOrder = await EmployeePurchaseOrder.findById(params.id)
        .populate('product', 'name category')
        .populate('supplier', 'companyName')
        .populate('employee', 'name email')
      isEmployeePurchase = true
    }
    
    if (!purchaseOrder) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 })
    }
    
    // Transform to inventory item format
    const inventoryItem = {
      id: purchaseOrder._id?.toString() || '',
      poNumber: purchaseOrder.poNumber || 'N/A',
      productName: purchaseOrder.product?.name || purchaseOrder.productName || "Unknown Product",
      supplierName: purchaseOrder.supplier?.companyName || purchaseOrder.supplierName || "Unknown Supplier",
      purchaseDate: purchaseOrder.purchaseDate,
      quantity: purchaseOrder.quantity || 0,
      unitPrice: purchaseOrder.unitPrice || 0,
      totalAmount: purchaseOrder.totalAmount || 0,
      status: purchaseOrder.inventoryStatus || "pending",
      purchaseType: purchaseOrder.purchaseType || "gas",
      createdAt: purchaseOrder.createdAt,
      updatedAt: purchaseOrder.updatedAt
    }
    
    return NextResponse.json({ data: inventoryItem })
  } catch (error) {
    console.error("Error fetching inventory item:", error)
    return NextResponse.json({ error: "Failed to fetch inventory item" }, { status: 500 })
  }
}

// PATCH - Update inventory item status
export async function PATCH(request, { params }) {
  try {
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()
    console.log("PATCH inventory request received for ID:", params.id)

    const { status, quantity, unitPrice } = await request.json()
    console.log("Update data:", { status, quantity, unitPrice })

    // Build update object
    const updateData = {}
    
    if (status) {
      console.log("Updating inventory status to:", status)
      
      // Check if this is an employee purchase order first
      let isEmployeePurchaseCheck = false
      let employeePurchaseOrder = await EmployeePurchaseOrder.findById(params.id)
      if (employeePurchaseOrder) {
        isEmployeePurchaseCheck = true
      }
      
      if (status === "received" && isEmployeePurchaseCheck) {
        // For employee purchases: Mark as approved for employee to accept
        updateData.status = "approved"
        console.log("Employee purchase order - updating status to approved for employee acceptance")
      } else {
        // For admin purchases: Normal flow
        updateData.inventoryStatus = status
        if (status === "received") {
          updateData.status = "completed"
          console.log("Admin purchase order - updating both inventory status and purchase status")
        }
      }
    }
    
    if (quantity !== undefined) {
      updateData.quantity = quantity
      // Recalculate total amount if quantity or unit price changes
      if (unitPrice !== undefined) {
        updateData.unitPrice = unitPrice
        updateData.totalAmount = quantity * unitPrice
      } else {
        // Get current unit price to recalculate total - check both models
        let currentOrder = await PurchaseOrder.findById(params.id)
        if (!currentOrder) {
          currentOrder = await EmployeePurchaseOrder.findById(params.id)
        }
        if (currentOrder) {
          updateData.totalAmount = quantity * (currentOrder.unitPrice || 0)
        }
      }
    } else if (unitPrice !== undefined) {
      updateData.unitPrice = unitPrice
      // Get current quantity to recalculate total - check both models
      let currentOrder = await PurchaseOrder.findById(params.id)
      if (!currentOrder) {
        currentOrder = await EmployeePurchaseOrder.findById(params.id)
      }
      if (currentOrder) {
        updateData.totalAmount = (currentOrder.quantity || 0) * unitPrice
      }
    }

    console.log("Update data to apply:", updateData)

    // Try to find and update in both admin and employee purchase orders
    let updatedOrder
    let isEmployeePurchase = false
    
    try {
      // First try admin purchase orders
      updatedOrder = await PurchaseOrder.findByIdAndUpdate(
        params.id,
        updateData,
        { new: true, runValidators: true }
      ).populate('product', 'name category')
       .populate('supplier', 'companyName')
    } catch (populateError) {
      console.warn("Population failed for admin purchase order, trying without populate:", populateError.message)
      // Fallback: update without populate
      updatedOrder = await PurchaseOrder.findByIdAndUpdate(
        params.id,
        updateData,
        { new: true, runValidators: true }
      )
    }

    if (!updatedOrder) {
      // Try employee purchase orders
      try {
        updatedOrder = await EmployeePurchaseOrder.findByIdAndUpdate(
          params.id,
          updateData,
          { new: true, runValidators: true }
        ).populate('product', 'name category')
         .populate('supplier', 'companyName')
         .populate('employee', 'name email')
        isEmployeePurchase = true
      } catch (populateError) {
        console.warn("Population failed for employee purchase order, trying without populate:", populateError.message)
        // Fallback: update without populate
        updatedOrder = await EmployeePurchaseOrder.findByIdAndUpdate(
          params.id,
          updateData,
          { new: true, runValidators: true }
        )
        isEmployeePurchase = true
      }
    }

    if (!updatedOrder) {
      return NextResponse.json(
        { success: false, error: "Purchase order not found in both admin and employee collections" },
        { status: 404 }
      )
    }

    console.log("Successfully updated order:", updatedOrder._id)

    // Update item-level inventoryStatus for DSR tracking when marked as received
    if (status === "received" && !isEmployeePurchase) {
      try {
        await PurchaseOrder.updateOne(
          { _id: params.id },
          { $set: { 'items.$[].inventoryStatus': 'received' } }
        )
        console.log("Updated all items inventoryStatus to received for DSR tracking")
      } catch (itemUpdateError) {
        console.warn("Failed to update item-level inventoryStatus:", itemUpdateError.message)
      }

      // Create/update daily refill entries for DSR tracking
      try {
        const DailyRefill = (await import('@/models/DailyRefill')).default
        const { getLocalDateString } = await import('@/lib/date-utils')
        const today = getLocalDateString() // YYYY-MM-DD format (Dubai timezone)
        
        console.log("Processing daily refill entries for purchase order:", updatedOrder._id)
        console.log("Purchase order structure:", {
          hasItems: !!updatedOrder.items,
          isItemsArray: Array.isArray(updatedOrder.items),
          itemsLength: updatedOrder.items?.length,
          purchaseType: updatedOrder.purchaseType,
          emptyCylinderId: updatedOrder.emptyCylinderId,
          quantity: updatedOrder.quantity
        })
        
        if (updatedOrder.items && Array.isArray(updatedOrder.items)) {
          for (const item of updatedOrder.items) {
            let cylinderProductId = null
            let cylinderName = ''
            let quantity = Number(item.quantity) || 0
            
            // Only create DailyRefill records for gas purchases with empty cylinders (refilling empty cylinders)
            // Do NOT create refill records for direct full cylinder purchases - those are just inventory additions
            if (item.purchaseType === 'gas' && item.emptyCylinderId) {
              cylinderProductId = item.emptyCylinderId
              // Get cylinder name from product
              const cylinderProduct = await Product.findById(item.emptyCylinderId)
              cylinderName = cylinderProduct?.name || 'Unknown Cylinder'
              console.log(`Daily Refill: ${cylinderName} - ${quantity} cylinders refilled via gas purchase`)
              
              if (cylinderProductId && quantity > 0) {
                // Create or update daily refill entry
                await DailyRefill.findOneAndUpdate(
                  {
                    date: today,
                    cylinderProductId: cylinderProductId,
                    employeeId: null // Admin refills
                  },
                  {
                    $inc: { todayRefill: quantity },
                    $set: { cylinderName: cylinderName }
                  },
                  {
                    upsert: true,
                    new: true
                  }
                )
                console.log(`Updated daily refill: ${cylinderName} +${quantity} (total refills for ${today})`)
              }
            } else if (item.purchaseType === 'cylinder' && item.cylinderStatus === 'full') {
              // Full cylinder purchase - do NOT count as refilled, just inventory addition
              console.log(`ℹ️ Full cylinder purchase (${item.product?.name || 'Unknown'}) - NOT counted as refilled, just inventory addition`)
            }
          }
        } else {
          // Handle single-item purchase orders (admin purchases might use this structure)
          console.log("Processing single-item purchase order")
          let cylinderProductId = null
          let cylinderName = ''
          let quantity = Number(updatedOrder.quantity) || 0
          
          // Only create DailyRefill records for gas purchases with empty cylinders (refilling empty cylinders)
          // Do NOT create refill records for direct full cylinder purchases - those are just inventory additions
          if (updatedOrder.purchaseType === 'gas' && updatedOrder.emptyCylinderId) {
            cylinderProductId = updatedOrder.emptyCylinderId
            // Get cylinder name from product
            const cylinderProduct = await Product.findById(updatedOrder.emptyCylinderId)
            cylinderName = cylinderProduct?.name || 'Unknown Cylinder'
            console.log(`Daily Refill: ${cylinderName} - ${quantity} cylinders refilled via gas purchase`)
            
            if (cylinderProductId && quantity > 0) {
              // Create or update daily refill entry
              await DailyRefill.findOneAndUpdate(
                {
                  date: today,
                  cylinderProductId: cylinderProductId,
                  employeeId: null // Admin refills
                },
                {
                  $inc: { todayRefill: quantity },
                  $set: { cylinderName: cylinderName }
                },
                {
                  upsert: true,
                  new: true
                }
              )
              console.log(`Updated daily refill (single): ${cylinderName} +${quantity} (total refills for ${today})`)
            }
          } else if (updatedOrder.purchaseType === 'cylinder' && updatedOrder.cylinderStatus === 'full') {
            // Full cylinder purchase - do NOT count as refilled, just inventory addition
            console.log(`ℹ️ Full cylinder purchase (${updatedOrder.product?.name || 'Unknown'}) - NOT counted as refilled, just inventory addition`)
          }
        }
      } catch (refillError) {
        console.warn("Failed to update daily refill entries:", refillError.message)
      }
    }

    // Ensure product is populated for stock update (fallback if populate failed)
    if (updatedOrder.product && !updatedOrder.product.name && typeof updatedOrder.product === 'string') {
      try {
        const populatedProduct = await Product.findById(updatedOrder.product)
        if (populatedProduct) {
          updatedOrder.product = populatedProduct
        }
      } catch (populateError) {
        console.warn("Manual product population failed:", populateError.message)
      }
    }

    // Transform back to inventory item format with safe property access
    const inventoryItem = {
      id: updatedOrder._id?.toString() || '',
      poNumber: updatedOrder.poNumber || 'N/A',
      productName: updatedOrder.product?.name || updatedOrder.productName || "Unknown Product",
      supplierName: updatedOrder.supplier?.companyName || updatedOrder.supplierName || "Unknown Supplier",
      purchaseDate: updatedOrder.purchaseDate,
      quantity: updatedOrder.quantity || 0,
      unitPrice: updatedOrder.unitPrice || 0,
      totalAmount: updatedOrder.totalAmount || 0,
      status: updatedOrder.inventoryStatus || "pending",
      purchaseType: updatedOrder.purchaseType || "gas",
      createdAt: updatedOrder.createdAt,
      updatedAt: updatedOrder.updatedAt
    }

    // Handle stock synchronization when inventory is received
    if (status === "received") {
      try {
        console.log("Processing received inventory for:", updatedOrder.product?._id || updatedOrder.productName)
        
        if (isEmployeePurchaseCheck && (updatedOrder.employee || employeePurchaseOrder)) {
          // For employee purchases: Just mark as approved, employee will accept in new system
          console.log("Employee purchase order approved - employee will accept in new inventory system")
          
          // Create notification for employee
          try {
            const employeeId = updatedOrder.employee?._id || updatedOrder.employee || employeePurchaseOrder.employee
            const Notification = require("@/models/Notification").default
            const notification = new Notification({
              userId: employeeId,
              type: "purchase_approved",
              title: "Purchase Order Approved",
              message: `Your purchase order ${updatedOrder.poNumber || 'N/A'} has been approved. Please accept it in your inventory.`,
              isRead: false,
              createdBy: user.id
            })
            await notification.save()
            console.log("Created notification for employee purchase approval")
          } catch (notificationError) {
            console.warn("Failed to create notification:", notificationError.message)
          }

          // Create/update daily refill entries for employee refills
          try {
            const DailyRefill = (await import('@/models/DailyRefill')).default
            const { getLocalDateString } = await import('@/lib/date-utils')
        const today = getLocalDateString() // YYYY-MM-DD format (Dubai timezone)
            const employeeId = updatedOrder.employee?._id || updatedOrder.employee || employeePurchaseOrder?.employee
            
            console.log("Processing employee daily refill entries for purchase order:", updatedOrder._id)
            console.log("Employee ID extraction debug:", {
              'updatedOrder.employee': updatedOrder.employee,
              'updatedOrder.employee?._id': updatedOrder.employee?._id,
              'employeePurchaseOrder?.employee': employeePurchaseOrder?.employee,
              'final employeeId': employeeId,
              'isEmployeePurchase': isEmployeePurchase
            })
            
            // For employee purchase orders, check if it's a gas purchase with empty cylinder
            if (updatedOrder.purchaseType === 'gas' && updatedOrder.emptyCylinderId) {
              const quantity = Number(updatedOrder.quantity) || 0
              // Get cylinder name from product
              const cylinderProduct = await Product.findById(updatedOrder.emptyCylinderId)
              const cylinderName = cylinderProduct?.name || 'Unknown Cylinder'
              
              if (quantity > 0 && employeeId) {
                console.log(`Creating daily refill record: ${cylinderName} +${quantity} for employee ${employeeId} (${today})`)
                
                // Create or update employee daily refill entry
                const refillResult = await DailyRefill.findOneAndUpdate(
                  {
                    date: today,
                    cylinderProductId: updatedOrder.emptyCylinderId,
                    employeeId: employeeId
                  },
                  {
                    $inc: { todayRefill: quantity },
                    $set: { cylinderName: cylinderName }
                  },
                  {
                    upsert: true,
                    new: true
                  }
                )
                console.log(`✅ Updated employee daily refill:`, {
                  cylinderName,
                  quantity,
                  employeeId,
                  date: today,
                  refillId: refillResult._id
                })
              } else if (!employeeId) {
                console.error('❌ Cannot create daily refill record: employeeId is null/undefined')
              } else {
                console.warn('⚠️ Skipping daily refill: quantity is 0')
              }
            }
          } catch (refillError) {
            console.warn("Failed to update employee daily refill entries:", refillError.message)
          }
        } else {
          // For admin purchases: Update main product stock as before
          console.log("Updating main product stock for admin purchase")
          
          let product = null
          let productName = null
          
          // First try to get product from the populated reference
          if (updatedOrder.product && updatedOrder.product._id) {
            product = await Product.findById(updatedOrder.product._id)
            productName = product?.name
          }
          
          // Get product name from populated data or fallback
          if (updatedOrder.product && updatedOrder.product.name) {
            productName = updatedOrder.product.name
          } else if (updatedOrder.productName) {
            productName = updatedOrder.productName
          }
          
          // If not found, try to find by name and product code
          if (!product && productName) {
            // Try to find by name and product code if available
            if (updatedOrder.product && updatedOrder.product.productCode) {
              product = await Product.findOne({ 
                name: productName, 
                productCode: updatedOrder.product.productCode 
              })
              console.log("Found product by name and code:", productName, updatedOrder.product.productCode)
            } else {
              // Fallback to just name
              product = await Product.findOne({ name: productName })
              console.log("Found product by name only:", productName)
            }
          }
          
          if (product) {
            const oldStock = product.currentStock || 0
            const newStock = oldStock + (updatedOrder.quantity || 0)
            await Product.findByIdAndUpdate(product._id, { currentStock: newStock })
            console.log(`Updated ${product.name} (Code: ${product.productCode || 'N/A'}) stock from ${oldStock} to ${newStock}`)
          } else {
            console.warn("Product not found for stock update. Product Name:", productName, "Product ID:", updatedOrder.product?._id)
          }
        }
      } catch (stockError) {
        console.error("Stock processing error:", stockError)
        // Don't fail the entire operation if stock processing fails
      }
    }

    return NextResponse.json({
      success: true,
      data: inventoryItem,
      message: "Inventory item updated successfully"
    })

  } catch (error) {
    console.error("Inventory update error:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to update inventory item", 
        details: error.message 
      },
      { status: 500 }
    )
  }
}

// DELETE - Delete inventory item
export async function DELETE(request, { params }) {
  try {
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()
    
    // Try to delete from both admin and employee purchase orders
    let purchaseOrder = await PurchaseOrder.findByIdAndDelete(params.id)
    
    if (!purchaseOrder) {
      // Try employee purchase orders
      purchaseOrder = await EmployeePurchaseOrder.findByIdAndDelete(params.id)
    }
    
    if (!purchaseOrder) {
      return NextResponse.json({ error: "Purchase order not found in both admin and employee collections" }, { status: 404 })
    }
    
    // Use centralized StockManager to synchronize product stock after deletion
    if (purchaseOrder.product) {
      await StockManager.syncProductStock(purchaseOrder.product)
    }
    
    return NextResponse.json({ 
      success: true, 
      message: "Inventory item deleted successfully" 
    })
  } catch (error) {
    console.error("Error deleting inventory item:", error)
    return NextResponse.json({ error: "Failed to delete inventory item" }, { status: 500 })
  }
}
