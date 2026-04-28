import dbConnect from "@/lib/mongodb";
import Customer from "@/models/Customer";
import Sale from "@/models/Sale";
import EmployeeSale from "@/models/EmployeeSale";
import CylinderTransaction from "@/models/Cylinder";
import EmployeeCylinderTransaction from "@/models/EmployeeCylinderTransaction";
import User from "@/models/User";
import Product from "@/models/Product";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const roundToTwo = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 0;
  return Math.trunc(Number(value) * 100) / 100;
};

const monthKey = (year, month) => `${year}-${String(month).padStart(2, "0")}`;

const buildLastSixMonths = () => {
  const out = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: monthKey(d.getFullYear(), d.getMonth() + 1),
      label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    });
  }
  return out;
};

export async function GET() {
  try {
    await dbConnect();

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5, 1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalCustomers,
      totalEmployees,
      totalProducts,
      adminSalesAgg,
      employeeSalesAgg,
      adminCylAgg,
      employeeCylAgg,
      salesMonthlyAdmin,
      salesMonthlyEmployee,
      cylMonthlyAdmin,
      cylMonthlyEmployee,
      topSalesAdmin,
      topSalesEmployee,
      topCylAdmin,
      topCylEmployee,
      overdueSalesAdminCustomers,
      overdueSalesEmployeeCustomers,
      pendingSalesAdminCustomers,
      pendingSalesEmployeeCustomers,
      overdueCylAdminCustomers,
      overdueCylEmployeeCustomers,
      pendingCylAdminCustomers,
      pendingCylEmployeeCustomers,
    ] = await Promise.all([
      Customer.countDocuments(),
      User.countDocuments({ role: "employee" }),
      Product.countDocuments(),
      Sale.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: { $ifNull: ["$totalAmount", 0] } },
            totalSales: { $sum: 1 },
            recentSales: {
              $sum: {
                $cond: [{ $gte: ["$createdAt", thirtyDaysAgo] }, 1, 0],
              },
            },
          },
        },
      ]),
      EmployeeSale.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: { $ifNull: ["$totalAmount", 0] } },
            totalSales: { $sum: 1 },
            recentSales: {
              $sum: {
                $cond: [{ $gte: ["$createdAt", thirtyDaysAgo] }, 1, 0],
              },
            },
          },
        },
      ]),
      CylinderTransaction.aggregate([
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            cylinderRefills: { $sum: { $cond: [{ $eq: ["$type", "refill"] }, 1, 0] } },
            cylinderDeposits: { $sum: { $cond: [{ $eq: ["$type", "deposit"] }, 1, 0] } },
            cylinderReturns: { $sum: { $cond: [{ $eq: ["$type", "return"] }, 1, 0] } },
            cylinderRevenue: {
              $sum: { $cond: [{ $eq: ["$type", "deposit"] }, { $ifNull: ["$amount", 0] }, 0] },
            },
            recentTransactions: {
              $sum: { $cond: [{ $gte: ["$createdAt", thirtyDaysAgo] }, 1, 0] },
            },
          },
        },
      ]),
      EmployeeCylinderTransaction.aggregate([
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            cylinderRefills: { $sum: { $cond: [{ $eq: ["$type", "refill"] }, 1, 0] } },
            cylinderDeposits: { $sum: { $cond: [{ $eq: ["$type", "deposit"] }, 1, 0] } },
            cylinderReturns: { $sum: { $cond: [{ $eq: ["$type", "return"] }, 1, 0] } },
            cylinderRevenue: {
              $sum: { $cond: [{ $eq: ["$type", "deposit"] }, { $ifNull: ["$amount", 0] }, 0] },
            },
            recentTransactions: {
              $sum: { $cond: [{ $gte: ["$createdAt", thirtyDaysAgo] }, 1, 0] },
            },
          },
        },
      ]),
      Sale.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } },
            sales: { $sum: 1 },
            revenue: { $sum: { $ifNull: ["$totalAmount", 0] } },
          },
        },
      ]),
      EmployeeSale.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } },
            sales: { $sum: 1 },
            revenue: { $sum: { $ifNull: ["$totalAmount", 0] } },
          },
        },
      ]),
      CylinderTransaction.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } },
            cylinderTransactions: { $sum: 1 },
            cylinderRevenue: {
              $sum: { $cond: [{ $eq: ["$type", "deposit"] }, { $ifNull: ["$amount", 0] }, 0] },
            },
          },
        },
      ]),
      EmployeeCylinderTransaction.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } },
            cylinderTransactions: { $sum: 1 },
            cylinderRevenue: {
              $sum: { $cond: [{ $eq: ["$type", "deposit"] }, { $ifNull: ["$amount", 0] }, 0] },
            },
          },
        },
      ]),
      Sale.aggregate([
        { $match: { customer: { $ne: null } } },
        {
          $group: {
            _id: "$customer",
            totalTransactions: { $sum: 1 },
            totalSalesAmount: { $sum: { $ifNull: ["$totalAmount", 0] } },
          },
        },
      ]),
      EmployeeSale.aggregate([
        { $match: { customer: { $ne: null } } },
        {
          $group: {
            _id: "$customer",
            totalTransactions: { $sum: 1 },
            totalSalesAmount: { $sum: { $ifNull: ["$totalAmount", 0] } },
          },
        },
      ]),
      CylinderTransaction.aggregate([
        { $match: { customer: { $ne: null } } },
        {
          $group: {
            _id: "$customer",
            totalTransactions: { $sum: 1 },
            totalCylinderAmount: {
              $sum: { $cond: [{ $eq: ["$type", "deposit"] }, { $ifNull: ["$amount", 0] }, 0] },
            },
          },
        },
      ]),
      EmployeeCylinderTransaction.aggregate([
        { $match: { customer: { $ne: null } } },
        {
          $group: {
            _id: "$customer",
            totalTransactions: { $sum: 1 },
            totalCylinderAmount: {
              $sum: { $cond: [{ $eq: ["$type", "deposit"] }, { $ifNull: ["$amount", 0] }, 0] },
            },
          },
        },
      ]),
      Sale.distinct("customer", { paymentStatus: "overdue", customer: { $ne: null } }),
      EmployeeSale.distinct("customer", { paymentStatus: "overdue", customer: { $ne: null } }),
      Sale.distinct("customer", {
        customer: { $ne: null },
        $or: [
          { paymentStatus: { $in: ["pending", "overdue"] } },
          { $expr: { $lt: [{ $ifNull: ["$receivedAmount", 0] }, { $ifNull: ["$totalAmount", 0] }] } },
        ],
      }),
      EmployeeSale.distinct("customer", {
        customer: { $ne: null },
        $or: [
          { paymentStatus: { $in: ["pending", "overdue"] } },
          { $expr: { $lt: [{ $ifNull: ["$receivedAmount", 0] }, { $ifNull: ["$totalAmount", 0] }] } },
        ],
      }),
      CylinderTransaction.distinct("customer", { status: "overdue", customer: { $ne: null } }),
      EmployeeCylinderTransaction.distinct("customer", { status: "overdue", customer: { $ne: null } }),
      CylinderTransaction.distinct("customer", { status: { $in: ["pending", "overdue"] }, customer: { $ne: null } }),
      EmployeeCylinderTransaction.distinct("customer", {
        status: { $in: ["pending", "overdue"] },
        customer: { $ne: null },
      }),
    ]);

    const salesSummary = {
      totalRevenue: Number(adminSalesAgg[0]?.totalRevenue || 0) + Number(employeeSalesAgg[0]?.totalRevenue || 0),
      totalSales: Number(adminSalesAgg[0]?.totalSales || 0) + Number(employeeSalesAgg[0]?.totalSales || 0),
      recentSales: Number(adminSalesAgg[0]?.recentSales || 0) + Number(employeeSalesAgg[0]?.recentSales || 0),
    };

    const cylinderSummary = {
      totalTransactions:
        Number(adminCylAgg[0]?.totalTransactions || 0) + Number(employeeCylAgg[0]?.totalTransactions || 0),
      cylinderRefills: Number(adminCylAgg[0]?.cylinderRefills || 0) + Number(employeeCylAgg[0]?.cylinderRefills || 0),
      cylinderDeposits:
        Number(adminCylAgg[0]?.cylinderDeposits || 0) + Number(employeeCylAgg[0]?.cylinderDeposits || 0),
      cylinderReturns: Number(adminCylAgg[0]?.cylinderReturns || 0) + Number(employeeCylAgg[0]?.cylinderReturns || 0),
      cylinderRevenue:
        Number(adminCylAgg[0]?.cylinderRevenue || 0) + Number(employeeCylAgg[0]?.cylinderRevenue || 0),
      recentTransactions:
        Number(adminCylAgg[0]?.recentTransactions || 0) + Number(employeeCylAgg[0]?.recentTransactions || 0),
    };

    const monthMap = new Map();
    const addMonthly = (rows, type) => {
      for (const row of rows) {
        const key = monthKey(row._id.y, row._id.m);
        if (!monthMap.has(key)) {
          monthMap.set(key, {
            sales: 0,
            revenue: 0,
            cylinderTransactions: 0,
            cylinderRevenue: 0,
          });
        }
        const curr = monthMap.get(key);
        if (type === "sales") {
          curr.sales += Number(row.sales || 0);
          curr.revenue += Number(row.revenue || 0);
        } else {
          curr.cylinderTransactions += Number(row.cylinderTransactions || 0);
          curr.cylinderRevenue += Number(row.cylinderRevenue || 0);
        }
      }
    };

    addMonthly(salesMonthlyAdmin, "sales");
    addMonthly(salesMonthlyEmployee, "sales");
    addMonthly(cylMonthlyAdmin, "cyl");
    addMonthly(cylMonthlyEmployee, "cyl");

    const monthlyData = buildLastSixMonths().map((m) => {
      const row = monthMap.get(m.key) || {
        sales: 0,
        revenue: 0,
        cylinderTransactions: 0,
        cylinderRevenue: 0,
      };
      return {
        month: m.label,
        sales: row.sales,
        revenue: roundToTwo(row.revenue),
        cylinderTransactions: row.cylinderTransactions,
        cylinderRevenue: roundToTwo(row.cylinderRevenue),
        totalRevenue: roundToTwo(row.revenue + row.cylinderRevenue),
      };
    });

    const topMap = new Map();
    const mergeTopRows = (rows, source) => {
      for (const row of rows) {
        const id = String(row._id || "");
        if (!id) continue;
        if (!topMap.has(id)) {
          topMap.set(id, {
            _id: id,
            totalTransactions: 0,
            totalAmount: 0,
            totalSalesAmount: 0,
            totalCylinderAmount: 0,
          });
        }
        const curr = topMap.get(id);
        curr.totalTransactions += Number(row.totalTransactions || 0);
        if (source === "sales") {
          curr.totalSalesAmount += Number(row.totalSalesAmount || 0);
        } else {
          curr.totalCylinderAmount += Number(row.totalCylinderAmount || 0);
        }
        curr.totalAmount = curr.totalSalesAmount + curr.totalCylinderAmount;
      }
    };

    mergeTopRows(topSalesAdmin, "sales");
    mergeTopRows(topSalesEmployee, "sales");
    mergeTopRows(topCylAdmin, "cyl");
    mergeTopRows(topCylEmployee, "cyl");

    const topIds = Array.from(topMap.keys());
    const topCustomersById = new Map(
      (await Customer.find({ _id: { $in: topIds } }).select("name balance").lean()).map((c) => [String(c._id), c])
    );

    const topCustomers = Array.from(topMap.values())
      .map((row) => ({
        name: topCustomersById.get(row._id)?.name || "Unknown",
        balance: Number(topCustomersById.get(row._id)?.balance || 0),
        totalTransactions: row.totalTransactions,
        totalAmount: roundToTwo(row.totalAmount),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5);

    const overdueSet = new Set(
      [...overdueSalesAdminCustomers, ...overdueSalesEmployeeCustomers, ...overdueCylAdminCustomers, ...overdueCylEmployeeCustomers].map(
        (id) => String(id)
      )
    );
    const pendingSet = new Set(
      [...pendingSalesAdminCustomers, ...pendingSalesEmployeeCustomers, ...pendingCylAdminCustomers, ...pendingCylEmployeeCustomers].map(
        (id) => String(id)
      )
    );

    let overdueCustomersCount = 0;
    let pendingCustomersCount = 0;
    let clearedCustomersCount = 0;
    for (const c of await Customer.find({}).select("_id").lean()) {
      const id = String(c._id);
      if (overdueSet.has(id)) overdueCustomersCount++;
      else if (pendingSet.has(id)) pendingCustomersCount++;
      else clearedCustomersCount++;
    }

    const totalSalesRevenue = roundToTwo(salesSummary.totalRevenue);
    const totalCylinderRevenue = roundToTwo(cylinderSummary.cylinderRevenue);
    const totalRevenue = roundToTwo(totalSalesRevenue + totalCylinderRevenue);
    const gasSales = salesSummary.totalSales;

    const stats = {
      totalCustomers: Number(totalCustomers) || 0,
      totalEmployees: Number(totalEmployees) || 0,
      totalProducts: Number(totalProducts) || 0,
      totalSales: Number(gasSales) || 0,
      totalRevenue,
      totalSalesRevenue,
      cylinderRevenue: totalCylinderRevenue,
      totalCombinedRevenue: totalRevenue,
      gasSales: Number(gasSales) || 0,
      cylinderRefills: Number(cylinderSummary.cylinderRefills) || 0,
      cylinderDeposits: Number(cylinderSummary.cylinderDeposits) || 0,
      cylinderReturns: Number(cylinderSummary.cylinderReturns) || 0,
      totalCylinderTransactions: Number(cylinderSummary.totalTransactions) || 0,
      recentSales: Number(salesSummary.recentSales) || 0,
      recentCylinderTransactions: Number(cylinderSummary.recentTransactions) || 0,
      monthlyData,
      topCustomers,
      averageSaleAmount: gasSales > 0 ? Number(totalSalesRevenue / gasSales) || 0 : 0,
      averageCylinderAmount:
        cylinderSummary.totalTransactions > 0 ? Number(totalCylinderRevenue / cylinderSummary.totalTransactions) || 0 : 0,
      pendingCustomers: Number(pendingCustomersCount) || 0,
      overdueCustomers: Number(overdueCustomersCount) || 0,
      clearedCustomers: Number(clearedCustomersCount) || 0,
    };

    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error("Reports Stats API error:", error);
    return NextResponse.json(
      {
        success: true,
        data: {
          totalCustomers: 0,
          totalEmployees: 0,
          totalProducts: 0,
          totalSales: 0,
          totalRevenue: 0,
          totalPaid: 0,
          totalPending: 0,
          cylinderRevenue: 0,
          totalCombinedRevenue: 0,
          gasSales: 0,
          cylinderRefills: 0,
          cylinderDeposits: 0,
          cylinderReturns: 0,
          totalCylinderTransactions: 0,
          recentSales: 0,
          recentCylinderTransactions: 0,
          monthlyData: [],
          topCustomers: [],
          averageSaleAmount: 0,
          averageCylinderAmount: 0,
          pendingCustomers: 0,
          overdueCustomers: 0,
          clearedCustomers: 0,
        },
        error: "Failed to fetch stats data - showing default values",
      },
      { status: 200 }
    );
  }
}
