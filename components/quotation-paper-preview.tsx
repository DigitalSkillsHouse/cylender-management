"use client"

import { getDubaiDateDisplayString } from "@/lib/date-utils"

type QuotationItem = {
  name: string
  productCode?: string
  quantity: number
  price: number
}

type Quotation = {
  quotationNumber: string
  customerName: string
  customerTRNumber?: string
  customerAddress?: string
  items: QuotationItem[]
  subtotal?: number
  vatAmount?: number
  grandTotal?: number
  createdAt?: string
}

export default function QuotationPaperPreview({ quotation }: { quotation: Quotation | null }) {
  if (!quotation) return null

  const items = Array.isArray(quotation.items) ? quotation.items : []
  const subtotal =
    typeof quotation.subtotal === "number"
      ? quotation.subtotal
      : items.reduce((sum, it) => sum + Number(it.quantity || 0) * Number(it.price || 0), 0)
  const vatAmount =
    typeof quotation.vatAmount === "number"
      ? quotation.vatAmount
      : Math.trunc(subtotal * 0.05 * 100) / 100
  const grandTotal =
    typeof quotation.grandTotal === "number"
      ? quotation.grandTotal
      : Math.trunc((subtotal + vatAmount) * 100) / 100

  const dateStr = quotation.createdAt ? getDubaiDateDisplayString(new Date(quotation.createdAt)) : getDubaiDateDisplayString(new Date())

  return (
    <div className="w-full overflow-auto bg-[#F3F4F6] p-4 sm:p-6">
      <div className="mx-auto w-full max-w-[900px] rounded-xl bg-white shadow-sm ring-1 ring-black/5">
        <div className="p-4 sm:p-8">
          <div className="w-full">
            <img
              src="/images/Quotation-Paper-Invoice-Header.jpg"
              alt="Quotation Header"
              className="h-auto w-full"
              style={{ maxHeight: 160, objectFit: "contain" }}
            />
          </div>

          <div className="mt-6 flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="text-sm text-gray-600">Customer</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{quotation.customerName || "-"}</div>
              {quotation.customerTRNumber ? (
                <div className="mt-1 text-sm text-gray-700">
                  <span className="font-medium">TR Number:</span> {quotation.customerTRNumber}
                </div>
              ) : null}
              {quotation.customerAddress ? (
                <div className="mt-1 text-sm text-gray-700">
                  <span className="font-medium">Address:</span> {quotation.customerAddress}
                </div>
              ) : null}
            </div>

            <div className="shrink-0 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-right">
              <div className="text-sm text-gray-600">Quotation #</div>
              <div className="mt-1 font-mono text-base font-semibold text-[#2B3068]">{quotation.quotationNumber}</div>
              <div className="mt-2 text-xs text-gray-600">Date</div>
              <div className="mt-0.5 text-sm font-medium text-gray-900">{dateStr}</div>
            </div>
          </div>

          <div className="mt-8 overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#2B3068] text-white">
                  <th className="px-3 py-2 text-left text-xs font-semibold">S.No</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Code</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Item</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold">Qty</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Price</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const lineTotal = Number(it.quantity || 0) * Number(it.price || 0)
                  return (
                    <tr key={`${it.productCode || it.name}-${idx}`} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-3 py-2 text-sm text-gray-800">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono text-sm text-gray-800">{it.productCode || "-"}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">{it.name || "-"}</td>
                      <td className="px-3 py-2 text-center text-sm text-gray-800">{Number(it.quantity || 0)}</td>
                      <td className="px-3 py-2 text-right text-sm text-gray-800">AED {Number(it.price || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-sm font-medium text-gray-900">AED {lineTotal.toFixed(2)}</td>
                    </tr>
                  )
                })}

                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-sm text-gray-500">
                      No items.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-end">
            <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium text-gray-900">AED {subtotal.toFixed(2)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-gray-600">VAT (5%)</span>
                <span className="font-medium text-gray-900">AED {vatAmount.toFixed(2)}</span>
              </div>
              <div className="mt-3 border-t pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-gray-900">Total</span>
                  <span className="text-base font-semibold text-[#2B3068]">AED {grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 w-full">
            <img
              src="/images/Footer-qoute-paper.jpg"
              alt="Quotation Footer"
              className="h-auto w-full"
              style={{ maxHeight: 140, objectFit: "contain" }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

