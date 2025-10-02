import dbConnect from "@/lib/mongodb"
import { NextResponse } from "next/server"
import Sale from "@/models/Sale"
import EmployeeSale from "@/models/EmployeeSale"
// Cylinder transaction imports removed - collections only handle gas sales

// GET: list all pending gas sales invoices (admin and employee sales only, excludes cylinder transactions)
export async function GET(request) {
  try {
    await dbConnect()

    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get("customerId")
    const employeeId = searchParams.get("employeeId") // optional filter

    // Build queries: pending means receivedAmount < totalAmount AND paymentStatus !== "cleared"
    const pendingQuery = {
      $and: [
        { $expr: { $lt: [ { $ifNull: ["$receivedAmount", 0] }, { $ifNull: ["$totalAmount", 0] } ] } },
        { paymentStatus: { $ne: "cleared" } }
      ]
    }

    // Only handle gas sales - cylinder queries removed

    // Only fetch gas sales data, exclude cylinder transactions
    const [adminSales, employeeSales] = await Promise.all([
      Sale.find(customerId ? { ...pendingQuery, customer: customerId } : pendingQuery)
        .populate("customer", "name phone")
        .populate("items.product", "name")
        .lean(),
      EmployeeSale.find({
          ...(customerId ? { customer: customerId } : {}),
          ...(employeeId ? { employee: employeeId } : {}),
          ...pendingQuery,
        })
        .populate("customer", "name phone")
        .populate("employee", "name email")
        .populate("items.product", "name")
        .lean(),
    ])

    const mapSale = (s) => ({
      _id: s._id,
      model: "Sale",
      source: "admin",
      invoiceNumber: s.invoiceNumber,
      customer: s.customer ? { _id: s.customer._id, name: s.customer.name, phone: s.customer.phone } : null,
      employee: null,
      items: s.items?.map(item => ({
        product: item.product ? { name: item.product.name } : { name: 'Unknown Product' },
        quantity: item.quantity,
        price: item.price,
        total: item.total
      })) || [],
      totalAmount: Number(s.totalAmount || 0),
      receivedAmount: Number(s.receivedAmount || 0),
      balance: Math.max(0, Number(s.totalAmount || 0) - Number(s.receivedAmount || 0)),
      paymentStatus: s.paymentStatus,
      createdAt: s.createdAt,
    })

    const mapEmpSale = (s) => ({
      _id: s._id,
      model: "EmployeeSale",
      source: "employee",
      invoiceNumber: s.invoiceNumber,
      customer: s.customer ? { _id: s.customer._id, name: s.customer.name, phone: s.customer.phone } : null,
      employee: s.employee ? { _id: s.employee._id, name: s.employee.name, email: s.employee.email } : null,
      items: s.items?.map(item => ({
        product: item.product ? { name: item.product.name } : { name: 'Unknown Product' },
        quantity: item.quantity,
        price: item.price,
        total: item.total
      })) || [],
      totalAmount: Number(s.totalAmount || 0),
      receivedAmount: Number(s.receivedAmount || 0),
      balance: Math.max(0, Number(s.totalAmount || 0) - Number(s.receivedAmount || 0)),
      paymentStatus: s.paymentStatus,
      createdAt: s.createdAt,
    })

    // Cylinder mapping functions removed - collections only handle gas sales

    // Only include gas sales data, exclude cylinder transactions
    const data = [
      ...adminSales.map(mapSale),
      ...employeeSales.map(mapEmpSale),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Collections GET error:", error)
    return NextResponse.json({ success: false, error: error?.message || "Failed to fetch pending invoices" }, { status: 500 })
  }
}

// POST: apply collection payments to gas sales invoices only (excludes cylinder transactions)
// Body: { payments: [{ model: "Sale"|"EmployeeSale", id: string, amount: number }], note?: string, collectorId?: string }
export async function POST(request) {
  try {
    await dbConnect()
    const body = await request.json()
    const payments = Array.isArray(body?.payments) ? body.payments : []

    if (!payments.length) {
      return NextResponse.json({ success: false, error: "No payments provided" }, { status: 400 })
    }

    const updates = []
    const results = []

    for (const p of payments) {
      const model = String(p.model || "")
      const id = String(p.id || "")
      const amount = Number(p.amount || 0)
      if (!id || !amount || amount <= 0) continue

      // Only handle gas sales payments, exclude cylinder transactions
      if (model === "Sale") {
        const sale = await Sale.findById(id)
        if (!sale) continue
        const currentReceived = Number(sale.receivedAmount || 0)
        const total = Number(sale.totalAmount || 0)
        const balance = Math.max(0, total - currentReceived)
        const apply = Math.min(balance, amount)
        if (apply <= 0) {
          results.push({ id, model, applied: 0, status: sale.paymentStatus })
          continue
        }
        sale.receivedAmount = currentReceived + apply
        sale.paymentStatus = sale.receivedAmount >= total ? "cleared" : "pending"
        await sale.save()
        results.push({ id, model, applied: apply, newReceivedAmount: sale.receivedAmount, newStatus: sale.paymentStatus })
      } else if (model === "EmployeeSale") {
        const sale = await EmployeeSale.findById(id)
        if (!sale) continue
        const currentReceived = Number(sale.receivedAmount || 0)
        const total = Number(sale.totalAmount || 0)
        const balance = Math.max(0, total - currentReceived)
        const apply = Math.min(balance, amount)
        if (apply <= 0) {
          results.push({ id, model, applied: 0, status: sale.paymentStatus })
          continue
        }
        sale.receivedAmount = currentReceived + apply
        sale.paymentStatus = sale.receivedAmount >= total ? "cleared" : "pending"
        await sale.save()
        results.push({ id, model, applied: apply, newReceivedAmount: sale.receivedAmount, newStatus: sale.paymentStatus })
      }
      // Cylinder transactions are no longer handled in collections
    }

    return NextResponse.json({ success: true, data: { results } })
  } catch (error) {
    console.error("Collections POST error:", error)
    return NextResponse.json({ success: false, error: error?.message || "Failed to apply collections" }, { status: 500 })
  }
}
