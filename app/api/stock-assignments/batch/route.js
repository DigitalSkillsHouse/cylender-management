import { NextResponse } from "next/server"
import mongoose from "mongoose"
import dbConnect from "@/lib/mongodb"
import StockAssignment from "@/models/StockAssignment"
import InventoryItem from "@/models/InventoryItem"
import Product from "@/models/Product"
import Notification from "@/models/Notification"
import User from "@/models/User"
import { addDaysToDate, getDubaiNowISOString, getLocalDateStringFromDate } from "@/lib/date-utils"

// Disable caching for this route - force dynamic rendering
export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const getDubaiExpiry = () => {
  const dubaiNow = new Date(getDubaiNowISOString())
  const dubaiDate = getLocalDateStringFromDate(dubaiNow)
  let cutoff = new Date(`${dubaiDate}T23:55:00+04:00`)
  if (dubaiNow > cutoff) {
    const nextDubaiDate = addDaysToDate(dubaiDate, 1)
    cutoff = new Date(`${nextDubaiDate}T23:55:00+04:00`)
  }
  return cutoff
}

const normalizeQty = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export async function POST(request) {
  try {
    await dbConnect()
    const body = await request.json().catch(() => ({}))

    const employeeId = body?.employeeId || body?.employee
    const assignedBy = body?.assignedBy
    const items = Array.isArray(body?.items) ? body.items : []
    const globalNotes = body?.notes || ""

    if (!employeeId || !assignedBy) {
      return NextResponse.json({ error: "employeeId and assignedBy are required" }, { status: 400 })
    }
    if (!items.length) {
      return NextResponse.json({ error: "At least one item is required" }, { status: 400 })
    }

    const batchId = (globalThis.crypto?.randomUUID?.() || new mongoose.Types.ObjectId().toString())
    const expiresAt = getDubaiExpiry()

    const session = await mongoose.startSession()
    let created = []

    try {
      await session.withTransaction(async () => {
        const [employeeUser, adminUser] = await Promise.all([
          User.findById(employeeId).session(session).lean(),
          User.findById(assignedBy).session(session).lean(),
        ])

        if (!employeeUser) throw new Error("Employee not found")
        if (!adminUser) throw new Error("AssignedBy user not found")

        for (const raw of items) {
          const category = (raw?.category || "").toString()
          const productId = raw?.productId || raw?.product
          const quantity = normalizeQty(raw?.quantity)
          const cylinderStatus = raw?.cylinderStatus
          const gasProductId = raw?.gasProductId || null
          const cylinderProductId = raw?.cylinderProductId || null
          const notes = (raw?.notes || globalNotes || "").toString()

          if (!productId || !category || !quantity || quantity < 1) {
            throw new Error("Invalid item: productId, category, quantity are required")
          }

          const product = await Product.findById(productId).session(session)
          if (!product) throw new Error("Product not found")

          // Validate full cylinder requires gas product
          if (category === "cylinder" && cylinderStatus === "full" && !gasProductId) {
            throw new Error("Gas product is required for full cylinder assignments")
          }

          // Validate inventory existence and availability before deductions
          const requireInventory = async (pId) => {
            const ii = await InventoryItem.findOne({ product: pId }).session(session)
            if (!ii) throw new Error("Inventory item not found for selected product")
            return ii
          }

          if (category === "gas" && cylinderProductId) {
            const gasInv = await requireInventory(productId)
            const cylInv = await requireInventory(cylinderProductId)
            if ((gasInv.currentStock || 0) < quantity) throw new Error("Insufficient gas stock")
            if ((cylInv.availableFull || 0) < quantity) throw new Error("Insufficient full cylinder stock")

            gasInv.currentStock = (gasInv.currentStock || 0) - quantity
            cylInv.availableFull = (cylInv.availableFull || 0) - quantity
            cylInv.availableEmpty = (cylInv.availableEmpty || 0) + quantity
            await Promise.all([gasInv.save({ session }), cylInv.save({ session })])
          } else if (category === "cylinder" && cylinderStatus === "empty") {
            const cylInv = await requireInventory(productId)
            if ((cylInv.availableEmpty || 0) < quantity) throw new Error("Insufficient empty cylinder stock")
            cylInv.availableEmpty = (cylInv.availableEmpty || 0) - quantity
            await cylInv.save({ session })
          } else if (category === "cylinder" && cylinderStatus === "full" && gasProductId) {
            const cylInv = await requireInventory(productId)
            const gasInv = await requireInventory(gasProductId)
            if ((cylInv.availableFull || 0) < quantity) throw new Error("Insufficient full cylinder stock")
            if ((gasInv.currentStock || 0) < quantity) throw new Error("Insufficient gas stock")

            cylInv.availableFull = (cylInv.availableFull || 0) - quantity
            gasInv.currentStock = (gasInv.currentStock || 0) - quantity
            await Promise.all([cylInv.save({ session }), gasInv.save({ session })])
          } else if (category === "gas") {
            const gasInv = await requireInventory(productId)
            if ((gasInv.currentStock || 0) < quantity) throw new Error("Insufficient gas stock")
            gasInv.currentStock = (gasInv.currentStock || 0) - quantity
            await gasInv.save({ session })
          } else {
            throw new Error("Invalid assignment category/status combination")
          }

          const assignment = await StockAssignment.create(
            [
              {
                batchId,
                employee: employeeId,
                product: productId,
                quantity,
                assignedBy,
                status: "assigned",
                notes,
                leastPrice: Number(product.leastPrice || 0),
                category,
                cylinderStatus: cylinderStatus || undefined,
                gasProductId: gasProductId || undefined,
                cylinderProductId: cylinderProductId || undefined,
                assignedDate: new Date(),
                inventoryDeducted: true,
                expiresAt,
              },
            ],
            { session }
          )

          created.push(assignment[0].toObject())
        }

        // Single notification for the whole batch
        const summary = items
          .map((it) => {
            const qty = normalizeQty(it?.quantity)
            const name = (it?.productName || "").toString().trim()
            return name ? `${name} (Qty: ${qty})` : `Item (Qty: ${qty})`
          })
          .filter(Boolean)
          .slice(0, 5)
          .join(", ")

        await Notification.create(
          [
            {
              recipient: employeeId,
              sender: assignedBy,
              type: "stock_assignment",
              title: "New Stock Assignment",
              message: `Stock assigned to you. Please Accept/Reject in Stock page. ${summary ? `Items: ${summary}` : ""}`.trim(),
              isRead: false,
            },
          ],
          { session }
        )
      })
    } finally {
      session.endSession()
    }

    return NextResponse.json({ success: true, batchId, expiresAt, data: created }, { status: 201 })
  } catch (error) {
    console.error("[stock-assignments/batch] Error:", error)
    return NextResponse.json({ error: error?.message || "Failed to create batch assignments" }, { status: 500 })
  }
}

