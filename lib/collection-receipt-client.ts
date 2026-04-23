export interface CollectionReceiptLineRecord {
  id: string
  model: "Sale" | "EmployeeSale"
  invoiceId: string
  source: "admin" | "employee"
  invoiceNumber: string
  invoiceDate?: string | null
  totalAmount: number
  previousReceived: number
  appliedAmount: number
  newReceived: number
  remainingAmount: number
  paymentStatus: string
  employee?: {
    _id: string
    name: string
    email?: string
  } | null
  itemsSummary?: string
}

export interface CollectionReceiptRecord {
  _id: string
  rcNo: string
  customer: {
    _id?: string | null
    name: string
    phone?: string
    address?: string
    trNumber?: string
  }
  signature?: string
  paymentMethod: string
  bankName?: string
  chequeNumber?: string
  createdAt: string
  totalAppliedAmount: number
  totalInvoiceAmount: number
  totalRemainingAmount: number
  status: string
  sources: Array<"admin" | "employee" | string>
  lines: CollectionReceiptLineRecord[]
  legacyFallback?: boolean
}

const money = (value: unknown) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.trunc(numeric * 100) / 100
}

export const buildCollectionReceiptDialogPayload = (receipt: CollectionReceiptRecord) => {
  const items = (Array.isArray(receipt?.lines) ? receipt.lines : []).map((line) => ({
    product: {
      name: `Payment for Invoice #${line.invoiceNumber}`,
      price: money(line.appliedAmount),
    },
    quantity: 1,
    price: money(line.appliedAmount),
    total: money(line.appliedAmount),
    invoiceNumber: line.invoiceNumber,
    invoiceDate: line.invoiceDate || receipt.createdAt,
    paymentStatus: line.paymentStatus,
    totalAmount: money(line.totalAmount),
    receivedAmount: money(line.newReceived),
    previousReceived: money(line.previousReceived),
    newReceived: money(line.newReceived),
    remainingAmount: money(line.remainingAmount),
    source: line.source,
  }))

  return {
    _id: receipt._id,
    invoiceNumber: receipt.rcNo || receipt._id,
    customer: {
      name: receipt?.customer?.name || "Customer",
      phone: receipt?.customer?.phone || "",
      address: receipt?.customer?.address || "",
      trNumber: receipt?.customer?.trNumber || "",
    },
    items,
    totalAmount: money(receipt?.totalAppliedAmount ?? items.reduce((sum, item) => sum + Number(item.total || 0), 0)),
    paymentMethod: receipt?.paymentMethod || "Cash",
    bankName: receipt?.bankName || "",
    chequeNumber: receipt?.chequeNumber || "",
    paymentStatus: receipt?.status || "pending",
    type: "collection",
    createdAt: receipt?.createdAt || new Date().toISOString(),
    customerSignature: receipt?.signature || undefined,
  }
}
