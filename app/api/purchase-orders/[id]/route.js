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
      .populate('product', 'name')
    
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
      status
    } = body

    // Validate required fields (unitPrice/total optional)
    if (!supplier || !product || !purchaseDate || !purchaseType || !quantity) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }
    if (purchaseType === 'cylinder' && !cylinderSize) {
      return NextResponse.json(
        { error: "cylinderSize is required for cylinder purchases" },
        { status: 400 }
      )
    }

    const qtyNum = Number(quantity)
    const unitPriceNum = (unitPrice !== undefined && unitPrice !== null && unitPrice !== "") ? Number(unitPrice) : 0
    const computedTotal = (totalAmount !== undefined && totalAmount !== null && totalAmount !== "")
      ? Number(totalAmount)
      : (qtyNum * unitPriceNum)

    // Determine effective cylinder size (normalize legacy values and infer from product if missing)
    let effectiveCylinderSize = cylinderSize
    if (purchaseType === 'cylinder') {
      if (!effectiveCylinderSize) {
        const prod = await Product.findById(product)
        if (prod && prod.cylinderSize) {
          effectiveCylinderSize = prod.cylinderSize === 'large' ? '45kg' : '5kg'
        }
      }
      if (effectiveCylinderSize === 'large') effectiveCylinderSize = '45kg'
      if (effectiveCylinderSize === 'small') effectiveCylinderSize = '5kg'
      if (!effectiveCylinderSize) {
        return NextResponse.json(
          { error: "cylinderSize is required for cylinder purchases" },
          { status: 400 }
        )
      }
    }

    const updateDoc = {
      $set: {
        supplier,
        product,
        purchaseDate,
        purchaseType,
        quantity: qtyNum,
        unitPrice: unitPriceNum,
        totalAmount: computedTotal,
        notes: notes || "",
        status: status || "pending",
      },
    }
    if (purchaseType === 'cylinder') {
      updateDoc.$set.cylinderSize = effectiveCylinderSize
    } else {
      updateDoc.$unset = { cylinderSize: 1 }
    }

    const purchaseOrder = await PurchaseOrder.findByIdAndUpdate(
      params.id,
      updateDoc,
      { new: true }
    ).populate('supplier', 'companyName')
     .populate('product', 'name')
    
    if (!purchaseOrder) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 })
    }
    
    return NextResponse.json({ data: purchaseOrder })
  } catch (error) {
    console.error("Error updating purchase order:", error)
    return NextResponse.json({ error: "Failed to update purchase order" }, { status: 500 })
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
