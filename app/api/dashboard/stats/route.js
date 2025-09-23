import dbConnect from "@/lib/mongodb"
import Sale from "@/models/Sale"
import EmployeeSale from "@/models/EmployeeSale"
import Customer from "@/models/Customer"
import User from "@/models/User"
import Product from "@/models/Product"
import CylinderTransaction from "@/models/Cylinder"
import EmployeeCylinderTransaction from "@/models/EmployeeCylinderTransaction"
import InactiveCustomerView from "@/models/InactiveCustomerView"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    await dbConnect()

    // Calculate gas sales revenue (sum of all sales)
    const gasSalesResult = await Sale.aggregate([
      {
        $group: {
          _id: null,
          gasSalesRevenue: { $sum: "$totalAmount" },
          gasSalesPaid: { $sum: "$amountPaid" },
          totalDue: { $sum: { $subtract: ["$totalAmount", "$amountPaid"] } },
          totalSales: { $sum: 1 },
        },
      },
    ])

    const gasSales = gasSalesResult[0] || { gasSalesRevenue: 0, gasSalesPaid: 0, totalDue: 0, totalSales: 0 }

    // Calculate cylinder revenue (sum of all cylinder transactions)
    const cylinderRevenueResult = await CylinderTransaction.aggregate([
      {
        $group: {
          _id: null,
          cylinderRevenue: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
        },
      },
    ])

    const cylinderRevenue = cylinderRevenueResult[0] || { cylinderRevenue: 0, totalTransactions: 0 }

    // Get customer count
    const customerCount = await Customer.countDocuments()

    // Get employee count
    const employeeCount = await User.countDocuments({ role: "employee" })

    // Get product count
    const productCount = await Product.countDocuments()

    // Calculate products sold (sum of quantities from sales items)
    const productsSoldResult = await Sale.aggregate([
      { $unwind: "$items" },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: "$items.quantity" },
        },
      },
    ])

    const productsSold = productsSoldResult[0]?.totalQuantity || 0

    // Calculate total combined revenue
    const totalCombinedRevenue = (gasSales.gasSalesRevenue || 0) + (cylinderRevenue.cylinderRevenue || 0)

    // Find inactive customers (no transactions in the last 30 days)
    const oneMonthAgo = new Date()
    oneMonthAgo.setDate(oneMonthAgo.getDate() - 30)

    // Get all customers who made transactions in the last 30 days
    const activeCustomerIds = new Set()

    // Check admin gas sales
    const recentAdminSales = await Sale.find({ 
      createdAt: { $gte: oneMonthAgo } 
    }).select('customerId')
    recentAdminSales.forEach(sale => {
      if (sale.customerId) activeCustomerIds.add(sale.customerId.toString())
    })

    // Check employee gas sales
    const recentEmployeeSales = await EmployeeSale.find({ 
      createdAt: { $gte: oneMonthAgo } 
    }).select('customerId')
    recentEmployeeSales.forEach(sale => {
      if (sale.customerId) activeCustomerIds.add(sale.customerId.toString())
    })

    // Check admin cylinder transactions
    const recentAdminCylinders = await CylinderTransaction.find({ 
      createdAt: { $gte: oneMonthAgo } 
    }).select('customerId')
    recentAdminCylinders.forEach(transaction => {
      if (transaction.customerId) activeCustomerIds.add(transaction.customerId.toString())
    })

    // Check employee cylinder transactions
    const recentEmployeeCylinders = await EmployeeCylinderTransaction.find({ 
      createdAt: { $gte: oneMonthAgo } 
    }).select('customerId')
    recentEmployeeCylinders.forEach(transaction => {
      if (transaction.customerId) activeCustomerIds.add(transaction.customerId.toString())
    })

    // Get customers who have been viewed in the last 30 days
    const viewedCustomerIds = new Set()
    const recentViews = await InactiveCustomerView.find({
      viewedAt: { $gte: oneMonthAgo }
    }).select('customerId')
    recentViews.forEach(view => {
      if (view.customerId) viewedCustomerIds.add(view.customerId.toString())
    })

    // Get all customers and find inactive ones (excluding recently viewed ones)
    const allCustomers = await Customer.find({}).select('_id name email phone')
    const inactiveCustomers = allCustomers.filter(customer => 
      !activeCustomerIds.has(customer._id.toString()) && 
      !viewedCustomerIds.has(customer._id.toString())
    )

    // Ensure all values are numbers and not null/undefined
    const statsResponse = {
      totalRevenue: Number(totalCombinedRevenue) || 0, // Total business revenue (gas + cylinder)
      gasSales: Number(gasSales.gasSalesRevenue) || 0, // Total gas sales revenue
      cylinderRefills: Number(cylinderRevenue.cylinderRevenue) || 0, // Cylinder revenue
      totalDue: Number(gasSales.totalDue) || 0, // Outstanding amounts
      totalCustomers: Number(customerCount) || 0,
      totalEmployees: Number(employeeCount) || 0,
      totalProducts: Number(productCount) || 0,
      productsSold: Number(productsSold) || 0,
      totalSales: Number(gasSales.totalSales) || 0,
      totalCombinedRevenue: Number(totalCombinedRevenue) || 0,
      totalPaid: Number(gasSales.gasSalesPaid) || 0, // Amount actually received
      inactiveCustomers: inactiveCustomers, // Customers with no transactions in last 30 days
      inactiveCustomersCount: inactiveCustomers.length, // Count of inactive customers
    }

    console.log('Dashboard stats response:', statsResponse)
    return NextResponse.json(statsResponse)
  } catch (error) {
    console.error("Dashboard stats error:", error)
    // Return default zeros when there's an error to ensure frontend displays 0 values
    return NextResponse.json({
      totalRevenue: 0,
      gasSales: 0,
      cylinderRefills: 0,
      totalDue: 0,
      totalCustomers: 0,
      totalEmployees: 0,
      totalProducts: 0,
      productsSold: 0,
      totalSales: 0,
      totalCombinedRevenue: 0,
      totalPaid: 0,
      inactiveCustomers: [],
      inactiveCustomersCount: 0,
      error: "Failed to fetch dashboard stats"
    }, { status: 200 }) // Return 200 status with error message so frontend can still show 0 values
  }
}
