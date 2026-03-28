import dbConnect from "@/lib/mongodb";
import CylinderTransaction from "@/models/Cylinder";
import Product from "@/models/Product";
import { recalculateAdminDailyStockReportsFrom } from "@/lib/admin-backdated-sync";
import { getLocalDateStringFromDate } from "@/lib/date-utils";
import { NextResponse } from "next/server";

export async function GET(request, { params }) {
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
    const { id } = params;
    const transaction = await CylinderTransaction.findById(id)
      .populate("customer", "name phone address email");
    
    if (!transaction) {
      return NextResponse.json(
        { error: "Cylinder transaction not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(transaction);
  } catch (error) {
    console.error("Cylinder GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch cylinder transaction", details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    await dbConnect();
    const { id } = params;
    const body = await request.json().catch(() => ({}));
    const customerSignature = body?.customerSignature;

    if (!customerSignature) {
      return NextResponse.json({ error: "customerSignature is required" }, { status: 400 });
    }

    const updated = await CylinderTransaction.findByIdAndUpdate(
      id,
      { $set: { customerSignature } },
      { new: true }
    )
      .populate("customer", "name phone address email")
      .populate("product", "name category cylinderType");

    if (!updated) {
      return NextResponse.json({ error: "Cylinder transaction not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Cylinder PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to save customer signature", details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    await dbConnect();
    const { id } = params;
    const data = await request.json();

    // Find the original transaction to revert stock changes
    const originalTransaction = await CylinderTransaction.findById(id);

    if (originalTransaction && originalTransaction.product) {
      const originalProduct = await Product.findById(originalTransaction.product);
      if (originalProduct) {
        const originalQuantity = Number(originalTransaction.quantity) || 0;
        if (originalTransaction.type === 'return') {
          originalProduct.currentStock -= originalQuantity;
        } else {
          originalProduct.currentStock += originalQuantity;
        }
        await originalProduct.save();
      }
    }

    // Update the transaction with new data
    const updatedTransaction = await CylinderTransaction.findByIdAndUpdate(id, data, { new: true, runValidators: true });

    if (!updatedTransaction) {
      return NextResponse.json({ error: "Cylinder transaction not found" }, { status: 404 });
    }

    // Apply the new stock change
    if (updatedTransaction.product) {
      const newProduct = await Product.findById(updatedTransaction.product);
      if (newProduct) {
        const newQuantity = Number(updatedTransaction.quantity) || 0;
        if (updatedTransaction.type === 'return') {
          newProduct.currentStock += newQuantity;
        } else {
          newProduct.currentStock -= newQuantity;
        }
        await newProduct.save();
      }
    }

    const populatedTransaction = await CylinderTransaction.findById(id)
      .populate("customer", "name phone address")
      .populate("product", "name category cylinderType");

    try {
      const affectedDate = updatedTransaction.transactionDate || getLocalDateStringFromDate(originalTransaction?.createdAt || updatedTransaction.createdAt || new Date())
      await recalculateAdminDailyStockReportsFrom(affectedDate)
    } catch (syncError) {
      console.error("[cylinders][PUT] Failed to rebuild admin DSR snapshots:", syncError)
    }

    return NextResponse.json(populatedTransaction);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
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
    const { id } = params;
    // Find the transaction to revert stock changes before deleting
    const transactionToDelete = await CylinderTransaction.findById(id);

    if (transactionToDelete && transactionToDelete.product) {
      const product = await Product.findById(transactionToDelete.product);
      if (product) {
        const quantity = Number(transactionToDelete.quantity) || 0;
        if (transactionToDelete.type === 'return') {
          product.currentStock -= quantity; // It was a return, so subtract the quantity that was added
        } else {
          product.currentStock += quantity; // It was a deposit/refill, so add back the quantity that was removed
        }
        await product.save();
      }
    }

    const deletedTransaction = await CylinderTransaction.findByIdAndDelete(id);
    
    if (!deletedTransaction) {
      return NextResponse.json(
        { error: "Cylinder transaction not found" },
        { status: 404 }
      );
    }

    try {
      const affectedDate = transactionToDelete.transactionDate || getLocalDateStringFromDate(transactionToDelete.createdAt || new Date())
      await recalculateAdminDailyStockReportsFrom(affectedDate)
    } catch (syncError) {
      console.error("[cylinders][DELETE] Failed to rebuild admin DSR snapshots:", syncError)
    }

    return NextResponse.json({ message: "Cylinder transaction deleted successfully" });
  } catch (error) {
    console.error("Cylinder DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete cylinder transaction", details: error.message },
      { status: 500 }
    );
  }
}
