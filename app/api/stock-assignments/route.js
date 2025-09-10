import dbConnect from "@/lib/mongodb";
import StockAssignment from "@/models/StockAssignment";
import Notification from "@/models/Notification";
import Product from "@/models/Product";
import { NextResponse } from "next/server";

export async function GET(request) {
  try {
    await dbConnect();
  } catch (error) {
    console.error("Database connection error:", error);
    return NextResponse.json(
      { error: "Database connection failed", details: error.message },
      { status: 500 }
    );
  }

  try {
    // Support filtering by employeeId and status
    const { searchParams } = new URL(request.url, `http://${request.headers.get("host") || "localhost"}`);
    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");
    const query = {};
    if (employeeId) query.employee = employeeId;
    if (status) query.status = status;

    let assignments = await StockAssignment.find(query)
      .populate("employee", "name email")
      .populate("product", "name category cylinderSize")
      .populate("assignedBy", "name")
      .sort({ createdAt: -1 });
    // Inject leastPrice from assignment into product object for frontend compatibility
    assignments = assignments.map(a => {
      const obj = a.toObject();
      if (obj.product) {
        obj.product.leastPrice = obj.leastPrice;
        obj.product.currentStock = obj.remainingQuantity;
      }
      return obj;
    });
    return NextResponse.json({ data: assignments });
  } catch (error) {
    console.error("Stock assignments GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch assignments", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await dbConnect();
  } catch (error) {
    console.error("Database connection error:", error);
    return NextResponse.json(
      { error: "Database connection failed", details: error.message },
      { status: 500 }
    );
  }

  try {
    const data = await request.json();

    // Get the product to validate and include pricing
    const product = await Product.findById(data.product);
    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    // Check if sufficient stock is available
    if (product.currentStock < data.quantity) {
      return NextResponse.json(
        { error: `Insufficient stock. Available: ${product.currentStock}, Requested: ${data.quantity}` },
        { status: 400 }
      );
    }

    // Do NOT deduct stock here; stock will be deducted when employee RECEIVES the assignment

    // Create assignment with remainingQuantity initialized to the assigned quantity and include leastPrice
    const assignmentData = {
      ...data,
      remainingQuantity: data.quantity,
      leastPrice: product.leastPrice
    };
    const assignment = await StockAssignment.create(assignmentData);

    // Create notification for employee
    await Notification.create({
      recipient: data.employee,
      sender: data.assignedBy,
      type: "stock_assignment",
      title: "New Stock Assignment",
      message: `You have been assigned new stock. Please check your dashboard.`,
      relatedId: assignment._id,
    });

    const populatedAssignment = await StockAssignment.findById(assignment._id)
      .populate("employee", "name email")
      .populate("product", "name category cylinderSize")
      .populate("assignedBy", "name");

    return NextResponse.json(populatedAssignment, { status: 201 });
  } catch (error) {
    console.error("Stock assignments POST error:", error);
    return NextResponse.json(
      { error: "Failed to create assignment", details: error.message },
      { status: 500 }
    );
  }
}
