import dbConnect from "@/lib/mongodb";
import Customer from "@/models/Customer";
import Sale from "@/models/Sale";
import EmployeeSale from "@/models/EmployeeSale";
import CylinderTransaction from "@/models/Cylinder";
import EmployeeCylinderTransaction from "@/models/EmployeeCylinderTransaction";
import User from "@/models/User";
import Product from "@/models/Product";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await dbConnect();

    // Get all basic counts and transaction data
    const [
      totalCustomers,
      totalEmployees,
      totalProducts,
      adminSales,
      employeeSales,
      adminCylinderTransactions,
      employeeCylinderTransactions
    ] = await Promise.all([
      Customer.countDocuments(),
      User.countDocuments({ role: 'employee' }),
      Product.countDocuments(),
      Sale.find({}).populate('items.product').lean(),
      EmployeeSale.find({}).populate('items.product').lean(),
      CylinderTransaction.find({}).lean(),
      EmployeeCylinderTransaction.find({}).lean()
    ]);

    // Combine all sales for calculations
    const allSales = [...adminSales, ...employeeSales];
    const allCylinderTransactions = [...adminCylinderTransactions, ...employeeCylinderTransactions];

    // Calculate revenue from all sales (admin + employee)
    const adminSalesRevenue = adminSales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
    const employeeSalesRevenue = employeeSales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
    const totalSalesRevenue = adminSalesRevenue + employeeSalesRevenue;

    // Calculate cylinder revenue (deposits from admin + employee)
    const adminCylinderRevenue = adminCylinderTransactions
      .filter(t => t.type === 'deposit')
      .reduce((sum, transaction) => sum + (transaction.amount || 0), 0);
    const employeeCylinderRevenue = employeeCylinderTransactions
      .filter(t => t.type === 'deposit')
      .reduce((sum, transaction) => sum + (transaction.amount || 0), 0);
    const totalCylinderRevenue = adminCylinderRevenue + employeeCylinderRevenue;

    // Total combined revenue
    const totalRevenue = totalSalesRevenue + totalCylinderRevenue;

    // Calculate gas sales count (number of gas sales transactions)
    const gasSales = allSales.length;

    // Calculate cylinder statistics
    const cylinderRefills = allCylinderTransactions.filter(t => t.type === 'refill').length;
    const cylinderDeposits = allCylinderTransactions.filter(t => t.type === 'deposit').length;
    const cylinderReturns = allCylinderTransactions.filter(t => t.type === 'return').length;


    // Get recent activity (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const recentSales = allSales.filter(sale => 
      new Date(sale.createdAt) > thirtyDaysAgo
    ).length;
    
    const recentCylinderTransactions = allCylinderTransactions.filter(transaction => 
      new Date(transaction.createdAt) > thirtyDaysAgo
    ).length;

    // Calculate monthly trends (last 6 months)
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date();
      monthStart.setMonth(monthStart.getMonth() - i);
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      monthEnd.setDate(0);
      monthEnd.setHours(23, 59, 59, 999);

      const monthSales = allSales.filter(sale => {
        const saleDate = new Date(sale.createdAt);
        return saleDate >= monthStart && saleDate <= monthEnd;
      });

      const monthCylinderTransactions = allCylinderTransactions.filter(transaction => {
        const transactionDate = new Date(transaction.createdAt);
        return transactionDate >= monthStart && transactionDate <= monthEnd;
      });

      const monthRevenue = monthSales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
      const monthCylinderRevenue = monthCylinderTransactions
        .filter(t => t.type === 'deposit')
        .reduce((sum, transaction) => 
        sum + (transaction.amount || 0), 0
      );

      monthlyData.push({
        month: monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        sales: monthSales.length,
        revenue: monthRevenue,
        cylinderTransactions: monthCylinderTransactions.length,
        cylinderRevenue: monthCylinderRevenue,
        totalRevenue: monthRevenue + monthCylinderRevenue
      });
    }

    // Get top customers by transaction volume
    const customerStats = await Customer.aggregate([
      {
        $lookup: {
          from: 'sales',
          localField: '_id',
          foreignField: 'customer',
          as: 'sales'
        }
      },
      {
        $lookup: {
          from: 'cylindertransactions',
          localField: '_id',
          foreignField: 'customer',
          as: 'cylinderTransactions'
        }
      },
      {
        $addFields: {
          totalTransactions: { $add: [{ $size: '$sales' }, { $size: '$cylinderTransactions' }] },
          totalSalesAmount: { $sum: '$sales.totalAmount' },
          totalCylinderAmount: { 
            $sum: { 
              $map: { 
                input: { 
                  $filter: { 
                    input: '$cylinderTransactions', 
                    as: 'txn', 
                    cond: { $eq: ['$$txn.type', 'deposit'] } 
                  } 
                }, 
                as: 'filteredTxn', 
                in: '$$filteredTxn.amount' 
              } 
            } 
          },
          totalAmount: { 
            $add: [
              { $sum: '$sales.totalAmount' }, 
              { 
                $sum: { 
                  $map: { 
                    input: { 
                      $filter: { 
                        input: '$cylinderTransactions', 
                        as: 'txn', 
                        cond: { $eq: ['$$txn.type', 'deposit'] } 
                      } 
                    }, 
                    as: 'filteredTxn', 
                    in: '$$filteredTxn.amount' 
                  } 
                } 
              }
            ] 
          }
        }
      },
      {
        $sort: { totalAmount: -1 }
      },
      {
        $limit: 5
      },
      {
        $project: {
          name: 1,
          totalTransactions: 1,
          totalAmount: 1,
          balance: 1
        }
      }
    ]);

    // Calculate customer status breakdown based on actual transaction payment status
    const allCustomers = await Customer.find({}).lean();
    let pendingCustomersCount = 0;
    let clearedCustomersCount = 0;
    let overdueCustomersCount = 0;

    for (const customer of allCustomers) {
      // Get all transactions for this customer
      const customerAdminSales = adminSales.filter(sale => sale.customer?.toString() === customer._id.toString());
      const customerEmployeeSales = employeeSales.filter(sale => sale.customer?.toString() === customer._id.toString());
      const customerAdminCylinders = adminCylinderTransactions.filter(txn => txn.customer?.toString() === customer._id.toString());
      const customerEmployeeCylinders = employeeCylinderTransactions.filter(txn => txn.customer?.toString() === customer._id.toString());

      const allCustomerTransactions = [
        ...customerAdminSales,
        ...customerEmployeeSales,
        ...customerAdminCylinders,
        ...customerEmployeeCylinders
      ];

      if (allCustomerTransactions.length === 0) {
        // Customer with no transactions - consider as cleared
        clearedCustomersCount++;
        continue;
      }

      // Check if customer has any pending transactions
      const hasPendingTransactions = allCustomerTransactions.some(txn => {
        // For sales, check paymentStatus
        if (txn.paymentStatus) {
          return txn.paymentStatus === 'pending' || txn.paymentStatus === 'overdue';
        }
        // For cylinder transactions, check status
        if (txn.status) {
          return txn.status === 'pending' || txn.status === 'overdue';
        }
        // Default to pending if no status field
        return true;
      });

      const hasOverdueTransactions = allCustomerTransactions.some(txn => {
        if (txn.paymentStatus) {
          return txn.paymentStatus === 'overdue';
        }
        if (txn.status) {
          return txn.status === 'overdue';
        }
        return false;
      });

      if (hasOverdueTransactions) {
        overdueCustomersCount++;
      } else if (hasPendingTransactions) {
        pendingCustomersCount++;
      } else {
        clearedCustomersCount++;
      }
    }

    console.log('Customer status breakdown:', {
      total: allCustomers.length,
      pending: pendingCustomersCount,
      cleared: clearedCustomersCount,
      overdue: overdueCustomersCount
    });

    // Ensure all values are numbers and not null/undefined
    const stats = {
      // Basic counts
      totalCustomers: Number(totalCustomers) || 0,
      totalEmployees: Number(totalEmployees) || 0,
      totalProducts: Number(totalProducts) || 0,
      totalSales: Number(allSales.length) || 0,
      
      // Financial data
      totalRevenue: Number(totalRevenue) || 0,
      totalSalesRevenue: Number(totalSalesRevenue) || 0,
      cylinderRevenue: Number(totalCylinderRevenue) || 0,
      totalCombinedRevenue: Number(totalRevenue) || 0,
      
      // Activity data
      gasSales: Number(gasSales) || 0,
      cylinderRefills: Number(cylinderRefills) || 0,
      cylinderDeposits: Number(cylinderDeposits) || 0,
      cylinderReturns: Number(cylinderReturns) || 0,
      totalCylinderTransactions: Number(allCylinderTransactions.length) || 0,
      
      // Recent activity
      recentSales: Number(recentSales) || 0,
      recentCylinderTransactions: Number(recentCylinderTransactions) || 0,
      
      // Trends and analytics
      monthlyData: monthlyData || [],
      topCustomers: customerStats || [],
      
      // Additional metrics
      averageSaleAmount: allSales.length > 0 ? Number(totalSalesRevenue / allSales.length) || 0 : 0,
      averageCylinderAmount: allCylinderTransactions.length > 0 ? Number(totalCylinderRevenue / allCylinderTransactions.length) || 0 : 0,
      
      // Status breakdown - based on actual transaction payment status
      pendingCustomers: Number(pendingCustomersCount) || 0,
      overdueCustomers: Number(overdueCustomersCount) || 0,
      clearedCustomers: Number(clearedCustomersCount) || 0
    };

    console.log('Reports stats response:', stats);
    return NextResponse.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error("Reports Stats API error:", error);
    // Return default zero values when there's an error to ensure frontend displays 0 values
    return NextResponse.json({
      success: true,
      data: {
        // Basic counts
        totalCustomers: 0,
        totalEmployees: 0,
        totalProducts: 0,
        totalSales: 0,
        
        // Financial data
        totalRevenue: 0,
        totalPaid: 0,
        totalPending: 0,
        cylinderRevenue: 0,
        totalCombinedRevenue: 0,
        
        // Activity data
        gasSales: 0,
        cylinderRefills: 0,
        cylinderDeposits: 0,
        cylinderReturns: 0,
        totalCylinderTransactions: 0,
        
        // Recent activity
        recentSales: 0,
        recentCylinderTransactions: 0,
        
        // Trends and analytics
        monthlyData: [],
        topCustomers: [],
        
        // Additional metrics
        averageSaleAmount: 0,
        averageCylinderAmount: 0,
        
        // Status breakdown
        pendingCustomers: 0,
        overdueCustomers: 0,
        clearedCustomers: 0
      },
      error: "Failed to fetch stats data - showing default values"
    }, { status: 200 }); // Return 200 status so frontend can still show 0 values
  }
}
