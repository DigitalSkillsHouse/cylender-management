"use client"

import React, { Fragment } from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Plus, Edit, Trash2, Loader2, ShoppingCart, AlertCircle, Package as PackageIcon, ChevronRight, ChevronDown, RefreshCw, Download, Calendar } from "lucide-react"
import { suppliersAPI, productsAPI, purchaseOrdersAPI } from "@/lib/api"
import jsPDF from "jspdf"

interface PurchaseOrder {
  _id: string
  supplier: { _id: string; companyName: string }
  items: Array<{
    _id?: string
    product: { _id: string; name: string }
    purchaseType: "gas" | "cylinder"
    cylinderStatus?: "empty" | "full"
    gasType?: string
    emptyCylinderId?: string
    quantity: number
    unitPrice: number
    itemTotal: number
  }>
  purchaseDate: string
  totalAmount: number
  notes: string
  status: "pending" | "completed" | "cancelled"
  poNumber: string
}

interface InventoryItemLite {
  _id: string
  productId: string | null
  productName: string
  category: "gas" | "cylinder"
  availableEmpty?: number
  availableFull?: number
  currentStock?: number
}

interface Product {
  _id: string
  name: string
  costPrice: number
  currentStock: number
  category: "gas" | "cylinder"
  cylinderStatus?: "empty" | "full"
  availableEmpty?: number
  availableFull?: number
}

interface PurchaseItem {
  purchaseType: "gas" | "cylinder"
  productId: string
  productCode?: string
  quantity: string
  unitPrice: string
  cylinderStatus?: "empty" | "full"
  gasType?: string
  emptyCylinderId?: string
  emptyCylinderCode?: string
}

export function PurchaseManagement() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null)
  const [error, setError] = useState<string>("")
  const [searchTerm, setSearchTerm] = useState("")
  // Date range filters for PDF export
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [showDateFilters, setShowDateFilters] = useState(false)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  // PDF date range popup
  const [showPDFDatePopup, setShowPDFDatePopup] = useState(false)
  const [pdfFromDate, setPdfFromDate] = useState("")
  const [pdfToDate, setPdfToDate] = useState("")
  const [adminSignature, setAdminSignature] = useState<string | null>(null)
  // Expanded state for grouped invoice rows
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  // Single entry item state (2x2 form)
  const [currentItem, setCurrentItem] = useState<{purchaseType: "gas"|"cylinder"; productId: string; productCode?: string; quantity: string; unitPrice: string; cylinderStatus?: "empty" | "full"; gasType?: string; emptyCylinderId?: string; emptyCylinderCode?: string}>({
    purchaseType: "gas",
    productId: "",
    productCode: undefined,
    quantity: "",
    unitPrice: "",
    cylinderStatus: "empty",
    gasType: "",
    emptyCylinderId: "",
    emptyCylinderCode: undefined,
  })
  const [productSearchTerm, setProductSearchTerm] = useState("")
  const [showProductSuggestions, setShowProductSuggestions] = useState(false)
  const [cylinderSearchTerm, setCylinderSearchTerm] = useState("")
  const [showCylinderSuggestions, setShowCylinderSuggestions] = useState(false)
  const [gasSearchTerm, setGasSearchTerm] = useState("")
  const [showGasSuggestions, setShowGasSuggestions] = useState(false)
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null)
  const [formData, setFormData] = useState<{ supplierId: string; purchaseDate: string; invoiceNumber: string; items: PurchaseItem[]; notes: string }>(() => ({
    supplierId: "",
    purchaseDate: new Date().toISOString().split("T")[0],
    invoiceNumber: "",
    items: [],
    notes: "",
  }))
  const [inventoryItems, setInventoryItems] = useState<InventoryItemLite[]>([])

  useEffect(() => {
    fetchData()
  }, [])

  // Add window focus listener to refresh data when user returns to the page
  useEffect(() => {
    const handleFocus = () => {
      console.log("Purchase Management page focused, refreshing data...")
      fetchData()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  // Add click outside handler to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.product-suggestions') && !target.closest('.product-search-input')) {
        setShowProductSuggestions(false)
      }
      if (!target.closest('.cylinder-suggestions') && !target.closest('.cylinder-search-input')) {
        setShowCylinderSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Load admin signature from database first, fallback to localStorage
  useEffect(() => {
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
            console.log("Admin signature loaded from database")
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
        console.log("Admin signature loaded:", sig ? "Found in localStorage" : "Not found")
      } catch (e) {
        console.warn("Failed to load admin signature:", e)
        setAdminSignature(null)
      }
    }

    loadAdminSignature()
  }, [])

  const fetchData = async () => {
    try {
      setError("")
      
      // Fetch suppliers, products, and inventory items
      const [suppliersRes, productsRes, inventoryRes] = await Promise.all([
        suppliersAPI.getAll(), 
        productsAPI.getAll(),
        fetch('/api/inventory-items', { cache: 'no-store' })
      ])
      
      const suppliersData = suppliersRes.data || []
      const productsData = productsRes.data || []
      const inventoryDataRaw = await (async () => { try { return (await inventoryRes.json())?.data || [] } catch { return [] } })()
      
      setSuppliers(suppliersData)
      setProducts(productsData)
      setInventoryItems(inventoryDataRaw)
      
      // Try to fetch purchase orders separately (requires auth)
      try {
        const purchaseOrdersRes = await purchaseOrdersAPI.getAll()
        
        // The API response structure is: response.data.data (nested)
        const ordersData = purchaseOrdersRes.data?.data || purchaseOrdersRes.data || []
        
        // Ensure it's always an array
        const finalData = Array.isArray(ordersData) ? ordersData : []
        
        setPurchaseOrders(finalData)
      } catch (purchaseError: any) {
        
        if (purchaseError.response?.status === 401) {
          setError("Authentication required. Please log in to view purchase orders.")
        } else {
          setError(`Failed to load purchase orders: ${purchaseError.message}`)
        }
        setPurchaseOrders([])
      }
    } catch (error: any) {
      setError("Failed to load suppliers and products. Please refresh the page.")
    } finally {
      setLoading(false)
    }
  }

  const generatePONumber = () => {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0")
    return `PO-${year}${month}${day}-${random}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError("")

    try {
      const selectedSupplier = suppliers.find((s) => s._id === formData.supplierId)
      
      if (!selectedSupplier) {
        setError("Please select a valid supplier")
        return
      }

      // Validate required fields
      if (!formData.invoiceNumber?.trim()) {
        setError("Please enter an invoice number")
        return
      }

      // Validate all items (unit price optional)
      for (const item of formData.items) {
        const selectedProduct = products.find((p) => p._id === item.productId)
        if (!selectedProduct) {
          setError("Please select valid products for all items")
          return
        }
        if (!item.quantity) {
          setError("Please enter quantity for all items")
          return
        }
        if (item.purchaseType === 'cylinder' && !item.cylinderStatus) {
          setError("Please select cylinder status for all cylinder items")
          return
        }
        if (item.purchaseType === 'cylinder' && item.cylinderStatus === 'full' && !item.gasType) {
          setError("Please select gas type for full cylinder items")
          return
        }
        if (item.purchaseType === 'gas' && !item.emptyCylinderId) {
          setError("Please select empty cylinder for gas purchases")
          return
        }
        if (item.purchaseType === 'gas' && item.emptyCylinderId) {
          const inv = inventoryItems.find(ii => ii.productId === item.emptyCylinderId)
          const available = inv?.availableEmpty ?? 0
          if (available < Number(item.quantity)) {
            setError(`Not enough empty cylinders available. Available: ${available}, Requested: ${item.quantity}`)
            return
          }
        }
      }

      // For editing existing orders, handle with new multi-item structure
      if (editingOrder) {
        const purchaseData = {
          supplier: formData.supplierId,
          purchaseDate: formData.purchaseDate,
          items: formData.items.map(item => ({
            productId: item.productId,
            ...(item.productCode ? { productCode: item.productCode } : {}),
            purchaseType: item.purchaseType,
            ...(item.purchaseType === 'cylinder' ? { 
              cylinderStatus: item.cylinderStatus || 'empty',
              ...(item.cylinderStatus === 'full' ? { gasType: item.gasType } : {})
            } : {}),
            ...(item.purchaseType === 'gas' ? { emptyCylinderId: item.emptyCylinderId, ...(item.emptyCylinderCode ? { emptyCylinderCode: item.emptyCylinderCode } : {}) } : {}),
            quantity: item.quantity,
            unitPrice: item.unitPrice || 0,
          })),
          notes: formData.notes,
          invoiceNumber: formData.invoiceNumber.trim(),
        }
        await purchaseOrdersAPI.update(editingOrder._id, purchaseData)
      } else {
        // For new orders, create single purchase order with multiple items
        const purchaseData = {
          supplier: formData.supplierId,
          purchaseDate: formData.purchaseDate,
          items: formData.items.map(item => ({
            productId: item.productId,
            purchaseType: item.purchaseType,
            ...(item.purchaseType === 'cylinder' ? { 
              cylinderStatus: item.cylinderStatus || 'empty',
              ...(item.cylinderStatus === 'full' ? { gasType: item.gasType } : {})
            } : {}),
            ...(item.purchaseType === 'gas' ? { emptyCylinderId: item.emptyCylinderId } : {}),
            quantity: item.quantity,
            unitPrice: item.unitPrice || 0,
          })),
          notes: formData.notes,
          invoiceNumber: formData.invoiceNumber.trim(),
        }
        await purchaseOrdersAPI.create(purchaseData)
      }

      await fetchData()
      resetForm()
      setIsDialogOpen(false)
    } catch (error: any) {
      console.error("Purchase order creation error:", error)
      const errorMessage = error.response?.data?.error || error.message || "Failed to save purchase order"
      setError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setFormData({
      supplierId: "",
      purchaseDate: new Date().toISOString().split("T")[0],
      invoiceNumber: "",
      items: [],
      notes: "",
    })
    setEditingOrder(null)
    setError("")
    setCurrentItem({ purchaseType: "gas", productId: "", quantity: "", unitPrice: "", cylinderStatus: "empty", gasType: "", emptyCylinderId: "" })
    setProductSearchTerm("")
    setShowProductSuggestions(false)
    setCylinderSearchTerm("")
    setShowCylinderSuggestions(false)
    setEditingItemIndex(null)
  }

  const handleEdit = (order: PurchaseOrder) => {
    setEditingOrder(order)
    setFormData({
      supplierId: order.supplier._id,
      purchaseDate: order.purchaseDate.split("T")[0],
      invoiceNumber: order.poNumber || "",
      items: order.items.map(item => ({
        purchaseType: item.purchaseType,
        productId: item.product._id,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        cylinderStatus: item.purchaseType === 'cylinder' ? (item.cylinderStatus || 'empty') : undefined,
        gasType: item.purchaseType === 'cylinder' && item.cylinderStatus === 'full' ? (item.gasType || '') : undefined,
        emptyCylinderId: item.purchaseType === 'gas' ? (item.emptyCylinderId || '') : undefined,
      })),
      notes: order.notes || "",
    })
    // Initialize current item inputs for edit mode - use first item
    const firstItem = order.items[0]
    if (firstItem) {
      const pName = products.find(p => p._id === firstItem.product._id)?.name || ""
      setCurrentItem({
        purchaseType: firstItem.purchaseType,
        productId: firstItem.product._id,
        quantity: firstItem.quantity.toString(),
        unitPrice: firstItem.unitPrice.toString(),
        cylinderStatus: firstItem.cylinderStatus || "empty",
        gasType: firstItem.gasType || "",
        emptyCylinderId: firstItem.emptyCylinderId || "",
      })
      setProductSearchTerm(pName)
      
      // Set cylinder search term if it's a gas purchase
      if (firstItem.purchaseType === 'gas' && firstItem.emptyCylinderId) {
        const cylinderName = products.find(p => p._id === firstItem.emptyCylinderId)?.name || ""
        setCylinderSearchTerm(cylinderName)
      }
    }
    setShowProductSuggestions(false)
    setShowCylinderSuggestions(false)
    setEditingItemIndex(null)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this purchase order?")) {
      try {
        await purchaseOrdersAPI.delete(id)
        await fetchData()
      } catch (error) {
        alert("Failed to delete purchase order")
      }
    }
  }

  const addItem = () => {
    // Validate currentItem
    const selectedProduct = products.find(p => p._id === currentItem.productId)
    if (!selectedProduct || !currentItem.quantity) {
      setError("Please select a product and enter quantity")
      return
    }
    if (currentItem.purchaseType === 'cylinder' && !currentItem.cylinderStatus) {
      setError("Please select cylinder status for cylinder purchase")
      return
    }
    if (currentItem.purchaseType === 'cylinder' && currentItem.cylinderStatus === 'full' && !currentItem.gasType) {
      setError("Please select gas type for full cylinder purchase")
      return
    }
    if (currentItem.purchaseType === 'gas' && !currentItem.emptyCylinderId) {
      setError("Please select empty cylinder for gas purchase")
      return
    }
    if (currentItem.purchaseType === 'gas' && currentItem.emptyCylinderId) {
      const inv = inventoryItems.find(ii => ii.productId === currentItem.emptyCylinderId)
      const available = inv?.availableEmpty ?? 0
      if (available < Number(currentItem.quantity)) {
        setError(`Not enough empty cylinders available. Available: ${available}, Requested: ${currentItem.quantity}`)
        return
      }
    }
    const nextItems = [...formData.items, {
      purchaseType: currentItem.purchaseType,
      productId: currentItem.productId,
      productCode: currentItem.productCode,
      quantity: currentItem.quantity,
      unitPrice: currentItem.unitPrice,
      cylinderStatus: currentItem.purchaseType === 'cylinder' ? (currentItem.cylinderStatus || 'empty') : undefined,
      gasType: currentItem.purchaseType === 'cylinder' && currentItem.cylinderStatus === 'full' ? currentItem.gasType : undefined,
      emptyCylinderId: currentItem.purchaseType === 'gas' ? currentItem.emptyCylinderId : undefined,
      emptyCylinderCode: currentItem.purchaseType === 'gas' ? currentItem.emptyCylinderCode : undefined,
    }]
    setFormData({ ...formData, items: nextItems })
    // Clear inputs for next entry
    setCurrentItem({ purchaseType: currentItem.purchaseType, productId: "", productCode: undefined, quantity: "", unitPrice: "", cylinderStatus: "empty", gasType: "", emptyCylinderId: "", emptyCylinderCode: undefined })
    setProductSearchTerm("")
    setShowProductSuggestions(false)
    setCylinderSearchTerm("")
    setShowCylinderSuggestions(false)
    setEditingItemIndex(null)
  }

  const removeItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    })
  }

  const updateItem = (index: number, field: string, value: any) => {
    setFormData((prev) => {
      const newItems = [...prev.items]
      newItems[index] = { ...newItems[index], [field]: value }
      return { ...prev, items: newItems }
    })
  }

  const updateItemMulti = (
    index: number,
    updates: Partial<(typeof formData.items)[number]>
  ) => {
    setFormData((prev) => {
      const newItems = [...prev.items]
      newItems[index] = {
        ...newItems[index],
        ...updates,
      }
      return { ...prev, items: newItems }
    })
  }

  // Calculate total amount for all items including VAT
  const totalAmount = formData.items.reduce((sum, item) => {
    const quantity = Number(item.quantity) || 0
    const unitPrice = Number(item.unitPrice) || 0
    const subtotal = quantity * unitPrice
    const vatAmount = subtotal * 0.05
    return sum + (subtotal + vatAmount)
  }, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-[#2B3068]" />
          <p className="text-gray-600">Loading purchase orders...</p>
        </div>
      </div>
    )
  }

  const norm = (v?: string) => (v || "").toLowerCase()
  const filteredOrders = purchaseOrders.filter((o) => {
    const q = searchTerm.trim().toLowerCase()
    let matchesSearch = true
    if (q) {
      const supplierName = o.supplier?.companyName
      const productNames = o.items?.map(item => item.product?.name).join(" ") || ""
      const dateStr = o.purchaseDate ? new Date(o.purchaseDate).toLocaleDateString() : ""
      matchesSearch = (
        norm(o.poNumber).includes(q) ||
        norm(supplierName).includes(q) ||
        norm(productNames).includes(q) ||
        norm(o.status).includes(q) ||
        norm(dateStr).includes(q)
      )
    }
    
    // Date range filtering
    let matchesDateRange = true
    if (fromDate || toDate) {
      const orderDate = new Date(o.purchaseDate)
      if (fromDate) {
        const from = new Date(fromDate)
        matchesDateRange = matchesDateRange && orderDate >= from
      }
      if (toDate) {
        const to = new Date(toDate)
        to.setHours(23, 59, 59, 999) // Include the entire end date
        matchesDateRange = matchesDateRange && orderDate <= to
      }
    }
    
    return matchesSearch && matchesDateRange
  })

  // Group filtered orders by invoice number (poNumber)
  type InvoiceGroup = {
    key: string
    invoice: string
    supplierName: string
    date: string
    status: PurchaseOrder["status"]
    totalAmount: number
    items: PurchaseOrder[]
  }

  const groupedByInvoice: InvoiceGroup[] = (() => {
    // With the new structure, each purchase order already contains multiple items
    // So we just need to map them to the display format
    return filteredOrders.map(order => ({
      key: order._id,
      invoice: order.poNumber || "N/A",
      supplierName: order.supplier?.companyName || "Unknown Supplier",
      date: order.purchaseDate || "",
      status: order.status,
      totalAmount: order.totalAmount || 0,
      items: [order], // Keep as array for compatibility with existing display logic
    })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  })()

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // PDF Generation Function
  const generatePurchaseReportPDF = async () => {
    setGeneratingPDF(true)
    try {
      // Filter orders based on PDF date range
      const pdfFilteredOrders = purchaseOrders.filter((o) => {
        let matchesDateRange = true
        if (pdfFromDate || pdfToDate) {
          const orderDate = new Date(o.purchaseDate)
          if (pdfFromDate) {
            const from = new Date(pdfFromDate)
            matchesDateRange = matchesDateRange && orderDate >= from
          }
          if (pdfToDate) {
            const to = new Date(pdfToDate)
            to.setHours(23, 59, 59, 999)
            matchesDateRange = matchesDateRange && orderDate <= to
          }
        }
        return matchesDateRange
      })

      const pdf = new jsPDF("p", "mm", "a4")
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 15

      // Load and add header image
      const headerImg = new Image()
      headerImg.crossOrigin = "anonymous"
      
      await new Promise<void>((resolve, reject) => {
        headerImg.onload = () => {
          try {
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            
            // Set canvas size to match header image aspect ratio
            const aspectRatio = headerImg.width / headerImg.height
            const headerWidth = pageWidth - (margin * 2)
            const headerHeight = headerWidth / aspectRatio
            
            canvas.width = headerImg.width
            canvas.height = headerImg.height
            
            if (ctx) {
              ctx.drawImage(headerImg, 0, 0)
              const headerImgData = canvas.toDataURL("image/png")
              pdf.addImage(headerImgData, "PNG", margin, margin, headerWidth, headerHeight)
            }
            resolve()
          } catch (err) {
            console.warn("Failed to add header image:", err)
            resolve()
          }
        }
        headerImg.onerror = () => {
          console.warn("Failed to load header image")
          resolve()
        }
        headerImg.src = "/images/purchase_page_header.jpg"
      })

      let currentY = margin + 65 // Start further below header to avoid overlap

      // Add generated date below header image
      pdf.setFontSize(10)
      pdf.setTextColor(100, 100, 100)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Generated on: ${new Date().toLocaleDateString()}`, pageWidth / 2, currentY, { align: "center" })
      currentY += 6

      // Add date range if filtering is applied
      if (pdfFromDate && pdfToDate) {
        pdf.setFontSize(10)
        pdf.setTextColor(100, 100, 100)
        pdf.setFont('helvetica', 'normal')
        pdf.text(`Date Range: ${new Date(pdfFromDate).toLocaleDateString()} to ${new Date(pdfToDate).toLocaleDateString()}`, pageWidth / 2, currentY, { align: "center" })
        currentY += 8
      } else {
        currentY += 6 // Gap before table
      }

      // Table header - Only specified columns: Date, Invoice #, Supplier, Subtotal, VAT 5%, Total
      const tableStartY = currentY
      const rowHeight = 8
      const colWidths = [30, 40, 35, 30, 25, 30] // Date, Invoice, Supplier, Subtotal, VAT, Total
      const tableWidth = colWidths.reduce((sum, width) => sum + width, 0)
      const tableX = (pageWidth - tableWidth) / 2

      // Header background
      pdf.setFillColor(43, 48, 104) // #2B3068
      pdf.rect(tableX, tableStartY, tableWidth, rowHeight, "F")

      // Header text
      pdf.setFontSize(9)
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'bold')
      
      let colX = tableX
      pdf.text("Date", colX + 2, tableStartY + 5.5)
      colX += colWidths[0]
      
      pdf.text("Invoice #", colX + 2, tableStartY + 5.5)
      colX += colWidths[1]
      
      pdf.text("Supplier", colX + 2, tableStartY + 5.5)
      colX += colWidths[2]
      
      pdf.text("Subtotal (AED)", colX + colWidths[3] - 2, tableStartY + 5.5, { align: "right" })
      colX += colWidths[3]
      
      pdf.text("VAT 5%", colX + colWidths[4] - 2, tableStartY + 5.5, { align: "right" })
      colX += colWidths[4]
      
      pdf.text("Total (AED)", colX + colWidths[5] - 2, tableStartY + 5.5, { align: "right" })

      // Table rows
      pdf.setFontSize(8)
      pdf.setTextColor(0, 0, 0)
      pdf.setFont('helvetica', 'normal')
      
      let currentRowY = tableStartY + rowHeight
      let currentPage = 1 // Track current page number
      const itemsPerPage = Math.floor((pageHeight - currentRowY - 60) / rowHeight) // Reserve space for footer
      
      // Calculate totals for summary
      let totalAmount = 0
      let totalVAT = 0
      
      pdfFilteredOrders.forEach((order, index) => {
        // Add new page if needed
        if (index > 0 && index % itemsPerPage === 0) {
          pdf.addPage()
          currentPage = pdf.getNumberOfPages()
          currentRowY = margin + 20
          
          // Repeat header on new page
          pdf.setFillColor(43, 48, 104)
          pdf.rect(tableX, currentRowY - rowHeight, tableWidth, rowHeight, "F")
          
          pdf.setFontSize(9)
          pdf.setTextColor(255, 255, 255)
          pdf.setFont('helvetica', 'bold')
          
          let headerColX = tableX
          pdf.text("Date", headerColX + 2, currentRowY - rowHeight + 5.5)
          headerColX += colWidths[0]
          pdf.text("Invoice #", headerColX + 2, currentRowY - rowHeight + 5.5)
          headerColX += colWidths[1]
          pdf.text("Supplier", headerColX + 2, currentRowY - rowHeight + 5.5)
          headerColX += colWidths[2]
          pdf.text("Subtotal (AED)", headerColX + colWidths[3] - 2, currentRowY - rowHeight + 5.5, { align: "right" })
          headerColX += colWidths[3]
          pdf.text("VAT 5%", headerColX + colWidths[4] - 2, currentRowY - rowHeight + 5.5, { align: "right" })
          headerColX += colWidths[4]
          pdf.text("Total (AED)", headerColX + colWidths[5] - 2, currentRowY - rowHeight + 5.5, { align: "right" })
          
          pdf.setFontSize(8)
          pdf.setTextColor(0, 0, 0)
          pdf.setFont('helvetica', 'normal')
        }

        // Calculate financial breakdown for each order
        const orderSubtotal = order.items?.reduce((sum, item) => {
          return sum + ((item.quantity || 0) * (item.unitPrice || 0))
        }, 0) || 0
        const orderVat = orderSubtotal * 0.05
        const orderTotal = orderSubtotal + orderVat
        
        // Accumulate totals for summary
        totalAmount += orderSubtotal
        totalVAT += orderVat

        // Alternate row background
        if (index % 2 === 0) {
          pdf.setFillColor(249, 250, 251)
          pdf.rect(tableX, currentRowY, tableWidth, rowHeight, "F")
        }

        // Row border
        pdf.setDrawColor(229, 231, 235)
        pdf.rect(tableX, currentRowY, tableWidth, rowHeight)

        // Row data
        let cellX = tableX
        
        // Date
        const orderDate = order.purchaseDate ? new Date(order.purchaseDate).toLocaleDateString() : 'N/A'
        pdf.text(orderDate, cellX + 2, currentRowY + 5.5)
        cellX += colWidths[0]
        
        // Invoice Number
        const invoiceNum = (order.poNumber || 'N/A').substring(0, 18)
        pdf.text(invoiceNum, cellX + 2, currentRowY + 5.5)
        cellX += colWidths[1]
        
        // Supplier
        const supplierName = (order.supplier?.companyName || 'Unknown').substring(0, 15)
        pdf.text(supplierName, cellX + 2, currentRowY + 5.5)
        cellX += colWidths[2]
        
        // Subtotal
        pdf.text(`${orderSubtotal.toFixed(2)}`, cellX + colWidths[3] - 2, currentRowY + 5.5, { align: "right" })
        cellX += colWidths[3]
        
        // VAT 5%
        pdf.setTextColor(0, 128, 0) // Green for VAT
        pdf.text(`${orderVat.toFixed(2)}`, cellX + colWidths[4] - 2, currentRowY + 5.5, { align: "right" })
        cellX += colWidths[4]
        
        // Total
        pdf.setTextColor(0, 0, 255) // Blue for total
        pdf.setFont('helvetica', 'bold')
        pdf.text(`${orderTotal.toFixed(2)}`, cellX + colWidths[5] - 2, currentRowY + 5.5, { align: "right" })
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(0, 0, 0) // Reset to black

        currentRowY += rowHeight
      })

      // Calculate final totals
      const totalPlusVAT = totalAmount + totalVAT
      const grandTotal = totalPlusVAT

      // Add summary section at the end of the table
      // Ensure we're on the last page where the table ended
      pdf.setPage(currentPage)
      let summaryY = currentRowY + 10 // Space after last row
      
      // Check if we need a new page for summary (reserve space for footer ~60mm)
      if (summaryY > pageHeight - 80) {
        pdf.addPage()
        summaryY = margin + 20
      }

      // Summary section - align with table columns
      const summaryRowHeight = 8
      const labelStartX = tableX
      const labelWidth = colWidths[0] + colWidths[1] + colWidths[2] // First 3 columns for label
      const subtotalColX = tableX + colWidths[0] + colWidths[1] + colWidths[2] // Start of Subtotal column
      const vatColX = subtotalColX + colWidths[3] // Start of VAT column
      const totalColX = vatColX + colWidths[4] // Start of Total column
      
      // Add a separator line
      pdf.setDrawColor(200, 200, 200)
      pdf.setLineWidth(0.5)
      pdf.line(tableX, summaryY, tableX + tableWidth, summaryY)
      summaryY += 5

      // Total Amount row
      pdf.setFillColor(245, 245, 245)
      pdf.rect(tableX, summaryY, tableWidth, summaryRowHeight, "F")
      pdf.setDrawColor(229, 231, 235)
      pdf.rect(tableX, summaryY, tableWidth, summaryRowHeight)
      pdf.setFontSize(9)
      pdf.setTextColor(0, 0, 0)
      pdf.setFont('helvetica', 'bold')
      pdf.text("Total Amount", labelStartX + 2, summaryY + 5.5)
      pdf.text(`${totalAmount.toFixed(2)}`, subtotalColX + colWidths[3] - 2, summaryY + 5.5, { align: "right" })
      summaryY += summaryRowHeight

      // Total VAT row
      pdf.setFillColor(250, 250, 250)
      pdf.rect(tableX, summaryY, tableWidth, summaryRowHeight, "F")
      pdf.setDrawColor(229, 231, 235)
      pdf.rect(tableX, summaryY, tableWidth, summaryRowHeight)
      pdf.setTextColor(0, 128, 0) // Green for VAT
      pdf.text("Total VAT", labelStartX + 2, summaryY + 5.5)
      pdf.text(`${totalVAT.toFixed(2)}`, vatColX + colWidths[4] - 2, summaryY + 5.5, { align: "right" })
      pdf.setTextColor(0, 0, 0) // Reset color
      summaryY += summaryRowHeight

      // Total + VAT row
      pdf.setFillColor(245, 245, 245)
      pdf.rect(tableX, summaryY, tableWidth, summaryRowHeight, "F")
      pdf.setDrawColor(229, 231, 235)
      pdf.rect(tableX, summaryY, tableWidth, summaryRowHeight)
      pdf.text("Total + VAT", labelStartX + 2, summaryY + 5.5)
      pdf.text(`${totalPlusVAT.toFixed(2)}`, totalColX + colWidths[5] - 2, summaryY + 5.5, { align: "right" })
      summaryY += summaryRowHeight

      // Grand Total row (highlighted)
      pdf.setFillColor(43, 48, 104) // #2B3068
      pdf.rect(tableX, summaryY, tableWidth, summaryRowHeight, "F")
      pdf.setDrawColor(43, 48, 104)
      pdf.rect(tableX, summaryY, tableWidth, summaryRowHeight)
      pdf.setFontSize(10)
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'bold')
      pdf.text("Grand Total", labelStartX + 2, summaryY + 5.5)
      pdf.text(`${grandTotal.toFixed(2)}`, totalColX + colWidths[5] - 2, summaryY + 5.5, { align: "right" })

      // Add footer image and admin signature on the last page
      // Get the actual last page number (might have changed if we added a page for summary)
      const finalPageNumber = pdf.getNumberOfPages()
      pdf.setPage(finalPageNumber)
      
      try {
        // Load and add footer image
        const footerImg = new Image()
        footerImg.crossOrigin = "anonymous"
        
        await new Promise<void>((footerResolve, footerReject) => {
          footerImg.onload = async () => {
            try {
              const footerCanvas = document.createElement('canvas')
              const footerCtx = footerCanvas.getContext('2d')
              
              // Set canvas size to match footer image aspect ratio
              const footerAspectRatio = footerImg.width / footerImg.height
              const footerWidth = pageWidth - (margin * 2)
              const footerHeight = footerWidth / footerAspectRatio
              
              footerCanvas.width = footerImg.width
              footerCanvas.height = footerImg.height
              
              if (footerCtx) {
                footerCtx.drawImage(footerImg, 0, 0)
                const footerImgData = footerCanvas.toDataURL("image/png")
                
                const footerY = pageHeight - margin - footerHeight
                pdf.addImage(footerImgData, "PNG", margin, footerY, footerWidth, footerHeight)
                
                // Add admin signature on bottom right of footer image
                if (adminSignature) {
                  try {
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
                              const brightness = (r + g + b) / 3
                              
                              // If pixel is too bright (white/light), make it transparent
                              if (brightness > 200) {
                                data[i + 3] = 0 // Set alpha to 0 (transparent)
                              }
                            }
                            
                            // Put the modified image data back
                            sigCtx.putImageData(imageData, 0, 0)
                            
                            const sigImgData = sigCanvas.toDataURL("image/png")
                            
                            // Position signature on bottom right of footer
                            const sigWidth = 30
                            const sigHeight = 30 / aspectRatio
                            const sigX = pageWidth - margin - sigWidth - 8
                            const sigY = footerY + footerHeight - sigHeight - 8
                            
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
                    pdf.setFont('helvetica', 'bold')
                    pdf.text("Admin Signature", pageWidth - margin - 30, footerY + footerHeight - 8, { align: "center" })
                  }
                } else {
                  // Add text-based admin signature
                  pdf.setFontSize(8)
                  pdf.setTextColor(43, 48, 104) // #2B3068
                  pdf.setFont('helvetica', 'bold')
                  pdf.text("Admin Signature", pageWidth - margin - 30, footerY + footerHeight - 8, { align: "center" })
                  console.log("No admin signature found in localStorage")
                }
              }
              footerResolve()
            } catch (err) {
              console.warn("Failed to add footer image:", err)
              footerReject(err)
            }
          }
          footerImg.onerror = () => {
            console.warn("Failed to load footer image")
            // Add text-based admin signature fallback
            pdf.setFontSize(10)
            pdf.setTextColor(43, 48, 104) // #2B3068
            pdf.setFont('helvetica', 'bold')
            pdf.text("Admin Signature", pageWidth - margin - 30, pageHeight - 20, { align: "center" })
            footerReject(new Error("Failed to load footer"))
          }
          footerImg.src = "/images/footer_without_received.jpg"
        })
      } catch (footerError) {
        console.warn("Footer processing failed:", footerError)
        // Add text-based admin signature fallback
        pdf.setFontSize(10)
        pdf.setTextColor(43, 48, 104) // #2B3068
        pdf.setFont('helvetica', 'bold')
        pdf.text("Admin Signature", pageWidth - margin - 30, pageHeight - 20, { align: "center" })
      }

      // Generate filename with date range
      const dateRange = pdfFromDate && pdfToDate ? `_${pdfFromDate}_to_${pdfToDate}` : `_${new Date().toISOString().split('T')[0]}`
      const filename = `Purchase_Orders_Report${dateRange}.pdf`
      
      pdf.save(filename)
      setShowPDFDatePopup(false) // Close popup after generating PDF
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert('Failed to generate PDF report')
    } finally {
      setGeneratingPDF(false)
    }
  }

  // Read-only status display in child rows (no inline updates)

  return (
    <div className="pt-6 lg:pt-0 space-y-6 sm:space-y-8">
      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-red-700 text-sm break-words">{error}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setError("")}
            className="text-red-600 border-red-300 flex-shrink-0"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Header Section */}
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-2 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 flex items-center gap-2 sm:gap-3">
              <ShoppingCart className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 flex-shrink-0" />
              <span className="truncate">Purchase Management</span>
            </h1>
            <p className="text-white/80 text-sm sm:text-base lg:text-lg">Create and manage your purchase orders</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 w-full sm:w-auto">
            <Button
              onClick={() => {
                console.log("Manual refresh triggered")
                fetchData()
              }}
              variant="outline"
              className="bg-white/10 text-white border-white/20 hover:bg-white/20 font-semibold px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base rounded-lg sm:rounded-xl transition-all duration-300 w-full sm:w-auto"
            >
              <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              Refresh
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={resetForm}
                  className="bg-white text-[#2B3068] hover:bg-white/90 font-semibold px-4 sm:px-6 lg:px-8 py-2 sm:py-3 lg:py-4 text-sm sm:text-base lg:text-lg rounded-lg sm:rounded-xl shadow-lg transition-all duration-300 hover:scale-105 w-full sm:w-auto"
                >
                  <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                  New Purchase Order
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto mx-auto">
              <DialogHeader className="pb-4 sm:pb-6">
                <DialogTitle className="text-xl sm:text-2xl font-bold text-[#2B3068] flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6" />
                  <span className="truncate">{editingOrder ? "Edit Purchase Order" : "New Purchase Order"}</span>
                </DialogTitle>
                <div className="sr-only">
                  {editingOrder ? "Edit an existing purchase order" : "Create a new purchase order with supplier, product, and quantity details"}
                </div>
              </DialogHeader>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 mb-4">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-red-700 text-sm break-words">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 overflow-x-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div className="space-y-2 sm:space-y-3">
                    <Label htmlFor="supplier" className="text-sm font-semibold text-gray-700">
                      Supplier *
                    </Label>
                    <Select
                      value={formData.supplierId}
                      onValueChange={(value) => setFormData({ ...formData, supplierId: value })}
                    >
                      <SelectTrigger className="h-10 sm:h-12 border-2 border-gray-200 rounded-lg sm:rounded-xl focus:border-[#2B3068] transition-colors">
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((supplier) => (
                          <SelectItem key={supplier._id} value={supplier._id}>
                            {supplier.companyName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 sm:space-y-3">
                    <Label htmlFor="invoiceNumber" className="text-sm font-semibold text-gray-700">
                      Invoice Number *
                    </Label>
                    <Input
                      id="invoiceNumber"
                      type="text"
                      value={formData.invoiceNumber}
                      onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                      className="h-10 sm:h-12 border-2 border-gray-200 rounded-lg sm:rounded-xl focus:border-[#2B3068] transition-colors"
                      required
                      disabled={!!editingOrder}
                      placeholder="Enter supplier invoice number"
                    />
                  </div>

                  <div className="space-y-2 sm:space-y-3">
                    <Label htmlFor="purchaseDate" className="text-sm font-semibold text-gray-700">
                      Purchase Date *
                    </Label>
                    <Input
                      id="purchaseDate"
                      type="date"
                      value={formData.purchaseDate}
                      onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                      className="h-10 sm:h-12 border-2 border-gray-200 rounded-lg sm:rounded-xl focus:border-[#2B3068] transition-colors"
                      required
                    />
                  </div>
                </div>

                {/* Items Section: Single entry form (2x2) and items table below */}
                <div className="space-y-4">
                  <Label className="text-sm font-semibold text-gray-700">Items *</Label>
                  {/* 2x2 grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Purchase Type *</Label>
                      <Select
                        value={currentItem.purchaseType}
                        onValueChange={(value: "gas" | "cylinder") => {
                          setCurrentItem((ci) => ({ ...ci, purchaseType: value, productId: "", cylinderStatus: "empty", gasType: "", emptyCylinderId: "" }))
                          setProductSearchTerm("")
                          setShowProductSuggestions(false)
                          setCylinderSearchTerm("")
                          setShowCylinderSuggestions(false)
                        }}
                      >
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gas">Gas</SelectItem>
                          <SelectItem value="cylinder">Cylinder</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {currentItem.purchaseType === "cylinder" && (
                      <div className="space-y-2">
                        <Label>Cylinder Status *</Label>
                        <Select
                          value={currentItem.cylinderStatus || "empty"}
                          onValueChange={(value: "empty" | "full") =>
                            setCurrentItem((ci) => ({ ...ci, cylinderStatus: value }))
                          }
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="empty">Empty</SelectItem>
                            <SelectItem value="full">Full</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-2 relative">
                      <Label>{currentItem.purchaseType === 'cylinder' ? 'Select Cylinder *' : 'Product *'}</Label>
                      <Input
                        value={productSearchTerm}
                        onChange={(e) => {
                          const v = e.target.value
                          setProductSearchTerm(v)
                          setShowProductSuggestions(v.trim().length > 0)
                        }}
                        onFocus={() => setShowProductSuggestions((productSearchTerm || '').trim().length > 0)}
                        onBlur={() => setTimeout(() => setShowProductSuggestions(false), 150)}
                        placeholder={currentItem.purchaseType === 'cylinder' ? 'Type to search cylinders...' : 'Type to search product'}
                        className="h-10 product-search-input"
                      />
                      {showProductSuggestions && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-auto product-suggestions">
                          {(products.filter(p => p.category === currentItem.purchaseType)
                            .filter(p => productSearchTerm.trim().length === 0 ? true : p.name.toLowerCase().includes(productSearchTerm.toLowerCase()))
                          ).slice(0, 8).map((p) => (
                            <button
                              type="button"
                              key={p._id}
                              onClick={() => {
                                setCurrentItem((ci) => ({
                                  ...ci,
                                  productId: p._id,
                                  productCode: (p as any).productCode,
                                  unitPrice: (p.costPrice ?? '').toString(),
                                  cylinderStatus: ci.purchaseType === 'cylinder' ? (ci.cylinderStatus || 'empty') : undefined,
                                }))
                                setProductSearchTerm(p.name)
                                setShowProductSuggestions(false)
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                            >
                              <div className="font-medium text-gray-800">{p.name}</div>
                              <div className="text-xs text-gray-500">AED {p.costPrice?.toFixed ? p.costPrice.toFixed(2) : p.costPrice}</div>
                            </button>
                          ))}
                          {(products.filter(p => p.category === currentItem.purchaseType && p.name.toLowerCase().includes(productSearchTerm.toLowerCase()))).length === 0 && (
                            <div className="px-3 py-2 text-sm text-gray-500">No products found</div>
                          )}
                        </div>
                      )}
                    </div>
                    {currentItem.purchaseType === "cylinder" && null}
                    
                    {currentItem.purchaseType === "gas" && (
                      <div className="space-y-2 relative">
                        <Label>Empty Cylinder Name *</Label>
                        <Input
                          type="text"
                          placeholder="Type to search empty cylinders..."
                          value={cylinderSearchTerm}
                          onChange={(e) => {
                            setCylinderSearchTerm(e.target.value)
                            setShowCylinderSuggestions(true)
                          }}
                          onFocus={() => setShowCylinderSuggestions(true)}
                          className="h-10 cylinder-search-input"
                        />
                        {showCylinderSuggestions && (
                          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-auto cylinder-suggestions">
                            {inventoryItems
                              .filter(ii => ii.category === 'cylinder' && (ii.availableEmpty ?? 0) > 0)
                              .filter(ii => {
                                const name = products.find(p => p._id === ii.productId)?.name || ii.productName || ''
                                return cylinderSearchTerm.trim().length === 0 ? true : name.toLowerCase().includes(cylinderSearchTerm.toLowerCase())
                              })
                              .slice(0, 8)
                              .map(ii => {
                                const prod = products.find(p => p._id === ii.productId)
                                const name = prod?.name || ii.productName || 'Unknown Cylinder'
                                return (
                                  <button
                                    type="button"
                                    key={ii._id}
                                    onClick={() => {
                                      setCurrentItem((ci) => ({
                                        ...ci,
                                        emptyCylinderId: (ii.productId || ''),
                                      }))
                                      setCylinderSearchTerm(name)
                                      setShowCylinderSuggestions(false)
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                                  >
                                    <div className="font-medium text-gray-800">{name}</div>
                                    <div className="text-xs text-gray-500">Empty available: {ii.availableEmpty ?? 0}</div>
                                  </button>
                                )
                              })}
                            {inventoryItems.filter(ii => {
                              if (!(ii.category === 'cylinder' && (ii.availableEmpty ?? 0) > 0)) return false
                              const name = products.find(p => p._id === ii.productId)?.name || ii.productName || ''
                              return name.toLowerCase().includes(cylinderSearchTerm.toLowerCase())
                            }).length === 0 && (
                              <div className="px-3 py-2 text-sm text-gray-500">No empty cylinders found</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {currentItem.purchaseType === "cylinder" && (
                      <>
                        {currentItem.cylinderStatus === "full" && (
                          <div className="space-y-2 relative">
                            <Label>Gas Type *</Label>
                            <Input
                              type="text"
                              placeholder="Type to search gas products..."
                              value={gasSearchTerm}
                              onChange={(e) => {
                                setGasSearchTerm(e.target.value)
                                setShowGasSuggestions(true)
                              }}
                              onFocus={() => setShowGasSuggestions(true)}
                              className="h-10"
                            />
                            {showGasSuggestions && (
                              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-auto">
                                {products
                                  .filter(p => p.category === 'gas')
                                  .filter(p => gasSearchTerm.trim().length === 0 ? true : p.name.toLowerCase().includes(gasSearchTerm.toLowerCase()))
                                  .slice(0, 8)
                                  .map(gp => (
                                    <button
                                      type="button"
                                      key={gp._id}
                                      onClick={() => {
                                        setCurrentItem(ci => ({ ...ci, gasType: gp.name }))
                                        setGasSearchTerm(gp.name)
                                        setShowGasSuggestions(false)
                                      }}
                                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                                    >
                                      <div className="font-medium text-gray-800">{gp.name}</div>
                                    </button>
                                  ))}
                                {products.filter(p => p.category === 'gas' && p.name.toLowerCase().includes(gasSearchTerm.toLowerCase())).length === 0 && (
                                  <div className="px-3 py-2 text-sm text-gray-500">No gas products found</div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                    <div className="space-y-2">
                      <Label>Quantity *</Label>
                      <Input
                        type="number"
                        min="1"
                        value={currentItem.quantity}
                        onChange={(e) => setCurrentItem((ci) => ({ ...ci, quantity: e.target.value }))}
                        placeholder="Enter quantity"
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit Price (AED)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={currentItem.unitPrice}
                        onChange={(e) => setCurrentItem((ci) => ({ ...ci, unitPrice: e.target.value }))}
                        placeholder="Enter unit price"
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>VAT 5%</Label>
                      <Input
                        type="text"
                        value={`AED ${(((Number(currentItem.quantity) || 0) * (Number(currentItem.unitPrice) || 0)) * 0.05).toFixed(2)}`}
                        readOnly
                        className="h-10 bg-gray-50 text-gray-700"
                        placeholder="VAT will be calculated"
                      />
                    </div>
                  </div>

                  {/* Add/Update button below fields */}
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => {
                        if (editingItemIndex !== null) {
                          // Update the item at editing index
                          if (!currentItem.productId || !currentItem.quantity) {
                            setError("Please select product and enter quantity before updating")
                            return
                          }
                          const newItems = [...formData.items]
                          newItems.splice(editingItemIndex, 0, {
                            purchaseType: currentItem.purchaseType,
                            productId: currentItem.productId,
                            quantity: currentItem.quantity,
                            unitPrice: currentItem.unitPrice,
                            cylinderStatus: currentItem.purchaseType === 'cylinder' ? (currentItem.cylinderStatus || 'empty') : undefined,
                            gasType: currentItem.purchaseType === 'cylinder' && currentItem.cylinderStatus === 'full' ? currentItem.gasType : undefined,
                            emptyCylinderId: currentItem.purchaseType === 'gas' ? currentItem.emptyCylinderId : undefined,
                          })
                          setFormData({ ...formData, items: newItems })
                          setEditingItemIndex(null)
                          setCurrentItem({ purchaseType: currentItem.purchaseType, productId: "", quantity: "", unitPrice: "", cylinderStatus: "empty", gasType: "", emptyCylinderId: "" })
                          setProductSearchTerm("")
                          setCylinderSearchTerm("")
                        } else {
                          addItem()
                        }
                      }}
                      variant="outline"
                      className="text-[#2B3068] border-[#2B3068] hover:bg-[#2B3068] hover:text-white"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      {editingItemIndex !== null ? 'Update Item' : 'Add Item'}
                    </Button>
                  </div>

                  {/* Items table */}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Unit Price (AED)</TableHead>
                          <TableHead>Subtotal (AED)</TableHead>
                          <TableHead>VAT 5%</TableHead>
                          <TableHead>Total (AED)</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {formData.items.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-gray-500">No items added yet</TableCell>
                          </TableRow>
                        )}
                        {formData.items.map((it, idx) => {
                          const p = products.find(p => p._id === it.productId)
                          const qty = Number(it.quantity) || 0
                          const up = Number(it.unitPrice) || 0
                          const subtotal = qty * up
                          const vatAmount = subtotal * 0.05
                          const totalWithVat = subtotal + vatAmount
                          return (
                            <TableRow key={idx}>
                              <TableCell className="whitespace-nowrap">{it.purchaseType}</TableCell>
                              <TableCell className="max-w-[220px] truncate">{p?.name || 'Product'}{it.purchaseType === 'cylinder' && it.cylinderStatus ? ` (${it.cylinderStatus}${it.cylinderStatus === 'full' && it.gasType ? ` - ${it.gasType}` : ''})` : ''}</TableCell>
                              <TableCell>{qty}</TableCell>
                              <TableCell>AED {up.toFixed(2)}</TableCell>
                              <TableCell className="font-medium">AED {subtotal.toFixed(2)}</TableCell>
                              <TableCell className="text-green-600 font-medium">AED {vatAmount.toFixed(2)}</TableCell>
                              <TableCell className="font-semibold text-blue-600">AED {totalWithVat.toFixed(2)}</TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      // Load into current inputs and remove from list for editing
                                      setCurrentItem({
                                        purchaseType: it.purchaseType as any,
                                        productId: it.productId,
                                        quantity: it.quantity,
                                        unitPrice: it.unitPrice,
                                        cylinderStatus: (it as any).cylinderStatus || "empty",
                                        gasType: (it as any).gasType || "",
                                        emptyCylinderId: (it as any).emptyCylinderId || "",
                                      })
                                      setProductSearchTerm(p?.name || '')
                                      
                                      // Set cylinder search term if it's a gas purchase
                                      if (it.purchaseType === 'gas' && it.emptyCylinderId) {
                                        const cylinderName = products.find(prod => prod._id === it.emptyCylinderId)?.name || ""
                                        setCylinderSearchTerm(cylinderName)
                                      }
                                      
                                      const remaining = formData.items.filter((_, i) => i !== idx)
                                      setFormData({ ...formData, items: remaining })
                                      setEditingItemIndex(idx)
                                    }}
                                    className="text-[#2B3068] border-[#2B3068] hover:bg-[#2B3068] hover:text-white"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => removeItem(idx)}
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Total Amount Display with Breakdown */}
                {totalAmount > 0 && (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-blue-200">
                    <div className="space-y-2">
                      {/* Subtotal */}
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600">Subtotal:</span>
                        <span className="text-sm font-semibold text-gray-700">
                          AED {(formData.items.reduce((sum, item) => {
                            const quantity = Number(item.quantity) || 0;
                            const unitPrice = Number(item.unitPrice) || 0;
                            return sum + (quantity * unitPrice);
                          }, 0)).toFixed(2)}
                        </span>
                      </div>
                      
                      {/* VAT */}
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-600">VAT (5%):</span>
                        <span className="text-sm font-semibold text-gray-700">
                          AED {(formData.items.reduce((sum, item) => {
                            const quantity = Number(item.quantity) || 0;
                            const unitPrice = Number(item.unitPrice) || 0;
                            const subtotal = quantity * unitPrice;
                            return sum + (subtotal * 0.05);
                          }, 0)).toFixed(2)}
                        </span>
                      </div>
                      
                      {/* Separator */}
                      <div className="border-t border-blue-200 pt-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm sm:text-lg font-semibold text-gray-700">Total Amount:</span>
                          <span className="text-lg sm:text-2xl font-bold text-[#2B3068]">AED {totalAmount.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2 sm:space-y-3">
                  <Label htmlFor="notes" className="text-sm font-semibold text-gray-700">
                    Notes (optional)
                  </Label>
                  <Textarea
                    id="notes"
                    placeholder="Additional notes..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="min-h-[80px] sm:min-h-[100px] border-2 border-gray-200 rounded-lg sm:rounded-xl focus:border-[#2B3068] transition-colors resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 sm:h-14 text-base sm:text-lg font-semibold bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] hover:from-[#1a1f4a] hover:to-[#2B3068] rounded-lg sm:rounded-xl shadow-lg transition-all duration-300"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 mr-2 animate-spin" />
                      {editingOrder ? "Updating..." : "Creating..."}
                    </>
                  ) : (
                    <>{editingOrder ? "Update Order" : "Submit"}</>
                  )}
                </Button>
              </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Purchase Orders Table */}
      <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
            <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold flex items-center gap-2 flex-1">
              Purchase Orders
              <Badge variant="secondary" className="bg-white/20 text-white ml-2 text-xs sm:text-sm">
                {filteredOrders.length}/{purchaseOrders.length} orders
              </Badge>
            </CardTitle>
            <div className="flex flex-col lg:flex-row gap-2 lg:gap-4">
              {/* Search Input */}
              <div className="bg-white rounded-xl p-2 flex items-center gap-2 w-full lg:w-80">
                <Input
                  placeholder="Search INV, supplier, product, status, date..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 text-gray-800"
                />
              </div>
              
              {/* Date Filters & PDF Download */}
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={() => setShowDateFilters(!showDateFilters)}
                  variant="outline"
                  className="bg-white/10 text-white border-white/20 hover:bg-white/20 font-semibold px-4 py-2 text-sm rounded-lg transition-all duration-300"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  {showDateFilters ? 'Hide Filters' : 'Date Filter'}
                </Button>
                
                <Button
                  onClick={() => setShowPDFDatePopup(true)}
                  disabled={generatingPDF}
                  variant="outline"
                  className="bg-white/10 text-white border-white/20 hover:bg-white/20 font-semibold px-4 py-2 text-sm rounded-lg transition-all duration-300"
                >
                  {generatingPDF ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Download PDF
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        
        {/* Date Range Filters */}
        {showDateFilters && (
          <div className="bg-gray-50 border-b border-gray-200 p-4">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1">
                <Label htmlFor="fromDate" className="text-sm font-medium text-gray-700 mb-2 block">
                  From Date
                </Label>
                <Input
                  id="fromDate"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="toDate" className="text-sm font-medium text-gray-700 mb-2 block">
                  To Date
                </Label>
                <Input
                  id="toDate"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setFromDate('')
                    setToDate('')
                  }}
                  variant="outline"
                  size="sm"
                  className="text-gray-600 border-gray-300 hover:bg-gray-100"
                >
                  Clear
                </Button>
              </div>
            </div>
            {(fromDate || toDate) && (
              <div className="mt-3 text-sm text-gray-600">
                <span className="font-medium">Filtered Results:</span> {filteredOrders.length} of {purchaseOrders.length} orders
                {fromDate && toDate && (
                  <span className="ml-2">({new Date(fromDate).toLocaleDateString()} - {new Date(toDate).toLocaleDateString()})</span>
                )}
              </div>
            )}
          </div>
        )}
        
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 border-b-2 border-gray-200">
                  <TableHead className="font-bold text-gray-700 p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap"> </TableHead>
                  <TableHead className="font-bold text-gray-700 p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap">INV Number</TableHead>
                  <TableHead className="font-bold text-gray-700 p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap">Supplier</TableHead>
                  <TableHead className="font-bold text-gray-700 p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap">Date</TableHead>
                  <TableHead className="font-bold text-gray-700 p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap">Items</TableHead>
                  <TableHead className="font-bold text-gray-700 p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap">Subtotal (AED)</TableHead>
                  <TableHead className="font-bold text-gray-700 p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap">VAT 5%</TableHead>
                  <TableHead className="font-bold text-gray-700 p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap">Total (AED)</TableHead>
                  <TableHead className="font-bold text-gray-700 p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap">Status</TableHead>
                  <TableHead className="font-bold text-gray-700 p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedByInvoice.map((group) => (
                  <Fragment key={group.key}>
                    <TableRow key={`parent-${group.key}`} className="hover:bg-gray-50 transition-colors border-b border-gray-100">
                      <TableCell className="p-2 sm:p-4 w-8">
                        <button
                          type="button"
                          aria-label={expandedGroups[group.key] ? "Collapse" : "Expand"}
                          onClick={() => toggleGroup(group.key)}
                          className="p-1 rounded hover:bg-gray-100"
                        >
                          {expandedGroups[group.key] ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="font-semibold text-[#2B3068] p-2 sm:p-4 text-xs sm:text-sm">{group.invoice}</TableCell>
                      <TableCell className="p-2 sm:p-4 text-xs sm:text-sm max-w-[160px] truncate">{group.supplierName}</TableCell>
                      <TableCell className="p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap">{group.date ? new Date(group.date).toLocaleDateString() : "N/A"}</TableCell>
                      <TableCell className="p-2 sm:p-4 text-xs sm:text-sm">{group.items[0]?.items?.length || 0}</TableCell>
                      {(() => {
                        // Calculate financial breakdown for the invoice
                        const invoiceSubtotal = group.items[0]?.items?.reduce((sum, item) => {
                          return sum + ((item.quantity || 0) * (item.unitPrice || 0))
                        }, 0) || 0
                        const invoiceVat = invoiceSubtotal * 0.05
                        const invoiceTotal = invoiceSubtotal + invoiceVat
                        
                        return (
                          <>
                            <TableCell className="p-2 sm:p-4 font-medium text-xs sm:text-sm">AED {invoiceSubtotal.toFixed(2)}</TableCell>
                            <TableCell className="p-2 sm:p-4 font-medium text-green-600 text-xs sm:text-sm">AED {invoiceVat.toFixed(2)}</TableCell>
                            <TableCell className="p-2 sm:p-4 font-semibold text-blue-600 text-xs sm:text-sm">AED {invoiceTotal.toFixed(2)}</TableCell>
                          </>
                        )
                      })()}
                      <TableCell className="p-2 sm:p-4">
                        <Badge
                          variant={
                            group.status === "completed"
                              ? "default"
                              : group.status === "pending"
                                ? "secondary"
                                : "destructive"
                          }
                          className={`${
                            group.status === "completed"
                              ? "bg-green-600"
                              : group.status === "pending"
                                ? "bg-yellow-700"
                                : "bg-red-800"
                          } text-white font-medium px-2 py-1 rounded-full text-xs`}
                        >
                          {group.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-2 sm:p-4">
                        {/* Intentionally left actions at item level within expanded rows */}
                      </TableCell>
                    </TableRow>
                    {expandedGroups[group.key] && (
                      <TableRow key={`children-${group.key}`} className="bg-gray-50/50">
                        <TableCell colSpan={10} className="p-0">
                          <div className="px-4 py-3">
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-white">
                                    <TableHead className="text-xs sm:text-sm">Product</TableHead>
                                    <TableHead className="text-xs sm:text-sm">Type</TableHead>
                                    <TableHead className="text-xs sm:text-sm">Cylinder Status</TableHead>
                                    <TableHead className="text-xs sm:text-sm">Qty</TableHead>
                                    <TableHead className="text-xs sm:text-sm">Unit Price (AED)</TableHead>
                                    <TableHead className="text-xs sm:text-sm">Subtotal (AED)</TableHead>
                                    <TableHead className="text-xs sm:text-sm">VAT 5%</TableHead>
                                    <TableHead className="text-xs sm:text-sm">Total (AED)</TableHead>
                                    <TableHead className="text-xs sm:text-sm">Status</TableHead>
                                    <TableHead className="text-xs sm:text-sm">Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {group.items[0]?.items?.map((item, itemIndex) => {
                                    const itemSubtotal = (item.quantity || 0) * (item.unitPrice || 0)
                                    const itemVat = itemSubtotal * 0.05
                                    const itemTotalWithVat = itemSubtotal + itemVat
                                    return (
                                    <TableRow key={`${group.items[0]._id}-${itemIndex}`} className="border-b">
                                      <TableCell className="text-xs sm:text-sm max-w-[220px] truncate">{item.product?.name || "Unknown Product"}</TableCell>
                                      <TableCell className="text-xs sm:text-sm whitespace-nowrap">{item.purchaseType}</TableCell>
                                      <TableCell className="text-xs sm:text-sm whitespace-nowrap">{item.purchaseType === 'cylinder' && item.cylinderStatus ? item.cylinderStatus : '-'}</TableCell>
                                      <TableCell className="text-xs sm:text-sm">{item.quantity || 0}</TableCell>
                                      <TableCell className="font-semibold text-xs sm:text-sm">AED {item.unitPrice?.toFixed(2) || "0.00"}</TableCell>
                                      <TableCell className="font-medium text-xs sm:text-sm">AED {itemSubtotal.toFixed(2)}</TableCell>
                                      <TableCell className="text-green-600 font-medium text-xs sm:text-sm">AED {itemVat.toFixed(2)}</TableCell>
                                      <TableCell className="font-semibold text-blue-600 text-xs sm:text-sm">AED {itemTotalWithVat.toFixed(2)}</TableCell>
                                      <TableCell className="text-xs sm:text-sm">
                                        <Badge
                                          variant={
                                            group.items[0].status === "completed"
                                              ? "default"
                                              : group.items[0].status === "pending"
                                                ? "secondary"
                                                : "destructive"
                                          }
                                          className={`${
                                            group.items[0].status === "completed"
                                              ? "bg-green-600"
                                              : group.items[0].status === "pending"
                                                ? "bg-yellow-100"
                                                : "bg-red-100"
                                          } text-white font-medium px-2 py-1 rounded-full text-xs`}
                                        >
                                          {group.items[0].status}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        {itemIndex === 0 && (
                                          <div className="flex space-x-1 sm:space-x-2">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handleEdit(group.items[0])}
                                              className="border-[#2B3068] text-[#2B3068] hover:bg-[#2B3068] hover:text-white transition-colors p-1 sm:p-2"
                                            >
                                              <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                                            </Button>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handleDelete(group.items[0]._id)}
                                              className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors p-1 sm:p-2"
                                            >
                                              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                                            </Button>
                                          </div>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                    )
                                  }) || []}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
                {groupedByInvoice.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 sm:py-12">
                      <div className="text-gray-500">
                        <PackageIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p className="text-base sm:text-lg font-medium">No purchase orders found</p>
                        <p className="text-sm">Create your first purchase order to get started</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* PDF Date Range Popup */}
      <Dialog open={showPDFDatePopup} onOpenChange={setShowPDFDatePopup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[#2B3068] flex items-center gap-2">
              <Download className="w-5 h-5" />
              Download PDF Report
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pdfFromDate" className="text-sm font-medium text-gray-700">
                From Date (Optional)
              </Label>
              <Input
                id="pdfFromDate"
                type="date"
                value={pdfFromDate}
                onChange={(e) => setPdfFromDate(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pdfToDate" className="text-sm font-medium text-gray-700">
                To Date (Optional)
              </Label>
              <Input
                id="pdfToDate"
                type="date"
                value={pdfToDate}
                onChange={(e) => setPdfToDate(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="text-xs text-gray-500">
              Leave dates empty to include all purchase orders
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowPDFDatePopup(false)}
              className="text-gray-600 border-gray-300 hover:bg-gray-100"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setPdfFromDate('')
                setPdfToDate('')
              }}
              variant="outline"
              className="text-gray-600 border-gray-300 hover:bg-gray-100"
            >
              Clear Dates
            </Button>
            <Button
              onClick={generatePurchaseReportPDF}
              disabled={generatingPDF}
              className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white"
            >
              {generatingPDF ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Generate PDF
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
