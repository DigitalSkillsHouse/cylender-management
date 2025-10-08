import dbConnect from "@/lib/mongodb"
import { NextResponse } from "next/server"
import Product from "@/models/Product"
import InventoryItem from "@/models/InventoryItem"

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

    // Best-effort sync into Product for backward compatibility
    try {
      product.currentStock = currentStock
      product.availableEmpty = availableEmpty
      product.availableFull = availableFull
      await product.save()
    } catch (_) {}

    return NextResponse.json({ success: true, data: item }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
