"use client"

import React from "react"
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
}

interface SecuritySelectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  records: SecurityRecord[]
  onSelect: (rec: SecurityRecord) => void
}

export default function SecuritySelectDialog({ open, onOpenChange, records, onSelect }: SecuritySelectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl w-[95vw]">
        <DialogHeader>
          <DialogTitle>Select previous security</DialogTitle>
          <DialogDescription>
            Choose a previous security to autofill cheque or cash details for this return transaction.
          </DialogDescription>
        </DialogHeader>
        <div className="divide-y rounded-md border">
          {records.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No previous security records found.</div>
          ) : (
            records.map((r) => {
              const isCash = r.paymentMethod === "cash"
              return (
                <div key={r._id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {isCash ? `Cash: AED ${Number(r.cashAmount || 0).toFixed(2)}` : `Cheque: ${r.bankName || "-"} • ${r.checkNumber || "-"}`}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
                      {r.notes ? ` • ${r.notes}` : ""}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => onSelect(r)}>Use</Button>
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
