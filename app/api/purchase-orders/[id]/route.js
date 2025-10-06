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

      // Validate empty cylinder stock for gas purchases
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
