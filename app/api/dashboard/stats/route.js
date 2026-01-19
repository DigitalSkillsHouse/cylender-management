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

// Helper function to round to 2 decimal places to avoid floating-point precision errors
const roundToTwo = (value) => {
  if (value === null || value === undefined || isNaN(value)) {
    return 0;
  }
  // Use toFixed and parseFloat for more reliable rounding
  return parseFloat(Number(value).toFixed(2));
};

// Disable caching for this route
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request) {
  try {
    await dbConnect()
    
    // Get date range from query parameters
    const { searchParams } = new URL(request.url)
    const fromDate = searchParams.get('fromDate')
    const toDate = searchParams.get('toDate')
    
    // Build date filter for MongoDB queries
    const dateFilter = {}
    if (fromDate || toDate) {
      dateFilter.createdAt = {}
      if (fromDate) {
        // Start of day in Dubai timezone
        const from = new Date(fromDate + 'T00:00:00+04:00')
        dateFilter.createdAt.$gte = from
      }
      if (toDate) {
        // End of day in Dubai timezone
        const to = new Date(toDate + 'T23:59:59+04:00')
        dateFilter.createdAt.$lte = to
      }
    }

    // Calculate gas sales revenue - ONLY from sales with gas items (category='gas')
    // Exclude credit sales with pending status from revenue - they should only show in totalDue
    const salesMatch = dateFilter.createdAt 
      ? [{ $match: { ...dateFilter } }] 
      : []
    
    // Revenue calculation: only count non-credit sales OR cleared credit sales
    const salesRevenueMatch = dateFilter.createdAt
      ? [{ $match: { ...dateFilter, $or: [{ paymentMethod: { $ne: 'credit' } }, { paymentStatus: 'cleared' }] } }]
      : [{ $match: { $or: [{ paymentMethod: { $ne: 'credit' } }, { paymentStatus: 'cleared' }] } }]
    
    // Calculate gas sales revenue - use totalAmount proportionally to avoid rounding errors
    // Instead of recalculating from items.total, use the stored totalAmount and allocate proportionally
    const gasSalesRevenueResult = await Sale.aggregate([
      ...salesRevenueMatch,
      {
        $project: {
          totalAmount: 1,
          items: 1,
          // Calculate subtotal for all items
          totalSubtotal: { $sum: "$items.total" },
          // Calculate subtotal for gas items only
          gasSubtotal: {
            $sum: {
              $map: {
                input: "$items",
                as: "item",
                in: {
                  $cond: [
                    { $eq: ["$$item.category", "gas"] },
                    "$$item.total",
                    0
                  ]
                }
              }
            }
          }
        }
      },
      {
        $project: {
          // Allocate totalAmount proportionally: gasSubtotal / totalSubtotal * totalAmount
          gasRevenue: {
            $cond: [
              { $gt: ["$totalSubtotal", 0] },
              { $multiply: ["$totalAmount", { $divide: ["$gasSubtotal", "$totalSubtotal"] }] },
              0
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          gasSalesRevenue: { $sum: "$gasRevenue" },
        },
      },
    ])
    
    // Calculate cylinder sales revenue - use totalAmount proportionally
    const cylinderSalesRevenueResult = await Sale.aggregate([
      ...salesRevenueMatch,
      {
        $project: {
          totalAmount: 1,
          items: 1,
          // Calculate subtotal for all items
          totalSubtotal: { $sum: "$items.total" },
          // Calculate subtotal for cylinder items only
          cylinderSubtotal: {
            $sum: {
              $map: {
                input: "$items",
                as: "item",
                in: {
                  $cond: [
                    { $eq: ["$$item.category", "cylinder"] },
                    "$$item.total",
                    0
                  ]
                }
              }
            }
          }
        }
      },
      {
        $project: {
          // Allocate totalAmount proportionally: cylinderSubtotal / totalSubtotal * totalAmount
          cylinderRevenue: {
            $cond: [
              { $gt: ["$totalSubtotal", 0] },
              { $multiply: ["$totalAmount", { $divide: ["$cylinderSubtotal", "$totalSubtotal"] }] },
              0
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          cylinderSalesRevenue: { $sum: "$cylinderRevenue" },
        },
      },
    ])
    
    // Use the calculated revenue directly (already includes VAT from totalAmount)
    const adminGasSalesRevenue = roundToTwo(gasSalesRevenueResult[0]?.gasSalesRevenue || 0)
    const adminCylinderSalesRevenue = roundToTwo(cylinderSalesRevenueResult[0]?.cylinderSalesRevenue || 0)
    
    // Get total sales stats (for counts and due calculations)
    // Round each sale's due amount to 2 decimal places before summing to avoid floating point precision issues
    // IMPORTANT: Only include pending sales (paymentStatus === 'pending' OR due > 0) in totalDue calculation
    const gasSalesResult = await Sale.aggregate([
      ...salesMatch,
      {
        $project: {
          totalAmount: { $round: ["$totalAmount", 2] },
          receivedAmount: { $round: [{ $ifNull: ["$receivedAmount", 0] }, 2] },
          paymentStatus: 1,
        },
      },
      {
        $project: {
          due: { $subtract: ["$totalAmount", "$receivedAmount"] },
          receivedAmount: 1,
          paymentStatus: 1,
          // Flag to indicate if this sale is pending
          isPending: {
            $or: [
              { $eq: ["$paymentStatus", "pending"] },
              { $gt: [{ $subtract: ["$totalAmount", "$receivedAmount"] }, 0] }
            ]
          },
        },
      },
      // Filter to only include pending sales for totalDue calculation
      {
        $match: {
          $or: [
            { paymentStatus: "pending" },
            { due: { $gt: 0 } }
          ]
        }
      },
      {
        $group: {
          _id: null,
          gasSalesPaid: { $sum: "$receivedAmount" },
          totalDue: { $sum: { $round: ["$due", 2] } },
          totalSales: { $sum: 1 },
        },
      },
    ])
    
    // Also calculate total paid from ALL sales (not just pending) for accurate paid amount
    const allSalesPaidResult = await Sale.aggregate([
      ...salesMatch,
      {
        $group: {
          _id: null,
          gasSalesPaid: { $sum: { $round: [{ $ifNull: ["$receivedAmount", 0] }, 2] } },
          totalSales: { $sum: 1 },
        },
      },
    ])

    const gasSales = gasSalesResult[0] || { gasSalesPaid: 0, totalDue: 0, totalSales: 0 }
    // Use paid amount from all sales, not just pending ones
    const allSalesPaid = allSalesPaidResult[0] || { gasSalesPaid: 0, totalSales: 0 }
    gasSales.gasSalesPaid = allSalesPaid.gasSalesPaid
    gasSales.totalSales = allSalesPaid.totalSales
    gasSales.gasSalesRevenue = adminGasSalesRevenue

    // ========== DETAILED LOGGING FOR TOTAL DUE CALCULATION ==========
    // Declare variables for manual calculation tracking
    let manualAdminTotalDue = 0
    let manualEmployeeTotalDue = 0
    
    console.log('\n========== ADMIN SALES TOTAL DUE CALCULATION ==========')
    console.log('Date filter:', dateFilter)
    console.log('Aggregation result (raw):', JSON.stringify(gasSalesResult, null, 2))
    console.log('Admin gasSales object:', JSON.stringify(gasSales, null, 2))
    
    // Fetch all admin sales individually to see actual values
    const adminSalesQuery = dateFilter.createdAt ? dateFilter : {}
    const allAdminSales = await Sale.find(adminSalesQuery)
      .select('invoiceNumber totalAmount receivedAmount paymentStatus paymentMethod createdAt')
      .sort({ createdAt: -1 })
      .limit(50) // Limit to recent 50 for performance
    
    console.log(`\n📊 Found ${allAdminSales.length} admin sales (showing recent 50)`)
    
    let pendingAdminSales = []
    allAdminSales.forEach((sale, index) => {
      const saleDue = (sale.totalAmount || 0) - (sale.receivedAmount || 0)
      manualAdminTotalDue += saleDue
      
      if (sale.paymentStatus === 'pending' || saleDue > 0) {
        pendingAdminSales.push({
          invoiceNumber: sale.invoiceNumber,
          totalAmount: sale.totalAmount,
          receivedAmount: sale.receivedAmount || 0,
          due: saleDue,
          paymentStatus: sale.paymentStatus,
          paymentMethod: sale.paymentMethod,
          createdAt: sale.createdAt
        })
      }
    })
    
    // Log exact stored values to identify precision issues
    console.log(`\n🔬 EXACT STORED VALUES (raw from database):`)
    allAdminSales.forEach((sale, idx) => {
      const rawTotal = sale.totalAmount
      const rawReceived = sale.receivedAmount || 0
      const rawDue = rawTotal - rawReceived
      console.log(`  Invoice #${sale.invoiceNumber}:`)
      console.log(`    totalAmount (raw): ${rawTotal} (type: ${typeof rawTotal})`)
      console.log(`    receivedAmount (raw): ${rawReceived} (type: ${typeof rawReceived})`)
      console.log(`    due (raw): ${rawDue}`)
      console.log(`    totalAmount (toFixed(10)): ${Number(rawTotal).toFixed(10)}`)
      console.log(`    receivedAmount (toFixed(10)): ${Number(rawReceived).toFixed(10)}`)
      console.log(`    due (toFixed(10)): ${Number(rawDue).toFixed(10)}`)
    })
    console.log(`  Sum of raw due values: ${allAdminSales.reduce((sum, s) => sum + ((s.totalAmount || 0) - (s.receivedAmount || 0)), 0)}`)
    console.log(`  Sum of raw due values (toFixed(10)): ${allAdminSales.reduce((sum, s) => sum + ((s.totalAmount || 0) - (s.receivedAmount || 0)), 0).toFixed(10)}`)
    
    console.log(`\n💰 Manual calculation of admin totalDue: ${manualAdminTotalDue.toFixed(2)}`)
    console.log(`📦 Aggregation totalDue: ${(gasSales.totalDue || 0).toFixed(2)}`)
    console.log(`📊 Difference: ${(manualAdminTotalDue - (gasSales.totalDue || 0)).toFixed(2)}`)
    console.log(`\n📋 Pending/Unpaid Admin Sales (${pendingAdminSales.length}):`)
    pendingAdminSales.slice(0, 20).forEach((sale, idx) => {
      console.log(`  ${idx + 1}. Invoice #${sale.invoiceNumber}: Total=${sale.totalAmount.toFixed(2)}, Received=${sale.receivedAmount.toFixed(2)}, Due=${sale.due.toFixed(2)}, Status=${sale.paymentStatus}, Method=${sale.paymentMethod}`)
    })
    if (pendingAdminSales.length > 20) {
      console.log(`  ... and ${pendingAdminSales.length - 20} more`)
    }
    
    // Check for specific invoice numbers mentioned in the issue
    const specificInvoices = ['10456', '10455', '10454', '10453', '10452', '10451']
    const foundSpecificInvoices = pendingAdminSales.filter(sale => 
      specificInvoices.includes(sale.invoiceNumber.toString())
    )
    if (foundSpecificInvoices.length > 0) {
      console.log(`\n🔍 SPECIFIC INVOICES FROM ISSUE (${foundSpecificInvoices.length} found):`)
      foundSpecificInvoices.forEach((sale, idx) => {
        console.log(`  Invoice #${sale.invoiceNumber}: Total=${sale.totalAmount.toFixed(2)}, Received=${sale.receivedAmount.toFixed(2)}, Due=${sale.due.toFixed(2)}, Status=${sale.paymentStatus}`)
      })
      const specificInvoicesTotal = foundSpecificInvoices.reduce((sum, sale) => sum + sale.due, 0)
      console.log(`  Expected total for these invoices: ${(foundSpecificInvoices.length * 15.00).toFixed(2)}`)
      console.log(`  Actual total for these invoices: ${specificInvoicesTotal.toFixed(2)}`)
      console.log(`  Difference: ${((foundSpecificInvoices.length * 15.00) - specificInvoicesTotal).toFixed(2)}`)
    }
    console.log('========================================================\n')

    // Calculate employee gas sales revenue - ONLY from sales with gas items (category='gas')
    const employeeSalesRevenueMatch = dateFilter.createdAt
      ? [{ $match: { ...dateFilter, $or: [{ paymentMethod: { $ne: 'credit' } }, { paymentStatus: 'cleared' }] } }]
      : [{ $match: { $or: [{ paymentMethod: { $ne: 'credit' } }, { paymentStatus: 'cleared' }] } }]
    
    // Calculate employee gas sales revenue - use totalAmount proportionally to avoid rounding errors
    const employeeGasSalesRevenueResult = await EmployeeSale.aggregate([
      ...employeeSalesRevenueMatch,
      {
        $project: {
          totalAmount: 1,
          items: 1,
          // Calculate subtotal for all items
          totalSubtotal: { $sum: "$items.total" },
          // Calculate subtotal for gas items only
          gasSubtotal: {
            $sum: {
              $map: {
                input: "$items",
                as: "item",
                in: {
                  $cond: [
                    { $eq: ["$$item.category", "gas"] },
                    "$$item.total",
                    0
                  ]
                }
              }
            }
          }
        }
      },
      {
        $project: {
          // Allocate totalAmount proportionally: gasSubtotal / totalSubtotal * totalAmount
          gasRevenue: {
            $cond: [
              { $gt: ["$totalSubtotal", 0] },
              { $multiply: ["$totalAmount", { $divide: ["$gasSubtotal", "$totalSubtotal"] }] },
              0
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          employeeGasSalesRevenue: { $sum: "$gasRevenue" },
        },
      },
    ])
    
    // Calculate employee cylinder sales revenue - use totalAmount proportionally
    const employeeCylinderSalesRevenueResult = await EmployeeSale.aggregate([
      ...employeeSalesRevenueMatch,
      {
        $project: {
          totalAmount: 1,
          items: 1,
          // Calculate subtotal for all items
          totalSubtotal: { $sum: "$items.total" },
          // Calculate subtotal for cylinder items only
          cylinderSubtotal: {
            $sum: {
              $map: {
                input: "$items",
                as: "item",
                in: {
                  $cond: [
                    { $eq: ["$$item.category", "cylinder"] },
                    "$$item.total",
                    0
                  ]
                }
              }
            }
          }
        }
      },
      {
        $project: {
          // Allocate totalAmount proportionally: cylinderSubtotal / totalSubtotal * totalAmount
          cylinderRevenue: {
            $cond: [
              { $gt: ["$totalSubtotal", 0] },
              { $multiply: ["$totalAmount", { $divide: ["$cylinderSubtotal", "$totalSubtotal"] }] },
              0
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          employeeCylinderSalesRevenue: { $sum: "$cylinderRevenue" },
        },
      },
    ])
    
    // Use the calculated revenue directly (already includes VAT from totalAmount)
    const employeeGasSalesRevenue = roundToTwo(employeeGasSalesRevenueResult[0]?.employeeGasSalesRevenue || 0)
    const employeeCylinderSalesRevenue = roundToTwo(employeeCylinderSalesRevenueResult[0]?.employeeCylinderSalesRevenue || 0)
    
    // Get employee total sales stats (for counts and due calculations)
    const employeeSalesMatch = dateFilter.createdAt 
      ? [{ $match: { ...dateFilter } }] 
      : []
    
    // Round each employee sale's due amount to 2 decimal places before summing to avoid floating point precision issues
    // IMPORTANT: Only include pending sales (paymentStatus === 'pending' OR due > 0) in employeeTotalDue calculation
    const employeeGasSalesResult = await EmployeeSale.aggregate([
      ...employeeSalesMatch,
      {
        $project: {
          totalAmount: { $round: ["$totalAmount", 2] },
          receivedAmount: { $round: [{ $ifNull: ["$receivedAmount", 0] }, 2] },
          paymentStatus: 1,
        },
      },
      {
        $project: {
          due: { $subtract: ["$totalAmount", "$receivedAmount"] },
          receivedAmount: 1,
          paymentStatus: 1,
        },
      },
      // Filter to only include pending sales for employeeTotalDue calculation
      {
        $match: {
          $or: [
            { paymentStatus: "pending" },
            { due: { $gt: 0 } }
          ]
        }
      },
      {
        $group: {
          _id: null,
          employeeGasSalesPaid: { $sum: "$receivedAmount" },
          employeeTotalDue: { $sum: { $round: ["$due", 2] } },
          employeeTotalSales: { $sum: 1 },
        },
      },
    ])
    
    // Also calculate total paid from ALL employee sales (not just pending) for accurate paid amount
    const allEmployeeSalesPaidResult = await EmployeeSale.aggregate([
      ...employeeSalesMatch,
      {
        $group: {
          _id: null,
          employeeGasSalesPaid: { $sum: { $round: [{ $ifNull: ["$receivedAmount", 0] }, 2] } },
          employeeTotalSales: { $sum: 1 },
        },
      },
    ])

    const employeeGasSales = employeeGasSalesResult[0] || { employeeGasSalesPaid: 0, employeeTotalDue: 0, employeeTotalSales: 0 }
    // Use paid amount from all employee sales, not just pending ones
    const allEmployeeSalesPaid = allEmployeeSalesPaidResult[0] || { employeeGasSalesPaid: 0, employeeTotalSales: 0 }
    employeeGasSales.employeeGasSalesPaid = allEmployeeSalesPaid.employeeGasSalesPaid
    employeeGasSales.employeeTotalSales = allEmployeeSalesPaid.employeeTotalSales
    employeeGasSales.employeeGasSalesRevenue = employeeGasSalesRevenue

    // ========== DETAILED LOGGING FOR EMPLOYEE SALES TOTAL DUE CALCULATION ==========
    console.log('\n========== EMPLOYEE SALES TOTAL DUE CALCULATION ==========')
    console.log('Date filter:', dateFilter)
    console.log('Aggregation result (raw):', JSON.stringify(employeeGasSalesResult, null, 2))
    console.log('Employee gasSales object:', JSON.stringify(employeeGasSales, null, 2))
    
    // Fetch all employee sales individually to see actual values
    const employeeSalesQuery = dateFilter.createdAt ? dateFilter : {}
    const allEmployeeSales = await EmployeeSale.find(employeeSalesQuery)
      .select('invoiceNumber totalAmount receivedAmount paymentStatus paymentMethod createdAt')
      .sort({ createdAt: -1 })
      .limit(50) // Limit to recent 50 for performance
    
    console.log(`\n📊 Found ${allEmployeeSales.length} employee sales (showing recent 50)`)
    
    let pendingEmployeeSales = []
    allEmployeeSales.forEach((sale, index) => {
      const saleDue = (sale.totalAmount || 0) - (sale.receivedAmount || 0)
      manualEmployeeTotalDue += saleDue
      
      if (sale.paymentStatus === 'pending' || saleDue > 0) {
        pendingEmployeeSales.push({
          invoiceNumber: sale.invoiceNumber,
          totalAmount: sale.totalAmount,
          receivedAmount: sale.receivedAmount || 0,
          due: saleDue,
          paymentStatus: sale.paymentStatus,
          paymentMethod: sale.paymentMethod,
          createdAt: sale.createdAt
        })
      }
    })
    
    console.log(`\n💰 Manual calculation of employee totalDue: ${manualEmployeeTotalDue.toFixed(2)}`)
    console.log(`📦 Aggregation employeeTotalDue: ${(employeeGasSales.employeeTotalDue || 0).toFixed(2)}`)
    console.log(`📊 Difference: ${(manualEmployeeTotalDue - (employeeGasSales.employeeTotalDue || 0)).toFixed(2)}`)
    console.log(`\n📋 Pending/Unpaid Employee Sales (${pendingEmployeeSales.length}):`)
    pendingEmployeeSales.slice(0, 20).forEach((sale, idx) => {
      console.log(`  ${idx + 1}. Invoice #${sale.invoiceNumber}: Total=${sale.totalAmount.toFixed(2)}, Received=${sale.receivedAmount.toFixed(2)}, Due=${sale.due.toFixed(2)}, Status=${sale.paymentStatus}, Method=${sale.paymentMethod}`)
    })
    if (pendingEmployeeSales.length > 20) {
      console.log(`  ... and ${pendingEmployeeSales.length - 20} more`)
    }
    console.log('========================================================\n')

    // Calculate employee cylinder revenue with date filter
    const employeeCylinderMatch = dateFilter.createdAt ? [{ $match: dateFilter }] : []
    const employeeCylinderRevenueResult = await EmployeeCylinderTransaction.aggregate([
      ...employeeCylinderMatch,
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

    // Calculate cylinder revenue (sum of all cylinder transactions) with date filter
    const cylinderMatch = dateFilter.createdAt ? [{ $match: dateFilter }] : []
    const cylinderRevenueResult = await CylinderTransaction.aggregate([
      ...cylinderMatch,
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

    // Calculate products sold (sum of quantities from admin sales items) with date filter
    const productsSoldResult = await Sale.aggregate([
      ...salesMatch,
      { $unwind: "$items" },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: "$items.quantity" },
        },
      },
    ])

    // Calculate products sold from employee sales with date filter
    const employeeProductsSoldResult = await EmployeeSale.aggregate([
      ...employeeSalesMatch,
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

    // Calculate total gas sales revenue (admin + employee) - ONLY from gas items
    // Don't round intermediate calculations to prevent cumulative errors
    const totalGasRevenue = adminGasSalesRevenue + employeeGasSalesRevenue
    
    // Calculate total cylinder sales revenue (admin + employee) - ONLY from cylinder items in sales
    // Don't round intermediate calculations to prevent cumulative errors
    const totalCylinderSalesRevenue = adminCylinderSalesRevenue + employeeCylinderSalesRevenue
    
    // Calculate cylinder revenue - EXCLUDE deposits (deposits are not revenue, they're refundable)
    // Only include refills and returns as revenue
    const adminCylinderRevenueMatch = dateFilter.createdAt 
      ? [{ $match: { ...dateFilter, type: { $in: ['refill', 'return'] } } }] 
      : [{ $match: { type: { $in: ['refill', 'return'] } } }]
    
    const employeeCylinderRevenueMatch = dateFilter.createdAt 
      ? [{ $match: { ...dateFilter, type: { $in: ['refill', 'return'] } } }] 
      : [{ $match: { type: { $in: ['refill', 'return'] } } }]
    
    const adminCylinderRevenueExcludingDeposits = await CylinderTransaction.aggregate([
      ...adminCylinderRevenueMatch,
      {
        $group: {
          _id: null,
          cylinderRevenue: { 
            $sum: {
              $add: [
                { $ifNull: ["$refillAmount", 0] },
                { $ifNull: ["$returnAmount", 0] },
                { $ifNull: ["$amount", 0] }
              ]
            }
          },
        },
      },
    ])
    
    const employeeCylinderRevenueExcludingDeposits = await EmployeeCylinderTransaction.aggregate([
      ...employeeCylinderRevenueMatch,
      {
        $group: {
          _id: null,
          employeeCylinderRevenue: { 
            $sum: {
              $add: [
                { $ifNull: ["$refillAmount", 0] },
                { $ifNull: ["$returnAmount", 0] },
                { $ifNull: ["$amount", 0] }
              ]
            }
          },
        },
      },
    ])
    
    // Calculate cylinder transaction revenue (refills + returns, excluding deposits)
    // Don't round intermediate calculations to prevent cumulative errors
    const totalCylinderTransactionRevenue = (adminCylinderRevenueExcludingDeposits[0]?.cylinderRevenue || 0) + 
                                  (employeeCylinderRevenueExcludingDeposits[0]?.employeeCylinderRevenue || 0)
    
    // Total Revenue = Gas Sales Revenue + Cylinder Sales Revenue (EXCLUDING Cylinder Transaction Revenue)
    // Don't round intermediate calculations to prevent cumulative errors
    const totalCombinedRevenue = totalGasRevenue + totalCylinderSalesRevenue

    // Calculate total due (admin + employee)
    // Don't round intermediate calculations to prevent cumulative errors
    const totalDue = (gasSales.totalDue || 0) + (employeeGasSales.employeeTotalDue || 0)

    // Calculate total paid (admin + employee)
    // Don't round intermediate calculations to prevent cumulative errors
    const totalPaid = (gasSales.gasSalesPaid || 0) + (employeeGasSales.employeeGasSalesPaid || 0)

    // ========== FINAL TOTAL DUE CALCULATION LOGGING ==========
    console.log('\n========== FINAL TOTAL DUE CALCULATION ==========')
    console.log(`Admin totalDue (from aggregation): ${(gasSales.totalDue || 0).toFixed(2)}`)
    console.log(`Employee totalDue (from aggregation): ${(employeeGasSales.employeeTotalDue || 0).toFixed(2)}`)
    console.log(`Combined totalDue (before rounding): ${totalDue.toFixed(2)}`)
    console.log(`Combined totalDue (after roundToTwo): ${roundToTwo(totalDue).toFixed(2)}`)
    console.log(`Manual admin totalDue: ${manualAdminTotalDue.toFixed(2)}`)
    console.log(`Manual employee totalDue: ${manualEmployeeTotalDue.toFixed(2)}`)
    console.log(`Manual combined totalDue: ${(manualAdminTotalDue + manualEmployeeTotalDue).toFixed(2)}`)
    console.log(`Difference (manual vs aggregation): ${((manualAdminTotalDue + manualEmployeeTotalDue) - totalDue).toFixed(2)}`)
    console.log('================================================\n')

    // Find inactive customers (no transactions in the last 30 days)
    // Note: Inactive customers calculation is not affected by date filter - it's always based on last 30 days
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

    // Ensure all values are numbers and not null/undefined, rounded to 2 decimal places
    const statsResponse = {
      totalRevenue: roundToTwo(totalCombinedRevenue), // Total revenue = Gas Sales + Cylinder Sales (EXCLUDES cylinder management transactions)
      gasSales: roundToTwo(totalGasRevenue), // Total gas sales revenue ONLY (admin + employee, from gas items only)
      cylinderRefills: roundToTwo(totalCylinderTransactionRevenue), // Total cylinder transaction revenue (refills + returns only, excludes deposits) - NOT included in totalRevenue
      totalDue: roundToTwo(totalDue), // Outstanding amounts (admin + employee)
      totalCustomers: Number(customerCount) || 0,
      totalEmployees: Number(employeeCount) || 0,
      totalProducts: Number(productCount) || 0,
      productsSold: Number(totalProductsSold) || 0, // Total products sold (admin + employee)
      totalSales: Number((gasSales.totalSales || 0) + (employeeGasSales.employeeTotalSales || 0)) || 0, // Total sales count
      totalCombinedRevenue: roundToTwo(totalCombinedRevenue),
      totalPaid: roundToTwo(totalPaid), // Amount actually received (admin + employee)
      inactiveCustomers: inactiveCustomers, // Customers with no transactions in last 30 days
      inactiveCustomersCount: inactiveCustomers.length, // Count of inactive customers
    }

    // ========== FINAL RESPONSE LOGGING ==========
    console.log('\n========== DASHBOARD STATS RESPONSE ==========')
    console.log('Total Due (final):', statsResponse.totalDue)
    console.log('Total Revenue:', statsResponse.totalRevenue)
    console.log('Gas Sales:', statsResponse.gasSales)
    console.log('Full response:', JSON.stringify(statsResponse, null, 2))
    console.log('=============================================\n')
    
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
