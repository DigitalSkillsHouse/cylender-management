"use client"

import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { X, Printer, Download } from "lucide-react"
import { toast } from "sonner"
import { getDubaiDateDisplayString, getDubaiDateTimeString } from "@/lib/date-utils"

export interface CollectionPaymentItem {
  model: string // "Sale" | "EmployeeSale"
  id: string
  amount: number
  invoiceNumber?: string
  source?: string // admin | employee
}

interface CollectionReceiptDialogProps {
  open: boolean
  onClose: () => void
  payments: CollectionPaymentItem[]
  collectorName: string
  collectorRole: string
  customerName?: string
  signature?: string | null
}

export const CollectionReceiptDialog = ({ open, onClose, payments, collectorName, collectorRole, customerName, signature }: CollectionReceiptDialogProps) => {
  const [adminSignature, setAdminSignature] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Fetch from database first, fallback to localStorage
    const loadAdminSignature = async () => {
      try {
        // Try database first
        const response = await fetch("/api/admin-signature", {
          cache: "no-store",
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.data?.signature) {
            // Cache in localStorage
            if (typeof window !== "undefined") {
              try {
                localStorage.setItem("adminSignature", data.data.signature)
              } catch (e) {
                console.warn("Failed to cache admin signature", e)
              }
            }
            setAdminSignature(data.data.signature)
            return
          }
        }
      } catch (error) {
        console.warn("Failed to fetch admin signature from database:", error)
      }

      // Fallback to localStorage
      try {
        const sig = typeof window !== "undefined" ? localStorage.getItem("adminSignature") : null
        setAdminSignature(sig)
      } catch {
        setAdminSignature(null)
      }
    }

    loadAdminSignature()
  }, [])

  const total = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)

  const handlePrint = () => {
    // Use the same print approach as ReceiptDialog: open /print/receipt page is tailored for single sale,
    // so for collections we will directly print the dialog content via window.print using a new window
    const node = contentRef.current
    if (!node) return
    const win = window.open('', '_blank')
    if (!win) return
    const html = `<!DOCTYPE html><html><head><title>Collection Receipt</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 16px; }
        .right { text-align: right; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
        th { background: #2B3068; color: #fff; text-align: left; }
      </style>
    </head><body>${node.innerHTML}</body></html>`
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  const handleDownload = async () => {
    try {
      const [{ default: html2canvas }, jsPDFModule] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const node = contentRef.current
      if (!node) {
        toast.error("Failed to generate PDF", {
          description: "Content not available. Please try again.",
        })
        return
      }
      const canvas = await html2canvas(node, { scale: 4, backgroundColor: '#ffffff', useCORS: true })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new (jsPDFModule as any).jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 10
      const imgWidth = pageWidth - margin * 2
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight
      let position = 0
      pdf.addImage(imgData, 'PNG', margin, margin + position, imgWidth, imgHeight, undefined, 'SLOW')
      heightLeft -= pageHeight
      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', margin, margin + position, imgWidth, imgHeight, undefined, 'SLOW')
        heightLeft -= pageHeight
      }
      const fileName = `collection-receipt.pdf`
      pdf.save(fileName)
      toast.success("Collection Receipt PDF downloaded successfully", {
        description: `File: ${fileName}`,
      })
    } catch (error) {
      console.error("Error generating PDF:", error)
      toast.error("Failed to download collection receipt PDF", {
        description: "Please try again or contact support if the issue persists.",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="collection-receipt-description">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Collection Receipt</DialogTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div id="collection-receipt-description" className="sr-only">
          Receipt preview for collected payments against pending invoices with signature area.
        </div>

        <div ref={contentRef} className="space-y-6 flex flex-col min-h-[297mm] print:min-h-[100vh]">
          {/* Header image to match ReceiptDialog styling (Tax invoice) */}
          <div className="text-center pb-4">
            <img src="/images/Header-Tax-invoice.jpg" alt="Header" className="mx-auto max-w-full h-auto" />
          </div>

          {/* Customer + Collector info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold text-[#2B3068] mb-2">Customer Information</h3>
              <div className="space-y-1 text-sm">
                <div><strong>Name:</strong> {customerName || '-'}</div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-[#2B3068] mb-2">Collection Details</h3>
              <div className="space-y-1 text-sm">
                <div><strong>Collector:</strong> {collectorName} ({collectorRole})</div>
                <div><strong>Date:</strong> {getDubaiDateDisplayString()}</div>
                <div><strong>Time:</strong> {getDubaiDateTimeString().split(', ')[1] || ''}</div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Payments table */}
          <div>
            <h3 className="font-semibold text-[#2B3068] mb-3">Collected Items</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse receipt-table text-[11px] leading-tight">
                <thead>
                  <tr className="bg-[#2B3068] text-white">
                    <th className="text-left p-2 border">#</th>
                    <th className="text-left p-2 border">Model</th>
                    <th className="text-left p-2 border">Invoice/ID</th>
                    <th className="text-left p-2 border">Source</th>
                    <th className="text-right p-2 border">Collected (AED)</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, idx) => (
                    <tr key={`${p.model}-${p.id}-${idx}`} className="border-b h-5">
                      <td className="p-2 border">{idx + 1}</td>
                      <td className="p-2 border">{p.model}</td>
                      <td className="p-2 border">{p.invoiceNumber || p.id}</td>
                      <td className="p-2 border">{p.source || '-'}</td>
                      <td className="text-right p-2 border">AED {Number(p.amount || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Separator />

          {/* Total */}
          <div className="mt-2">
            <table className="w-full text-[12px] leading-tight">
              <tbody>
                <tr>
                  <td className="text-right pr-4 font-bold text-xl">Total Collected</td>
                  <td className="text-right font-bold text-xl w-32">AED {total.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Footer with signatures, matching visual style - pushed to bottom */}
          <div className="mt-auto pt-8 print-area relative flex-shrink-0">
            <div className="text-center">
              <img src="/images/footer.png" alt="Footer" className="mx-auto max-w-full h-auto" />
            </div>
            {signature && (
              <div className="absolute bottom-4 right-8">
                <img src={signature} alt="Customer Signature" className="max-h-12 object-contain opacity-90"
                  style={{ backgroundColor: 'transparent', mixBlendMode: 'multiply', filter: 'drop-shadow(0 0 2px rgba(255,255,255,0.8))' }} />
              </div>
            )}
            {adminSignature && (
              <div className="absolute bottom-4 left-8">
                <img src={adminSignature} alt="Admin Signature" className="max-h-12 object-contain opacity-90"
                  style={{ backgroundColor: 'transparent', mixBlendMode: 'multiply', filter: 'drop-shadow(0 0 2px rgba(255,255,255,0.8))' }} />
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-center mt-6">
          <Button variant="outline" onClick={handleDownload}>
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
          <Button onClick={handlePrint} className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white">
            <Printer className="w-4 h-4 mr-2" />
            Print Receipt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
