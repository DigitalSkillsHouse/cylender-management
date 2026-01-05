import dbConnect from "@/lib/mongodb"
import { NextResponse } from "next/server"
import Sale from "@/models/Sale"
import EmployeeSale from "@/models/EmployeeSale"
import { getNextRcNo } from "@/lib/invoice-generator"

// Helper function to round to 2 decimal places to avoid floating-point precision errors
const roundToTwo = (value) => {
  if (value === null || value === undefined || isNaN(value)) {
    return 0;
  }
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
};
// Cylinder transaction imports removed - collections only handle gas sales

// Disable caching for this route - force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// GET: list all pending gas sales invoices (admin and employee sales only, excludes cylinder transactions)
// Query params: customerId, employeeId, type (pending|collected|all)
export async function GET(request) {
  try {
    await dbConnect()

    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get("customerId")
    const employeeId = searchParams.get("employeeId") // optional filter
    const type = searchParams.get("type") || "pending" // pending, collected, or all

    // Build queries: pending means receivedAmount < totalAmount AND paymentStatus !== "cleared"
    // Also exclude debit invoices (totalAmount <= 0) - only show credit invoices (totalAmount > 0)
    const pendingQuery = {
      $and: [
        { $expr: { $lt: [ { $ifNull: ["$receivedAmount", 0] }, { $ifNull: ["$totalAmount", 0] } ] } },
        { paymentStatus: { $ne: "cleared" } },
        { $expr: { $gt: [ { $ifNull: ["$totalAmount", 0] }, 0 ] } } // Only credit invoices (exclude debit invoices)
      ]
    }

    // Build query for collected invoices: receivedAmount > 0 AND totalAmount > 0 (only credit invoices, exclude debit invoices)
    // Credit invoices = normal sales where customer owes money (positive totalAmount)
    // Debit invoices = refunds/adjustments where company owes customer (negative or zero totalAmount)
    const collectedQuery = {
      $and: [
        { $expr: { $gt: [ { $ifNull: ["$receivedAmount", 0] }, 0 ] } },
        { $expr: { $gt: [ { $ifNull: ["$totalAmount", 0] }, 0 ] } }
      ]
    }

    // Determine which query to use based on type parameter
    let queryToUse = pendingQuery
    if (type === "collected") {
      queryToUse = collectedQuery
    } else if (type === "all") {
      // For "all", we'll fetch both and combine, but still exclude debit invoices
      // Only show credit invoices (totalAmount > 0)
      queryToUse = {
        $expr: { $gt: [ { $ifNull: ["$totalAmount", 0] }, 0 ] }
      }
    }

    // Only handle gas sales - cylinder queries removed

    // Only fetch gas sales data, exclude cylinder transactions
    const baseQuery = customerId ? { ...queryToUse, customer: customerId } : queryToUse
    const employeeBaseQuery = {
      ...(customerId ? { customer: customerId } : {}),
      ...(employeeId ? { employee: employeeId } : {}),
      ...queryToUse,
    }

    const [adminSales, employeeSales] = await Promise.all([
      Sale.find(baseQuery)
        .populate("customer", "name phone address trNumber")
        .populate("items.product", "name price")
        .lean(),
      EmployeeSale.find(employeeBaseQuery)
        .populate("customer", "name phone address trNumber")
        .populate("employee", "name email")
        .populate("items.product", "name price")
        .lean(),
    ])

    const mapSale = (s) => ({
      _id: s._id,
      model: "Sale",
      source: "admin",
      invoiceNumber: s.invoiceNumber,
      rcNo: s.rcNo || '',
      customer: s.customer ? { 
        _id: s.customer._id, 
        name: s.customer.name, 
        phone: s.customer.phone || '',
        address: s.customer.address || '',
        trNumber: s.customer.trNumber || ''
      } : null,
      employee: null,
      items: s.items?.map(item => ({
        product: item.product ? { 
          name: item.product.name,
          price: item.product.price || item.price || 0
        } : { name: 'Unknown Product', price: item.price || 0 },
        quantity: item.quantity,
        price: item.price,
        total: item.total
      })) || [],
      totalAmount: Number(s.totalAmount || 0),
      receivedAmount: Number(s.receivedAmount || 0),
      balance: Math.max(0, Number(s.totalAmount || 0) - Number(s.receivedAmount || 0)),
      paymentStatus: s.paymentStatus,
      paymentMethod: s.paymentMethod || 'Cash',
      bankName: s.bankName || '',
      chequeNumber: s.chequeNumber || '',
      createdAt: s.createdAt,
    })

    const mapEmpSale = (s) => ({
      _id: s._id,
      model: "EmployeeSale",
      source: "employee",
      invoiceNumber: s.invoiceNumber,
      rcNo: s.rcNo || '',
      customer: s.customer ? { 
        _id: s.customer._id, 
        name: s.customer.name, 
        phone: s.customer.phone || '',
        address: s.customer.address || '',
        trNumber: s.customer.trNumber || ''
      } : null,
      employee: s.employee ? { _id: s.employee._id, name: s.employee.name, email: s.employee.email } : null,
      items: s.items?.map(item => ({
        product: item.product ? { 
          name: item.product.name,
          price: item.product.price || item.price || 0
        } : { name: 'Unknown Product', price: item.price || 0 },
        quantity: item.quantity,
        price: item.price,
        total: item.total
      })) || [],
      totalAmount: Number(s.totalAmount || 0),
      receivedAmount: Number(s.receivedAmount || 0),
      balance: Math.max(0, Number(s.totalAmount || 0) - Number(s.receivedAmount || 0)),
      paymentStatus: s.paymentStatus,
      paymentMethod: s.paymentMethod || 'Cash',
      bankName: s.bankName || '',
      chequeNumber: s.chequeNumber || '',
      createdAt: s.createdAt,
    })

    // Cylinder mapping functions removed - collections only handle gas sales

    // Only include gas sales data, exclude cylinder transactions
    // Filter out debit invoices (totalAmount <= 0) - only show credit invoices (totalAmount > 0)
    const data = [
      ...adminSales.map(mapSale),
      ...employeeSales.map(mapEmpSale),
    ]
      .filter(invoice => {
        // Only include credit invoices (positive totalAmount)
        // Exclude debit invoices (zero or negative totalAmount)
        return Number(invoice.totalAmount || 0) > 0
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

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

    // Generate RC-NO for this collection receipt (one RC-NO per collection batch)
    const rcNo = await getNextRcNo()

    for (const p of payments) {
      const model = String(p.model || "")
      const id = String(p.id || "")
      const amount = Number(p.amount || 0)
      if (!id || !amount || amount <= 0) continue

      // Only handle gas sales payments, exclude cylinder transactions
      if (model === "Sale") {
        const sale = await Sale.findById(id)
        if (!sale) continue
        const currentReceived = roundToTwo(sale.receivedAmount || 0)
        const total = roundToTwo(sale.totalAmount || 0)
        const balance = roundToTwo(Math.max(0, total - currentReceived))
        const apply = roundToTwo(Math.min(balance, amount))
        if (apply <= 0) {
          results.push({ id, model, applied: 0, status: sale.paymentStatus })
          continue
        }
        sale.receivedAmount = roundToTwo(currentReceived + apply)
        // Update payment status: cleared if received amount equals or exceeds total (with small tolerance for floating point)
        const remainingBalance = roundToTwo(total - sale.receivedAmount)
        sale.paymentStatus = remainingBalance <= 0.01 ? "cleared" : "pending"
        // Store RC-NO on the sale record if this is the first payment received
        if (!sale.rcNo && apply > 0) {
          sale.rcNo = rcNo
        }
        await sale.save()
        console.log(`[COLLECTION] Sale ${id}: receivedAmount=${sale.receivedAmount}, total=${total}, remaining=${remainingBalance}, status=${sale.paymentStatus}`)
        results.push({ id, model, applied: apply, newReceivedAmount: sale.receivedAmount, newStatus: sale.paymentStatus })
      } else if (model === "EmployeeSale") {
        const sale = await EmployeeSale.findById(id)
        if (!sale) continue
        const currentReceived = roundToTwo(sale.receivedAmount || 0)
        const total = roundToTwo(sale.totalAmount || 0)
        const balance = roundToTwo(Math.max(0, total - currentReceived))
        const apply = roundToTwo(Math.min(balance, amount))
        if (apply <= 0) {
          results.push({ id, model, applied: 0, status: sale.paymentStatus })
          continue
        }
        sale.receivedAmount = roundToTwo(currentReceived + apply)
        // Update payment status: cleared if received amount equals or exceeds total (with small tolerance for floating point)
        const remainingBalance = roundToTwo(total - sale.receivedAmount)
        sale.paymentStatus = remainingBalance <= 0.01 ? "cleared" : "pending"
        // Store RC-NO on the employee sale record if this is the first payment received
        if (!sale.rcNo && apply > 0) {
          sale.rcNo = rcNo
        }
        await sale.save()
        console.log(`[COLLECTION] EmployeeSale ${id}: receivedAmount=${sale.receivedAmount}, total=${total}, remaining=${remainingBalance}, status=${sale.paymentStatus}`)
        results.push({ id, model, applied: apply, newReceivedAmount: sale.receivedAmount, newStatus: sale.paymentStatus })
      }
      // Cylinder transactions are no longer handled in collections
    }

    return NextResponse.json({ success: true, data: { results, rcNo } })
  } catch (error) {
    console.error("Collections POST error:", error)
    return NextResponse.json({ success: false, error: error?.message || "Failed to apply collections" }, { status: 500 })
  }
}
