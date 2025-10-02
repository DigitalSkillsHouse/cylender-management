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

// Disable caching for this route
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    await dbConnect()

    // Calculate gas sales revenue (sum of all sales)
    const gasSalesResult = await Sale.aggregate([
      {
        $group: {
          _id: null,
          gasSalesRevenue: { $sum: "$totalAmount" },
          gasSalesPaid: { $sum: "$receivedAmount" },
          totalDue: { $sum: { $subtract: ["$totalAmount", "$receivedAmount"] } },
          totalSales: { $sum: 1 },
        },
      },
    ])

    const gasSales = gasSalesResult[0] || { gasSalesRevenue: 0, gasSalesPaid: 0, totalDue: 0, totalSales: 0 }

    // Calculate employee gas sales revenue
    const employeeGasSalesResult = await EmployeeSale.aggregate([
      {
        $group: {
          _id: null,
          employeeGasSalesRevenue: { $sum: "$totalAmount" },
          employeeGasSalesPaid: { $sum: "$receivedAmount" },
          employeeTotalDue: { $sum: { $subtract: ["$totalAmount", "$receivedAmount"] } },
          employeeTotalSales: { $sum: 1 },
        },
      },
    ])

    const employeeGasSales = employeeGasSalesResult[0] || { employeeGasSalesRevenue: 0, employeeGasSalesPaid: 0, employeeTotalDue: 0, employeeTotalSales: 0 }

    // Calculate employee cylinder revenue
    const employeeCylinderRevenueResult = await EmployeeCylinderTransaction.aggregate([
      {
        $group: {
          _id: null,
          employeeCylinderRevenue: { 
            $sum: {
              $add: [
                { $ifNull: ["$depositAmount", 0] },
                { $ifNull: ["$refillAmount", 0] },
                { $ifNull: ["$amount", 0] }
              ]
            }
          },
          employeeTotalTransactions: { $sum: 1 },
        },
      },
    ])

    const employeeCylinderRevenue = employeeCylinderRevenueResult[0] || { employeeCylinderRevenue: 0, employeeTotalTransactions: 0 }

    // Calculate cylinder revenue (sum of all cylinder transactions)
    const cylinderRevenueResult = await CylinderTransaction.aggregate([
      {
        $group: {
          _id: null,
          cylinderRevenue: { 
            $sum: {
              $add: [
                { $ifNull: ["$depositAmount", 0] },
                { $ifNull: ["$refillAmount", 0] },
                { $ifNull: ["$amount", 0] }
              ]
            }
          },
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

    // Calculate products sold (sum of quantities from admin sales items)
    const productsSoldResult = await Sale.aggregate([
      { $unwind: "$items" },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: "$items.quantity" },
        },
      },
    ])

    // Calculate products sold from employee sales
    const employeeProductsSoldResult = await EmployeeSale.aggregate([
      { $unwind: "$items" },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: "$items.quantity" },
        },
      },
    ])

    const adminProductsSold = productsSoldResult[0]?.totalQuantity || 0
    const employeeProductsSold = employeeProductsSoldResult[0]?.totalQuantity || 0
    const totalProductsSold = adminProductsSold + employeeProductsSold

    // Calculate total combined revenue (admin + employee)
    const totalGasRevenue = (gasSales.gasSalesRevenue || 0) + (employeeGasSales.employeeGasSalesRevenue || 0)
    const totalCylinderRevenue = (cylinderRevenue.cylinderRevenue || 0) + (employeeCylinderRevenue.employeeCylinderRevenue || 0)
    const totalCombinedRevenue = totalGasRevenue + totalCylinderRevenue

    // Calculate total due (admin + employee)
    const totalDue = (gasSales.totalDue || 0) + (employeeGasSales.employeeTotalDue || 0)

    // Calculate total paid (admin + employee)
    const totalPaid = (gasSales.gasSalesPaid || 0) + (employeeGasSales.employeeGasSalesPaid || 0)

    // Find inactive customers (no transactions in the last 30 days)
    const oneMonthAgo = new Date()
    oneMonthAgo.setDate(oneMonthAgo.getDate() - 30)

    // Get all customers who made transactions in the last 30 days
    const activeCustomerIds = new Set()

    // Check admin gas sales
    const recentAdminSales = await Sale.find({ 
      createdAt: { $gte: oneMonthAgo } 
    }).select('customer')
    recentAdminSales.forEach(sale => {
      if (sale.customer) activeCustomerIds.add(sale.customer.toString())
    })

    // Check employee gas sales
    const recentEmployeeSales = await EmployeeSale.find({ 
      createdAt: { $gte: oneMonthAgo } 
    }).select('customer')
    recentEmployeeSales.forEach(sale => {
      if (sale.customer) activeCustomerIds.add(sale.customer.toString())
    })

    // Check admin cylinder transactions
    const recentAdminCylinders = await CylinderTransaction.find({ 
      createdAt: { $gte: oneMonthAgo } 
    }).select('customer')
    recentAdminCylinders.forEach(transaction => {
      if (transaction.customer) activeCustomerIds.add(transaction.customer.toString())
    })

    // Check employee cylinder transactions
    const recentEmployeeCylinders = await EmployeeCylinderTransaction.find({ 
      createdAt: { $gte: oneMonthAgo } 
    }).select('customer')
    recentEmployeeCylinders.forEach(transaction => {
      if (transaction.customer) activeCustomerIds.add(transaction.customer.toString())
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
      gasSales: Number(totalGasRevenue) || 0, // Total gas sales revenue (admin + employee)
      cylinderRefills: Number(totalCylinderRevenue) || 0, // Total cylinder revenue (admin + employee)
      totalDue: Number(totalDue) || 0, // Outstanding amounts (admin + employee)
      totalCustomers: Number(customerCount) || 0,
      totalEmployees: Number(employeeCount) || 0,
      totalProducts: Number(productCount) || 0,
      productsSold: Number(totalProductsSold) || 0, // Total products sold (admin + employee)
      totalSales: Number((gasSales.totalSales || 0) + (employeeGasSales.employeeTotalSales || 0)) || 0, // Total sales count
      totalCombinedRevenue: Number(totalCombinedRevenue) || 0,
      totalPaid: Number(totalPaid) || 0, // Amount actually received (admin + employee)
      inactiveCustomers: inactiveCustomers, // Customers with no transactions in last 30 days
      inactiveCustomersCount: inactiveCustomers.length, // Count of inactive customers
    }

    console.log('Dashboard stats response:', statsResponse)
    
    // Prevent caching on Vercel
    const response = NextResponse.json(statsResponse)
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    response.headers.set('Surrogate-Control', 'no-store')
    
    return response
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
