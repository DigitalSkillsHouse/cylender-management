import { NextResponse } from "next/server"
import mongoose from "mongoose"
import dbConnect from "@/lib/mongodb"
import EmployeeInventoryItem from "@/models/EmployeeInventoryItem"
import ReturnTransaction from "@/models/ReturnTransaction"
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
    const employeeId = body?.employeeId
    const items = Array.isArray(body?.items) ? body.items : []

    if (!employeeId) {
      return NextResponse.json({ error: "employeeId is required" }, { status: 400 })
    }
    if (!items.length) {
      return NextResponse.json({ error: "items is required" }, { status: 400 })
    }

    const batchId = (globalThis.crypto?.randomUUID?.() || new mongoose.Types.ObjectId().toString())
    const expiresAt = getDubaiExpiry()

    const session = await mongoose.startSession()
    const created = []

    try {
      await session.withTransaction(async () => {
        for (const raw of items) {
          const itemId = raw?.itemId
          const stockType = raw?.stockType
          const quantity = normalizeQty(raw?.quantity)
          const cylinderProductId = raw?.cylinderProductId

          if (!itemId || !stockType || !quantity || quantity < 1) {
            throw new Error("Each item requires itemId, stockType, quantity")
          }

          const inventoryItem = await EmployeeInventoryItem.findById(itemId)
            .populate('product', 'name productCode category cylinderSize')
            .session(session)

          if (!inventoryItem) throw new Error("Inventory item not found")
          if (inventoryItem.employee.toString() !== employeeId) throw new Error("Unauthorized inventory item")

          if (stockType === 'gas') {
            if ((inventoryItem.currentStock || 0) < quantity) throw new Error("Insufficient gas stock")
            if (!cylinderProductId) throw new Error("cylinderProductId is required for gas returns")

            const cylinderInventory = await EmployeeInventoryItem.findOne({
              employee: employeeId,
              product: cylinderProductId,
              category: 'cylinder'
            }).session(session)

            if (!cylinderInventory) throw new Error("Selected cylinder not found in employee inventory")
            if ((cylinderInventory.availableFull || 0) < quantity) throw new Error("Insufficient full cylinders for gas return")

            const tx = await ReturnTransaction.create([{
              batchId,
              employee: employeeId,
              product: inventoryItem.product._id,
              stockType,
              cylinderProductId,
              quantity,
              returnDate: new Date(),
              status: 'pending',
              inventoryDeducted: true,
              expiresAt,
              notes: `Employee returned ${quantity} gas ${inventoryItem.product.name} to admin`
            }], { session })

            inventoryItem.currentStock = Math.max(0, (inventoryItem.currentStock || 0) - quantity)
            inventoryItem.lastUpdatedAt = new Date()
            cylinderInventory.availableFull = Math.max(0, (cylinderInventory.availableFull || 0) - quantity)
            cylinderInventory.availableEmpty = (cylinderInventory.availableEmpty || 0) + quantity
            cylinderInventory.lastUpdatedAt = new Date()

            await Promise.all([
              inventoryItem.save({ session }),
              cylinderInventory.save({ session })
            ])

            created.push(tx[0].toObject())
          } else if (stockType === 'empty') {
            if ((inventoryItem.availableEmpty || 0) < quantity) throw new Error("Insufficient empty cylinder stock")

            const tx = await ReturnTransaction.create([{
              batchId,
              employee: employeeId,
              product: inventoryItem.product._id,
              stockType,
              cylinderProductId: null,
              quantity,
              returnDate: new Date(),
              status: 'pending',
              inventoryDeducted: true,
              expiresAt,
              notes: `Employee returned ${quantity} empty ${inventoryItem.product.name} to admin`
            }], { session })

            inventoryItem.availableEmpty = Math.max(0, (inventoryItem.availableEmpty || 0) - quantity)
            inventoryItem.lastUpdatedAt = new Date()
            await inventoryItem.save({ session })

            created.push(tx[0].toObject())
          } else {
            throw new Error("Invalid stockType (must be gas|empty)")
          }
        }

        // Notify admin once for the batch (best-effort)
        const adminUser = await User.findOne({ role: 'admin' }).session(session)
        if (adminUser) {
          const employeeUser = await User.findById(employeeId).session(session)
          const employeeName = employeeUser?.name || 'Employee'
          const totalItems = created.length
          const totalQty = created.reduce((sum, t) => sum + (Number(t.quantity) || 0), 0)
          await Notification.create([{
            recipient: adminUser._id,
            sender: employeeId,
            type: "stock_returned",
            title: "Stock Return Request",
            message: `${employeeName} sent ${totalItems} item(s) back (Total Qty: ${totalQty}). Please review in Assign/Return.`,
            relatedId: created?.[0]?._id,
            isRead: false
          }], { session })
        }
      })
    } finally {
      session.endSession()
    }

    return NextResponse.json({ success: true, batchId, expiresAt, data: created }, { status: 201 })
  } catch (error) {
    console.error("[send-back-batch] Error:", error)
    return NextResponse.json({ error: error?.message || "Failed to send back stock" }, { status: 500 })
  }
}
