type UnknownRecord = Record<string, unknown>

export const sanitizePdfFileNamePart = (input: unknown): string => {
  const raw = (input ?? "").toString().trim()
  if (!raw) return ""

  return raw
    .replace(/[\\/:*?"<>|]/g, " ") // Windows/macOS reserved filename chars
    .replace(/\s+/g, " ")
    .trim()
}

export const buildPdfFileName = (params: { subjectName?: unknown; label: unknown; fallbackName?: string }): string => {
  const subject = sanitizePdfFileNamePart(params.subjectName) || sanitizePdfFileNamePart(params.fallbackName) || "Document"
  const label = sanitizePdfFileNamePart(params.label) || "PDF"
  return `${subject} (${label}).pdf`
}

export const getInvoicePdfLabel = (saleLike: UnknownRecord | null | undefined): string => {
  const t = (saleLike?.type ?? "").toString().trim().toLowerCase()
  const invoiceNumber = (saleLike?.invoiceNumber ?? "").toString().trim()
  const paymentMethod = (saleLike?.paymentMethod ?? "").toString().trim().toLowerCase()

  if (invoiceNumber.startsWith("STATEMENT-") || paymentMethod === "account statement") return invoiceNumber ? `Account Statement ${invoiceNumber}` : "Account Statement"
  if (t === "collection") return invoiceNumber ? `Receiving Invoice RC-NO-${invoiceNumber}` : "Receiving Invoice"
  if (t === "deposit") return invoiceNumber ? `Deposit Invoice ${invoiceNumber}` : "Deposit Invoice"
  if (t === "return") return invoiceNumber ? `Return Invoice ${invoiceNumber}` : "Return Invoice"
  if (t === "refill") return invoiceNumber ? `Refill Invoice ${invoiceNumber}` : "Refill Invoice"
  if (t === "rental") return invoiceNumber ? `Rental Invoice ${invoiceNumber}` : "Rental Invoice"
  return invoiceNumber ? `Sale Invoice ${invoiceNumber}` : "Sale Invoice"
}

