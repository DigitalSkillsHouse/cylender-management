import dbConnect from "@/lib/mongodb"
import { NextResponse } from "next/server"
import Product from "@/models/Product"
import InventoryItem from "@/models/InventoryItem"

// Disable caching for this route - force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// GET /api/inventory-items
// Returns inventory items joined with product info
export async function GET() {
  try {
    await dbConnect()

    const items = await InventoryItem.find({})
      .populate("product", "name productCode category costPrice leastPrice")
      .sort({ updatedAt: -1 })
      .lean()

    const data = items.map((it) => ({
      _id: it._id.toString(),
      productId: it.product?._id?.toString() || null,
      productName: it.product?.name || "Unknown",
      productCode: it.product?.productCode || null,
      category: it.category,
      currentStock: it.currentStock ?? 0,
      availableEmpty: it.availableEmpty ?? 0,
      availableFull: it.availableFull ?? 0,
      cylinderSize: it.cylinderSize || null,
      gasType: it.gasType || null,
      updatedAt: it.updatedAt,
    }))

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// POST /api/inventory-items
// Creates inventory record for a product if not present
export async function POST(request) {
  try {
    await dbConnect()
    const body = await request.json()
    const { productId, category, currentStock = 0, availableEmpty = 0, availableFull = 0, cylinderSize, gasType } = body || {}

    if (!productId || !category) {
      return NextResponse.json({ success: false, error: "productId and category are required" }, { status: 400 })
    }

    const product = await Product.findById(productId)
    if (!product) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 })
    }

    let item = await InventoryItem.findOne({ product: productId })
    if (item) {
      return NextResponse.json({ success: true, data: item }, { status: 200 })
    }

    item = await InventoryItem.create({
      product: productId,
      category,
      currentStock,
      availableEmpty,
      availableFull,
      cylinderSize,
      gasType,
    })

    return NextResponse.json({ success: true, data: item }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// PUT /api/inventory-items
// Updates inventory stock (for deductions/additions)
export async function PUT(request) {
  try {
    await dbConnect()
    const body = await request.json()
    const { productId, action, category, cylinderStatus, quantity, reason } = body || {}

    console.log('📦 [INVENTORY UPDATE] Request:', { productId, action, category, cylinderStatus, quantity, reason })

    if (!productId || !action || !quantity) {
      return NextResponse.json({ success: false, error: "productId, action, and quantity are required" }, { status: 400 })
    }

    const item = await InventoryItem.findOne({ product: productId })
    if (!item) {
      return NextResponse.json({ success: false, error: "Inventory item not found" }, { status: 404 })
    }

    const quantityNum = Number(quantity)
    
    if (action === 'deduct') {
      if (category === 'gas') {
        if (item.currentStock < quantityNum) {
          return NextResponse.json({ success: false, error: "Insufficient gas stock" }, { status: 400 })
        }
        item.currentStock -= quantityNum
        console.log('📉 [INVENTORY UPDATE] Deducted gas stock:', quantityNum, 'New stock:', item.currentStock)
      } else if (category === 'cylinder') {
        if (cylinderStatus === 'empty') {
          if (item.availableEmpty < quantityNum) {
            return NextResponse.json({ success: false, error: "Insufficient empty cylinder stock" }, { status: 400 })
          }
          item.availableEmpty -= quantityNum
          console.log('📉 [INVENTORY UPDATE] Deducted empty cylinders:', quantityNum, 'New stock:', item.availableEmpty)
        } else if (cylinderStatus === 'full') {
          if (item.availableFull < quantityNum) {
            return NextResponse.json({ success: false, error: "Insufficient full cylinder stock" }, { status: 400 })
          }
          item.availableFull -= quantityNum
          console.log('📉 [INVENTORY UPDATE] Deducted full cylinders:', quantityNum, 'New stock:', item.availableFull)
        }
      }
    } else if (action === 'add') {
      if (category === 'gas') {
        item.currentStock += quantityNum
      } else if (category === 'cylinder') {
        if (cylinderStatus === 'empty') {
          item.availableEmpty += quantityNum
        } else if (cylinderStatus === 'full') {
          item.availableFull += quantityNum
        }
      }
    }

    await item.save()
    
    console.log('✅ [INVENTORY UPDATE] Successfully updated inventory for product:', productId)
    return NextResponse.json({ success: true, data: item })
  } catch (error) {
    console.error('❌ [INVENTORY UPDATE] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
