export const invoiceSignatureStorageKey = (invoiceId: string) => `invoiceSignature_${invoiceId}`

export const getCachedInvoiceSignature = (invoiceId: string): string => {
  if (!invoiceId) return ""
  try {
    if (typeof window === "undefined") return ""
    return localStorage.getItem(invoiceSignatureStorageKey(invoiceId)) || ""
  } catch {
    return ""
  }
}

export const cacheInvoiceSignature = (invoiceId: string, signature: string) => {
  if (!invoiceId || !signature) return
  try {
    if (typeof window === "undefined") return
    localStorage.setItem(invoiceSignatureStorageKey(invoiceId), signature)
  } catch {}
}

export const clearCachedInvoiceSignature = (invoiceId: string) => {
  if (!invoiceId) return
  try {
    if (typeof window === "undefined") return
    localStorage.removeItem(invoiceSignatureStorageKey(invoiceId))
  } catch {}
}

export const persistSaleCustomerSignature = async (saleId: string, signature: string) => {
  if (!saleId || !signature) return false
  try {
    const res = await fetch(`/api/sales/${saleId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerSignature: signature }),
    })
    return res.ok
  } catch {
    return false
  }
}

export const persistEmployeeSaleCustomerSignature = async (saleId: string, signature: string) => {
  if (!saleId || !signature) return false
  try {
    const res = await fetch(`/api/employee-sales/${saleId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerSignature: signature }),
    })
    return res.ok
  } catch {
    return false
  }
}

export const persistCylinderCustomerSignature = async (transactionId: string, signature: string) => {
  if (!transactionId || !signature) return false
  try {
    const res = await fetch(`/api/cylinders/${transactionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerSignature: signature }),
    })
    return res.ok
  } catch {
    return false
  }
}

export const persistEmployeeCylinderCustomerSignature = async (transactionId: string, signature: string) => {
  if (!transactionId || !signature) return false
  try {
    const res = await fetch(`/api/employee-cylinders/${transactionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerSignature: signature }),
    })
    return res.ok
  } catch {
    return false
  }
}
