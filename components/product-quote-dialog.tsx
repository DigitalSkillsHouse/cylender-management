"use client"

import { useMemo, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Download, Trash2, X, Plus } from "lucide-react"

export interface ProductQuoteItem {
  _id: string
  name: string
  category: "gas" | "cylinder"
  cylinderSize?: "large" | "small"
  price: number
}

interface ProductQuoteDialogProps {
  products: Array<{
    _id: string
    name: string
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
        category: p.category,
        cylinderSize: p.cylinderSize,
        // Default quote price: use leastPrice if set, otherwise costPrice
        price: Number.isFinite(p.leastPrice) ? p.leastPrice : p.costPrice,
      })),
    [products]
  )

  const [items, setItems] = useState<ProductQuoteItem[]>(initialItems)

  const handleNameChange = (id: string, value: string) => {
    setItems((prev) => prev.map((it) => (it._id === id ? { ...it, name: value } : it)))
  }
  const handlePriceChange = (id: string, value: string) => {
    const num = Number(value)
    setItems((prev) => prev.map((it) => (it._id === id ? { ...it, price: isFinite(num) ? num : it.price } : it)))
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
        category: "gas",
        price: 0,
      },
    ])
  }

  const visibleCount = items.length

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

    // Calculate items per page (approximately 22-25 items per A4 page with smaller text)
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
      if (headerImg) {
        try {
          const headerCanvas = await html2canvas(headerImg, {
            scale: 2,
            backgroundColor: "#ffffff",
            useCORS: true,
          })
          const headerImgData = headerCanvas.toDataURL("image/png")
          const headerWidth = pageWidth - margin * 2
          const headerHeight = (headerCanvas.height * headerWidth) / headerCanvas.width
          pdf.addImage(headerImgData, "PNG", margin, margin, headerWidth, headerHeight)
        } catch (error) {
          console.warn("Failed to capture header image:", error)
        }
      }

      // Title and date are already in the header image, no need to duplicate

      // Add table headers with proper spacing after header
      const tableStartY = margin + 45
      const rowHeight = 8
      const colWidths = [15, 85, 35, 25, 35] // S.No, Item, Category, Type, Price
      const tableWidth = colWidths.reduce((sum, width) => sum + width, 0)
      const tableX = (pageWidth - tableWidth) / 2

      // Table header background
      pdf.setFillColor(43, 48, 104) // #2B3068
      pdf.rect(tableX, tableStartY, tableWidth, rowHeight, "F")

      // Table header text
      pdf.setFontSize(10)
      pdf.setTextColor(255, 255, 255)
      pdf.text("S.No", tableX + 2, tableStartY + rowHeight - 2)
      pdf.text("Item", tableX + colWidths[0] + 2, tableStartY + rowHeight - 2)
      pdf.text("Category", tableX + colWidths[0] + colWidths[1] + 2, tableStartY + rowHeight - 2)
      pdf.text("Type", tableX + colWidths[0] + colWidths[1] + colWidths[2] + 2, tableStartY + rowHeight - 2)
      pdf.text("Price (AED)", tableX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 2, tableStartY + rowHeight - 2)

      // Table rows
      pdf.setFontSize(6)
      pdf.setTextColor(0, 0, 0)
      
      let currentY = tableStartY + rowHeight
      
      pageItems.forEach((item, index) => {
        const actualIndex = startIndex + index + 1
        
        // Alternate row background for better readability
        if (index % 2 === 0) {
          pdf.setFillColor(249, 250, 251) // gray-50
          pdf.rect(tableX, currentY, tableWidth, rowHeight, "F")
        }
        
        // Row borders
        pdf.setDrawColor(229, 231, 235) // gray-200
        pdf.rect(tableX, currentY, tableWidth, rowHeight)
        
        // Cell content
        pdf.text(actualIndex.toString(), tableX + 2, currentY + rowHeight - 2)
        pdf.text(item.name || "-", tableX + colWidths[0] + 2, currentY + rowHeight - 2)
        pdf.text(item.category, tableX + colWidths[0] + colWidths[1] + 2, currentY + rowHeight - 2)
        pdf.text(item.category === "cylinder" ? item.cylinderSize || "-" : "-", tableX + colWidths[0] + colWidths[1] + colWidths[2] + 2, currentY + rowHeight - 2)
        pdf.text(`AED ${Number(item.price || 0).toFixed(2)}`, tableX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 2, currentY + rowHeight - 2)
        
        currentY += rowHeight
      })

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
            <DialogTitle>Generate Quote — Product List ({visibleCount}/{totalCount})</DialogTitle>
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
            <Separator className="my-4" />

            <div className="overflow-x-auto">
              <table className="w-full border-collapse receipt-table text-[11px] leading-tight">
                <thead>
                  <tr className="bg-[#2B3068] text-white">
                    <th className="text-center p-2 border w-12">S.No</th>
                    <th className="text-left p-2 border">Item</th>
                    <th className="text-center p-2 border">Category</th>
                    <th className="text-center p-2 border">Type</th>
                    <th className="text-right p-2 border">Price (AED)</th>
                    <th className="text-center p-2 border">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, index) => (
                    <tr key={it._id} className="border-b h-5">
                      <td className="p-2 align-middle text-center w-12">
                        <span className="text-[11px] font-medium">{index + 1}</span>
                      </td>
                      <td className="p-2 align-middle">{it.name || "-"}</td>
                      <td className="p-2 align-middle text-center capitalize">{it.category}</td>
                      <td className="p-2 align-middle text-center">{it.category === "cylinder" ? it.cylinderSize || "-" : "-"}</td>
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
                </div>

                <Separator className="my-3" />

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse receipt-table text-[11px] leading-tight">
                    <thead>
                      <tr className="bg-[#2B3068] text-white">
                        <th className="text-center p-2 border w-12">S.No</th>
                        <th className="text-left p-2 border">Item</th>
                        <th className="text-center p-2 border">Category</th>
                        <th className="text-center p-2 border">Type</th>
                        <th className="text-right p-2 border">Price (AED)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, index) => (
                        <tr key={it._id} className="border-b h-5">
                          <td className="p-2 align-middle text-center w-12">{index + 1}</td>
                          <td className="p-2 align-middle">{it.name || "-"}</td>
                          <td className="p-2 align-middle text-center capitalize">{it.category}</td>
                          <td className="p-2 align-middle text-center">{it.category === "cylinder" ? it.cylinderSize || "-" : "-"}</td>
                          <td className="p-2 align-middle text-right">AED {Number(it.price || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
              <Button variant="outline" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
