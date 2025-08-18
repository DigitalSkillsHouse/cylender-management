import dbConnect from "@/lib/mongodb";
import { NextResponse } from "next/server";
import Sale from "@/models/Sale";
import CylinderTransaction from "@/models/Cylinder";
import EmployeeSale from "@/models/EmployeeSale";
import EmployeeCylinderTransaction from "@/models/EmployeeCylinderTransaction";

export async function GET(request) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date"); // YYYY-MM-DD
    const employeeId = searchParams.get("employeeId"); // optional

    if (!date) {
      return NextResponse.json({ success: false, error: "Missing required 'date' (YYYY-MM-DD)" }, { status: 400 });
    }

    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);

    // Decide sources based on scope
    // - If employeeId present: use employee collections only (EmployeeSale, EmployeeCylinderTransaction)
    // - Else (admin scope): use admin collections only (Sale, CylinderTransaction)
    const baseQuery = { createdAt: { $gte: start, $lte: end } };
    let gasSales = [];
    let cylTxns = [];
    if (employeeId) {
      gasSales = await EmployeeSale.find({ ...baseQuery, employee: employeeId })
        .populate('employee', 'name email')
        .populate('customer', 'name')
        .lean();
      cylTxns = await EmployeeCylinderTransaction.find({ ...baseQuery, employee: employeeId })
        .populate('employee', 'name email')
        .populate('customer', 'name')
        .lean();
    } else {
      gasSales = await Sale.find(baseQuery)
        .populate('customer', 'name')
        .lean();
      cylTxns = await CylinderTransaction.find(baseQuery)
        .populate('customer', 'name')
        .lean();
    }

    const creditSales = [];
    const debitSales = [];
    const otherSales = [];

    let totalCredit = 0;
    let totalDebit = 0;
    let totalOther = 0;
    let grandTotal = 0;

    // Aggregate gas sales first
    for (const s of gasSales) {
      const rec = {
        _id: s._id,
        source: employeeId ? 'employee-gas' : 'admin-gas',
        invoiceNumber: s.invoiceNumber,
        employeeName: s?.employee?.name || (employeeId ? '-' : 'Admin'),
        customerName: s?.customer?.name || '-',
        totalAmount: Number(s.totalAmount || 0),
        receivedAmount: Number(s.receivedAmount || 0),
        paymentMethod: s.paymentMethod,
        paymentStatus: s.paymentStatus,
        createdAt: s.createdAt,
      };
      grandTotal += rec.totalAmount;
      if (s.paymentMethod === 'credit') {
        creditSales.push(rec);
        totalCredit += rec.totalAmount;
      } else if (s.paymentMethod === 'debit') {
        debitSales.push(rec);
        totalDebit += rec.totalAmount;
      } else {
        otherSales.push(rec);
        totalOther += rec.totalAmount;
      }
    }

    // Aggregate cylinder transactions (count into 'other' by payment method)
    for (const c of cylTxns) {
      const amount = Number(c.amount || c.depositAmount || c.refillAmount || c.returnAmount || 0);
      const rec = {
        _id: c._id,
        source: employeeId ? 'employee-cylinder' : 'admin-cylinder',
        employeeName: c?.employee?.name || (employeeId ? '-' : 'Admin'),
        customerName: c?.customer?.name || '-',
        totalAmount: amount,
        receivedAmount: Number(c.cashAmount || 0),
        paymentMethod: c.paymentMethod || 'cash',
        paymentStatus: c.status,
        createdAt: c.createdAt,
      };
      grandTotal += rec.totalAmount;
      // Cylinder txns don't use credit/debit enums; bucket them as other by method (cash/cheque)
      otherSales.push(rec);
      totalOther += rec.totalAmount;
    }

    // Group other sales by payment method summary
    const otherByMethod = otherSales.reduce((acc, r) => {
      const k = r.paymentMethod || 'unknown';
      acc[k] = (acc[k] || 0) + (r.totalAmount || 0);
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      data: {
        date,
        employeeId: employeeId || null,
        counts: {
          credit: creditSales.length,
          debit: debitSales.length,
          other: otherSales.length,
          total: gasSales.length + cylTxns.length,
        },
        creditSales,
        debitSales,
        otherSales,
        otherByMethod,
        totals: {
          totalCredit,
          totalDebit,
          totalOther,
          grandTotal,
        },
      },
    });
  } catch (error) {
    console.error('Cash Paper API error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch cash paper data', details: error?.message }, { status: 500 });
  }
}
