import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import PurchaseOrder from "@/models/PurchaseOrder"
import EmployeePurchaseOrder from "@/models/EmployeePurchaseOrder"
import Product from "@/models/Product"
import { verifyToken } from "@/lib/auth"

// ENHANCED PRODUCT MATCHING FUNCTION
async function findProductByEnhancedMatching(item) {
  let product = null
  let productName = null
  let productCode = null
  
  console.log("🔍 ENHANCED MATCHING: Starting product lookup for:", item.product)
  
  // Enhanced product lookup strategy - try multiple approaches
  if (item.product && item.product._id) {
    product = await Product.findById(item.product._id)
    productName = product?.name
    productCode = product?.productCode
    console.log(`🔍 Found product by ID: ${product?.name} (${product?.productCode})`)
  } else if (typeof item.product === 'string') {
    product = await Product.findById(item.product)
    productName = product?.name
    productCode = product?.productCode
    console.log(`🔍 Found product by string ID: ${product?.name} (${product?.productCode})`)
  }
  
  // Get product name and code from populated data if available
  if (item.product && item.product.name) {
    productName = item.product.name
  }
  if (item.product && item.product.productCode) {
    productCode = item.product.productCode
  }
  
  // If direct ID lookup failed, try enhanced matching strategies
  if (!product && (productName || productCode)) {
    console.log(`🔍 ENHANCED: Trying name/code matching for: Name="${productName}", Code="${productCode}"`)
    
    // Strategy 1: Match by both name and product code (most accurate)
    if (productName && productCode) {
      product = await Product.findOne({ 
        name: productName, 
        productCode: productCode 
      })
      if (product) {
        console.log(`🔍 ENHANCED: Found product by name + code: ${product.name} (${product.productCode})`)
        return product
      }
    }
    
    // Strategy 2: Match by product code only
    if (productCode) {
      product = await Product.findOne({ productCode: productCode })
      if (product) {
        console.log(`🔍 ENHANCED: Found product by code: ${product.name} (${product.productCode})`)
        return product
      }
    }
    
    // Strategy 3: Match by product name only (fallback)
    if (productName) {
      product = await Product.findOne({ name: productName })
      if (product) {
        console.log(`🔍 ENHANCED: Found product by name: ${product.name} (${product.productCode})`)
        return product
      }
    }
  }
  
  if (!product) {
    console.error(`❌ ENHANCED: Product not found with any matching strategy`)
    console.error(`❌ Searched for: Name="${productName}", Code="${productCode}"`)
  }
  
  return product
}

// PATCH - Update individual item inventory status with enhanced product matching
export async function PATCH(request, { params }) {
  console.log("🔥🔥🔥 API CALLED: /api/inventory/item/[orderId]/[itemIndex] - PATCH")
  console.log("🔥🔥🔥 PARAMS:", params)
  
  try {
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()
    
    const body = await request.json()
    const { status } = body
    
    console.log("🔥🔥🔥 REQUEST BODY:", body)
    
    console.log("🚫🚫🚫 CRITICAL DEBUG: Inventory item update request:", {
      orderId: params.orderId,
      itemIndex: params.itemIndex,
      body
    })
    
    // CRITICAL: Check what products currently exist before processing
    const allProductsBefore = await Product.find({}).select('name productCode category cylinderStatus currentStock availableEmpty availableFull')
    console.log("📊 PRODUCTS BEFORE PROCESSING:", allProductsBefore.map(p => `${p.productCode} ${p.name} (${p.category}${p.cylinderStatus ? '-' + p.cylinderStatus : ''})`))

    const itemIndex = parseInt(params.itemIndex)
    if (isNaN(itemIndex) || itemIndex < 0) {
      return NextResponse.json({ error: "Invalid item index" }, { status: 400 })
    }

    // Try to find and update in both admin and employee purchase orders
    let updatedOrder
    let isEmployeePurchase = false
    
    try {
      // First try admin purchase orders
      console.log("Searching for admin purchase order with ID:", params.orderId)
      updatedOrder = await PurchaseOrder.findById(params.orderId)
        .populate('items.product', 'name productCode category')
        .populate('supplier', 'companyName')
      
      if (updatedOrder) {
        console.log("Found admin purchase order:", updatedOrder._id)
      } else {
        console.log("Admin purchase order not found")
      }
    } catch (error) {
      console.warn("Failed to find admin purchase order:", error.message)
    }

    if (!updatedOrder) {
      // Try employee purchase orders
      try {
        console.log("Searching for employee purchase order with ID:", params.orderId)
        updatedOrder = await EmployeePurchaseOrder.findById(params.orderId)
          .populate('product', 'name productCode category')
          .populate('supplier', 'companyName')
          .populate('employee', 'name email')
        
        if (updatedOrder) {
          isEmployeePurchase = true
          console.log("Found employee purchase order:", updatedOrder._id, "Employee:", updatedOrder.employee?.name || updatedOrder.employee?.email)
          
          // Additional security: Ensure only admin can update employee purchase orders
          // or employees can only update their own orders
          if (user.role === 'employee' && updatedOrder.employee._id.toString() !== user.id) {
            return NextResponse.json(
              { success: false, error: "Access denied: You can only update your own purchase orders" },
              { status: 403 }
            )
          }
        } else {
          console.log("Employee purchase order not found")
        }
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

    // Handle different structures: admin orders have items array, employee orders have single item
    let updateQuery = {}
    let currentItem = null
    let originalInventoryStatus = null // Declare at proper scope
    let employeeStatus = status // Declare at proper scope
    
    if (isEmployeePurchase) {
      // Employee purchase orders use single-item structure (no items array)
      if (itemIndex !== 0) {
        return NextResponse.json(
          { success: false, error: "Employee purchase orders only have one item (index 0)" },
          { status: 400 }
        )
      }
      
      console.log("Before update - Employee order inventory status:", updatedOrder.inventoryStatus)
      
      // For employee orders: when admin "approves" them, they go to employee pending inventory
      // 1. Admin approves employee order: "pending" -> "approved" (goes to employee pending)
      // 2. Employee receives approved order: "approved" -> "received" (completes the process)
      originalInventoryStatus = updatedOrder.inventoryStatus // Store original status
      if (status === "received") {
        if (updatedOrder.inventoryStatus === "pending") {
          // Admin is approving employee order
          employeeStatus = "approved"
          console.log("Admin approving employee order: pending -> approved")
        } else if (updatedOrder.inventoryStatus === "approved") {
          // Employee is receiving approved order
          employeeStatus = "received"
          console.log("Employee receiving approved order: approved -> received")
        }
      }
      
      updateQuery.inventoryStatus = employeeStatus
      currentItem = updatedOrder // The order itself is the item for employee purchases
      
      console.log("Employee order status update:", {
        orderId: updatedOrder._id,
        fromStatus: updatedOrder.inventoryStatus,
        toStatus: employeeStatus,
        requestedStatus: status
      })
    } else {
      // Admin purchase orders use multi-item structure (items array)
      if (!updatedOrder.items || itemIndex >= updatedOrder.items.length) {
        return NextResponse.json(
          { success: false, error: "Item index out of range" },
          { status: 400 }
        )
      }
      
      console.log("Before update - Admin order item status:", updatedOrder.items[itemIndex].inventoryStatus)
      updateQuery[`items.${itemIndex}.inventoryStatus`] = status
      currentItem = updatedOrder.items[itemIndex]
    }
    
    console.log("Updating with query:", updateQuery)
    console.log("Target order ID:", params.orderId)
    console.log("Target item index:", itemIndex)
    console.log("Is employee purchase:", isEmployeePurchase)
    
    let updateResult
    try {
      if (isEmployeePurchase) {
        // For employee purchase orders, ensure inventoryStatus field exists
        await EmployeePurchaseOrder.updateOne(
          { 
            _id: params.orderId,
            inventoryStatus: { $exists: false }
          },
          { 
            $set: { inventoryStatus: 'pending' }
          }
        )
        
        // Update the employee purchase order's inventory status
        updateResult = await EmployeePurchaseOrder
          .findByIdAndUpdate(
            params.orderId,
            { $set: updateQuery },
            { new: true, runValidators: false }
          )
          .populate('product', 'name')
          .populate('supplier', 'companyName')
          .populate('employee', 'name email')
      } else {
        // For admin purchase orders, ensure items have inventoryStatus field
        await PurchaseOrder.updateOne(
          { 
            _id: params.orderId,
            [`items.${itemIndex}.inventoryStatus`]: { $exists: false }
          },
          { 
            $set: { [`items.${itemIndex}.inventoryStatus`]: 'pending' }
          }
        )
        
        // Update the specific item's inventory status in admin purchase order
        updateResult = await PurchaseOrder
          .findByIdAndUpdate(
            params.orderId,
            { $set: updateQuery },
            { new: true, runValidators: false }
          )
          .populate('items.product', 'name')
          .populate('supplier', 'companyName')
      }
      
      console.log("MongoDB update completed")
      console.log("Update result exists:", !!updateResult)
      
      if (updateResult) {
        if (isEmployeePurchase) {
          console.log("Employee order inventoryStatus after update:", updateResult.inventoryStatus)
        } else {
          console.log("Items array length:", updateResult.items?.length)
          console.log("Target item exists:", !!updateResult.items[itemIndex])
          if (updateResult.items[itemIndex]) {
            console.log("Item inventoryStatus after update:", updateResult.items[itemIndex].inventoryStatus)
          }
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
    
    // Log the updated status
    if (isEmployeePurchase) {
      console.log("After update - Employee order status:", updateResult.inventoryStatus)
    } else {
      console.log("After update - Item status:", updateResult.items[itemIndex].inventoryStatus)
    }
    
    // Update our local reference
    updatedOrder = updateResult

    console.log("Successfully updated item inventory status:", updatedOrder._id, "item", itemIndex, "to", status)

    // Check if all items are received and update overall purchase order status
    if (status === "received") {
      try {
        let allItemsReceived = false
        
        if (isEmployeePurchase) {
          // Employee orders: when admin "approves" them, they go to employee pending inventory
          allItemsReceived = (updatedOrder.inventoryStatus === "approved")
        } else {
          // Admin orders have multiple items, check if all are received
          allItemsReceived = updatedOrder.items.every(item => 
            (item.inventoryStatus || "pending") === "received"
          )
        }
        
        if (allItemsReceived) {
          if (isEmployeePurchase) {
            // For employee purchases: Don't mark as completed yet, wait for employee confirmation
            console.log("All employee purchase items approved by admin, but waiting for employee confirmation")
            // Purchase order stays in current status until employee accepts assignments
          } else {
            // For admin purchases: Mark as completed immediately
            console.log("All admin purchase items received, updating purchase order status to completed")
            await PurchaseOrder.findByIdAndUpdate(
              params.orderId,
              { $set: { status: "completed" } },
              { new: true }
            )
            console.log("Admin purchase order status updated to completed")
          }
        }
      } catch (statusUpdateError) {
        console.error("Failed to update purchase order status:", statusUpdateError)
        // Don't fail the entire operation if status update fails
      }
    }

    // Handle stock synchronization when inventory is received
    // For employee orders, this happens when admin "approves" them (status becomes "approved")
    if (status === "received") {
      try {
        // Get the item data based on order structure
        const item = isEmployeePurchase ? updatedOrder : updatedOrder.items[itemIndex]
        console.log("Processing received inventory for item:", item.product?._id || item.product)
        
        if (isEmployeePurchase && updatedOrder.employee) {
          const employeeId = updatedOrder.employee._id || updatedOrder.employee
          
          console.log("🔍 Employee purchase approval debug:", {
            isEmployeePurchase,
            hasEmployee: !!updatedOrder.employee,
            employeeId,
            originalInventoryStatus,
            currentInventoryStatus: updatedOrder.inventoryStatus,
            employeeStatus,
            conditionMet: originalInventoryStatus === "pending" && employeeStatus === "approved"
          })
          
          if (originalInventoryStatus === "pending" && employeeStatus === "approved") {
            // Admin is approving employee order - create stock assignment with "assigned" status
            console.log("Admin approving employee purchase - creating stock assignment with assigned status")
            
            const StockAssignment = require("@/models/StockAssignment").default
            
            // ENHANCED PRODUCT MATCHING
            let product = await findProductByEnhancedMatching(item)
            
            if (product && employeeId) {
              // Check if this is a gas purchase with empty cylinder conversion
              if (product.category === 'gas' && updatedOrder.emptyCylinderId) {
                console.log("🔄 Gas purchase with empty cylinder conversion detected")
                
                // 1. Create gas assignment
                const gasAssignment = new StockAssignment({
                  employee: employeeId,
                  product: product._id,
                  quantity: item.quantity || 0,
                  remainingQuantity: item.quantity || 0,
                  assignedBy: user.id,
                  status: "assigned",
                  notes: `Gas assigned from approved purchase order: ${updatedOrder.poNumber}`,
                  leastPrice: product.leastPrice || 0,
                  assignedDate: new Date(),
                  category: 'gas',
                  displayCategory: 'Gas'
                })
                
                await gasAssignment.save()
                console.log(`✅ Created gas assignment: ${item.quantity} units of ${product.name}`)
                
                // 2. Find the empty cylinder record and create full cylinder assignment
                try {
                  const StockAssignment = require("@/models/StockAssignment").default
                  const emptyCylinderRecord = await StockAssignment.findById(updatedOrder.emptyCylinderId).populate('product')
                  
                  if (emptyCylinderRecord && emptyCylinderRecord.product) {
                    // Create full cylinder assignment (gas + empty cylinder = full cylinder)
                    const fullCylinderAssignment = new StockAssignment({
                      employee: employeeId,
                      product: emptyCylinderRecord.product._id, // Same cylinder product but now full
                      quantity: item.quantity || 0,
                      remainingQuantity: item.quantity || 0,
                      assignedBy: user.id,
                      status: "assigned",
                      notes: `Full cylinder created from gas purchase: ${updatedOrder.poNumber}`,
                      leastPrice: emptyCylinderRecord.product.leastPrice || 0,
                      assignedDate: new Date(),
                      category: 'cylinder',
                      cylinderStatus: 'full',
                      displayCategory: 'Full Cylinder',
                      gasProductId: product._id // Link to gas used
                    })
                    
                    await fullCylinderAssignment.save()
                    console.log(`✅ Created full cylinder assignment: ${item.quantity} units of ${emptyCylinderRecord.product.name}`)
                    
                    // 3. Reduce empty cylinder stock
                    emptyCylinderRecord.remainingQuantity = Math.max(0, (emptyCylinderRecord.remainingQuantity || 0) - (item.quantity || 0))
                    await emptyCylinderRecord.save()
                    console.log(`✅ Reduced empty cylinder stock by ${item.quantity}`)
                  }
                } catch (cylinderError) {
                  console.error("Failed to process empty cylinder conversion:", cylinderError)
                }
              } else {
                // Regular stock assignment (no conversion)
                const stockAssignment = new StockAssignment({
                  employee: employeeId,
                  product: product._id,
                  quantity: item.quantity || 0,
                  remainingQuantity: item.quantity || 0,
                  assignedBy: user.id,
                  status: "assigned",
                  notes: `Assigned from approved purchase order: ${updatedOrder.poNumber}`,
                  leastPrice: product.leastPrice || 0,
                  assignedDate: new Date(),
                  category: product.category,
                  displayCategory: product.category === 'gas' ? 'Gas' : (product.category === 'cylinder' ? 'Empty Cylinder' : product.category)
                })
                
                await stockAssignment.save()
                console.log(`✅ Created stock assignment for employee ${employeeId}: ${item.quantity} units of ${product.name}`)
              }
            }
            
            // Also send notification
            try {
              const Notification = require("@/models/Notification").default
              
              let productName = product?.name || "Unknown Product"
              
              const notification = new Notification({
                userId: employeeId,
                type: "purchase_approved",
                title: "Purchase Order Approved",
                message: `Your purchase order for ${productName} (Qty: ${item.quantity}) has been approved and is ready for confirmation.`,
                isRead: false,
                createdBy: user.id
              })
              await notification.save()
              console.log("Created notification for employee about approved purchase")
            } catch (notificationError) {
              console.warn("Failed to create notification:", notificationError.message)
            }
            
          } else if (updatedOrder.inventoryStatus === "approved" && employeeStatus === "received") {
            // Employee is receiving approved order - NOW create stock assignment
            console.log("Employee receiving approved purchase - creating stock assignment")
            
            const StockAssignment = require("@/models/StockAssignment").default
            
            // ENHANCED PRODUCT MATCHING - Use multiple strategies
            let product = await findProductByEnhancedMatching(item)
            
            if (product && employeeId) {
              // Check for existing received stock assignment with same product
              const existingAssignment = await StockAssignment.findOne({
                employee: employeeId,
                product: product._id,
                status: "received"
              })
              
              if (existingAssignment) {
                // Update existing assignment - add quantities
                const newQuantity = existingAssignment.quantity + (item.quantity || 0)
                const newRemainingQuantity = existingAssignment.remainingQuantity + (item.quantity || 0)
                
                await StockAssignment.findByIdAndUpdate(existingAssignment._id, {
                  quantity: newQuantity,
                  remainingQuantity: newRemainingQuantity,
                  notes: `${existingAssignment.notes || ''}\nAdded from purchase order: ${updatedOrder.poNumber} (Qty: ${item.quantity})`,
                  receivedDate: new Date() // Update received date to latest
                })
                
                console.log(`✅ Updated existing stock assignment for employee ${employeeId}: ${product.name}`)
                console.log("Updated assignment details:", {
                  id: existingAssignment._id,
                  employee: employeeId,
                  product: product._id,
                  productName: product.name,
                  oldQuantity: existingAssignment.quantity,
                  newQuantity: newQuantity,
                  addedQuantity: item.quantity
                })
              } else {
                // Create new stock assignment for the employee
                const stockAssignment = new StockAssignment({
                  employee: employeeId,
                  product: product._id,
                  quantity: item.quantity || 0,
                  remainingQuantity: item.quantity || 0,
                  assignedBy: employeeId, // Set to employee ID since they're receiving it themselves
                  status: "assigned", // Mark as assigned for employee confirmation
                  notes: `Assigned from approved purchase order: ${updatedOrder.poNumber}`,
                  leastPrice: product.leastPrice || 0,
                  assignedDate: new Date()
                })
                
                await stockAssignment.save()
                console.log(`✅ Created new stock assignment for employee ${employeeId}: ${item.quantity} units of ${product.name}`)
                console.log("New assignment details:", {
                  id: stockAssignment._id,
                  employee: employeeId,
                  product: product._id,
                  productName: product.name,
                  quantity: item.quantity,
                  status: stockAssignment.status,
                  assignedBy: employeeId
                })
              }
              
              // Create notification for employee
              try {
                const Notification = require("@/models/Notification").default
                const notificationMessage = existingAssignment 
                  ? `${product.name} stock updated in your inventory. Added quantity: ${item.quantity}`
                  : `${product.name} has been added to your inventory. Quantity: ${item.quantity}`
                
                const notification = new Notification({
                  userId: employeeId,
                  type: "stock_assignment",
                  title: existingAssignment ? "Stock Updated" : "Stock Received",
                  message: notificationMessage,
                  isRead: false,
                  createdBy: employeeId
                })
                await notification.save()
                console.log("Created notification for employee stock assignment")
              } catch (notificationError) {
                console.warn("Failed to create notification:", notificationError.message)
              }
            } else {
              console.warn("Product or employee not found for stock assignment. Product ID:", item.product?._id, "Employee ID:", employeeId)
            }
          }
        } else {
          // For admin purchases: Handle different purchase types
          console.log("Processing admin purchase for stock update")
          if (item.purchaseType === 'gas' && item.emptyCylinderId) {
            // Gas purchase with empty cylinder - STRICT: Only update existing products
            console.log("CRITICAL: Gas purchase processing - NO NEW PRODUCTS WILL BE CREATED")
            
            // 1. Update the gas product stock (INCREASE) - ENHANCED PRODUCT MATCHING
            let gasProduct = await findProductByEnhancedMatching(item)
            
            if (gasProduct) {
              const oldGasStock = gasProduct.currentStock || 0
              const newGasStock = oldGasStock + (item.quantity || 0)
              await Product.findByIdAndUpdate(gasProduct._id, { currentStock: newGasStock })
              console.log(`✅ ENHANCED: Updated gas product ${gasProduct.name} (${gasProduct.productCode}) stock: ${oldGasStock} → ${newGasStock}`)
            } else {
              console.error(`❌ CRITICAL ERROR: Gas product not found! Cannot update gas stock.`)
              console.error(`❌ Product ID: ${item.product?._id || item.product}`)
              console.error(`❌ This should never happen - gas product must exist before purchase!`)
            }
            
            // 2. Update cylinder availability tracking - ONLY EXISTING PRODUCTS
            let emptyCylinder = null
            if (item.emptyCylinderId) {
              emptyCylinder = await Product.findById(item.emptyCylinderId)
              console.log(`🔍 Found empty cylinder: ${emptyCylinder?.name} (${emptyCylinder?.productCode})`)
            }
            
            if (emptyCylinder) {
              // CRITICAL: Only update availability, never create new products
              const oldEmptyAvailable = emptyCylinder.availableEmpty || 0
              const oldFullAvailable = emptyCylinder.availableFull || 0
              const quantity = item.quantity || 0
              
              const newEmptyAvailable = Math.max(0, oldEmptyAvailable - quantity)
              const newFullAvailable = oldFullAvailable + quantity
              
              await Product.findByIdAndUpdate(emptyCylinder._id, {
                availableEmpty: newEmptyAvailable,
                availableFull: newFullAvailable
              })
              
              console.log(`✅ UPDATED EXISTING cylinder ${emptyCylinder.name} (${emptyCylinder.productCode}) availability:`)
              console.log(`   Available Empty: ${oldEmptyAvailable} → ${newEmptyAvailable}`)
              console.log(`   Available Full: ${oldFullAvailable} → ${newFullAvailable}`)
              console.log(`✅ NO NEW PRODUCTS CREATED - Only updated existing product availability`)
            } else {
              console.error(`❌ CRITICAL ERROR: Empty cylinder not found! Cannot update cylinder availability.`)
              console.error(`❌ Empty Cylinder ID: ${item.emptyCylinderId}`)
            }
            
          } else {
            // Regular product purchase (cylinder or gas without empty cylinder) - ENHANCED MATCHING
            console.log("🔍 ENHANCED: Regular product purchase - STRICT PRODUCT MATCHING")
            
            let product = await findProductByEnhancedMatching(item)
            
            if (product) {
              const oldStock = product.currentStock || 0
              const newStock = oldStock + (item.quantity || 0)
              
              // For cylinder purchases, also update availability tracking
              if (product.category === 'cylinder') {
                if (product.cylinderStatus === 'empty') {
                  const oldEmptyAvailable = product.availableEmpty || 0
                  const newEmptyAvailable = oldEmptyAvailable + (item.quantity || 0)
                  await Product.findByIdAndUpdate(product._id, { 
                    currentStock: newStock,
                    availableEmpty: newEmptyAvailable
                  })
                  console.log(`✅ ENHANCED: Updated empty cylinder ${product.name} (${product.productCode})`)
                  console.log(`   Stock: ${oldStock} → ${newStock}, Available Empty: ${oldEmptyAvailable} → ${newEmptyAvailable}`)
                } else if (product.cylinderStatus === 'full') {
                  const oldFullAvailable = product.availableFull || 0
                  const newFullAvailable = oldFullAvailable + (item.quantity || 0)
                  await Product.findByIdAndUpdate(product._id, { 
                    currentStock: newStock,
                    availableFull: newFullAvailable
                  })
                  console.log(`✅ ENHANCED: Updated full cylinder ${product.name} (${product.productCode})`)
                  console.log(`   Stock: ${oldStock} → ${newStock}, Available Full: ${oldFullAvailable} → ${newFullAvailable}`)
                }
              } else {
                // For gas products, just update stock
                await Product.findByIdAndUpdate(product._id, { currentStock: newStock })
                console.log(`✅ ENHANCED: Updated gas product ${product.name} (${product.productCode}) stock: ${oldStock} → ${newStock}`)
              }
            } else {
              console.error(`❌ CRITICAL ERROR: Product not found for stock update!`)
              console.error(`❌ Product ID: ${item.product?._id || item.product}`)
              console.error(`❌ Product Name: ${productName}`)
              console.error(`❌ NO NEW PRODUCT WILL BE CREATED - This is intentional to prevent duplicates`)
            }
          }
        }
      } catch (stockError) {
        console.error("Stock processing error:", stockError)
        // Don't fail the entire operation if stock processing fails
      }
    }

    // Return the updated item information
    const updatedItem = isEmployeePurchase ? updatedOrder : updatedOrder.items[itemIndex]
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
      totalAmount: isEmployeePurchase ? updatedItem.totalAmount : (updatedItem.itemTotal || 0),
      status: isEmployeePurchase ? updatedItem.inventoryStatus : (updatedItem.inventoryStatus || "pending"),
      purchaseType: updatedItem.purchaseType || "gas",
      isEmployeePurchase: isEmployeePurchase,
      employeeName: isEmployeePurchase ? (updatedOrder.employee?.name || updatedOrder.employee?.email || '') : ''
    }

    // CRITICAL: Check what products exist after processing
    const allProductsAfter = await Product.find({}).select('name productCode category cylinderStatus currentStock availableEmpty availableFull')
    console.log("📊 PRODUCTS AFTER PROCESSING:", allProductsAfter.map(p => `${p.productCode} ${p.name} (${p.category}${p.cylinderStatus ? '-' + p.cylinderStatus : ''})`))
    
    // Check if any new products were created
    const newProducts = allProductsAfter.filter(after => 
      !allProductsBefore.some(before => before._id.toString() === after._id.toString())
    )
    
    if (newProducts.length > 0) {
      console.error("🚫🚫🚫 CRITICAL ERROR: NEW PRODUCTS WERE CREATED DURING INVENTORY PROCESSING!")
      console.error("New products:", newProducts.map(p => `${p.productCode} ${p.name} (${p.category}${p.cylinderStatus ? '-' + p.cylinderStatus : ''})`))
      console.error("THIS SHOULD NEVER HAPPEN!")
    } else {
      console.log("✅✅✅ ENHANCED CONFIRMED: No new products were created during inventory processing")
    }

    // Create/update daily refill entries for DSR tracking when marked as received
    if (status === "received" && !isEmployeePurchase) {
      try {
        const DailyRefill = (await import('@/models/DailyRefill')).default
        const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
        
        console.log("🔄 Processing daily refill entries for item:", updatedItem.product?._id)
        
        const item = updatedItem
        let cylinderProductId = null
        let cylinderName = ''
        let quantity = Number(item.quantity) || 0
        
        // Method 1: Direct cylinder purchase (purchaseType = 'cylinder', cylinderStatus = 'full')
        if (item.purchaseType === 'cylinder' && item.cylinderStatus === 'full') {
          cylinderProductId = item.product
          cylinderName = item.product?.name || 'Unknown Cylinder'
          console.log(`🔄 Daily Refill (Method 1): ${cylinderName} - ${quantity} cylinders`)
        }
        // Method 2: Gas purchase with empty cylinder (purchaseType = 'gas', emptyCylinderId provided)
        else if (item.purchaseType === 'gas' && item.emptyCylinderId) {
          cylinderProductId = item.emptyCylinderId
          // Get cylinder name from product
          const cylinderProduct = await Product.findById(item.emptyCylinderId)
          cylinderName = cylinderProduct?.name || 'Unknown Cylinder'
          console.log(`🔄 Daily Refill (Method 2): ${cylinderName} - ${quantity} cylinders via gas purchase`)
        }
        
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
          console.log(`✅ Updated daily refill: ${cylinderName} +${quantity} (total refills for ${today})`)
        }
      } catch (refillError) {
        console.warn("Failed to update daily refill entries:", refillError.message)
      }
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
