"use client"

import { useEffect, useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { X, Printer, Download } from "lucide-react"
import { toast } from "sonner"

interface ReceiptDialogProps {
  sale: {
    _id: string
    invoiceNumber: string
    customer: {
      name: string
      phone: string
      address: string
      trNumber?: string
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
    bankName?: string
    chequeNumber?: string
    paymentStatus: string
    // Optional: used for cylinder returns to pick the correct header
    type?: 'deposit' | 'refill' | 'return' | 'collection' | string
    createdAt: string
    customerSignature?: string // Add signature to sale object
  }
  signature?: string
  onClose: () => void
  // If true, force the Receiving header (used by cylinder-management page only)
  useReceivingHeader?: boolean
  // Control dialog visibility
  open?: boolean
  // If true, disable VAT calculation and show total amount as-is
  disableVAT?: boolean
}

export function ReceiptDialog({ sale, signature, onClose, useReceivingHeader, open = true, disableVAT = false }: ReceiptDialogProps) {
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
  
  // Calculate totals based on whether VAT is disabled
  let subTotal, vatAmount, grandTotal
  
  // Disable VAT for cylinder transactions (deposit, return, refill) and collections
  const isCylinderTransaction = sale?.type === 'deposit' || sale?.type === 'return' || sale?.type === 'refill'
  
  if (disableVAT || sale?.type === 'collection' || isCylinderTransaction) {
    // For collections and cylinder transactions, use the totalAmount directly without VAT calculation
    grandTotal = Number(sale?.totalAmount || 0)
    subTotal = grandTotal
    vatAmount = 0
  } else {
    // VAT is 5% of unit price. We show per-item VAT column and a totals breakdown.
    // Subtotal: sum(price * qty). VAT: 5% of subtotal. Grand Total: subtotal + VAT.
    subTotal = itemsSafe.reduce((sum, item) => {
      const priceNum = Number(item?.price || 0)
      const qtyNum = Number(item?.quantity || 0)
      const line = (isFinite(priceNum) ? priceNum : 0) * (isFinite(qtyNum) ? qtyNum : 0)
      return sum + line
    }, 0)
    vatAmount = subTotal * 0.05
    grandTotal = subTotal + vatAmount
  }
  // Use signature from sale object if available, otherwise use signature prop
  const signatureToUse = sale.customerSignature || signature

  // Choose header image by transaction type first (Deposit/Return/Collection/Rental),
  // then allow forcing Receiving header, otherwise default to Tax header.
  const headerSrc = (() => {
    const t = (sale?.type || '').toString().toLowerCase()
    if (t === 'deposit') return '/images/Header-deposit-invoice.jpg'
    if (t === 'return') return '/images/Header-Return-invoice.jpg'
    if (t === 'collection') return '/images/Header-Receiving-invoice.jpg'
    if (t === 'rental') return '/images/rental_Invoice_page.jpg'
    if (useReceivingHeader) return '/images/Header-Receiving-invoice.jpg'
    return '/images/Header-Tax-invoice.jpg'
  })()

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
    // Persist header preference for print page
    sessionStorage.setItem('useReceivingHeader', useReceivingHeader ? 'true' : 'false')
    // Persist disableVAT flag for print page
    const shouldDisableVAT = disableVAT || isCylinderTransaction
    sessionStorage.setItem('disableVAT', shouldDisableVAT ? 'true' : 'false')
    window.open(`/print/receipt/${sale._id}`, '_blank');
  }

  const handleDownload = async () => {
    try {
      // Dynamically import to avoid SSR issues
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

      const fileName = `receipt-${sale.invoiceNumber}.pdf`
      pdf.save(fileName)
      toast.success("Receipt PDF downloaded successfully", {
        description: `File: ${fileName}`,
      })
    } catch (error) {
      console.error("Error generating PDF:", error)
      toast.error("Failed to download receipt PDF", {
        description: "Please try again or contact support if the issue persists.",
      })
    }
  }


  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby="receipt-dialog-description">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>
              {sale?.type === 'collection' ? `Receipt - RC-NO-${sale?.invoiceNumber || '-'}` : 'Receipt'}
            </DialogTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        {/* Hidden description for accessibility */}
        <div id="receipt-dialog-description" className="sr-only">
          Sales receipt for invoice {sale.invoiceNumber} showing customer information, purchased items, and total amount with signature area for printing or download.
        </div>

        <div className="space-y-6">
          <div ref={contentRef}>
            {/* Company Header Image */}
            <div className="text-center pb-4">
            <img 
              src={headerSrc}
              alt="SYED TAYYAB INDUSTRIAL Header" 
              className="mx-auto max-w-full h-auto"
            />
          </div>

          {/* Customer (left) and Invoice (right) Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="space-y-1 text-sm">
                <div>
                  <strong>Name:</strong> {sale?.customer?.name || '-'}
                </div>
                <div>
                  <strong>TR Number:</strong> {sale?.customer?.trNumber || '-'}
                </div>
                <div>
                  <strong>Address:</strong> {sale?.customer?.address || '-'}
                </div>
              </div>
            </div>

            <div>
              <div className="space-y-1 text-sm">
                {/* Show RC-NO for collection receipts, regular Invoice # for others */}
                {sale?.type === 'collection' ? (
                  <div>
                    <strong>RC-NO-{sale?.invoiceNumber || '-'}</strong>
                  </div>
                ) : (
                  <div>
                    <strong>Invoice #:</strong> {sale?.invoiceNumber || '-'}
                  </div>
                )}
                <div>
                  <strong>Date:</strong> {sale?.createdAt ? new Date(sale.createdAt).toLocaleDateString() : '-'}
                </div>
                {/* Hide Payment Method for rental receipts */}
                {sale?.type !== 'rental' && (
                  <div>
                    <strong>Payment Method:</strong> {(
                      sale?.paymentMethod
                        ? sale.paymentMethod
                            .toString()
                            .replace(/[\-_]/g, ' ')
                            .replace(/\b\w/g, (c) => c.toUpperCase())
                        : '-'
                    )}
                  </div>
                )}
                {sale?.paymentMethod?.toLowerCase() === 'cheque' && (
                  <>
                    {sale?.bankName && (
                      <div>
                        <strong>Bank Name:</strong> {sale.bankName}
                      </div>
                    )}
                    {sale?.chequeNumber && (
                      <div>
                        <strong>Cheque Number:</strong> {sale.chequeNumber}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Items */}
          <div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse receipt-table text-[11px] leading-tight">
                <thead>
                  <tr className="bg-[#2B3068] text-white">
                    {sale?.type === 'collection' ? (
                      <>
                        <th className="text-left p-2 border">Invoice</th>
                        <th className="text-center p-2 border">Date</th>
                        <th className="text-right p-2 border">Type</th>
                        <th className="text-right p-2 border">Total</th>
                        <th className="text-right p-2 border">Received</th>
                        <th className="text-right p-2 border">Remaining</th>
                      </>
                    ) : (
                      <>
                        <th className="text-left p-2 border">Item</th>
                        <th className="text-center p-2 border">Qty</th>
                        {sale?.type === 'rental' && (
                          <th className="text-center p-2 border">Days</th>
                        )}
                        <th className="text-right p-2 border">Price</th>
                        {!disableVAT && !isCylinderTransaction && (
                          <th className="text-right p-2 border">VAT (5%)</th>
                        )}
                        <th className="text-right p-2 border">Total</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {itemsSafe.map((item, index) => {
                    const name = item?.product?.name || '-'
                    const priceNum = Number(item?.price || 0)
                    const qtyNum = Number(item?.quantity || 0)
                    
                    let itemTotal
                    if (disableVAT || sale?.type === 'collection' || isCylinderTransaction) {
                      // For collections and cylinder transactions, use the item total as-is without VAT
                      itemTotal = Number(item?.total || 0)
                    } else {
                      // Calculate with VAT
                      const unitVat = priceNum * 0.05
                      const unitWithVat = priceNum + unitVat
                      itemTotal = (isFinite(unitWithVat) ? unitWithVat : 0) * (isFinite(qtyNum) ? qtyNum : 0)
                    }
                    
                    const unitVat = priceNum * 0.05
                    
                    return (
                    <tr key={index} className="border-b h-5">
                      {sale?.type === 'collection' ? (
                        <>
                          <td className="p-2 border">{
                            // Use the invoice number from the item data, or extract from product name
                            (item as any)?.invoiceNumber || (name.includes('Invoice #') ? name.split('Invoice #')[1] : name)
                          }</td>
                          <td className="text-center p-2 border">{
                            // Use the invoice date from the item data, or fall back to sale date
                            (item as any)?.invoiceDate ? new Date((item as any).invoiceDate).toLocaleDateString() : 
                            (sale?.createdAt ? new Date(sale.createdAt).toLocaleDateString() : '-')
                          }</td>
                          <td className="text-right p-2 border">{(item as any)?.paymentStatus || 'pending'}</td>
                          <td className="text-right p-2 border">AED {((item as any)?.totalAmount || itemTotal).toFixed(2)}</td>
                          <td className="text-right p-2 border">AED {((item as any)?.receivedAmount || itemTotal).toFixed(2)}</td>
                          <td className="text-right p-2 border">AED {((item as any)?.remainingAmount !== undefined ? (item as any).remainingAmount : (((item as any)?.totalAmount || itemTotal) - ((item as any)?.receivedAmount || itemTotal))).toFixed(2)}</td>
                        </>
                      ) : (
                        <>
                          <td className="p-2 border">{name}</td>
                          <td className="text-center p-2 border">{qtyNum}</td>
                          {sale?.type === 'rental' && (
                            <td className="text-center p-2 border">{(item as any)?.days || '-'}</td>
                          )}
                          <td className="text-right p-2 border">AED {priceNum.toFixed(2)}</td>
                          {!disableVAT && !isCylinderTransaction && (
                            <td className="text-right p-2 border">AED {unitVat.toFixed(2)}</td>
                          )}
                          <td className="text-right p-2 border">AED {itemTotal.toFixed(2)}</td>
                        </>
                      )}
                    </tr>
                    )
                  })}
                  {/* No padding rows - show only actual items */}
                </tbody>
              </table>
            </div>
          </div>

          <Separator />

          {/* Total */}
          <div className="mt-4">
            <table className="w-full text-[12px] leading-tight">
              <tbody>
                {!disableVAT && sale?.type !== 'collection' && !isCylinderTransaction && (
                  <>
                    <tr>
                      <td className="text-right pr-4 text-base">Subtotal</td>
                      <td className="text-right w-32 text-base">AED {subTotal.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="text-right pr-4 text-base">VAT (5%)</td>
                      <td className="text-right w-32 text-base">AED {vatAmount.toFixed(2)}</td>
                    </tr>
                  </>
                )}
                {/* Add spacing for collection receipts and cylinder transactions to maintain signature positioning */}
                {(disableVAT || sale?.type === 'collection' || isCylinderTransaction) && (
                  <>
                    <tr>
                      <td className="text-right pr-4 text-base">&nbsp;</td>
                      <td className="text-right w-32 text-base">&nbsp;</td>
                    </tr>
                    <tr>
                      <td className="text-right pr-4 text-base">&nbsp;</td>
                      <td className="text-right w-32 text-base">&nbsp;</td>
                    </tr>
                  </>
                )}
                <tr>
                  <td className="text-right pr-4 font-bold text-xl">Total</td>
                  <td className="text-right font-bold text-xl w-32">AED {grandTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <Separator />

          {/* Terms & Conditions for Deposit (shown above footer) */}
          {String(sale?.type || '').toLowerCase() === 'deposit' && (
            <div className="mt-4 text-[10px] leading-snug text-gray-700">
              <h4 className="font-semibold mb-2">TERMS & CONDITIONS FOR CYLINDER(S) (ON DEPOSIT) FOR GAS SUPPLY</h4>
              <ol className="list-decimal pl-4 space-y-1">
                <li>
                  Syed Tayyab Industrial Gas L.L.C. (herein after referred to as STIG) cylinder(s) (on deposit/loan) for
                  gas supply held by the customer is/are the property of STIG and will remain so while in use by customer unless sold.
                  The customer has no right to the cylinder(s) and undertakes & agrees to restrict the usage and refilling of cylinder(s)
                  regularly Loan/Exchange/Damage from STIG only.
                </li>
                <li>
                  If any cylinder(s) is/are kept in customer's custody for a period of more than 30 days without refilling at STIG,
                  the same will be considered as cylinder(s) purchased by customer from STIG. The cylinders will not be accepted if
                  returned after the above period. In such case the deposit paid or security cheque is not given will not be refunded/returned.
                  If the deposit paid or the security cheque is not given, the customer is able to pay the value of cylinder(s) immediately.
                  The customer is also liable to pay a rental charge of AED. 10/- per day per cylinder for any delay in paying the value of cylinder (s).
                </li>
                <li>
                  STIG will refund the cash deposit paid/return security cheque given (Except for the cases mentioned in point no. 2)
                  when the customer return the cylinder in good condition along with original deposit invoice).
                </li>
                <li>
                  In the event of either partial or total damage to the cylinder(s) while in the custody of the customer, is liable to
                  compensate DEF for the value of partial damage as determined by STIG.
                </li>
              </ol>
            </div>
          )}

          {/* Footer with Signature */}
          <div className="mt-8 print-area relative">
            {/* Footer Image */}
            <div className="text-center">
              <img 
                src="/images/footer.png" 
                alt="SYED TAYYAB INDUSTRIAL Footer" 
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
