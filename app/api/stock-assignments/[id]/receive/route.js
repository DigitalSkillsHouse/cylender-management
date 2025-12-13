import dbConnect from "@/lib/mongodb"
import StockAssignment from "@/models/StockAssignment"
import Notification from "@/models/Notification"
import Product from "@/models/Product"
import { NextResponse } from "next/server"

export async function PUT(request, { params }) {
  try {
    await dbConnect()
    
    // Parse request body for additional data (like emptyCylinderId)
    let requestBody = {}
    try {
      requestBody = await request.json()
    } catch (e) {
      // No body or invalid JSON, continue with empty object
    }
    const { emptyCylinderId } = requestBody

    // Load assignment with product details
    const assignment = await StockAssignment.findById(params.id)
      .populate("employee", "name")
      .populate("assignedBy", "name")
      .populate("product", "name currentStock")

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
    }

    // Validate product stock and deduct on receive
    const product = assignment.product
    if (!product) {
      return NextResponse.json({ error: "Product not found for assignment" }, { status: 404 })
    }

    const qty = Number(assignment.quantity) || 0
    const available = Number(product.currentStock) || 0
    if (qty > available) {
      return NextResponse.json({ error: `Insufficient stock. Available: ${available}, Requested: ${qty}` }, { status: 400 })
    }

    await Product.findByIdAndUpdate(product._id, { currentStock: available - qty })

    // Mark as received
    const updatedAssignment = await StockAssignment.findByIdAndUpdate(
      params.id,
      {
        status: "received",
        receivedDate: new Date(),
      },
      { new: true }
    )
      .populate("employee", "name")
      .populate("assignedBy", "name")

    // NOTE: We do NOT create DailyRefill records when employee accepts gas assignments
    // Gas assignments should only show in "Received Gas" column, not in "Refilled" column
    // Refilled column is only for actual refill operations (supplier refilling cylinders)
    if (assignment.category === 'gas' && emptyCylinderId) {
      console.log('ℹ️ [ASSIGNMENT] Gas assignment accepted - tracking as Received Gas only, not Refilled')
    }
    
    // Create notification for admin
    await Notification.create({
      recipient: updatedAssignment.assignedBy._id,
      sender: updatedAssignment.employee._id,
      type: "stock_received",
      title: "Stock Received",
      message: `${updatedAssignment.employee.name} has received the assigned stock.`,
      relatedId: updatedAssignment._id,
    })

    return NextResponse.json(updatedAssignment)
  } catch (error) {
    return NextResponse.json({ error: "Failed to update assignment" }, { status: 500 })
  }
}
