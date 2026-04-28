import dbConnect from "@/lib/mongodb";
import Customer from "@/models/Customer";
import Sale from "@/models/Sale";
import CylinderTransaction from "@/models/Cylinder";
import EmployeeSale from "@/models/EmployeeSale";
import EmployeeCylinderTransaction from "@/models/EmployeeCylinderTransaction";
import { NextResponse } from "next/server";
import { normalizeSalePaymentState } from "@/lib/payment-status";

const mapById = (rows) => new Map(rows.map((r) => [String(r._id), r]));

export async function GET(request) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const customerName = (searchParams.get("customerName") || "").trim();
    const customerId = (searchParams.get("customerId") || "").trim();
    const status = searchParams.get("status");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const includeTransactions = searchParams.get("includeTransactions") === "true";
    const downloadMode = searchParams.get("downloadMode");

    const customerQuery = {};
    if (customerId) {
      customerQuery._id = customerId;
    } else if (customerName) {
      customerQuery.$or = [
        { name: { $regex: customerName, $options: "i" } },
        { phone: { $regex: customerName, $options: "i" } },
        { email: { $regex: customerName, $options: "i" } },
        { address: { $regex: customerName, $options: "i" } },
        { trNumber: { $regex: customerName, $options: "i" } },
      ];
    }

    const customers = await Customer.find(customerQuery).lean();
    if (customers.length === 0) {
      return NextResponse.json({ success: true, data: [], total: 0 });
    }

    const customerIds = customers.map((c) => c._id);
    const createdAtFilter = {};
    if (startDate) createdAtFilter.$gte = new Date(startDate);
    if (endDate) createdAtFilter.$lte = new Date(`${endDate}T23:59:59.999Z`);
    const hasDateFilter = Boolean(startDate || endDate);

    const baseMatch = {
      customer: { $in: customerIds },
      ...(hasDateFilter ? { createdAt: createdAtFilter } : {}),
    };

    // Fast summary path for "Load All Customers"
    if (!includeTransactions) {
      const [adminSalesAgg, employeeSalesAgg, adminCylAgg, employeeCylAgg] = await Promise.all([
        Sale.aggregate([
          { $match: baseMatch },
          {
            $group: {
              _id: "$customer",
              totalSales: { $sum: 1 },
              totalSalesAmount: { $sum: { $ifNull: ["$totalAmount", 0] } },
              totalPaidAmount: { $sum: { $ifNull: ["$receivedAmount", 0] } },
              lastSaleAt: { $max: "$createdAt" },
              pendingSales: {
                $sum: {
                  $cond: [
                    {
                      $or: [
                        { $ne: ["$paymentStatus", "cleared"] },
                        { $lt: [{ $ifNull: ["$receivedAmount", 0] }, { $ifNull: ["$totalAmount", 0] }] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              overdueSales: { $sum: { $cond: [{ $eq: ["$paymentStatus", "overdue"] }, 1, 0] } },
              clearedSales: { $sum: { $cond: [{ $eq: ["$paymentStatus", "cleared"] }, 1, 0] } },
            },
          },
        ]),
        EmployeeSale.aggregate([
          { $match: baseMatch },
          {
            $group: {
              _id: "$customer",
              totalSales: { $sum: 1 },
              totalSalesAmount: { $sum: { $ifNull: ["$totalAmount", 0] } },
              totalPaidAmount: { $sum: { $ifNull: ["$receivedAmount", 0] } },
              lastSaleAt: { $max: "$createdAt" },
              pendingSales: {
                $sum: {
                  $cond: [
                    {
                      $or: [
                        { $ne: ["$paymentStatus", "cleared"] },
                        { $lt: [{ $ifNull: ["$receivedAmount", 0] }, { $ifNull: ["$totalAmount", 0] }] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              overdueSales: { $sum: { $cond: [{ $eq: ["$paymentStatus", "overdue"] }, 1, 0] } },
              clearedSales: { $sum: { $cond: [{ $eq: ["$paymentStatus", "cleared"] }, 1, 0] } },
            },
          },
        ]),
        CylinderTransaction.aggregate([
          { $match: baseMatch },
          {
            $group: {
              _id: "$customer",
              totalCylinderAmount: { $sum: { $ifNull: ["$amount", 0] } },
              totalDeposits: { $sum: { $cond: [{ $eq: ["$type", "deposit"] }, 1, 0] } },
              totalRefills: { $sum: { $cond: [{ $eq: ["$type", "refill"] }, 1, 0] } },
              totalReturns: { $sum: { $cond: [{ $eq: ["$type", "return"] }, 1, 0] } },
              pendingCylinderTransactions: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
              overdueCylinderTransactions: { $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] } },
              clearedCylinderTransactions: { $sum: { $cond: [{ $eq: ["$status", "cleared"] }, 1, 0] } },
              lastCylAt: { $max: "$createdAt" },
            },
          },
        ]),
        EmployeeCylinderTransaction.aggregate([
          { $match: baseMatch },
          {
            $group: {
              _id: "$customer",
              totalCylinderAmount: { $sum: { $ifNull: ["$amount", 0] } },
              totalDeposits: { $sum: { $cond: [{ $eq: ["$type", "deposit"] }, 1, 0] } },
              totalRefills: { $sum: { $cond: [{ $eq: ["$type", "refill"] }, 1, 0] } },
              totalReturns: { $sum: { $cond: [{ $eq: ["$type", "return"] }, 1, 0] } },
              pendingCylinderTransactions: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
              overdueCylinderTransactions: { $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] } },
              clearedCylinderTransactions: { $sum: { $cond: [{ $eq: ["$status", "cleared"] }, 1, 0] } },
              lastCylAt: { $max: "$createdAt" },
            },
          },
        ]),
      ]);

      const salesA = mapById(adminSalesAgg);
      const salesE = mapById(employeeSalesAgg);
      const cylA = mapById(adminCylAgg);
      const cylE = mapById(employeeCylAgg);

      const data = customers
        .map((customer) => {
          const id = String(customer._id);
          const sa = salesA.get(id) || {};
          const se = salesE.get(id) || {};
          const ca = cylA.get(id) || {};
          const ce = cylE.get(id) || {};

          const totalSales = Number(sa.totalSales || 0) + Number(se.totalSales || 0);
          const totalSalesAmount = Number(sa.totalSalesAmount || 0) + Number(se.totalSalesAmount || 0);
          const totalPaidAmount = Number(sa.totalPaidAmount || 0) + Number(se.totalPaidAmount || 0);
          const totalSalesOutstanding = Math.max(0, totalSalesAmount - totalPaidAmount);
          const totalCylinderAmount = Number(ca.totalCylinderAmount || 0) + Number(ce.totalCylinderAmount || 0);
          const totalDeposits = Number(ca.totalDeposits || 0) + Number(ce.totalDeposits || 0);
          const totalRefills = Number(ca.totalRefills || 0) + Number(ce.totalRefills || 0);
          const totalReturns = Number(ca.totalReturns || 0) + Number(ce.totalReturns || 0);

          const pendingSales = Number(sa.pendingSales || 0) + Number(se.pendingSales || 0);
          const overdueSales = Number(sa.overdueSales || 0) + Number(se.overdueSales || 0);
          const clearedSales = Number(sa.clearedSales || 0) + Number(se.clearedSales || 0);
          const pendingCyl = Number(ca.pendingCylinderTransactions || 0) + Number(ce.pendingCylinderTransactions || 0);
          const overdueCyl = Number(ca.overdueCylinderTransactions || 0) + Number(ce.overdueCylinderTransactions || 0);
          const clearedCyl = Number(ca.clearedCylinderTransactions || 0) + Number(ce.clearedCylinderTransactions || 0);

          let overallStatus = "cleared";
          if (overdueSales > 0 || overdueCyl > 0) overallStatus = "overdue";
          else if (pendingSales > 0 || pendingCyl > 0) overallStatus = "pending";
          else if (clearedSales > 0 || clearedCyl > 0 || (totalSales === 0 && totalDeposits + totalRefills + totalReturns === 0))
            overallStatus = "cleared";

          const lastTransactionDate = [sa.lastSaleAt, se.lastSaleAt, ca.lastCylAt, ce.lastCylAt]
            .filter(Boolean)
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

          const hasRecentActivity = lastTransactionDate
            ? new Date(lastTransactionDate).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000
            : false;

          if (status && status !== "all" && overallStatus !== status) return null;

          return {
            _id: customer._id,
            name: customer.name,
            trNumber: customer.trNumber,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
            balance: totalSalesOutstanding + totalCylinderAmount,
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
            hasRecentActivity,
            lastTransactionDate,
            recentSales: [],
            recentCylinderTransactions: [],
          };
        })
        .filter(Boolean);

      return NextResponse.json({ success: true, data, total: data.length });
    }

    // Detailed path for single customer expansion/receipt/download flows
    if (includeTransactions && downloadMode === "pending" && status === "pending") {
      const pendingSalesQuery = {
        ...baseMatch,
        $or: [
          { paymentStatus: { $in: ["pending", "overdue"] } },
          { $expr: { $lt: [{ $ifNull: ["$receivedAmount", 0] }, { $ifNull: ["$totalAmount", 0] }] } },
        ],
      };
      const pendingCylinderQuery = {
        ...baseMatch,
        status: { $in: ["pending", "overdue"] },
      };

      const [adminSalesRaw, employeeSalesRaw, adminCylRaw, employeeCylRaw] = await Promise.all([
        Sale.find(pendingSalesQuery).select("customer invoiceNumber totalAmount receivedAmount paymentStatus createdAt customerSignature").lean(),
        EmployeeSale.find(pendingSalesQuery)
          .select("customer employee invoiceNumber totalAmount receivedAmount paymentStatus createdAt customerSignature")
          .populate("employee", "name")
          .lean(),
        CylinderTransaction.find(pendingCylinderQuery)
          .select("customer type cylinderSize quantity amount cashAmount status createdAt invoiceNumber transactionId customerSignature")
          .lean(),
        EmployeeCylinderTransaction.find(pendingCylinderQuery)
          .select("customer employee type cylinderSize quantity amount cashAmount status createdAt invoiceNumber transactionId customerSignature")
          .populate("employee", "name")
          .lean(),
      ]);

      const salesByCustomer = new Map();
      const cylByCustomer = new Map();
      const addToMap = (map, key, value) => {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(value);
      };

      for (const sale of adminSalesRaw) {
        const key = String(sale.customer);
        const normalized = normalizeSalePaymentState({
          totalAmount: sale.totalAmount,
          receivedAmount: sale.receivedAmount,
          paymentStatus: sale.paymentStatus,
        });
        if (Number(normalized.balance || 0) <= 0) continue;
        addToMap(salesByCustomer, key, {
          _id: sale._id,
          invoiceNumber: sale.invoiceNumber,
          totalAmount: normalized.totalAmount,
          amountPaid: normalized.receivedAmount,
          receivedAmount: normalized.receivedAmount,
          outstandingAmount: normalized.balance,
          customerSignature: sale.customerSignature || "",
          paymentStatus: normalized.paymentStatus,
          createdAt: sale.createdAt,
          items: [],
          saleSource: "admin",
          employee: null,
        });
      }

      for (const sale of employeeSalesRaw) {
        const key = String(sale.customer);
        const normalized = normalizeSalePaymentState({
          totalAmount: sale.totalAmount,
          receivedAmount: sale.receivedAmount,
          paymentStatus: sale.paymentStatus,
        });
        if (Number(normalized.balance || 0) <= 0) continue;
        addToMap(salesByCustomer, key, {
          _id: sale._id,
          invoiceNumber: sale.invoiceNumber,
          totalAmount: normalized.totalAmount,
          amountPaid: normalized.receivedAmount,
          receivedAmount: normalized.receivedAmount,
          outstandingAmount: normalized.balance,
          customerSignature: sale.customerSignature || "",
          paymentStatus: normalized.paymentStatus,
          createdAt: sale.createdAt,
          items: [],
          saleSource: "employee",
          employee: sale.employee ? { _id: sale.employee._id, name: sale.employee.name } : null,
        });
      }

      for (const t of adminCylRaw) {
        const key = String(t.customer);
        const outstanding = Math.max(0, Number(t.amount || 0) - Number(t.cashAmount || 0));
        if (outstanding <= 0) continue;
        addToMap(cylByCustomer, key, {
          _id: t._id,
          type: t.type,
          cylinderSize: t.cylinderSize,
          quantity: t.quantity,
          amount: Number(t.amount || 0),
          cashAmount: Number(t.cashAmount || 0),
          customerSignature: t.customerSignature || "",
          status: t.status,
          createdAt: t.createdAt,
          invoiceNumber: t.invoiceNumber,
          transactionId: t.transactionId,
          transactionSource: "admin",
          employee: null,
        });
      }

      for (const t of employeeCylRaw) {
        const key = String(t.customer);
        const outstanding = Math.max(0, Number(t.amount || 0) - Number(t.cashAmount || 0));
        if (outstanding <= 0) continue;
        addToMap(cylByCustomer, key, {
          _id: t._id,
          type: t.type,
          cylinderSize: t.cylinderSize,
          quantity: t.quantity,
          amount: Number(t.amount || 0),
          cashAmount: Number(t.cashAmount || 0),
          customerSignature: t.customerSignature || "",
          status: t.status,
          createdAt: t.createdAt,
          invoiceNumber: t.invoiceNumber,
          transactionId: t.transactionId,
          transactionSource: "employee",
          employee: t.employee ? { _id: t.employee._id, name: t.employee.name } : null,
        });
      }

      const data = customers
        .map((customer) => {
          const cid = String(customer._id);
          const recentSales = (salesByCustomer.get(cid) || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          const recentCylinderTransactions = (cylByCustomer.get(cid) || []).sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
          );
          if (recentSales.length === 0 && recentCylinderTransactions.length === 0) return null;
          const totalSalesAmount = recentSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
          const totalPaidAmount = recentSales.reduce((sum, s) => sum + Number(s.receivedAmount || 0), 0);
          const totalCylinderAmount = recentCylinderTransactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
          const lastTransactionDate = [recentSales[0]?.createdAt, recentCylinderTransactions[0]?.createdAt]
            .filter(Boolean)
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
          return {
            _id: customer._id,
            name: customer.name,
            trNumber: customer.trNumber,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
            balance: Math.max(0, totalSalesAmount - totalPaidAmount) + totalCylinderAmount,
            totalDebit: customer.totalDebit || 0,
            totalCredit: customer.totalCredit || 0,
            status: "pending",
            totalSales: recentSales.length,
            totalSalesAmount,
            totalPaidAmount,
            totalCylinderAmount,
            totalDeposits: recentCylinderTransactions.filter((t) => t.type === "deposit").length,
            totalRefills: recentCylinderTransactions.filter((t) => t.type === "refill").length,
            totalReturns: recentCylinderTransactions.filter((t) => t.type === "return").length,
            hasRecentActivity: true,
            lastTransactionDate,
            recentSales,
            recentCylinderTransactions,
          };
        })
        .filter(Boolean);

      return NextResponse.json({ success: true, data, total: data.length });
    }

    // Detailed path for single customer expansion/receipt/download flows
    const [adminSalesRaw, employeeSalesRaw, adminCylRaw, employeeCylRaw] = await Promise.all([
      Sale.find(baseMatch).populate("items.product", "name category").lean(),
      EmployeeSale.find(baseMatch).populate("items.product", "name category").populate("employee", "name").lean(),
      CylinderTransaction.find(baseMatch).lean(),
      EmployeeCylinderTransaction.find(baseMatch).populate("employee", "name").lean(),
    ]);

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

    const customerData = customers.map((customer) => {
      const cid = String(customer._id);
      const sales = [
        ...adminSalesRaw.filter((s) => String(s.customer) === cid).map((s) => normalizeLedgerSale(s, "admin")),
        ...employeeSalesRaw.filter((s) => String(s.customer) === cid).map((s) => normalizeLedgerSale(s, "employee")),
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const cylinders = [...adminCylRaw.filter((t) => String(t.customer) === cid), ...employeeCylRaw.filter((t) => String(t.customer) === cid)].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      const totalSalesAmount = sales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
      const totalPaidAmount = sales.reduce((sum, s) => sum + Number(s.receivedAmount || 0), 0);
      const totalCylinderAmount = cylinders.reduce((sum, t) => sum + Number(t.amount || 0), 0);

      return {
        _id: customer._id,
        name: customer.name,
        trNumber: customer.trNumber,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        balance: Math.max(0, totalSalesAmount - totalPaidAmount) + totalCylinderAmount,
        totalDebit: customer.totalDebit || 0,
        totalCredit: customer.totalCredit || 0,
        status: "cleared",
        totalSales: sales.length,
        totalSalesAmount,
        totalPaidAmount,
        totalCylinderAmount,
        totalDeposits: cylinders.filter((t) => t.type === "deposit").length,
        totalRefills: cylinders.filter((t) => t.type === "refill").length,
        totalReturns: cylinders.filter((t) => t.type === "return").length,
        hasRecentActivity: Boolean(sales[0] || cylinders[0]),
        lastTransactionDate: [sales[0]?.createdAt, cylinders[0]?.createdAt].filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null,
        recentSales: sales.map((sale) => ({
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
          saleSource: sale._saleSource === "employee" ? "employee" : "admin",
          employee: sale.employee ? { _id: sale.employee._id, name: sale.employee.name } : null,
        })),
        recentCylinderTransactions: cylinders.map((transaction) => ({
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
          transactionSource: transaction.employee ? "employee" : "admin",
          employee: transaction.employee ? { _id: transaction.employee._id, name: transaction.employee.name } : null,
        })),
      };
    });

    return NextResponse.json({ success: true, data: customerData, total: customerData.length });
  } catch (error) {
    console.error("Ledger API error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch ledger data", details: error.message }, { status: 500 });
  }
}
