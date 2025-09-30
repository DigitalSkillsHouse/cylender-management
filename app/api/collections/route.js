import dbConnect from "@/lib/mongodb"
import { NextResponse } from "next/server"
import Sale from "@/models/Sale"
import EmployeeSale from "@/models/EmployeeSale"
import CylinderTransaction from "@/models/Cylinder"
import EmployeeCylinderTransaction from "@/models/EmployeeCylinderTransaction"

// GET: list all pending invoices across admin and employee sales
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

    // Build cylinder pending query (for cylinder transactions, we check if balance > 0 AND status !== "cleared")
    const cylinderPendingQuery = {
      $and: [
        { 
          $expr: { 
            $gt: [ 
              { $subtract: [
                { $ifNull: ["$amount", 0] }, 
                { $ifNull: ["$receivedAmount", 0] }
              ]}, 
              0 
            ] 
          }
        },
        { status: { $ne: "cleared" } }
      ]
    }

    const [adminSales, employeeSales, adminCylinders, employeeCylinders] = await Promise.all([
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
      CylinderTransaction.find(customerId ? { ...cylinderPendingQuery, customer: customerId } : cylinderPendingQuery)
        .populate("customer", "name phone")
        .populate("product", "name")
        .lean(),
      EmployeeCylinderTransaction.find({
          ...(customerId ? { customer: customerId } : {}),
          ...(employeeId ? { employee: employeeId } : {}),
          ...cylinderPendingQuery,
        })
        .populate("customer", "name phone")
        .populate("employee", "name email")
        .populate("product", "name")
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

    const mapCylinder = (c) => ({
      _id: c._id,
      model: "CylinderTransaction",
      source: "admin",
      invoiceNumber: c.invoiceNumber || `CYL-${c._id.toString().slice(-6)}`,
      customer: c.customer ? { _id: c.customer._id, name: c.customer.name, phone: c.customer.phone } : null,
      employee: null,
      items: [{
        product: c.product ? { name: c.product.name } : { name: 'Unknown Product' },
        quantity: c.quantity || 1,
        price: c.amount || 0,
        total: c.amount || 0
      }],
      totalAmount: Number(c.amount || 0),
      receivedAmount: Number(c.receivedAmount || 0),
      balance: Math.max(0, Number(c.amount || 0) - Number(c.receivedAmount || 0)),
      paymentStatus: c.status || 'pending',
      createdAt: c.createdAt,
    })

    const mapEmpCylinder = (c) => ({
      _id: c._id,
      model: "EmployeeCylinderTransaction",
      source: "employee",
      invoiceNumber: c.invoiceNumber || `EMP-CYL-${c._id.toString().slice(-6)}`,
      customer: c.customer ? { _id: c.customer._id, name: c.customer.name, phone: c.customer.phone } : null,
      employee: c.employee ? { _id: c.employee._id, name: c.employee.name, email: c.employee.email } : null,
      items: [{
        product: c.product ? { name: c.product.name } : { name: 'Unknown Product' },
        quantity: c.quantity || 1,
        price: c.amount || 0,
        total: c.amount || 0
      }],
      totalAmount: Number(c.amount || 0),
      receivedAmount: Number(c.receivedAmount || 0),
      balance: Math.max(0, Number(c.amount || 0) - Number(c.receivedAmount || 0)),
      paymentStatus: c.status || 'pending',
      createdAt: c.createdAt,
    })

    const data = [
      ...adminSales.map(mapSale),
      ...employeeSales.map(mapEmpSale),
      ...adminCylinders.map(mapCylinder),
      ...employeeCylinders.map(mapEmpCylinder),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Collections GET error:", error)
    return NextResponse.json({ success: false, error: error?.message || "Failed to fetch pending invoices" }, { status: 500 })
  }
}

// POST: apply collection payments to multiple invoices
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
      } else if (model === "CylinderTransaction") {
        const cylinder = await CylinderTransaction.findById(id)
        if (!cylinder) continue
        const currentReceived = Number(cylinder.receivedAmount || 0)
        const total = Number(cylinder.amount || 0)
        const balance = Math.max(0, total - currentReceived)
        const apply = Math.min(balance, amount)
        if (apply <= 0) {
          results.push({ id, model, applied: 0, status: cylinder.status })
          continue
        }
        cylinder.receivedAmount = currentReceived + apply
        cylinder.status = cylinder.receivedAmount >= total ? "cleared" : "pending"
        await cylinder.save()
        results.push({ id, model, applied: apply, newReceivedAmount: cylinder.receivedAmount, newStatus: cylinder.status })
      } else if (model === "EmployeeCylinderTransaction") {
        const cylinder = await EmployeeCylinderTransaction.findById(id)
        if (!cylinder) continue
        const currentReceived = Number(cylinder.receivedAmount || 0)
        const total = Number(cylinder.amount || 0)
        const balance = Math.max(0, total - currentReceived)
        const apply = Math.min(balance, amount)
        if (apply <= 0) {
          results.push({ id, model, applied: 0, status: cylinder.status })
          continue
        }
        cylinder.receivedAmount = currentReceived + apply
        cylinder.status = cylinder.receivedAmount >= total ? "cleared" : "pending"
        await cylinder.save()
        results.push({ id, model, applied: apply, newReceivedAmount: cylinder.receivedAmount, newStatus: cylinder.status })
      }
    }

    return NextResponse.json({ success: true, data: { results } })
  } catch (error) {
    console.error("Collections POST error:", error)
    return NextResponse.json({ success: false, error: error?.message || "Failed to apply collections" }, { status: 500 })
  }
}
