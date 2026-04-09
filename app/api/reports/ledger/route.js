import dbConnect from "@/lib/mongodb";
import Customer from "@/models/Customer";
import Sale from "@/models/Sale";
import CylinderTransaction from "@/models/Cylinder";
import EmployeeSale from "@/models/EmployeeSale";
import EmployeeCylinderTransaction from "@/models/EmployeeCylinderTransaction";
import { NextResponse } from "next/server";
import { normalizeSalePaymentState } from "@/lib/payment-status";

export async function GET(request) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const customerName = searchParams.get('customerName');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build customer query with comprehensive search
    let customerQuery = {};
    if (customerName) {
      // Search across multiple fields for better results
      customerQuery.$or = [
        { name: { $regex: customerName, $options: 'i' } },
        { phone: { $regex: customerName, $options: 'i' } },
        { email: { $regex: customerName, $options: 'i' } },
        { address: { $regex: customerName, $options: 'i' } },
        { trNumber: { $regex: customerName, $options: 'i' } }
      ];
    }

    // Get all customers
    const customers = await Customer.find(customerQuery).lean();

    // Get comprehensive data for each customer
    const buildDateFilter = () => {
      if (!startDate && !endDate) return undefined;

      const createdAt = {};
      if (startDate) createdAt.$gte = new Date(startDate);
      if (endDate) createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
      return createdAt;
    };

    const createdAtFilter = buildDateFilter();

    const customerLedgerData = await Promise.all(
      customers.map(async (customer) => {
        try {
          const salesQuery = {
            customer: customer._id,
            ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          };

          const adminSales = await Sale.find(salesQuery)
            .populate('items.product', 'name category')
            .lean();

          const employeeSales = await EmployeeSale.find(salesQuery)
            .populate('items.product', 'name category')
            .populate('employee', 'name')
            .lean();

          const normalizeLedgerSale = (sale, source) => {
            const normalizedPayment = normalizeSalePaymentState({
              totalAmount: sale.totalAmount,
              receivedAmount: sale.receivedAmount,
              paymentStatus: sale.paymentStatus,
            });

            return {
              ...sale,
              _saleSource: source,
              totalAmount: normalizedPayment.totalAmount,
              receivedAmount: normalizedPayment.receivedAmount,
              paymentStatus: normalizedPayment.paymentStatus,
              outstandingAmount: normalizedPayment.balance,
            };
          };

          const sales = [
            ...adminSales.map((sale) => normalizeLedgerSale(sale, 'admin')),
            ...employeeSales.map((sale) => normalizeLedgerSale(sale, 'employee')),
          ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

          let cylinderQuery = {
            customer: customer._id,
            $or: [
              { employee: { $exists: true } },
              { employee: { $exists: false } }
            ]
          };
          if (createdAtFilter) {
            cylinderQuery.createdAt = createdAtFilter;
          }

          const adminCylinderTransactions = await CylinderTransaction.find(cylinderQuery).lean();
          const employeeCylinderTransactions = await EmployeeCylinderTransaction.find(cylinderQuery)
            .populate('employee', 'name')
            .lean();

          const cylinderTransactions = [...adminCylinderTransactions, ...employeeCylinderTransactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

          const totalSalesAmount = sales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
          const totalPaidAmount = sales.reduce((sum, sale) => sum + (sale.receivedAmount || 0), 0);
          const totalSalesOutstanding = sales.reduce((sum, sale) => sum + (sale.outstandingAmount || 0), 0);
          const totalCylinderAmount = cylinderTransactions.reduce((sum, transaction) => sum + (transaction.amount || 0), 0);

          // Calculate transaction counts
          const totalSales = sales.length;
          const totalDeposits = cylinderTransactions.filter(t => t.type === 'deposit').length;
          const totalRefills = cylinderTransactions.filter(t => t.type === 'refill').length;
          const totalReturns = cylinderTransactions.filter(t => t.type === 'return').length;

          const balance = totalSalesOutstanding + totalCylinderAmount;
          const hasRecentTransactions = [...sales, ...cylinderTransactions].some(
            t => new Date(t.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days
          );

          // Check transaction statuses for more accurate status determination
          const pendingCylinderTransactions = cylinderTransactions.filter(t => t.status === 'pending').length;
          const clearedCylinderTransactions = cylinderTransactions.filter(t => t.status === 'cleared').length;
          const overdueCylinderTransactions = cylinderTransactions.filter(t => t.status === 'overdue').length;
          
          const pendingSales = sales.filter(s => s.paymentStatus !== 'cleared' && Number(s.outstandingAmount || 0) > 0).length;
          const clearedSales = sales.filter(s => s.paymentStatus === 'cleared').length;
          const overdueSales = sales.filter(s => s.paymentStatus === 'overdue').length;
          
          let overallStatus = 'cleared';
          
          if (overdueCylinderTransactions > 0 || overdueSales > 0) {
            overallStatus = 'overdue';
          } else if (pendingCylinderTransactions > 0 || pendingSales > 0) {
            overallStatus = 'pending';
          } else if (clearedCylinderTransactions > 0 || clearedSales > 0 || (sales.length === 0 && cylinderTransactions.length === 0)) {
            overallStatus = 'cleared';
          }

          let shouldInclude = true;
          if (status && status !== 'all') {
            const hasMatchingCylinderStatus = cylinderTransactions.some(t => t.status === status);
            const hasMatchingSalesStatus = status === 'pending'
              ? sales.some(s => s.paymentStatus !== 'cleared' && Number(s.outstandingAmount || 0) > 0)
              : sales.some(s => s.paymentStatus === status);
            const matchesOverallStatus = overallStatus === status;
            
            shouldInclude = matchesOverallStatus || hasMatchingCylinderStatus || hasMatchingSalesStatus;
          }

          if (!shouldInclude) {
            return null;
          }

          return {
            _id: customer._id,
            name: customer.name,
            trNumber: customer.trNumber,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
            balance: balance,
            totalDebit: customer.totalDebit || 0,
            totalCredit: customer.totalCredit || 0,
            status: overallStatus,
            
            totalSales,
            totalSalesAmount,
            totalPaidAmount,
            totalCylinderAmount,
            totalDeposits,
            totalRefills,
            totalReturns,
            
            hasRecentActivity: hasRecentTransactions,
            lastTransactionDate: [...sales, ...cylinderTransactions]
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]?.createdAt || null,
            
            recentSales: sales.map(sale => ({
              _id: sale._id,
              invoiceNumber: sale.invoiceNumber,
              totalAmount: sale.totalAmount,
              amountPaid: sale.receivedAmount,
              receivedAmount: sale.receivedAmount,
              outstandingAmount: sale.outstandingAmount,
              customerSignature: sale.customerSignature || "",
              paymentStatus: sale.paymentStatus,
              createdAt: sale.createdAt,
              items: sale.items,
              saleSource: sale._saleSource === 'employee' ? 'employee' : 'admin',
              employee: sale.employee ? {
                _id: sale.employee._id,
                name: sale.employee.name
              } : null
            })),
            
            recentCylinderTransactions: cylinderTransactions.map(transaction => ({
              _id: transaction._id,
              type: transaction.type,
              cylinderSize: transaction.cylinderSize,
              quantity: transaction.quantity,
              amount: transaction.amount,
              cashAmount: transaction.cashAmount || 0,
              customerSignature: transaction.customerSignature || "",
              status: transaction.status,
              createdAt: transaction.createdAt,
              invoiceNumber: transaction.invoiceNumber,
              transactionId: transaction.transactionId,
              transactionSource: transaction.employee ? 'employee' : 'admin',
              employee: transaction.employee ? {
                _id: transaction.employee._id,
                name: transaction.employee.name
              } : null
            }))
          };
        } catch (error) {
          console.error(`Error processing customer ${customer._id}:`, error);
          return {
            _id: customer._id,
            name: customer.name,
            trNumber: customer.trNumber,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
            balance: customer.balance || 0,
            status: 'error',
            error: 'Failed to load transaction data'
          };
        }
      })
    );

    // Filter out null results (customers that didn't match status filter)
    const filteredData = customerLedgerData.filter(customer => customer !== null);

    console.log(`Ledger API: Found ${customers.length} customers, filtered to ${filteredData.length} results`);
    console.log(`Filters applied: customerName=${customerName}, status=${status}, startDate=${startDate}, endDate=${endDate}`);

    return NextResponse.json({
      success: true,
      data: filteredData,
      total: filteredData.length,
      debug: {
        totalCustomers: customers.length,
        filteredResults: filteredData.length,
        appliedFilters: { customerName, status, startDate, endDate }
      },
      filters: {
        customerName,
        status,
        startDate,
        endDate
      }
    });

  } catch (error) {
    console.error("Ledger API error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to fetch ledger data", 
        details: error.message 
      },
      { status: 500 }
    );
  }
}
