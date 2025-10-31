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

    // Create daily refill record if this is a gas assignment with cylinder selection
    try {
      // If this is a gas assignment and employee selected a cylinder for refill
      if (assignment.category === 'gas' && emptyCylinderId) {
        const DailyRefill = (await import('@/models/DailyRefill')).default
        const EmployeeInventoryItem = (await import('@/models/EmployeeInventoryItem')).default
        
        // Get the cylinder product from the selected empty cylinder
        const emptyCylinderInventory = await EmployeeInventoryItem.findById(emptyCylinderId).populate('product')
        
        if (emptyCylinderInventory && emptyCylinderInventory.product) {
          const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
          const cylinderProductId = emptyCylinderInventory.product._id
          const cylinderName = emptyCylinderInventory.product.name
          const quantity = Number(assignment.quantity) || 0
          
          console.log(`⛽ [ASSIGNMENT REFILL] Creating daily refill record:`, {
            date: today,
            cylinderProductId: cylinderProductId,
            cylinderName: cylinderName,
            employeeId: assignment.employee._id,
            quantity: quantity,
            source: 'admin_assignment'
          })
          
          // Create or update daily refill record for the CYLINDER product
          await DailyRefill.findOneAndUpdate(
            {
              date: today,
              cylinderProductId: cylinderProductId,
              employeeId: assignment.employee._id
            },
            {
              $inc: { todayRefill: quantity },
              $set: { cylinderName: cylinderName }
            },
            {
              upsert: true,
              new: true
            }
          )
          
          console.log(`✅ [ASSIGNMENT REFILL] Created refill record for cylinder: ${cylinderName} (${quantity} units)`)
        }
      }
    } catch (refillError) {
      console.error('❌ Failed to create daily refill record for assignment:', refillError.message)
      // Don't fail the entire operation if refill tracking fails
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
