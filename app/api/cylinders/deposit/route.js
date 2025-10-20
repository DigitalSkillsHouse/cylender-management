import dbConnect from "@/lib/mongodb";
import CylinderTransaction from "@/models/Cylinder";
import Product from "@/models/Product";
import InventoryItem from "@/models/InventoryItem";
import Customer from "@/models/Customer";
import { NextResponse } from "next/server";
import Counter from "@/models/Counter";
import Sale from "@/models/Sale";
import EmployeeSale from "@/models/EmployeeSale";

// Helper: get next sequential invoice number using unified system
async function getNextCylinderInvoice() {
  const settings = await Counter.findOne({ key: 'invoice_start' })
  const startingNumber = settings?.seq || 0

  // Check all invoice collections for latest number
  const [latestSale, latestEmpSale, latestCylinder] = await Promise.all([
    Sale.findOne({ invoiceNumber: { $regex: /^\d{4}$/ } }).sort({ invoiceNumber: -1 }),
    EmployeeSale.findOne({ invoiceNumber: { $regex: /^\d{4}$/ } }).sort({ invoiceNumber: -1 }),
    CylinderTransaction.findOne({ invoiceNumber: { $regex: /^\d{4}$/ } }).sort({ invoiceNumber: -1 })
  ])

  let nextNumber = startingNumber
  const saleNumber = latestSale ? parseInt(latestSale.invoiceNumber) || -1 : -1
  const empSaleNumber = latestEmpSale ? parseInt(latestEmpSale.invoiceNumber) || -1 : -1
  const cylinderNumber = latestCylinder ? parseInt(latestCylinder.invoiceNumber) || -1 : -1
  const lastNumber = Math.max(saleNumber, empSaleNumber, cylinderNumber)
  
  if (lastNumber >= 0) {
    nextNumber = Math.max(lastNumber + 1, startingNumber)
  }

  return nextNumber.toString().padStart(4, '0')
}

// Helper function to update inventory for deposit transactions
async function updateInventoryForDeposit(cylinderProductId, quantity, gasProductId) {
  console.log(`[Deposit] Processing stock deduction - Cylinder: ${cylinderProductId}, Quantity: ${quantity}, Gas: ${gasProductId}`);
  
  // 1. Simply deduct empty cylinders from inventory
  const cylinderInventory = await InventoryItem.findOne({ product: cylinderProductId });
  if (cylinderInventory) {
    cylinderInventory.availableEmpty = Math.max(0, (cylinderInventory.availableEmpty || 0) - quantity);
    cylinderInventory.currentStock = (cylinderInventory.availableFull || 0) + (cylinderInventory.availableEmpty || 0);
    await cylinderInventory.save();
    console.log(`[Deposit] Updated cylinder inventory - Empty: ${cylinderInventory.availableEmpty}, Total: ${cylinderInventory.currentStock}`);
  }
  
  // 2. Deduct gas stock if gasProductId is provided
  if (gasProductId) {
    const gasProduct = await Product.findById(gasProductId);
    if (gasProduct) {
      gasProduct.currentStock = Math.max(0, (gasProduct.currentStock || 0) - quantity);
      await gasProduct.save();
      console.log(`[Deposit] Updated gas product ${gasProduct.name} stock: ${gasProduct.currentStock}`);
    }
  }
  
  // 3. Sync cylinder product stock with inventory total
  const cylinderProduct = await Product.findById(cylinderProductId);
  if (cylinderProduct && cylinderInventory) {
    cylinderProduct.currentStock = cylinderInventory.currentStock;
    await cylinderProduct.save();
    console.log(`[Deposit] Synced cylinder product ${cylinderProduct.name} stock: ${cylinderProduct.currentStock}`);
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
    console.log("Received deposit data:", JSON.stringify(data, null, 2));
    
    // Validate customer exists
    const customer = await Customer.findById(data.customer);
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    // Create deposit transaction
    const transactionData = {
      ...data,
      type: "deposit",
      status: data.status || "pending"
    };

    // Assign invoice number if not provided (sequential unified system)
    if (!transactionData.invoiceNumber) {
      transactionData.invoiceNumber = await getNextCylinderInvoice()
    }

    let transaction;
    try {
      transaction = await CylinderTransaction.create(transactionData);
    } catch (e) {
      if (e?.code === 11000 && String(e?.keyPattern || {}).includes('invoiceNumber')) {
        transactionData.invoiceNumber = await getNextCylinderInvoice()
        transaction = await CylinderTransaction.create(transactionData)
      } else {
        throw e
      }
    }
    const populatedTransaction = await CylinderTransaction.findById(transaction._id)
      .populate("customer", "name phone address email")
      .populate("product", "name category cylinderType");

    // Update inventory stock for deposit
    try {
      if (data.items && Array.isArray(data.items)) {
        // Multi-item transaction
        for (const item of data.items) {
          await updateInventoryForDeposit(item.productId, Number(item.quantity), item.gasProductId);
        }
      } else if (data.product && data.quantity) {
        // Single item transaction
        await updateInventoryForDeposit(data.product, Number(data.quantity), data.gasProductId);
      }
    } catch (stockError) {
      console.error("Error updating inventory stock:", stockError);
      // Don't fail the transaction creation if stock update fails
    }

    return NextResponse.json(populatedTransaction, { status: 201 });
  } catch (error) {
    console.error("Cylinder deposit POST error:", error);
    return NextResponse.json(
      { error: "Failed to create cylinder deposit", details: error.message },
      { status: 500 }
    );
  }
}