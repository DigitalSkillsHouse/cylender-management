"use client"

import { useMemo, useRef, useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Download, Trash2, X, Plus, Eye } from "lucide-react"

export interface ProductQuoteItem {
  _id: string
  name: string
  productCode: string
  category: "gas" | "cylinder"
  cylinderSize?: "large" | "small"
  price: number
  quantity: number
}

interface ProductQuoteDialogProps {
  products: Array<{
    _id: string
    name: string
    productCode: string
    category: "gas" | "cylinder"
    cylinderSize?: "large" | "small"
    costPrice: number
    leastPrice: number
  }>
  totalCount: number
  onClose: () => void
}

export default function ProductQuoteDialog({ products, totalCount, onClose }: ProductQuoteDialogProps) {
  // Reference to PRINT-ONLY content (read-only view)
  const printRef = useRef<HTMLDivElement | null>(null)
  const initialItems = useMemo<ProductQuoteItem[]>(
    () =>
      (products || []).map((p) => ({
        _id: p._id,
        name: p.name,
        productCode: p.productCode,
        category: p.category,
        cylinderSize: p.cylinderSize,
        // Default quote price: use leastPrice if set, otherwise costPrice
        price: Number.isFinite(p.leastPrice) ? p.leastPrice : p.costPrice,
        quantity: 1, // Default quantity
      })),
    [products]
  )

  const [items, setItems] = useState<ProductQuoteItem[]>(initialItems)
  const [customerName, setCustomerName] = useState<string>("")
  const [showPreview, setShowPreview] = useState(false)
  const [adminSignature, setAdminSignature] = useState<string | null>(null)

  // Load admin signature from localStorage on component mount
  useEffect(() => {
    try {
      const sig = typeof window !== 'undefined' ? localStorage.getItem("adminSignature") : null
      setAdminSignature(sig)
      console.log("Admin signature loaded:", sig ? "Found" : "Not found")
    } catch (e) {
      console.warn("Failed to load admin signature:", e)
      setAdminSignature(null)
    }
  }, [])

  const handleNameChange = (id: string, value: string) => {
    setItems((prev) => prev.map((it) => (it._id === id ? { ...it, name: value } : it)))
  }
  const handlePriceChange = (id: string, value: string) => {
    const num = Number(value)
    setItems((prev) => prev.map((it) => (it._id === id ? { ...it, price: isFinite(num) ? num : it.price } : it)))
  }
  const handleQuantityChange = (id: string, value: string) => {
    const num = Number(value)
    setItems((prev) => prev.map((it) => (it._id === id ? { ...it, quantity: isFinite(num) && num > 0 ? num : it.quantity } : it)))
  }
  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((it) => it._id !== id))
  }
  const handleAddRow = () => {
    setItems((prev) => [
      ...prev,
      {
        _id: Math.random().toString(36).slice(2),
        name: "",
        productCode: "",
        category: "gas",
        price: 0,
        quantity: 1,
      },
    ])
  }

  const visibleCount = items.length

  // Helper function to convert number to words
  const numberToWords = (num: number): string => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
    const scales = ['', 'Thousand', 'Million', 'Billion']

    if (num === 0) return 'Zero'

    const convertHundreds = (n: number): string => {
      let result = ''
      if (n >= 100) {
        result += ones[Math.floor(n / 100)] + ' Hundred '
        n %= 100
      }
      if (n >= 20) {
        result += tens[Math.floor(n / 10)] + ' '
        n %= 10
      }
      if (n > 0) {
        result += ones[n] + ' '
      }
      return result
    }

    const parts = []
    let scaleIndex = 0
    
    while (num > 0) {
      const chunk = num % 1000
      if (chunk !== 0) {
        const chunkWords = convertHundreds(chunk) + scales[scaleIndex]
        parts.unshift(chunkWords.trim())
      }
      num = Math.floor(num / 1000)
      scaleIndex++
    }

    return parts.join(' ')
  }

  // Calculate totals
  const subtotal = items.reduce((total, item) => total + (Number(item.quantity || 1) * Number(item.price || 0)), 0)
  const vatAmount = subtotal * 0.05 // 5% VAT
  const grandTotal = subtotal + vatAmount

  const handleDownload = async () => {
    const [{ default: html2canvas }, jsPDFModule] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ])

    // Capture the PRINT-ONLY node to avoid inputs in the PDF
    const node = printRef.current
    if (!node) return

    // Ensure all images inside the print node are fully loaded (especially header)
    const imgs = Array.from(node.querySelectorAll<HTMLImageElement>("img"))
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete && img.naturalWidth > 0) return resolve()
            img.addEventListener("load", () => resolve(), { once: true })
            img.addEventListener("error", () => resolve(), { once: true })
          })
      )
    )

    const pdf = new (jsPDFModule as any).jsPDF("p", "mm", "a4")
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 15

    // Calculate items per page (approximately 20-25 items per A4 page with compact spacing)
    const itemsPerPage = 22
    const totalPages = Math.ceil(items.length / itemsPerPage)

    for (let pageNum = 0; pageNum < totalPages; pageNum++) {
      if (pageNum > 0) {
        pdf.addPage()
      }

      const startIndex = pageNum * itemsPerPage
      const endIndex = Math.min(startIndex + itemsPerPage, items.length)
      const pageItems = items.slice(startIndex, endIndex)

      // Add header image to each page
      const headerImg = node.querySelector("img") as HTMLImageElement
      let headerHeight = 0
      if (headerImg) {
        try {
          const headerCanvas = await html2canvas(headerImg, {
            scale: 2,
            backgroundColor: "#ffffff",
            useCORS: true,
          })
          const headerImgData = headerCanvas.toDataURL("image/png")
          const headerWidth = pageWidth - margin * 2
          headerHeight = (headerCanvas.height * headerWidth) / headerCanvas.width
          pdf.addImage(headerImgData, "PNG", margin, margin, headerWidth, headerHeight)
        } catch (error) {
          console.warn("Failed to capture header image:", error)
          headerHeight = 40 // Fallback height if image fails
        }
      }

      let currentYPosition = margin + headerHeight + 10 // Start after header with some spacing
      
      // Add customer name with better styling
      if (customerName) {
        pdf.setFontSize(14)
        pdf.setTextColor(43, 48, 104) // #2B3068
        pdf.setFont(undefined, 'bold')
        pdf.text(`Customer: ${customerName}`, margin, currentYPosition)
        currentYPosition += 15 // Add spacing after customer name
      }

      // Add table with perfect margins and spacing
      const tableStartY = currentYPosition + 5
      const rowHeight = 8 // Smaller row height for better fit
      const colWidths = [12, 20, 50, 15, 22, 22, 25] // S.No, Code, Item, Quantity, Price, VAT 5%, Total - removed Category, adjusted widths
      const tableWidth = colWidths.reduce((sum, width) => sum + width, 0)
      const tableX = (pageWidth - tableWidth) / 2 // Center table with equal left and right margins

      // Table header background
      pdf.setFillColor(43, 48, 104) // #2B3068
      pdf.rect(tableX, tableStartY, tableWidth, rowHeight, "F")

      // Table header text with perfect alignment
      pdf.setFontSize(9)
      pdf.setTextColor(255, 255, 255)
      pdf.setFont(undefined, 'bold')
      
      // Column positions for perfect alignment
      let colX = tableX
      
      // S.No - centered
      pdf.text("S.No", colX + colWidths[0]/2, tableStartY + 5.5, { align: "center" })
      colX += colWidths[0]
      
      // Code - left aligned with smaller padding
      pdf.text("Code", colX + 2, tableStartY + 5.5)
      colX += colWidths[1]
      
      // Item - left aligned with smaller padding
      pdf.text("Item", colX + 2, tableStartY + 5.5)
      colX += colWidths[2]
      
      // Qty - centered
      pdf.text("Qty", colX + colWidths[3]/2, tableStartY + 5.5, { align: "center" })
      colX += colWidths[3]
      
      // Price (AED) - centered
      pdf.text("Price", colX + colWidths[4]/2, tableStartY + 5.5, { align: "center" })
      colX += colWidths[4]
      
      // VAT 5% - centered
      pdf.text("VAT 5%", colX + colWidths[5]/2, tableStartY + 5.5, { align: "center" })
      colX += colWidths[5]
      
      // Total (AED) - centered
      pdf.text("Total", colX + colWidths[6]/2, tableStartY + 5.5, { align: "center" })
      
      // Add vertical column separators to header for consistency
      pdf.setDrawColor(255, 255, 255) // White lines on dark header
      pdf.setLineWidth(0.2)
      let headerSeparatorX = tableX
      for (let i = 0; i < colWidths.length - 1; i++) {
        headerSeparatorX += colWidths[i]
        pdf.line(headerSeparatorX, tableStartY, headerSeparatorX, tableStartY + rowHeight)
      }

      // Table rows with better styling
      pdf.setFontSize(7) // Smaller font for better fit
      pdf.setTextColor(0, 0, 0)
      pdf.setFont(undefined, 'normal')
      
      let currentY = tableStartY + rowHeight
      
      pageItems.forEach((item, index) => {
        const actualIndex = startIndex + index + 1
        
        // Alternate row background for better readability
        if (index % 2 === 0) {
          pdf.setFillColor(249, 250, 251) // gray-50
          pdf.rect(tableX, currentY, tableWidth, rowHeight, "F")
        }
        
        // Row borders with column separators
        pdf.setDrawColor(229, 231, 235) // gray-200
        pdf.setLineWidth(0.1)
        pdf.rect(tableX, currentY, tableWidth, rowHeight)
        
        // Add vertical column separators for better definition
        let separatorX = tableX
        for (let i = 0; i < colWidths.length - 1; i++) {
          separatorX += colWidths[i]
          pdf.line(separatorX, currentY, separatorX, currentY + rowHeight)
        }
        
        // Cell content with perfect alignment matching headers
        let colX = tableX
        
        // S.No - centered (matching header)
        pdf.text(actualIndex.toString(), colX + colWidths[0]/2, currentY + 5.5, { align: "center" })
        colX += colWidths[0]
        
        // Code - left aligned with smaller padding
        pdf.text(item.productCode || "-", colX + 2, currentY + 5.5)
        colX += colWidths[1]
        
        // Item - left aligned with smaller padding, truncate if too long
        const itemName = (item.name || "-").length > 22 ? (item.name || "-").substring(0, 19) + "..." : (item.name || "-")
        pdf.text(itemName, colX + 2, currentY + 5.5)
        colX += colWidths[2]
        
        // Qty - centered (matching header)
        pdf.text(Number(item.quantity || 1).toString(), colX + colWidths[3]/2, currentY + 5.5, { align: "center" })
        colX += colWidths[3]
        
        // Price - right aligned with smaller padding
        pdf.text(`${Number(item.price || 0).toFixed(2)}`, colX + colWidths[4] - 2, currentY + 5.5, { align: "right" })
        colX += colWidths[4]
        
        // VAT - right aligned with smaller padding
        pdf.text(`${((Number(item.quantity || 1) * Number(item.price || 0)) * 0.05).toFixed(2)}`, colX + colWidths[5] - 2, currentY + 5.5, { align: "right" })
        colX += colWidths[5]
        
        // Total - right aligned with smaller padding
        pdf.text(`${(Number(item.quantity || 1) * Number(item.price || 0)).toFixed(2)}`, colX + colWidths[6] - 2, currentY + 5.5, { align: "right" })
        
        currentY += rowHeight
      })

      // Add totals summary on the last page only
      if (pageNum === totalPages - 1) {
        currentY += 15 // Add some space after table
        
        // Compact totals box for better space utilization
        const totalsBoxWidth = 70 // Reduced from 85
        const totalsBoxHeight = 35 // Reduced from 50
        const totalsBoxX = pageWidth - margin - totalsBoxWidth
        const totalsBoxY = currentY
        
        // Totals box background with border
        pdf.setFillColor(249, 250, 251) // gray-50
        pdf.setDrawColor(229, 231, 235) // gray-200
        pdf.setLineWidth(0.5)
        pdf.rect(totalsBoxX, totalsBoxY, totalsBoxWidth, totalsBoxHeight, "FD")
        
        // Subtotal - smaller font and tighter spacing
        pdf.setFontSize(8) // Reduced from 10
        pdf.setTextColor(0, 0, 0)
        pdf.setFont(undefined, 'normal')
        pdf.text("Subtotal:", totalsBoxX + 3, totalsBoxY + 6)
        pdf.setFont(undefined, 'bold')
        pdf.text(`AED ${subtotal.toFixed(2)}`, totalsBoxX + totalsBoxWidth - 3, totalsBoxY + 6, { align: "right" })
        
        // VAT - tighter spacing
        pdf.setFont(undefined, 'normal')
        pdf.setTextColor(34, 197, 94) // green-500
        pdf.text("VAT (5%):", totalsBoxX + 3, totalsBoxY + 12)
        pdf.setFont(undefined, 'bold')
        pdf.text(`AED ${vatAmount.toFixed(2)}`, totalsBoxX + totalsBoxWidth - 3, totalsBoxY + 12, { align: "right" })
        
        // Separator line
        pdf.setDrawColor(156, 163, 175) // gray-400
        pdf.setLineWidth(0.3)
        pdf.line(totalsBoxX + 3, totalsBoxY + 15, totalsBoxX + totalsBoxWidth - 3, totalsBoxY + 15)
        
        // Grand Total - smaller font
        pdf.setFontSize(9) // Reduced from 12
        pdf.setTextColor(43, 48, 104) // #2B3068
        pdf.setFont(undefined, 'bold')
        pdf.text("Grand Total:", totalsBoxX + 3, totalsBoxY + 21)
        pdf.text(`AED ${grandTotal.toFixed(2)}`, totalsBoxX + totalsBoxWidth - 3, totalsBoxY + 21, { align: "right" })
        
        // Amount in Words section - more compact
        pdf.setFontSize(6) // Reduced from 8
        pdf.setTextColor(75, 85, 99) // gray-600
        pdf.setFont(undefined, 'bold')
        pdf.text("Amount in Words:", totalsBoxX + 3, totalsBoxY + 27)
        
        pdf.setFontSize(6) // Reduced from 8
        pdf.setFont(undefined, 'normal')
        const amountInWords = `${numberToWords(Math.floor(grandTotal))} Dirhams ${grandTotal % 1 !== 0 ? `and ${Math.round((grandTotal % 1) * 100)} Fils` : ''} Only`
        const wordsLines = pdf.splitTextToSize(amountInWords, totalsBoxWidth - 6)
        wordsLines.forEach((line: string, index: number) => {
          pdf.text(line, totalsBoxX + 3, totalsBoxY + 31 + (index * 3)) // Tighter line spacing
        })
        
        // Update currentY for warning message positioning - less spacing
        currentY = totalsBoxY + totalsBoxHeight + 8 // Reduced from 15
      }

      // Add warning message and footer on the last page only
      if (pageNum === totalPages - 1) {
        // Calculate available space for warning and footer - more compact
        const availableSpace = pageHeight - currentY - 25 // Leave space for page number
        const warningHeight = 28 // Reduced from 35
        const footerHeight = 35 // Reduced from 40
        const totalNeeded = warningHeight + footerHeight + 12 // Reduced spacing from 20 to 12
        
        let warningY = currentY + 8 // Reduced from 15
        
        // More aggressive fitting - try to keep everything on same page for small quotes
        if (totalNeeded > availableSpace) {
          if (availableSpace < warningHeight + 8) {
            // Not enough space even for warning, add new page
            pdf.addPage()
            warningY = margin + 15 // Reduced from 20
          } else {
            // Adjust warning position to fit - more compact
            warningY = Math.max(currentY + 5, pageHeight - totalNeeded - 8)
          }
        }
        
        // Warning box background with better styling
        pdf.setFillColor(255, 243, 205) // yellow-100
        pdf.setDrawColor(251, 191, 36) // yellow-400
        pdf.setLineWidth(0.5)
        pdf.rect(margin, warningY, pageWidth - margin * 2, warningHeight, "FD")
        
        // Warning title - more compact
        pdf.setFontSize(9) // Reduced from 11
        pdf.setTextColor(146, 64, 14) // yellow-800
        pdf.setFont(undefined, 'bold')
        pdf.text("PAY ATTENTION PLEASE!", margin + 4, warningY + 8) // Reduced spacing
        
        // Warning text - more compact
        pdf.setFontSize(7) // Reduced from 8
        pdf.setTextColor(92, 38, 5) // yellow-900
        pdf.setFont(undefined, 'normal')
        const warningText = "Prices mentioned in the quotation are valid for one week only, and may be updated after this time. During cylinder use, if the Valve, spindle, Valve Guard, Paint Charge, or cylinder is found Damaged or Broken the customer will need to pay for the necessary repairs or part replacement."
        
        // Split text into lines that fit within the box
        const maxWidth = pageWidth - margin * 2 - 8
        const lines = pdf.splitTextToSize(warningText, maxWidth)
        
        // Draw each line with tighter spacing
        lines.forEach((line: string, index: number) => {
          pdf.text(line, margin + 4, warningY + 14 + (index * 3)) // Tighter line spacing
        })
        
        // Add footer image after warning message - reduced spacing
        const footerY = warningY + warningHeight + 6 // Reduced from 10
        
        try {
          // Use admin signature from state (already loaded from localStorage)
          console.log("Using admin signature for PDF:", adminSignature ? "Available" : "Not available")
          
          // Create a new image element to load the footer
          const footerImg = new Image()
          footerImg.crossOrigin = "anonymous"
          
          await new Promise<void>((resolve, reject) => {
            footerImg.onload = async () => {
              try {
                // Create canvas to capture the image
                const canvas = document.createElement('canvas')
                const ctx = canvas.getContext('2d')
                canvas.width = footerImg.width
                canvas.height = footerImg.height
                
                if (ctx) {
                  ctx.drawImage(footerImg, 0, 0)
                  const footerImgData = canvas.toDataURL("image/png")
                  
                  const footerWidth = pageWidth - margin * 2
                  const actualFooterHeight = (footerImg.height * footerWidth) / footerImg.width
                  
                  // Ensure footer fits on page
                  const maxFooterY = pageHeight - actualFooterHeight - 20
                  const finalFooterY = Math.min(footerY, maxFooterY)
                  
                  pdf.addImage(footerImgData, "PNG", margin, finalFooterY, footerWidth, actualFooterHeight)
                  
                  // Add admin signature on bottom right of footer image
                  if (adminSignature) {
                    try {
                      // Create a promise to handle signature loading
                      await new Promise<void>((sigResolve, sigReject) => {
                        const signatureImg = new Image()
                        signatureImg.crossOrigin = "anonymous"
                        signatureImg.onload = () => {
                          try {
                            const sigCanvas = document.createElement('canvas')
                            const sigCtx = sigCanvas.getContext('2d')
                            
                            // Set canvas size based on signature aspect ratio
                            const aspectRatio = signatureImg.width / signatureImg.height
                            sigCanvas.width = 120
                            sigCanvas.height = 120 / aspectRatio
                            
                            if (sigCtx) {
                              // Clear canvas with transparent background
                              sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height)
                              
                              // Draw signature first
                              sigCtx.drawImage(signatureImg, 0, 0, sigCanvas.width, sigCanvas.height)
                              
                              // Get image data to process pixels
                              const imageData = sigCtx.getImageData(0, 0, sigCanvas.width, sigCanvas.height)
                              const data = imageData.data
                              
                              // Remove white/light background, keep only dark signature lines
                              for (let i = 0; i < data.length; i += 4) {
                                const r = data[i]
                                const g = data[i + 1]
                                const b = data[i + 2]
                                
                                // If pixel is light (close to white), make it transparent
                                const brightness = (r + g + b) / 3
                                if (brightness > 200) {
                                  data[i + 3] = 0 // Make transparent
                                } else {
                                  // Make dark pixels even darker for better visibility
                                  data[i] = Math.max(0, r - 50)     // Darken red
                                  data[i + 1] = Math.max(0, g - 50) // Darken green  
                                  data[i + 2] = Math.max(0, b - 50) // Darken blue
                                  data[i + 3] = 255 // Keep opaque
                                }
                              }
                              
                              // Put processed image data back
                              sigCtx.putImageData(imageData, 0, 0)
                              
                              const sigImgData = sigCanvas.toDataURL("image/png")
                              
                              // Position signature on bottom right of footer
                              const sigWidth = 30
                              const sigHeight = 30 / aspectRatio
                              const sigX = pageWidth - margin - sigWidth - 8
                              const sigY = finalFooterY + actualFooterHeight - sigHeight - 8
                              
                              pdf.addImage(sigImgData, "PNG", sigX, sigY, sigWidth, sigHeight)
                              console.log("Admin signature added to PDF")
                            }
                            sigResolve()
                          } catch (err) {
                            console.warn("Failed to add signature image:", err)
                            sigReject(err)
                          }
                        }
                        signatureImg.onerror = () => {
                          console.warn("Failed to load admin signature image")
                          sigReject(new Error("Failed to load signature"))
                        }
                        signatureImg.src = adminSignature
                      })
                    } catch (sigError) {
                      console.warn("Signature loading failed:", sigError)
                      // Add text fallback
                      pdf.setFontSize(8)
                      pdf.setTextColor(43, 48, 104)
                      pdf.setFont(undefined, 'bold')
                      pdf.text("Admin Signature", pageWidth - margin - 30, finalFooterY + actualFooterHeight - 8, { align: "center" })
                    }
                  } else {
                    // Add text-based admin signature
                    pdf.setFontSize(8)
                    pdf.setTextColor(43, 48, 104) // #2B3068
                    pdf.setFont(undefined, 'bold')
                    pdf.text("Admin Signature", pageWidth - margin - 30, finalFooterY + actualFooterHeight - 8, { align: "center" })
                    console.log("No admin signature found in localStorage")
                  }
                }
                resolve()
              } catch (err) {
                reject(err)
              }
            }
            footerImg.onerror = () => reject(new Error("Failed to load footer image"))
            footerImg.src = "/images/Footer-qoute-paper.jpg"
          })
        } catch (error) {
          console.warn("Failed to load footer image:", error)
          // Add text-based footer if image fails
          pdf.setFontSize(10)
          pdf.setTextColor(43, 48, 104) // #2B3068
          pdf.setFont(undefined, 'bold')
          pdf.text("Admin Signature", pageWidth - margin - 30, footerY + 20, { align: "center" })
        }
      }
      
      // Add page number
      pdf.setFontSize(8)
      pdf.setTextColor(107, 114, 128)
      pdf.text(`Page ${pageNum + 1} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: "center" })
    }

    const dt = new Date()
    const stamp = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
    pdf.save(`product-quote-${stamp}.pdf`)
  }

  // Removed print button per request; only Download PDF remains

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto" aria-describedby="product-quote-description">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Product Quote</DialogTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div id="product-quote-description" className="sr-only">
          Editable product quote list with item names and prices. Remove rows or modify values, then download as PDF.
        </div>

        <div className="space-y-6">
          {/* Screen-only editable view (compact like receipt) */}
          <div className="print:hidden">
            <div className="text-center">
              <h2 className="text-lg font-bold text-[#2B3068]">Product Quote</h2>
              <p className="text-[11px] text-gray-500">Product List ({visibleCount}/{totalCount})</p>
            </div>
            
            {/* Customer Name Input */}
            <div className="space-y-2 mb-4">
              <label htmlFor="customerName" className="text-sm font-medium text-gray-700">Customer Name</label>
              <Input
                id="customerName"
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter customer name"
                className="h-10"
              />
            </div>
            
            <Separator className="my-4" />

            <div className="overflow-x-auto">
              <table className="w-full border-collapse receipt-table text-[11px] leading-tight">
                <thead>
                  <tr className="bg-[#2B3068] text-white">
                    <th className="text-center p-2 border w-12">S.No</th>
                    <th className="text-left p-2 border">Code</th>
                    <th className="text-left p-2 border">Item</th>
                    <th className="text-center p-2 border">Enter Quantity</th>
                    <th className="text-right p-2 border">Price (AED)</th>
                    <th className="text-right p-2 border">VAT 5%</th>
                    <th className="text-right p-2 border">Total (AED)</th>
                    <th className="text-center p-2 border">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, index) => (
                    <tr key={it._id} className="border-b h-5">
                      <td className="p-2 align-middle text-center w-12">
                        <span className="text-[11px] font-medium">{index + 1}</span>
                      </td>
                      <td className="p-2 align-middle font-mono">{it.productCode || "-"}</td>
                      <td className="p-2 align-middle">{it.name || "-"}</td>
                      <td className="p-2 align-middle min-w-[100px]">
                        <Input
                          type="number"
                          min="1"
                          value={Number(it.quantity).toString()}
                          onChange={(e) => handleQuantityChange(it._id, e.target.value)}
                          className="h-8 w-20 text-center text-[11px]"
                        />
                      </td>
                      <td className="p-2 align-middle min-w-[120px]">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-gray-500 text-[10px]">AED</span>
                          <Input
                            type="number"
                            step="0.01"
                            value={Number(it.price).toString()}
                            onChange={(e) => handlePriceChange(it._id, e.target.value)}
                            className="h-8 w-24 text-right text-[11px]"
                          />
                        </div>
                      </td>
                      <td className="p-2 align-middle text-right min-w-[80px]">
                        <span className="text-[11px] font-medium text-green-600">AED {((Number(it.quantity) * Number(it.price)) * 0.05).toFixed(2)}</span>
                      </td>
                      <td className="p-2 align-middle text-right min-w-[100px]">
                        <span className="text-[11px] font-semibold">AED {(Number(it.quantity) * Number(it.price)).toFixed(2)}</span>
                      </td>
                      <td className="p-2 text-center">
                        <Button variant="outline" size="sm" onClick={() => handleRemove(it._id)} className="text-red-600 hover:text-red-700 min-h-[36px]">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Summary */}
            <div className="mt-6 flex justify-end">
              <div className="bg-gray-50 p-4 rounded-lg border min-w-[300px]">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span className="font-medium">AED {subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-green-600">
                    <span>VAT (5%):</span>
                    <span className="font-medium">AED {vatAmount.toFixed(2)}</span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between text-lg font-bold text-[#2B3068]">
                    <span>Grand Total:</span>
                    <span>AED {grandTotal.toFixed(2)}</span>
                  </div>
                  <div className="text-xs text-gray-600 mt-2 border-t pt-2">
                    <strong>Amount in Words:</strong><br />
                    {numberToWords(Math.floor(grandTotal))} Dirhams {grandTotal % 1 !== 0 ? `and ${Math.round((grandTotal % 1) * 100)} Fils` : ''} Only
                  </div>
                </div>
              </div>
            </div>

            {/* Print/PDF read-only view (off-screen on screen, visible in print) */}
            <div
              ref={printRef}
              className="absolute -left-[9999px] top-0 print:static print:left-auto print:top-auto"
            >
              {/* Moderate capture width for balanced density on A4 */}
              <div className="w-[1600px] mx-auto">
                {/* PDF Header Image */}
                <img
                  src="/images/Quotation-Paper-Invoice-Header.jpg"
                  alt="Quotation Header"
                  className="w-full mb-3"
                  crossOrigin="anonymous"
                />
                <div className="text-center">
                  <h2 className="text-sm font-bold text-[#2B3068]">Product Quote</h2>
                  <p className="text-[10px] text-gray-600">{new Date().toLocaleDateString()}</p>
                  {customerName && (
                    <p className="text-[12px] font-semibold text-[#2B3068] mt-2">Customer: {customerName}</p>
                  )}
                </div>

                <Separator className="my-3" />

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse receipt-table text-[11px] leading-tight">
                    <thead>
                      <tr className="bg-[#2B3068] text-white">
                        <th className="text-center p-2 border w-12">S.No</th>
                        <th className="text-left p-2 border">Code</th>
                        <th className="text-left p-2 border">Item</th>
                        <th className="text-center p-2 border">Quantity</th>
                        <th className="text-right p-2 border">Price (AED)</th>
                        <th className="text-right p-2 border">VAT 5%</th>
                        <th className="text-right p-2 border">Total (AED)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, index) => (
                        <tr key={it._id} className="border-b h-5">
                          <td className="p-2 align-middle text-center w-12">{index + 1}</td>
                          <td className="p-2 align-middle">{it.productCode || "-"}</td>
                          <td className="p-2 align-middle">{it.name || "-"}</td>
                          <td className="p-2 align-middle text-center">{Number(it.quantity || 1)}</td>
                          <td className="p-2 align-middle text-right">AED {Number(it.price || 0).toFixed(2)}</td>
                          <td className="p-2 align-middle text-right text-green-600 font-medium">AED {((Number(it.quantity || 1) * Number(it.price || 0)) * 0.05).toFixed(2)}</td>
                          <td className="p-2 align-middle text-right font-semibold">AED {(Number(it.quantity || 1) * Number(it.price || 0)).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals Summary for Print */}
                <div className="mt-6 flex justify-end">
                  <div className="bg-gray-50 p-4 rounded-lg border min-w-[300px]">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Subtotal:</span>
                        <span className="font-medium">AED {subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-green-600">
                        <span>VAT (5%):</span>
                        <span className="font-medium">AED {vatAmount.toFixed(2)}</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between text-lg font-bold text-[#2B3068]">
                        <span>Grand Total:</span>
                        <span>AED {grandTotal.toFixed(2)}</span>
                      </div>
                      <div className="text-xs text-gray-600 mt-2 border-t pt-2">
                        <strong>Amount in Words:</strong><br />
                        {numberToWords(Math.floor(grandTotal))} Dirhams {grandTotal % 1 !== 0 ? `and ${Math.round((grandTotal % 1) * 100)} Fils` : ''} Only
                      </div>
                    </div>
                  </div>
                </div>

                {/* Warning Message for Print */}
                <div className="mt-8 p-4 bg-yellow-100 border border-yellow-400 rounded-lg">
                  <h3 className="text-yellow-800 font-semibold text-lg mb-2">PAY ATTENTION PLEASE!</h3>
                  <p className="text-yellow-900 text-sm leading-relaxed">
                    Prices mentioned in the quotation are valid for one week only, and may be updated after this time.
                    During cylinder use, if the Valve, spindle, Valve Guard, Paint Charge, or cylinder is found Damaged
                    or Broken the customer will need to pay for the necessary repairs or part replacement.
                  </p>
                </div>

                {/* Footer Image for Print */}
                <div className="w-full mt-8">
                  <img
                    src="/images/Footer-qoute-paper.jpg"
                    alt="Quote Footer"
                    className="w-full h-auto"
                    crossOrigin="anonymous"
                  />
                  {/* Admin Signature on footer */}
                  <div className="flex justify-end mt-2 mr-8">
                    <div className="text-center">
                      <div className="text-sm font-bold text-[#2B3068]">Admin Signature</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons - do not show in print */}
          <div className="flex flex-wrap justify-between items-center gap-3 no-print print:hidden">
            <Button variant="outline" onClick={handleAddRow} className="min-h-[36px]">
              <Plus className="w-4 h-4 mr-2" />
              Add Row
            </Button>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowPreview(true)}>
                <Eye className="w-4 h-4 mr-2" />
                Preview PDF
              </Button>
              <Button variant="outline" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
      
      {/* PDF Preview Modal */}
      {showPreview && (
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden" aria-describedby="pdf-preview-description">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>PDF Preview</DialogTitle>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleDownload}>
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </DialogHeader>

            <div id="pdf-preview-description" className="sr-only">
              Preview of the PDF that will be generated for download
            </div>

            <div className="overflow-y-auto max-h-[80vh] border rounded-lg bg-white p-6">
              {/* PDF Preview Content - Exact replica of what will be in PDF */}
              <div className="w-full mx-auto bg-white">
                {/* Header Image */}
                <div className="w-full mb-6">
                  <img
                    src="/images/Quotation-Paper-Invoice-Header.jpg"
                    alt="Quotation Header"
                    className="w-full h-auto"
                    style={{ maxHeight: '150px', objectFit: 'contain' }}
                  />
                </div>

                {/* Title and Date */}
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-[#2B3068] mb-2">Product Quote</h2>
                  <p className="text-sm text-gray-600 mb-4">{new Date().toLocaleDateString()}</p>
                  {customerName && (
                    <p className="text-lg font-semibold text-[#2B3068] mb-4">Customer: {customerName}</p>
                  )}
                </div>

                <Separator className="my-6" />

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-[#2B3068] text-white">
                        <th className="border border-gray-300 p-3 text-center font-semibold">S.No</th>
                        <th className="border border-gray-300 p-3 text-left font-semibold">Code</th>
                        <th className="border border-gray-300 p-3 text-left font-semibold">Item</th>
                        <th className="border border-gray-300 p-3 text-center font-semibold">Quantity</th>
                        <th className="border border-gray-300 p-3 text-right font-semibold">Price (AED)</th>
                        <th className="border border-gray-300 p-3 text-right font-semibold">VAT 5%</th>
                        <th className="border border-gray-300 p-3 text-right font-semibold">Total (AED)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => (
                        <tr key={item._id} className={index % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                          <td className="border border-gray-300 p-3 text-center">{index + 1}</td>
                          <td className="border border-gray-300 p-3 font-mono">{item.productCode || "-"}</td>
                          <td className="border border-gray-300 p-3">{item.name || "-"}</td>
                          <td className="border border-gray-300 p-3 text-center">{Number(item.quantity || 1)}</td>
                          <td className="border border-gray-300 p-3 text-right">AED {Number(item.price || 0).toFixed(2)}</td>
                          <td className="border border-gray-300 p-3 text-right text-green-600 font-medium">
                            AED {((Number(item.quantity || 1) * Number(item.price || 0)) * 0.05).toFixed(2)}
                          </td>
                          <td className="border border-gray-300 p-3 text-right font-semibold">
                            AED {(Number(item.quantity || 1) * Number(item.price || 0)).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Warning Message */}
                <div className="mt-8 p-4 bg-yellow-100 border border-yellow-400 rounded-lg">
                  <h3 className="text-yellow-800 font-semibold text-lg mb-2">PAY ATTENTION PLEASE!</h3>
                  <p className="text-yellow-900 text-sm leading-relaxed">
                    Prices mentioned in the quotation are valid for one week only, and may be updated after this time. 
                    During cylinder use, if the Valve, spindle, Valve Guard, Paint Charge, or cylinder is found Damaged 
                    or Broken the customer will need to pay for the necessary repairs or part replacement.
                  </p>
                </div>

                {/* Total Summary */}
                <div className="mt-6 flex justify-end">
                  <div className="bg-gray-50 p-4 rounded-lg border min-w-[350px]">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Subtotal:</span>
                        <span className="font-medium">AED {subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-green-600">
                        <span>VAT (5%):</span>
                        <span className="font-medium">AED {vatAmount.toFixed(2)}</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between text-lg font-bold text-[#2B3068]">
                        <span>Grand Total:</span>
                        <span>AED {grandTotal.toFixed(2)}</span>
                      </div>
                      <div className="text-xs text-gray-600 mt-2 border-t pt-2">
                        <strong>Amount in Words:</strong><br />
                        <span className="font-medium">
                          {numberToWords(Math.floor(grandTotal))} Dirhams {grandTotal % 1 !== 0 ? `and ${Math.round((grandTotal % 1) * 100)} Fils` : ''} Only
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Total Items: {items.length}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Image */}
                <div className="w-full mt-8">
                  <img
                    src="/images/Footer-qoute-paper.jpg"
                    alt="Quote Footer"
                    className="w-full h-auto"
                    style={{ maxHeight: '120px', objectFit: 'contain' }}
                  />
                  {/* Admin Signature on footer */}
                  <div className="flex justify-end mt-2 mr-8">
                    <div className="text-center">
                      {adminSignature ? (
                        <div className="flex flex-col items-center">
                          <img 
                            src={adminSignature} 
                            alt="Admin Signature" 
                            className="max-h-12 object-contain mb-1"
                            style={{
                              backgroundColor: 'transparent',
                              filter: 'contrast(1.5) brightness(0.7)',
                              mixBlendMode: 'normal'
                            }}
                          />
                          <div className="text-xs text-gray-600">Admin Signature</div>
                        </div>
                      ) : (
                        <div className="text-sm font-bold text-[#2B3068]">Admin Signature</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  )
}
