"use client"

import { useEffect, useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { X, Printer, Download } from "lucide-react"

interface ReceiptDialogProps {
  sale: {
    _id: string
    invoiceNumber: string
    customer: {
      name: string
      phone: string
      address: string
    }
    items: Array<{
      product: {
        name: string
        price: number
      }
      quantity: number
      price: number
      total: number
    }>
    totalAmount: number
    paymentMethod: string
    paymentStatus: string
    // Optional: used for cylinder returns to pick the correct header
    type?: 'deposit' | 'refill' | 'return' | string
    createdAt: string
    customerSignature?: string // Add signature to sale object
  }
  signature?: string
  onClose: () => void
}

export function ReceiptDialog({ sale, signature, onClose }: ReceiptDialogProps) {
  const [adminSignature, setAdminSignature] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    try {
      const sig = typeof window !== 'undefined' ? localStorage.getItem("adminSignature") : null
      setAdminSignature(sig)
    } catch (e) {
      setAdminSignature(null)
    }
  }, [])

  // Prepare items safely
  const itemsSafe = Array.isArray(sale?.items) ? sale.items : []
  // VAT is 5% of unit price. We show per-item VAT column and a totals breakdown.
  // Subtotal: sum(price * qty). VAT: 5% of subtotal. Grand Total: subtotal + VAT.
  const subTotal = itemsSafe.reduce((sum, item) => {
    const priceNum = Number(item?.price || 0)
    const qtyNum = Number(item?.quantity || 0)
    const line = (isFinite(priceNum) ? priceNum : 0) * (isFinite(qtyNum) ? qtyNum : 0)
    return sum + line
  }, 0)
  const vatAmount = subTotal * 0.05
  const grandTotal = subTotal + vatAmount
  // Use signature from sale object if available, otherwise use signature prop
  const signatureToUse = sale.customerSignature || signature

  // Select header image based on payment method/status/type
  const normalizedStatus = (sale?.paymentStatus || '').toString().toLowerCase()
  const normalizedPaymentMethod = (sale?.paymentMethod || '').toString().toLowerCase()
  const normalizedType = (sale as any)?.type ? ((sale as any).type as string).toLowerCase() : ''
  const headerSrc = normalizedPaymentMethod === 'credit'
    ? '/images/header-invoice.jpeg'
    : normalizedType === 'return'
      ? '/images/Header-Tax-invoice.jpg'
      : (normalizedStatus === 'cleared' || normalizedStatus === 'cleard')
        ? '/images/Header-deposit-invoice.jpg'
        : (normalizedStatus === 'pending')
          ? '/images/Header-Receiving-invoice.jpg'
          : '/images/header-invoice.jpeg'

  console.log('ReceiptDialog - Sale:', sale?.invoiceNumber)
  console.log('ReceiptDialog - Signature prop:', signature?.length)
  console.log('ReceiptDialog - Sale signature:', sale.customerSignature?.length)
  console.log('ReceiptDialog - Using signature:', signatureToUse?.length)

  // Convert signature to PNG with transparent background
  const convertToPNG = (signatureData: string): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()
      
      img.onload = () => {
        canvas.width = img.width
        canvas.height = img.height
        
        // Clear canvas with transparent background
        ctx!.clearRect(0, 0, canvas.width, canvas.height)
        
        // Draw the signature
        ctx!.drawImage(img, 0, 0)
        
        // Convert to PNG with transparency
        const pngData = canvas.toDataURL('image/png')
        resolve(pngData)
      }
      
      img.src = signatureData
    })
  }

  const handlePrint = () => {
    // Store the sale data in sessionStorage to pass it to the print page
    sessionStorage.setItem('printReceiptData', JSON.stringify(sale));
    if (adminSignature) {
      sessionStorage.setItem('adminSignature', adminSignature)
    }
    window.open(`/print/receipt/${sale._id}`, '_blank');
  }

  const handleDownload = async () => {
    // Dynamically import to avoid SSR issues
    const [{ default: html2canvas }, jsPDFModule] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ])

    const node = contentRef.current
    if (!node) return

    // Render the receipt content to a canvas
    const canvas = await html2canvas(node, {
      scale: 4, // even sharper to reduce blurriness
      backgroundColor: '#ffffff',
      useCORS: true,
    })
    const imgData = canvas.toDataURL('image/png')

    // Create PDF (A4 portrait)
    const pdf = new (jsPDFModule as any).jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()

    // Add margins (10mm on each side)
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

    pdf.save(`receipt-${sale.invoiceNumber}.pdf`)
  }


  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="receipt-description">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Receipt - {sale.invoiceNumber}</DialogTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        {/* Hidden description for accessibility */}
        <div id="receipt-description" className="sr-only">
          Sales receipt for invoice {sale.invoiceNumber} showing customer information, purchased items, and total amount with signature area for printing or download.
        </div>

        <div className="space-y-6">
          <div ref={contentRef}>
          {/* Company Header Image */}
          <div className="text-center pb-4">
            <img 
              src={headerSrc}
              alt="BARAKAH ALJAZEERA Header" 
              className="mx-auto max-w-full h-auto"
            />
          </div>

          {/* Invoice Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold text-[#2B3068] mb-2">Invoice Information</h3>
              <div className="space-y-1 text-sm">
                <div>
                  <strong>Invoice #:</strong> {sale?.invoiceNumber || '-'}
                </div>
                <div>
                  <strong>Date:</strong> {sale?.createdAt ? new Date(sale.createdAt).toLocaleDateString() : '-'}
                </div>
                <div>
                  <strong>Time:</strong> {sale?.createdAt ? new Date(sale.createdAt).toLocaleTimeString() : '-'}
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-[#2B3068] mb-2">Customer Information</h3>
              <div className="space-y-1 text-sm">
                <div>
                  <strong>Name:</strong> {sale?.customer?.name || '-'}
                </div>
                <div>
                  <strong>Phone:</strong> {sale?.customer?.phone || '-'}
                </div>
                <div>
                  <strong>Address:</strong> {sale?.customer?.address || '-'}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Items */}
          <div>
            <h3 className="font-semibold text-[#2B3068] mb-3">Items</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#2B3068] text-white">
                    <th className="text-left p-3 border">Item</th>
                    <th className="text-center p-3 border">Qty</th>
                    <th className="text-right p-3 border">Price</th>
                    <th className="text-right p-3 border">VAT (5%)</th>
                    <th className="text-right p-3 border">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsSafe.map((item, index) => {
                    const name = item?.product?.name || '-'
                    const priceNum = Number(item?.price || 0)
                    const qtyNum = Number(item?.quantity || 0)
                    const unitVat = priceNum * 0.05
                    const unitWithVat = priceNum + unitVat
                    const itemTotal = (isFinite(unitWithVat) ? unitWithVat : 0) * (isFinite(qtyNum) ? qtyNum : 0)
                    return (
                    <tr key={index} className="border-b">
                      <td className="p-3 border">{name}</td>
                      <td className="text-center p-3 border">{qtyNum}</td>
                      <td className="text-right p-3 border">AED {priceNum.toFixed(2)}</td>
                      <td className="text-right p-3 border">AED {unitVat.toFixed(2)}</td>
                      <td className="text-right p-3 border">AED {itemTotal.toFixed(2)}</td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <Separator />

          {/* Total */}
          <div className="mt-4">
            <table className="w-full">
              <tbody>
                <tr>
                  <td className="text-right pr-4 text-base">Subtotal</td>
                  <td className="text-right w-32 text-base">AED {subTotal.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="text-right pr-4 text-base">VAT (5%)</td>
                  <td className="text-right w-32 text-base">AED {vatAmount.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="text-right pr-4 font-bold text-xl">Total</td>
                  <td className="text-right font-bold text-xl w-32">AED {grandTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Footer with Signature */}
          <div className="mt-8 print-area relative">
            {/* Footer Image */}
            <div className="text-center">
              <img 
                src="/images/footer.png" 
                alt="BARAKAH ALJAZEERA Footer" 
                className="mx-auto max-w-full h-auto"
              />
            </div>
            
            {/* Signatures overlaid on Footer */}
            {signatureToUse && (
              <div className="absolute bottom-4 right-8">
                <img 
                  src={signatureToUse} 
                  alt="Customer Signature" 
                  className="max-h-12 object-contain opacity-90"
                  style={{
                    backgroundColor: 'transparent',
                    mixBlendMode: 'multiply',
                    filter: 'drop-shadow(0 0 2px rgba(255,255,255,0.8))'
                  }}
                />
              </div>
            )}
            {adminSignature && (
              <div className="absolute bottom-4 left-8">
                <img 
                  src={adminSignature} 
                  alt="Admin Signature" 
                  className="max-h-12 object-contain opacity-90"
                  style={{
                    backgroundColor: 'transparent',
                    mixBlendMode: 'multiply',
                    filter: 'drop-shadow(0 0 2px rgba(255,255,255,0.8))'
                  }}
                />
              </div>
            )}
          </div>
          </div>

          {/* Action Buttons - Moved to bottom */}
          <div className="flex gap-3 justify-center mt-8 no-print">
            <Button variant="outline" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
            <Button onClick={handlePrint} className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white">
              <Printer className="w-4 h-4 mr-2" />
              Print Receipt
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
