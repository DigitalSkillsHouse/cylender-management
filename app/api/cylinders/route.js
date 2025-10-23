import dbConnect from "@/lib/mongodb";
import CylinderTransaction from "@/models/Cylinder";
import Customer from "@/models/Customer";
import Supplier from "@/models/Supplier";
import DailyCylinderTransaction from "@/models/DailyCylinderTransaction";
import { NextResponse } from "next/server";
import Counter from "@/models/Counter";

// Helper: get next sequential invoice number using unified system
async function getNextCylinderInvoice() {
  const settings = await Counter.findOne({ key: 'invoice_start' })
  const startingNumber = settings?.seq || 0

  // Check all invoice collections for latest number
  const [latestSale, latestEmpSale, latestCylinder] = await Promise.all([
    (await import("@/models/Sale")).default.findOne({ invoiceNumber: { $regex: /^\d{4}$/ } }).sort({ invoiceNumber: -1 }),
    (await import("@/models/EmployeeSale")).default.findOne({ invoiceNumber: { $regex: /^\d{4}$/ } }).sort({ invoiceNumber: -1 }),
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

// Helper function to update daily cylinder transaction tracking
async function updateDailyCylinderTracking(transaction, isEmployeeTransaction = false) {
  try {
    const transactionDate = transaction.createdAt ? new Date(transaction.createdAt) : new Date()
    const dateStr = transactionDate.toISOString().split('T')[0] // YYYY-MM-DD format
    
    // Handle both single item and multi-item transactions
    const items = transaction.items && transaction.items.length > 0 
      ? transaction.items 
      : [{
          productId: transaction.product,
          productName: transaction.product?.name || 'Unknown Product',
          cylinderSize: transaction.cylinderSize || 'Unknown Size',
          quantity: transaction.quantity || 0,
          amount: transaction.amount || 0
        }]

    for (const item of items) {
      const productId = typeof item.productId === 'object' ? item.productId._id : item.productId
      const productName = item.productName || transaction.product?.name || 'Unknown Product'
      const cylinderSize = item.cylinderSize || transaction.cylinderSize || 'Unknown Size'
      const quantity = Number(item.quantity) || 0
      const amount = Number(item.amount) || 0

      if (!productId || quantity <= 0) continue

      // Find or create daily tracking record
      const filter = {
        date: dateStr,
        cylinderProductId: productId,
        employeeId: isEmployeeTransaction ? transaction.employee : null
      }

      const updateData = {
        cylinderName: productName,
        cylinderSize: cylinderSize,
        isEmployeeTransaction: isEmployeeTransaction
      }

      // Update based on transaction type
      if (transaction.type === 'deposit') {
        updateData.$inc = {
          depositQuantity: quantity,
          depositAmount: amount
        }
      } else if (transaction.type === 'return') {
        updateData.$inc = {
          returnQuantity: quantity,
          returnAmount: amount
        }
      }

      // Only update if we have increments to apply
      if (updateData.$inc) {
        await DailyCylinderTransaction.findOneAndUpdate(
          filter,
          {
            $set: {
              cylinderName: productName,
              cylinderSize: cylinderSize,
              isEmployeeTransaction: isEmployeeTransaction
            },
            ...updateData
          },
          { 
            upsert: true, 
            new: true,
            setDefaultsOnInsert: true
          }
        )

        console.log(`[DailyCylinderTracking] Updated ${transaction.type} tracking for ${productName} on ${dateStr}: ${quantity} units, AED ${amount}`)
      }
    }
  } catch (error) {
    console.error('[DailyCylinderTracking] Failed to update daily tracking:', error)
    // Don't throw error to avoid breaking the main transaction flow
  }
}

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
    // Optional filters via query params
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    const type = searchParams.get('type'); // deposit | refill | return

    const query = {};
    if (customerId) query.customer = customerId;
    if (type) query.type = type;

    // Primary path: with populations
    const transactions = await CylinderTransaction.find(query)
      .populate("customer", "name phone address email")
      .populate("supplier", "companyName contactPerson phone email")
      .populate({
        path: "product",
        select: "name category cylinderSize",
        options: { strictPopulate: false }
      })
      .sort({ createdAt: -1 });

    console.log(`[cylinders][GET] Populated fetch OK. Count=${transactions.length} filter:`,
      { customerId: customerId || null, type: type || null });
    return NextResponse.json({ data: transactions });
  } catch (error) {
    // Fallback: return lean docs without populations so UI continues to work
    console.error("[cylinders][GET] Populated query failed, falling back to lean without populate.");
    console.error("[cylinders][GET] Error:", error?.message);
    console.error(error?.stack);
    try {
      // Attempt same filters on fallback
      const { searchParams } = new URL(request.url);
      const customerId = searchParams.get('customerId');
      const type = searchParams.get('type');
      const query = {};
      if (customerId) query.customer = customerId;
      if (type) query.type = type;

      const raw = await CylinderTransaction.find(query).sort({ createdAt: -1 }).lean();
      console.log(`[cylinders][GET] Fallback lean fetch OK. Count=${raw.length}`);

      // Attempt lightweight hydration so UI continues to display names
      const customerIds = [];
      const supplierIds = [];
      const productIds = [];
      for (const t of raw) {
        if (t.customer) customerIds.push(t.customer);
        if (t.supplier) supplierIds.push(t.supplier);
        if (t.product) productIds.push(t.product);
      }
      const uniq = (arr) => Array.from(new Set(arr.map(String)));
      const [uCustomers, uSuppliers, uProducts] = [uniq(customerIds), uniq(supplierIds), uniq(productIds)];

      let cMap = new Map();
      let sMap = new Map();
      let pMap = new Map();
      try {
        if (uCustomers.length) {
          const cs = await Customer.find({ _id: { $in: uCustomers } }).select("_id name phone email address").lean();
          cs.forEach((c) => cMap.set(String(c._id), c));
        }
      } catch (e) { console.warn("[cylinders][GET] Fallback: customer lookup failed:", e?.message); }
      try {
        if (uSuppliers.length) {
          const ss = await Supplier.find({ _id: { $in: uSuppliers } }).select("_id companyName contactPerson phone email").lean();
          ss.forEach((s) => sMap.set(String(s._id), s));
        }
      } catch (e) { console.warn("[cylinders][GET] Fallback: supplier lookup failed:", e?.message); }
      try {
        if (uProducts.length) {
          const ps = await (await import("@/models/Product")).default.find({ _id: { $in: uProducts } }).select("_id name category cylinderSize").lean();
          ps.forEach((p) => pMap.set(String(p._id), p));
        }
      } catch (e) { console.warn("[cylinders][GET] Fallback: product lookup failed:", e?.message); }

      const hydrated = raw.map((t) => ({
        ...t,
        customer: t.customer ? (cMap.get(String(t.customer)) || t.customer) : undefined,
        supplier: t.supplier ? (sMap.get(String(t.supplier)) || t.supplier) : undefined,
        product: t.product ? (pMap.get(String(t.product)) || t.product) : undefined,
      }));

      return NextResponse.json({ data: hydrated });
    } catch (fallbackErr) {
      console.error("[cylinders][GET] Fallback lean fetch also failed:", fallbackErr?.message);
      console.error(fallbackErr?.stack);
      return NextResponse.json(
        { error: "Failed to fetch cylinder transactions", details: fallbackErr?.message || "Unknown error" },
        { status: 500 }
      );
    }
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
    console.log('[cylinders][POST] Incoming payload:', data);
    // Validate customer/supplier depending on type
    if (data.type === 'refill') {
      if (data.supplier) {
        const supplier = await Supplier.findById(data.supplier);
        if (!supplier) {
          return NextResponse.json(
            { error: "Supplier not found" },
            { status: 404 }
          );
        }
      } else if (data.customer) {
        // Backward compatibility (legacy refill requests)
        const customer = await Customer.findById(data.customer);
        if (!customer) {
          return NextResponse.json(
            { error: "Customer not found" },
            { status: 404 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "Supplier is required for refill transactions" },
          { status: 400 }
        );
      }
    } else {
      // deposit/return require customer
      const customer = await Customer.findById(data.customer);
      if (!customer) {
        return NextResponse.json(
          { error: "Customer not found" },
          { status: 404 }
        );
      }
    }

    // Assign invoice number if not provided (sequential per year)
    if (!data.invoiceNumber) {
      data.invoiceNumber = await getNextCylinderInvoice()
    }

    // Enforce status rules similar to employee cylinders API
    const type = data.type;
    if (type === 'deposit') {
      // Deposits must start as pending regardless of client input
      data.status = 'pending'
    }
    if (type === 'return') {
      // Returns are immediately cleared
      data.status = 'cleared'
    }

    // Handle custom transaction date for deposits
    if (data.transactionDate && data.type === 'deposit') {
      // Convert date string to Date object and set as createdAt
      const customDate = new Date(data.transactionDate + 'T00:00:00.000Z')
      data.createdAt = customDate
      data.updatedAt = customDate
      console.log('[cylinders][POST] Using custom transaction date:', customDate.toISOString())
    }

    let transaction;
    try {
      transaction = await CylinderTransaction.create(data);
    } catch (e) {
      console.error('[cylinders][POST] Mongoose validation/creation error:', e?.message);
      if (e?.name === 'ValidationError') {
        return NextResponse.json(
          { error: 'Validation failed', details: e?.message },
          { status: 400 }
        );
      }
      // handle unique conflict: fetch a new sequence and retry once
      if (e?.code === 11000 && String(e?.keyPattern || {}).includes('invoiceNumber')) {
        data.invoiceNumber = await getNextCylinderInvoice()
        transaction = await CylinderTransaction.create(data)
      } else {
        throw e;
      }
    }

    // If this is a return linked to a deposit, update the deposit's status
    try {
      if (type === 'return' && data.linkedDeposit) {
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
      console.warn('[cylinders][POST] Linked deposit status update failed:', linkErr?.message);
    }

    const populatedTransaction = await CylinderTransaction.findById(transaction._id)
      .populate("customer", "name phone address email")
      .populate("supplier", "companyName contactPerson phone email")
      .populate("product", "name category cylinderSize");

    // Update daily cylinder tracking for deposits and returns
    if (populatedTransaction.type === 'deposit' || populatedTransaction.type === 'return') {
      await updateDailyCylinderTracking(populatedTransaction, false) // Admin transaction
    }

    return NextResponse.json(populatedTransaction, { status: 201 });
  } catch (error) {
    console.error("Cylinders POST error:", error);
    if (error?.name === 'CastError') {
      // Likely invalid ObjectId
      return NextResponse.json(
        { error: 'Invalid reference id', details: error?.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create cylinder transaction", details: error.message },
      { status: 500 }
    );
  }
}
