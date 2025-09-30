import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import PurchaseOrder from "@/models/PurchaseOrder"
import Product from "@/models/Product"
import { verifyToken } from "@/lib/auth"

// GET - Fetch single purchase order
export async function GET(request, { params }) {
  try {
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()
    
    const purchaseOrder = await PurchaseOrder.findById(params.id)
      .populate('supplier', 'companyName')
      .populate('items.product', 'name')
    
    if (!purchaseOrder) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 })
    }
    
    return NextResponse.json({ data: purchaseOrder })
  } catch (error) {
    console.error("Error fetching purchase order:", error)
    return NextResponse.json({ error: "Failed to fetch purchase order" }, { status: 500 })
  }
}

// PUT - Update purchase order
export async function PUT(request, { params }) {
  try {
    console.log("PUT /api/purchase-orders/[id] - Starting request")
    
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
      status
    } = body

    // Validate required fields
    if (!supplier || !purchaseDate || !items || !Array.isArray(items) || items.length === 0) {
      console.log("Missing required fields:", { supplier, purchaseDate, items: items?.length })
      return NextResponse.json(
        { error: "Missing required fields. Supplier, purchase date, and items array are required." },
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

      let effectiveCylinderSize = item.cylinderSize
      if (item.purchaseType === 'cylinder' && !effectiveCylinderSize) {
        console.log(`Item ${i + 1}: Cylinder purchase without size, looking up product:`, item.productId)
        try {
          const prod = await Product.findById(item.productId)
          console.log("Found product:", prod)
          if (prod && prod.cylinderSize) {
            effectiveCylinderSize = prod.cylinderSize === 'large' ? '45kg' : '5kg'
            console.log("Inferred cylinder size:", effectiveCylinderSize)
          } else {
            return NextResponse.json(
              { error: `Item ${i + 1}: cylinderSize is required for cylinder purchases` },
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

      // Normalize legacy values if client provided them directly
      if (item.purchaseType === 'cylinder' && effectiveCylinderSize) {
        if (effectiveCylinderSize === 'large') effectiveCylinderSize = '45kg'
        if (effectiveCylinderSize === 'small') effectiveCylinderSize = '5kg'
      }

      const qtyNum = Number(item.quantity)
      const unitPriceNum = (item.unitPrice !== undefined && item.unitPrice !== null && item.unitPrice !== "") ? Number(item.unitPrice) : 0
      const itemTotal = qtyNum * unitPriceNum

      const processedItem = {
        product: item.productId,
        purchaseType: item.purchaseType,
        ...(item.purchaseType === 'cylinder' ? { cylinderSize: effectiveCylinderSize } : {}),
        quantity: qtyNum,
        unitPrice: unitPriceNum,
        itemTotal: itemTotal
      }

      processedItems.push(processedItem)
      totalOrderAmount += itemTotal
    }

    console.log("Updating purchase order with data:", {
      supplier,
      purchaseDate,
      items: processedItems,
      totalAmount: totalOrderAmount,
      notes: notes || "",
      status: status || "pending"
    })

    const purchaseOrder = await PurchaseOrder.findByIdAndUpdate(
      params.id,
      {
        supplier,
        purchaseDate,
        items: processedItems,
        totalAmount: totalOrderAmount,
        notes: notes || "",
        status: status || "pending"
      },
      { new: true }
    ).populate('supplier', 'companyName')
     .populate('items.product', 'name')
    
    if (!purchaseOrder) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 })
    }
    
    console.log("Purchase order updated successfully")
    return NextResponse.json({ data: purchaseOrder })
  } catch (error) {
    console.error("Error updating purchase order:", error)
    console.error("Error stack:", error.stack)
    
    // Provide more specific error messages
    let errorMessage = "Failed to update purchase order"
    if (error.name === 'ValidationError') {
      errorMessage = `Validation error: ${error.message}`
    }
    
    return NextResponse.json({ 
      error: errorMessage, 
      details: error.message,
      validationErrors: error.errors 
    }, { status: 500 })
  }
}

// DELETE - Delete purchase order
export async function DELETE(request, { params }) {
  try {
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()
    
    const purchaseOrder = await PurchaseOrder.findByIdAndDelete(params.id)
    
    if (!purchaseOrder) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 })
    }
    
    return NextResponse.json({ message: "Purchase order deleted successfully" })
  } catch (error) {
    console.error("Error deleting purchase order:", error)
    return NextResponse.json({ error: "Failed to delete purchase order" }, { status: 500 })
  }
}
