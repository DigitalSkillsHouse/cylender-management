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
    
    // URL params to optionally force "my orders only"
    const url = new URL(request.url)
    const meParam = (url.searchParams.get('me') || '').toString().toLowerCase()
    const meOnly = meParam === '1' || meParam === 'true'

    // Normalize role to avoid case mismatches
    const role = String(user.role || '').trim().toLowerCase()
    
    // For employees, ALWAYS show only their own purchase orders
    // For admins, show all unless explicitly forced to "meOnly"
    let filter = {}
    if (role === 'employee') {
      filter = { employee: user.id }
      console.log(`\n📋 Fetching Employee Purchase Orders`)
      console.log(`   Employee: ${user.name} (${user.email})`)
      console.log(`   Filter: Own orders only`)
    } else if (meOnly) {
      filter = { employee: user.id }
      console.log(`\n📋 Fetching Admin's Own Purchase Orders`)
      console.log(`   Admin: ${user.name} (${user.email})`)
    } else {
      filter = {}
      console.log(`\n📋 Fetching All Employee Purchase Orders`)
      console.log(`   Admin: ${user.name} (${user.email})`)
      console.log(`   Filter: All employees`)
    }
    
    const purchaseOrders = await EmployeePurchaseOrder.find(filter)
      .populate('supplier', 'companyName')
      .populate('product', 'name productCode category')
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
    console.log('📥 [EMPLOYEE PURCHASE ORDER] Received request:', JSON.stringify(body, null, 2))
    const {
      supplier,
      product,
      employee, // Target employee ID (for admin assignments)
      purchaseDate,
      purchaseType,
      cylinderSize,
      cylinderStatus, // Extract cylinderStatus from request
      quantity,
      unitPrice,
      totalAmount,
      notes,
      status = "pending",
      inventoryStatus = "pending", // Extract inventoryStatus from request
      autoApproved = false, // Extract autoApproved flag
      invoiceNumber,
      emptyCylinderId,
    } = body

    // Validate required fields (supplier can be null for admin assignments)
    if (!product || !purchaseDate || !purchaseType || !quantity || !invoiceNumber) {
      console.log('❌ [EMPLOYEE PURCHASE ORDER] Missing required fields:', {
        product: !!product,
        purchaseDate: !!purchaseDate,
        purchaseType: !!purchaseType,
        quantity: !!quantity,
        invoiceNumber: !!invoiceNumber,
        supplier: !!supplier
      })
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

    // Resolve empty cylinder name if emptyCylinderId is provided
    let emptyCylinderName = null
    if (emptyCylinderId) {
      try {
        const StockAssignment = require("@/models/StockAssignment").default
        const Product = require("@/models/Product").default
        
        // Find the stock assignment to get the product ID
        const stockAssignment = await StockAssignment.findById(emptyCylinderId).populate('product')
        if (stockAssignment && stockAssignment.product) {
          emptyCylinderName = stockAssignment.product.name
        }
      } catch (cylinderError) {
        console.warn("Failed to resolve cylinder name:", cylinderError.message)
      }
    }

    // Determine target employee ID (for admin assignments vs employee self-orders)
    const targetEmployeeId = employee || user.id
    console.log('👤 [EMPLOYEE PURCHASE ORDER] Target employee ID:', targetEmployeeId)
    console.log('👤 [EMPLOYEE PURCHASE ORDER] Requesting user ID:', user.id)
    console.log('👤 [EMPLOYEE PURCHASE ORDER] Is admin assignment:', !!employee)
    console.log('📋 [EMPLOYEE PURCHASE ORDER] Status values:', { 
      status, 
      inventoryStatus, 
      autoApproved,
      finalInventoryStatus: status === "approved" ? "approved" : (inventoryStatus || "pending")
    })
    console.log('🔧 [EMPLOYEE PURCHASE ORDER] Cylinder details:', { cylinderStatus, cylinderSize: effectiveCylinderSize, purchaseType })
    
    const employeePurchaseOrder = new EmployeePurchaseOrder({
      supplier,
      product,
      employee: targetEmployeeId, // Use target employee ID (from request or logged-in user)
      purchaseDate,
      purchaseType,
      ...(purchaseType === 'cylinder' ? { cylinderSize: effectiveCylinderSize } : {}),
      ...(purchaseType === 'cylinder' && cylinderStatus ? { cylinderStatus } : {}), // Include cylinderStatus for cylinders
      quantity: qtyNum,
      unitPrice: unitPriceNum,
      totalAmount: computedTotal,
      notes: notes || "",
      status: status || "pending", // Use provided status or default to pending
      inventoryStatus: status === "approved" ? "approved" : (inventoryStatus || "pending"), // Auto-approved orders should have approved inventory status
      poNumber,
      ...(emptyCylinderId ? { emptyCylinderId } : {}),
      ...(emptyCylinderName ? { emptyCylinderName } : {}),
      ...(autoApproved ? { autoApproved: true } : {}) // Add autoApproved flag if provided
    })

    await employeePurchaseOrder.save()
    
    console.log('💾 [EMPLOYEE PURCHASE ORDER] Saved to database:', {
      id: employeePurchaseOrder._id,
      cylinderStatus: employeePurchaseOrder.cylinderStatus,
      cylinderSize: employeePurchaseOrder.cylinderSize,
      purchaseType: employeePurchaseOrder.purchaseType,
      status: employeePurchaseOrder.status,
      inventoryStatus: employeePurchaseOrder.inventoryStatus,
      autoApproved: employeePurchaseOrder.autoApproved
    })
    
    // Log special message for auto-approved orders
    if (autoApproved && status === 'approved') {
      console.log('🚀 [AUTO-APPROVED] Purchase order auto-approved and ready for employee pending inventory!')
    }
    
    console.log('\n🔵 ========== EMPLOYEE PURCHASE ORDER CREATED ==========')
    console.log(`📦 PO Number: ${poNumber}`)
    console.log(`👤 Target Employee ID: ${targetEmployeeId}`)
    console.log(`👤 Requesting User: ${user.name} (${user.email})`)
    console.log(`🎭 Requesting User Role: ${user.role}`)
    console.log(`📋 Purchase Type: ${purchaseType}`)
    console.log(`📊 Quantity: ${qtyNum}`)
    console.log(`💰 Total Amount: AED ${computedTotal}`)
    console.log(`✅ Status: ${status || "pending"}`)
    console.log(`✅ Inventory Status: pending`)
    console.log(`📍 Purchase order created - will appear in employee's pending inventory`)
    console.log('🔵 ====================================================\n')
    
    // Create daily refill record for gas purchases (track against cylinder product)
    if (purchaseType === 'gas' && emptyCylinderId) {
      try {
        const DailyRefill = require("@/models/DailyRefill").default
        const EmployeeInventory = require("@/models/EmployeeInventory").default
        
        // Get the cylinder product from the empty cylinder record
        const emptyCylinderRecord = await EmployeeInventory.findById(emptyCylinderId).populate('product')
        if (emptyCylinderRecord && emptyCylinderRecord.product) {
          const refillDate = new Date(purchaseDate).toISOString().split('T')[0] // YYYY-MM-DD format
          const cylinderProductId = emptyCylinderRecord.product._id
          const cylinderName = emptyCylinderRecord.product.name
          
          // Create or update daily refill record for the CYLINDER product
          await DailyRefill.findOneAndUpdate(
            {
              date: refillDate,
              cylinderProductId: cylinderProductId,
              employeeId: targetEmployeeId
            },
            {
              $inc: { todayRefill: qtyNum },
              $set: { cylinderName: cylinderName }
            },
            {
              upsert: true,
              new: true
            }
          )
          
          console.log(`⛽ [DAILY REFILL] Created refill record for CYLINDER:`, {
            date: refillDate,
            cylinderProduct: cylinderName,
            cylinderProductId: cylinderProductId,
            employeeId: targetEmployeeId,
            quantity: qtyNum,
            note: 'Gas purchase refilled this cylinder type'
          })
        }
      } catch (refillError) {
        console.error('❌ Failed to create daily refill record:', refillError.message)
      }
    }
    
    // If this is a gas purchase with empty cylinder, create stock assignments
    if (purchaseType === 'gas' && emptyCylinderId) {
      console.log('🔄 Processing Gas Purchase with Empty Cylinder Conversion...')
      console.log(`   Empty Cylinder ID: ${emptyCylinderId}`)
      console.log(`   Product ID: ${product}`)
      try {
        const StockAssignment = require("@/models/StockAssignment").default
        
        // Get the empty cylinder record from EmployeeInventory (not StockAssignment)
        console.log(`   🔍 Looking for empty cylinder record with ID: ${emptyCylinderId}`)
        const EmployeeInventory = require("@/models/EmployeeInventory").default
        const Product = require("@/models/Product").default
        const emptyCylinderRecord = await EmployeeInventory.findById(emptyCylinderId).populate('product')
        const gasProduct = await Product.findById(product)
        console.log(`   📦 Empty cylinder record found:`, emptyCylinderRecord ? 'YES' : 'NO')
        console.log(`   📦 Gas product found:`, gasProduct ? gasProduct.name : 'NO')
        
        if (emptyCylinderRecord) {
          console.log(`   ✅ Empty cylinder record details:`, {
            id: emptyCylinderRecord._id,
            product: emptyCylinderRecord.product,
            currentStock: emptyCylinderRecord.currentStock,
            availableEmpty: emptyCylinderRecord.availableEmpty,
            status: emptyCylinderRecord.status
          })
          // 1. Reduce empty cylinder quantity in EmployeeInventory
          const usedQuantity = qtyNum
          const previousQty = emptyCylinderRecord.currentStock || 0
          emptyCylinderRecord.currentStock = Math.max(0, previousQty - usedQuantity)
          emptyCylinderRecord.availableEmpty = Math.max(0, (emptyCylinderRecord.availableEmpty || 0) - usedQuantity)
          
          // Add transaction record
          emptyCylinderRecord.transactions.push({
            type: 'sale',
            quantity: -usedQuantity,
            date: new Date(),
            notes: `Used for gas purchase: ${poNumber}`
          })
          
          await emptyCylinderRecord.save()
          
          console.log(`\n📉 Step 1: Reduced Empty Cylinder Stock`)
          console.log(`   Previous: ${previousQty} units`)
          console.log(`   Used: ${usedQuantity} units`)
          console.log(`   Remaining: ${emptyCylinderRecord.currentStock} units`)
          
          // 2. Create full cylinder assignment (pending employee acceptance)
          const fullCylinderAssignment = new StockAssignment({
            employee: user.id,
            product: emptyCylinderRecord.product._id, // Same cylinder product but now full
            quantity: usedQuantity,
            remainingQuantity: usedQuantity,
            assignedBy: user.id, // Self-assigned
            status: "assigned", // Employee needs to accept from pending inventory
            notes: `Full cylinder (${gasProduct?.name || 'gas'}) from direct purchase: ${poNumber}`,
            leastPrice: Math.max(emptyCylinderRecord.leastPrice || 0, unitPriceNum || 0),
            assignedDate: new Date(),
            category: 'cylinder',
            cylinderStatus: 'full',
            displayCategory: 'Full Cylinder',
            gasProductId: product // Link to gas used
          })
          
          await fullCylinderAssignment.save()
          
          console.log(`\n🔵 Step 2: Created Full Cylinder Assignment (Contains Gas)`)
          console.log(`   Assignment ID: ${fullCylinderAssignment._id}`)
          console.log(`   Employee ID: ${user.id}`)
          console.log(`   Cylinder Product: ${emptyCylinderRecord.product?.name || 'Cylinder'}`)
          console.log(`   Gas Product: ${gasProduct?.name || 'Gas'}`)
          console.log(`   Quantity: ${usedQuantity} units`)
          console.log(`   Status: ASSIGNED (Pending Employee Acceptance)`)
          console.log(`   Location: Will appear in "Assigned Stock" as Full Cylinder`)
          console.log(`   Note: Gas is inside cylinder, will be tracked when accepted`)
          
          // 3. Create notification for employee
          try {
            const Notification = require("@/models/Notification").default
            const notification = new Notification({
              recipient: user.id,
              sender: user.id,
              type: "stock_assignment",
              title: "New Purchase - Pending Confirmation",
              message: `Your gas purchase (${usedQuantity} units) is ready. Please accept it from your Assigned Stock to add to inventory.`,
              isRead: false
            })
            await notification.save()
            
            console.log(`\n🔔 Step 3: Notification Sent`)
            console.log(`   Title: "${notification.title}"`)
            console.log(`   Message: "${notification.message}"`)
            console.log(`   Recipient: ${user.name}`)
            
            console.log('\n✅ ========== GAS PURCHASE PROCESSING COMPLETE ==========')
            console.log('📍 Next Step: Employee must accept Full Cylinder from "Assigned Stock"')
            console.log('📍 When accepted: Gas inventory will be created/updated automatically')
            console.log('✅ ======================================================\n')
          } catch (notificationError) {
            console.error('❌ Failed to create notification:', notificationError.message)
          }
        } else {
          console.error('❌ Empty cylinder record NOT FOUND!')
          console.error(`   Searched for ID: ${emptyCylinderId}`)
          console.error('   This means the emptyCylinderId does not exist in StockAssignment collection')
          console.error('   Purchase order created but stock assignments NOT created')
        }
      } catch (assignmentError) {
        console.error('❌ Failed to create stock assignments:', assignmentError)
        console.error('   Error details:', assignmentError.message)
        console.error('   Stack trace:', assignmentError.stack)
        console.error('   Purchase order created but assignments failed')
      }
    } else {
      console.log('🔄 Processing Regular Purchase (No Empty Cylinder)...')
      // For regular purchases (without empty cylinder), create stock assignment pending acceptance
      try {
        const StockAssignment = require("@/models/StockAssignment").default
        const Product = require("@/models/Product").default
        
        // Get product details
        const productDetails = await Product.findById(product)
        if (productDetails) {
          const stockAssignment = new StockAssignment({
            employee: user.id,
            product: product,
            quantity: qtyNum,
            remainingQuantity: qtyNum,
            assignedBy: user.id, // Self-assigned
            status: "assigned", // Employee needs to accept from pending inventory
            notes: `Direct purchase: ${poNumber}`,
            leastPrice: unitPriceNum || 0,
            assignedDate: new Date(),
            category: productDetails.category || 'gas',
            cylinderStatus: productDetails.cylinderStatus,
            displayCategory: productDetails.category === 'cylinder' ? 'Cylinder' : 'Gas'
          })
          
          await stockAssignment.save()
          
          console.log(`\n🔵 Step 1: Created Stock Assignment`)
          console.log(`   Assignment ID: ${stockAssignment._id}`)
          console.log(`   Product: ${productDetails.name}`)
          console.log(`   Category: ${productDetails.category}`)
          console.log(`   Quantity: ${qtyNum} units`)
          console.log(`   Status: ASSIGNED (Pending Employee Acceptance)`)
          console.log(`   Location: Will appear in "Assigned Stock" section`)
          console.log(`   Employee ID: ${user.id}`)
          
          // Create notification
          try {
            const Notification = require("@/models/Notification").default
            const notification = new Notification({
              recipient: user.id,
              sender: user.id,
              type: "stock_assignment",
              title: "New Purchase - Pending Confirmation",
              message: `Your purchase of ${productDetails.name} (${qtyNum} units) is ready. Please accept it from your Assigned Stock to add to inventory.`,
              isRead: false
            })
            await notification.save()
            
            console.log(`\n🔔 Step 2: Notification Sent`)
            console.log(`   Title: "${notification.title}"`)
            console.log(`   Message: "${notification.message}"`)
            console.log(`   Recipient: ${user.name}`)
            
            console.log('\n✅ ========== PURCHASE PROCESSING COMPLETE ==========')
            console.log('📍 Next Step: Employee must accept from "Assigned Stock"')
            console.log('✅ =================================================\n')
          } catch (notificationError) {
            console.error('❌ Failed to create notification:', notificationError.message)
          }
        }
      } catch (assignmentError) {
        console.error('❌ Failed to create stock assignment:', assignmentError)
        console.error('   Purchase order created but assignment failed')
      }
    }
    
    // Populate the saved order before returning
    const populatedOrder = await EmployeePurchaseOrder.findById(employeePurchaseOrder._id)
      .populate('supplier', 'companyName')
      .populate('product', 'name')
      .populate('employee', 'name email')
    
    console.log('✅ [EMPLOYEE PURCHASE ORDER] Successfully created and returning response')
    return NextResponse.json({ data: populatedOrder }, { status: 201 })
  } catch (error) {
    console.error("❌ [EMPLOYEE PURCHASE ORDER] Error creating purchase order:", error)
    console.error("❌ [EMPLOYEE PURCHASE ORDER] Error stack:", error.stack)
    console.error("❌ [EMPLOYEE PURCHASE ORDER] Error message:", error.message)
    return NextResponse.json({ 
      error: "Failed to create employee purchase order", 
      details: error.message,
      stack: error.stack 
    }, { status: 500 })
  }
}
