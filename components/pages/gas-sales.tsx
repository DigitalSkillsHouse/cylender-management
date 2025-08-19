"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Edit, Trash2, Receipt, Search, Filter } from "lucide-react"
import { salesAPI, customersAPI, productsAPI, employeeSalesAPI } from "@/lib/api"
import { ReceiptDialog } from "@/components/receipt-dialog"
import { SignatureDialog } from "@/components/signature-dialog"
import { CustomerDropdown } from "@/components/ui/customer-dropdown"
import { ProductDropdown } from "@/components/ui/product-dropdown"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import jsPDF from "jspdf"

interface Sale {
  _id: string
  invoiceNumber: string
  customer: {
    _id: string
    name: string
    phone: string
    address: string
  }
  items: Array<{
    product: {
      _id: string
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
  receivedAmount?: number
  notes?: string
  customerSignature?: string
  employee?: {
    _id: string
    name: string
    email: string
  }
  createdAt: string
  updatedAt: string
}

interface Customer {
  _id: string
  name: string
  phone: string
  address: string
  email?: string
}

interface Product {
  _id: string
  name: string
  category: "gas" | "cylinder"
  cylinderType?: "large" | "small"
  costPrice: number
  leastPrice: number
  currentStock: number
}

// Helper type used when normalizing items for receipt/signature flow
type NormalizedItem = {
  product: { name: string }
  quantity: number
  price: number
  total: number
}

export function GasSales() {
  const [sales, setSales] = useState<Sale[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [priceAlert, setPriceAlert] = useState<{ message: string; index: number | null }>({ message: '', index: null });
  
  // Stock insufficient popup state
  const [showStockInsufficientPopup, setShowStockInsufficientPopup] = useState(false)
  const [stockErrorMessage, setStockErrorMessage] = useState("")
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingSale, setEditingSale] = useState<Sale | null>(null)
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null)
  const [showSignatureDialog, setShowSignatureDialog] = useState(false)
  const [pendingSale, setPendingSale] = useState<Sale | null>(null)
  const [customerSignature, setCustomerSignature] = useState<string>("") 
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  // Per-item product autocomplete state
  const [productSearchTerms, setProductSearchTerms] = useState<string[]>([""])
  const [showProductSuggestions, setShowProductSuggestions] = useState<boolean[]>([false])
  // Single-entry item input state (2x2 grid pattern)
  const [currentItem, setCurrentItem] = useState<{ category: "gas" | "cylinder"; productId: string; quantity: string; price: string }>({
    category: "gas",
    productId: "",
    quantity: "1",
    price: "",
  })
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null)
  const [entryProductSearch, setEntryProductSearch] = useState("")
  const [showEntrySuggestions, setShowEntrySuggestions] = useState(false)
  // Export UI state
  const [showExportInput, setShowExportInput] = useState(false)
  const [exportSearch, setExportSearch] = useState("")
  const [showExportSuggestions, setShowExportSuggestions] = useState(false)
  const [filteredExportSuggestions, setFilteredExportSuggestions] = useState<string[]>([])
  
  // Export autocomplete handlers (customers only)
  const handleExportSearchChange = (value: string) => {
    setExportSearch(value)
    const v = value.trim().toLowerCase()
    if (v.length === 0) {
      setShowExportSuggestions(false)
      setFilteredExportSuggestions([])
      return
    }
    const names = (customers || []).map((c) => c.name || "").filter(Boolean)
    const filtered = Array.from(new Set(names))
      .filter((n) => n.toLowerCase().includes(v))
      .slice(0, 5)
    setFilteredExportSuggestions(filtered)
    setShowExportSuggestions(filtered.length > 0)
  }

  const handleExportSuggestionClick = (name: string) => {
    setExportSearch(name)
    setShowExportSuggestions(false)
  }

  const handleExportInputFocus = () => {
    if (exportSearch.trim().length > 0 && filteredExportSuggestions.length > 0) {
      setShowExportSuggestions(true)
    }
  }

  const handleExportInputBlur = () => {
    setTimeout(() => setShowExportSuggestions(false), 150)
  }
  
  // Customer autocomplete functionality for form
  const [customerSearchTerm, setCustomerSearchTerm] = useState("")
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false)
  const [filteredCustomerSuggestions, setFilteredCustomerSuggestions] = useState<Customer[]>([])
  
  // Search filter autocomplete functionality
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false)
  const [filteredSearchSuggestions, setFilteredSearchSuggestions] = useState<Customer[]>([])

  // Form state
  const [formData, setFormData] = useState({
    customerId: "",
    category: "gas", 
    items: [{ productId: "", quantity: "1", price: "", category: "gas" }], 
    paymentMethod: "cash",
    paymentStatus: "cleared",
    receivedAmount: "",
    paymentOption: "debit", // debit | credit | delivery_note
    notes: "",
  })

  // CSV export for Sales History
  const exportSalesCSV = () => {
    try {
      const term = (exportSearch || "").trim().toLowerCase()
      const sourceArray = Array.isArray(sales) ? sales : []
      const filtered = term
        ? sourceArray.filter((s) =>
            (s.customer?.name || "").toLowerCase().includes(term)
          )
        : sourceArray

      const escapeCSV = (val: any) => {
        const str = val === null || val === undefined ? "" : String(val)
        if (/[",\n]/.test(str)) {
          return '"' + str.replace(/"/g, '""') + '"'
        }
        return str
      }

      const headers = [
        "Invoice #",
        "Customer Name",
        "Customer Phone",
        "Items",
        "Total Amount (AED)",
        "Received Amount (AED)",
        "Payment Method",
        "Payment Status",
        "Notes",
        "Added By",
        "Date",
      ]

      const rows = filtered.map((s) => {
        const itemsDesc = (s.items || [])
          .map((it: any) => {
            const name = it?.product?.name || "Product"
            const qty = Number(it?.quantity) || 0
            const price = Number(it?.price) || 0
            return `${name} x${qty} @ ${price}`
          })
          .join("; ")

        const addedBy = s.employee?.name ? `Employee: ${s.employee.name}` : "Admin"
        const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleString() : ""

        return [
          escapeCSV(s.invoiceNumber || ""),
          escapeCSV(s.customer?.name || ""),
          escapeCSV(s.customer?.phone || ""),
          escapeCSV(itemsDesc),
          escapeCSV(((s as any).totalAmount ?? 0).toFixed ? (s as any).totalAmount.toFixed(2) : String((s as any).totalAmount || 0)),
          escapeCSV(((s as any).receivedAmount ?? 0).toFixed ? (s as any).receivedAmount.toFixed(2) : String((s as any).receivedAmount || 0)),
          escapeCSV(s.paymentMethod || ""),
          escapeCSV(s.paymentStatus || ""),
          escapeCSV(s.notes || ""),
          escapeCSV(addedBy),
          escapeCSV(dateStr),
        ].join(",")
      })

      const csv = [headers.join(","), ...rows].join("\n")
      const bom = "\uFEFF" // UTF-8 BOM for Excel compatibility
      const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      const ts = new Date().toISOString().replace(/[:.]/g, "-")
      const namePart = term ? `-${term.replace(/\s+/g, "_")}` : ""
      a.href = url
      a.download = `sales-export${namePart}-${ts}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Failed to export sales CSV:", err)
      alert("Failed to export CSV")
    }
  }

  // PDF export for Sales History (filtered by exportSearch) with compact layout and multiline rows
  const exportSalesPDF = () => {
    try {
      const term = (exportSearch || "").trim().toLowerCase()
      const sourceArray = Array.isArray(sales) ? sales : []
      const filtered = term
        ? sourceArray.filter((s: Sale) => (s.customer?.name || "").toLowerCase().includes(term))
        : sourceArray

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
      const marginX = 32
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      let y = 52

      // Title
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text('Gas Sales Export', marginX, y)
      y += 10
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      if (term) { doc.text(`Filter: ${term}`, marginX, y); y += 9 }
      doc.text(`Generated: ${new Date().toLocaleString()}`, marginX, y); y += 10

      // Header bar
      const headerHeight = 16
      const headerY = y
      doc.setFillColor(43, 48, 104)
      doc.rect(marginX - 4, headerY - 14, pageWidth - marginX * 2 + 8, headerHeight, 'F')

      // Headers (Phone and Address removed as requested)
      const headers = [
        'Invoice #','Customer','Items','Total (AED)','Received (AED)','Payment Method','Payment Status','Notes','Added By','Date'
      ]
      const colWidths = [
        70, 120, 260, 70, 80, 90, 90, 130, 70, 90
      ]

      // Draw headers
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      let xh = marginX
      headers.forEach((h, i) => { doc.text(h, xh, headerY); xh += (colWidths[i] || 80) })
      doc.setTextColor(0, 0, 0)
      y += 12

      // Row drawing with dynamic height
      const baseFontSize = 7
      const lineHeight = 9
      let rowIndex = 0
      const drawRow = (cells: string[]) => {
        // Page break + header redraw
        if (y > pageHeight - 52) {
          doc.addPage()
          y = 52
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(11)
          doc.text('Gas Sales Export (cont.)', marginX, y)
          y += 10
          const newHeaderY = y
          doc.setFillColor(43, 48, 104)
          doc.rect(marginX - 4, newHeaderY - 14, pageWidth - marginX * 2 + 8, headerHeight, 'F')
          doc.setTextColor(255,255,255)
          doc.setFontSize(7.5)
          let nx = marginX
          headers.forEach((h, i) => { doc.text(h, nx, newHeaderY); nx += (colWidths[i] || 80) })
          doc.setTextColor(0,0,0)
          y += 12
          rowIndex = 0
        }

        // Measure lines for each cell
        doc.setFont('helvetica', 'normal')
        const cellLines: string[][] = []
        const widths: number[] = []
        cells.forEach((cell, i) => {
          const cw = colWidths[i] || 80
          const text = String(cell ?? '')
          const lines = doc.splitTextToSize(text, Math.max(10, cw - 4)) as string[]
          cellLines.push(lines)
          widths.push(cw)
        })
        const maxLines = cellLines.reduce((m, l) => Math.max(m, l.length), 1)
        const rowHeight = Math.max(12, maxLines * lineHeight)

        // Zebra background
        if (rowIndex % 2 === 1) {
          doc.setFillColor(245, 247, 250)
          doc.rect(marginX - 4, y - (lineHeight - 2), pageWidth - marginX * 2 + 8, rowHeight, 'F')
        }

        // Draw text
        doc.setFontSize(baseFontSize)
        let cx = marginX
        cellLines.forEach((lines, i) => {
          const cw = widths[i]
          lines.forEach((line, li) => { doc.text(String(line), cx, y + (li * lineHeight)) })
          cx += cw
        })

        y += rowHeight
        rowIndex++
      }

      // Rows
      filtered.forEach((s: Sale) => {
        const itemsDesc = (s.items || []).map((it: any) => {
          const name = it?.product?.name || 'Product'
          const qty = Number(it?.quantity)||0
          const price = Number(it?.price)||0
          return `${name} x${qty} @ ${price}`
        }).join(' | ')
        const addedBy = s.employee?.name ? `Employee: ${s.employee.name}` : 'Admin'
        const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleString() : ''
        const totalStr = ((s as any).totalAmount ?? 0).toFixed ? (s as any).totalAmount.toFixed(2) : String((s as any).totalAmount || 0)
        const receivedStr = ((s as any).receivedAmount ?? 0).toFixed ? (s as any).receivedAmount.toFixed(2) : String((s as any).receivedAmount || 0)
        const row = [
          s.invoiceNumber || '',
          s.customer?.name || '',
          itemsDesc,
          totalStr,
          receivedStr,
          s.paymentMethod || '',
          s.paymentStatus || '',
          s.notes || '',
          addedBy,
          dateStr,
        ]
        drawRow(row)
      })

      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const namePart = term ? `-${term.replace(/\s+/g, '_')}` : ''
      doc.save(`sales-export${namePart}-${ts}.pdf`)
    } catch (err) {
      console.error('Failed to export sales PDF:', err)
      alert('Failed to export PDF')
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [salesResponse, employeeSalesResponse, customersResponse, productsResponse] = await Promise.all([
        salesAPI.getAll(),
        employeeSalesAPI.getAll(),
        customersAPI.getAll(),
        productsAPI.getAll(),
      ])

      // Ensure we're setting arrays - handle nested data structure for all APIs
      const adminSalesData = Array.isArray(salesResponse.data?.data) ? salesResponse.data.data : 
                           Array.isArray(salesResponse.data) ? salesResponse.data : []

      const employeeSalesData = Array.isArray(employeeSalesResponse.data) ? employeeSalesResponse.data : []

      const combinedSales = [...adminSalesData, ...employeeSalesData].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )

      const salesData = combinedSales
      
      const customersData = Array.isArray(customersResponse.data?.data) 
        ? customersResponse.data.data 
        : Array.isArray(customersResponse.data) 
          ? customersResponse.data 
          : Array.isArray(customersResponse) 
            ? customersResponse 
            : []
            
      const productsData = Array.isArray(productsResponse.data?.data) 
        ? productsResponse.data.data 
        : Array.isArray(productsResponse.data) 
          ? productsResponse.data 
          : Array.isArray(productsResponse) 
            ? productsResponse 
            : []
      
      console.log('GasSales - Processed customers data:', customersData)
      console.log('GasSales - Processed products data:', productsData)
      console.log('GasSales - Processed sales data:', salesData)
      
      setSales(salesData)
      setCustomers(customersData)
      setAllProducts(productsData)
      
      // Filter products based on selected category
      const filteredProducts = productsData.filter((product: Product) => product.category === formData.category)
      console.log('GasSales - Filtering products for category:', formData.category)
      console.log('GasSales - Filtered products:', filteredProducts)
      setProducts(filteredProducts)
    } catch (error) {
      console.error("Failed to fetch data:", error)
      // Type guard to check if error is an axios error
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any
        console.error("Error details:", axiosError.response?.data)
        console.error("Error status:", axiosError.response?.status)
      }
      setSales([])
      setCustomers([])
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      console.log('GasSales - Form submission attempt')
      console.log('GasSales - formData.customerId:', formData.customerId)
      console.log('GasSales - customers array:', customers)
      console.log('GasSales - customers length:', customers.length)
      
      const selectedCustomer = (customers || []).find((c) => c._id === formData.customerId)
      console.log('GasSales - selectedCustomer:', selectedCustomer)
      
      if (!selectedCustomer) {
        console.log('GasSales - No customer found, showing alert')
        alert("Please select a customer")
        return
      }

      const saleItems = formData.items
        .filter((item) => {
          const quantity = Number(item.quantity) || 0
          return item.productId && quantity > 0
        })
        .map((item) => {
          const product = (products || []).find((p) => p._id === item.productId)
          const quantity = Number(item.quantity) || 1
          // Use the user-entered price from the form
          const price = Number(item.price) || 0
          return {
            product: item.productId,
            quantity: quantity,
            price: price,
            total: price * quantity,
            category: item.category,
          }
        })

      if (saleItems.length === 0) {
        alert("Please add at least one item")
        return
      }

      const totalAmount = saleItems.reduce((sum, item) => sum + item.total, 0)

      // Derive final payment fields from paymentOption
      let derivedPaymentMethod = formData.paymentMethod
      let derivedPaymentStatus = formData.paymentStatus
      let derivedReceivedAmount = parseFloat(formData.receivedAmount) || 0

      if (formData.paymentOption === 'credit') {
        derivedPaymentMethod = 'credit'
        derivedPaymentStatus = 'pending'
        derivedReceivedAmount = 0
      } else if (formData.paymentOption === 'delivery_note') {
        derivedPaymentMethod = 'delivery_note'
        derivedPaymentStatus = 'pending'
        derivedReceivedAmount = 0
      } else if (formData.paymentOption === 'debit') {
        derivedPaymentMethod = 'debit'
        // paymentStatus already auto-managed by amount input logic
      }

      const saleData = {
        customer: formData.customerId,
        items: saleItems,
        totalAmount,
        paymentMethod: derivedPaymentMethod,
        paymentStatus: derivedPaymentStatus,
        receivedAmount: derivedReceivedAmount,
        notes: formData.notes,
      }

      console.log('GasSales - Submitting sale data:', saleData)
      console.log('GasSales - Sale items:', saleItems)
      console.log('GasSales - Form data items:', formData.items)

      let savedResponse: any = null
      if (editingSale) {
        console.log('GasSales - Updating existing sale:', editingSale._id)
        // Some backends treat PUT as full replace; include required fields like invoiceNumber
        const updatePayload = {
          ...saleData,
          invoiceNumber: (editingSale as any).invoiceNumber,
          customer: saleData.customer,
        }
        const fullUpdatePayload = {
          ...updatePayload,
          customerSignature: (editingSale as any).customerSignature || "",
        }
        try {
          console.log('GasSales - PUT full payload:', fullUpdatePayload)
          savedResponse = await salesAPI.update(editingSale._id, fullUpdatePayload)
        } catch (err: any) {
          console.error('GasSales - Full PUT failed, retrying minimal update. Error:', err?.response?.data || err?.message)
          const minimalUpdatePayload = {
            // Minimal fields commonly allowed in updates
            customer: saleData.customer,
            paymentMethod: derivedPaymentMethod,
            paymentStatus: derivedPaymentStatus,
            receivedAmount: derivedReceivedAmount,
            totalAmount: totalAmount,
            notes: formData.notes,
          }
          console.log('GasSales - PUT minimal payload:', minimalUpdatePayload)
          savedResponse = await salesAPI.update(editingSale._id, minimalUpdatePayload)
        }
      } else {
        console.log('GasSales - Creating new sale')
        savedResponse = await salesAPI.create(saleData)
      }

      await fetchData()
      resetForm()
      setIsDialogOpen(false)

      // Auto-open signature dialog with normalized sale (like cylinder management)
      try {
        const saved = (savedResponse?.data?.data) || (savedResponse?.data) || null
        const selectedCustomer = (customers || []).find((c) => c._id === formData.customerId)
        // Normalize items for receipt
        const itemsNormalized: NormalizedItem[] = (saved?.items && Array.isArray(saved.items) && saved.items.length > 0)
          ? saved.items.map((it: any) => {
              const pName = it?.product?.name || (allProducts.find(p=>p._id === (it.product?._id || it.product))?.name) || 'Product'
              const qty = Number(it.quantity) || 0
              const price = Number(it.price) || (qty > 0 ? (Number(it.total)||0) / qty : Number(it.total)||0)
              const total = Number(it.total) || (price * qty)
              return { product: { name: pName }, quantity: qty, price, total }
            })
          : saleItems.map((it) => {
              const pName = (allProducts || []).find(p => p._id === it.product)?.name || 'Product'
              return { product: { name: pName }, quantity: Number(it.quantity)||0, price: Number(it.price)||0, total: Number(it.total)||((Number(it.price)||0)*(Number(it.quantity)||0)) }
            })

        const totalAmt = itemsNormalized.reduce((s: number, it: NormalizedItem) => s + (Number(it.total)||0), 0)

        const normalizedSale: any = {
          _id: saved?._id || `temp-${Date.now()}`,
          invoiceNumber: saved?.invoiceNumber || `INV-${(saved?._id||'TEMP').slice(-6).toUpperCase()}`,
          customer: saved?.customer || {
            _id: formData.customerId,
            name: selectedCustomer?.name || 'Customer',
            phone: selectedCustomer?.phone || '',
            address: selectedCustomer?.address || '',
          },
          items: itemsNormalized,
          totalAmount: saved?.totalAmount || totalAmt,
          paymentMethod: saved?.paymentMethod || derivedPaymentMethod,
          paymentStatus: saved?.paymentStatus || derivedPaymentStatus,
          receivedAmount: saved?.receivedAmount ?? derivedReceivedAmount,
          notes: saved?.notes || formData.notes,
          createdAt: saved?.createdAt || new Date().toISOString(),
        }
        setPendingSale(normalizedSale)
        setShowSignatureDialog(true)
      } catch {}
    } catch (error: any) {
      console.error("Failed to save sale:", error?.response?.data || error?.message, error)
      const errorMessage = error.response?.data?.error || "Failed to save sale"
      
      // Check if it's a stock insufficient error
      if (errorMessage.toLowerCase().includes('insufficient stock') || errorMessage.toLowerCase().includes('available:')) {
        setStockErrorMessage(errorMessage)
        setShowStockInsufficientPopup(true)
      } else {
        // For other errors, still use alert for now
        alert(errorMessage)
      }
    }
  }

  const resetForm = () => {
    setFormData({
      customerId: "",
      category: "gas",
      items: [{ productId: "", quantity: "1", price: "", category: "gas" }],
      paymentMethod: "cash",
      paymentStatus: "cleared",
      receivedAmount: "",
      paymentOption: "debit",
      notes: "",
    })
    setProductSearchTerms([""])
    setShowProductSuggestions([false])
    setCustomerSearchTerm("")
    setShowCustomerSuggestions(false)
    setFilteredCustomerSuggestions([])
    setEditingSale(null)
  }

  const handleEdit = (sale: Sale) => {
    setEditingSale(sale)
    setFormData({
      customerId: sale.customer?._id || "",
      category: "gas", // Default to gas for existing sales
      items: (sale.items || []).map((item) => ({
        productId: item.product?._id || "",
        quantity: item.quantity.toString(),
        price: item.price?.toString() || "",
        category: (item as any).category || (item.product as any)?.category || "gas", // Fallback to product category or default to gas
      })),
      paymentMethod: sale.paymentMethod || "cash",
      paymentStatus: sale.paymentStatus || "cleared",
      receivedAmount: (sale as any).receivedAmount?.toString() || "",
      paymentOption: (() => {
        const pm = (sale as any).paymentMethod || "cash"
        if (pm === "credit") return "credit"
        if (pm === "delivery_note") return "delivery_note"
        if (pm === "debit") return "debit"
        return "debit"
      })(),
      notes: sale.notes || "",
    })
    // Initialize product search terms based on current products if available
    const initialTerms = (sale.items || []).map((it: any) => {
      const p = allProducts.find((ap) => ap._id === (it.product?._id || (it as any).product))
      return p?.name || ""
    })
    setProductSearchTerms(initialTerms.length ? initialTerms : [""])
    setShowProductSuggestions(new Array(initialTerms.length || 1).fill(false))
    setCustomerSearchTerm(sale.customer?.name || "")
    setShowCustomerSuggestions(false)
    setFilteredCustomerSuggestions([])
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this sale?")) {
      try {
        await salesAPI.delete(id)
        await fetchData()
      } catch (error) {
        console.error("Failed to delete sale:", error)
        alert("Failed to delete sale")
      }
    }
  }

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { productId: "", quantity: "1", price: "", category: "gas" }],
    })
    setProductSearchTerms((prev) => [...prev, ""]) 
    setShowProductSuggestions((prev) => [...prev, false])
  }

  const removeItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    })
    setProductSearchTerms((prev) => prev.filter((_, i) => i !== index))
    setShowProductSuggestions((prev) => prev.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];

    // If category is changed, reset productId and price
    if (field === 'category') {
      newItems[index] = {
        ...newItems[index],
        category: value,
        productId: '', // Reset product selection
        price: '', // Reset price
      };
      // Also clear product search term for this row
      setProductSearchTerms((prev) => {
        const cp = [...prev];
        cp[index] = "";
        return cp;
      })
      setShowProductSuggestions((prev) => {
        const cp = [...prev];
        cp[index] = false;
        return cp;
      })
    }
    // If productId is changed, handle the update atomically
    else if (field === 'productId') {
      // Find product from the item's specific category
      const itemCategory = newItems[index].category || 'gas';
      const categoryProducts = allProducts.filter((p: Product) => p.category === itemCategory);
      const product = categoryProducts.find((p: Product) => p._id === value);
      newItems[index] = {
        ...newItems[index],
        productId: value,
        quantity: '1', // Reset quantity to a string '1'
        price: product ? product.leastPrice.toString() : '', // Set price
      };
      // Update search term to chosen product name and hide suggestions
      setProductSearchTerms((prev) => {
        const cp = [...prev];
        cp[index] = product?.name || cp[index] || "";
        return cp;
      })
      setShowProductSuggestions((prev) => {
        const cp = [...prev];
        cp[index] = false;
        return cp;
      })
    } else {
      // For other fields, update as usual
      newItems[index] = {
        ...newItems[index],
        [field]: value, // Value from input is already a string
      };
    }

    setFormData({ ...formData, items: newItems });
  };

  // Product autocomplete handlers per item
  const handleProductSearchChange = (index: number, value: string) => {
    setProductSearchTerms((prev) => {
      const cp = [...prev]
      cp[index] = value
      return cp
    })
    setShowProductSuggestions((prev) => {
      const cp = [...prev]
      cp[index] = value.trim().length > 0
      return cp
    })
  }

  const handleProductSuggestionClick = (index: number, product: Product) => {
    // Atomically set productId and price via updateItem
    updateItem(index, 'productId', product._id)
    setProductSearchTerms((prev) => {
      const cp = [...prev]
      cp[index] = product.name
      return cp
    })
    setShowProductSuggestions((prev) => {
      const cp = [...prev]
      cp[index] = false
      return cp
    })
  }

  const handleProductInputFocus = (index: number) => {
    setShowProductSuggestions((prev) => {
      const cp = [...prev]
      cp[index] = (productSearchTerms[index] || '').trim().length > 0
      return cp
    })
  }

  const handleProductInputBlur = (index: number) => {
    setTimeout(() => {
      setShowProductSuggestions((prev) => {
        const cp = [...prev]
        cp[index] = false
        return cp
      })
    }, 200)
  }

  // Single-entry item handlers
  const resetCurrentItem = () => {
    setCurrentItem({ category: "gas", productId: "", quantity: "1", price: "" })
    setEntryProductSearch("")
    setShowEntrySuggestions(false)
    setEditingItemIndex(null)
  }

  const handleEntryCategoryChange = (value: "gas" | "cylinder") => {
    setCurrentItem({ category: value, productId: "", quantity: "1", price: "" })
    setEntryProductSearch("")
  }

  const handleEntryProductSearchChange = (value: string) => {
    setEntryProductSearch(value)
    setShowEntrySuggestions(value.trim().length > 0)
  }

  const handleEntryProductSelect = (product: Product) => {
    setCurrentItem({
      category: product.category,
      productId: product._id,
      quantity: "1",
      price: product.leastPrice.toString(),
    })
    setEntryProductSearch(product.name)
    setShowEntrySuggestions(false)
  }

  const handleEntryQuantityChange = (value: string) => {
    const enteredQuantity = parseInt(value) || 0
    const product = allProducts.find((p: Product) => p._id === currentItem.productId)
    if (product && enteredQuantity > product.currentStock) {
      setStockErrorMessage(`Insufficient stock for ${product.name}. Available: ${product.currentStock}, Required: ${enteredQuantity}`)
      setShowStockInsufficientPopup(true)
      setTimeout(() => setShowStockInsufficientPopup(false), 2000)
      return
    }
    setCurrentItem((prev) => ({ ...prev, quantity: value }))
  }

  const handleEntryPriceChange = (value: string) => {
    const product = allProducts.find((p: Product) => p._id === currentItem.productId)
    const enteredPrice = parseFloat(value)
    if (product && !isNaN(enteredPrice) && enteredPrice < product.leastPrice) {
      setPriceAlert({ message: `Price must be at least ${product.leastPrice.toFixed(2)}`, index: -1 })
      setTimeout(() => setPriceAlert({ message: '', index: null }), 2000)
    }
    setCurrentItem((prev) => ({ ...prev, price: value }))
  }

  const addOrUpdateItem = () => {
    const qty = Number(currentItem.quantity) || 0
    const pr = Number(currentItem.price) || 0
    if (!currentItem.productId || qty <= 0 || pr <= 0) return
    const items = [...formData.items]
    if (editingItemIndex !== null && editingItemIndex >= 0 && editingItemIndex <= items.length) {
      items.splice(editingItemIndex, 0, { ...currentItem })
    } else {
      items.push({ ...currentItem })
    }
    setFormData({ ...formData, items })
    resetCurrentItem()
  }

  const handleEditRow = (index: number) => {
    const items = [...formData.items]
    const [row] = items.splice(index, 1)
    setFormData({ ...formData, items })
    setCurrentItem({
      category: (row as any).category || 'gas',
      productId: (row as any).productId || '',
      quantity: (row as any).quantity || '1',
      price: (row as any).price || '',
    })
    const pName = allProducts.find(p => p._id === (row as any).productId)?.name || ''
    setEntryProductSearch(pName)
    setEditingItemIndex(index)
  }

  // Handle receipt button click - show signature dialog only if no signature exists
  const handleReceiptClick = (sale: Sale) => {
    if (!customerSignature) {
      // No signature yet - show signature dialog first
      setPendingSale(sale)
      setShowSignatureDialog(true)
    } else {
      // Signature already exists - show receipt directly with existing signature
      setReceiptSale(sale)
    }
  }

  // Handle signature completion - show receipt with signature
  const handleSignatureComplete = (signature: string) => {
    console.log('GasSales - Signature received:', signature)
    console.log('GasSales - Signature length:', signature?.length)
    console.log('GasSales - Pending sale:', pendingSale?.invoiceNumber)
    
    // Set signature state for future use
    setCustomerSignature(signature)
    setShowSignatureDialog(false)
    
    // Directly open receipt dialog with the pending sale and signature embedded
    if (pendingSale) {
      console.log('GasSales - Opening receipt dialog with signature embedded in sale')
      setReceiptSale({ ...pendingSale, customerSignature: signature })
      setPendingSale(null)
    }
  }

  // Handle signature dialog close without signature
  const handleSignatureCancel = () => {
    setShowSignatureDialog(false)
    setPendingSale(null)
    setCustomerSignature("")
  }

  // Customer autocomplete functionality
  const handleCustomerSearchChange = (value: string) => {
    setCustomerSearchTerm(value)
    
    if (value.trim().length > 0) {
      const filtered = customers.filter(customer => 
        customer.name.toLowerCase().includes(value.toLowerCase()) ||
        customer.phone.includes(value) ||
        (customer.email && customer.email.toLowerCase().includes(value.toLowerCase()))
      ).slice(0, 5) // Limit to 5 suggestions
      
      setFilteredCustomerSuggestions(filtered)
      setShowCustomerSuggestions(true)
    } else {
      setShowCustomerSuggestions(false)
      setFilteredCustomerSuggestions([])
    }
  }

  const handleCustomerSuggestionClick = (customer: Customer) => {
    setFormData({ ...formData, customerId: customer._id })
    setCustomerSearchTerm(customer.name)
    setShowCustomerSuggestions(false)
    setFilteredCustomerSuggestions([])
  }

  const handleCustomerInputBlur = () => {
    // Delay hiding suggestions to allow click events
    setTimeout(() => {
      setShowCustomerSuggestions(false)
    }, 200)
  }

  const handleCustomerInputFocus = () => {
    if (customerSearchTerm.trim().length > 0 && filteredCustomerSuggestions.length > 0) {
      setShowCustomerSuggestions(true)
    }
  }

  // Search filter autocomplete functionality
  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    
    if (value.trim().length > 0) {
      const filtered = customers.filter(customer => 
        customer.name.toLowerCase().includes(value.toLowerCase()) ||
        customer.phone.includes(value) ||
        (customer.email && customer.email.toLowerCase().includes(value.toLowerCase()))
      ).slice(0, 5) // Limit to 5 suggestions
      
      setFilteredSearchSuggestions(filtered)
      setShowSearchSuggestions(true)
    } else {
      setShowSearchSuggestions(false)
      setFilteredSearchSuggestions([])
    }
  }

  const handleSearchSuggestionClick = (customer: Customer) => {
    setSearchTerm(customer.name)
    setShowSearchSuggestions(false)
    setFilteredSearchSuggestions([])
  }

  const handleSearchInputBlur = () => {
    // Delay hiding suggestions to allow click events
    setTimeout(() => {
      setShowSearchSuggestions(false)
    }, 200)
  }

  const handleSearchInputFocus = () => {
    if (searchTerm.trim().length > 0 && filteredSearchSuggestions.length > 0) {
      setShowSearchSuggestions(true)
    }
  }

  // Ensure sales is always an array with proper type checking
  const salesArray = Array.isArray(sales) ? sales : []
  
  const filteredSales = salesArray.filter((sale) => {
    // Add null checks for sale properties
    if (!sale || !sale.invoiceNumber || !sale.customer) {
      return false
    }
    
    const matchesSearch =
      sale.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (sale.customer.name && sale.customer.name.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesStatus = statusFilter === "all" || sale.paymentStatus === statusFilter
    return matchesSearch && matchesStatus
  })

  // Pagination (20 per page) — depends on filteredSales
  const [salesPage, setSalesPage] = useState(1)
  const salesPageSize = 20
  const salesTotalPages = Math.max(1, Math.ceil(filteredSales.length / salesPageSize))
  const paginatedSales = filteredSales.slice((salesPage - 1) * salesPageSize, salesPage * salesPageSize)
  useEffect(() => { setSalesPage(1) }, [searchTerm, statusFilter])

  const totalAmount = formData.items.reduce((sum, item) => {
    const quantity = Number(item.quantity) || 0
    const price = Number(item.price) || 0
    return sum + price * quantity
  }, 0)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-16 lg:pt-0 space-y-8">
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-2xl p-8 text-white">
        <h1 className="text-4xl font-bold mb-2">Gas Sales Management</h1>
        <p className="text-white/80 text-lg">Create and manage gas sales transactions</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-row gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by invoice or customer..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={handleSearchInputFocus}
              onBlur={handleSearchInputBlur}
              className="pl-10"
            />
            
            {/* Search Suggestions Dropdown */}
            {showSearchSuggestions && filteredSearchSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
                {filteredSearchSuggestions.map((customer) => (
                  <div
                    key={customer._id}
                    onClick={() => handleSearchSuggestionClick(customer)}
                    className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{customer.name}</p>
                        <p className="text-sm text-gray-600">{customer.phone}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">{customer.email}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="cleared">Cleared</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              New Sale
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden" aria-describedby="sale-dialog-description">
            <DialogHeader>
              <DialogTitle>{editingSale ? "Edit Sale" : "Create New Sale"}</DialogTitle>
            </DialogHeader>
            <p id="sale-dialog-description" className="sr-only">
              {editingSale ? "Edit the selected gas sale details and save changes." : "Fill the form to create a new gas sale."}
            </p>
            <form onSubmit={handleSubmit} className="space-y-6 overflow-x-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 relative">
                  <Label htmlFor="customer">Customer *</Label>
                  <Input
                    id="customer"
                    placeholder="Search by name, phone, or email..."
                    value={customerSearchTerm}
                    onChange={(e) => handleCustomerSearchChange(e.target.value)}
                    onFocus={handleCustomerInputFocus}
                    onBlur={handleCustomerInputBlur}
                    className="pr-10"
                    required
                  />
                  {showCustomerSuggestions && filteredCustomerSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredCustomerSuggestions.map((customer) => (
                        <div
                          key={customer._id}
                          className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                          onClick={() => handleCustomerSuggestionClick(customer)}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-900">{customer.name}</span>
                            <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                              <span>Phone: {customer.phone}</span>
                              {customer.email && <span>Email: {customer.email}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {editingSale && (
                  <div className="space-y-2">
                    <Label htmlFor="paymentMethod">Payment Method</Label>
                    <Select
                      value={formData.paymentMethod}
                      onValueChange={(value) => setFormData({ ...formData, paymentMethod: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="credit">Credit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-lg font-semibold">Items</Label>
                </div>

                {/* 2x2 single-entry grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={currentItem.category} onValueChange={(v: any) => handleEntryCategoryChange(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gas">Gas</SelectItem>
                        <SelectItem value="cylinder">Cylinder</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 relative">
                    <Label>Product</Label>
                    <Input
                      placeholder={`Search ${currentItem.category} product`}
                      value={entryProductSearch}
                      onChange={(e) => handleEntryProductSearchChange(e.target.value)}
                      onFocus={() => setShowEntrySuggestions(entryProductSearch.trim().length > 0)}
                      onBlur={() => setTimeout(() => setShowEntrySuggestions(false), 200)}
                      className="pr-10"
                    />
                    {showEntrySuggestions && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {allProducts
                          .filter((p: Product) => p.category === currentItem.category)
                          .filter((p: Product) => entryProductSearch.trim().length === 0 || p.name.toLowerCase().includes(entryProductSearch.toLowerCase()))
                          .slice(0, 8)
                          .map((product) => (
                            <div
                              key={product._id}
                              className="px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleEntryProductSelect(product)}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-gray-900">{product.name}</span>
                                <span className="text-xs text-gray-500">Min AED {product.leastPrice.toFixed(2)}</span>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={currentItem.quantity}
                      onChange={(e) => handleEntryQuantityChange(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Price (AED)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={currentItem.price}
                      onChange={(e) => handleEntryPriceChange(e.target.value)}
                      placeholder={(() => {
                        const p = allProducts.find((ap) => ap._id === currentItem.productId)
                        return p?.leastPrice ? `Min: AED ${p.leastPrice.toFixed(2)}` : 'Select product first'
                      })()}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    {(() => {
                      const q = Number(currentItem.quantity) || 0
                      const pr = Number(currentItem.price) || 0
                      return q > 0 && pr > 0 ? `Line Total: AED ${(q * pr).toFixed(2)}` : ''
                    })()}
                  </div>
                  <div>
                    <Button type="button" onClick={addOrUpdateItem} className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white">
                      {editingItemIndex !== null ? 'Update Item' : 'Add Item'}
                    </Button>
                  </div>
                </div>

                {/* Items table */}
                <div className="w-full overflow-x-auto">
                  <div className="inline-block min-w-[700px] align-top">
                    <div className="max-h-[40vh] overflow-y-auto pr-2">
                      <div className="grid grid-cols-[1fr_2fr_1fr_1.2fr_1fr] gap-3 px-2 py-2 text-xs font-medium text-gray-600 bg-gray-50 rounded-md mb-2 whitespace-nowrap">
                        <div>Category</div>
                        <div>Product</div>
                        <div>Qty</div>
                        <div>Price (AED)</div>
                        <div>Actions</div>
                      </div>
                      <div className="space-y-1">
                        {formData.items.map((it, idx) => {
                          const p = allProducts.find((ap) => ap._id === it.productId)
                          return (
                            <div key={idx} className="grid grid-cols-[1fr_2fr_1fr_1.2fr_1fr] gap-3 px-2 py-2 border-b last:border-b-0 items-center">
                              <div className="truncate">{(it as any).category || 'gas'}</div>
                              <div className="truncate">{p?.name || '-'}</div>
                              <div>{Number((it as any).quantity || 0)}</div>
                              <div>{Number((it as any).price || 0).toFixed(2)}</div>
                              <div className="flex gap-2">
                                <Button type="button" size="sm" variant="outline" onClick={() => handleEditRow(idx)}>Edit</Button>
                                <Button type="button" size="sm" variant="outline" className="text-red-600" onClick={() => removeItem(idx)}>Remove</Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-2xl font-bold text-[#2B3068]">Total: AED {totalAmount.toFixed(2)}</div>
                </div>
              </div>

              {/* Payment Option / Received Amount Section */}
              <div className="space-y-3">
                <Label>Received Amount (AED) *</Label>
                <Select
                  value={formData.paymentOption}
                  onValueChange={(value) => {
                    // Update option and reset amount/notes accordingly
                    const next = { ...formData, paymentOption: value as any }
                    if (value === "delivery_note") {
                      next.receivedAmount = "0"
                      next.paymentStatus = "pending"
                      next.paymentMethod = "delivery_note"
                    } else if (value === "credit") {
                      // For credit, fix receivedAmount to 0 and status pending
                      next.paymentMethod = "credit"
                      next.paymentStatus = "pending"
                      next.receivedAmount = "0"
                    }
                    if (value === "debit") {
                      // Default to 0 and let user type amount
                      next.paymentMethod = "debit"
                    }
                    setFormData(next)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Credit</SelectItem>
                    <SelectItem value="debit">Debit</SelectItem>
                    <SelectItem value="delivery_note">Delivery Note</SelectItem>
                  </SelectContent>
                </Select>

                {formData.paymentOption === "debit" && (
                  <div className="space-y-2">
                    <Label htmlFor="receivedAmount">Debit Amount (AED)</Label>
                    <Input
                      id="receivedAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.receivedAmount}
                      onChange={(e) => {
                        const receivedAmount = e.target.value
                        const receivedValue = parseFloat(receivedAmount) || 0
                        
                        // Auto-select status based on received amount vs total amount
                        let newPaymentStatus = formData.paymentStatus
                        if (receivedValue === totalAmount && totalAmount > 0) {
                          newPaymentStatus = "cleared"
                        } else if (receivedValue > 0 && receivedValue < totalAmount) {
                          newPaymentStatus = "pending"
                        } else if (receivedValue === 0) {
                          newPaymentStatus = "pending"
                        }
                        
                        setFormData({ 
                          ...formData, 
                          receivedAmount: receivedAmount,
                          paymentStatus: newPaymentStatus,
                          paymentMethod: "debit",
                        })
                      }}
                      placeholder="Enter debit amount..."
                      className="text-lg"
                    />
                    {formData.receivedAmount && (
                      <div className="text-sm text-gray-600">
                        {(() => {
                          const receivedValue = parseFloat(formData.receivedAmount) || 0
                          const remaining = totalAmount - receivedValue
                          if (remaining > 0) {
                            return `Remaining: AED ${remaining.toFixed(2)}`
                          } else if (remaining < 0) {
                            return `Excess: AED ${Math.abs(remaining).toFixed(2)}`
                          } else {
                            return "✓ Fully paid"
                          }
                        })()} 
                      </div>
                    )}
                  </div>
                )}

                {/* For credit, no received amount input; it is fixed to 0 and status pending */}

                {formData.paymentOption === "delivery_note" && (
                  <div className="space-y-2">
                  <div className="text-sm text-gray-600">Only item and quantity are required. A delivery note will be generated.</div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paymentStatus">Payment Status</Label>
                  <Select
                    value={formData.paymentStatus}
                    onValueChange={(value) => setFormData({ ...formData, paymentStatus: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cleared">Cleared</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-[#2B3068] hover:bg-[#1a1f4a]">
                  {editingSale ? "Update Sale" : "Create Sale"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white rounded-t-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle>Sales History</CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {showExportInput && (
                <div className="relative w-full sm:w-72">
                  <Input
                    placeholder="Enter customer/company name"
                    value={exportSearch}
                    onChange={(e) => handleExportSearchChange(e.target.value)}
                    onFocus={handleExportInputFocus}
                    onBlur={handleExportInputBlur}
                    className="bg-white text-black placeholder:text-gray-500 w-full"
                  />
                  {showExportSuggestions && filteredExportSuggestions.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredExportSuggestions.map((name) => (
                        <div
                          key={name}
                          className="px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm text-gray-800"
                          onClick={() => handleExportSuggestionClick(name)}
                        >
                          {name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {showExportInput && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" className="bg-white text-[#2B3068] hover:bg-gray-100">
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={exportSalesPDF}>
                      Download PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportSalesCSV}>
                      Download CSV
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                variant="secondary"
                className="bg-white text-[#2B3068] hover:bg-gray-100"
                onClick={() => setShowExportInput((v) => !v)}
              >
                Export Data
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="p-4">Invoice #</TableHead>
                  <TableHead className="p-4">Customer</TableHead>
                  <TableHead className="p-4">Items</TableHead>
                  <TableHead className="p-4">Total (AED)</TableHead>
                  <TableHead className="p-4">Received Amount (AED)</TableHead>
                  <TableHead className="p-4">Payment</TableHead>
                  <TableHead className="p-4">Status</TableHead>
                  <TableHead className="p-4">Added By</TableHead>
                  <TableHead className="p-4">Date</TableHead>
                  <TableHead className="p-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedSales.map((sale) => (
                  <TableRow key={sale._id}>
                    <TableCell className="p-4 font-medium">{sale.invoiceNumber}</TableCell>
                    <TableCell className="p-4">
                      <div>
                        <div className="font-medium">{sale.customer?.name || "Unknown Customer"}</div>
                        <div className="text-sm text-gray-500">{sale.customer?.phone}</div>
                      </div>
                    </TableCell>
                    <TableCell className="p-4">
                      <div className="space-y-1">
                        {sale.items.map((item, index) => (
                          <div key={index} className="text-sm">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{item.product?.name || "Unknown Product"} x{item.quantity}</span>
                              <Badge 
                                variant="outline" 
                                className={`text-xs font-medium ${
                                  ((item as any).category || (item.product as any)?.category) === 'gas' 
                                    ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                    : 'bg-green-50 text-green-700 border-green-200'
                                }`}
                              >
                                {(item as any).category || (item.product as any)?.category || 'gas'}
                              </Badge>
                            </div>
                            <div className="text-xs text-gray-500">AED {((item as any).price || 0).toFixed(2)} each</div>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="p-4 font-semibold">AED {sale.totalAmount.toFixed(2)}</TableCell>
                    <TableCell className="p-4 font-semibold">AED {(sale.receivedAmount || 0).toFixed(2)}</TableCell>
                    <TableCell className="p-4 capitalize">{sale.paymentMethod}</TableCell>
                    <TableCell className="p-4">
                      <Badge
                        variant={
                          sale.paymentStatus === "cleared"
                            ? "default"
                            : sale.paymentStatus === "pending"
                              ? "secondary"
                              : "destructive"
                        }
                        className={
                          sale.paymentStatus === "cleared"
                            ? "bg-green-100 text-green-800"
                            : sale.paymentStatus === "pending"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                        }
                      >
                        {sale.paymentStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="p-4">
                      {sale.employee ? (
                        <Badge variant="default">{sale.employee.name}</Badge>
                      ) : (
                        <Badge variant="secondary">Admin</Badge>
                      )}
                    </TableCell>
                    <TableCell className="p-4">{new Date(sale.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="p-4">
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReceiptClick(sale)}
                          className="text-[#2B3068] border-[#2B3068] hover:bg-[#2B3068] hover:text-white"
                        >
                          <Receipt className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleEdit(sale)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(sale._id)}
                          className="text-red-600 border-red-600 hover:bg-red-600 hover:text-white"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredSales.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                      No sales found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {/* Pagination controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4">
            <div className="text-sm text-gray-600">
              Showing {filteredSales.length === 0 ? 0 : (salesPage - 1) * salesPageSize + 1}
              -{Math.min(salesPage * salesPageSize, filteredSales.length)} of {filteredSales.length}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                className="bg-white text-[#2B3068] hover:bg-gray-100"
                disabled={salesPage <= 1}
                onClick={() => setSalesPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <div className="hidden sm:flex items-center gap-1">
                {Array.from({ length: salesTotalPages }, (_, i) => i + 1).slice(
                  Math.max(0, salesPage - 3),
                  Math.max(0, salesPage - 3) + 5
                ).map((p) => (
                  <button
                    key={p}
                    onClick={() => setSalesPage(p)}
                    className={`px-3 py-1 rounded text-sm ${p === salesPage ? 'bg-[#2B3068] text-white' : 'bg-white text-[#2B3068] hover:bg-gray-100 border'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <Button
                variant="secondary"
                className="bg-white text-[#2B3068] hover:bg-gray-100"
                disabled={salesPage >= salesTotalPages}
                onClick={() => setSalesPage((p) => Math.min(salesTotalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Signature Dialog */}
      <SignatureDialog 
        isOpen={showSignatureDialog}
        onClose={handleSignatureCancel}
        onSignatureComplete={handleSignatureComplete}
        customerName={pendingSale?.customer?.name}
      />

      {/* Receipt Dialog with signature */}
      {receiptSale && (
        <ReceiptDialog 
          sale={receiptSale} 
          signature={customerSignature}
          onClose={() => {
            setReceiptSale(null)
            // Don't clear signature - keep it for reuse
          }} 
        />
      )}



      {/* Modern Stock Insufficient Popup */}
      {showStockInsufficientPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          {/* Background blur overlay */}
          <div 
            className="absolute inset-0 bg-black/20 backdrop-blur-sm" 
            onClick={() => setShowStockInsufficientPopup(false)}
          />
          
          {/* Modal with animations */}
          <div className="relative bg-white rounded-2xl shadow-2xl p-8 mx-4 max-w-md w-full transform transition-all duration-300 scale-100 animate-in fade-in-0 zoom-in-95">
            {/* Close button */}
            <button
              onClick={() => setShowStockInsufficientPopup(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Icon */}
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-orange-500 to-red-500 rounded-full">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            
            {/* Content */}
            <div className="text-center">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Insufficient Stock</h3>
              <p className="text-gray-600 mb-6">{stockErrorMessage}</p>
              
              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    console.log('Cancel button clicked')
                    setShowStockInsufficientPopup(false)
                  }}
                  className="flex-1 bg-gray-100 text-gray-700 font-semibold py-3 px-6 rounded-lg hover:bg-gray-200 transition-all duration-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    console.log('Check Stock button clicked')
                    setShowStockInsufficientPopup(false)
                    // You could add logic here to navigate to inventory management
                  }}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold py-3 px-6 rounded-lg hover:from-orange-600 hover:to-red-600 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl cursor-pointer"
                >
                  Check Stock
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
