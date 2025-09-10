import dbConnect from "@/lib/mongodb";
import Customer from "@/models/Customer";
import Sale from "@/models/Sale";
import CylinderTransaction from "@/models/Cylinder";
import EmployeeSale from "@/models/EmployeeSale";
import EmployeeCylinderTransaction from "@/models/EmployeeCylinderTransaction";
import { NextResponse } from "next/server";

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
    const customerLedgerData = await Promise.all(
      customers.map(async (customer) => {
        try {
          // Get sales data for this customer
          let salesQuery = {
            customer: customer._id,
            $or: [
              { employee: { $exists: true } },
              { employee: { $exists: false } }
            ]
          };
          if (startDate || endDate) {
            salesQuery.createdAt = {};
            if (startDate) salesQuery.createdAt.$gte = new Date(startDate);
            if (endDate) salesQuery.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
          }

          const adminSales = await Sale.find(salesQuery)
            .populate('items.product', 'name category')
            .lean();

          const employeeSales = await EmployeeSale.find(salesQuery)
            .populate('items.product', 'name category')
            .populate('employee', 'name')
            .lean();

          // Merge admin and employee sales; preserve a flag to identify the origin
          const sales = [
            ...adminSales.map(s => ({ ...s, _saleSource: 'admin' })),
            ...employeeSales.map(s => ({ ...s, _saleSource: 'employee' })),
          ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

          // Get cylinder transactions for this customer
          let cylinderQuery = {
            customer: customer._id,
            $or: [
              { employee: { $exists: true } },
              { employee: { $exists: false } }
            ]
          };
          if (startDate || endDate) {
            cylinderQuery.createdAt = {};
            if (startDate) cylinderQuery.createdAt.$gte = new Date(startDate);
            if (endDate) cylinderQuery.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
          }

          const adminCylinderTransactions = await CylinderTransaction.find(cylinderQuery).lean();
          const employeeCylinderTransactions = await EmployeeCylinderTransaction.find(cylinderQuery)
            .populate('employee', 'name')
            .lean();

          const cylinderTransactions = [...adminCylinderTransactions, ...employeeCylinderTransactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

          // Calculate totals
          const totalSalesAmount = sales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
          const totalPaidAmount = sales.reduce((sum, sale) => sum + (sale.receivedAmount || 0), 0);
          const totalCylinderAmount = cylinderTransactions.reduce((sum, transaction) => sum + (transaction.amount || 0), 0);

          // Calculate transaction counts
          const totalSales = sales.length;
          const totalDeposits = cylinderTransactions.filter(t => t.type === 'deposit').length;
          const totalRefills = cylinderTransactions.filter(t => t.type === 'refill').length;
          const totalReturns = cylinderTransactions.filter(t => t.type === 'return').length;

          // Calculate balance as total of all paid amounts from transactions
          const balance = totalPaidAmount + totalCylinderAmount;
          const hasRecentTransactions = [...sales, ...cylinderTransactions].some(
            t => new Date(t.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days
          );

          // Check transaction statuses for more accurate status determination
          const pendingTransactions = cylinderTransactions.filter(t => t.status === 'pending').length;
          const clearedTransactions = cylinderTransactions.filter(t => t.status === 'cleared').length;
          const overdueTransactions = cylinderTransactions.filter(t => t.status === 'overdue').length;
          
          // Determine overall status with improved logic
          let overallStatus = 'cleared';
          
          // Priority: overdue > pending > cleared
          if (overdueTransactions > 0 || balance < -100) { // Significant negative balance
            overallStatus = 'overdue';
          } else if (pendingTransactions > 0 || balance > 0) {
            overallStatus = 'pending';
          } else if (clearedTransactions > 0 || balance === 0) {
            overallStatus = 'cleared';
          }

          // Improved status filtering - check if customer has any matching transactions
          let shouldInclude = true;
          if (status && status !== 'all') {
            // Check if customer matches the status filter in multiple ways:
            // 1. Overall customer status matches
            // 2. Has transactions with the requested status
            // 3. Has sales/transactions that could be relevant to the status
            const hasMatchingTransactionStatus = cylinderTransactions.some(t => t.status === status);
            const matchesOverallStatus = overallStatus === status;
            
            shouldInclude = matchesOverallStatus || hasMatchingTransactionStatus;
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
            
            // Transaction summaries
            totalSales,
            totalSalesAmount,
            totalPaidAmount,
            totalCylinderAmount,
            totalDeposits,
            totalRefills,
            totalReturns,
            
            // Recent activity
            hasRecentActivity: hasRecentTransactions,
            lastTransactionDate: [...sales, ...cylinderTransactions]
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]?.createdAt || null,
            
            // Detailed transactions for drill-down
            recentSales: sales.map(sale => ({
              _id: sale._id,
              invoiceNumber: sale.invoiceNumber,
              totalAmount: sale.totalAmount,
              // For UI convenience
              amountPaid: sale.receivedAmount,
              receivedAmount: sale.receivedAmount,
              paymentStatus: sale.paymentStatus, // Use the transaction's own status
              createdAt: sale.createdAt,
              items: sale.items,
              // Flag to distinguish which API to call when updating payment
              saleSource: sale._saleSource === 'employee' ? 'employee' : 'admin'
            })),
            
            recentCylinderTransactions: cylinderTransactions.slice(0, 5).map(transaction => ({
              _id: transaction._id,
              type: transaction.type,
              cylinderSize: transaction.cylinderSize,
              quantity: transaction.quantity,
              amount: transaction.amount,
              status: transaction.status,
              createdAt: transaction.createdAt
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
