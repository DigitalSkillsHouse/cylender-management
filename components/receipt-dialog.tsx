"use client"

import { useEffect, useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Printer, Download } from "lucide-react"
import { toast } from "sonner"
import { fetchAdminSignature } from "@/lib/admin-signature"
import { fetchEmployeeSignature } from "@/lib/employee-signature"
import { buildPdfFileName, getInvoicePdfLabel } from "@/lib/pdf-filename"

const formatPaymentMethodLabel = (paymentMethod: unknown) => {
  const raw = (paymentMethod ?? "").toString().trim()
  if (!raw) return "-"

  const normalized = raw.toLowerCase()

  // Keep stored value (`debit`) unchanged in DB, but show Cash on invoice/receipt.
  if (normalized === "debit") return "Cash"
  if (normalized === "cash") return "Cash"

  return raw
    .replace(/[\-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

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
      category?: "gas" | "cylinder"
      cylinderStatus?: "empty" | "full"
      // Additional fields for collection receipts
      invoiceNumber?: string
      invoiceDate?: string
      paymentStatus?: string
      totalAmount?: number
      receivedAmount?: number
      remainingAmount?: number
    }>
    totalAmount: number
    paymentMethod: string
    bankName?: string
    chequeNumber?: string
    lpoNo?: string
    paymentStatus: string
    // Optional: used for cylinder returns to pick the correct header
    type?: 'deposit' | 'refill' | 'return' | 'collection' | string
    createdAt: string
    customerSignature?: string // Add signature to sale object
    // Employee who created this sale (for employee sales)
    employee?: string | { _id: string; id?: string }
    employeeId?: string
    deliveryCharges?: number
  }
  signature?: string
  onClose: () => void
  // If true, force the Receiving header (used by cylinder-management page only)
  useReceivingHeader?: boolean
  // Control dialog visibility
  open?: boolean
  // If true, disable VAT calculation and show total amount as-is
  disableVAT?: boolean
  // User object to determine if we should use employee signature
  user?: { id: string; role: "admin" | "employee" }
  // Or directly pass employeeId if user object is not available
  employeeId?: string
}

export const ReceiptDialog = ({ sale, signature, onClose, useReceivingHeader, open = true, disableVAT = false, user, employeeId }: ReceiptDialogProps) => {
  const [adminSignature, setAdminSignature] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Determine which employee ID to use for signature
    // Priority: 1. sale.employee, 2. sale.employeeId, 3. user.id (if employee), 4. employeeId prop
    let targetEmployeeId: string | null = null
    
    // Check if sale has employee info
    if (sale?.employee) {
      // Handle both string ID and populated object
      if (typeof sale.employee === 'string') {
        targetEmployeeId = sale.employee
      } else if (sale.employee._id) {
        targetEmployeeId = sale.employee._id
      } else if (sale.employee.id) {
        targetEmployeeId = sale.employee.id
      }
    } else if (sale?.employeeId) {
      targetEmployeeId = sale.employeeId
    } else if (user?.role === "employee" && user?.id) {
      // If current user is employee, use their ID
      targetEmployeeId = user.id
    } else if (employeeId) {
      targetEmployeeId = employeeId
    }

    const loadSignature = async () => {
      if (targetEmployeeId) {
        // Fetch employee signature for this specific employee
        try {
          const empSig = await fetchEmployeeSignature(targetEmployeeId)
          setAdminSignature(empSig)
          console.log("Loaded employee signature for employee:", targetEmployeeId)
        } catch (error) {
          console.warn("Failed to fetch employee signature:", error)
          // Fallback to admin signature if employee signature not found
          try {
            const adminSig = await fetchAdminSignature()
            setAdminSignature(adminSig)
          } catch (adminError) {
            console.warn("Failed to fetch admin signature:", adminError)
            setAdminSignature(null)
          }
        }
      } else {
        // No employee ID - fetch admin signature
        try {
          const adminSig = await fetchAdminSignature()
          setAdminSignature(adminSig)
        } catch (error) {
          console.warn("Failed to fetch admin signature:", error)
          setAdminSignature(null)
        }
      }
    }

    loadSignature()
  }, [sale?.employee, sale?.employeeId, user?.id, user?.role, employeeId])

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
  } else if (sale?.type === 'rental') {
    // For rentals: use the totalAmount directly (already calculated as quantity * days * amountPerDay + VAT)
    // OR calculate from items if totalAmount is not available
    if (sale?.totalAmount) {
      // Use the stored totalAmount which already includes VAT
      grandTotal = Number(sale.totalAmount)
      // Calculate subtotal and VAT from items
      subTotal = itemsSafe.reduce((sum, item) => {
        const priceNum = Number(item?.price || 0) // amountPerDay
        const qtyNum = Number(item?.quantity || 0)
        const daysNum = Number((item as any)?.days || 0)
        const itemSubtotal = (isFinite(priceNum) ? priceNum : 0) * (isFinite(qtyNum) ? qtyNum : 0) * (isFinite(daysNum) ? daysNum : 0)
        return sum + itemSubtotal
      }, 0)
      vatAmount = Math.trunc((subTotal * 0.05) * 100) / 100
      // Ensure grandTotal matches subtotal + VAT (truncate to 2 decimals)
      grandTotal = Math.trunc((subTotal + vatAmount) * 100) / 100
    } else {
      // Fallback: calculate from items
      subTotal = itemsSafe.reduce((sum, item) => {
        const priceNum = Number(item?.price || 0) // amountPerDay
        const qtyNum = Number(item?.quantity || 0)
        const daysNum = Number((item as any)?.days || 0)
        const itemSubtotal = (isFinite(priceNum) ? priceNum : 0) * (isFinite(qtyNum) ? qtyNum : 0) * (isFinite(daysNum) ? daysNum : 0)
        return sum + itemSubtotal
      }, 0)
      vatAmount = Math.trunc((subTotal * 0.05) * 100) / 100
      grandTotal = Math.trunc((subTotal + vatAmount) * 100) / 100
    }
  } else {
    // VAT is 5% of unit price. We show per-item VAT column and a totals breakdown.
    // Subtotal: sum(price * qty). Delivery Charges: from sale.deliveryCharges. Total: Subtotal + Delivery Charges. VAT: 5% of Total. Grand Total: Total + VAT.
    subTotal = itemsSafe.reduce((sum, item) => {
      const priceNum = Number(item?.price || 0)
      const qtyNum = Number(item?.quantity || 0)
      const line = (isFinite(priceNum) ? priceNum : 0) * (isFinite(qtyNum) ? qtyNum : 0)
      return sum + line
    }, 0)
    const deliveryCharges = Number(sale?.deliveryCharges || 0)
    const total = Math.trunc((subTotal + deliveryCharges) * 100) / 100
    vatAmount = Math.trunc((total * 0.05) * 100) / 100
    grandTotal = Math.trunc((total + vatAmount) * 100) / 100
  }
  // Use signature from sale object if available, otherwise use signature prop
  const signatureToUse = sale.customerSignature || signature
  const isCollectionReceipt = sale?.type === "collection"
  const saleType = (sale?.type || "").toString().toLowerCase()
  const isStandardSaleInvoice =
    !["collection", "deposit", "return", "refill", "rental"].includes(saleType) &&
    !String(sale?.invoiceNumber || "").startsWith("STATEMENT-") &&
    String(sale?.paymentMethod || "").toLowerCase() !== "account statement"

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
  const footerSrc = "/images/footer.png"

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
    try {
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
      
      // Open print page in new window
      const printWindow = window.open(`/print/receipt/${sale._id}`, '_blank');
      if (!printWindow) {
        toast.error("Print window blocked", {
          description: "Please allow popups to print the receipt.",
        })
        return
      }
    } catch (error) {
      console.error("Error opening print window:", error)
      toast.error("Failed to open print window", {
        description: "Please try again or contact support if the issue persists.",
      })
    }
  }

  const handleDownload = async () => {
    let loadingToast: any = null
    try {
      // Show loading toast
      loadingToast = toast.loading("Generating PDF...", {
        description: "Please wait while we prepare your receipt.",
      })

      // Dynamically import to avoid SSR issues
      const [{ default: html2canvas }, jsPDFModule] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      // Wait a bit to ensure the dialog content is fully rendered
      await new Promise(resolve => setTimeout(resolve, 100))

      const node = contentRef.current
      if (!node) {
        toast.dismiss(loadingToast)
        toast.error("Failed to generate PDF", {
          description: "Content not available. Please try again.",
        })
        return
      }

      // For accurate A4 pagination (and to prevent rows getting cut), capture the dedicated print page
      // which is already styled and paginated for A4.
      sessionStorage.setItem('printReceiptData', JSON.stringify(sale))
      if (adminSignature) {
        sessionStorage.setItem('adminSignature', adminSignature)
      }
      sessionStorage.setItem('useReceivingHeader', useReceivingHeader ? 'true' : 'false')
      const shouldDisableVAT = disableVAT || isCylinderTransaction
      sessionStorage.setItem('disableVAT', shouldDisableVAT ? 'true' : 'false')

      const iframe = document.createElement('iframe')
      iframe.setAttribute('aria-hidden', 'true')
      iframe.style.position = 'fixed'
      iframe.style.left = '-10000px'
      iframe.style.top = '0'
      iframe.style.width = '1px'
      iframe.style.height = '1px'
      iframe.style.opacity = '0'
      iframe.style.pointerEvents = 'none'
      document.body.appendChild(iframe)

      try {
        await new Promise<void>((resolve, reject) => {
          iframe.onload = () => resolve()
          iframe.onerror = () => reject(new Error('Failed to load print page'))
          iframe.src = `/print/receipt/${sale._id}`
        })

        // Give images a moment to load/render inside the iframe
        await new Promise((resolve) => setTimeout(resolve, 300))

        const doc = iframe.contentDocument
        if (!doc) throw new Error('Unable to access print document')

        // Ensure clean capture (no shadows/borders/margins in download)
        const injected = doc.createElement('style')
        injected.textContent = `
          .receipt-page { box-shadow: none !important; border: 0 !important; margin: 0 !important; }
          .no-print { display: none !important; }
        `
        doc.head?.appendChild(injected)

        const waitForPages = async () => {
          const start = Date.now()
          while (Date.now() - start < 5000) {
            const els = Array.from(doc.querySelectorAll('.receipt-page')) as HTMLElement[]
            if (els.length) return els
            await new Promise((r) => setTimeout(r, 100))
          }
          return [] as HTMLElement[]
        }

        const waitForImages = async () => {
          const imgs = Array.from(doc.querySelectorAll('img')) as HTMLImageElement[]
          await Promise.all(
            imgs.map(
              (img) =>
                new Promise<void>((resolve) => {
                  if (img.complete && img.naturalWidth > 0) return resolve()
                  img.addEventListener('load', () => resolve(), { once: true })
                  img.addEventListener('error', () => resolve(), { once: true })
                })
            )
          )
        }

        const pageEls = await waitForPages()
        if (!pageEls.length) throw new Error('Printable pages not found')
        await waitForImages()

        // Create PDF (A4 portrait)
        const pdf = new (jsPDFModule as any).jsPDF('p', 'mm', 'a4')
        const pageWidth = pdf.internal.pageSize.getWidth()
        const pageHeight = pdf.internal.pageSize.getHeight()

        for (let i = 0; i < pageEls.length; i++) {
          const pageEl = pageEls[i]
          const canvas = await html2canvas(pageEl, {
            scale: 4,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
            allowTaint: true,
          })

          const imgData = canvas.toDataURL('image/png')
          const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height)
          const imgWidth = canvas.width * ratio
          const imgHeight = canvas.height * ratio
          const x = (pageWidth - imgWidth) / 2
          const y = (pageHeight - imgHeight) / 2

          if (i > 0) pdf.addPage()
          pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight, undefined, 'FAST')
        }

        const fileName = buildPdfFileName({
          subjectName: sale?.customer?.name,
          label: getInvoicePdfLabel(sale as any),
          fallbackName: sale?.invoiceNumber ? `Invoice ${sale.invoiceNumber}` : "Receipt",
        })
        pdf.save(fileName)

        toast.dismiss(loadingToast)
        toast.success("Receipt PDF downloaded successfully", {
          description: `File: ${fileName}`,
        })
      } finally {
        iframe.remove()
      }

    } catch (error) {
      console.error("Error generating PDF:", error)
      if (loadingToast) toast.dismiss(loadingToast)
      toast.error("Failed to download receipt PDF", {
        description: error instanceof Error ? error.message : "Please try again or contact support if the issue persists.",
      })
    }
  }


  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby="receipt-dialog-description">
        <DialogHeader>
          <DialogTitle>
            {sale?.type === 'collection' ? `Receipt - RC-NO-${sale?.invoiceNumber || '-'}` : 'Receipt'}
          </DialogTitle>
        </DialogHeader>
        
        {/* Hidden description for accessibility */}
        <div id="receipt-dialog-description" className="sr-only">
          Sales receipt for invoice {sale.invoiceNumber} showing customer information, purchased items, and total amount with signature area for printing or download.
        </div>

        <div className={`space-y-6 flex flex-col min-h-[297mm] print:min-h-[100vh] print:relative ${isCollectionReceipt ? "receipt-preview-collection" : ""}`}>
          <div ref={contentRef} className="flex flex-col flex-grow print:max-h-[calc(100vh-120px)] print:overflow-hidden">
            {/* Company Header Image */}
            <div className={`text-center ${isCollectionReceipt ? "pb-2" : "pb-4"}`}>
            <img 
              src={headerSrc}
              alt="SYED TAYYAB INDUSTRIAL Header" 
              className="mx-auto max-w-full h-auto"
            />
          </div>

          {/* Customer (left) and Invoice (right) Info */}
          <div className={`grid grid-cols-2 ${isCollectionReceipt ? "gap-3" : "gap-4"}`}>
            <div>
              <div className={`space-y-1 ${isCollectionReceipt ? "text-[13px] leading-tight" : "text-sm"}`}>
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
              <div className={`space-y-1 ${isCollectionReceipt ? "text-[13px] leading-tight" : "text-sm"}`}>
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
                    <strong>Payment Method:</strong> {formatPaymentMethodLabel(sale?.paymentMethod)}
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
                {isStandardSaleInvoice && (
                  <div>
                    <strong>LPO No:</strong> {sale?.lpoNo?.trim() || '-'}
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Items */}
          <div>
            <div className="overflow-x-auto">
              <table className={`w-full border-collapse receipt-table leading-tight ${isCollectionReceipt ? "text-[10px]" : "text-[11px]"}`}>
                <thead>
                  <tr className="bg-[#2B3068] text-white">
                    {sale?.type === 'collection' ? (
                      <>
                        <th className={`text-left border ${isCollectionReceipt ? "p-1.5" : "p-2"}`}>Invoice</th>
                        <th className={`text-center border ${isCollectionReceipt ? "p-1.5" : "p-2"}`}>Date</th>
                        <th className={`text-right border ${isCollectionReceipt ? "p-1.5" : "p-2"}`}>Type</th>
                        <th className={`text-right border ${isCollectionReceipt ? "p-1.5" : "p-2"}`}>Total</th>
                        <th className={`text-right border ${isCollectionReceipt ? "p-1.5" : "p-2"}`}>Received</th>
                        <th className={`text-right border ${isCollectionReceipt ? "p-1.5" : "p-2"}`}>Remaining</th>
                      </>
                    ) : (
                      <>
                        <th className="text-left p-2 border">Item</th>
                        <th className="text-center p-2 border">Category</th>
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
                  {(() => {
                    // For collection receipts, group items by invoice number and show one row per invoice
                    if (sale?.type === 'collection') {
                      // Group items by invoice number
                      const invoiceGroups: Record<string, typeof itemsSafe> = {}
                      
                      itemsSafe.forEach((item) => {
                        const name = item?.product?.name || '-'
                        let invoiceNumber = item.invoiceNumber
                        
                        // Extract invoice number from product name if not directly available
                        if (!invoiceNumber && name.includes('Invoice #')) {
                          const parts = name.split('Invoice #')
                          if (parts.length > 1) {
                            invoiceNumber = parts[1].split(' ')[0].trim()
                          }
                        }
                        
                        // If still no invoice number, use the sale's invoice number
                        if (!invoiceNumber && sale?.invoiceNumber) {
                          invoiceNumber = sale.invoiceNumber
                        }
                        
                        const key = invoiceNumber || 'no-invoice'
                        if (!invoiceGroups[key]) {
                          invoiceGroups[key] = []
                        }
                        invoiceGroups[key].push(item)
                      })
                      
                      // Render one row per invoice group
                      return Object.entries(invoiceGroups).map(([invoiceKey, groupItems], groupIndex) => {
                        // Calculate totals for this invoice group
                        let groupTotalAmount = 0
                        let groupReceivedAmount = 0
                        let groupRemainingAmount = 0
                        let invoiceDate = ''
                        let paymentStatus = 'pending'
                        
                        groupItems.forEach((item) => {
                          const itemTotal = Number(item?.total || 0)
                          const itemTotalAmount = Number(item?.totalAmount || itemTotal)
                          const itemReceivedAmount = Number(item?.receivedAmount || itemTotal)
                          const itemRemainingAmount = item?.remainingAmount !== undefined 
                            ? Number(item.remainingAmount) 
                            : (itemTotalAmount - itemReceivedAmount)
                          
                          groupTotalAmount += itemTotalAmount
                          groupReceivedAmount += itemReceivedAmount
                          groupRemainingAmount += itemRemainingAmount
                          
                          // Use the first item's date and payment status
                          if (!invoiceDate && item.invoiceDate) {
                            invoiceDate = item.invoiceDate
                          }
                          if (paymentStatus === 'pending' && item.paymentStatus) {
                            paymentStatus = item.paymentStatus
                          }
                        })
                        
                        // Extract invoice number for display
                        const firstItem = groupItems[0]
                        const name = firstItem?.product?.name || '-'
                        let displayInvoiceNumber = firstItem.invoiceNumber
                        
                        if (!displayInvoiceNumber && name.includes('Invoice #')) {
                          const parts = name.split('Invoice #')
                          if (parts.length > 1) {
                            displayInvoiceNumber = parts[1].split(' ')[0].trim()
                          }
                        }
                        
                        if (!displayInvoiceNumber && sale?.invoiceNumber) {
                          displayInvoiceNumber = sale.invoiceNumber
                        }
                        
                        return (
                          <tr key={`invoice-${groupIndex}`} className="border-b h-5">
                            <td className={`border ${isCollectionReceipt ? "p-1.5" : "p-2"}`}>{displayInvoiceNumber || '-'}</td>
                            <td className={`text-center border ${isCollectionReceipt ? "p-1.5" : "p-2"}`}>
                              {invoiceDate ? new Date(invoiceDate).toLocaleDateString() : 
                               (sale?.createdAt ? new Date(sale.createdAt).toLocaleDateString() : '-')}
                            </td>
                            <td className={`text-right border ${isCollectionReceipt ? "p-1.5" : "p-2"}`}>{paymentStatus}</td>
                            <td className={`text-right border ${isCollectionReceipt ? "p-1.5" : "p-2"}`}>AED {groupTotalAmount.toFixed(2)}</td>
                            <td className={`text-right border ${isCollectionReceipt ? "p-1.5" : "p-2"}`}>AED {groupReceivedAmount.toFixed(2)}</td>
                            <td className={`text-right border ${isCollectionReceipt ? "p-1.5" : "p-2"}`}>AED {groupRemainingAmount.toFixed(2)}</td>
                          </tr>
                        )
                      })
                    }
                    
                    // For non-collection receipts, show items as before
                    return itemsSafe.map((item, index) => {
                      const name = item?.product?.name || '-'
                      const priceNum = Number(item?.price || 0)
                      const qtyNum = Number(item?.quantity || 0)
                      
                      let itemTotal
                      if (disableVAT || isCylinderTransaction) {
                        itemTotal = Number(item?.total || 0)
                      } else if (sale?.type === 'rental') {
                        // For rentals: calculate quantity * days * amountPerDay + VAT
                        const daysNum = Number((item as any)?.days || 0)
                        const itemSubtotal = (isFinite(priceNum) ? priceNum : 0) * (isFinite(qtyNum) ? qtyNum : 0) * (isFinite(daysNum) ? daysNum : 0)
                        const itemVat = Math.trunc((itemSubtotal * 0.05) * 100) / 100
                        itemTotal = Math.trunc((itemSubtotal + itemVat) * 100) / 100
                      } else {
                        // Calculate with VAT (truncate to 2 decimals)
                        const unitVat = Math.trunc((priceNum * 0.05) * 100) / 100
                        const unitWithVat = Math.trunc((priceNum + unitVat) * 100) / 100
                        itemTotal = Math.trunc(((isFinite(unitWithVat) ? unitWithVat : 0) * (isFinite(qtyNum) ? qtyNum : 0)) * 100) / 100
                      }
                      
                      const unitVat = Math.trunc((priceNum * 0.05) * 100) / 100
                      
                      return (
                        <tr key={index} className="border-b h-5">
                          <td className="p-2 border">{name}</td>
                          <td className="text-center p-2 border">
                            {(() => {
                              // For cylinder transactions (deposit/return/refill), show the transaction type with "Empty"
                              if (sale?.type === 'deposit' || sale?.type === 'return' || sale?.type === 'refill') {
                                // Capitalize the transaction type and add "Empty" (e.g., "deposit" -> "Deposit Empty", "return" -> "Return Empty")
                                const typeCapitalized = sale.type.charAt(0).toUpperCase() + sale.type.slice(1)
                                return `${typeCapitalized} Empty`
                              }
                              
                              // For other transactions, show product category
                              const category = (item as any)?.category || (item?.product as any)?.category || '-'
                              const status = (item as any)?.cylinderStatus
                              // For gas, show as "Gas"
                              if (category === 'gas') {
                                return 'Gas'
                              }
                              // For cylinders, show status with "Cylinder" (e.g., "Full Cylinder", "Empty Cylinder")
                              if (category === 'cylinder') {
                                if (status === 'full') {
                                  return 'Full Cylinder'
                                } else if (status === 'empty') {
                                  return 'Empty Cylinder'
                                } else {
                                  // If no status, just show "Cylinder"
                                  return 'Cylinder'
                                }
                              }
                              // Fallback for other categories
                              return category.charAt(0).toUpperCase() + category.slice(1)
                            })()}
                          </td>
                          <td className="text-center p-2 border">{qtyNum}</td>
                          {sale?.type === 'rental' && (
                            <td className="text-center p-2 border">{(item as any)?.days || '-'}</td>
                          )}
                          <td className="text-right p-2 border">AED {priceNum.toFixed(2)}</td>
                          {!disableVAT && !isCylinderTransaction && (
                            <td className="text-right p-2 border">AED {unitVat.toFixed(2)}</td>
                          )}
                          <td className="text-right p-2 border">AED {itemTotal.toFixed(2)}</td>
                        </tr>
                      )
                    })
                  })()}
                  {/* No padding rows - show only actual items */}
                </tbody>
              </table>
            </div>
          </div>

          <Separator />

          {/* Total */}
          <div className={isCollectionReceipt ? "mt-2" : "mt-4"}>
            <table className={`w-full leading-tight ${isCollectionReceipt ? "text-[11px]" : "text-[12px]"}`}>
              <tbody>
                {!disableVAT && sale?.type !== 'collection' && !isCylinderTransaction && (
                  <>
                    <tr>
                      <td className="text-right pr-4 text-base">Subtotal</td>
                      <td className="text-right w-32 text-base">AED {subTotal.toFixed(2)}</td>
                    </tr>
                    {Number(sale?.deliveryCharges || 0) > 0 && (
                      <tr>
                        <td className="text-right pr-4 text-base">Delivery Charges</td>
                        <td className="text-right w-32 text-base">AED {Number(sale?.deliveryCharges || 0).toFixed(2)}</td>
                      </tr>
                    )}
                    <tr>
                      <td className="text-right pr-4 text-base">Total</td>
                      <td className="text-right w-32 text-base">AED {Math.trunc((subTotal + Number(sale?.deliveryCharges || 0)) * 100) / 100}</td>
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
                  <td className="text-right pr-4 font-bold text-xl">Grand Total</td>
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

          {/* Footer with Signature - pushed to bottom using flexbox */}
          <div className={`mt-auto print-area relative flex-shrink-0 ${isCollectionReceipt ? "pt-4" : "pt-8"}`}>
            {/* Footer Image */}
            <div className="text-center">
              <img 
                src={footerSrc} 
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
                  className="object-contain opacity-90"
                  style={{
                    maxHeight: '6rem',
                    backgroundColor: 'transparent',
                    mixBlendMode: 'multiply',
                    filter: 'contrast(1.35) brightness(0.85) drop-shadow(0 0 0.7px rgba(0,0,0,0.6)) drop-shadow(0 0 2px rgba(255,255,255,0.8))'
                  }}
                />
              </div>
            )}
            {adminSignature && (
              <div className="absolute bottom-4 left-8">
                <img 
                  src={adminSignature} 
                  alt="Admin Signature" 
                  className="object-contain opacity-90"
                  style={{
                    maxHeight: '6rem',
                    backgroundColor: 'transparent',
                    mixBlendMode: 'multiply',
                    filter: 'contrast(1.35) brightness(0.85) drop-shadow(0 0 0.7px rgba(0,0,0,0.6)) drop-shadow(0 0 2px rgba(255,255,255,0.8))'
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons - Moved to bottom */}
        <div className="flex gap-3 justify-center mt-8 no-print">
          <Button 
            variant="outline" 
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleDownload()
            }}
          >
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
          <Button 
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handlePrint()
            }} 
            className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print Receipt
          </Button>
        </div>
      </div>
      
      <style jsx global>{`
        @page {
          margin: 0;
          size: A4;
        }
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: 100% !important;
          }
          div[class*="space-y-6"] {
            position: relative !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            height: 297mm !important;
            display: flex !important;
            flex-direction: column !important;
            padding: 30px !important; /* Small margin from corners (30px) */
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }
          div[ref] {
            flex: 1 1 auto !important;
            min-height: 0 !important;
            max-height: calc(297mm - 60px - 120px) !important; /* Account for padding and footer */
            overflow: hidden !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
          }
          .print-area {
            flex: 0 0 auto !important;
            margin-top: auto !important;
            position: relative !important;
            width: 100% !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-before: avoid !important;
            break-before: avoid !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
          }
          /* Prevent text from being cut off */
          * {
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            box-sizing: border-box !important;
          }
          table {
            width: 100% !important;
            table-layout: auto !important;
            word-wrap: break-word !important;
          }
          td, th {
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            padding: 4px !important;
          }
          .receipt-preview-collection table {
            line-height: 1.15 !important;
          }
          .receipt-preview-collection td,
          .receipt-preview-collection th {
            padding-top: 5px !important;
            padding-bottom: 5px !important;
          }
        }
      `}</style>
    </DialogContent>
  </Dialog>
  )
}

