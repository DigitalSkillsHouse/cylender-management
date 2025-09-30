import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import PurchaseOrder from "@/models/PurchaseOrder"
import EmployeePurchaseOrder from "@/models/EmployeePurchaseOrder"
import Product from "@/models/Product"
import { verifyToken } from "@/lib/auth"

// PATCH - Update individual item inventory status
export async function PATCH(request, { params }) {
  try {
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()
    console.log("PATCH inventory item request received for Order ID:", params.orderId, "Item Index:", params.itemIndex)

    const { status } = await request.json()
    console.log("Update data:", { status })

    if (!status) {
      return NextResponse.json({ error: "Status is required" }, { status: 400 })
    }

    const itemIndex = parseInt(params.itemIndex)
    if (isNaN(itemIndex) || itemIndex < 0) {
      return NextResponse.json({ error: "Invalid item index" }, { status: 400 })
    }

    // Try to find and update in both admin and employee purchase orders
    let updatedOrder
    let isEmployeePurchase = false
    
    try {
      // First try admin purchase orders
      updatedOrder = await PurchaseOrder.findById(params.orderId)
        .populate('items.product', 'name category')
        .populate('supplier', 'companyName')
    } catch (error) {
      console.warn("Failed to find admin purchase order:", error.message)
    }

    if (!updatedOrder) {
      // Try employee purchase orders
      try {
        updatedOrder = await EmployeePurchaseOrder.findById(params.orderId)
          .populate('items.product', 'name category')
          .populate('supplier', 'companyName')
          .populate('employee', 'name email')
        isEmployeePurchase = true
      } catch (error) {
        console.warn("Failed to find employee purchase order:", error.message)
      }
    }

    if (!updatedOrder) {
      return NextResponse.json(
        { success: false, error: "Purchase order not found" },
        { status: 404 }
      )
    }

    // Check if item index is valid
    if (!updatedOrder.items || itemIndex >= updatedOrder.items.length) {
      return NextResponse.json(
        { success: false, error: "Item index out of range" },
        { status: 400 }
      )
    }

    // Update the specific item's inventory status using MongoDB's positional operator
    console.log("Before update - Item status:", updatedOrder.items[itemIndex].inventoryStatus)
    
    // Use MongoDB's positional update to ensure the nested field is properly updated
    const updateQuery = {}
    updateQuery[`items.${itemIndex}.inventoryStatus`] = status
    
    console.log("Updating with query:", updateQuery)
    console.log("Target order ID:", params.orderId)
    console.log("Target item index:", itemIndex)
    console.log("Is employee purchase:", isEmployeePurchase)
    
    let updateResult
    try {
      // First, ensure all items have the inventoryStatus field (migration for existing data)
      await (isEmployeePurchase ? EmployeePurchaseOrder : PurchaseOrder)
        .updateOne(
          { 
            _id: params.orderId,
            [`items.${itemIndex}.inventoryStatus`]: { $exists: false }
          },
          { 
            $set: { [`items.${itemIndex}.inventoryStatus`]: 'pending' }
          }
        )
      
      // Now update the specific item's inventory status
      updateResult = await (isEmployeePurchase ? EmployeePurchaseOrder : PurchaseOrder)
        .findByIdAndUpdate(
          params.orderId,
          { $set: updateQuery },
          { new: true, runValidators: false } // Disable validators in case of schema issues
        )
        .populate('items.product', 'name')
        .populate('supplier', 'companyName')
      
      console.log("MongoDB update completed")
      console.log("Update result exists:", !!updateResult)
      
      if (updateResult) {
        console.log("Items array length:", updateResult.items?.length)
        console.log("Target item exists:", !!updateResult.items[itemIndex])
        if (updateResult.items[itemIndex]) {
          console.log("Item inventoryStatus after update:", updateResult.items[itemIndex].inventoryStatus)
        }
      }
      
      if (!updateResult) {
        return NextResponse.json(
          { success: false, error: "Failed to update purchase order" },
          { status: 404 }
        )
      }
    } catch (updateError) {
      console.error("MongoDB update error:", updateError)
      return NextResponse.json(
        { success: false, error: "Database update failed", details: updateError.message },
        { status: 500 }
      )
    }
    
    console.log("After update - Item status:", updateResult.items[itemIndex].inventoryStatus)
    
    // Update our local reference
    updatedOrder = updateResult

    console.log("Successfully updated item inventory status:", updatedOrder._id, "item", itemIndex, "to", status)

    // Check if all items are received and update overall purchase order status
    if (status === "received") {
      try {
        const allItemsReceived = updatedOrder.items.every(item => 
          (item.inventoryStatus || "pending") === "received"
        )
        
        if (allItemsReceived) {
          console.log("All items received, updating purchase order status to completed")
          await (isEmployeePurchase ? EmployeePurchaseOrder : PurchaseOrder)
            .findByIdAndUpdate(
              params.orderId,
              { $set: { status: "completed" } },
              { new: true }
            )
          console.log("Purchase order status updated to completed")
        }
      } catch (statusUpdateError) {
        console.error("Failed to update purchase order status:", statusUpdateError)
        // Don't fail the entire operation if status update fails
      }
    }

    // Handle stock synchronization when inventory is received
    if (status === "received") {
      try {
        const item = updatedOrder.items[itemIndex]
        console.log("Processing received inventory for item:", item.product?._id || item.product)
        
        if (isEmployeePurchase && updatedOrder.employee) {
          // For employee purchases: Create stock assignment instead of updating main stock
          const employeeId = updatedOrder.employee._id || updatedOrder.employee
          console.log("Creating stock assignment for employee:", employeeId)
          
          const StockAssignment = require("@/models/StockAssignment").default
          
          let product = null
          let productName = null
          
          // Get product information - try multiple approaches
          if (item.product && item.product._id) {
            product = await Product.findById(item.product._id)
            productName = product?.name
          } else if (typeof item.product === 'string') {
            product = await Product.findById(item.product)
            productName = product?.name
          }
          
          // If we have the product name from populated data, use it for lookup
          if (item.product && item.product.name) {
            productName = item.product.name
          }
          
          // If we still don't have a product, try to find by name
          if (!product && productName) {
            console.log("Trying to find product by name for employee assignment:", productName)
            product = await Product.findOne({ name: productName })
          }
          
          // If we still don't have a product, try to find by name from the order items
          if (!product) {
            // Get the product name from the populated order
            const populatedOrder = await EmployeePurchaseOrder
              .findById(params.orderId)
              .populate('items.product', 'name productCode')
            
            if (populatedOrder && populatedOrder.items[itemIndex] && populatedOrder.items[itemIndex].product) {
              const itemProduct = populatedOrder.items[itemIndex].product
              productName = itemProduct.name
              
              // Try to find by name and product code if available
              if (itemProduct.productCode) {
                product = await Product.findOne({ 
                  name: productName, 
                  productCode: itemProduct.productCode 
                })
                console.log("Found product by name and code for employee:", productName, itemProduct.productCode)
              } else {
                // Fallback to just name
                product = await Product.findOne({ name: productName })
                console.log("Found product by name only for employee:", productName)
              }
            }
          }
          
          if (product && employeeId) {
            // Create stock assignment for the employee
            const stockAssignment = new StockAssignment({
              employee: employeeId,
              product: product._id,
              quantity: item.quantity || 0,
              remainingQuantity: item.quantity || 0,
              assignedBy: user.id, // Admin who received the inventory
              status: "assigned",
              notes: `Auto-assigned from purchase order: ${updatedOrder.poNumber} (Item ${itemIndex + 1})`,
              leastPrice: product.leastPrice || 0,
              assignedDate: new Date()
            })
            
            await stockAssignment.save()
            console.log(`Created stock assignment for employee ${employeeId}: ${item.quantity} units of ${product.name}`)
            
            // Create notification for employee
            try {
              const Notification = require("@/models/Notification").default
              const notification = new Notification({
                userId: employeeId,
                type: "stock_assignment",
                title: "New Stock Assignment",
                message: `${product.name} has been assigned to your inventory. Quantity: ${item.quantity}`,
                isRead: false,
                createdBy: user.id
              })
              await notification.save()
              console.log("Created notification for employee stock assignment")
            } catch (notificationError) {
              console.warn("Failed to create notification:", notificationError.message)
            }
          } else {
            console.warn("Product or employee not found for stock assignment. Product ID:", item.product?._id, "Employee ID:", employeeId)
          }
        } else {
          // For admin purchases: Update main product stock
          console.log("Updating main product stock for admin purchase")
          
          let product = null
          let productName = null
          
          // Get product information - try multiple approaches
          if (item.product && item.product._id) {
            product = await Product.findById(item.product._id)
            productName = product?.name
          } else if (typeof item.product === 'string') {
            product = await Product.findById(item.product)
            productName = product?.name
          }
          
          // If we have the product name from populated data, use it for lookup
          if (item.product && item.product.name) {
            productName = item.product.name
          }
          
          // If we still don't have a product, try to find by name
          if (!product && productName) {
            console.log("Trying to find product by name:", productName)
            product = await Product.findOne({ name: productName })
          }
          
          // If we still don't have a product, try to find by name from the order items
          if (!product) {
            // Get the product name from the populated order
            const populatedOrder = await (isEmployeePurchase ? EmployeePurchaseOrder : PurchaseOrder)
              .findById(params.orderId)
              .populate('items.product', 'name productCode')
            
            if (populatedOrder && populatedOrder.items[itemIndex] && populatedOrder.items[itemIndex].product) {
              const itemProduct = populatedOrder.items[itemIndex].product
              productName = itemProduct.name
              
              // Try to find by name and product code if available
              if (itemProduct.productCode) {
                product = await Product.findOne({ 
                  name: productName, 
                  productCode: itemProduct.productCode 
                })
                console.log("Found product by name and code:", productName, itemProduct.productCode)
              } else {
                // Fallback to just name
                product = await Product.findOne({ name: productName })
                console.log("Found product by name only:", productName)
              }
            }
          }
          
          if (product) {
            const oldStock = product.currentStock || 0
            const newStock = oldStock + (item.quantity || 0)
            await Product.findByIdAndUpdate(product._id, { currentStock: newStock })
            console.log(`Updated ${product.name} (Code: ${product.productCode || 'N/A'}) stock from ${oldStock} to ${newStock}`)
          } else {
            console.warn("Product not found for stock update. Product Name:", productName, "Product ID:", item.product?._id)
          }
        }
      } catch (stockError) {
        console.error("Stock processing error:", stockError)
        // Don't fail the entire operation if stock processing fails
      }
    }

    // Return the updated item information
    const updatedItem = updatedOrder.items[itemIndex]
    const inventoryItem = {
      id: `${updatedOrder._id}-${itemIndex}`,
      orderId: updatedOrder._id,
      itemIndex: itemIndex,
      poNumber: updatedOrder.poNumber || 'N/A',
      productName: updatedItem.product?.name || "Unknown Product",
      supplierName: updatedOrder.supplier?.companyName || "Unknown Supplier",
      purchaseDate: updatedOrder.purchaseDate,
      quantity: updatedItem.quantity || 0,
      unitPrice: updatedItem.unitPrice || 0,
      totalAmount: updatedItem.itemTotal || 0,
      status: updatedItem.inventoryStatus || "pending",
      purchaseType: updatedItem.purchaseType || "gas",
      isEmployeePurchase: isEmployeePurchase,
      employeeName: isEmployeePurchase ? (updatedOrder.employee?.name || updatedOrder.employee?.email || '') : ''
    }

    return NextResponse.json({
      success: true,
      data: inventoryItem,
      message: "Inventory item updated successfully"
    })

  } catch (error) {
    console.error("Inventory item update error:", error)
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
