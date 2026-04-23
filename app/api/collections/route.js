import dbConnect from "@/lib/mongodb"
import { NextResponse } from "next/server"
import "@/models/Customer"
import Sale from "@/models/Sale"
import EmployeeSale from "@/models/EmployeeSale"
import CollectionReceipt from "@/models/CollectionReceipt"
import "@/models/User"
import "@/models/Product"
import { getNextRcNo } from "@/lib/invoice-generator"
import { normalizeSalePaymentState } from "@/lib/payment-status"
import {
  buildCollectionReceiptLineSnapshot,
  buildLegacyCollectionReceiptDrafts,
  buildLegacyCollectionReceiptFallbacks,
  mapCollectionReceiptRecord,
  roundToTwo,
} from "@/lib/collection-receipt-history"

// Cylinder transaction imports removed - collections only handle gas sales

// Disable caching for this route - force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const mapAdminSaleForHistory = (sale) => ({
  _id: sale?._id,
  model: "Sale",
  source: "admin",
  invoiceNumber: sale?.invoiceNumber || "",
  rcNo: sale?.rcNo || "",
  customer: sale?.customer
    ? {
        _id: sale.customer?._id || sale.customer,
        name: sale.customer?.name || "",
        phone: sale.customer?.phone || "",
        address: sale.customer?.address || "",
        trNumber: sale.customer?.trNumber || "",
      }
    : null,
  employee: null,
  items: Array.isArray(sale?.items)
    ? sale.items.map((item) => ({
        product: {
          name: item?.product?.name || "Unknown Product",
          price: item?.product?.price || item?.price || 0,
        },
        quantity: item?.quantity,
        price: item?.price,
        total: item?.total,
      }))
    : [],
  totalAmount: sale?.totalAmount || 0,
  receivedAmount: sale?.receivedAmount || 0,
  paymentStatus: sale?.paymentStatus || "pending",
  paymentMethod: sale?.paymentMethod || "Cash",
  collectionSignature: sale?.collectionSignature || "",
  collectionPaymentMethod: sale?.collectionPaymentMethod || "",
  collectionBankName: sale?.collectionBankName || "",
  collectionChequeNumber: sale?.collectionChequeNumber || "",
  collectionReceiptCreatedAt: sale?.collectionReceiptCreatedAt || null,
  createdAt: sale?.createdAt,
  updatedAt: sale?.updatedAt,
})

const mapEmployeeSaleForHistory = (sale) => ({
  _id: sale?._id,
  model: "EmployeeSale",
  source: "employee",
  invoiceNumber: sale?.invoiceNumber || "",
  rcNo: sale?.rcNo || "",
  customer: sale?.customer
    ? {
        _id: sale.customer?._id || sale.customer,
        name: sale.customer?.name || "",
        phone: sale.customer?.phone || "",
        address: sale.customer?.address || "",
        trNumber: sale.customer?.trNumber || "",
      }
    : null,
  employee: sale?.employee
    ? {
        _id: sale.employee?._id || sale.employee,
        name: sale.employee?.name || "",
        email: sale.employee?.email || "",
      }
    : null,
  items: Array.isArray(sale?.items)
    ? sale.items.map((item) => ({
        product: {
          name: item?.product?.name || "Unknown Product",
          price: item?.product?.price || item?.price || 0,
        },
        quantity: item?.quantity,
        price: item?.price,
        total: item?.total,
      }))
    : [],
  totalAmount: sale?.totalAmount || 0,
  receivedAmount: sale?.receivedAmount || 0,
  paymentStatus: sale?.paymentStatus || "pending",
  paymentMethod: sale?.paymentMethod || "Cash",
  collectionSignature: sale?.collectionSignature || "",
  collectionPaymentMethod: sale?.collectionPaymentMethod || "",
  collectionBankName: sale?.collectionBankName || "",
  collectionChequeNumber: sale?.collectionChequeNumber || "",
  collectionReceiptCreatedAt: sale?.collectionReceiptCreatedAt || null,
  createdAt: sale?.createdAt,
  updatedAt: sale?.updatedAt,
})

const persistLegacyReceiptDrafts = async (drafts) => {
  const persistable = (Array.isArray(drafts) ? drafts : []).filter((draft) => draft?.canPersist && draft?.rcNo)
  if (!persistable.length) return

  try {
    await CollectionReceipt.insertMany(
      persistable.map(({ groupKey, canPersist, ...receiptDoc }) => receiptDoc),
      { ordered: false }
    )
  } catch (error) {
    const writeErrors = Array.isArray(error?.writeErrors) ? error.writeErrors : []
    const onlyDuplicates =
      writeErrors.length > 0 &&
      writeErrors.every((writeError) => Number(writeError?.code) === 11000)

    if (!onlyDuplicates && error?.code !== 11000) {
      throw error
    }
  }
}

const materializeLegacyReceiptGroup = async (customerId, rcNo) => {
  if (!customerId || !rcNo) return

  const existingReceipt = await CollectionReceipt.findOne({ rcNo }).select("_id").lean()
  if (existingReceipt) return

  const [adminSales, employeeSales] = await Promise.all([
    Sale.find({ customer: customerId, rcNo })
      .populate("customer", "name phone address trNumber")
      .populate("items.product", "name price")
      .lean(),
    EmployeeSale.find({ customer: customerId, rcNo })
      .populate("customer", "name phone address trNumber")
      .populate("employee", "name email")
      .populate("items.product", "name price")
      .lean(),
  ])

  const drafts = buildLegacyCollectionReceiptDrafts(
    [
      ...adminSales.map(mapAdminSaleForHistory),
      ...employeeSales.map(mapEmployeeSaleForHistory),
    ],
    new Set(),
    { includeWithoutRcNo: false }
  )

  await persistLegacyReceiptDrafts(drafts.filter((draft) => String(draft.rcNo || "") === String(rcNo)))
}

// GET: list all pending gas sales invoices (admin and employee sales only, excludes cylinder transactions)
// Query params: customerId, employeeId, type (pending|collected|all)
export async function GET(request) {
  try {
    await dbConnect()

    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get("customerId")
    const employeeId = searchParams.get("employeeId") // optional filter
    const type = searchParams.get("type") || "pending" // pending, collected, or all

    const baseQuery = {
      ...(customerId ? { customer: customerId } : {}),
      $expr: { $gt: [{ $ifNull: ["$totalAmount", 0] }, 0] },
    }
    const employeeBaseQuery = {
      ...(customerId ? { customer: customerId } : {}),
      ...(employeeId ? { employee: employeeId } : {}),
      $expr: { $gt: [{ $ifNull: ["$totalAmount", 0] }, 0] },
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

    const mapSale = (s) => {
      const normalizedPayment = normalizeSalePaymentState({
        totalAmount: s.totalAmount,
        receivedAmount: s.receivedAmount,
        paymentStatus: s.paymentStatus,
      })

      return ({
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
      totalAmount: normalizedPayment.totalAmount,
      receivedAmount: normalizedPayment.receivedAmount,
      balance: normalizedPayment.balance,
      paymentStatus: normalizedPayment.paymentStatus,
      paymentMethod: s.paymentMethod || 'Cash',
      bankName: s.bankName || '',
      chequeNumber: s.chequeNumber || '',
      collectionSignature: s.collectionSignature || '',
      collectionPaymentMethod: s.collectionPaymentMethod || '',
      collectionBankName: s.collectionBankName || '',
      collectionChequeNumber: s.collectionChequeNumber || '',
      collectionReceiptCreatedAt: s.collectionReceiptCreatedAt || null,
      createdAt: s.createdAt,
    })
    }

    const mapEmpSale = (s) => {
      const normalizedPayment = normalizeSalePaymentState({
        totalAmount: s.totalAmount,
        receivedAmount: s.receivedAmount,
        paymentStatus: s.paymentStatus,
      })

      return ({
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
      totalAmount: normalizedPayment.totalAmount,
      receivedAmount: normalizedPayment.receivedAmount,
      balance: normalizedPayment.balance,
      paymentStatus: normalizedPayment.paymentStatus,
      paymentMethod: s.paymentMethod || 'Cash',
      bankName: s.bankName || '',
      chequeNumber: s.chequeNumber || '',
      collectionSignature: s.collectionSignature || '',
      collectionPaymentMethod: s.collectionPaymentMethod || '',
      collectionBankName: s.collectionBankName || '',
      collectionChequeNumber: s.collectionChequeNumber || '',
      collectionReceiptCreatedAt: s.collectionReceiptCreatedAt || null,
      createdAt: s.createdAt,
    })
    }

    // Cylinder mapping functions removed - collections only handle gas sales

    // Only include gas sales data, exclude cylinder transactions
    // Filter out debit invoices (totalAmount <= 0) - only show credit invoices (totalAmount > 0)
    const salesData = [
      ...adminSales.map(mapSale),
      ...employeeSales.map(mapEmpSale),
    ]
      .filter(invoice => {
        // Only include credit invoices (positive totalAmount)
        // Exclude debit invoices (zero or negative totalAmount)
        return Number(invoice.totalAmount || 0) > 0
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    if (type === "collected") {
      let savedReceipts = await CollectionReceipt.find({
        ...(customerId ? { customer: customerId } : {}),
      })
        .sort({ receiptCreatedAt: -1, createdAt: -1 })
        .lean()

      const existingRcNos = new Set(
        savedReceipts
          .map((receipt) => String(receipt.rcNo || "").trim())
          .filter(Boolean)
      )

      const legacyDrafts = buildLegacyCollectionReceiptDrafts(salesData, existingRcNos)
      const persistableLegacyDrafts = legacyDrafts.filter((draft) => draft.canPersist)
      if (persistableLegacyDrafts.length) {
        await persistLegacyReceiptDrafts(persistableLegacyDrafts)
        savedReceipts = await CollectionReceipt.find({
          ...(customerId ? { customer: customerId } : {}),
        })
          .sort({ receiptCreatedAt: -1, createdAt: -1 })
          .lean()
      }

      const savedReceiptData = savedReceipts
        .map((receipt) => mapCollectionReceiptRecord(receipt))
        .filter((receipt) => {
          if (!employeeId) return true
          return receipt.lines.some((line) => line.employee?._id === employeeId)
        })

      const nonPersistableFallbackReceipts = buildLegacyCollectionReceiptFallbacks(
        salesData.filter((sale) => !sale?.rcNo),
        new Set()
      )
      const data = [...savedReceiptData, ...nonPersistableFallbackReceipts].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )

      return NextResponse.json({ success: true, data })
    }

    let data = salesData

    // Ensure the response matches the requested type even after tolerance normalization above.
    if (type === "pending") {
      data = data.filter((inv) => inv.paymentStatus !== "cleared" && Number(inv.balance || 0) > 0)
    }

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
    const signature = typeof body?.signature === "string" ? body.signature : ""
    const collectionPaymentMethod = typeof body?.paymentMethod === "string" ? body.paymentMethod : ""
    const collectionBankName = typeof body?.bankName === "string" ? body.bankName : ""
    const collectionChequeNumber = typeof body?.chequeNumber === "string" ? body.chequeNumber : ""
    const collectionReceiptCreatedAt = body?.receiptCreatedAt ? new Date(body.receiptCreatedAt) : new Date()

    if (!payments.length) {
      return NextResponse.json({ success: false, error: "No payments provided" }, { status: 400 })
    }

    const results = []
    const receiptLines = []
    let receiptCustomer = null

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
          .populate("customer", "name phone address trNumber")
          .populate("items.product", "name")
        if (!sale) continue
        if (sale.rcNo) {
          await materializeLegacyReceiptGroup(sale.customer?._id || sale.customer, sale.rcNo)
        }
        const currentReceived = roundToTwo(sale.receivedAmount || 0)
        const total = roundToTwo(sale.totalAmount || 0)
        const balance = roundToTwo(Math.max(0, total - currentReceived))
        const apply = roundToTwo(Math.min(balance, amount))
        if (apply <= 0) {
          results.push({ id, model, applied: 0, status: sale.paymentStatus })
          continue
        }
        if (receiptCustomer && String(receiptCustomer._id || "") !== String(sale.customer?._id || "")) {
          return NextResponse.json(
            { success: false, error: "All collection payments in one receipt must belong to the same customer" },
            { status: 400 }
          )
        }
        receiptCustomer = receiptCustomer || {
          _id: sale.customer?._id || null,
          name: sale.customer?.name || "",
          phone: sale.customer?.phone || "",
          address: sale.customer?.address || "",
          trNumber: sale.customer?.trNumber || "",
        }
        const receiptLine = buildCollectionReceiptLineSnapshot({
          sale,
          model: "Sale",
          source: "admin",
          appliedAmount: apply,
        })
        const normalizedPayment = normalizeSalePaymentState({
          totalAmount: total,
          receivedAmount: roundToTwo(currentReceived + apply),
          paymentStatus: sale.paymentStatus,
        })
        sale.receivedAmount = normalizedPayment.receivedAmount
        sale.paymentStatus = normalizedPayment.paymentStatus
        // Store RC-NO on the sale record if this is the first payment received
        if (!sale.rcNo && apply > 0) {
          sale.rcNo = rcNo
        }
        if (collectionReceiptCreatedAt && !sale.collectionReceiptCreatedAt) {
          sale.collectionReceiptCreatedAt = collectionReceiptCreatedAt
        }
        await sale.save()
        receiptLines.push(receiptLine)
        console.log(`[COLLECTION] Sale ${id}: receivedAmount=${sale.receivedAmount}, total=${total}, remaining=${normalizedPayment.balance}, status=${sale.paymentStatus}`)
        results.push({
          id,
          model,
          applied: apply,
          previousReceived: receiptLine.previousReceived,
          newReceivedAmount: sale.receivedAmount,
          newStatus: sale.paymentStatus,
          remainingAmount: receiptLine.remainingAmount,
        })
      } else if (model === "EmployeeSale") {
        const sale = await EmployeeSale.findById(id)
          .populate("customer", "name phone address trNumber")
          .populate("employee", "name email")
          .populate("items.product", "name")
        if (!sale) continue
        if (sale.rcNo) {
          await materializeLegacyReceiptGroup(sale.customer?._id || sale.customer, sale.rcNo)
        }
        const currentReceived = roundToTwo(sale.receivedAmount || 0)
        const total = roundToTwo(sale.totalAmount || 0)
        const balance = roundToTwo(Math.max(0, total - currentReceived))
        const apply = roundToTwo(Math.min(balance, amount))
        if (apply <= 0) {
          results.push({ id, model, applied: 0, status: sale.paymentStatus })
          continue
        }
        if (receiptCustomer && String(receiptCustomer._id || "") !== String(sale.customer?._id || "")) {
          return NextResponse.json(
            { success: false, error: "All collection payments in one receipt must belong to the same customer" },
            { status: 400 }
          )
        }
        receiptCustomer = receiptCustomer || {
          _id: sale.customer?._id || null,
          name: sale.customer?.name || "",
          phone: sale.customer?.phone || "",
          address: sale.customer?.address || "",
          trNumber: sale.customer?.trNumber || "",
        }
        const receiptLine = buildCollectionReceiptLineSnapshot({
          sale,
          model: "EmployeeSale",
          source: "employee",
          appliedAmount: apply,
        })
        const normalizedPayment = normalizeSalePaymentState({
          totalAmount: total,
          receivedAmount: roundToTwo(currentReceived + apply),
          paymentStatus: sale.paymentStatus,
        })
        sale.receivedAmount = normalizedPayment.receivedAmount
        sale.paymentStatus = normalizedPayment.paymentStatus
        // Store RC-NO on the employee sale record if this is the first payment received
        if (!sale.rcNo && apply > 0) {
          sale.rcNo = rcNo
        }
        if (collectionReceiptCreatedAt && !sale.collectionReceiptCreatedAt) {
          sale.collectionReceiptCreatedAt = collectionReceiptCreatedAt
        }
        await sale.save()
        receiptLines.push(receiptLine)
        console.log(`[COLLECTION] EmployeeSale ${id}: receivedAmount=${sale.receivedAmount}, total=${total}, remaining=${normalizedPayment.balance}, status=${sale.paymentStatus}`)
        results.push({
          id,
          model,
          applied: apply,
          previousReceived: receiptLine.previousReceived,
          newReceivedAmount: sale.receivedAmount,
          newStatus: sale.paymentStatus,
          remainingAmount: receiptLine.remainingAmount,
        })
      }
      // Cylinder transactions are no longer handled in collections
    }

    if (!receiptLines.length) {
      return NextResponse.json({ success: false, error: "No valid collection amounts were applied" }, { status: 400 })
    }

    const savedReceipt = await CollectionReceipt.create({
      rcNo,
      customer: receiptCustomer?._id || null,
      customerSnapshot: {
        _id: receiptCustomer?._id || null,
        name: receiptCustomer?.name || "",
        phone: receiptCustomer?.phone || "",
        address: receiptCustomer?.address || "",
        trNumber: receiptCustomer?.trNumber || "",
      },
      signature,
      paymentMethod: collectionPaymentMethod || "Cash",
      bankName: collectionBankName,
      chequeNumber: collectionChequeNumber,
      receiptCreatedAt: collectionReceiptCreatedAt || new Date(),
      totalAppliedAmount: receiptLines.reduce((sum, line) => sum + Number(line.appliedAmount || 0), 0),
      lines: receiptLines,
    })

    return NextResponse.json({
      success: true,
      data: {
        results,
        rcNo,
        receiptId: String(savedReceipt._id),
        receipt: mapCollectionReceiptRecord(savedReceipt.toObject()),
      },
    })
  } catch (error) {
    console.error("Collections POST error:", error)
    return NextResponse.json({ success: false, error: error?.message || "Failed to apply collections" }, { status: 500 })
  }
}

// PATCH: persist collection receipt signature/meta for already-collected invoices
// Body: { invoices: [{ model: "Sale"|"EmployeeSale", id: string }], signature: string, paymentMethod?: string, bankName?: string, chequeNumber?: string, receiptCreatedAt?: string }
export async function PATCH(request) {
  try {
    await dbConnect()
    const body = await request.json()
    const receiptId = typeof body?.receiptId === "string" ? body.receiptId : ""
    const rcNo = typeof body?.rcNo === "string" ? body.rcNo : ""
    const invoices = Array.isArray(body?.invoices) ? body.invoices : []
    const signature = typeof body?.signature === "string" ? body.signature : ""
    const collectionPaymentMethod = typeof body?.paymentMethod === "string" ? body.paymentMethod : ""
    const collectionBankName = typeof body?.bankName === "string" ? body.bankName : ""
    const collectionChequeNumber = typeof body?.chequeNumber === "string" ? body.chequeNumber : ""
    const collectionReceiptCreatedAt = body?.receiptCreatedAt ? new Date(body.receiptCreatedAt) : null

    if ((receiptId || rcNo) && (signature || collectionPaymentMethod || collectionBankName || collectionChequeNumber || collectionReceiptCreatedAt)) {
      const receipt = await CollectionReceipt.findOne(receiptId ? { _id: receiptId } : { rcNo })
      if (!receipt) {
        return NextResponse.json({ success: false, error: "Collection receipt not found" }, { status: 404 })
      }

      if (signature) receipt.signature = signature
      if (collectionPaymentMethod) receipt.paymentMethod = collectionPaymentMethod
      if (collectionBankName) receipt.bankName = collectionBankName
      if (collectionChequeNumber) receipt.chequeNumber = collectionChequeNumber
      if (collectionReceiptCreatedAt) receipt.receiptCreatedAt = collectionReceiptCreatedAt

      await receipt.save()

      return NextResponse.json({
        success: true,
        data: {
          receiptId: String(receipt._id),
          receipt: mapCollectionReceiptRecord(receipt.toObject()),
        },
      })
    }

    if (!invoices.length || !signature) {
      return NextResponse.json({ success: false, error: "Receipt or legacy invoices and signature are required" }, { status: 400 })
    }

    const results = []

    for (const invoice of invoices) {
      const model = String(invoice?.model || "")
      const id = String(invoice?.id || "")
      if (!id) continue

      const targetModel = model === "EmployeeSale" ? EmployeeSale : Sale
      const doc = await targetModel.findById(id)
      if (!doc) continue

      doc.collectionSignature = signature
      if (collectionPaymentMethod) doc.collectionPaymentMethod = collectionPaymentMethod
      if (collectionBankName) doc.collectionBankName = collectionBankName
      if (collectionChequeNumber) doc.collectionChequeNumber = collectionChequeNumber
      if (collectionReceiptCreatedAt) doc.collectionReceiptCreatedAt = collectionReceiptCreatedAt

      await doc.save()
      results.push({ id, model })
    }

    return NextResponse.json({ success: true, data: { results } })
  } catch (error) {
    console.error("Collections PATCH error:", error)
    return NextResponse.json({ success: false, error: error?.message || "Failed to save collection receipt signature" }, { status: 500 })
  }
}
