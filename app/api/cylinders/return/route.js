import dbConnect from "@/lib/mongodb";
import CylinderTransaction from "@/models/Cylinder";
import Product from "@/models/Product";
import InventoryItem from "@/models/InventoryItem";
import Customer from "@/models/Customer";
import { NextResponse } from "next/server";
import Counter from "@/models/Counter";

// Helper function to update inventory for return transactions
async function updateInventoryForReturn(cylinderProductId, quantity) {
  console.log(`[Return] Processing stock addition - Cylinder: ${cylinderProductId}, Quantity: ${quantity}`);
  
  // 1. Add empty cylinders to inventory
  const cylinderInventory = await InventoryItem.findOne({ product: cylinderProductId });
  if (cylinderInventory) {
    cylinderInventory.availableEmpty = (cylinderInventory.availableEmpty || 0) + quantity;
    cylinderInventory.currentStock = (cylinderInventory.availableFull || 0) + (cylinderInventory.availableEmpty || 0);
    await cylinderInventory.save();
    console.log(`[Return] Updated cylinder inventory - Full: ${cylinderInventory.availableFull}, Empty: ${cylinderInventory.availableEmpty}`);
  }
  
  // 2. Update cylinder product stock to match inventory total (sync with inventory)
  const cylinderProduct = await Product.findById(cylinderProductId);
  if (cylinderProduct && cylinderInventory) {
    cylinderProduct.currentStock = (cylinderInventory.availableFull || 0) + (cylinderInventory.availableEmpty || 0);
    await cylinderProduct.save();
    console.log(`[Return] Synced cylinder product ${cylinderProduct.name} stock: ${cylinderProduct.currentStock}`);
  }
}

// Helper: get next sequential invoice number: INV-<year>-CM-<seq>
async function getNextCylinderInvoice() {
  const now = new Date()
  const year = now.getFullYear()
  const key = 'cylinder_invoice'
  const updated = await Counter.findOneAndUpdate(
    { key, year },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )
  return `INV-${year}-CM-${updated.seq}`
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
    
    // Validate customer exists
    const customer = await Customer.findById(data.customer);
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    // Create return transaction
    const transactionData = {
      ...data,
      type: "return",
      status: data.status || "pending"
    };

    // Assign invoice number if not provided (sequential per year)
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

    // Update inventory stock for return (receiving empty cylinders)
    try {
      if (Array.isArray(data.items) && data.items.length > 0) {
        for (const item of data.items) {
          await updateInventoryForReturn(item.productId, Number(item.quantity));
        }
      } else if (data.product && data.quantity) {
        await updateInventoryForReturn(data.product, Number(data.quantity));
      }
    } catch (stockErr) {
      console.error("[cylinders/return] Failed to update inventory stock:", stockErr)
      // Do not fail the whole request if stock update trips; transaction is still recorded
    }

    // If this return is linked to a specific deposit, recompute that deposit's cleared status
    try {
      if (data?.linkedDeposit) {
        const depositId = String(data.linkedDeposit)
        const depositTx = await CylinderTransaction.findOne({ _id: depositId, type: 'deposit' }).lean()
        if (depositTx) {
          // Compute total deposited quantity (items-aware)
          const depositQty = Array.isArray(depositTx.items) && depositTx.items.length > 0
            ? depositTx.items.reduce((s, it) => s + (Number(it?.quantity) || 0), 0)
            : (Number(depositTx.quantity) || 0)

          // Sum all returned quantities linked to this deposit (including this one we just created)
          const linkedReturns = await CylinderTransaction.find({ linkedDeposit: depositId, type: 'return' }).lean()
          const totalReturnedQty = linkedReturns.reduce((sum, r) => {
            const q = Array.isArray(r.items) && r.items.length > 0
              ? r.items.reduce((s, it) => s + (Number(it?.quantity) || 0), 0)
              : (Number(r.quantity) || 0)
            return sum + q
          }, 0)

          const newStatus = totalReturnedQty >= depositQty ? 'cleared' : 'pending'
          await CylinderTransaction.updateOne({ _id: depositId }, { $set: { status: newStatus } })
        }
      }
    } catch (linkErr) {
      console.error('[cylinders/return] Failed to update linked deposit status:', linkErr)
      // Non-fatal
    }

    return NextResponse.json(populatedTransaction, { status: 201 });
  } catch (error) {
    console.error("Cylinder return POST error:", error);
    return NextResponse.json(
      { error: "Failed to create cylinder return", details: error.message },
      { status: 500 }
    );
  }
}

