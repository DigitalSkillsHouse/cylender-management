import dbConnect from "@/lib/mongodb";
import CylinderTransaction from "@/models/Cylinder";
import Product from "@/models/Product";
import Customer from "@/models/Customer";
import { NextResponse } from "next/server";
import Counter from "@/models/Counter";
import DailyRefill from "@/models/DailyRefill";

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

    // Create refill transaction
    const transactionData = {
      ...data,
      type: "refill",
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

    // Update product stock and daily tracking
    if (data.product && data.quantity) {
      const product = await Product.findById(data.product);
      if (product) {
        product.currentStock -= Number(data.quantity);
        await product.save();
        
        // Update daily refill tracking for admin refills
        const date = data.transactionDate ? new Date(data.transactionDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
        await DailyRefill.findOneAndUpdate(
          {
            date: date,
            cylinderProductId: data.product,
            employeeId: null // Admin refill
          },
          {
            $inc: {
              todayRefill: Number(data.quantity)
            },
            $set: {
              cylinderName: product.name
            }
          },
          {
            upsert: true,
            new: true
          }
        );
        
        console.log(`[Refill] Updated daily tracking for ${product.name}: +${data.quantity} refills`);
      }
    }

    return NextResponse.json(populatedTransaction, { status: 201 });
  } catch (error) {
    console.error("Cylinder refill POST error:", error);
    return NextResponse.json(
      { error: "Failed to create cylinder refill", details: error.message },
      { status: 500 }
    );
  }
}
