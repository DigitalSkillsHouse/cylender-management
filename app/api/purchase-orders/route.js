import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import PurchaseOrder from "@/models/PurchaseOrder"
import Supplier from "@/models/Supplier"
import Product from "@/models/Product"
import { verifyToken } from "@/lib/auth"

// GET - Fetch all purchase orders
export async function GET(request) {
  try {
    console.log("GET /api/purchase-orders - Starting request")
    
    // Verify authentication
    console.log("Verifying authentication...")
    const user = await verifyToken(request)
    if (!user) {
      console.log("Authentication failed")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.log("User authenticated:", user.role)

    console.log("Connecting to database...")
    await dbConnect()
    console.log("Database connected")
    
    console.log("Fetching purchase orders...")
    const purchaseOrders = await PurchaseOrder.find({})
      .populate('supplier', 'companyName')
      .populate('items.product', 'name productCode category')
      .sort({ createdAt: -1 })
    
    console.log(`Found ${purchaseOrders.length} purchase orders`)
    return NextResponse.json({ data: purchaseOrders })
  } catch (error) {
    console.error("Error fetching purchase orders:", error)
    console.error("Error stack:", error.stack)
    return NextResponse.json({ error: "Failed to fetch purchase orders", details: error.message }, { status: 500 })
  }
}

// POST - Create new purchase order
export async function POST(request) {
  try {
    console.log("POST /api/purchase-orders - Starting request")
    
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      console.log("Authentication failed")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.log("User authenticated:", user.role)

    await dbConnect()
    console.log("Database connected")
    
    const body = await request.json()
    console.log("Request body:", JSON.stringify(body, null, 2))
    
    const {
      supplier,
      purchaseDate,
      items,
      notes,
      status = "pending",
      invoiceNumber,
    } = body

    // Validate required fields
    if (!supplier || !purchaseDate || !items || !Array.isArray(items) || items.length === 0 || !invoiceNumber) {
      console.log("Missing required fields:", { supplier, purchaseDate, items: items?.length, invoiceNumber })
      return NextResponse.json(
        { error: "Missing required fields. Supplier, purchase date, items array, and invoice number are required." },
        { status: 400 }
      )
    }
    // Validate and process each item
    const processedItems = []
    let totalOrderAmount = 0

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      console.log(`Processing item ${i + 1}:`, item)

      // Validate item fields
      if (!item.productId || !item.purchaseType || !item.quantity) {
        return NextResponse.json(
          { error: `Item ${i + 1}: Missing required fields (productId, purchaseType, quantity)` },
          { status: 400 }
        )
      }

      let effectiveCylinderStatus = item.cylinderStatus
      if (item.purchaseType === 'cylinder' && !effectiveCylinderStatus) {
        console.log(`Item ${i + 1}: Cylinder purchase without status, looking up product:`, item.productId)
        try {
          const prod = await Product.findById(item.productId)
          console.log("Found product:", prod)
          if (prod && prod.cylinderStatus) {
            effectiveCylinderStatus = prod.cylinderStatus
            console.log("Inferred cylinder status:", effectiveCylinderStatus)
          } else {
            return NextResponse.json(
              { error: `Item ${i + 1}: cylinderStatus is required for cylinder purchases` },
              { status: 400 }
            )
          }
        } catch (productError) {
          console.error("Error fetching product:", productError)
          return NextResponse.json(
            { error: `Item ${i + 1}: Failed to validate product details` },
            { status: 500 }
          )
        }
      }

      // Validate gasType for full cylinders
      if (item.purchaseType === 'cylinder' && effectiveCylinderStatus === 'full' && !item.gasType) {
        return NextResponse.json(
          { error: `Item ${i + 1}: gasType is required for full cylinder purchases` },
          { status: 400 }
        )
      }

      // Validate emptyCylinderId for gas purchases
      if (item.purchaseType === 'gas' && !item.emptyCylinderId) {
        return NextResponse.json(
          { error: `Item ${i + 1}: emptyCylinderId is required for gas purchases` },
          { status: 400 }
        )
      }

      // Validate empty cylinder stock for gas purchases and deduct stock
      if (item.purchaseType === 'gas' && item.emptyCylinderId) {
        try {
          const emptyCylinder = await Product.findById(item.emptyCylinderId)
          if (!emptyCylinder) {
            return NextResponse.json(
              { error: `Item ${i + 1}: Empty cylinder not found` },
              { status: 400 }
            )
          }
          if (emptyCylinder.category !== 'cylinder' || emptyCylinder.cylinderStatus !== 'empty') {
            return NextResponse.json(
              { error: `Item ${i + 1}: Selected product is not an empty cylinder` },
              { status: 400 }
            )
          }
          if (emptyCylinder.currentStock < Number(item.quantity)) {
            return NextResponse.json(
              { error: `Item ${i + 1}: Not enough empty cylinders available. Available: ${emptyCylinder.currentStock}, Requested: ${item.quantity}` },
              { status: 400 }
            )
          }
          
          // Deduct empty cylinder stock immediately when purchase order is created
          const newEmptyStock = emptyCylinder.currentStock - Number(item.quantity)
          await Product.findByIdAndUpdate(item.emptyCylinderId, {
            currentStock: Math.max(0, newEmptyStock)
          })
          console.log(`✅ Deducted ${item.quantity} empty cylinders from ${emptyCylinder.name}. Stock: ${emptyCylinder.currentStock} → ${newEmptyStock}`)
          
        } catch (cylinderError) {
          console.error("Error validating empty cylinder:", cylinderError)
          return NextResponse.json(
            { error: `Item ${i + 1}: Failed to validate empty cylinder` },
            { status: 500 }
          )
        }
      }

      const qtyNum = Number(item.quantity)
      const unitPriceNum = (item.unitPrice !== undefined && item.unitPrice !== null && item.unitPrice !== "") ? Number(item.unitPrice) : 0
      const itemTotal = qtyNum * unitPriceNum

      const processedItem = {
        product: item.productId,
        purchaseType: item.purchaseType,
        ...(item.purchaseType === 'cylinder' ? { 
          cylinderStatus: effectiveCylinderStatus,
          ...(effectiveCylinderStatus === 'full' ? { gasType: item.gasType } : {})
        } : {}),
        ...(item.purchaseType === 'gas' ? { emptyCylinderId: item.emptyCylinderId } : {}),
        quantity: qtyNum,
        unitPrice: unitPriceNum,
        itemTotal: itemTotal
      }

      processedItems.push(processedItem)
      totalOrderAmount += itemTotal
    }

    // Use provided Invoice Number as the PO reference
    const poNumber = String(invoiceNumber).trim()

    console.log("Creating purchase order with data:", {
      supplier,
      purchaseDate,
      items: processedItems,
      totalAmount: totalOrderAmount,
      notes: notes || "",
      status,
      poNumber,
      createdBy: user.id
    })

    const purchaseOrder = new PurchaseOrder({
      supplier,
      purchaseDate,
      items: processedItems,
      totalAmount: totalOrderAmount,
      notes: notes || "",
      status,
      poNumber,
      createdBy: user.id
    })

    console.log("Saving purchase order...")
    await purchaseOrder.save()
    console.log("Purchase order saved successfully:", purchaseOrder._id)
    
    // Populate the saved order before returning
    console.log("Populating purchase order...")
    const populatedOrder = await PurchaseOrder.findById(purchaseOrder._id)
      .populate('supplier', 'companyName')
      .populate('items.product', 'name')
    
    console.log("Purchase order created successfully")
    return NextResponse.json({ data: populatedOrder }, { status: 201 })
  } catch (error) {
    console.error("Error creating purchase order:", error)
    console.error("Error stack:", error.stack)
    
    // Provide more specific error messages
    let errorMessage = "Failed to create purchase order"
    if (error.name === 'ValidationError') {
      errorMessage = `Validation error: ${error.message}`
    } else if (error.code === 11000) {
      errorMessage = "Duplicate invoice number. Please use a unique invoice number."
    }
    
    return NextResponse.json({ 
      error: errorMessage, 
      details: error.message,
      validationErrors: error.errors 
    }, { status: 500 })
  }
}
