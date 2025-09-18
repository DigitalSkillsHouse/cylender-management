import dbConnect from "@/lib/mongodb";
import PurchaseOrder from "@/models/PurchaseOrder";
import Product from "@/models/Product";
import StockManager from "@/lib/stock-manager";
import { verifyToken } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await dbConnect();
    console.log("Fetching purchase orders for inventory...");

    // First, try to get purchase orders without population to avoid reference errors
    let purchaseOrders;
    try {
      purchaseOrders = await PurchaseOrder.find({})
        .populate('product', 'name category')
        .populate('supplier', 'companyName')
        .sort({ createdAt: -1 })
        .lean();
    } catch (populateError) {
      console.warn("Population failed, fetching without populate:", populateError.message);
      // Fallback: fetch without populate if references are broken
      purchaseOrders = await PurchaseOrder.find({})
        .sort({ createdAt: -1 })
        .lean();
    }

    console.log(`Found ${purchaseOrders.length} purchase orders`);

    // Transform purchase orders into inventory items with safe property access
    const inventoryItems = purchaseOrders.map(order => {
      const item = {
        id: order._id?.toString() || '',
        poNumber: order.poNumber || 'N/A',
        productName: order.product?.name || order.productName || "Unknown Product",
        supplierName: order.supplier?.companyName || order.supplierName || "Unknown Supplier",
        purchaseDate: order.purchaseDate,
        quantity: order.quantity || 0,
        unitPrice: order.unitPrice || 0,
        totalAmount: order.totalAmount || 0,
        status: order.inventoryStatus || "pending",
        purchaseType: order.purchaseType || "gas",
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      };
      return item;
    });

    console.log(`Transformed ${inventoryItems.length} inventory items`);

    return NextResponse.json({
      success: true,
      data: inventoryItems
    });

  } catch (error) {
    console.error("Inventory API error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to fetch inventory data", 
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// POST - Create new inventory item (if needed)
export async function POST(request) {
  try {
    await dbConnect();
    console.log("POST inventory request received");
    
    // Verify authentication if needed
    // const user = await verifyToken(request);
    // if (!user) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }
    
    const body = await request.json();
    console.log("Create data:", body);
    
    // For now, return not implemented as inventory items are created via purchase orders
    return NextResponse.json(
      { success: false, error: "Inventory items are created via purchase orders" },
      { status: 501 }
    );
  } catch (error) {
    console.error("Inventory creation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create inventory item", details: error.message },
      { status: 500 }
    );
  }
}

// PATCH method removed - now using dynamic routes /api/inventory/[id]
