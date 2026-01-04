import dbConnect from "@/lib/mongodb";
import { NextResponse } from "next/server";
import Sale from "@/models/Sale";
import CylinderTransaction from "@/models/Cylinder";
import EmployeeSale from "@/models/EmployeeSale";
import EmployeeCylinderTransaction from "@/models/EmployeeCylinderTransaction";
import Rental from "@/models/Rental";
import { getDateRangeForPeriod } from "@/lib/date-utils";

// Helper function to round to 2 decimal places to avoid floating-point precision errors
// Use this for calculations only
const roundToTwo = (value) => {
  if (value === null || value === undefined || isNaN(value)) {
    return 0;
  }
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
};

// Helper function to preserve exact decimal values (truncate to 2 decimals without rounding)
// Use this for preserving exact values from database
// This ensures 15.71 stays as 15.71, not rounded to 15.75
const preserveDecimal = (value) => {
  if (value === null || value === undefined || isNaN(value)) {
    return 0;
  }
  // Truncate to 2 decimal places without rounding
  // Multiply by 100, truncate (Math.trunc), then divide by 100
  // This preserves exact decimals like 15.71 instead of rounding
  const num = Number(value);
  return Math.trunc(num * 100) / 100;
};

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
        totalAmount: preserveDecimal(s.totalAmount || 0), // Preserve exact decimal value from database
        receivedAmount: preserveDecimal(s.receivedAmount || 0), // Preserve exact decimal value from database
        paymentMethod: s.paymentMethod,
        paymentStatus: s.paymentStatus,
        createdAt: s.createdAt,
      };
      grandTotal = roundToTwo(grandTotal + rec.totalAmount);
      if (s.paymentMethod === 'credit') {
        creditSales.push(rec);
        totalCredit = roundToTwo(totalCredit + rec.totalAmount);
      } else if (s.paymentMethod === 'debit') {
        debitSales.push(rec);
        totalDebit = roundToTwo(totalDebit + rec.totalAmount);
      } else {
        otherSales.push(rec);
        totalOther = roundToTwo(totalOther + rec.totalAmount);
      }
    }

    // Aggregate cylinder transactions - separate deposits and returns
    for (const c of cylTxns) {
      // Determine if this is an employee transaction or admin transaction
      const isEmployeeTransaction = c._isEmployeeTransaction || !!c.employee;
      const amount = preserveDecimal(c.amount || c.depositAmount || c.refillAmount || c.returnAmount || 0); // Preserve exact decimal value
      const rec = {
        _id: c._id,
        source: employeeId ? 'employee-cylinder' : (isEmployeeTransaction ? 'employee-cylinder' : 'admin-cylinder'),
        invoiceNumber: c.invoiceNumber || '-', // Include invoice number for cylinder transactions
        employeeName: c?.employee?.name || (employeeId ? '-' : (isEmployeeTransaction ? 'Employee' : 'Admin')),
        customerName: c?.customer?.name || '-',
        totalAmount: amount,
        receivedAmount: preserveDecimal(c.cashAmount || 0), // Preserve exact decimal value from database
        paymentMethod: c.paymentMethod || 'cash',
        paymentStatus: c.status,
        createdAt: c.createdAt,
        type: c.type, // Include type to distinguish deposit/return
      };
      
      if (c.type === 'return') {
        // Return transactions - show in cash paper but don't include in grand total
        returnCylinderSales.push(rec);
        totalReturnCylinder = roundToTwo(totalReturnCylinder + rec.totalAmount);
        // grandTotal += rec.totalAmount; // Excluded from grand total as per requirement
      } else if (c.type === 'deposit') {
        // Deposit transactions - show in cash paper but don't include in grand total
        depositCylinderSales.push(rec);
        totalDepositCylinder = roundToTwo(totalDepositCylinder + rec.totalAmount);
        // grandTotal += rec.totalAmount; // Excluded from grand total as per requirement
      } else {
        // Refill transactions - include in grand total
        depositCylinderSales.push(rec);
        totalDepositCylinder = roundToTwo(totalDepositCylinder + rec.totalAmount);
        grandTotal = roundToTwo(grandTotal + rec.totalAmount);
      }
    }

    // Fetch rental invoices for the given date
    // Use the 'date' field from Rental model, not 'createdAt'
    // Note: Rental model doesn't have an employee field, so show all rentals for both admin and employee views
    // Employees can see all rentals in the system since they can create rentals via rental-collection page
    const rentalQuery = { date: { $gte: start, $lte: end } };
    const rentals = await Rental.find(rentalQuery)
      .populate('customer', 'name companyName')
      .lean();
    
    for (const rental of rentals) {
      const rec = {
        _id: rental._id,
        source: 'rental',
        invoiceNumber: rental.rentalNumber || '-',
        employeeName: employeeId ? 'Employee' : 'Admin', // Show appropriate label based on view
        customerName: rental.customer?.name || rental.customer?.companyName || rental.customerName || '-',
        totalAmount: preserveDecimal(rental.finalTotal || 0), // Preserve exact decimal value from database
        receivedAmount: preserveDecimal(rental.finalTotal || 0), // Preserve exact decimal value from database
        paymentMethod: 'rental',
        paymentStatus: 'cleared',
        createdAt: rental.createdAt || rental.date,
        subtotal: preserveDecimal(rental.subtotal || 0), // Preserve exact decimal value from database
        totalVat: preserveDecimal(rental.totalVat || 0), // Preserve exact decimal value from database
      };
      rentalSales.push(rec);
      totalRental = roundToTwo(totalRental + rec.totalAmount);
      grandTotal = roundToTwo(grandTotal + rec.totalAmount);
    }

    // Group other sales by payment method summary
    const otherByMethod = otherSales.reduce((acc, r) => {
      const k = r.paymentMethod || 'unknown';
      acc[k] = roundToTwo((acc[k] || 0) + (r.totalAmount || 0));
      return acc;
    }, {});

    // Calculate total VAT
    // Note: Employee sales now include VAT in totalAmount, so we need to extract it
    // VAT = totalAmount / 1.05 * 0.05 for sales that include VAT
    // For admin sales: totalAmount includes VAT, so VAT = totalAmount - (totalAmount / 1.05)
    // For employee sales: totalAmount now includes VAT (after our fix), so same calculation
    // Cylinder deposits/returns don't have VAT
    const totalSalesAmount = roundToTwo(totalCredit + totalDebit + totalOther);
    const salesSubtotal = roundToTwo(totalSalesAmount / 1.05); // Extract subtotal (remove VAT)
    const totalVatFromSales = roundToTwo(totalSalesAmount - salesSubtotal); // Calculate VAT amount
    const totalVatFromRentals = roundToTwo(rentalSales.reduce((sum, r) => sum + roundToTwo(r.totalVat || 0), 0));
    const totalVat = roundToTwo(totalVatFromSales + totalVatFromRentals);

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
          totalCredit: roundToTwo(totalCredit),
          totalDebit: roundToTwo(totalDebit),
          totalOther: roundToTwo(totalOther), // Only other sales, NOT including cylinder deposits/returns
          totalDepositCylinder: roundToTwo(totalDepositCylinder),
          totalReturnCylinder: roundToTwo(totalReturnCylinder),
          totalRental: roundToTwo(totalRental),
          totalVat: roundToTwo(totalVat), // Total VAT amount
          grandTotal: roundToTwo(grandTotal),
        },
      },
    });
  } catch (error) {
    console.error('Cash Paper API error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch cash paper data', details: error?.message }, { status: 500 });
  }
}
