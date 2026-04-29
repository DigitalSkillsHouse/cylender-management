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
    // Run independent counters/aggregations in parallel to reduce dashboard latency.
    const customerCountQuery = dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {}
    const [
      customerCount,
      employeeCount,
      productCount,
      productsSoldResult,
      employeeProductsSoldResult,
      adminSalesQuantityResult,
      employeeSalesQuantityResult,
    ] = await Promise.all([
      Customer.countDocuments(customerCountQuery),
      User.countDocuments({ role: "employee" }),
      Product.countDocuments(),
      Sale.aggregate([
        ...salesMatch,
        { $unwind: "$items" },
        {
          $group: {
            _id: null,
            totalQuantity: { $sum: "$items.quantity" },
          },
        },
      ]),
      EmployeeSale.aggregate([
        ...employeeSalesMatch,
        { $unwind: "$items" },
        {
          $group: {
            _id: null,
            totalQuantity: { $sum: "$items.quantity" },
          },
        },
      ]),
      Sale.aggregate([
        ...salesMatch,
        { $unwind: "$items" },
        {
          $group: {
            _id: null,
            gasSalesQuantity: {
              $sum: {
                $cond: [{ $eq: ["$items.category", "gas"] }, { $ifNull: ["$items.quantity", 0] }, 0]
              }
            },
            cylinderSalesQuantity: {
              $sum: {
                $cond: [{ $eq: ["$items.category", "cylinder"] }, { $ifNull: ["$items.quantity", 0] }, 0]
              }
            },
            fullCylinderSalesQuantity: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ["$items.category", "cylinder"] }, { $eq: ["$items.cylinderStatus", "full"] }] },
                  { $ifNull: ["$items.quantity", 0] },
                  0
                ]
              }
            },
            emptyCylinderSalesQuantity: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ["$items.category", "cylinder"] }, { $eq: ["$items.cylinderStatus", "empty"] }] },
                  { $ifNull: ["$items.quantity", 0] },
                  0
                ]
              }
            },
          },
        },
      ]),
      EmployeeSale.aggregate([
        ...employeeSalesMatch,
        { $unwind: "$items" },
        {
          $group: {
            _id: null,
            gasSalesQuantity: {
              $sum: {
                $cond: [{ $eq: ["$items.category", "gas"] }, { $ifNull: ["$items.quantity", 0] }, 0]
              }
            },
            cylinderSalesQuantity: {
              $sum: {
                $cond: [{ $eq: ["$items.category", "cylinder"] }, { $ifNull: ["$items.quantity", 0] }, 0]
              }
            },
            fullCylinderSalesQuantity: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ["$items.category", "cylinder"] }, { $eq: ["$items.cylinderStatus", "full"] }] },
                  { $ifNull: ["$items.quantity", 0] },
                  0
                ]
              }
            },
            emptyCylinderSalesQuantity: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ["$items.category", "cylinder"] }, { $eq: ["$items.cylinderStatus", "empty"] }] },
                  { $ifNull: ["$items.quantity", 0] },
                  0
                ]
              }
            },
          },
        },
      ]),
    ])

    const adminProductsSold = productsSoldResult[0]?.totalQuantity || 0
    const employeeProductsSold = employeeProductsSoldResult[0]?.totalQuantity || 0
    const totalProductsSold = adminProductsSold + employeeProductsSold

    const totalGasSalesQuantity =
      Number(adminSalesQuantityResult[0]?.gasSalesQuantity || 0) +
      Number(employeeSalesQuantityResult[0]?.gasSalesQuantity || 0)
    const totalCylinderSalesQuantity =
      Number(adminSalesQuantityResult[0]?.cylinderSalesQuantity || 0) +
      Number(employeeSalesQuantityResult[0]?.cylinderSalesQuantity || 0)
    const totalFullCylinderSalesQuantity =
      Number(adminSalesQuantityResult[0]?.fullCylinderSalesQuantity || 0) +
      Number(employeeSalesQuantityResult[0]?.fullCylinderSalesQuantity || 0)
    const totalEmptyCylinderSalesQuantity =
      Number(adminSalesQuantityResult[0]?.emptyCylinderSalesQuantity || 0) +
      Number(employeeSalesQuantityResult[0]?.emptyCylinderSalesQuantity || 0)

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
    
    const [adminCylinderRevenueExcludingDeposits, employeeCylinderRevenueExcludingDeposits] = await Promise.all([
      CylinderTransaction.aggregate([
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
      ]),
      EmployeeCylinderTransaction.aggregate([
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
      ]),
    ])
    
    // Calculate cylinder transaction revenue (refills + returns, excluding deposits)
    // Don't round intermediate calculations to prevent cumulative errors
    const totalCylinderTransactionRevenue = (adminCylinderRevenueExcludingDeposits[0]?.cylinderRevenue || 0) + 
                                  (employeeCylinderRevenueExcludingDeposits[0]?.employeeCylinderRevenue || 0)
    
    // Total Revenue = Gas Sales Revenue + Cylinder Sales Revenue (EXCLUDING Cylinder Transaction Revenue)
    // Don't round intermediate calculations to prevent cumulative errors
    const totalCombinedRevenue = totalGasRevenue + totalCylinderSalesRevenue

    // Calculate pending cylinder transactions amounts (for totalDue calculation)
    // Only include pending cylinder transactions (status === 'pending')
    const adminPendingCylinderMatch = dateFilter.createdAt 
      ? [{ $match: { ...dateFilter, status: 'pending' } }] 
      : [{ $match: { status: 'pending' } }]
    
    const employeePendingCylinderMatch = dateFilter.createdAt 
      ? [{ $match: { ...dateFilter, status: 'pending' } }] 
      : [{ $match: { status: 'pending' } }]
    
    const [adminPendingCylinderDue, employeePendingCylinderDue] = await Promise.all([
      CylinderTransaction.aggregate([
        ...adminPendingCylinderMatch,
        {
          $group: {
            _id: null,
            pendingCylinderAmount: {
              $sum: { $round: [{ $ifNull: ["$amount", 0] }, 2] }
            },
          },
        },
      ]),
      EmployeeCylinderTransaction.aggregate([
        ...employeePendingCylinderMatch,
        {
          $group: {
            _id: null,
            pendingCylinderAmount: {
              $sum: { $round: [{ $ifNull: ["$amount", 0] }, 2] }
            },
          },
        },
      ]),
    ])
    
    const adminPendingCylinderAmount = adminPendingCylinderDue[0]?.pendingCylinderAmount || 0
    const employeePendingCylinderAmount = employeePendingCylinderDue[0]?.pendingCylinderAmount || 0
    
    // Calculate total due (admin + employee sales due amounts + pending cylinder transactions)
    // Don't round intermediate calculations to prevent cumulative errors
    const totalDue = (gasSales.totalDue || 0) + (employeeGasSales.employeeTotalDue || 0) + adminPendingCylinderAmount + employeePendingCylinderAmount

    // Calculate total paid (admin + employee)
    // Don't round intermediate calculations to prevent cumulative errors
    const totalPaid = (gasSales.gasSalesPaid || 0) + (employeeGasSales.employeeGasSalesPaid || 0)
    // Find inactive customers (no transactions in the last 30 days)
    // Note: Inactive customers calculation is not affected by date filter - it's always based on last 30 days
    const oneMonthAgo = new Date()
    oneMonthAgo.setDate(oneMonthAgo.getDate() - 30)

    // Use distinct + parallel reads to avoid loading full documents in memory.
    const [
      recentAdminSalesCustomerIds,
      recentEmployeeSalesCustomerIds,
      recentAdminCylinderCustomerIds,
      recentEmployeeCylinderCustomerIds,
      recentViewedCustomerIds,
      allCustomers,
    ] = await Promise.all([
      Sale.distinct("customer", { createdAt: { $gte: oneMonthAgo } }),
      EmployeeSale.distinct("customer", { createdAt: { $gte: oneMonthAgo } }),
      CylinderTransaction.distinct("customer", { createdAt: { $gte: oneMonthAgo } }),
      EmployeeCylinderTransaction.distinct("customer", { createdAt: { $gte: oneMonthAgo } }),
      InactiveCustomerView.distinct("customerId", { viewedAt: { $gte: oneMonthAgo } }),
      Customer.find({}).select("_id name email phone"),
    ])

    const activeCustomerIds = new Set(
      [
        ...recentAdminSalesCustomerIds,
        ...recentEmployeeSalesCustomerIds,
        ...recentAdminCylinderCustomerIds,
        ...recentEmployeeCylinderCustomerIds,
      ]
        .filter(Boolean)
        .map((id) => id.toString())
    )

    const viewedCustomerIds = new Set(
      recentViewedCustomerIds
        .filter(Boolean)
        .map((id) => id.toString())
    )
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
      salesQuantity: {
        gas: totalGasSalesQuantity,
        cylinder: totalCylinderSalesQuantity,
        fullCylinder: totalFullCylinderSalesQuantity,
        emptyCylinder: totalEmptyCylinderSalesQuantity,
      },
      inactiveCustomers: inactiveCustomers, // Customers with no transactions in last 30 days
      inactiveCustomersCount: inactiveCustomers.length, // Count of inactive customers
    }
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
      salesQuantity: {
        gas: 0,
        cylinder: 0,
        fullCylinder: 0,
        emptyCylinder: 0,
      },
      inactiveCustomers: [],
      inactiveCustomersCount: 0,
      error: "Failed to fetch dashboard stats"
    }, { status: 200 }) // Return 200 status with error message so frontend can still show 0 values
  }
}
