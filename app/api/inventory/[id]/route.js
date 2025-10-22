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
        // For employee purchases: Don't update inventoryStatus to "received"
        // Instead, mark the purchase order as completed but keep inventory status as "pending"
        // This prevents it from showing in "Received Inventory Items"
        updateData.status = "completed"
        console.log("Employee purchase order - updating status to completed but keeping inventory as pending")
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
          // For employee purchases: Create stock assignment instead of updating main stock
          const employeeId = updatedOrder.employee?._id || updatedOrder.employee || employeePurchaseOrder.employee
          console.log("Creating stock assignment for employee:", employeeId)
          
          const StockAssignment = require("@/models/StockAssignment").default
          
          let product = null
          
          // Get product information
          if (updatedOrder.product && updatedOrder.product._id) {
            product = await Product.findById(updatedOrder.product._id)
          } else if (updatedOrder.productName) {
            product = await Product.findOne({ name: updatedOrder.productName })
          }
          
          if (product && employeeId) {
            // Handle empty cylinder conversion for gas purchases
            if (updatedOrder.purchaseType === 'gas' && updatedOrder.emptyCylinderId) {
              console.log("Processing gas purchase with empty cylinder conversion")
              
              // 1. Reduce empty cylinder stock from employee inventory
              try {
                const EmployeeInventory = require("@/models/EmployeeInventory").default
                const StockAssignment = require("@/models/StockAssignment").default
                
                // Find the empty cylinder assignment/inventory
                let emptyCylinderRecord = await StockAssignment.findById(updatedOrder.emptyCylinderId)
                if (emptyCylinderRecord) {
                  // Reduce empty cylinder quantity
                  const usedQuantity = updatedOrder.quantity || 0
                  emptyCylinderRecord.remainingQuantity = Math.max(0, (emptyCylinderRecord.remainingQuantity || 0) - usedQuantity)
                  await emptyCylinderRecord.save()
                  console.log(`Reduced empty cylinder stock by ${usedQuantity}`)
                  
                  // 2. Create full cylinder assignment (empty cylinder + gas = full cylinder ready for sale)
                  const fullCylinderAssignment = new StockAssignment({
                    employee: employeeId,
                    product: emptyCylinderRecord.product, // Same cylinder product but now full
                    quantity: usedQuantity,
                    remainingQuantity: usedQuantity,
                    assignedBy: user.id,
                    status: "assigned", // Mark as assigned for employee confirmation
                    notes: `Full cylinder (${product.name} gas) from purchase order: ${updatedOrder.poNumber}`,
                    leastPrice: Math.max(emptyCylinderRecord.leastPrice || 0, product.leastPrice || 0), // Use higher price
                    assignedDate: new Date(),
                    category: 'cylinder',
                    cylinderStatus: 'full',
                    displayCategory: 'Full Cylinder',
                    gasProductId: product._id // Link to gas used for reference
                  })
                  
                  await fullCylinderAssignment.save()
                  console.log(`✅ Created full cylinder assignment:`, {
                    id: fullCylinderAssignment._id,
                    employee: employeeId,
                    product: emptyCylinderRecord.product,
                    quantity: usedQuantity,
                    status: fullCylinderAssignment.status,
                    category: fullCylinderAssignment.category,
                    cylinderStatus: fullCylinderAssignment.cylinderStatus
                  })
                  
                  // 3. Also create gas assignment for Gas tab visibility (linked to cylinder)
                  const gasAssignment = new StockAssignment({
                    employee: employeeId,
                    product: product._id,
                    quantity: updatedOrder.quantity || 0,
                    remainingQuantity: updatedOrder.quantity || 0,
                    assignedBy: user.id,
                    status: "assigned", // Mark as assigned for employee confirmation
                    notes: `Gas (filled in ${emptyCylinderRecord.product?.name || 'cylinder'}) from purchase order: ${updatedOrder.poNumber}`,
                    leastPrice: product.leastPrice || 0,
                    assignedDate: new Date(),
                    category: 'gas',
                    displayCategory: 'Gas',
                    cylinderProductId: emptyCylinderRecord.product, // Link to cylinder containing this gas
                    cylinderStatus: 'full' // Indicate gas is in full cylinder
                  })
                  
                  await gasAssignment.save()
                  console.log(`✅ Created gas assignment for Gas tab:`, {
                    id: gasAssignment._id,
                    employee: employeeId,
                    product: product._id,
                    quantity: updatedOrder.quantity || 0,
                    status: gasAssignment.status,
                    category: gasAssignment.category,
                    cylinderProductId: gasAssignment.cylinderProductId
                  })
                  
                  console.log(`✅ Gas purchase with empty cylinder conversion completed:`, {
                    emptyCylinderUsed: usedQuantity,
                    fullCylinderCreated: usedQuantity,
                    gasCreated: usedQuantity,
                    gasProduct: product.name,
                    cylinderProduct: emptyCylinderRecord.product
                  })
                }
              } catch (conversionError) {
                console.error("Empty cylinder conversion error:", conversionError)
              }
            } else {
              // Regular stock assignment (no conversion needed)
              const stockAssignment = new StockAssignment({
                employee: employeeId,
                product: product._id,
                quantity: updatedOrder.quantity || 0,
                remainingQuantity: updatedOrder.quantity || 0,
                assignedBy: user.id,
                status: "assigned", // Mark as assigned for employee confirmation
                notes: `Auto-assigned from purchase order: ${updatedOrder.poNumber}`,
                leastPrice: product.leastPrice || 0,
                assignedDate: new Date(),
                category: product.category,
                displayCategory: product.category === 'gas' ? 'Gas' : 'Empty Cylinder'
              })
              
              await stockAssignment.save()
              console.log(`✅ Created regular stock assignment:`, {
                id: stockAssignment._id,
                employee: employeeId,
                product: product._id,
                productName: product.name,
                quantity: updatedOrder.quantity || 0,
                status: stockAssignment.status,
                category: stockAssignment.category
              })
            }
            
            // Create notification for employee
            try {
              const Notification = require("@/models/Notification").default
              const notification = new Notification({
                userId: employeeId,
                type: "stock_assignment",
                title: "New Stock Assignment",
                message: `${product.name} has been assigned to your inventory. Quantity: ${updatedOrder.quantity}`,
                isRead: false,
                createdBy: user.id
              })
              await notification.save()
              console.log("Created notification for employee stock assignment")
            } catch (notificationError) {
              console.warn("Failed to create notification:", notificationError.message)
            }
          } else {
            console.warn("Product or employee not found for stock assignment. Product ID:", updatedOrder.product?._id, "Product Name:", updatedOrder.productName, "Employee ID:", employeeId)
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
