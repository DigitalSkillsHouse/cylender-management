import dbConnect from "@/lib/mongodb";
import StockAssignment from "@/models/StockAssignment";
import Notification from "@/models/Notification";
import Product from "@/models/Product";
import { recalculateAdminDailyStockReportsFrom } from "@/lib/admin-backdated-sync";
import { recalculateEmployeeDailyStockReportsFrom } from "@/lib/employee-dsr-sync";
import { getLocalDateStringFromDate } from "@/lib/date-utils";
import { NextResponse } from "next/server";

export async function PUT(request, { params }) {
  try {
    await dbConnect();

    // First get the assignment with product details
    const assignment = await StockAssignment.findById(params.id)
      .populate("employee", "name")
      .populate("product", "name currentStock")
      .populate("assignedBy", "name");

    if (!assignment) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 }
      );
    }

    // Add stock back to product when employee returns it
    const product = assignment.product;
    const returnedQuantity = assignment.quantity;
    const updatedStock = product.currentStock + returnedQuantity;
    
    await Product.findByIdAndUpdate(product._id, {
      currentStock: updatedStock
    });

    console.log(`Stock returned: Product ${product.name}, Quantity: ${returnedQuantity}, New Stock: ${updatedStock}`);

    // Update assignment status
    const updatedAssignment = await StockAssignment.findByIdAndUpdate(
      params.id,
      {
        status: "returned",
        returnedDate: new Date(),
      },
      { new: true }
    )
      .populate("employee", "name")
      .populate("assignedBy", "name");



    // Create notification for admin
    await Notification.create({
      recipient: updatedAssignment.assignedBy._id,
      sender: updatedAssignment.employee._id,
      type: "stock_returned",
      title: "Stock Returned",
      message: `${updatedAssignment.employee.name} has returned the assigned stock.`,
      relatedId: updatedAssignment._id,
    });

    try {
      const affectedDate = getLocalDateStringFromDate(updatedAssignment.returnedDate || updatedAssignment.updatedAt || new Date())
      await Promise.all([
        recalculateAdminDailyStockReportsFrom(affectedDate),
        recalculateEmployeeDailyStockReportsFrom(String(updatedAssignment.employee._id || updatedAssignment.employee), affectedDate),
      ])
      console.log(`[stock-assignment-return] Rebuilt admin and employee DSR from ${affectedDate}`)
    } catch (syncError) {
      console.error("[stock-assignment-return] Failed to rebuild DSR snapshots:", syncError)
    }

    return NextResponse.json(updatedAssignment);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to return assignment" },
      { status: 500 }
    );
  }
}
