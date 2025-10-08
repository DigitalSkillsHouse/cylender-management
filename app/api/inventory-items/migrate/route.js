import dbConnect from "@/lib/mongodb"
import { NextResponse } from "next/server"
import Product from "@/models/Product"
import InventoryItem from "@/models/InventoryItem"

// POST /api/inventory-items/migrate
// Seeds InventoryItem docs from existing Product stock fields
export async function POST() {
  try {
    await dbConnect()

    const products = await Product.find({}).lean()
    let created = 0
    let updated = 0

    for (const p of products) {
      const existing = await InventoryItem.findOne({ product: p._id })
      if (existing) {
        // Sync existing to match product as baseline
        const prior = { currentStock: existing.currentStock, availableEmpty: existing.availableEmpty, availableFull: existing.availableFull }
        existing.category = p.category
        existing.currentStock = typeof p.currentStock === 'number' ? p.currentStock : (existing.currentStock || 0)
        existing.availableEmpty = typeof p.availableEmpty === 'number' ? p.availableEmpty : (existing.availableEmpty || 0)
        existing.availableFull = typeof p.availableFull === 'number' ? p.availableFull : (existing.availableFull || 0)
        existing.lastUpdatedAt = new Date()
        await existing.save()
        updated++
        continue
      }

      await InventoryItem.create({
        product: p._id,
        category: p.category,
        currentStock: typeof p.currentStock === 'number' ? p.currentStock : 0,
        availableEmpty: typeof p.availableEmpty === 'number' ? p.availableEmpty : 0,
        availableFull: typeof p.availableFull === 'number' ? p.availableFull : 0,
      })
      created++
    }

    return NextResponse.json({ success: true, created, updated, total: products.length })
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
