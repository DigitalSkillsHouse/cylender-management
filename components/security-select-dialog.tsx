"use client"

import React, { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export type SecurityRecord = {
  _id: string
  paymentMethod?: "cash" | "cheque"
  cashAmount?: number
  bankName?: string
  checkNumber?: string
  createdAt?: string | Date
  notes?: string
  invoiceNumber?: string
  depositAmount?: number
  quantity?: number
  items?: Array<{
    productId?: string
    productName?: string
    cylinderSize?: string
    quantity?: number
    amount?: number
  }>
}

interface SecuritySelectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  records: SecurityRecord[]
  onSelect: (rec: SecurityRecord) => void
}

export default function SecuritySelectDialog({ open, onOpenChange, records, onSelect }: SecuritySelectDialogProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl w-[95vw] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-base sm:text-lg">Select previous security</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Choose a previous security to autofill cheque or cash details for this return transaction.
          </DialogDescription>
        </DialogHeader>
        <div className="divide-y rounded-md border overflow-y-auto flex-1 min-h-0">
          {records.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No previous security records found.</div>
          ) : (
            records.map((r) => {
              const isCash = r.paymentMethod === "cash"
              return (
                <div key={r._id} className="p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs sm:text-sm text-gray-600 break-words">
                        Invoice: <span className="font-medium text-gray-900">{r.invoiceNumber || "-"}</span>
                      </div>
                      <div className="font-medium text-sm sm:text-base break-words mt-1">
                        {isCash
                          ? `Cash: AED ${Number(r.cashAmount || 0).toFixed(2)}`
                          : `Cheque: ${r.bankName || "-"} • ${r.checkNumber || "-"}`}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 break-words">
                        {r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
                        {typeof r.quantity === 'number' ? ` • Qty: ${r.quantity}` : ""}
                        {typeof r.depositAmount === 'number' ? ` • Deposit: AED ${Number(r.depositAmount).toFixed(2)}` : ""}
                        {r.notes ? ` • ${r.notes}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                      {Array.isArray(r.items) && r.items.length > 0 && (
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          onClick={() => toggle(r._id)}
                          className="text-xs sm:text-sm flex-1 sm:flex-initial"
                        >
                          {expanded[r._id] ? "Hide items" : "See items"}
                        </Button>
                      )}
                      <Button 
                        size="sm" 
                        onClick={() => onSelect(r)}
                        className="text-xs sm:text-sm flex-1 sm:flex-initial min-w-[60px]"
                      >
                        Use
                      </Button>
                    </div>
                  </div>
                  {expanded[r._id] && Array.isArray(r.items) && r.items.length > 0 && (
                    <div className="mt-3 rounded-md border bg-gray-50">
                      <div className="divide-y">
                        {r.items.map((it, idx) => (
                          <div key={`${r._id}-${idx}`} className="px-3 py-2 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium break-words">
                                {it.productName || it.productId || 'Product'}{it.cylinderSize ? ` (${it.cylinderSize})` : ''}
                              </div>
                              <div className="text-xs text-gray-500">
                                Qty: {Number(it.quantity || 0)}
                              </div>
                            </div>
                            <div className="text-xs sm:text-sm text-gray-700 font-medium shrink-0">
                              AED {Number(it.amount || 0).toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
