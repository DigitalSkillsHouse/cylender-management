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
    // Support filtering by employeeId, status, and date
    const { searchParams } = new URL(request.url, `http://${request.headers.get("host") || "localhost"}`);
    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");
    const date = searchParams.get("date");
    const query = {};
    if (employeeId) query.employee = employeeId;
    if (status) query.status = status;
    
    // Filter by assignedDate if date is provided
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      query.assignedDate = {
        $gte: startDate,
        $lte: endDate
      };
      console.log(`[stock-assignments] Filtering by date: ${date} (${startDate.toISOString()} to ${endDate.toISOString()})`);
    }

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
    console.log('📥 Stock assignment request data:', JSON.stringify(data, null, 2));
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

    // Validate required fields for full cylinder assignments
    if (data.category === 'cylinder' && data.cylinderStatus === 'full' && !data.gasProductId) {
      return NextResponse.json(
        { error: "Gas product is required for full cylinder assignments" },
        { status: 400 }
      );
    }

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

    // DO NOT UPDATE INVENTORY WHEN ASSIGNMENT IS CREATED
    // Inventory should only be deducted when employee ACCEPTS the assignment
    console.log('📋 Assignment created with status "assigned" - inventory will be deducted when employee accepts');
    console.log('🔄 Assignment details:', {
      category: data.category,
      cylinderStatus: data.cylinderStatus,
      product: data.product,
      quantity: data.quantity,
      cylinderProductId: data.cylinderProductId,
      gasProductId: data.gasProductId,
      status: 'assigned'
    });

    // Create assignment with remainingQuantity initialized to the assigned quantity and include leastPrice
    // Set proper category based on type and cylinder status
    let displayCategory = data.category;
    if (data.category === 'cylinder') {
      displayCategory = data.cylinderStatus === 'empty' ? 'Empty Cylinder' : 'Full Cylinder';
    } else if (data.category === 'gas') {
      displayCategory = 'Gas';
    }
    
    const assignmentData = {
      ...data,
      status: 'assigned', // Always start with assigned status - employee must accept
      remainingQuantity: data.quantity,
      leastPrice: product.leastPrice,
      displayCategory: displayCategory,
      cylinderStatus: data.cylinderStatus, // Explicitly save cylinder status
      assignedDate: new Date(), // Ensure fresh timestamp for each assignment
      createdAt: new Date(), // Force new creation timestamp
    };
    
    // Remove empty string ObjectId fields to prevent validation errors
    if (!data.gasProductId || data.gasProductId === '') {
      delete assignmentData.gasProductId;
    }
    if (!data.cylinderProductId || data.cylinderProductId === '') {
      delete assignmentData.cylinderProductId;
    }
    console.log('🔍 Creating assignment with data:', { category: data.category, cylinderStatus: data.cylinderStatus, displayCategory });
    console.log('📝 Full assignment data being created:', {
      employee: data.employee,
      product: data.product,
      quantity: data.quantity,
      status: assignmentData.status,
      assignedDate: assignmentData.assignedDate,
      createdAt: assignmentData.createdAt
    });
    
    const assignment = await StockAssignment.create(assignmentData);
    console.log('✅ Assignment created successfully with ID:', assignment._id);
    console.log('🔍 CRITICAL DEBUG - Assignment status after creation:', {
      assignmentId: assignment._id,
      status: assignment.status,
      employee: assignment.employee,
      product: assignment.product,
      quantity: assignment.quantity,
      assignedDate: assignment.assignedDate,
      createdAt: assignment.createdAt
    });

    // Create notification for employee
    await Notification.create({
      recipient: data.employee,
      sender: data.assignedBy,
      type: "stock_assignment",
      title: "New Stock Assignment",
      message: `${product.name} (${data.quantity} units) has been assigned to you. Please accept to add to your inventory.`,
      relatedId: assignment._id,
    });

    console.log('✅ Stock assignment created and admin inventory updated for product:', data.product, 'quantity:', data.quantity)

    const populatedAssignment = await StockAssignment.findById(assignment._id)
      .populate("employee", "name email")
      .populate("product", "name productCode category cylinderSize")
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
