import { normalizeSalePaymentState } from "@/lib/payment-status"

export const roundToTwo = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 0
  }

  return Math.trunc(Number(value) * 100) / 100
}

const toPlainCustomer = (customer) => {
  if (!customer) {
    return {
      _id: null,
      name: "",
      phone: "",
      address: "",
      trNumber: "",
    }
  }

  return {
    _id: customer?._id || customer || null,
    name: customer?.name || "",
    phone: customer?.phone || "",
    address: customer?.address || "",
    trNumber: customer?.trNumber || "",
  }
}

const buildItemSummary = (items) => {
  if (!Array.isArray(items) || items.length === 0) return ""

  return items
    .map((item) => {
      const productName = item?.product?.name || item?.productName || "Item"
      const quantity = Number(item?.quantity || 0)
      return quantity > 0 ? `${productName} (${quantity})` : productName
    })
    .join(", ")
}

export const buildCollectionReceiptLineSnapshot = ({
  sale,
  model,
  source,
  appliedAmount,
}) => {
  const totalAmount = roundToTwo(sale?.totalAmount || 0)
  const previousReceived = roundToTwo(sale?.receivedAmount || 0)
  const safeAppliedAmount = roundToTwo(appliedAmount || 0)
  const normalizedPayment = normalizeSalePaymentState({
    totalAmount,
    receivedAmount: roundToTwo(previousReceived + safeAppliedAmount),
    paymentStatus: sale?.paymentStatus,
  })

  return {
    model,
    invoiceId: sale?._id,
    source,
    invoiceNumber: sale?.invoiceNumber || "",
    invoiceDate: sale?.createdAt || sale?.updatedAt || new Date(),
    totalAmount,
    previousReceived,
    appliedAmount: safeAppliedAmount,
    newReceived: roundToTwo(normalizedPayment.receivedAmount),
    remainingAmount: roundToTwo(normalizedPayment.balance),
    paymentStatus: normalizedPayment.paymentStatus,
    employeeId: sale?.employee?._id || sale?.employee || null,
    employeeName: sale?.employee?.name || "",
    employeeEmail: sale?.employee?.email || "",
    itemSummary: buildItemSummary(sale?.items),
  }
}

const mapReceiptLine = (line, index) => ({
  id: `${line?.model || "Sale"}-${line?.invoiceId || index}-${index}`,
  model: line?.model || "Sale",
  invoiceId: String(line?.invoiceId || ""),
  source: line?.source || "admin",
  invoiceNumber: line?.invoiceNumber || "",
  invoiceDate: line?.invoiceDate || null,
  totalAmount: roundToTwo(line?.totalAmount || 0),
  previousReceived: roundToTwo(line?.previousReceived || 0),
  appliedAmount: roundToTwo(line?.appliedAmount || 0),
  newReceived: roundToTwo(line?.newReceived || 0),
  remainingAmount: roundToTwo(line?.remainingAmount || 0),
  paymentStatus: line?.paymentStatus || "pending",
  employee: line?.employeeId
    ? {
        _id: String(line.employeeId),
        name: line?.employeeName || "",
        email: line?.employeeEmail || "",
      }
    : null,
  itemsSummary: line?.itemSummary || "",
})

export const mapCollectionReceiptRecord = (receipt, extra = {}) => {
  const lines = Array.isArray(receipt?.lines) ? receipt.lines.map(mapReceiptLine) : []
  const totalAppliedAmount = roundToTwo(
    receipt?.totalAppliedAmount ?? lines.reduce((sum, line) => sum + Number(line.appliedAmount || 0), 0)
  )
  const totalInvoiceAmount = roundToTwo(
    lines.reduce((sum, line) => sum + Number(line.totalAmount || 0), 0)
  )
  const totalRemainingAmount = roundToTwo(
    lines.reduce((sum, line) => sum + Number(line.remainingAmount || 0), 0)
  )
  const customerSnapshot = receipt?.customerSnapshot || {}
  const customer = {
    _id: customerSnapshot?._id ? String(customerSnapshot._id) : receipt?.customer ? String(receipt.customer) : null,
    name: customerSnapshot?.name || "",
    phone: customerSnapshot?.phone || "",
    address: customerSnapshot?.address || "",
    trNumber: customerSnapshot?.trNumber || "",
  }
  const sources = Array.from(new Set(lines.map((line) => line.source).filter(Boolean)))

  return {
    _id: String(receipt?._id || extra._id || ""),
    rcNo: String(receipt?.rcNo || extra.rcNo || ""),
    customer,
    signature: receipt?.signature || "",
    paymentMethod: receipt?.paymentMethod || "Cash",
    bankName: receipt?.bankName || "",
    chequeNumber: receipt?.chequeNumber || "",
    createdAt: receipt?.receiptCreatedAt || receipt?.createdAt || extra.createdAt || new Date().toISOString(),
    totalAppliedAmount,
    totalInvoiceAmount,
    totalRemainingAmount,
    status: totalRemainingAmount <= 0 ? "cleared" : "pending",
    sources,
    lines,
    legacyFallback: Boolean(extra.legacyFallback),
  }
}

export const buildLegacyCollectionReceiptDrafts = (
  sales,
  existingRcNos = new Set(),
  options = {}
) => {
  const includeWithoutRcNo = options.includeWithoutRcNo !== false
  const grouped = new Map()

  for (const sale of Array.isArray(sales) ? sales : []) {
    const normalizedPayment = normalizeSalePaymentState({
      totalAmount: sale?.totalAmount,
      receivedAmount: sale?.receivedAmount,
      paymentStatus: sale?.paymentStatus,
    })
    const currentReceived = roundToTwo(normalizedPayment.receivedAmount)

    if (currentReceived <= 0) continue

    const rcNo = String(sale?.rcNo || "").trim()
    if (!rcNo && !includeWithoutRcNo) continue
    if (rcNo && existingRcNos.has(rcNo)) continue

    const groupKey = rcNo || `legacy-invoice-${sale?._id || sale?.invoiceNumber || Date.now()}`
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, [])
    }
    grouped.get(groupKey).push(sale)
  }

  return Array.from(grouped.entries()).map(([groupKey, groupSales]) => {
    const primarySale = groupSales[0]
    const customerSnapshot = toPlainCustomer(primarySale?.customer)
    const paymentMethod =
      primarySale?.collectionPaymentMethod ||
      primarySale?.paymentMethod ||
      "Cash"
    const createdAt =
      primarySale?.collectionReceiptCreatedAt ||
      primarySale?.updatedAt ||
      primarySale?.createdAt ||
      new Date().toISOString()

    const lines = groupSales.map((sale) => {
      const normalizedPayment = normalizeSalePaymentState({
        totalAmount: sale?.totalAmount,
        receivedAmount: sale?.receivedAmount,
        paymentStatus: sale?.paymentStatus,
      })
      const itemSummary = buildItemSummary(sale?.items)

      return {
        model: sale?.model || (sale?.source === "employee" ? "EmployeeSale" : "Sale"),
        invoiceId: sale?._id,
        source: sale?.source || "admin",
        invoiceNumber: sale?.invoiceNumber || "",
        invoiceDate: sale?.createdAt || sale?.updatedAt || new Date(),
        totalAmount: roundToTwo(normalizedPayment.totalAmount),
        previousReceived: 0,
        appliedAmount: roundToTwo(normalizedPayment.receivedAmount),
        newReceived: roundToTwo(normalizedPayment.receivedAmount),
        remainingAmount: roundToTwo(normalizedPayment.balance),
        paymentStatus: normalizedPayment.paymentStatus,
        employeeId: sale?.employee?._id || sale?.employee || null,
        employeeName: sale?.employee?.name || "",
        employeeEmail: sale?.employee?.email || "",
        itemSummary,
      }
    })

    return {
      groupKey,
      rcNo: primarySale?.rcNo || "",
      customer: customerSnapshot?._id || null,
      customerSnapshot,
      signature: primarySale?.collectionSignature || "",
      paymentMethod,
      bankName: primarySale?.collectionBankName || "",
      chequeNumber: primarySale?.collectionChequeNumber || "",
      receiptCreatedAt: createdAt,
      totalAppliedAmount: lines.reduce((sum, line) => sum + Number(line.appliedAmount || 0), 0),
      lines,
      canPersist: Boolean(primarySale?.rcNo),
    }
  })
}

export const buildLegacyCollectionReceiptFallbacks = (sales, existingRcNos = new Set()) => {
  return buildLegacyCollectionReceiptDrafts(sales, existingRcNos)
    .map((draft) =>
      mapCollectionReceiptRecord(draft, {
        _id: draft.groupKey,
        legacyFallback: true,
        createdAt: draft.receiptCreatedAt,
      })
    )
}
