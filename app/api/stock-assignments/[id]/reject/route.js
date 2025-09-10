import dbConnect from "@/lib/mongodb"
import StockAssignment from "@/models/StockAssignment"
import Notification from "@/models/Notification"
import Product from "@/models/Product"
import { NextResponse } from "next/server"

export async function PUT(request, { params }) {
  try {
    await dbConnect()

    // Load assignment with related docs
    const assignment = await StockAssignment.findById(params.id)
      .populate("employee", "name")
      .populate("product", "name currentStock")
      .populate("assignedBy", "name")

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
    }

    // Do NOT modify product stock on reject (stock is only deducted when employee receives)

    // Mark as rejected
    const updated = await StockAssignment.findByIdAndUpdate(
      params.id,
      {
        status: "rejected",
        rejectedDate: new Date(),
      },
      { new: true }
    )
      .populate("employee", "name")
      .populate("assignedBy", "name")

    // Notify admin (assignedBy) that employee rejected the assignment
    try {
      await Notification.create({
        recipient: updated.assignedBy._id,
        sender: updated.employee._id,
        type: "stock_rejected",
        title: "Stock Assignment Rejected",
        message: `${updated.employee.name} has rejected the assigned stock.`,
        relatedId: updated._id,
      })
    } catch (e) {
      // Non-blocking: notification failure shouldn't block rejection
    }

    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: "Failed to reject assignment" }, { status: 500 })
  }
}
