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
      .populate('product', 'name')
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
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()
    
    const body = await request.json()
    const {
      supplier,
      product,
      purchaseDate,
      purchaseType,
      cylinderSize,
      quantity,
      unitPrice,
      totalAmount,
      notes,
      status = "pending",
      invoiceNumber,
    } = body

    // Validate required fields (unitPrice is optional)
    if (!supplier || !product || !purchaseDate || !purchaseType || !quantity || !invoiceNumber) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }
    let effectiveCylinderSize = cylinderSize
    if (purchaseType === 'cylinder' && !effectiveCylinderSize) {
      // Fallback: infer from Product.cylinderSize (large/small -> 45kg/5kg)
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
    // Normalize legacy values if client provided them directly
    if (purchaseType === 'cylinder' && effectiveCylinderSize) {
      if (effectiveCylinderSize === 'large') effectiveCylinderSize = '45kg'
      if (effectiveCylinderSize === 'small') effectiveCylinderSize = '5kg'
    }

    // Use provided Invoice Number as the PO reference
    const poNumber = String(invoiceNumber).trim()

    const qtyNum = Number(quantity)
    const unitPriceNum = (unitPrice !== undefined && unitPrice !== null && unitPrice !== "") ? Number(unitPrice) : 0
    const computedTotal = (totalAmount !== undefined && totalAmount !== null && totalAmount !== "")
      ? Number(totalAmount)
      : (qtyNum * unitPriceNum)

    const purchaseOrder = new PurchaseOrder({
      supplier,
      product,
      purchaseDate,
      purchaseType,
      ...(purchaseType === 'cylinder' ? { cylinderSize: effectiveCylinderSize } : {}),
      quantity: qtyNum,
      unitPrice: unitPriceNum,
      totalAmount: computedTotal,
      notes: notes || "",
      status,
      poNumber,
      createdBy: user.id
    })

    await purchaseOrder.save()
    
    // Populate the saved order before returning
    const populatedOrder = await PurchaseOrder.findById(purchaseOrder._id)
      .populate('supplier', 'companyName')
      .populate('product', 'name')
    
    return NextResponse.json({ data: populatedOrder }, { status: 201 })
  } catch (error) {
    console.error("Error creating purchase order:", error)
    return NextResponse.json({ error: "Failed to create purchase order" }, { status: 500 })
  }
}
