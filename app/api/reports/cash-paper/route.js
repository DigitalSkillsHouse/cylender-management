import dbConnect from "@/lib/mongodb";
import { NextResponse } from "next/server";
import Sale from "@/models/Sale";
import CylinderTransaction from "@/models/Cylinder";
import EmployeeSale from "@/models/EmployeeSale";
import EmployeeCylinderTransaction from "@/models/EmployeeCylinderTransaction";
import Rental from "@/models/Rental";
import { getDateRangeForPeriod } from "@/lib/date-utils";

export async function GET(request) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get("fromDate"); // YYYY-MM-DD
    const toDate = searchParams.get("toDate"); // YYYY-MM-DD
    const employeeId = searchParams.get("employeeId"); // optional

    if (!fromDate || !toDate) {
      return NextResponse.json({ success: false, error: "Missing required 'fromDate' and 'toDate' (YYYY-MM-DD)" }, { status: 400 });
    }

    if (fromDate > toDate) {
      return NextResponse.json({ success: false, error: "From Date cannot be greater than To Date" }, { status: 400 });
    }

    // Create date range in Dubai timezone (UTC+4)
    // This ensures we get the full day range based on Dubai timezone
    const { start, end } = getDateRangeForPeriod(fromDate, toDate);

    // Decide sources based on scope
    // - If employeeId present: use employee collections only (EmployeeSale, EmployeeCylinderTransaction)
    // - Else (admin scope): use BOTH admin and employee collections to show all invoices
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
      // Admin scope: fetch from both admin and employee collections to show all invoices
      const [adminGasSales, employeeGasSales, adminCylTxns, employeeCylTxns] = await Promise.all([
        Sale.find(baseQuery)
          .populate('customer', 'name')
          .lean(),
        EmployeeSale.find(baseQuery)
          .populate('employee', 'name email')
          .populate('customer', 'name')
          .lean(),
        CylinderTransaction.find(baseQuery)
          .populate('customer', 'name')
          .lean(),
        EmployeeCylinderTransaction.find(baseQuery)
          .populate('employee', 'name email')
          .populate('customer', 'name')
          .lean()
      ]);
      
      // Combine admin and employee sales, marking their source
      gasSales = [
        ...adminGasSales.map(s => ({ ...s, _isEmployeeSale: false })),
        ...employeeGasSales.map(s => ({ ...s, _isEmployeeSale: true }))
      ];
      cylTxns = [
        ...adminCylTxns.map(c => ({ ...c, _isEmployeeTransaction: false })),
        ...employeeCylTxns.map(c => ({ ...c, _isEmployeeTransaction: true }))
      ];
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
      // Determine if this is an employee sale or admin sale
      const isEmployeeSale = s._isEmployeeSale || !!s.employee;
      const rec = {
        _id: s._id,
        source: employeeId ? 'employee-gas' : (isEmployeeSale ? 'employee-gas' : 'admin-gas'),
        invoiceNumber: s.invoiceNumber,
        employeeName: s?.employee?.name || (employeeId ? '-' : (isEmployeeSale ? 'Employee' : 'Admin')),
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
      // Determine if this is an employee transaction or admin transaction
      const isEmployeeTransaction = c._isEmployeeTransaction || !!c.employee;
      const amount = Number(c.amount || c.depositAmount || c.refillAmount || c.returnAmount || 0);
      const rec = {
        _id: c._id,
        source: employeeId ? 'employee-cylinder' : (isEmployeeTransaction ? 'employee-cylinder' : 'admin-cylinder'),
        invoiceNumber: c.invoiceNumber || '-', // Include invoice number for cylinder transactions
        employeeName: c?.employee?.name || (employeeId ? '-' : (isEmployeeTransaction ? 'Employee' : 'Admin')),
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

    // Fetch rental invoices for the given date
    // Use the 'date' field from Rental model, not 'createdAt'
    // Note: Rental model doesn't have an employee field, so rentals are admin-only
    // When employeeId is provided, skip rentals since they can't be associated with employees
    let rentals = [];
    if (!employeeId) {
      // Only fetch rentals for admin view (no employee filter)
      const rentalQuery = { date: { $gte: start, $lte: end } };
      rentals = await Rental.find(rentalQuery)
        .populate('customer', 'name companyName')
        .lean();
    }
    
    for (const rental of rentals) {
      const rec = {
        _id: rental._id,
        source: 'rental',
        invoiceNumber: rental.rentalNumber || '-',
        employeeName: 'Admin', // Rentals are admin-only since model doesn't have employee field
        customerName: rental.customer?.name || rental.customer?.companyName || rental.customerName || '-',
        totalAmount: Number(rental.finalTotal || 0),
        receivedAmount: Number(rental.finalTotal || 0), // Rentals are typically paid in full
        paymentMethod: 'rental',
        paymentStatus: 'cleared',
        createdAt: rental.createdAt || rental.date,
        subtotal: Number(rental.subtotal || 0),
        totalVat: Number(rental.totalVat || 0),
      };
      rentalSales.push(rec);
      totalRental += rec.totalAmount;
      grandTotal += rec.totalAmount;
    }

    // Group other sales by payment method summary
    const otherByMethod = otherSales.reduce((acc, r) => {
      const k = r.paymentMethod || 'unknown';
      acc[k] = (acc[k] || 0) + (r.totalAmount || 0);
      return acc;
    }, {});

    // Calculate total VAT
    // Note: Employee sales now include VAT in totalAmount, so we need to extract it
    // VAT = totalAmount / 1.05 * 0.05 for sales that include VAT
    // For admin sales: totalAmount includes VAT, so VAT = totalAmount - (totalAmount / 1.05)
    // For employee sales: totalAmount now includes VAT (after our fix), so same calculation
    // Cylinder deposits/returns don't have VAT
    const salesSubtotal = (totalCredit + totalDebit + totalOther) / 1.05; // Extract subtotal (remove VAT)
    const totalVatFromSales = (totalCredit + totalDebit + totalOther) - salesSubtotal; // Calculate VAT amount
    const totalVatFromRentals = rentalSales.reduce((sum, r) => sum + (Number(r.totalVat || 0)), 0);
    const totalVat = totalVatFromSales + totalVatFromRentals;

    return NextResponse.json({
      success: true,
      data: {
        fromDate,
        toDate,
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
          totalOther, // Only other sales, NOT including cylinder deposits/returns
          totalDepositCylinder,
          totalReturnCylinder,
          totalRental,
          totalVat, // Total VAT amount
          grandTotal,
        },
      },
    });
  } catch (error) {
    console.error('Cash Paper API error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch cash paper data', details: error?.message }, { status: 500 });
  }
}
