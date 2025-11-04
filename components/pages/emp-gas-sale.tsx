"use client"

import type React from "react"

import { useState, useEffect, Fragment } from "react"
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
import { salesAPI, customersAPI, employeeSalesAPI, productsAPI } from "@/lib/api"
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
      category?: "gas" | "cylinder"
      cylinderSize?: "large" | "small"
    }
    quantity: number
    price: number
    total: number
    category?: "gas" | "cylinder"
    cylinderSize?: "large" | "small"
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
  serialNumber?: string
  phone: string
  address: string
  email?: string
}

interface Product {
  _id: string
  name: string
  category: "gas" | "cylinder"
  cylinderStatus?: "empty" | "full"
  cylinderSize?: "large" | "small"
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

interface EmployeeGasSalesProps {
  user: {
    id: string
    email: string
    role: "admin" | "employee"
    name: string
  }
}

export function EmployeeGasSales({ user }: EmployeeGasSalesProps) {
  const [sales, setSales] = useState<Sale[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [priceAlert, setPriceAlert] = useState<{ message: string; index: number | null }>({ message: '', index: null });
  
  // Stock insufficient notification state (replacing popup)
  const [showStockNotification, setShowStockNotification] = useState(false)
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
  
  // Auto-dismiss stock notification after 5s
  useEffect(() => {
    if (showStockNotification) {
      const timer = setTimeout(() => {
        setShowStockNotification(false)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [showStockNotification])
  // Per-item product autocomplete state
  const [productSearchTerms, setProductSearchTerms] = useState<string[]>([])
  const [showProductSuggestions, setShowProductSuggestions] = useState<boolean[]>([])
  // Single-entry item input state (2x2 grid pattern)
  const [currentItem, setCurrentItem] = useState<{ category: "gas" | "cylinder"; productId: string; quantity: string; price: string; cylinderStatus?: "empty" | "full"; gasProductId?: string; cylinderProductId?: string }>({
    category: "gas",
    productId: "",
    quantity: "1",
    price: "",
    cylinderStatus: "empty",
    gasProductId: "",
    cylinderProductId: "",
  })
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null)
  const [entryProductSearch, setEntryProductSearch] = useState("")
  // Gas product autocomplete for Full cylinder
  const [entryGasSearch, setEntryGasSearch] = useState("")
  const [showEntryGasSuggestions, setShowEntryGasSuggestions] = useState(false)
  // Cylinder product autocomplete for Gas sales
  const [entryCylinderSearch, setEntryCylinderSearch] = useState("")
  const [showEntryCylinderSuggestions, setShowEntryCylinderSuggestions] = useState(false)
  // Live availability from inventory-items (authoritative for cylinder availability)
  const [inventoryAvailability, setInventoryAvailability] = useState<Record<string, { availableEmpty: number; availableFull: number; currentStock: number }>>({})

  // Gas product handlers
  const handleEntryGasSearchChange = (value: string) => {
    setEntryGasSearch(value)
    setShowEntryGasSuggestions(value.trim().length > 0)
  }

  const handleEntryGasSelect = (product: Product) => {
    setCurrentItem({
      ...currentItem,
      gasProductId: product._id,
    })
    setEntryGasSearch(product.name)
    setShowEntryGasSuggestions(false)
  }

  // Cylinder product handlers for Gas sales
  const handleEntryCylinderSearchChange = (value: string) => {
    setEntryCylinderSearch(value)
    setShowEntryCylinderSuggestions(value.trim().length > 0)
  }

  const handleEntryCylinderSelect = (product: Product) => {
    // Check if cylinder has stock (accounting for reserved stock)
    const totalStock = inventoryAvailability[product._id]?.availableFull || 0
    const reservedStock = calculateReservedStock(product._id, 'cylinder', 'full')
    const availableStock = totalStock - reservedStock
    
    if (availableStock <= 0) {
      setStockErrorMessage(`No full cylinders available for ${product.name}. Available: ${totalStock}, Reserved: ${reservedStock}, Remaining: ${availableStock}`)
      setShowStockNotification(true)
      return
    }
    
    setCurrentItem({
      ...currentItem,
      cylinderProductId: product._id,
    })
    setEntryCylinderSearch(product.name)
    setShowEntryCylinderSuggestions(false)
  }
  const [showEntrySuggestions, setShowEntrySuggestions] = useState(false)
  // Export UI state
  const [showExportInput, setShowExportInput] = useState(false)
  const [exportSearch, setExportSearch] = useState("")
  const [showExportSuggestions, setShowExportSuggestions] = useState(false)
  const [filteredExportSuggestions, setFilteredExportSuggestions] = useState<string[]>([])
  // Export date range state
  const [exportStartDate, setExportStartDate] = useState<string>("")
  const [exportEndDate, setExportEndDate] = useState<string>("")
  
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
  const [formData, setFormData] = useState<{
    customerId: string
    category: "gas" | "cylinder"
    items: { productId: string; quantity: string; price: string; category: "gas" | "cylinder"; cylinderStatus?: "empty" | "full"; cylinderName?: string }[]
    paymentMethod: string
    paymentStatus: string
    receivedAmount: string
    paymentOption: "debit" | "credit" | "delivery_note"
    notes: string
  }>({
    customerId: "",
    category: "gas", 
    items: [], 
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
      const start = exportStartDate ? new Date(`${exportStartDate}T00:00:00.000`) : null
      const end = exportEndDate ? new Date(`${exportEndDate}T23:59:59.999`) : null
      const filteredByTerm = term
        ? sourceArray.filter((s) => (s.customer?.name || "").toLowerCase().includes(term))
        : sourceArray
      const filtered = filteredByTerm.filter((s) => {
        const d = s.createdAt ? new Date(s.createdAt) : null
        if (!d) return false
        return (!start || d >= start) && (!end || d <= end)
      })

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
      const namePart = term ? `-cust-${term.replace(/\s+/g, "_")}` : ""
      const datePart = (exportStartDate || exportEndDate)
        ? `-date-${(exportStartDate||'start').replace(/[^0-9-]/g,'')}_to_${(exportEndDate||'end').replace(/[^0-9-]/g,'')}`
        : ""
      a.href = url
      a.download = `sales-export${namePart}${datePart}-${ts}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Failed to export sales CSV:", err)
      alert("Failed to export CSV")
    }
  }

  // Helper: ensure a Unicode font (Arabic-capable) is available for jsPDF
  let _arabicFontLoaded: boolean | undefined
  const ensureArabicFont = async (doc: any) => {
    if (_arabicFontLoaded) return true
    try {
      const res = await fetch('/fonts/NotoNaskhArabic-Regular.ttf')
      if (!res.ok) return false
      const buf = await res.arrayBuffer()
      // Convert to base64 for addFileToVFS
      const bytes = new Uint8Array(buf)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const base64 = btoa(binary)
      const vfsName = 'NotoNaskhArabic-Regular.ttf'
      const family = 'NotoNaskhArabic'
      doc.addFileToVFS(vfsName, base64)
      doc.addFont(vfsName, family, 'normal')
      _arabicFontLoaded = true
      return true
    } catch (e) {
      console.warn('[PDF] Arabic font load failed:', e)
      return false
    }
  }

  // PDF export for Sales History (filtered by exportSearch) with compact layout and multiline rows
  const exportSalesPDF = async () => {
    try {
      const term = (exportSearch || "").trim().toLowerCase()
      const sourceArray = Array.isArray(sales) ? sales : []
      const start = exportStartDate ? new Date(`${exportStartDate}T00:00:00.000`) : null
      const end = exportEndDate ? new Date(`${exportEndDate}T23:59:59.999`) : null
      const filteredByTerm = term
        ? sourceArray.filter((s: Sale) => (s.customer?.name || "").toLowerCase().includes(term))
        : sourceArray
      const filtered = filteredByTerm.filter((s: Sale) => {
        const d = s.createdAt ? new Date(s.createdAt) : null
        if (!d) return false
        return (!start || d >= start) && (!end || d <= end)
      })

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
      const arabicReady = await ensureArabicFont(doc)
      if (arabicReady) {
        try { doc.setFont('NotoNaskhArabic', 'normal') } catch {}
      } else {
        // Fallback to default
        try { doc.setFont('helvetica', 'normal') } catch {}
      }
      const marginX = 32
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      let y = 20

      // Add header image
      try {
        const headerImg = new Image()
        headerImg.crossOrigin = 'anonymous'
        await new Promise((resolve, reject) => {
          headerImg.onload = resolve
          headerImg.onerror = reject
          headerImg.src = '/images/Customer-Ledger-header.jpg'
        })
        
        // Calculate image dimensions to fit page width
        const imgWidth = pageWidth - marginX * 2
        const imgHeight = (headerImg.height * imgWidth) / headerImg.width
        
        doc.addImage(headerImg, 'JPEG', marginX, y, imgWidth, imgHeight)
        y += imgHeight + 20
      } catch (error) {
        console.warn('Could not load header image, continuing without it:', error)
        // Fallback to text title if image fails
        doc.setFont(arabicReady ? 'NotoNaskhArabic' : 'helvetica', 'bold')
        doc.setFontSize(11)
        doc.text('Gas Sales Export', marginX, y)
        y += 10
      }
      doc.setFont(arabicReady ? 'NotoNaskhArabic' : 'helvetica', 'normal')
      doc.setFontSize(7.5)
      if (term) { doc.text(`Customer: ${term}`, marginX, y); y += 9 }
      if (exportStartDate || exportEndDate) { doc.text(`Date: ${(exportStartDate||'...')} to ${(exportEndDate||'...')}`, marginX, y); y += 9 }
      doc.text(`Generated: ${new Date().toLocaleString()}`, marginX, y); y += 16

      // Header bar
      const headerHeight = 16
      const headerY = y
      doc.setFillColor(43, 48, 104)
      doc.rect(marginX - 4, headerY - 14, pageWidth - marginX * 2 + 8, headerHeight, 'F')

      // Headers: show Debit and Credit as separate columns (Customer removed — shown in header)
      const headers = [
        'Invoice #','Items','Debit (AED)','Credit (AED)','Payment Method','Payment Status','Notes','Added By','Date'
      ]
      const colWidths = [
        80, 320, 80, 80, 100, 100, 140, 80, 100
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
          doc.setFont(arabicReady ? 'NotoNaskhArabic' : 'helvetica', 'bold')
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
        doc.setFont(arabicReady ? 'NotoNaskhArabic' : 'helvetica', 'normal')
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
          itemsDesc,
          totalStr,   // Debit
          receivedStr, // Credit
          s.paymentMethod || '',
          s.paymentStatus || '',
          s.notes || '',
          addedBy,
          dateStr,
        ]
        drawRow(row)
      })

      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const namePart = term ? `-cust-${term.replace(/\s+/g, '_')}` : ''
      const datePart = (exportStartDate || exportEndDate)
        ? `-date-${(exportStartDate||'start').replace(/[^0-9-]/g,'')}_to_${(exportEndDate||'end').replace(/[^0-9-]/g,'')}`
        : ''
      doc.save(`sales-export${namePart}${datePart}-${ts}.pdf`)
    } catch (err) {
      console.error('Failed to export sales PDF:', err)
      alert('Failed to export PDF')
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Refresh availability when other pages update stock
  useEffect(() => {
    const onStockUpdated = () => {
      fetchData()
    }
    window.addEventListener('stockUpdated', onStockUpdated)
    return () => window.removeEventListener('stockUpdated', onStockUpdated)
  }, [])

  // Ensure fresh availability when opening the dialog
  useEffect(() => {
    if (isDialogOpen) {
      fetchData()
    }
  }, [isDialogOpen])

  // Re-filter products when category changes
  useEffect(() => {
    if (allProducts.length > 0) {
      const filteredProducts = allProducts.filter((product: Product) => {
        // Handle case-insensitive category matching
        const productCategory = (product.category || '').toLowerCase()
        const filterCategory = formData.category.toLowerCase()
        
        // Match gas categories
        if (filterCategory === 'gas') {
          if (!productCategory.includes('gas')) return false
          // For gas, check currentStock from inventory availability
          const gasStock = inventoryAvailability[product._id]?.currentStock || 0
          console.log('🔍 useEffect gas filter check:', {
            productName: product.name,
            productId: product._id,
            gasStock: gasStock,
            hasAvailability: !!inventoryAvailability[product._id],
            availabilityData: inventoryAvailability[product._id]
          })
          return gasStock > 0
        }
        
        // Match cylinder categories
        if (filterCategory === 'cylinder') {
          if (!productCategory.includes('cylinder')) return false
          // For cylinders, only show full cylinders (available for sale)
          if (product.cylinderStatus !== 'full') return false
          // Check cylinder stock from inventory availability
          const availableFull = inventoryAvailability[product._id]?.availableFull || 0
          return availableFull > 0
        }
        
        return false
      })
      
      console.log('EmployeeGasSales - Category changed to:', formData.category)
      console.log('EmployeeGasSales - Re-filtered products:', filteredProducts.length)
      console.log('EmployeeGasSales - Gas products available:', allProducts.filter(p => p.category === 'gas').map(p => ({
        name: p.name,
        productStock: p.currentStock,
        inventoryStock: inventoryAvailability[p._id]?.currentStock || 0
      })))
      
      setProducts(filteredProducts)
    }
  }, [formData.category, allProducts, inventoryAvailability])

  const fetchData = async () => {
    try {
      setLoading(true)
      // Get current employee ID from user prop
      const employeeId = user.id
      
      const [employeeSalesResponse, customersResponse, employeeInventoryResponse] = await Promise.all([
        employeeSalesAPI.getAll(), // Only fetch employee sales
        customersAPI.getAll(),
        fetch(`/api/employee-inventory-new/received?employeeId=${employeeId}`), // Use new employee inventory API
      ])

      // Normalize sales and customers - only show employee sales
      const employeeSalesData = Array.isArray(employeeSalesResponse.data) ? employeeSalesResponse.data : []
      // Filter to show only this employee's sales
      const salesData = employeeSalesData.filter((sale: any) => 
        sale.employee?._id === employeeId || sale.employee === employeeId
      ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      const customersData = Array.isArray(customersResponse.data?.data)
        ? customersResponse.data.data
        : Array.isArray(customersResponse.data)
          ? customersResponse.data
          : Array.isArray(customersResponse)
            ? customersResponse
            : []

      // Fetch employee's own inventory using new API format
      const employeeInventoryData = await employeeInventoryResponse.json()
      console.log('Employee inventory response (new API):', employeeInventoryData)
      console.log('🔍 Raw inventory items:', employeeInventoryData?.data?.map((item: any) => ({
        productId: item.productId,
        productName: item.productName,
        category: item.category,
        currentStock: item.currentStock,
        availableEmpty: item.availableEmpty,
        availableFull: item.availableFull
      })))
      
      // Extract products from employee inventory with any stock (gas, full cylinders, or empty cylinders)
      const allEmployeeProducts: Product[] = [];
      const inventoryAvailability: Record<string, { availableEmpty: number; availableFull: number; currentStock: number }> = {}
      
      if (employeeInventoryData?.data && Array.isArray(employeeInventoryData.data)) {
        employeeInventoryData.data.forEach((inventoryItem: any) => {
          if (inventoryItem.productId) {
            // Include products that have any stock (gas, full cylinders, or empty cylinders)
            const currentStock = inventoryItem.currentStock || 0
            const availableEmpty = inventoryItem.availableEmpty || 0
            const availableFull = inventoryItem.availableFull || 0
            
            // Store inventory availability for stock validation
            inventoryAvailability[inventoryItem.productId] = {
              currentStock,
              availableEmpty,
              availableFull
            }
            
            // Include ALL products (even with 0 stock) so filtering can work properly
            const productWithStock = {
              _id: inventoryItem.productId,
              name: inventoryItem.productName,
              productCode: inventoryItem.productCode,
              category: inventoryItem.category,
              currentStock: currentStock,
              // Add inventory-specific fields for availability checking
              availableEmpty: availableEmpty,
              availableFull: availableFull,
              cylinderSize: inventoryItem.cylinderSize,
              // Get price fields from the API response - they should be populated by the backend
              costPrice: inventoryItem.costPrice || 0,
              leastPrice: inventoryItem.leastPrice || 0,
            }
            allEmployeeProducts.push(productWithStock)
          }
        })
      }
      
      // Deduplicate products by _id
      const productsData = Array.from(
        new Map(allEmployeeProducts.map(p => [p._id, p])).values()
      )
      
      setSales(salesData)
      setCustomers(customersData)
      setAllProducts(productsData)
      setInventoryAvailability(inventoryAvailability)

      // Filter by selected category using inventory data for accurate stock levels (matching admin logic)
      const filteredProducts = productsData.filter((product: Product) => {
        if (product.category !== formData.category) return false
        
        if (product.category === 'cylinder') {
          // For cylinders, show based on available stock (both full and empty)
          const availableFull = inventoryAvailability[product._id]?.availableFull || 0
          const availableEmpty = inventoryAvailability[product._id]?.availableEmpty || 0
          return availableFull > 0 || availableEmpty > 0
        } else if (product.category === 'gas') {
          // For gas, check currentStock from inventory availability (Gas tab) - matching admin logic
          const gasStock = inventoryAvailability[product._id]?.currentStock || 0
          return gasStock > 0
        }
        
        // Fallback to product.currentStock for other categories
        return (product.currentStock || 0) > 0
      })
      
      console.log('Employee Gas Sales - Category filter:', formData.category)
      console.log('Employee Gas Sales - All products:', productsData.length)
      console.log('Employee Gas Sales - Filtered products:', filteredProducts.length)
      console.log('Employee Gas Sales - Gas products with stock:', productsData.filter(p => p.category === 'gas').map(p => ({
        name: p.name,
        productStock: p.currentStock,
        inventoryStock: inventoryAvailability[p._id]?.currentStock || 0
      })))
      console.log('Employee Gas Sales - Cylinder products with stock:', productsData.filter(p => p.category === 'cylinder').map(p => ({
        name: p.name,
        status: (p as any).cylinderStatus,
        availableFull: inventoryAvailability[p._id]?.availableFull || 0,
        availableEmpty: inventoryAvailability[p._id]?.availableEmpty || 0
      })))
      console.log('Employee Gas Sales - Loaded inventory:', {
        totalItems: employeeInventoryData?.data?.length || 0,
        gasProducts: productsData.filter(p => p.category === 'gas').length,
        cylinderProducts: productsData.filter(p => p.category === 'cylinder').length,
        availabilityMap: Object.keys(inventoryAvailability).length,
        inventoryAvailability: inventoryAvailability
      })
      
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
      console.log('EmployeeGasSales - Form submission attempt')
      console.log('EmployeeGasSales - formData.customerId:', formData.customerId)
      console.log('EmployeeGasSales - customers array:', customers)
      console.log('EmployeeGasSales - customers length:', customers.length)
      
      const selectedCustomer = (customers || []).find((c) => c._id === formData.customerId)
      console.log('EmployeeGasSales - selectedCustomer:', selectedCustomer)
      
      if (!selectedCustomer) {
        console.log('EmployeeGasSales - No customer found, showing alert')
        alert("Please select a customer")
        return
      }

      const saleItems = formData.items
        .filter((item) => {
          const quantity = Number(item.quantity) || 0
          const price = Number(item.price) || 0
          // Only include items with valid productId, quantity > 0, and price > 0 (exclude auxiliary items from API)
          return item.productId && quantity > 0 && price > 0
        })
        .map((item) => {
          const quantity = Number(item.quantity) || 1
          // Use the user-entered price from the form
          const price = Number(item.price) || 0
          const prod = allProducts.find((p: Product) => p._id === item.productId)
          const category = (item as any).category || prod?.category || 'gas'
          
          // For gas items, include cylinder information for backend processing
          const saleItem: any = {
            product: item.productId,  // This maps productId to product for the API
            quantity: quantity,
            price: price,
            total: price * quantity,
            category: category,
            cylinderStatus: (item as any).cylinderStatus,
            cylinderName: (item as any).cylinderName,
            cylinderSize: prod?.cylinderSize || 'large', // Add cylinder size
          }
          
          // Add cylinder product ID for gas sales so backend knows which cylinder to convert
          if (category === 'gas' && (item as any).cylinderProductId) {
            saleItem.cylinderProductId = (item as any).cylinderProductId
            // Also add cylinder size information for backend processing
            const cylinderProd = allProducts.find((p: Product) => p._id === (item as any).cylinderProductId)
            if (cylinderProd) {
              saleItem.cylinderSize = cylinderProd.cylinderSize || 'large'
            }
          }
          
          // Add gas product ID for full cylinder sales so backend knows which gas to deduct
          if (category === 'cylinder' && (item as any).cylinderStatus === 'full' && (item as any).gasProductId) {
            saleItem.gasProductId = (item as any).gasProductId
            console.log('GasSales - Adding gasProductId to cylinder item:', (item as any).gasProductId)
          }
          
          return saleItem
        })

      // Check for any auxiliary items (should be none now)
      const auxiliaryItems = formData.items
        .filter((item) => {
          const quantity = Number(item.quantity) || 0
          const price = Number(item.price) || 0
          // Find auxiliary items (price = 0) - should be none
          return item.productId && quantity > 0 && price === 0
        })
      
      console.log('🔧 Auxiliary items count (should be 0):', auxiliaryItems.length)
      if (auxiliaryItems.length > 0) {
        console.warn('⚠️ Found auxiliary items - this should not happen:', auxiliaryItems)
      }

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

      const employeeId = user.id
      
      const saleData = {
        employeeId, // Add employeeId for employee sales
        customer: formData.customerId,
        items: saleItems,  // Send only main items - backend handles inventory conversion internally
        totalAmount,
        paymentMethod: derivedPaymentMethod,
        paymentStatus: derivedPaymentStatus,
        receivedAmount: derivedReceivedAmount,
        notes: formData.notes,
      }

      console.log('🚀 EmployeeGasSales - Submitting sale data:', saleData)
      console.log('📦 EmployeeGasSales - Sale items (main):', saleItems)
      console.log('🔧 EmployeeGasSales - Auxiliary items (not sent):', auxiliaryItems)
      console.log('📋 EmployeeGasSales - Form data items (all):', formData.items)
      
      // Detailed product ID validation
      console.log('🔍 Product ID Validation:')
      const allProductIds = allProducts.map(p => p._id)
      console.log('Available product IDs:', allProductIds)
      
      saleItems.forEach((item, index) => {
        const productExists = allProductIds.includes(item.product)
        console.log(`Item ${index}: Product ID ${item.product} exists: ${productExists}`)
        if (!productExists) {
          console.error(`❌ INVALID PRODUCT ID: ${item.product} not found in products list`)
        }
      })
      
      // Debug gas product ID passing
      saleItems.forEach((item, index) => {
        if (item.category === 'cylinder' && item.cylinderStatus === 'full') {
          console.log(`🔍 Full cylinder item ${index}:`, {
            product: item.product,
            gasProductId: item.gasProductId,
            cylinderStatus: item.cylinderStatus,
            category: item.category
          })
        }
      })
      
      // Log detailed main item structure for debugging
      saleItems.forEach((item, index) => {
        console.log(`EmployeeGasSales - Main Item ${index}:`, {
          product: item.product,
          category: item.category,
          quantity: item.quantity,
          price: item.price,
          cylinderStatus: item.cylinderStatus,
          cylinderProductId: item.cylinderProductId,
          gasProductId: item.gasProductId,
          cylinderName: item.cylinderName,
          cylinderSize: item.cylinderSize
        })
      })

      let savedResponse: any = null
      if (editingSale) {
        console.log('EmployeeGasSales - Updating existing sale:', editingSale._id)
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
          console.log('EmployeeGasSales - PUT full payload:', fullUpdatePayload)
          savedResponse = await employeeSalesAPI.update(editingSale._id, fullUpdatePayload)
        } catch (err: any) {
          console.error('EmployeeGasSales - Full PUT failed, retrying minimal update. Error:', err?.response?.data || err?.message)
          const minimalUpdatePayload = {
            // Minimal fields commonly allowed in updates
            customer: saleData.customer,
            paymentMethod: derivedPaymentMethod,
            paymentStatus: derivedPaymentStatus,
            receivedAmount: derivedReceivedAmount,
            totalAmount: totalAmount,
            notes: formData.notes,
          }
          console.log('EmployeeGasSales - PUT minimal payload:', minimalUpdatePayload)
          savedResponse = await employeeSalesAPI.update(editingSale._id, minimalUpdatePayload)
        }
      } else {
        console.log('EmployeeGasSales - Creating new sale')
        console.log('EmployeeGasSales - Sale data:', saleData)
        
        // Debug: Show stock validation data being sent vs frontend data
        saleData.items.forEach((item, index) => {
          const product = allProducts.find(p => p._id === item.product)
          if (product) {
            console.log(`EmployeeGasSales - Item ${index} stock validation:`, {
              productName: product.name,
              category: product.category,
              quantity: item.quantity,
              frontendStock: product.category === 'gas' 
                ? inventoryAvailability[product._id]?.currentStock || 0
                : product.category === 'cylinder' 
                  ? (item.cylinderStatus === 'full' 
                      ? inventoryAvailability[product._id]?.availableFull || 0
                      : inventoryAvailability[product._id]?.availableEmpty || 0)
                  : product.currentStock || 0,
              productModelStock: product.currentStock || 0,
              inventoryAvailable: inventoryAvailability[product._id] || null
            })
          }
        })
        console.log('🌐 Making API call to create employee sale...')
        savedResponse = await employeeSalesAPI.create(saleData)
        console.log('✅ Employee sale created successfully:', savedResponse)
      }

      console.log('EmployeeGasSales - Sale completed successfully, refreshing data...')
      await fetchData()
      
      // Force refresh inventory data after sale
      setTimeout(async () => {
        console.log('EmployeeGasSales - Force refreshing inventory data after 1 second...')
        await fetchData()
      }, 1000)
      
      resetForm()
      setIsDialogOpen(false)
      
      // Notify other pages about stock update
      localStorage.setItem('stockUpdated', Date.now().toString())
      window.dispatchEvent(new Event('stockUpdated'))
      console.log('✅ Employee gas sale completed and stock update notification sent to other pages')

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
      console.error("❌ Failed to save sale:", error?.response?.data || error?.message)
      console.error("❌ Full error object:", error)
      console.error("❌ Error response data:", error?.response?.data)
      console.error("❌ Error response status:", error?.response?.status)
      const errorMessage = error.response?.data?.error || "Failed to save sale"
      
      // Check if it's a stock insufficient error
      if (errorMessage.toLowerCase().includes('insufficient stock') || errorMessage.toLowerCase().includes('available:')) {
        setStockErrorMessage(errorMessage)
        setShowStockNotification(true)
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
      items: [],
      paymentMethod: "cash",
      paymentStatus: "cleared",
      receivedAmount: "",
      paymentOption: "debit",
      notes: "",
    })
    setProductSearchTerms([])
    setShowProductSuggestions([])
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
        cylinderStatus: (item as any).cylinderStatus || "empty", // Default to empty for existing sales
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
    setProductSearchTerms(initialTerms.length ? initialTerms : [])
    setShowProductSuggestions(new Array(initialTerms.length).fill(false))
    setCustomerSearchTerm(sale.customer?.name || "")
    setShowCustomerSuggestions(false)
    setFilteredCustomerSuggestions([])
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this sale?")) {
      try {
        await employeeSalesAPI.delete(id)
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
      items: [...formData.items, { productId: "", quantity: "1", price: "", category: "gas", cylinderStatus: "empty" }],
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
        cylinderStatus: 'empty', // Reset cylinder status
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
    setCurrentItem({ category: "gas", productId: "", quantity: "1", price: "", cylinderStatus: "empty", gasProductId: "", cylinderProductId: "" })
    setEntryProductSearch("")
    setShowEntrySuggestions(false)
    setEntryGasSearch("")
    setShowEntryGasSuggestions(false)
    setEntryCylinderSearch("")
    setShowEntryCylinderSuggestions(false)
    setEditingItemIndex(null)
  }

  const handleEntryCategoryChange = (value: "gas" | "cylinder") => {
    setCurrentItem({ category: value, productId: "", quantity: "1", price: "", cylinderStatus: "empty", gasProductId: "", cylinderProductId: "" })
    setEntryProductSearch("")
    setEntryGasSearch("")
    setShowEntryGasSuggestions(false)
    setEntryCylinderSearch("")
    setShowEntryCylinderSuggestions(false)
  }

  const handleEntryProductSearchChange = (value: string) => {
    setEntryProductSearch(value)
    setShowEntrySuggestions(value.trim().length > 0)
  }

  const handleEntryProductSelect = (product: Product) => {
    // Base selected product
    let nextItem = {
      category: product.category as "gas" | "cylinder",
      productId: product._id,
      quantity: "1",
      price: (Number(product.leastPrice) || 0).toString(),
      cylinderStatus: currentItem.cylinderStatus || "empty" as "empty" | "full",
      gasProductId: "",
      cylinderProductId: currentItem.cylinderProductId || "",
    }

    // If gas selected, auto-pick a suitable full cylinder in stock
    if (product.category === 'gas') {
      const gasSize = product.cylinderSize as ("large" | "small" | undefined)
      let candidates = allProducts.filter((p: Product) => {
        if (p.category !== 'cylinder') return false
        const totalStock = inventoryAvailability[p._id]?.availableFull || 0
        const reservedStock = calculateReservedStock(p._id, 'cylinder', 'full')
        const availableStock = totalStock - reservedStock
        return availableStock > 0
      })
      // Fallback: if none via availability map, use currentStock as a backup
      if (candidates.length === 0) {
        candidates = allProducts.filter((p: Product) => {
          if (p.category !== 'cylinder') return false
          const reservedStock = calculateReservedStock(p._id, 'cylinder', 'full')
          const availableStock = (p.currentStock || 0) - reservedStock
          return availableStock > 0
        })
      }
      const sizeMatched = gasSize ? candidates.filter((c: Product) => (c.cylinderSize as any) === gasSize) : []
      const pick = (sizeMatched.length > 0 ? sizeMatched : candidates)
        .sort((a, b) => {
          const aTotal = (inventoryAvailability[a._id]?.availableFull ?? a.currentStock) || 0
          const aReserved = calculateReservedStock(a._id, 'cylinder', 'full')
          const aAvailable = aTotal - aReserved
          
          const bTotal = (inventoryAvailability[b._id]?.availableFull ?? b.currentStock) || 0
          const bReserved = calculateReservedStock(b._id, 'cylinder', 'full')
          const bAvailable = bTotal - bReserved
          
          return bAvailable - aAvailable
        })[0]
      if (pick) {
        nextItem = { ...nextItem, cylinderProductId: pick._id }
        setEntryCylinderSearch(pick.name)
        setShowEntryCylinderSuggestions(false)
      } else {
        // No suitable cylinder available
        nextItem = { ...nextItem, cylinderProductId: "" }
        setEntryCylinderSearch("")
      }
    }
    
    // If full cylinder selected, auto-pick a suitable gas product
    if (product.category === 'cylinder' && currentItem.cylinderStatus === 'full') {
      const cylinderSize = product.cylinderSize as ("large" | "small" | undefined)
      let gasProducts = allProducts.filter((p: Product) => {
        if (p.category !== 'gas') return false
        // Use inventory availability for gas stock (Gas tab) and account for reserved stock
        const totalStock = inventoryAvailability[p._id]?.currentStock || 0
        const reservedStock = calculateReservedStock(p._id, 'gas')
        const availableStock = totalStock - reservedStock
        return availableStock > 0
      })
      // Try to match cylinder size with gas size if available
      const sizeMatched = cylinderSize ? gasProducts.filter((g: Product) => (g.cylinderSize as any) === cylinderSize) : []
      const pick = (sizeMatched.length > 0 ? sizeMatched : gasProducts)
        .sort((a, b) => {
          const aTotal = inventoryAvailability[a._id]?.currentStock || 0
          const aReserved = calculateReservedStock(a._id, 'gas')
          const aAvailable = aTotal - aReserved
          
          const bTotal = inventoryAvailability[b._id]?.currentStock || 0
          const bReserved = calculateReservedStock(b._id, 'gas')
          const bAvailable = bTotal - bReserved
          
          return bAvailable - aAvailable
        })[0]
      if (pick) {
        nextItem = { ...nextItem, gasProductId: pick._id }
        setEntryGasSearch(pick.name)
        setShowEntryGasSuggestions(false)
      } else {
        // No suitable gas available
        nextItem = { ...nextItem, gasProductId: "" }
        setEntryGasSearch("")
      }
    }

    setCurrentItem(nextItem)
    setEntryProductSearch(product.name)
    setShowEntrySuggestions(false)
  }

  // Helper function to calculate reserved stock from current form items
  const calculateReservedStock = (productId: string, category: 'gas' | 'cylinder', cylinderStatus?: 'full' | 'empty') => {
    return formData.items.reduce((reserved, item) => {
      // For gas items, check direct gas usage
      if (category === 'gas' && (item as any).category === 'gas' && item.productId === productId) {
        return reserved + (Number(item.quantity) || 0)
      }
      
      // For gas items, also check cylinder conversion (gas sales with cylinderProductId)
      if (category === 'gas' && (item as any).category === 'gas' && (item as any).cylinderProductId === productId) {
        return reserved + (Number(item.quantity) || 0)
      }
      
      // For cylinder items, check direct cylinder usage
      if (category === 'cylinder' && (item as any).category === 'cylinder' && item.productId === productId) {
        const itemCylinderStatus = (item as any).cylinderStatus || 'empty'
        if (cylinderStatus === itemCylinderStatus) {
          return reserved + (Number(item.quantity) || 0)
        }
      }
      
      // For full cylinders, also check gas sales that use this cylinder (cylinderProductId)
      if (category === 'cylinder' && cylinderStatus === 'full' && (item as any).category === 'gas' && (item as any).cylinderProductId === productId) {
        return reserved + (Number(item.quantity) || 0)
      }
      
      return reserved
    }, 0)
  }

  const handleEntryQuantityChange = (value: string) => {
    const enteredQuantity = parseInt(value) || 0
    const product = allProducts.find((p: Product) => p._id === currentItem.productId)
    
    if (product && enteredQuantity > 0) {
      // Validate stock based on category and inventory data
      let availableStock = 0
      let stockType = ''
      let reservedStock = 0
      
      if (currentItem.category === 'gas') {
        // For gas sales, validate gas stock from inventory Gas tab
        const gasStock = inventoryAvailability[product._id]?.currentStock || 0
        reservedStock = calculateReservedStock(product._id, 'gas')
        availableStock = gasStock - reservedStock
        stockType = 'Gas'
        
        if (enteredQuantity > availableStock) {
          setStockErrorMessage(`Insufficient ${stockType} stock for ${product.name}. Available: ${gasStock}, Reserved: ${reservedStock}, Remaining: ${availableStock}, Required: ${enteredQuantity}`)
          setShowStockNotification(true)
          return
        }
      } else if (currentItem.category === 'cylinder') {
        // For cylinders, check based on cylinderStatus
        if (currentItem.cylinderStatus === 'full') {
          const totalStock = inventoryAvailability[product._id]?.availableFull || 0
          reservedStock = calculateReservedStock(product._id, 'cylinder', 'full')
          availableStock = totalStock - reservedStock
          stockType = 'Full Cylinders'
        } else {
          const totalStock = inventoryAvailability[product._id]?.availableEmpty || 0
          reservedStock = calculateReservedStock(product._id, 'cylinder', 'empty')
          availableStock = totalStock - reservedStock
          stockType = 'Empty Cylinders'
        }
        
        if (enteredQuantity > availableStock) {
          const totalStock = currentItem.cylinderStatus === 'full' 
            ? inventoryAvailability[product._id]?.availableFull || 0
            : inventoryAvailability[product._id]?.availableEmpty || 0
          setStockErrorMessage(`Insufficient ${stockType} stock for ${product.name}. Available: ${totalStock}, Reserved: ${reservedStock}, Remaining: ${availableStock}, Required: ${enteredQuantity}`)
          setShowStockNotification(true)
          return
        }
      }
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
      // For editing, also include cylinder name for gas sales
      let itemToEdit: any = {
        productId: currentItem.productId,
        quantity: currentItem.quantity,
        price: currentItem.price,
        category: currentItem.category,
        cylinderStatus: currentItem.cylinderStatus,
      }
      
      // If this is a gas sale, add the selected cylinder information
      if (currentItem.category === 'gas' && currentItem.cylinderProductId) {
        const cylinderProduct = allProducts.find((p: Product) => p._id === currentItem.cylinderProductId)
        if (cylinderProduct) {
          itemToEdit.cylinderName = cylinderProduct.name
          itemToEdit.cylinderProductId = currentItem.cylinderProductId
        }
      }
      
      items.splice(editingItemIndex, 0, itemToEdit)
    } else {
      // For gas sales, include cylinder name in the main item
      let itemToAdd: any = {
        productId: currentItem.productId,
        quantity: currentItem.quantity,
        price: currentItem.price,
        category: currentItem.category,
        cylinderStatus: currentItem.cylinderStatus,
      }
      
      // If this is a gas sale, add the selected cylinder information
      if (currentItem.category === 'gas' && currentItem.cylinderProductId) {
        const cylinderProduct = allProducts.find((p: Product) => p._id === currentItem.cylinderProductId)
        if (cylinderProduct) {
          itemToAdd.cylinderName = cylinderProduct.name
          itemToAdd.cylinderProductId = currentItem.cylinderProductId
        }
      }
      
      items.push(itemToAdd)
    }
    // TEMPORARILY DISABLED: Auxiliary items creation to test API submission
    // Backend should handle inventory conversion using cylinderProductId and gasProductId
    
    // If cylinder is Full and a gas product is selected, store gasProductId in main item
    if (currentItem.category === 'cylinder' && currentItem.cylinderStatus === 'full') {
      if (!currentItem.gasProductId) {
        setStockErrorMessage('Please select the Gas product for Full cylinder.')
        setShowStockNotification(true)
        return
      }
      
      // Add gasProductId to the main cylinder item for backend processing
      if (items.length > 0) {
        const lastItem = items[items.length - 1] as any
        if (lastItem.category === 'cylinder') {
          lastItem.gasProductId = currentItem.gasProductId
        }
      }
      
      // DON'T create auxiliary gas item - let backend handle it
      console.log('🔧 Full cylinder item will include gasProductId for backend processing')
    }

    // If GAS is being sold, store cylinderProductId in main item
    if (currentItem.category === 'gas' && currentItem.cylinderProductId) {
      // DON'T create auxiliary cylinder item - let backend handle it
      console.log('🔧 Gas item will include cylinderProductId for backend processing')
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
      cylinderStatus: (row as any).cylinderStatus || 'empty',
      gasProductId: (row as any).gasProductId || '',
      cylinderProductId: (row as any).cylinderProductId || '',
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
    console.log('EmployeeGasSales - Signature received:', signature)
    console.log('EmployeeGasSales - Signature length:', signature?.length)
    console.log('EmployeeGasSales - Pending sale:', pendingSale?.invoiceNumber)
    
    // Set signature state for future use
    setCustomerSignature(signature)
    setShowSignatureDialog(false)
    
    // Directly open receipt dialog with the pending sale and signature embedded
    if (pendingSale) {
      console.log('EmployeeGasSales - Opening receipt dialog with signature embedded in sale')
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
        (customer.serialNumber && customer.serialNumber.toLowerCase().includes(value.toLowerCase())) ||
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

  // Group filtered sales by invoice number for expandable rows
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const groupedByInvoice = (() => {
    const map: Record<string, any> = {}
    for (const s of filteredSales) {
      const key = s.invoiceNumber || `N/A-${s._id}`
      if (!map[key]) {
        map[key] = {
          key,
          invoice: s.invoiceNumber || 'N/A',
          customer: s.customer,
          date: s.createdAt || s.updatedAt || '',
          paymentStatus: s.paymentStatus,
          paymentMethod: s.paymentMethod,
          employee: s.employee,
          totalAmount: 0,
          receivedAmount: 0,
          items: [] as any[],
          firstSale: s,
        }
      }
      map[key].totalAmount += Number(s.totalAmount || 0)
      map[key].receivedAmount += Number(s.receivedAmount || 0)
      // Flatten items for display
      const items = Array.isArray(s.items) ? s.items : []
      for (const it of items) {
        // Hide auxiliary zero-priced items in grouped display
        if (Number((it as any).price || 0) === 0) {
          continue
        }
        map[key].items.push({
          name: it.product?.name || 'Unknown Product',
          category: (it as any).category || (it.product as any)?.category || 'gas',
          cylinderStatus: (it as any).cylinderStatus || 'empty',
          quantity: Number((it as any).quantity || 0),
          price: Number((it as any).price || 0),
        })
      }
    }
    return Object.values(map).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  })()
  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Pagination (20 per page) — now depends on grouped invoices
  const [salesPage, setSalesPage] = useState(1)
  const salesPageSize = 20
  const salesTotalPages = Math.max(1, Math.ceil(groupedByInvoice.length / salesPageSize))
  const paginatedGroups = groupedByInvoice.slice((salesPage - 1) * salesPageSize, salesPage * salesPageSize)
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
    <div className="pt-5 lg:pt-0 space-y-8">
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-2xl p-8 text-white">
        <h1 className="text-4xl font-bold mb-2">Employee Gas Sales</h1>
        <p className="text-white/80 text-lg">Create and manage gas sales from employee inventory</p>
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
              <div className="absolute top-full left-0 right-0 z-50 bg-white text-black border border-gray-200 rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
                {filteredSearchSuggestions.map((customer) => (
                  <div
                    key={customer._id}
                    onClick={() => handleSearchSuggestionClick(customer)}
                    className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 text-black"
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
            <SelectTrigger className="w-[150px] bg-white text-black">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white text-black">
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
                    placeholder="Search by name, serial number, phone, or email..."
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
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">{customer.name}</span>
                              {customer.serialNumber && (
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
                                  {customer.serialNumber}
                                </span>
                              )}
                            </div>
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
                      <SelectTrigger className="bg-white text-black">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white text-black">
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
                      <SelectTrigger className="bg-white text-black">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent className="bg-white text-black">
                        <SelectItem value="gas">Gas</SelectItem>
                        <SelectItem value="cylinder">Cylinder</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {currentItem.category === 'cylinder' && (
                    <div className="space-y-2">
                      <Label>Full or Empty Cylinder</Label>
                      <Select 
                        value={currentItem.cylinderStatus || "empty"} 
                        onValueChange={(value: "empty" | "full") => 
                          setCurrentItem({ ...currentItem, cylinderStatus: value })
                        }
                      >
                        <SelectTrigger className="bg-white text-black">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent className="bg-white text-black">
                          <SelectItem value="empty">Empty</SelectItem>
                          <SelectItem value="full">Full</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
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
                    {showEntrySuggestions && (() => {
                      const searchTerm = entryProductSearch.toLowerCase().trim()
                      const isDepositSearch = searchTerm === 'deposit'
                      
                      const filteredProducts = allProducts
                        .filter((p: Product) => {
                          // Special handling for "deposit" search - show all products with quantities
                          if (isDepositSearch) {
                            const gasStock = inventoryAvailability[p._id]?.currentStock || 0
                            const emptyStock = inventoryAvailability[p._id]?.availableEmpty || 0
                            const fullStock = inventoryAvailability[p._id]?.availableFull || 0
                            return gasStock > 0 || emptyStock > 0 || fullStock > 0
                          }
                          
                          // Handle case-insensitive category matching
                          const productCategory = (p.category || '').toLowerCase()
                          const filterCategory = currentItem.category.toLowerCase()
                          
                          console.log('🔍 Product suggestion filter:', {
                            productName: p.name,
                            productCategory: productCategory,
                            filterCategory: filterCategory,
                            cylinderStatus: currentItem.cylinderStatus,
                            inventoryData: inventoryAvailability[p._id]
                          })
                          
                          // Match gas categories
                          if (filterCategory === 'gas') {
                            if (!productCategory.includes('gas')) return false
                            // For gas, check currentStock from inventory availability
                            const gasStock = inventoryAvailability[p._id]?.currentStock || 0
                            console.log('🔍 Gas suggestion check:', { productName: p.name, gasStock })
                            if (gasStock <= 0) return false
                          }
                          
                          // Match cylinder categories
                          else if (filterCategory === 'cylinder') {
                            if (!productCategory.includes('cylinder')) return false
                            // For cylinders, filter based on selected status
                            if (currentItem.cylinderStatus === 'empty') {
                              // Show cylinders with empty stock available
                              const availableEmpty = inventoryAvailability[p._id]?.availableEmpty || 0
                              console.log('🔍 Empty cylinder suggestion check:', { productName: p.name, availableEmpty })
                              if (availableEmpty <= 0) return false
                            } else {
                              // Show cylinders with full stock available
                              const availableFull = inventoryAvailability[p._id]?.availableFull || 0
                              console.log('🔍 Full cylinder suggestion check:', { productName: p.name, availableFull })
                              if (availableFull <= 0) return false
                            }
                          }
                          
                          else {
                            return false
                          }
                          
                          // Filter by search term
                          if (entryProductSearch.trim().length > 0) {
                            const productName = p.name.toLowerCase().trim()
                            if (!productName.includes(searchTerm)) return false
                          }
                          return true
                        })
                        .slice(0, isDepositSearch ? 20 : 8)
                      

                      
                      return (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {filteredProducts.length === 0 ? (
                            <div className="px-4 py-3 text-center text-gray-500 text-sm">
                              {entryProductSearch.trim().length > 0 
                                ? `No ${currentItem.category} products found matching "${entryProductSearch}"`
                                : `No ${currentItem.category} products available`
                              }
                            </div>
                          ) : (
                            filteredProducts.map((product) => (
                              <div
                                key={product._id}
                                className="px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleEntryProductSelect(product)}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-gray-900">
                                    {product.name}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {product.category === 'gas' && (
                                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                        Stock: {inventoryAvailability[product._id]?.currentStock || 0}
                                      </span>
                                    )}
                                    {product.category === 'cylinder' && (
                                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                        {currentItem.cylinderStatus === 'empty' ? 'Empty' : 'Full'}: {currentItem.cylinderStatus === 'empty' ? (inventoryAvailability[product._id]?.availableEmpty || 0) : (inventoryAvailability[product._id]?.availableFull || 0)}
                                      </span>
                                    )}
                                    <span className="text-xs text-gray-500">Min AED {(product.leastPrice || 0).toFixed(2)}</span>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  {currentItem.category === 'gas' && (
                    <div className="space-y-2 relative">
                      <Label>Select Cylinder</Label>
                      <Input
                        placeholder="Search cylinder product"
                        value={entryCylinderSearch}
                        onChange={(e) => handleEntryCylinderSearchChange(e.target.value)}
                        onFocus={() => setShowEntryCylinderSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowEntryCylinderSuggestions(false), 200)}
                        className="pr-10"
                      />
                      {showEntryCylinderSuggestions && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {(() => {
                            let availableCylinders = allProducts
                              .filter((p: Product) => {
                                if (p.category !== 'cylinder') return false
                                const avail = inventoryAvailability[p._id]?.availableFull || 0
                                return avail > 0
                              })
                            // Fallback if inventory availability map is empty
                            if (availableCylinders.length === 0) {
                              availableCylinders = allProducts.filter((p: Product) => p.category === 'cylinder' && (p.currentStock || 0) > 0)
                            }
                            availableCylinders = availableCylinders
                              .filter((p: Product) => entryCylinderSearch.trim().length === 0 || p.name.toLowerCase().includes(entryCylinderSearch.toLowerCase()))
                              .slice(0, 8)
                            

                            
                            if (availableCylinders.length === 0) {
                              return (
                                <div className="px-4 py-3 text-center text-gray-500 text-sm">
                                  {entryCylinderSearch.trim().length > 0 
                                    ? `No full cylinders found matching "${entryCylinderSearch}"`
                                    : "No full cylinders available in stock"
                                  }
                                </div>
                              )
                            }
                            
                            return availableCylinders.map((product) => (
                              <div
                                key={product._id}
                                className="px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleEntryCylinderSelect(product)}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-gray-900">
                                    {product.name}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Full</span>
                                    <span className="text-xs text-gray-500">Available: {(inventoryAvailability[product._id]?.availableFull ?? product.currentStock) || 0}</span>
                                  </div>
                                </div>
                              </div>
                            ))
                          })()
                          }
                        </div>
                      )}
                    </div>
                  )}

                  {currentItem.category === 'cylinder' && currentItem.cylinderStatus === 'full' && (
                    <div className="space-y-2 relative">
                      <Label>Select Gas</Label>
                      <Input
                        placeholder="Search gas product"
                        value={entryGasSearch}
                        onChange={(e) => handleEntryGasSearchChange(e.target.value)}
                        onFocus={() => setShowEntryGasSuggestions(entryGasSearch.trim().length > 0)}
                        onBlur={() => setTimeout(() => setShowEntryGasSuggestions(false), 200)}
                        className="pr-10"
                      />
                      {showEntryGasSuggestions && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {allProducts
                            .filter((p: Product) => p.category === 'gas')
                            .filter((p: Product) => entryGasSearch.trim().length === 0 || p.name.toLowerCase().includes(entryGasSearch.toLowerCase()))
                            .slice(0, 8)
                            .map((product) => (
                              <div
                                key={product._id}
                                className="px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleEntryGasSelect(product)}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-gray-900">
                                    {product.name}
                                  </span>
                                  <span className="text-xs text-gray-500">Stock: {inventoryAvailability[product._id]?.currentStock || 0}</span>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}

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
                      <div className="grid grid-cols-[1fr_2fr_1fr_1.5fr_1fr_1.2fr_1fr] gap-3 px-2 py-2 text-xs font-medium text-gray-600 bg-gray-50 rounded-md mb-2 whitespace-nowrap">
                        <div>Category</div>
                        <div>Product</div>
                        <div>Status</div>
                        <div>Cylinder</div>
                        <div>Qty</div>
                        <div>Price (AED)</div>
                        <div>Actions</div>
                      </div>
                      <div className="space-y-1">
                        {formData.items
                          // Hide auxiliary zero-priced items from the list to avoid confusing users
                          .filter((it: any) => !(Number((it as any).price || 0) === 0))
                          .map((it, idx) => {
                          const p = allProducts.find((ap) => ap._id === it.productId)
                          return (
                            <div key={idx} className="grid grid-cols-[1fr_2fr_1fr_1.5fr_1fr_1.2fr_1fr] gap-3 px-2 py-2 border-b last:border-b-0 items-center">
                              <div className="truncate">{(it as any).category || 'gas'}</div>
                              <div className="truncate">{p?.name || '-'}</div>
                              <div className="truncate">
                                {(() => {
                                  // Show product status based on category and inventory data
                                  if ((it as any).category === 'gas') {
                                    return 'Gas'
                                  } else if ((it as any).category === 'cylinder') {
                                    if ((it as any).cylinderStatus === 'full') {
                                      return 'Full'
                                    } else if ((it as any).cylinderStatus === 'empty') {
                                      return 'Empty'
                                    } else {
                                      return 'Full → Empty'
                                    }
                                  }
                                  return '-'
                                })()}
                              </div>
                              <div className="truncate">
                                {(it as any).cylinderName || '-'}
                              </div>
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
                  <SelectTrigger className="bg-white text-black">
                    <SelectValue placeholder="Select option" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-black">
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
                    <SelectTrigger className="bg-white text-black">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-black">
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
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
                    <div className="absolute z-50 mt-1 w-full bg-white text-black border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredExportSuggestions.map((name) => (
                        <div
                          key={name}
                          className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 text-black"
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
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Label className="text-xs text-white/80">From</Label>
                    <Input
                      className="w-full sm:w-auto placeholder:text-gray-500 text-black"
                      type="date"
                      placeholder="From date"
                      aria-label="From date"
                      value={exportStartDate}
                      onChange={(e) => setExportStartDate(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Label className="text-xs text-white/80">To</Label>
                    <Input
                      className="w-full sm:w-auto placeholder:text-gray-500 text-black"
                      type="date"
                      placeholder="To date"
                      aria-label="To date"
                      value={exportEndDate}
                      onChange={(e) => setExportEndDate(e.target.value)}
                    />
                  </div>
                </div>
              )}
              {showExportInput && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" className="bg-white text-[#2B3068] hover:bg-gray-100 w-full sm:w-auto">
                      <Filter className="h-4 w-4 mr-2" />
                      Export Format
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-white text-black">
                    <DropdownMenuItem onClick={exportSalesCSV}>Export CSV</DropdownMenuItem>
                    <DropdownMenuItem onClick={exportSalesPDF}>Export PDF</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                variant="secondary"
                className="bg-white text-[#2B3068] hover:bg-gray-100 w-full sm:w-auto"
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
                {paginatedGroups.map((group: any) => {
                  const visibleItems = group.items.slice(0, 1)
                  const remaining = Math.max(0, group.items.length - visibleItems.length)
                  return (
                    <Fragment key={group.key}>
                      <TableRow>
                        <TableCell className="p-4 font-medium">{group.invoice}</TableCell>
                        <TableCell className="p-4">
                          <div>
                            <div className="font-medium">{group.customer?.name || "Unknown Customer"}</div>
                            <div className="text-sm text-gray-500">{group.customer?.phone}</div>
                          </div>
                        </TableCell>
                        <TableCell className="p-4">
                          <div className="space-y-1">
                            {visibleItems.map((item: any, index: number) => (
                              <div key={index} className="text-sm">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span>{item.name} x{item.quantity}</span>
                                  {item.category === 'cylinder' ? (
                                    <Badge variant="outline" className="text-xs font-medium bg-amber-50 text-amber-700 border-amber-200">
                                      {item.cylinderStatus === 'full' ? 'Full' : 'Empty'}
                                    </Badge>
                                  ) : null}
                                  <Badge
                                    variant="outline"
                                    className={`text-xs font-medium ${item.category === 'gas' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-green-50 text-green-700 border-green-200'}`}
                                  >
                                    {item.category}
                                  </Badge>
                                </div>
                                <div className="text-xs text-gray-500">AED {Number(item.price || 0).toFixed(2)} each</div>
                              </div>
                            ))}
                            {remaining > 0 && (
                              <button
                                type="button"
                                onClick={() => toggleGroup(group.key)}
                                className="text-xs text-[#2B3068] font-medium hover:underline"
                              >
                                {expandedGroups[group.key] ? 'Hide details' : `See ${remaining} more item${remaining > 1 ? 's' : ''}`}
                              </button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="p-4 font-semibold">AED {Number(group.totalAmount || 0).toFixed(2)}</TableCell>
                        <TableCell className="p-4 font-semibold">AED {Number(group.receivedAmount || 0).toFixed(2)}</TableCell>
                        <TableCell className="p-4 capitalize">{group.paymentMethod}</TableCell>
                        <TableCell className="p-4">
                          <Badge
                            variant={
                              group.paymentStatus === "cleared"
                                ? "default"
                                : group.paymentStatus === "pending"
                                  ? "secondary"
                                  : "destructive"
                            }
                            className={
                              group.paymentStatus === "cleared"
                                ? "bg-green-100 text-green-800"
                                : group.paymentStatus === "pending"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-red-100 text-red-800"
                            }
                          >
                            {group.paymentStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="p-4">
                          {group.employee ? (
                            <Badge variant="default">{group.employee.name}</Badge>
                          ) : (
                            <Badge variant="secondary">Admin</Badge>
                          )}
                        </TableCell>
                        <TableCell className="p-4">{group.date ? new Date(group.date).toLocaleDateString() : ''}</TableCell>
                        <TableCell className="p-4">
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReceiptClick(group.firstSale)}
                              className="text-[#2B3068] border-[#2B3068] hover:bg-[#2B3068] hover:text-white"
                            >
                              <Receipt className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleEdit(group.firstSale)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDelete(group.firstSale?._id)}
                              className="text-red-600 border-red-600 hover:bg-red-600 hover:text-white"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedGroups[group.key] && (
                        <TableRow>
                          <TableCell colSpan={10} className="bg-gray-50">
                            <div className="p-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {group.items.map((item: any, idx: number) => (
                                  <div key={idx} className="text-sm border rounded-md p-2 bg-white">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium">{item.name}</span>
                                      {item.category === 'cylinder' ? (
                                        <Badge variant="outline" className="text-xs font-medium bg-amber-50 text-amber-700 border-amber-200">
                                          {item.cylinderStatus === 'full' ? 'Full' : 'Empty'}
                                        </Badge>
                                      ) : null}
                                      <Badge
                                        variant="outline"
                                        className={`text-xs font-medium ${item.category === 'gas' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-green-50 text-green-700 border-green-200'}`}
                                      >
                                        {item.category}
                                      </Badge>
                                    </div>
                                    <div className="text-xs text-gray-600">Qty: {item.quantity} • AED {Number(item.price || 0).toFixed(2)} each</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
                {groupedByInvoice.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-gray-500">
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
              Showing {groupedByInvoice.length === 0 ? 0 : (salesPage - 1) * salesPageSize + 1}
              -{Math.min(salesPage * salesPageSize, groupedByInvoice.length)} of {groupedByInvoice.length}
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



      {/* Stock Insufficient Notification (Slide-in from right) */}
      {showStockNotification && (
        <div className="fixed top-4 right-4 z-[99999] max-w-md">
          <div className="bg-red-500 text-white px-6 py-4 rounded-lg shadow-lg transform transition-all duration-300 animate-in slide-in-from-right-full">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-sm mb-1">Insufficient Stock</h4>
                <p className="text-sm opacity-90">{stockErrorMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowStockNotification(false)}
                className="flex-shrink-0 text-white hover:text-red-200 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
