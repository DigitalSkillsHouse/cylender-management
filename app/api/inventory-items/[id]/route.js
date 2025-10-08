import dbConnect from "@/lib/mongodb"
import { NextResponse } from "next/server"
import Product from "@/models/Product"
import InventoryItem from "@/models/InventoryItem"

// PATCH /api/inventory-items/[id]
// Adjust stock atomically. Accepts either absolute values or deltas.
// Body: { set?: {currentStock?, availableEmpty?, availableFull?}, delta?: {currentStock?, availableEmpty?, availableFull?} }
export async function PATCH(_req, { params }) {
  try {
    await dbConnect()
    const id = params.id

    const body = await _req.json()
    const set = body?.set || {}
    const delta = body?.delta || {}

    const item = await InventoryItem.findById(id)
    if (!item) {
      return NextResponse.json({ success: false, error: "Inventory item not found" }, { status: 404 })
    }

    // Apply deltas first
    if (typeof delta.currentStock === 'number') item.currentStock = Math.max(0, (item.currentStock || 0) + delta.currentStock)
    if (typeof delta.availableEmpty === 'number') item.availableEmpty = Math.max(0, (item.availableEmpty || 0) + delta.availableEmpty)
    if (typeof delta.availableFull === 'number') item.availableFull = Math.max(0, (item.availableFull || 0) + delta.availableFull)

    // Apply absolute sets
    if (typeof set.currentStock === 'number') item.currentStock = Math.max(0, set.currentStock)
    if (typeof set.availableEmpty === 'number') item.availableEmpty = Math.max(0, set.availableEmpty)
    if (typeof set.availableFull === 'number') item.availableFull = Math.max(0, set.availableFull)

    item.lastUpdatedAt = new Date()
    await item.save()



    return NextResponse.json({ success: true, data: item })
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
