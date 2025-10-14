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

    // Perform inventory deduction from admin inventory
    console.log('🔄 Deducting inventory for assignment:', { category: data.category, cylinderStatus: data.cylinderStatus, quantity: data.quantity });
    
    if (data.category === 'gas' && data.cylinderProductId) {
      // Gas assignment: deduct gas stock and convert full cylinder to empty
      const gasUpdate = await InventoryItem.findOneAndUpdate(
        { productId: data.product },
        { $inc: { currentStock: -data.quantity } },
        { new: true }
      );
      console.log('✅ Gas stock deducted:', gasUpdate?.currentStock);
      
      const cylinderUpdate = await InventoryItem.findOneAndUpdate(
        { productId: data.cylinderProductId },
        { 
          $inc: { 
            availableFull: -data.quantity,
            availableEmpty: data.quantity 
          }
        },
        { new: true }
      );
      console.log('✅ Cylinder converted full->empty:', cylinderUpdate?.availableFull, '->', cylinderUpdate?.availableEmpty);
    } else if (data.category === 'cylinder' && data.cylinderStatus === 'full' && data.gasProductId) {
      // Full cylinder assignment: deduct full cylinders and gas stock
      const cylinderUpdate = await InventoryItem.findOneAndUpdate(
        { productId: data.product },
        { $inc: { availableFull: -data.quantity } },
        { new: true }
      );
      console.log('✅ Full cylinders deducted:', cylinderUpdate?.availableFull);
      
      const gasUpdate = await InventoryItem.findOneAndUpdate(
        { productId: data.gasProductId },
        { $inc: { currentStock: -data.quantity } },
        { new: true }
      );
      console.log('✅ Gas stock deducted:', gasUpdate?.currentStock);
    } else if (data.category === 'cylinder' && data.cylinderStatus === 'empty') {
      // Empty cylinder assignment: deduct empty cylinders
      const cylinderUpdate = await InventoryItem.findOneAndUpdate(
        { productId: data.product },
        { $inc: { availableEmpty: -data.quantity } },
        { new: true }
      );
      console.log('✅ Empty cylinders deducted:', cylinderUpdate?.availableEmpty);
    } else if (data.category === 'cylinder' && data.cylinderStatus === 'full') {
      // Full cylinder only assignment (no gas product)
      const cylinderUpdate = await InventoryItem.findOneAndUpdate(
        { productId: data.product },
        { $inc: { availableFull: -data.quantity } },
        { new: true }
      );
      console.log('✅ Full cylinders deducted (no gas):', cylinderUpdate?.availableFull);
    } else if (data.category === 'gas') {
      // Gas only assignment (no cylinder product)
      const gasUpdate = await InventoryItem.findOneAndUpdate(
        { productId: data.product },
        { $inc: { currentStock: -data.quantity } },
        { new: true }
      );
      console.log('✅ Gas stock deducted (no cylinder):', gasUpdate?.currentStock);
    }

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
      remainingQuantity: data.quantity,
      leastPrice: product.leastPrice,
      displayCategory: displayCategory,
      cylinderStatus: data.cylinderStatus // Explicitly save cylinder status
    };
    
    // Remove empty string ObjectId fields to prevent validation errors
    if (!data.gasProductId || data.gasProductId === '') {
      delete assignmentData.gasProductId;
    }
    if (!data.cylinderProductId || data.cylinderProductId === '') {
      delete assignmentData.cylinderProductId;
    }
    console.log('🔍 Creating assignment with data:', { category: data.category, cylinderStatus: data.cylinderStatus, displayCategory });
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
