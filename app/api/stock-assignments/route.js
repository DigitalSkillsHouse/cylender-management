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
      .populate("product", "name productCode category cylinderSize")
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
    const InventoryItem = (await import("@/models/InventoryItem")).default;

    // Get the product to validate and include pricing
    const product = await Product.findById(data.product);
    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    // Get inventory availability
    const inventoryAvailability = data.inventoryAvailability || {};
    const productInventory = inventoryAvailability[data.product] || {};

    // Validate stock availability based on category and cylinder status
    if (data.category === 'gas') {
      const gasStock = productInventory.currentStock || product.currentStock || 0;
      if (gasStock < data.quantity) {
        return NextResponse.json(
          { error: `Insufficient gas stock. Available: ${gasStock}, Requested: ${data.quantity}` },
          { status: 400 }
        );
      }
    } else if (data.category === 'cylinder') {
      if (data.cylinderStatus === 'full') {
        const fullStock = productInventory.availableFull || 0;
        if (fullStock < data.quantity) {
          return NextResponse.json(
            { error: `Insufficient full cylinders. Available: ${fullStock}, Requested: ${data.quantity}` },
            { status: 400 }
          );
        }
      } else {
        const emptyStock = productInventory.availableEmpty || 0;
        if (emptyStock < data.quantity) {
          return NextResponse.json(
            { error: `Insufficient empty cylinders. Available: ${emptyStock}, Requested: ${data.quantity}` },
            { status: 400 }
          );
        }
      }
    }

    // Perform inventory deduction like Gas Sales
    if (data.category === 'gas' && data.cylinderProductId) {
      // Gas assignment: deduct gas stock and convert full cylinder to empty
      await InventoryItem.findOneAndUpdate(
        { product: data.product },
        { $inc: { currentStock: -data.quantity } }
      );
      
      await InventoryItem.findOneAndUpdate(
        { product: data.cylinderProductId },
        { 
          $inc: { 
            availableFull: -data.quantity,
            availableEmpty: data.quantity 
          }
        }
      );
    } else if (data.category === 'cylinder' && data.cylinderStatus === 'full' && data.gasProductId) {
      // Full cylinder assignment: deduct full cylinders and gas stock
      await InventoryItem.findOneAndUpdate(
        { product: data.product },
        { $inc: { availableFull: -data.quantity } }
      );
      
      await InventoryItem.findOneAndUpdate(
        { product: data.gasProductId },
        { $inc: { currentStock: -data.quantity } }
      );
    } else if (data.category === 'cylinder' && data.cylinderStatus === 'empty') {
      // Empty cylinder assignment: deduct empty cylinders
      await InventoryItem.findOneAndUpdate(
        { product: data.product },
        { $inc: { availableEmpty: -data.quantity } }
      );
    }

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
