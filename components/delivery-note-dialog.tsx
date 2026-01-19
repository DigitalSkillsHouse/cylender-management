"use client"

import { useState, useRef, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { X, Printer, Download } from "lucide-react"
import { toast } from "sonner"

interface DeliveryNoteDialogProps {
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
    paymentMethod?: string
    customerSignature?: string
    createdAt: string
  }
  signature?: string
  onClose: () => void
  open?: boolean
}

export const DeliveryNoteDialog = ({ sale, signature, onClose, open = true }: DeliveryNoteDialogProps) => {
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
      } catch (e) {
        setAdminSignature(null)
      }
    }

    loadAdminSignature()
  }, [])

  // Use signature from sale object if available, otherwise use signature prop
  const signatureToUse = sale.customerSignature || signature

  // Calculate total quantity
  const totalQuantity = sale.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)

  const handlePrint = () => {
    // Store the sale data in sessionStorage to pass it to the print page
    sessionStorage.setItem('printDeliveryNoteData', JSON.stringify(sale))
    if (adminSignature) {
      sessionStorage.setItem('adminSignature', adminSignature)
    }
    if (signatureToUse) {
      sessionStorage.setItem('customerSignature', signatureToUse)
    }
    window.open(`/print/delivery-note/${sale._id}`, '_blank')
  }

  const handleDownload = async () => {
    try {
      // Dynamically import to avoid SSR issues
      const jsPDFModule = await import('jspdf')
      const pdf = new (jsPDFModule as any).jsPDF('p', 'mm', 'a4')
      
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 10
      let currentY = margin

      // Add header image
      try {
        const headerImg = new Image()
        headerImg.crossOrigin = 'anonymous'
        await new Promise<void>((resolve, reject) => {
          headerImg.onload = () => {
            try {
              const canvas = document.createElement('canvas')
              const ctx = canvas.getContext('2d')
              canvas.width = headerImg.width
              canvas.height = headerImg.height
              if (ctx) {
                ctx.drawImage(headerImg, 0, 0)
                const headerImgData = canvas.toDataURL('image/png')
                const headerWidth = pageWidth - margin * 2
                const headerHeight = (headerImg.height * headerWidth) / headerImg.width
                pdf.addImage(headerImgData, 'PNG', margin, currentY, headerWidth, headerHeight)
                currentY += headerHeight + 10
              }
              resolve()
            } catch (err) {
              reject(err)
            }
          }
          headerImg.onerror = () => reject(new Error('Failed to load header image'))
          headerImg.src = '/images/Header-Delivery-Note.png'
        })
      } catch (error) {
        console.warn('Failed to load header image:', error)
        currentY += 30 // Add space if header fails
      }

      // Customer Information (Left) and Invoice Information (Right)
      const infoStartY = currentY
      const leftColX = margin
      const rightColX = pageWidth / 2 + 5
      const lineHeight = 6

      // Customer Information Section
      pdf.setFontSize(11)
      pdf.setTextColor(43, 48, 104) // #2B3068
      pdf.setFont('helvetica', 'bold')
      pdf.text('Customer Information', leftColX, currentY)
      currentY += 8

      pdf.setFontSize(9)
      pdf.setTextColor(0, 0, 0)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Name: ${sale?.customer?.name || '-'}`, leftColX, currentY)
      currentY += lineHeight
      pdf.text(`TR Number: ${sale?.customer?.trNumber || '-'}`, leftColX, currentY)
      currentY += lineHeight
      pdf.text(`Address: ${sale?.customer?.address || '-'}`, leftColX, currentY)
      
      // Invoice Information Section
      currentY = infoStartY
      pdf.setFontSize(11)
      pdf.setTextColor(43, 48, 104)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Invoice Information', rightColX, currentY)
      currentY += 8

      pdf.setFontSize(9)
      pdf.setTextColor(0, 0, 0)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Invoice #: ${sale?.invoiceNumber ? `DN-${sale.invoiceNumber}` : '-'}`, rightColX, currentY)
      currentY += lineHeight
      const dateStr = sale?.createdAt ? new Date(sale.createdAt).toLocaleDateString() : '-'
      pdf.text(`Date: ${dateStr}`, rightColX, currentY)
      // Payment Method removed for delivery notes
      
      // Get max Y from both columns
      currentY = Math.max(currentY, infoStartY + 26) + 10

      // Separator line
      pdf.setDrawColor(200, 200, 200)
      pdf.setLineWidth(0.2)
      pdf.line(margin, currentY, pageWidth - margin, currentY)
      currentY += 8

      // Items Table
      const tableStartY = currentY
      const rowHeight = 8
      const colWidths = [pageWidth - margin * 2 - 40, 40] // Item Name, Quantity
      const tableWidth = colWidths.reduce((sum, w) => sum + w, 0)
      const tableX = margin

      // Table header
      pdf.setFillColor(43, 48, 104) // #2B3068
      pdf.rect(tableX, tableStartY, tableWidth, rowHeight, 'F')
      
      pdf.setFontSize(9)
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Item Name', tableX + 2, tableStartY + 5.5)
      pdf.text('Quantity', tableX + colWidths[0] + colWidths[1] / 2, tableStartY + 5.5, { align: 'center' })

      // Table rows
      currentY = tableStartY + rowHeight
      pdf.setFontSize(8)
      pdf.setTextColor(0, 0, 0)
      pdf.setFont('helvetica', 'normal')

      sale.items.forEach((item, index) => {
        // Check if we need a new page
        if (currentY > pageHeight - 30) {
          pdf.addPage()
          currentY = margin + 10
          
          // Redraw table header on new page
          pdf.setFillColor(43, 48, 104)
          pdf.rect(tableX, currentY, tableWidth, rowHeight, 'F')
          pdf.setFontSize(9)
          pdf.setTextColor(255, 255, 255)
          pdf.setFont('helvetica', 'bold')
          pdf.text('Item Name', tableX + 2, currentY + 5.5)
          pdf.text('Quantity', tableX + colWidths[0] + colWidths[1] / 2, currentY + 5.5, { align: 'center' })
          currentY += rowHeight
          pdf.setFontSize(8)
          pdf.setTextColor(0, 0, 0)
          pdf.setFont('helvetica', 'normal')
        }

        // Alternate row background
        if (index % 2 === 0) {
          pdf.setFillColor(249, 250, 251) // gray-50
          pdf.rect(tableX, currentY, tableWidth, rowHeight, 'F')
        }

        // Row border
        pdf.setDrawColor(229, 231, 235)
        pdf.setLineWidth(0.1)
        pdf.rect(tableX, currentY, tableWidth, rowHeight)

        // Cell content
        const itemName = item?.product?.name || '-'
        const quantity = Number(item?.quantity || 0)
        
        pdf.text(itemName, tableX + 2, currentY + 5.5)
        pdf.text(quantity.toString(), tableX + colWidths[0] + colWidths[1] / 2, currentY + 5.5, { align: 'center' })

        currentY += rowHeight
      })

      // Total Quantity
      currentY += 5
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`TOTAL Quantity: ${totalQuantity}`, pageWidth - margin, currentY, { align: 'right' })
      currentY += 10

      // Separator line
      pdf.setDrawColor(200, 200, 200)
      pdf.setLineWidth(0.2)
      pdf.line(margin, currentY, pageWidth - margin, currentY)
      currentY += 10

      // Footer image
      try {
        const footerImg = new Image()
        footerImg.crossOrigin = 'anonymous'
        await new Promise<void>((resolve, reject) => {
          footerImg.onload = async () => {
            try {
              const canvas = document.createElement('canvas')
              const ctx = canvas.getContext('2d')
              canvas.width = footerImg.width
              canvas.height = footerImg.height
              if (ctx) {
                ctx.drawImage(footerImg, 0, 0)
                const footerImgData = canvas.toDataURL('image/png')
                const footerWidth = pageWidth - margin * 2
                const footerHeight = (footerImg.height * footerWidth) / footerImg.width
                
                // Check if footer fits on current page
                if (currentY + footerHeight > pageHeight - 20) {
                  pdf.addPage()
                  currentY = margin
                }
                
                pdf.addImage(footerImgData, 'PNG', margin, currentY, footerWidth, footerHeight)
                
                // Add signatures on footer
                const footerY = currentY
                const finalFooterHeight = footerHeight
                
                // Load and add customer signature (right side)
                if (signatureToUse) {
                  await new Promise<void>((sigResolve, sigReject) => {
                    const sigImg = new Image()
                    sigImg.crossOrigin = 'anonymous'
                    sigImg.onload = () => {
                      try {
                        const sigCanvas = document.createElement('canvas')
                        const sigCtx = sigCanvas.getContext('2d')
                        const aspectRatio = sigImg.width / sigImg.height
                        sigCanvas.width = 120
                        sigCanvas.height = 120 / aspectRatio
                        
                        if (sigCtx) {
                          sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height)
                          sigCtx.drawImage(sigImg, 0, 0, sigCanvas.width, sigCanvas.height)
                          
                          const imageData = sigCtx.getImageData(0, 0, sigCanvas.width, sigCanvas.height)
                          const data = imageData.data
                          
                          for (let i = 0; i < data.length; i += 4) {
                            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
                            if (brightness > 200) {
                              data[i + 3] = 0
                            } else {
                              data[i] = Math.max(0, data[i] - 50)
                              data[i + 1] = Math.max(0, data[i + 1] - 50)
                              data[i + 2] = Math.max(0, data[i + 2] - 50)
                              data[i + 3] = 255
                            }
                          }
                          
                          sigCtx.putImageData(imageData, 0, 0)
                          const sigImgData = sigCanvas.toDataURL('image/png')
                          
                          const sigWidth = 30
                          const sigHeight = 30 / aspectRatio
                          const sigX = pageWidth - margin - sigWidth - 8
                          const sigY = footerY + finalFooterHeight - sigHeight - 8
                          
                          pdf.addImage(sigImgData, 'PNG', sigX, sigY, sigWidth, sigHeight)
                        }
                        sigResolve()
                      } catch (err) {
                        console.warn('Failed to add customer signature:', err)
                        sigReject(err)
                      }
                    }
                    sigImg.onerror = () => {
                      console.warn('Failed to load customer signature image')
                      sigReject(new Error('Failed to load customer signature'))
                    }
                    sigImg.src = signatureToUse
                  })
                }
                
                // Load and add admin signature (left side)
                if (adminSignature) {
                  await new Promise<void>((sigResolve, sigReject) => {
                    const sigImg = new Image()
                    sigImg.crossOrigin = 'anonymous'
                    sigImg.onload = () => {
                      try {
                        const sigCanvas = document.createElement('canvas')
                        const sigCtx = sigCanvas.getContext('2d')
                        const aspectRatio = sigImg.width / sigImg.height
                        sigCanvas.width = 120
                        sigCanvas.height = 120 / aspectRatio
                        
                        if (sigCtx) {
                          sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height)
                          sigCtx.drawImage(sigImg, 0, 0, sigCanvas.width, sigCanvas.height)
                          
                          const imageData = sigCtx.getImageData(0, 0, sigCanvas.width, sigCanvas.height)
                          const data = imageData.data
                          
                          for (let i = 0; i < data.length; i += 4) {
                            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
                            if (brightness > 200) {
                              data[i + 3] = 0
                            } else {
                              data[i] = Math.max(0, data[i] - 50)
                              data[i + 1] = Math.max(0, data[i + 1] - 50)
                              data[i + 2] = Math.max(0, data[i + 2] - 50)
                              data[i + 3] = 255
                            }
                          }
                          
                          sigCtx.putImageData(imageData, 0, 0)
                          const sigImgData = sigCanvas.toDataURL('image/png')
                          
                          const sigWidth = 30
                          const sigHeight = 30 / aspectRatio
                          const sigX = margin + 8
                          const sigY = footerY + finalFooterHeight - sigHeight - 8
                          
                          pdf.addImage(sigImgData, 'PNG', sigX, sigY, sigWidth, sigHeight)
                        }
                        sigResolve()
                      } catch (err) {
                        console.warn('Failed to add admin signature:', err)
                        sigReject(err)
                      }
                    }
                    sigImg.onerror = () => {
                      console.warn('Failed to load admin signature image')
                      sigReject(new Error('Failed to load admin signature'))
                    }
                    sigImg.src = adminSignature
                  })
                }
              }
              resolve()
            } catch (err) {
              reject(err)
            }
          }
          footerImg.onerror = () => reject(new Error('Failed to load footer image'))
          footerImg.src = '/images/footer.png'
        })
      } catch (error) {
        console.warn('Failed to load footer image:', error)
      }

      const fileName = `delivery-note-DN-${sale.invoiceNumber}.pdf`
      pdf.save(fileName)
      toast.success("Delivery Note PDF downloaded successfully", {
        description: `File: ${fileName}`,
      })
    } catch (error) {
      console.error('Error generating PDF:', error)
      toast.error("Failed to download delivery note PDF", {
        description: "Please try again or contact support if the issue persists.",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby="delivery-note-dialog-description">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Delivery Note</DialogTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        {/* Hidden description for accessibility */}
        <div id="delivery-note-dialog-description" className="sr-only">
          Delivery note for invoice DN-{sale.invoiceNumber} showing customer information and items delivered.
        </div>

        <div className="space-y-6 flex flex-col min-h-[297mm] print:min-h-[100vh] print:relative">
          <div ref={contentRef} className="flex flex-col flex-grow print:max-h-[calc(100vh-120px)] print:overflow-hidden">
            {/* Company Header Image */}
            <div className="text-center pb-4">
              <img 
                src="/images/Header-Delivery-Note.png"
                alt="SYED TAYYAB INDUSTRIAL Delivery Note Header" 
                className="mx-auto max-w-full h-auto"
                crossOrigin="anonymous"
              />
            </div>

            {/* Customer (left) and Invoice (right) Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold text-[#2B3068] mb-2">Customer Information</h3>
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
                <h3 className="font-semibold text-[#2B3068] mb-2">Invoice Information</h3>
                <div className="space-y-1 text-sm">
                  <div>
                    <strong>Invoice #:</strong> {sale?.invoiceNumber ? `DN-${sale.invoiceNumber}` : '-'}
                  </div>
                  <div>
                    <strong>Date:</strong> {sale?.createdAt ? new Date(sale.createdAt).toLocaleDateString() : '-'}
                  </div>
                  {/* Payment Method removed for delivery notes */}
                </div>
              </div>
            </div>

            <Separator />

            {/* Items Table */}
            <div className="mt-4">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse receipt-table text-[11px] leading-tight">
                  <thead>
                    <tr className="bg-[#2B3068] text-white">
                      <th className="text-left p-2 border">Item Name</th>
                      <th className="text-center p-2 border">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sale.items.map((item, index) => (
                      <tr key={index} className="border-b h-5">
                        <td className="p-2 border">{item?.product?.name || '-'}</td>
                        <td className="text-center p-2 border">{Number(item?.quantity || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Total Quantity Text */}
            <div className="mt-4 text-right">
              <div className="text-sm font-semibold">
                TOTAL Quantity: {totalQuantity}
              </div>
            </div>

            <Separator />

            {/* Footer Image with Signatures - pushed to bottom */}
            <div className="mt-auto pt-8 print-area relative flex-shrink-0">
              <div className="text-center">
                <img 
                  src="/images/footer.png" 
                  alt="SYED TAYYAB INDUSTRIAL Footer" 
                  className="mx-auto max-w-full h-auto"
                  crossOrigin="anonymous"
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
            }
          `}</style>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-center mt-8 no-print">
            <Button variant="outline" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
            <Button onClick={handleDownload} className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white">
              <Printer className="w-4 h-4 mr-2" />
              Print Delivery Note
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

