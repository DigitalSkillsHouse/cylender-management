import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import ReturnTransaction from "@/models/ReturnTransaction"
import EmployeeInventoryItem from "@/models/EmployeeInventoryItem"
import Notification from "@/models/Notification"
import { recalculateEmployeeDailyStockReportsFrom } from "@/lib/employee-dsr-sync"
import { getLocalDateStringFromDate } from "@/lib/date-utils"

// Disable caching for this route - force dynamic rendering
export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function POST(request) {
  try {
    await dbConnect()
    const body = await request.json().catch(() => ({}))
    const returnTransactionId = body?.returnTransactionId
    const adminId = body?.adminId

    if (!returnTransactionId || !adminId) {
      return NextResponse.json({ error: "returnTransactionId and adminId are required" }, { status: 400 })
    }

    const tx = await ReturnTransaction.findById(returnTransactionId)
      .populate('employee', 'name email')
      .populate('product', 'name category')
    
    if (!tx) return NextResponse.json({ error: "Return transaction not found" }, { status: 404 })
    if (tx.status !== 'pending') {
      return NextResponse.json({ error: `Return is not pending (status: ${tx.status})`, currentStatus: tx.status }, { status: 400 })
    }

    // Restore employee inventory only if it was deducted on send-back
    if (tx.inventoryDeducted) {
      const qty = Number(tx.quantity || 0)
      if (tx.stockType === 'empty') {
        const inv = await EmployeeInventoryItem.findOne({ employee: tx.employee._id, product: tx.product._id })
        if (inv) {
          inv.availableEmpty = (inv.availableEmpty || 0) + qty
          inv.lastUpdatedAt = new Date()
          await inv.save()
        }
      } else if (tx.stockType === 'gas') {
        // Restore gas stock
        const gasInv = await EmployeeInventoryItem.findOne({ employee: tx.employee._id, product: tx.product._id })
        if (gasInv) {
          gasInv.currentStock = (gasInv.currentStock || 0) + qty
          gasInv.lastUpdatedAt = new Date()
          await gasInv.save()
        }

        // Restore cylinder conversion (empty->full) on the cylinder product used
        if (tx.cylinderProductId) {
          const cylInv = await EmployeeInventoryItem.findOne({ employee: tx.employee._id, product: tx.cylinderProductId })
          if (cylInv) {
            cylInv.availableFull = (cylInv.availableFull || 0) + qty
            cylInv.availableEmpty = Math.max(0, (cylInv.availableEmpty || 0) - qty)
            cylInv.lastUpdatedAt = new Date()
            await cylInv.save()
          }
        }
      }
    }

    tx.status = 'rejected'
    tx.processedBy = adminId
    tx.processedAt = new Date()
    tx.inventoryDeducted = false
    await tx.save()

    try {
      const affectedDate = getLocalDateStringFromDate(tx.returnDate || tx.processedAt || tx.createdAt || new Date())
      await recalculateEmployeeDailyStockReportsFrom(String(tx.employee?._id || tx.employee), affectedDate)
      console.log(`[reject-return] Rebuilt employee DSR from ${affectedDate}`)
    } catch (syncError) {
      console.error("[reject-return] Failed to rebuild employee DSR:", syncError)
    }

    // Notify employee (best-effort)
    try {
      await Notification.create({
        recipient: tx.employee._id,
        sender: adminId,
        type: "general",
        title: "Return Rejected",
        message: `Admin rejected your stock return (Qty: ${tx.quantity}). Stock has been restored to your inventory.`,
        isRead: false,
      })
    } catch (e) {
      console.warn("[reject-return] Failed to create notification:", e)
    }

    return NextResponse.json({ success: true, data: tx })
  } catch (error) {
    console.error("[reject-return] Error:", error)
    return NextResponse.json({ error: "Failed to reject return", details: error.message }, { status: 500 })
  }
}
