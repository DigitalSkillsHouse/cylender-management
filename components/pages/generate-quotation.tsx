"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { FileDown, Eye, Edit, Trash2, Printer, Loader2, RefreshCw } from "lucide-react"
import ProductQuoteDialog from "@/components/product-quote-dialog"
import QuotationPaperPreview from "@/components/quotation-paper-preview"

interface Product {
  _id: string
  name: string
  productCode: string
  category: "gas" | "cylinder"
  costPrice: number
  leastPrice: number
}

interface Quotation {
  _id: string
  quotationNumber: string
  quotationSeq?: number
  customerName: string
  customerId?: string
  customerAddress?: string
  customerTRNumber?: string
  items: Array<{
    productId?: string
    name: string
    productCode?: string
    category?: string
    price: number
    quantity: number
  }>
  subtotal: number
  vatAmount: number
  grandTotal: number
  createdAt: string
}

export const GenerateQuotation = () => {
  const [products, setProducts] = useState<Product[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingQuotes, setLoadingQuotes] = useState(true)
  const [showQuoteDialog, setShowQuoteDialog] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null)

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string>("")
  const [pdfQuotation, setPdfQuotation] = useState<Quotation | null>(null)
  const [autoPrint, setAutoPrint] = useState(false)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewQuotation, setPreviewQuotation] = useState<Quotation | null>(null)

  const filteredQuotations = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return quotations
    return quotations.filter((qt) => {
      return (
        (qt.quotationNumber || "").toLowerCase().includes(q) ||
        (qt.customerName || "").toLowerCase().includes(q)
      )
    })
  }, [quotations, searchTerm])

  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/products", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
      setProducts(list)
    } catch (error) {
      console.error("Failed to fetch products for quotation:", error)
      setProducts([])
    }
  }

  const fetchQuotations = async () => {
    setLoadingQuotes(true)
    try {
      const res = await fetch("/api/quotations", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      setQuotations(Array.isArray(data?.data) ? data.data : [])
    } catch (error) {
      console.error("Failed to fetch quotations:", error)
      setQuotations([])
    } finally {
      setLoadingQuotes(false)
    }
  }

  const revokePdfUrl = () => {
    if (pdfUrl) {
      try {
        URL.revokeObjectURL(pdfUrl)
      } catch {}
    }
  }

  const loadImageDataUrl = async (src: string) => {
    const res = await fetch(src, { cache: "no-store" })
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ""))
      reader.onerror = () => reject(new Error("Failed to read image"))
      reader.readAsDataURL(blob)
    })
  }

	  const getImageSize = async (dataUrl: string) => {
	    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
	      const img = new Image()
	      img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height })
	      img.onerror = () => reject(new Error("Failed to load image"))
	      img.src = dataUrl
	    })
	  }

		  const buildQuotationPdf = async (q: Quotation) => {
		    const jsPDFModule = await import("jspdf")
		    const pdf = new (jsPDFModule as any).jsPDF("p", "mm", "a4")

		    const pageWidth = pdf.internal.pageSize.getWidth()
		    const pageHeight = pdf.internal.pageSize.getHeight()
		    const margin = 15

    // Load header/footer images once per build
    const [headerDataUrl, footerDataUrl] = await Promise.all([
      loadImageDataUrl("/images/Quotation-Paper-Invoice-Header.jpg"),
      loadImageDataUrl("/images/Footer-qoute-paper.jpg"),
    ])
	    const [headerSize, footerSize] = await Promise.all([getImageSize(headerDataUrl), getImageSize(footerDataUrl)])

		    const items = Array.isArray(q.items) ? q.items : []
		    const itemsPerPage = 15
		    const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage))

	    const dateStr = q.createdAt ? new Date(q.createdAt).toLocaleDateString() : new Date().toLocaleDateString()

			    for (let pageNum = 0; pageNum < totalPages; pageNum++) {
			      if (pageNum > 0) pdf.addPage()

			      // Header
			      const headerWidth = pageWidth - margin * 2
			      const headerHeight = headerSize.width ? (headerSize.height * headerWidth) / headerSize.width : 40
			      pdf.addImage(headerDataUrl, "JPEG", margin, margin, headerWidth, headerHeight)

			      let currentY = margin + headerHeight + 10

	      // Quotation number + date (top-right)
	      pdf.setFontSize(10)
	      pdf.setFont(undefined, "bold")
	      pdf.setTextColor(43, 48, 104)
      pdf.text(`Quotation #: ${q.quotationNumber}`, pageWidth - margin, currentY, { align: "right" })
      pdf.setFont(undefined, "normal")
      pdf.setTextColor(0, 0, 0)
      pdf.text(`Date: ${dateStr}`, pageWidth - margin, currentY + 6, { align: "right" })
      currentY += 10

      // Customer info (left)
      if (q.customerName) {
        pdf.setFontSize(12)
        pdf.setTextColor(43, 48, 104)
        pdf.setFont(undefined, "bold")
        pdf.text(`Customer: ${q.customerName}`, margin, currentY)
        currentY += 7

        if (q.customerTRNumber) {
          pdf.setFontSize(10)
          pdf.setFont(undefined, "normal")
          pdf.setTextColor(0, 0, 0)
          pdf.text(`TR Number: ${q.customerTRNumber}`, margin, currentY)
          currentY += 7
        }

        if (q.customerAddress) {
          pdf.setFontSize(10)
          pdf.setFont(undefined, "normal")
          pdf.setTextColor(0, 0, 0)
          const addressLines = pdf.splitTextToSize(`Address: ${q.customerAddress}`, pageWidth - margin * 2)
          addressLines.forEach((line: string) => {
            pdf.text(line, margin, currentY)
            currentY += 7
          })
        }

        currentY += 5
      }

      const startIndex = pageNum * itemsPerPage
      const endIndex = Math.min(startIndex + itemsPerPage, items.length)
      const pageItems = items.slice(startIndex, endIndex)

	      // Table
	      const tableStartY = currentY + 4
	      const rowHeight = 6.2
	      const colWidths = [12, 22, 62, 15, 24, 24, 27]
	      const tableWidth = colWidths.reduce((sum, w) => sum + w, 0)
	      const tableX = margin

      // Header row background
      pdf.setFillColor(43, 48, 104)
      pdf.rect(tableX, tableStartY, tableWidth, rowHeight, "F")
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(9)
      pdf.setFont(undefined, "bold")

      const headers = ["S.No", "Code", "Item", "Qty", "Price", "VAT 5%", "Total"]
      let x = tableX
      headers.forEach((h, i) => {
        const align = i >= 4 ? "right" : i === 0 || i === 3 ? "center" : "left"
        const pad = align === "right" ? colWidths[i] - 2 : align === "center" ? colWidths[i] / 2 : 2
        pdf.text(h, x + pad, tableStartY + 5, { align })
        x += colWidths[i]
      })

      // Rows
      pdf.setFont(undefined, "normal")
      pdf.setTextColor(0, 0, 0)
      let y = tableStartY + rowHeight
	      pageItems.forEach((it, idx) => {
	        const quantity = Number(it.quantity || 1)
	        const price = Number(it.price || 0)
	        const itemSubtotal = quantity * price
	        const itemVAT = Math.trunc(itemSubtotal * 0.05 * 100) / 100
        const itemTotal = Math.trunc((itemSubtotal + itemVAT) * 100) / 100

        const row = [
          String(startIndex + idx + 1),
          String(it.productCode || "-"),
          String(it.name || "-"),
          String(quantity),
          `AED ${price.toFixed(2)}`,
          `AED ${itemVAT.toFixed(2)}`,
          `AED ${itemTotal.toFixed(2)}`,
        ]

        // borders
        pdf.setDrawColor(200, 200, 200)
        pdf.rect(tableX, y, tableWidth, rowHeight)

        let cx = tableX
        row.forEach((cell, i) => {
          const align = i >= 4 ? "right" : i === 0 || i === 3 ? "center" : "left"
          const pad = align === "right" ? colWidths[i] - 2 : align === "center" ? colWidths[i] / 2 : 2
          pdf.text(cell, cx + pad, y + 5, { align })
          cx += colWidths[i]
          if (i < row.length - 1) {
            pdf.line(cx, y, cx, y + rowHeight)
          }
        })

	        y += rowHeight
		      })

			      // Footer image
			      const footerWidth = pageWidth - margin * 2
			      const footerHeight = footerSize.width ? (footerSize.height * footerWidth) / footerSize.width : 20
			      const footerY = pageHeight - margin - footerHeight - 8
			      pdf.addImage(footerDataUrl, "JPEG", margin, footerY, footerWidth, footerHeight)

			      // Page number
			      pdf.setFontSize(8)
		      pdf.setTextColor(107, 114, 128)
		      pdf.text(`Page ${pageNum + 1} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: "center" })
	    }

    return pdf
  }

  const openPdf = async (q: Quotation, print: boolean) => {
    revokePdfUrl()
    setPdfQuotation(q)
    setPdfOpen(true)
    setPdfLoading(true)
    setAutoPrint(print)

    try {
      const pdf = await buildQuotationPdf(q)
      const blob = pdf.output("blob")
      const url = URL.createObjectURL(blob)
      setPdfUrl(url)
    } catch (error) {
      console.error("Failed to build quotation PDF:", error)
      setPdfUrl("")
    } finally {
      setPdfLoading(false)
    }
  }

  const openPreview = (q: Quotation) => {
    setPreviewQuotation(q)
    setPreviewOpen(true)
  }

  const handleDeleteQuotation = async (q: Quotation) => {
    const ok = window.confirm(`Delete quotation #${q.quotationNumber}?`)
    if (!ok) return

    try {
      const res = await fetch(`/api/quotations/${q._id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data?.error || "Failed to delete quotation")
        return
      }
      await fetchQuotations()
      if (pdfQuotation?._id === q._id) {
        setPdfOpen(false)
      }
    } catch (error) {
      console.error("Delete quotation error:", error)
      alert("Failed to delete quotation")
    }
  }

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      await Promise.all([fetchProducts(), fetchQuotations()])
      setLoading(false)
    }
    run()
  }, [])

  useEffect(() => {
    return () => {
      revokePdfUrl()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[#2B3068]" />
          <p className="text-gray-600">Loading quotation page...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white rounded-t-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-xl sm:text-2xl">Generate Quotation</CardTitle>
              <p className="text-white/80 text-sm">Create and save quotation papers for customers.</p>
            </div>
            <Button
              variant="secondary"
              className="bg-white text-[#2B3068] hover:bg-gray-100 w-full sm:w-auto"
              onClick={() => setShowQuoteDialog(true)}
              disabled={products.length === 0}
            >
              <FileDown className="w-4 h-4 mr-2" />
              New Quotation
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search by quotation # or customer name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={fetchQuotations} disabled={loadingQuotes} className="w-full sm:w-auto">
              <RefreshCw className="w-4 h-4 mr-2" />
              {loadingQuotes ? "Refreshing..." : "Refresh"}
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="p-4">Quotation #</TableHead>
                  <TableHead className="p-4">Customer</TableHead>
                  <TableHead className="p-4">Items</TableHead>
                  <TableHead className="p-4">Total</TableHead>
                  <TableHead className="p-4">Date</TableHead>
                  <TableHead className="p-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotations.map((q) => (
                  <TableRow key={q._id}>
                    <TableCell className="p-4 font-mono font-semibold text-[#2B3068]">{q.quotationNumber}</TableCell>
                    <TableCell className="p-4">
                      <div className="font-medium">{q.customerName}</div>
                      <div className="text-xs text-gray-500">
                        {q.customerTRNumber ? `TR: ${q.customerTRNumber}` : "TR: -"}
                      </div>
                    </TableCell>
                    <TableCell className="p-4">
                      <Badge variant="secondary">{q.items?.length || 0} item(s)</Badge>
                    </TableCell>
                    <TableCell className="p-4 font-semibold">AED {Number(q.grandTotal || 0).toFixed(2)}</TableCell>
                    <TableCell className="p-4">{q.createdAt ? new Date(q.createdAt).toLocaleDateString() : ""}</TableCell>
                    <TableCell className="p-4">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openPreview(q)} title="View">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingQuotation(q)} title="Edit">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openPdf(q, true)} title="Print">
                          <Printer className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDeleteQuotation(q)} title="Delete" className="text-red-600 hover:text-red-700">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredQuotations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="p-8 text-center text-gray-500">
                      No quotations found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {showQuoteDialog && (
        <ProductQuoteDialog
          products={products.map((p) => ({
            _id: p._id,
            name: p.name,
            productCode: p.productCode,
            category: p.category,
            costPrice: p.costPrice,
            leastPrice: p.leastPrice,
          }))}
          totalCount={products.length}
          onClose={() => setShowQuoteDialog(false)}
          onSaved={() => fetchQuotations()}
        />
      )}

      {editingQuotation && (
        <ProductQuoteDialog
          products={products.map((p) => ({
            _id: p._id,
            name: p.name,
            productCode: p.productCode,
            category: p.category,
            costPrice: p.costPrice,
            leastPrice: p.leastPrice,
          }))}
          totalCount={products.length}
          initialQuotation={{
            _id: editingQuotation._id,
            quotationNumber: editingQuotation.quotationNumber,
            customerName: editingQuotation.customerName,
            customerId: editingQuotation.customerId,
            customerAddress: editingQuotation.customerAddress,
            customerTRNumber: editingQuotation.customerTRNumber,
            items: (editingQuotation.items || []).map((it) => ({
              productId: it.productId,
              name: it.name,
              productCode: it.productCode,
              category: it.category as any,
              price: Number(it.price || 0),
              quantity: Number(it.quantity || 1),
            })),
          }}
          onClose={() => setEditingQuotation(null)}
          onSaved={async () => {
            setEditingQuotation(null)
            await fetchQuotations()
          }}
        />
      )}

      <Dialog
        open={pdfOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPdfOpen(false)
            setPdfQuotation(null)
            setAutoPrint(false)
            setPdfLoading(false)
            revokePdfUrl()
            setPdfUrl("")
          }
        }}
      >
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Quotation #{pdfQuotation?.quotationNumber || ""}</DialogTitle>
          </DialogHeader>
          <div className="h-[80vh] w-full overflow-hidden rounded-lg border bg-white">
            {pdfLoading ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[#2B3068]" />
                  <p className="text-gray-600">Generating PDF...</p>
                </div>
              </div>
            ) : pdfUrl ? (
              <iframe
                ref={iframeRef}
                src={pdfUrl}
                className="h-full w-full"
                onLoad={() => {
                  if (autoPrint) {
                    try {
                      iframeRef.current?.contentWindow?.focus()
                      iframeRef.current?.contentWindow?.print()
                    } catch {}
                    setAutoPrint(false)
                  }
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-600">Failed to load PDF preview.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewOpen(false)
            setPreviewQuotation(null)
          }
        }}
      >
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Quotation #{previewQuotation?.quotationNumber || ""}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[85vh] overflow-auto">
            <QuotationPaperPreview quotation={previewQuotation} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
