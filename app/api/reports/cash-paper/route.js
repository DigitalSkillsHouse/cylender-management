import dbConnect from "@/lib/mongodb";
import { NextResponse } from "next/server";
import Sale from "@/models/Sale";
import CylinderTransaction from "@/models/Cylinder";
import EmployeeSale from "@/models/EmployeeSale";
import EmployeeCylinderTransaction from "@/models/EmployeeCylinderTransaction";
import Rental from "@/models/Rental";

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
    const depositCylinderSales = [];
    const returnCylinderSales = [];
    const rentalSales = [];

    let totalCredit = 0;
    let totalDebit = 0;
    let totalOther = 0;
    let totalDepositCylinder = 0;
    let totalReturnCylinder = 0;
    let totalRental = 0;
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

    // Aggregate cylinder transactions - separate deposits and returns
    for (const c of cylTxns) {
      const amount = Number(c.amount || c.depositAmount || c.refillAmount || c.returnAmount || 0);
      const rec = {
        _id: c._id,
        source: employeeId ? 'employee-cylinder' : 'admin-cylinder',
        invoiceNumber: c.invoiceNumber || '-', // Include invoice number for cylinder transactions
        employeeName: c?.employee?.name || (employeeId ? '-' : 'Admin'),
        customerName: c?.customer?.name || '-',
        totalAmount: amount,
        receivedAmount: Number(c.cashAmount || 0),
        paymentMethod: c.paymentMethod || 'cash',
        paymentStatus: c.status,
        createdAt: c.createdAt,
        type: c.type, // Include type to distinguish deposit/return
      };
      
      if (c.type === 'return') {
        // Return transactions
        returnCylinderSales.push(rec);
        totalReturnCylinder += rec.totalAmount;
        grandTotal += rec.totalAmount;
      } else {
        // Deposit and refill transactions
        depositCylinderSales.push(rec);
        totalDepositCylinder += rec.totalAmount;
        grandTotal += rec.totalAmount;
      }
    }

    // Fetch rental invoices for the given date (only for admin, not employees)
    // Use the 'date' field from Rental model, not 'createdAt'
    if (!employeeId) {
      const rentalQuery = { date: { $gte: start, $lte: end } };
      const rentals = await Rental.find(rentalQuery)
        .populate('customer', 'name companyName')
        .lean();
      
      for (const rental of rentals) {
        const rec = {
          _id: rental._id,
          source: 'rental',
          invoiceNumber: rental.rentalNumber || '-',
          employeeName: 'Admin',
          customerName: rental.customer?.name || rental.customer?.companyName || rental.customerName || '-',
          totalAmount: Number(rental.finalTotal || 0),
          receivedAmount: Number(rental.finalTotal || 0), // Rentals are typically paid in full
          paymentMethod: 'rental',
          paymentStatus: 'cleared',
          createdAt: rental.createdAt,
          subtotal: Number(rental.subtotal || 0),
          totalVat: Number(rental.totalVat || 0),
        };
        rentalSales.push(rec);
        totalRental += rec.totalAmount;
        grandTotal += rec.totalAmount;
      }
    }

    // Group other sales by payment method summary
    const otherByMethod = otherSales.reduce((acc, r) => {
      const k = r.paymentMethod || 'unknown';
      acc[k] = (acc[k] || 0) + (r.totalAmount || 0);
      return acc;
    }, {});

    // Calculate totalOther to include both otherSales and cylinder transactions
    const totalOtherIncludingCylinders = totalOther + totalDepositCylinder + totalReturnCylinder;

    return NextResponse.json({
      success: true,
      data: {
        date,
        employeeId: employeeId || null,
        counts: {
          credit: creditSales.length,
          debit: debitSales.length,
          other: otherSales.length,
          depositCylinder: depositCylinderSales.length,
          returnCylinder: returnCylinderSales.length,
          rental: rentalSales.length,
          total: gasSales.length + cylTxns.length + rentalSales.length,
        },
        creditSales,
        debitSales,
        otherSales,
        depositCylinderSales,
        returnCylinderSales,
        rentalSales,
        otherByMethod,
        totals: {
          totalCredit,
          totalDebit,
          totalOther: totalOtherIncludingCylinders,
          totalDepositCylinder,
          totalReturnCylinder,
          totalRental,
          grandTotal,
        },
      },
    });
  } catch (error) {
    console.error('Cash Paper API error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch cash paper data', details: error?.message }, { status: 500 });
  }
}
