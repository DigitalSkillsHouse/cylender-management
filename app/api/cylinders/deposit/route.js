import dbConnect from "@/lib/mongodb";
import CylinderTransaction from "@/models/Cylinder";
import Product from "@/models/Product";
import Customer from "@/models/Customer";
import { NextResponse } from "next/server";
import Counter from "@/models/Counter";

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

    // Update product stock if product exists
    if (data.product && data.quantity) {
      try {
        const product = await Product.findById(data.product);
        if (product) {
          product.currentStock -= Number(data.quantity);
          await product.save();
          console.log(`Updated product ${product.name} stock: ${product.currentStock}`);
        } else {
          console.log(`Product with ID ${data.product} not found for stock update`);
        }
      } catch (stockError) {
        console.error("Error updating product stock:", stockError);
        // Don't fail the transaction creation if stock update fails
      }
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
