"use client"

import { useState, useEffect, type FormEvent } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Package, DollarSign, FileText, Edit, Trash2, Receipt, Search, Filter } from "lucide-react"
import { toast } from "sonner"
import { ReceiptDialog } from '@/components/receipt-dialog'
import { SignatureDialog } from '@/components/signature-dialog'
import SecuritySelectDialog from '@/components/security-select-dialog'
import jsPDF from 'jspdf'

interface EmployeeCylinderSalesProps {
  user: { id: string; email: string; name: string }
}

interface Customer {
  _id: string
  name: string
  serialNumber?: string
  email: string
  phone: string
  address?: string
  trNumber?: string
}

interface Supplier {
  _id: string
  companyName: string
  contactPerson?: string
  phone?: string
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

interface CylinderTransaction {
  _id: string
  type: string
  invoiceNumber?: string
  customer: Customer
  supplier?: Supplier
  product?: Product
  cylinderSize: string
  quantity: number
  amount: number
  depositAmount: number
  refillAmount: number
  returnAmount: number
  // New: align with admin form
  paymentOption?: 'debit' | 'credit' | 'delivery_note'
  paymentMethod: string
  cashAmount: number
  bankName: string
  checkNumber: string
  status: string
  notes: string
  createdAt: string
  securityAmount?: number // Added for optional use
  linkedDeposit?: string
  // Multi-items
  items?: Array<{
    productId: string
    productName?: string
    cylinderSize: string
    quantity: number
    amount: number
  }>
}

// Cylinder size mapping for display
const CYLINDER_SIZE_MAPPING = {
  small: "5kg",
  large: "45kg"
}

const CYLINDER_SIZE_DISPLAY = {
  "5kg": "small",
  "45kg": "large"
}

export function EmployeeCylinderSales({ user }: EmployeeCylinderSalesProps) {
  const [transactions, setTransactions] = useState<CylinderTransaction[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [stockAssignments, setStockAssignments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false)
  const [filteredSearchSuggestions, setFilteredSearchSuggestions] = useState<Customer[]>([])
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null)

  // Export filters state (date range + customer autocomplete)
  const [exportStart, setExportStart] = useState<string>("")
  const [exportEnd, setExportEnd] = useState<string>("")
  const [exportCustomerId, setExportCustomerId] = useState<string>("")
  const [exportCustomerSearch, setExportCustomerSearch] = useState<string>("")
  const [exportSuggestions, setExportSuggestions] = useState<Customer[]>([])
  // Toggle for showing export inputs (align with admin page behavior)
  const [showExportInput, setShowExportInput] = useState(false)

  // Receipt and signature dialog states
  const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false)
  const [isSignatureDialogOpen, setIsSignatureDialogOpen] = useState(false)
  const [transactionForReceipt, setTransactionForReceipt] = useState<any | null>(null)
  const [transactionForSignature, setTransactionForSignature] = useState<any | null>(null)

  // Previous security dialog state
  const [showSecurityDialog, setShowSecurityDialog] = useState(false)
  const [securityRecords, setSecurityRecords] = useState<any[]>([])
  const [securityPrompted, setSecurityPrompted] = useState(false)

  // Modern stock validation dialog
  const [stockAlert, setStockAlert] = useState<{
    open: boolean;
    productName?: string;
    size?: string;
    available?: number;
    requested?: number;
  }>({ open: false })

  // Admin-style popup state
  const [showStockValidationPopup, setShowStockValidationPopup] = useState(false)
  const [stockValidationMessage, setStockValidationMessage] = useState("")
  const [userInteractedWithPopup, setUserInteractedWithPopup] = useState(false)

  // Customer search state
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false)
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([])

  // Product autocomplete state (per item)
  const [productSearchTerms, setProductSearchTerms] = useState<string[]>([])
  const [showProductSuggestions, setShowProductSuggestions] = useState<boolean[]>([])

  // Single-entry draft item state (2x2 form)
  const [draftItem, setDraftItem] = useState<{ productId: string; productName: string; cylinderSize: string; quantity: number; amount: number }>({
    productId: "",
    productName: "",
    cylinderSize: "",
    quantity: 1,
    amount: 0,
  })
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [draftProductSearchTerm, setDraftProductSearchTerm] = useState("")
  const [showDraftProductSuggestions, setShowDraftProductSuggestions] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    type: "deposit",
    customer: "",
    supplier: "",
    product: "",
    cylinderSize: "small",
    quantity: 1,
    amount: 0,
    depositAmount: 0,
    refillAmount: 0,
    returnAmount: 0,
    // New: aligns with admin page behavior
    paymentOption: "debit" as "debit" | "credit" | "delivery_note",
    paymentMethod: "cash",
    cashAmount: 0,
    bankName: "",
    checkNumber: "",
    status: "pending",
    notes: "",
    securityAmount: 0, // Added for security deposit
    linkedDeposit: "",
    // Multi-items
    items: [] as Array<{
      productId: string
      productName: string
      cylinderSize: string
      quantity: number
      amount: number
    }>
  })

  // Helpers for items management (similar to admin page)
  const getProductById = (id: string) => products.find(p => p._id === id)

  const addItem = () => {
    // Add current draft item to items or save edit
    if (!draftItem.productId || (Number(draftItem.quantity) || 0) <= 0) {
      toast.error('Please select product and quantity')
      return
    }
    // Validate against assigned stock
    const available = getAssignedAvailableFor(draftItem.productId, draftItem.cylinderSize || '')
    if (available < (Number(draftItem.quantity) || 0)) {
      setStockValidationMessage(`You requested ${draftItem.quantity} unit(s). Only ${available} unit(s) are available in your assigned inventory.`)
      setShowStockValidationPopup(true)
      return
    }
    setFormData(prev => {
      const items = [...prev.items]
      if (editingIndex !== null) {
        items[editingIndex] = { ...draftItem, amount: Number(draftItem.amount) || 0 }
      } else {
        items.push({ ...draftItem, amount: Number(draftItem.amount) || 0 })
      }
      return { ...prev, items }
    })
    // Reset draft
    setDraftItem({ productId: "", productName: "", cylinderSize: "", quantity: 1, amount: 0 })
    setDraftProductSearchTerm("")
    setShowDraftProductSuggestions(false)
    setEditingIndex(null)
  }

  const updateItem = (index: number, field: keyof (typeof formData.items)[number], value: any) => {
    setFormData(prev => {
      const items = [...prev.items]
      const item = { ...items[index] } as any
      item[field] = value
      if (field === 'productId') {
        const p = getProductById(value)
        item.productName = p?.name || ''
        if (p) item.amount = Number((p.leastPrice).toFixed(2))
      }
      items[index] = item
      return { ...prev, items }
    })
  }

  const removeItem = (index: number) => {
    setFormData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }))
    setProductSearchTerms(prev => prev.filter((_, i) => i !== index))
    setShowProductSuggestions(prev => prev.filter((_, i) => i !== index))
    if (editingIndex === index) {
      setEditingIndex(null)
      setDraftItem({ productId: "", productName: "", cylinderSize: "", quantity: 1, amount: 0 })
      setDraftProductSearchTerm("")
      setShowDraftProductSuggestions(false)
    }
  }

  const totalItemsAmount = () => formData.items.reduce((s, it) => s + (Number(it.amount) || 0), 0)
  const totalItemsQuantity = () => formData.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)

  // Assigned availability helper for a specific product and size
  const getAssignedAvailableFor = (productId: string, size: string) => {
    const product = products.find(p => p._id === productId)
    if (!product) return 0
    
    // For cylinders, check specific availability based on size and status
    if (product.category === 'cylinder') {
      // Return total available (empty + full) for the product
      return (product as any).availableEmpty + (product as any).availableFull
    }
    
    // For gas products, return current stock
    return product.currentStock || 0
  }

  // Auto-dismiss stock popup after 5s, but only if user hasn't interacted with it
  useEffect(() => {
    if (showStockValidationPopup && !userInteractedWithPopup) {
      const timer = setTimeout(() => {
        setShowStockValidationPopup(false)
      }, 5000) // 5 seconds for better user experience
      return () => clearTimeout(timer)
    }
  }, [showStockValidationPopup, userInteractedWithPopup])

  // Reset interaction state when popup is closed
  useEffect(() => {
    if (!showStockValidationPopup) {
      setUserInteractedWithPopup(false)
    }
  }, [showStockValidationPopup])

  useEffect(() => {
    fetchData()
  }, [user.id])

  // Reset pagination when filters/search change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter, activeTab])

  // Export customer autocomplete
  useEffect(() => {
    const term = exportCustomerSearch.trim().toLowerCase()
    if (!term) {
      setExportSuggestions([])
      return
    }
    const list = customers.filter(c =>
      (c.name || '').toLowerCase().includes(term) ||
      (c.phone || '').toLowerCase().includes(term) ||
      (c.email || '').toLowerCase().includes(term)
    ).slice(0, 8)
    setExportSuggestions(list)
  }, [exportCustomerSearch, customers])

  // Reset security prompt flag if type or customer changes
  useEffect(() => {
    setSecurityPrompted(false)
  }, [formData.type, formData.customer])

  // Enforce delivery note behavior: zero deposit and pending status for non-refill
  useEffect(() => {
    if (formData.paymentOption === 'delivery_note' && formData.type !== 'refill') {
      setFormData(prev => ({ ...prev, depositAmount: 0, status: 'pending' }))
    }
  }, [formData.paymentOption, formData.type])

  // Always clear status for return transactions
  useEffect(() => {
    if (formData.type === 'return' && formData.status !== 'cleared') {
      setFormData(prev => ({ ...prev, status: 'cleared' }))
    }
  }, [formData.type, formData.status])

  // Always keep deposit transactions as pending (clears only by linked returns)
  useEffect(() => {
    if (formData.type === 'deposit' && formData.status !== 'pending') {
      setFormData(prev => ({ ...prev, status: 'pending' }))
    }
  }, [formData.type, formData.status])

  // If editing a deposit and user changes type to return, auto-link to the edited deposit id
  useEffect(() => {
    if (formData.type === 'return' && !formData.linkedDeposit && editingTransactionId) {
      setFormData(prev => ({ ...prev, linkedDeposit: editingTransactionId }))
    }
  }, [formData.type, formData.linkedDeposit, editingTransactionId])

  // Helpers for export filtering
  const isWithinDateRange = (dateStr: string) => {
    if (!exportStart && !exportEnd) return true
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return false
    const startOK = exportStart ? d >= new Date(exportStart) : true
    const endOK = exportEnd ? d <= new Date(new Date(exportEnd).setHours(23, 59, 59, 999)) : true
    return startOK && endOK
  }

  const getExportFilteredTransactions = () => {
    return transactions.filter(t => {
      const matchesDate = isWithinDateRange(t.createdAt)
      const matchesCustomer = !exportCustomerId || (t.customer?._id === exportCustomerId)
      return matchesDate && matchesCustomer
    })
  }

  // CSV export
  const exportCylinderCSV = () => {
    const list = getExportFilteredTransactions()
    const headers = [
      'Date',
      'Invoice No',
      'Type',
      'Customer/Supplier',
      'Items/Cylinder Size',
      'Quantity',
      'Amount (AED)',
      'Payment Method',
      'Cash Amount',
      'Bank Name',
      'Check Number',
      'Status',
      'Notes'
    ]

    const esc = (v: any) => {
      const s = (v ?? '').toString().replace(/"/g, '""')
      return `"${s}` + `"`
    }

    const rows = list.map((t) => {
      const items: any[] = Array.isArray((t as any).items) ? (t as any).items : []
      const qty = items.length > 0 ? items.reduce((s, it: any) => s + (Number(it.quantity) || 0), 0) : t.quantity
      const itemsDesc = items.length > 0
        ? items.map((it: any) => `${it.productName || it.productId?.name || 'Item'} (${it.cylinderSize || '-'}) x${it.quantity} - AED ${Number(it.amount||0).toFixed(2)}`).join(' | ')
        : `${t.product?.name || 'N/A'} (${t.cylinderSize || '-'})`
      const party = t.type === 'refill' ? (t as any).supplier?.companyName || 'Supplier' : t.customer?.name || 'Customer'
      return [
        new Date(t.createdAt).toLocaleDateString(),
        (t as any).invoiceNumber || `CYL-${(t._id || '').toString().slice(-6).toUpperCase()}`,
        t.type,
        party,
        itemsDesc,
        qty,
        Number(t.amount || 0).toFixed(2),
        t.paymentMethod || '-',
        Number(t.cashAmount || 0).toFixed(2),
        t.bankName || '-',
        t.checkNumber || '-',
        t.status,
        t.notes || ''
      ].map(esc).join(',')
    })

    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const custLabel = exportCustomerId ? (customers.find(c => c._id === exportCustomerId)?.name || 'customer') : 'all'
    const rangeLabel = `${exportStart || 'start'}_to_${exportEnd || 'end'}`
    a.href = url
    a.download = `employee-cylinder-transactions_${custLabel}_${rangeLabel}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // PDF export
  // Helper to ensure Arabic-capable font is loaded into jsPDF
  const ensureArabicFont = async (doc: jsPDF): Promise<boolean> => {
    try {
      const res = await fetch('/fonts/NotoNaskhArabic-Regular.ttf')
      if (!res.ok) return false
      const buf = await res.arrayBuffer()
      const bytes = new Uint8Array(buf)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const base64 = btoa(binary)
      doc.addFileToVFS('NotoNaskhArabic-Regular.ttf', base64)
      doc.addFont('NotoNaskhArabic-Regular.ttf', 'NotoNaskhArabic', 'normal')
      return true
    } catch (e) {
      console.warn('[PDF] Arabic font load failed:', e)
      return false
    }
  }

  const exportCylinderPDF = async () => {
    const list = getExportFilteredTransactions()
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
    const arabicReady = await ensureArabicFont(doc)
    try { doc.setFont(arabicReady ? 'NotoNaskhArabic' : 'helvetica', 'normal') } catch {}
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 36
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
      const imgWidth = pageWidth - margin * 2
      const imgHeight = (headerImg.height * imgWidth) / headerImg.width
      
      doc.addImage(headerImg, 'JPEG', margin, y, imgWidth, imgHeight)
      y += imgHeight + 20
    } catch (error) {
      console.warn('Could not load header image, continuing without it:', error)
      // Fallback to text title if image fails
      doc.setFontSize(16)
      doc.text('Employee Cylinder Transactions', pageWidth / 2, y, { align: 'center' })
      y += 18
    }
    doc.setFontSize(10)
    const custLabel = exportCustomerId ? (customers.find(c => c._id === exportCustomerId)?.name || '-') : 'All'
    const rangeLabel = `${exportStart || 'Start'} to ${exportEnd || 'End'}`
    doc.text(`Filters: Customer = ${custLabel}, Date = ${rangeLabel}`, pageWidth / 2, y, { align: 'center' })
    y += 20

    // Table headers
    const headers = ['Inv#', 'Type', 'Customer/Supplier', 'Items / Size', 'Qty', 'Amount (AED)', 'Pay', 'Status', 'Date']
    const colWidths = [70, 50, 180, 220, 40, 90, 60, 60, 80]
    const xPositions = colWidths.reduce<number[]>((acc, w, i) => {
      const prev = acc[i - 1] ?? margin
      acc.push(i === 0 ? margin : prev + colWidths[i - 1])
      return acc
    }, [])

    doc.setFontSize(9)
    doc.setFillColor(240, 240, 240)
    doc.rect(margin, y, colWidths.reduce((s, w) => s + w, 0), 18, 'F')
    headers.forEach((h, i) => doc.text(h, xPositions[i] + 4, y + 12))
    y += 22

    const drawRow = (t: CylinderTransaction, idx: number) => {
      const items: any[] = Array.isArray((t as any).items) ? (t as any).items : []
      const qty = items.length > 0 ? items.reduce((s, it: any) => s + (Number(it.quantity) || 0), 0) : t.quantity
      const itemsShort = items.length > 0
        ? items.map((it: any) => `${(it.productName || it.productId?.name || 'Item')}(${it.cylinderSize || '-'}) x${it.quantity}`).join(' | ')
        : `${t.product?.name || 'N/A'} (${t.cylinderSize || '-'})`
      const party = t.type === 'refill' ? (t as any).supplier?.companyName || 'Supplier' : t.customer?.name || 'Customer'

      if (y > doc.internal.pageSize.getHeight() - 60) {
        doc.addPage()
        y = margin
        // redraw headers
        doc.setFontSize(9)
        doc.setFillColor(240, 240, 240)
        doc.rect(margin, y, colWidths.reduce((s, w) => s + w, 0), 18, 'F')
        headers.forEach((h, i) => doc.text(h, xPositions[i] + 4, y + 12))
        y += 22
      }

      if (idx % 2 === 1) {
        doc.setFillColor(250, 250, 250)
        doc.rect(margin, y - 2, colWidths.reduce((s, w) => s + w, 0), 18, 'F')
      }

      const cells = [
        (t as any).invoiceNumber || `CYL-${(t._id || '').toString().slice(-6).toUpperCase()}`,
        t.type,
        party,
        itemsShort,
        String(qty),
        Number(t.amount || 0).toFixed(2),
        t.paymentMethod || '-',
        t.status,
        new Date(t.createdAt).toLocaleDateString(),
      ]
      cells.forEach((val, i) => doc.text(String(val), xPositions[i] + 4, y + 12))
      y += 20
    }

    list.forEach((t, idx) => drawRow(t, idx))
    doc.save(`employee-cylinder-transactions_${custLabel}_${rangeLabel}.pdf`)
  }

  // Fetch previous security records and prompt when returning and customer selected
  useEffect(() => {
    const shouldPrompt = formData.type === 'return' && !!formData.customer && !securityPrompted
    if (!shouldPrompt) return
    ;(async () => {
      try {
        const res = await fetch(`/api/employee-cylinders?employeeId=${user.id}&customerId=${formData.customer}&type=deposit`)
        const data = await res.json().catch(() => ([]))
        const list = (data?.data || data || []) as any[]
        const filtered = Array.isArray(list)
          ? list.filter(r => r && (r.paymentMethod === 'cash' || r.paymentMethod === 'cheque'))
          : []
        setSecurityRecords(filtered)
        setShowSecurityDialog(true)
      } catch (e) {
        console.error('[EmployeeCylinderSales] Failed to fetch security records:', e)
        setSecurityRecords([])
        setShowSecurityDialog(true)
      } finally {
        setSecurityPrompted(true)
      }
    })()
  }, [formData.type, formData.customer, securityPrompted])

  const handleSecuritySelect = (rec: any) => {
    const isCash = rec?.paymentMethod === 'cash'
    // Map items from selected record (if any) into form's items array
    const mappedItems = Array.isArray(rec?.items)
      ? rec.items.map((it: any) => {
          const prod = it.productId ? getProductById(it.productId) : undefined
          return {
            productId: String(it.productId || ''),
            productName: String(it.productName || prod?.name || ''),
            cylinderSize: String(it.cylinderSize || prod?.cylinderType || ''),
            quantity: Number(it.quantity || 0),
            amount: Number(it.amount || 0),
          }
        })
      : []

    setFormData(prev => ({
      ...prev,
      paymentOption: 'debit',
      paymentMethod: isCash ? 'cash' : 'cheque',
      cashAmount: isCash ? Number(rec?.cashAmount || 0) : 0,
      bankName: !isCash ? (rec?.bankName || '') : '',
      checkNumber: !isCash ? (rec?.checkNumber || '') : '',
      items: mappedItems.length > 0 ? mappedItems : prev.items,
      linkedDeposit: String(rec?._id || ''),
    }))
    // Reset draft UI state
    setDraftItem({ productId: "", productName: "", cylinderSize: "", quantity: 1, amount: 0 })
    setDraftProductSearchTerm("")
    setShowDraftProductSuggestions(false)
    setEditingIndex(null)
    setShowSecurityDialog(false)
  }

  const fetchData = async () => {
    try {
      setLoading(true)
      const [transactionsResponse, customersResponse, productsResponse, employeeInventoryResponse, suppliersResponse] = await Promise.all([
        fetch(`/api/employee-cylinders?employeeId=${user.id}`),
        fetch("/api/customers"),
        fetch("/api/products"),
        fetch(`/api/employee-inventory?employeeId=${user.id}`),
        fetch("/api/suppliers")
      ])

      if (transactionsResponse.ok) {
        const transactionsData = await transactionsResponse.json()
        const transactions = transactionsData.data || transactionsData
        try {
          console.log('[EmployeeCylinderSales] fetched transactions:', Array.isArray(transactions) ? transactions.length : 0)
          if (Array.isArray(transactions)) {
            const sample = transactions.slice(0, 3).map(t => ({ id: t._id, itemsLen: Array.isArray((t as any).items) ? (t as any).items.length : 0 }))
            console.log('[EmployeeCylinderSales] sample items lens:', sample)
          }
        } catch {}
        setTransactions(Array.isArray(transactions) ? transactions : [])
      } else {
        console.error("Failed to fetch transactions:", transactionsResponse.status)
        setTransactions([])
      }

      if (customersResponse.ok) {
        const customersData = await customersResponse.json()
        const customers = customersData.data || customersData
        setCustomers(Array.isArray(customers) ? customers : [])
      } else {
        console.error("Failed to fetch customers:", customersResponse.status)
        setCustomers([])
      }

      if (suppliersResponse.ok) {
        const suppliersData = await suppliersResponse.json()
        const suppliers = suppliersData.data || suppliersData
        setSuppliers(Array.isArray(suppliers) ? suppliers : [])
      } else {
        console.error("Failed to fetch suppliers:", suppliersResponse.status)
        setSuppliers([])
      }

      // We'll prefer assigned products from stock assignments below. Still read products to enrich objects if needed.
      let allProducts: any[] = []
      if (productsResponse.ok) {
        const productsData = await productsResponse.json()
        const products = productsData.data || productsData
        allProducts = Array.isArray(products) ? products : []
      } else {
        console.error("Failed to fetch products:", productsResponse.status)
      }

      if (employeeInventoryResponse.ok) {
        const inventoryData = await employeeInventoryResponse.json()
        const inventory = inventoryData.data || inventoryData
        const list = Array.isArray(inventory) ? inventory : []
        
        // Convert employee inventory to stock assignments format for compatibility
        const stockAssignments = list.map((inv: any) => ({
          _id: inv._id,
          product: inv.product,
          remainingQuantity: inv.currentStock,
          cylinderSize: inv.product?.cylinderSize || inv.product?.cylinderType,
          category: inv.category,
          cylinderStatus: inv.cylinderStatus
        }))
        setStockAssignments(stockAssignments)
        
        // Build products list from employee inventory
        const cylinderProducts = list
          .filter((inv: any) => inv.product && inv.product.category === 'cylinder' && inv.currentStock > 0)
          .map((inv: any) => ({
            ...inv.product,
            currentStock: inv.currentStock,
            availableEmpty: inv.availableEmpty || 0,
            availableFull: inv.availableFull || 0
          }))
        
        // Deduplicate by product ID
        const mergedMap = new Map<string, any>()
        cylinderProducts.forEach((p: any) => mergedMap.set(p._id, p))
        setProducts(Array.from(mergedMap.values()))
        
        console.log('Employee Cylinder Sales - Loaded inventory:', {
          totalInventoryItems: list.length,
          cylinderProducts: cylinderProducts.length,
          stockAssignments: stockAssignments.length
        })
      } else {
        console.error("Failed to fetch employee inventory:", employeeInventoryResponse.status)
        setStockAssignments([])
        setProducts([])
      }
    } catch (error) {
      console.error("Error fetching data:", error)
      setTransactions([])
      setCustomers([])
      setProducts([])
      setStockAssignments([])
    } finally {
      setLoading(false)
    }
  }

  // Removed standalone fetchProducts to avoid overriding assigned inventory selection

  const resetForm = () => {
    setFormData({
      type: "deposit",
      customer: "",
      supplier: "",
      product: "",
      cylinderSize: "small",
      quantity: 1,
      amount: 0,
      depositAmount: 0,
      refillAmount: 0,
      returnAmount: 0,
      paymentOption: "debit" as any,
      paymentMethod: "cash",
      cashAmount: 0,
      bankName: "",
      checkNumber: "",
      status: "pending",
      notes: "",
      securityAmount: 0, // Added for security deposit
      linkedDeposit: "",
      items: []
    })
    setCustomerSearch("")
    setShowCustomerSuggestions(false)
    setFilteredCustomers([])
    setEditingTransactionId(null)
  }

  const handleCustomerSearchChange = (value: string) => {
    setCustomerSearch(value)
    if (value.trim()) {
      const filtered = customers.filter(customer =>
        customer.name.toLowerCase().includes(value.toLowerCase()) ||
        (customer.serialNumber && customer.serialNumber.toLowerCase().includes(value.toLowerCase())) ||
        customer.email.toLowerCase().includes(value.toLowerCase()) ||
        customer.phone.includes(value)
      ).slice(0, 5)
      
      setFilteredCustomers(filtered)
      setShowCustomerSuggestions(true)
    } else {
      setShowCustomerSuggestions(false)
      setFilteredCustomers([])
      setFormData(prev => ({ ...prev, customer: "" }))
    }
  }

  const handleCustomerSuggestionClick = (customer: Customer) => {
    setCustomerSearch(customer.name)
    setFormData(prev => ({ ...prev, customer: customer._id }))
    setShowCustomerSuggestions(false)
    setFilteredCustomers([])
  }

  const handleCustomerInputFocus = () => {
    if (customerSearch.trim() && filteredCustomers.length > 0) {
      setShowCustomerSuggestions(true)
    }
  }

  const handleCustomerInputBlur = () => {
    setTimeout(() => {
      setShowCustomerSuggestions(false)
    }, 200)
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => {
      const newState = { ...prev, [name]: value };

      // When transaction type changes, reset amount fields
      if (name === 'type') {
        newState.amount = 0;
        newState.depositAmount = 0;
        newState.refillAmount = 0;
        newState.returnAmount = 0;
        // Clear customer field when switching types
        newState.customer = '';
      }

      // When product changes, auto-fill the amount with least price
      if (name === 'product' && newState.items.length === 0) {
        const selectedProduct = products.find(p => p._id === value);
        if (selectedProduct) {
          const calculatedAmount = selectedProduct.leastPrice * newState.quantity;
          newState.amount = calculatedAmount;
          
          // Set specific amount fields based on transaction type
          if (newState.type === 'deposit') {
            newState.depositAmount = calculatedAmount;
          } else if (newState.type === 'refill') {
            newState.refillAmount = calculatedAmount;
          } else if (newState.type === 'return') {
            newState.returnAmount = calculatedAmount;
          }
        }
      }

      return newState;
    });
  };

  

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const numericValue = value === '' ? 0 : parseFloat(value);

    setFormData((prev) => {
      const newState = { ...prev, [name]: name === 'notes' || name === 'bankName' || name === 'checkNumber' ? value : numericValue };

      // When quantity changes, recalculate amounts based on selected product (single-item mode only)
      if (name === 'quantity' && newState.product && newState.items.length === 0) {
        const selectedProduct = products.find(p => p._id === newState.product);
        if (selectedProduct) {
          const calculatedAmount = selectedProduct.leastPrice * numericValue;
          newState.amount = calculatedAmount;
          
          // Update specific amount fields based on transaction type
          if (newState.type === 'deposit') {
            newState.depositAmount = calculatedAmount;
          } else if (newState.type === 'refill') {
            newState.refillAmount = calculatedAmount;
          } else if (newState.type === 'return') {
            newState.returnAmount = calculatedAmount;
          }
        }
      }

      // Sync the main 'amount' field with the specific amount field being changed
      if (['depositAmount', 'refillAmount', 'returnAmount'].includes(name)) {
        newState.amount = numericValue;
      }

      // Auto-update status based on deposit amount vs total (items-aware)
      if (newState.type === 'deposit' && (name === 'depositAmount' || name === 'amount')) {
        const depositAmt = name === 'depositAmount' ? numericValue : newState.depositAmount;
        const baseTotal = newState.items.length > 0 ? totalItemsAmount() : newState.amount;
        const totalAmt = name === 'amount' && newState.items.length === 0 ? numericValue : baseTotal;
        
        if (depositAmt >= totalAmt && totalAmt > 0) {
          newState.status = 'cleared';
        } else if (depositAmt < totalAmt && depositAmt > 0) {
          newState.status = 'pending';
        }
      }

      return newState;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    // Enhanced validation
    if (!formData.customer || (formData.items.length === 0 && (!formData.product || !formData.cylinderSize || formData.quantity <= 0))) {
      toast.error("Please fill in all required fields")
      return
    }

    // Get selected product for validation
    const selectedProduct = formData.items.length === 0 ? products.find(p => p._id === formData.product) : null
    if (formData.items.length === 0) {
      if (!selectedProduct) {
        toast.error("Please select a valid product")
        return
      }
    }

    // Validate against assigned stock
    if (formData.items.length === 0) {
      const assignedAvailable = getAssignedAvailable()
      if (assignedAvailable < formData.quantity) {
        setStockAlert({
          open: true,
          productName: selectedProduct!.name,
          size: formData.cylinderSize,
          available: assignedAvailable,
          requested: formData.quantity,
        })
        setStockValidationMessage(`You requested ${formData.quantity} unit(s) of ${selectedProduct!.name} (${formData.cylinderSize}). Only ${assignedAvailable} unit(s) are available in your assigned inventory.`)
        setShowStockValidationPopup(true)
        return
      }
    } else {
      // Multi-item validation per item
      for (const it of formData.items) {
        const available = getAssignedAvailableFor(it.productId, it.cylinderSize)
        if (available < (Number(it.quantity) || 0)) {
          setStockAlert({
            open: true,
            productName: it.productName,
            size: it.cylinderSize,
            available,
            requested: it.quantity,
          })
          setStockValidationMessage(`You requested ${it.quantity} unit(s) of ${it.productName} (${it.cylinderSize}). Only ${available} unit(s) are available in your assigned inventory.`)
          setShowStockValidationPopup(true)
          return
        }
      }
    }

    // Calculate amount based on least price and quantity
    const calculatedAmount = formData.items.length > 0 ? totalItemsAmount() : (selectedProduct ? selectedProduct.leastPrice * formData.quantity : 0)

    try {
      const transactionData: any = {
        employeeId: user.id,
        type: formData.type,
        // party is conditional below
        product: formData.items.length === 0 ? formData.product : (formData.items[0]?.productId || ''),
        cylinderSize: formData.items.length === 0 ? formData.cylinderSize : (formData.items[0]?.cylinderSize || ''),
        quantity: formData.items.length === 0 ? formData.quantity : totalItemsQuantity(),
        amount: calculatedAmount,
        depositAmount:
          formData.type === 'deposit'
            ? (formData.paymentOption === 'delivery_note' ? 0 : Number(formData.depositAmount) || 0)
            : 0,
        refillAmount: 0,
        returnAmount: formData.type === 'return' ? calculatedAmount : 0,
        // Enforce status rules: return => cleared, deposit => pending, otherwise keep selected
        status: formData.type === 'return'
          ? 'cleared'
          : (formData.type === 'deposit' ? 'pending' : (formData.paymentOption === 'delivery_note' ? 'pending' : formData.status)),
        notes: formData.notes,
        paymentOption: formData.paymentOption,
      }

      if (formData.items.length > 0) {
        transactionData.items = formData.items.map(it => ({
          productId: it.productId,
          productName: it.productName,
          cylinderSize: it.cylinderSize,
          quantity: Number(it.quantity) || 0,
          amount: Number(it.amount) || 0,
        }))
      }

      // Attach linkedDeposit only for return transactions
      if (formData.type === 'return' && formData.linkedDeposit) {
        transactionData.linkedDeposit = formData.linkedDeposit
      }

      transactionData.customer = formData.customer

      if (formData.paymentOption === 'debit') {
        transactionData.paymentMethod = formData.paymentMethod
        transactionData.cashAmount = formData.paymentMethod === 'cash' ? Number(formData.cashAmount) || 0 : 0
        transactionData.bankName = formData.paymentMethod === 'cheque' ? formData.bankName : undefined
        transactionData.checkNumber = formData.paymentMethod === 'cheque' ? formData.checkNumber : undefined
      } else {
        transactionData.paymentMethod = undefined
        transactionData.cashAmount = 0
        transactionData.bankName = undefined
        transactionData.checkNumber = undefined
      }

      const isEditing = editingTransactionId !== null
      const url = isEditing ? `/api/employee-cylinders/${editingTransactionId}` : "/api/employee-cylinders"
      const method = isEditing ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transactionData),
      })

      if (response.ok) {
        const actionText = isEditing ? 'updated' : 'created'
        let saved: any = null
        try {
          saved = await response.json()
        } catch {}

        toast.success(`${(formData.type.charAt(0).toUpperCase() + formData.type.slice(1))} transaction ${actionText} successfully!`)

        const savedTx: any = (saved && (saved.data || saved)) || {}
        const isRefill = (savedTx.type || formData.type) === 'refill'

        // Build items for receipt/signature
        const itemsArray = Array.isArray(savedTx.items) && savedTx.items.length > 0
          ? savedTx.items.map((it: any) => {
              const baseName = it.productName || it.productId?.name || 'Cylinder'
              const sizeLabel = it.cylinderSize ? ` (${it.cylinderSize})` : ''
              return {
                product: { name: `${baseName}${sizeLabel}` },
                quantity: Number(it.quantity) || 0,
                price: (Number(it.amount) || 0) / Math.max(Number(it.quantity) || 1, 1),
                total: Number(it.amount) || 0,
              }
            })
          : [
              {
                product: { name: `${(savedTx.product?.name) || 'Cylinder'}${savedTx.cylinderSize ? ` (${savedTx.cylinderSize})` : ''}` },
                quantity: Number(savedTx.quantity ?? transactionData.quantity) || 0,
                price: (() => {
                  const qty = Number(savedTx.quantity ?? transactionData.quantity) || 1
                  const amt = Number(savedTx.amount ?? transactionData.amount) || 0
                  return amt / Math.max(qty, 1)
                })(),
                total: Number(savedTx.amount ?? transactionData.amount) || 0,
              },
            ]

        // Enrich customer data with full customer object to get trNumber
        const fullCustomer = savedTx.customer?._id 
          ? customers.find(c => c._id === savedTx.customer?._id) 
          : savedTx.customer
        
        const party = isRefill
          ? {
              name: savedTx.supplier?.companyName || 'Supplier',
              phone: savedTx.supplier?.phone || '-',
              address: '-',
            }
          : {
              name: fullCustomer?.name || savedTx.customer?.name || 'Customer',
              phone: fullCustomer?.phone || savedTx.customer?.phone || '-',
              address: fullCustomer?.address || savedTx.customer?.address || '-',
              trNumber: fullCustomer?.trNumber || savedTx.customer?.trNumber || '-',
            }

        const composed = {
          _id: savedTx._id || `temp-${Date.now()}`,
          invoiceNumber: savedTx.invoiceNumber || `CYL-${(savedTx._id || 'TEMP').toString().slice(-6).toUpperCase()}`,
          customer: party,
          items: itemsArray,
          totalAmount: Number(savedTx.amount ?? transactionData.amount) || 0,
          paymentMethod: savedTx.paymentMethod || transactionData.paymentMethod || 'cash',
          paymentStatus: savedTx.status || transactionData.status || 'pending',
          receivedAmount: Number(savedTx.depositAmount || savedTx.refillAmount || savedTx.returnAmount || savedTx.amount || transactionData.amount) || 0,
          notes: savedTx.notes || transactionData.notes,
          createdAt: savedTx.createdAt || new Date().toISOString(),
          // Ensure type is present for header selection (return, deposit, refill)
          type: savedTx.type || transactionData.type,
        } as any

        // Open signature dialog first
        setTransactionForSignature({ ...composed })
        setIsSignatureDialogOpen(true)

        // Preserve existing flow
        resetForm()
        setIsDialogOpen(false)
        fetchData()
        
        // Notify other pages about stock update
        localStorage.setItem('stockUpdated', Date.now().toString())
        window.dispatchEvent(new Event('stockUpdated'))
        console.log('✅ Cylinder transaction completed and stock update notification sent to other pages')
      } else {
        const errorData = await response.json()
        const actionText = isEditing ? 'update' : 'create'
        toast.error(errorData.error || `Failed to ${actionText} transaction`)
      }
    } catch (error) {
      console.error('Error creating/updating transaction:', error)
      toast.error('Error creating/updating transaction')
    }
  }

  // Handle edit transaction
  const handleEdit = (transaction: CylinderTransaction) => {
    setFormData({
      type: transaction.type,
      customer: (transaction as any).customer?._id || '',
      supplier: '',
      product: (transaction.items && transaction.items.length > 0) ? (transaction.items[0].productId || '') : (transaction.product?._id || ''),
      cylinderSize: (transaction.items && transaction.items.length > 0) ? transaction.items[0].cylinderSize : transaction.cylinderSize,
      quantity: (transaction.items && transaction.items.length > 0) ? transaction.items[0].quantity : transaction.quantity,
      amount: transaction.amount,
      depositAmount: transaction.depositAmount || 0,
      refillAmount: transaction.refillAmount || 0,
      returnAmount: transaction.returnAmount || 0,
      paymentOption: ((transaction as any).paymentOption || 'debit') as any,
      paymentMethod: transaction.paymentMethod || 'cash',
      cashAmount: transaction.cashAmount || 0,
      bankName: transaction.bankName || '',
      checkNumber: transaction.checkNumber || '',
      status: transaction.status,
      notes: transaction.notes || '',
      securityAmount: transaction.securityAmount || 0,
      linkedDeposit: (transaction as any)?.linkedDeposit?._id || (transaction as any)?.linkedDeposit || '',
      items: (transaction.items && transaction.items.length > 0) ? transaction.items.map(it => ({
        productId: (it as any).productId || '',
        productName: it.productName || '',
        cylinderSize: it.cylinderSize,
        quantity: it.quantity,
        amount: it.amount,
      })) : []
    })
    setCustomerSearch(transaction.customer?.name || '')
    setEditingTransactionId(transaction._id)
    setIsDialogOpen(true)
  }

  // Handle delete transaction
  const handleDelete = async (transactionId: string) => {
    if (!confirm('Are you sure you want to delete this transaction?')) {
      return
    }

    try {
      const response = await fetch(`/api/employee-cylinders/${transactionId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        toast.success('Transaction deleted successfully!')
        await fetchData()
      } else {
        toast.error('Failed to delete transaction')
      }
    } catch (error) {
      console.error('Error deleting transaction:', error)
      toast.error('Error deleting transaction')
    }
  }

  // Handle view receipt - opens signature dialog first
  const handleViewReceipt = (transaction: CylinderTransaction) => {
    // Build a safe party object for receipt/signature
    const isRefill = transaction.type === 'refill'
    // Enrich customer data with full customer object to get trNumber
    const fullCustomer = transaction.customer?._id 
      ? customers.find(c => c._id === transaction.customer?._id) 
      : transaction.customer
    
    const party = isRefill
      ? {
          name: (transaction.supplier as any)?.companyName || 'Supplier',
          phone: (transaction.supplier as any)?.phone || 'N/A',
          address: 'N/A',
        }
      : {
          name: fullCustomer?.name || transaction.customer?.name || 'Customer',
          phone: fullCustomer?.phone || transaction.customer?.phone || 'N/A',
          address: fullCustomer?.address || transaction.customer?.address || 'N/A',
          trNumber: fullCustomer?.trNumber || transaction.customer?.trNumber || 'N/A',
        }

    const isMulti = Array.isArray((transaction as any).items) && (transaction as any).items.length > 0
    const transactionWithAddress = {
      ...transaction,
      invoiceNumber: `CYL-${transaction._id.slice(-6).toUpperCase()}`,
      category: "cylinder",
      items: isMulti
        ? (transaction as any).items.map((it: any) => {
            const baseName = it.productName || it.productId?.name || (transaction as any).product?.name || 'Cylinder'
            return {
              product: { name: baseName },
              quantity: it.quantity,
              price: it.amount / Math.max(it.quantity, 1)
            }
          })
        : (transaction.product ? [{
            product: { name: transaction.product.name },
            quantity: transaction.quantity,
            price: transaction.amount / Math.max(transaction.quantity, 1)
          }] : []),
      totalAmount: transaction.amount,
      receivedAmount: transaction.amount,
      customer: party,
    } as any;
    setTransactionForSignature(transactionWithAddress);
    setIsSignatureDialogOpen(true);
  };

  // Handle signature completion - opens receipt dialog
  const handleSignatureComplete = (signature: string) => {
    if (transactionForSignature) {
      const transactionWithSignature = {
        ...transactionForSignature,
        customerSignature: signature,
      };
      setTransactionForReceipt(transactionWithSignature);
      setIsSignatureDialogOpen(false);
      setIsReceiptDialogOpen(true);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "cleared":
        return "bg-green-100 text-green-800"
      case "pending":
        return "bg-yellow-100 text-yellow-800"
      case "overdue":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getPaymentMethodBadge = (method: string) => {
    return method === "cash" ? 
      "bg-blue-100 text-blue-800" : 
      "bg-purple-100 text-purple-800"
  }

  // Get selected product details
  const getSelectedProduct = () => {
    return products.find(p => p._id === formData.product) || null;
  };

  // Get assigned remaining quantity for the selected product and cylinder size
  const getAssignedAvailable = () => {
    if (!formData.product) return 0;
    const product = products.find(p => p._id === formData.product)
    if (!product) return 0
    
    // For cylinders, return available stock based on current form data
    if (product.category === 'cylinder') {
      return (product as any).availableEmpty + (product as any).availableFull
    }
    
    return product.currentStock || 0
  };

  // Filter transactions based on active tab
  const getFilteredTransactions = () => {
    const list = activeTab === 'all' ? transactions : transactions.filter(t => t.type === activeTab)
    const term = searchTerm.trim().toLowerCase()
    return list.filter((transaction) => {
      const matchesSearch = term === "" ||
        (transaction as any).invoiceNumber?.toLowerCase?.().includes(term) ||
        transaction.customer?.name?.toLowerCase().includes(term) ||
        (transaction as any).supplier?.companyName?.toLowerCase?.().includes(term) ||
        transaction.cylinderSize?.toLowerCase().includes(term)
      const matchesStatus = statusFilter === "all" || transaction.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }



  // Get visible columns based on active tab
  const getVisibleColumns = () => {
    const baseColumns = ['type', 'customer', 'product', 'cylinderSize', 'quantity', 'amount']
    const paymentColumns = ['paymentMethod', 'cashAmount', 'bankName', 'checkNumber']
    const commonColumns = ['notes', 'status', 'date', 'actions']
    
    let amountColumns: string[] = []
    if (activeTab === 'all') {
      amountColumns = ['depositAmount', 'returnAmount']
    } else if (activeTab === 'deposit') {
      amountColumns = ['depositAmount']
    } else if (activeTab === 'return') {
      amountColumns = ['returnAmount']
    }
    
    return ['invoiceNumber', ...baseColumns, ...amountColumns, ...paymentColumns, ...commonColumns]
  }

  // Render table headers based on visible columns
  const renderTableHeaders = () => {
    const visibleColumns = getVisibleColumns()
    const columnHeaders: { [key: string]: string } = {
      invoiceNumber: 'Invoice No.',
      type: 'Type',
      customer: 'Customer / Supplier',
      product: 'Product',
      cylinderSize: 'Items / Cylinder Size',
      quantity: 'Quantity',
      amount: 'Amount (AED)',
      depositAmount: 'Deposit Amount (AED)',
      refillAmount: 'Refill Amount (AED)',
      returnAmount: 'Return Amount (AED)',
      paymentMethod: 'Security Type',
      cashAmount: 'Cash Amount (AED)',
      bankName: 'Bank Name',
      checkNumber: 'Check Number',
      notes: 'Notes',
      status: 'Status',
      date: 'Date',
      actions: 'Actions'
    }

    return (
      <TableRow>
        {visibleColumns.map((column) => (
          <TableHead key={column} className="text-left font-semibold">
            {columnHeaders[column]}
          </TableHead>
        ))}
      </TableRow>
    )
  }

  // Render table cells for a transaction
  const renderTableCells = (transaction: CylinderTransaction) => {
    const visibleColumns = getVisibleColumns()

    const cellRenderers: { [key: string]: () => JSX.Element } = {
      invoiceNumber: () => (
        <TableCell className="p-4">
          {(transaction as any).invoiceNumber || `CYL-${(transaction._id || '').toString().slice(-6).toUpperCase()}`}
        </TableCell>
      ),
      type: () => (
        <TableCell className="p-4">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            transaction.type === 'deposit' ? 'bg-blue-100 text-blue-800' :
            transaction.type === 'refill' ? 'bg-green-100 text-green-800' :
            'bg-purple-100 text-purple-800'
          }`}>
            {transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
          </span>
        </TableCell>
      ),
      customer: () => (
        <TableCell className="p-4">
          <div>
            <div className="font-medium">{transaction.customer.name}</div>
            <div className="text-sm text-gray-500">{transaction.customer.phone}</div>
          </div>
        </TableCell>
      ),
      product: () => {
        const items = (transaction as any).items as any[] | undefined
        const productName = transaction.product?.name || 'N/A'
        if (items && items.length > 0) {
          const tooltip = items
            .map((it: any) => `${it.productName || it.productId?.name || 'Item'} x${it.quantity} - AED ${Number(it.amount||0).toFixed(2)}`)
            .join('\n')
          return (
            <TableCell className="p-4">
              <div className="font-medium" title={tooltip}>
                {`${items.length} item${items.length > 1 ? 's' : ''}`}
              </div>
            </TableCell>
          )
        }
        return (
          <TableCell className="p-4">{productName}</TableCell>
        )
      },
      cylinderSize: () => {
        const items = (transaction as any).items as any[] | undefined
        if (items && items.length > 0) {
          return (
            <TableCell className="p-4">
              <div className="text-sm space-y-1">
                {items.map((it, idx) => {
                  const fallbackName = products.find(p => p._id === (typeof it.productId === 'string' ? it.productId : it.productId?._id))?.name
                  const name = it.productName || it.productId?.name || fallbackName || 'Product'
                  const fallbackProduct = products.find(p => p._id === (typeof it.productId === 'string' ? it.productId : it.productId?._id))
                  const sizeKey = it.cylinderSize || fallbackProduct?.cylinderType
                  const size = sizeKey ? (CYLINDER_SIZE_MAPPING as any)[sizeKey] || sizeKey : '-'
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">{name}</span>
                      <span className="text-gray-500">({size})</span>
                      <span className="text-gray-600">x {it.quantity}</span>
                      <span className="text-gray-700">- AED {Number(it.amount||0).toFixed(2)}</span>
                    </div>
                  )
                })}
              </div>
            </TableCell>
          )
        }
        return (
          <TableCell className="p-4">{transaction.cylinderSize}</TableCell>
        )
      },
      quantity: () => {
        const items = (transaction as any).items as any[] | undefined
        const totalQty = items && items.length > 0 ? items.reduce((s, it) => s + (Number(it.quantity) || 0), 0) : transaction.quantity
        return (
          <TableCell className="p-4">{totalQty}</TableCell>
        )
      },
      amount: () => (
        <TableCell className="p-4">AED {Number(transaction.amount || 0).toFixed(2)}</TableCell>
      ),
      depositAmount: () => (
        <TableCell className="p-4">
          AED {transaction.depositAmount.toFixed(2)}
        </TableCell>
      ),
      refillAmount: () => (
        <TableCell className="p-4">
          AED {transaction.refillAmount.toFixed(2)}
        </TableCell>
      ),
      returnAmount: () => (
        <TableCell className="p-4">
          AED {transaction.returnAmount.toFixed(2)}
        </TableCell>
      ),
      paymentMethod: () => (
        <TableCell className="p-4">
          <Badge className={getPaymentMethodBadge(transaction.paymentMethod)}>
            {transaction.paymentMethod.charAt(0).toUpperCase() + transaction.paymentMethod.slice(1)}
          </Badge>
        </TableCell>
      ),
      cashAmount: () => (
        <TableCell className="p-4">
          AED {transaction.cashAmount.toFixed(2)}
        </TableCell>
      ),
      bankName: () => (
        <TableCell className="p-4">
          {transaction.bankName || 'N/A'}
        </TableCell>
      ),
      checkNumber: () => (
        <TableCell className="p-4">
          {transaction.checkNumber || 'N/A'}
        </TableCell>
      ),
      notes: () => (
        <TableCell className="p-4">
          {transaction.notes || 'N/A'}
        </TableCell>
      ),
      status: () => (
        <TableCell className="p-4">
          <Badge className={getStatusBadge(transaction.status)}>
            {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
          </Badge>
        </TableCell>
      ),
      date: () => (
        <TableCell className="p-4">
          {new Date(transaction.createdAt).toLocaleDateString()}
        </TableCell>
      ),
      actions: () => (
        <TableCell className="p-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleViewReceipt(transaction)}
              className="h-8 px-2 text-xs"
            >
              <Receipt className="w-3 h-3 mr-1" />
              Receipt
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleEdit(transaction)}
              className="h-8 px-2 text-xs"
            >
              <Edit className="w-3 h-3 mr-1" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDelete(transaction._id)}
              className="h-8 px-2 text-xs text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Delete
            </Button>
          </div>
        </TableCell>
      )
    }

    return (
      <TableRow key={transaction._id}>
        {visibleColumns.map((column) => cellRenderers[column]())}
      </TableRow>
    )
  }



  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[#2B3068] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading cylinder transactions...</p>
        </div>
      </div>
    )
  }
  return (
    <div className="pt-16 lg:pt-0 space-y-8">
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-2xl p-8 text-white">
        <h1 className="text-4xl font-bold mb-2">Employee Cylinder Sales</h1>
        <p className="text-white/80 text-lg">Manage your cylinder sales and transactions</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Total Transactions</CardTitle>
            <FileText className="w-5 h-5 text-[#2B3068]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[#2B3068]">{transactions.length}</div>
            <p className="text-xs text-gray-600 mt-1">All transactions</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Total Revenue</CardTitle>
            <DollarSign className="w-5 h-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              AED {transactions.reduce((sum, t) => sum + (t.refillAmount || 0), 0).toFixed(2)}
            </div>
            <p className="text-xs text-gray-600 mt-1">Revenue generated</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Pending</CardTitle>
            <Package className="w-5 h-5 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {transactions.filter(t => t.status === "pending").length}
            </div>
            <p className="text-xs text-gray-600 mt-1">Pending transactions</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Cleared</CardTitle>
            <Package className="w-5 h-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {transactions.filter(t => t.status === "cleared").length}
            </div>
            <p className="text-xs text-gray-600 mt-1">Cleared transactions</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="w-full">
          <div className="flex items-center gap-3 w-full">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search by customer, supplier, or size..."
                value={searchTerm}
                onChange={(e) => {
                  const val = e.target.value
                  setSearchTerm(val)
                  if (val.trim()) {
                    const filtered = customers.filter(c =>
                      c.name.toLowerCase().includes(val.toLowerCase()) ||
                      c.phone.includes(val) ||
                      (c.email || '').toLowerCase().includes(val.toLowerCase())
                    ).slice(0, 5)
                    setFilteredSearchSuggestions(filtered)
                    setShowSearchSuggestions(true)
                  } else {
                    setShowSearchSuggestions(false)
                    setFilteredSearchSuggestions([])
                  }
                }}
                onFocus={() => {
                  if (searchTerm.trim() && filteredSearchSuggestions.length > 0) setShowSearchSuggestions(true)
                }}
                onBlur={() => setTimeout(() => setShowSearchSuggestions(false), 150)}
                className="pl-10"
              />
              {showSearchSuggestions && filteredSearchSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
                  {filteredSearchSuggestions.map((customer) => (
                    <div
                      key={customer._id}
                      onMouseDown={() => {
                        setSearchTerm(customer.name)
                        setShowSearchSuggestions(false)
                      }}
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
              <SelectTrigger className="w-44">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="cleared">Cleared</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Export actions moved to results section header */}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()} className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              New Transaction
            </Button>
          </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTransactionId ? "Edit Cylinder Transaction" : "Create New Cylinder Transaction"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 py-4">
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {/* Transaction Type */}
    <div>
      <Label htmlFor="type">Transaction Type</Label>
      <Select value={formData.type} onValueChange={(value) => handleSelectChange("type", value)}>
        <SelectTrigger>
          <SelectValue placeholder="Select type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="deposit">Deposit</SelectItem>
          <SelectItem value="return">Return</SelectItem>
        </SelectContent>
      </Select>
    </div>

    {/* Customer */}
    <div className="relative">
      <Label htmlFor="customer">Customer</Label>
      <Input
        id="customer"
        type="text"
        value={customerSearch}
        onChange={(e) => handleCustomerSearchChange(e.target.value)}
        onFocus={handleCustomerInputFocus}
        onBlur={handleCustomerInputBlur}
        placeholder="Search by name, serial number, phone, or email..."
        autoComplete="off"
      />
      {showCustomerSuggestions && filteredCustomers.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-60 overflow-auto shadow-lg">
          {filteredCustomers.map((customer) => (
            <li
              key={customer._id}
              className="p-2 hover:bg-gray-100 cursor-pointer"
              onMouseDown={() => handleCustomerSuggestionClick(customer)}
            >
              <div className="flex items-center gap-2">
                <span>{customer.name}</span>
                {customer.serialNumber && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
                    {customer.serialNumber}
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-500">({customer.phone})</div>
            </li>
          ))}
        </ul>
      )}
    </div>

    {/* Items: single-entry draft form + items table */}
    <div className="md:col-span-2 space-y-4">
      <Label className="text-lg font-semibold">Items</Label>

      {/* 2x2 draft form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Product autocomplete */}
        <div className="space-y-2 relative">
          <Label>Product *</Label>
          <Input
            value={draftProductSearchTerm}
            onChange={(e) => {
              const val = e.target.value
              setDraftProductSearchTerm(val)
              setShowDraftProductSuggestions(val.trim().length > 0)
            }}
            onBlur={() => setTimeout(() => setShowDraftProductSuggestions(false), 150)}
            placeholder="Search product"
            autoComplete="off"
          />
          {showDraftProductSuggestions && draftProductSearchTerm.trim().length > 0 && (
            <ul className="absolute z-50 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-60 overflow-auto shadow-lg">
              {products
                .filter(p => p.category === 'cylinder' && p.name.toLowerCase().includes(draftProductSearchTerm.toLowerCase()))
                .slice(0, 5)
                .map(p => (
                  <li
                    key={p._id}
                    className="p-2 hover:bg-gray-100 cursor-pointer"
                    onMouseDown={() => {
                      setDraftItem(prev => ({ 
                        ...prev, 
                        productId: p._id, 
                        productName: p.name, 
                        cylinderSize: p.cylinderType || '', 
                        amount: Number(p.leastPrice.toFixed(2)) 
                      }))
                      setDraftProductSearchTerm(p.name)
                      setShowDraftProductSuggestions(false)
                    }}
                  >
                    {p.name} - AED {p.leastPrice.toFixed(2)}
                  </li>
                ))}
              {products.filter(p => p.category === 'cylinder' && p.name.toLowerCase().includes(draftProductSearchTerm.toLowerCase())).length === 0 && (
                <li className="p-2 text-gray-500">No matches</li>
              )}
            </ul>
          )}
        </div>



        {/* Quantity */}
        <div className="space-y-2">
          <Label>Quantity *</Label>
          <Input type="number" min={1} value={draftItem.quantity} onChange={(e) => setDraftItem(prev => ({ ...prev, quantity: Number.parseInt(e.target.value) || 1 }))} />
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <Label>Amount *</Label>
          <Input type="number" step="0.01" min={0} value={draftItem.amount} onChange={(e) => setDraftItem(prev => ({ ...prev, amount: Number.parseFloat(e.target.value) || 0 }))} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={addItem}>
          <Plus className="w-4 h-4 mr-2" />
          {editingIndex === null ? 'Add Item' : 'Save Item'}
        </Button>
        {editingIndex !== null && (
          <Button type="button" variant="ghost" onClick={() => {
            setEditingIndex(null)
            setDraftItem({ productId: "", productName: "", cylinderSize: "", quantity: 1, amount: 0 })
            setDraftProductSearchTerm("")
            setShowDraftProductSuggestions(false)
          }}>Cancel Edit</Button>
        )}
      </div>

      {/* Items table */}
      {formData.items.length > 0 && (
        <div className="space-y-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>

                <TableHead>Qty</TableHead>
                <TableHead>Amount (AED)</TableHead>
                <TableHead className="w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {formData.items.map((it, idx) => (
                <TableRow key={idx}>
                  <TableCell>{it.productName || products.find(p => p._id === it.productId)?.name || '-'}</TableCell>
                  <TableCell>{it.quantity}</TableCell>
                  <TableCell>AED {(Number(it.amount)||0).toFixed(2)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => {
                        setEditingIndex(idx)
                        setDraftItem({ ...it })
                        setDraftProductSearchTerm(it.productName || products.find(p => p._id === it.productId)?.name || '')
                      }}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="text-red-600 border-red-600" onClick={() => removeItem(idx)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={2} className="text-right font-semibold">Total</TableCell>
                <TableCell className="font-semibold">AED {totalItemsAmount().toFixed(2)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>

    {/* Received Via - for deposit and return (Payment Option hidden) */}
    {(formData.type === 'deposit' || formData.type === 'return') && (
      <div>
        <Label htmlFor="paymentMethod">Received Via</Label>
        <Select value={formData.paymentMethod} onValueChange={(value) => handleSelectChange("paymentMethod", value)}>
          <SelectTrigger>
            <SelectValue placeholder="Select received via" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="cheque">Cheque</SelectItem>
          </SelectContent>
        </Select>
      </div>
    )}

    {/* Security Cash field (if cash) - deposit and return */}
    {(formData.type === 'deposit' || formData.type === 'return') && formData.paymentMethod === 'cash' && (
      <div>
        <Label htmlFor="cashAmount">Security Cash</Label>
        <Input id="cashAmount" name="cashAmount" type="number" value={formData.cashAmount} onChange={handleChange} />
      </div>
    )}

    {/* Cheque fields (if cheque) - deposit and return */}
    {(formData.type === 'deposit' || formData.type === 'return') && formData.paymentMethod === 'cheque' && (
      <>
        <div>
          <Label htmlFor="bankName">Bank Name</Label>
          <Input id="bankName" name="bankName" value={formData.bankName} onChange={handleChange} />
        </div>
        <div>
          <Label htmlFor="checkNumber">Check Number</Label>
          <Input id="checkNumber" name="checkNumber" value={formData.checkNumber} onChange={handleChange} />
        </div>
      </>
    )}

    {/* Deposit Amount - deposit only */}
    {formData.type === 'deposit' && (
      <div>
        <Label htmlFor="depositAmount">Deposit Amount</Label>
        <Input
          id="depositAmount"
          name="depositAmount"
          type="number"
          value={formData.depositAmount}
          onChange={handleChange}
        />
      </div>
    )}

    {/* Status - deposit only */}
    {formData.type === 'deposit' && (
      <div>
        <Label htmlFor="status">Status</Label>
        <Select value={formData.status} onValueChange={(value) => handleSelectChange("status", value)}>
          <SelectTrigger>
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="cleared">Cleared</SelectItem>
          </SelectContent>
        </Select>
      </div>
    )}
  </div>

  {/* Notes */}
  <div>
    <Label htmlFor="notes">Notes</Label>
    <Textarea id="notes" name="notes" value={formData.notes} onChange={handleChange} />
  </div>

  <div className="flex justify-end pt-4">
    <Button type="submit" className="bg-[#2B3068] text-white hover:bg-blue-800">
      {editingTransactionId ? "Update Transaction" : "Create Transaction"}
    </Button>
  </div>
</form>

        </DialogContent>
      </Dialog>
    </div>

    {/* Transactions Table */}
    <Card className="border-0 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white rounded-t-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
          <CardTitle>Cylinder Transactions</CardTitle>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
            {showExportInput && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <div className="relative">
                  <Input
                    placeholder="Enter customer or company name"
                    value={exportCustomerSearch}
                    onChange={(e) => {
                      setExportCustomerSearch(e.target.value)
                      if (!e.target.value.trim()) setExportCustomerId("")
                    }}
                    onFocus={() => {
                      if (exportCustomerSearch.trim() && exportSuggestions.length > 0) return
                      setExportSuggestions(customers.slice(0, 8))
                    }}
                    onBlur={() => setTimeout(() => setExportSuggestions([]), 150)}
                    autoComplete="off"
                    className="bg-white text-gray-900 placeholder:text-gray-500 w-full sm:w-64 h-9"
                  />
                  {exportSuggestions.length > 0 && (
                    <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {exportSuggestions.map(c => (
                        <li
                          key={c._id}
                          className="px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm text-gray-800"
                          onMouseDown={() => {
                            setExportCustomerId(c._id)
                            setExportCustomerSearch(c.name)
                            setExportSuggestions([])
                          }}
                        >
                          {c.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Label className="text-xs text-gray-600">From</Label>
                  <Input
                    type="date"
                    value={exportStart}
                    onChange={(e) => setExportStart(e.target.value)}
                    className="bg-white text-gray-900 w-full sm:w-36 h-9"
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Label className="text-xs text-gray-600">To</Label>
                  <Input
                    type="date"
                    value={exportEnd}
                    onChange={(e) => setExportEnd(e.target.value)}
                    className="bg-white text-gray-900 w-full sm:w-36 h-9"
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      className="bg-white text-[#2B3068] hover:bg-gray-100 w-full sm:w-auto"
                    >
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={exportCylinderPDF}>
                      Download PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportCylinderCSV}>
                      Download CSV
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="border-b border-gray-200 px-6">
            <TabsList className="bg-transparent p-0 -mb-px">
              <TabsTrigger value="all" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#2B3068] rounded-none text-base font-semibold px-4 py-3">All</TabsTrigger>
              <TabsTrigger value="deposit" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none text-base font-semibold px-4 py-3">Deposits</TabsTrigger>
              <TabsTrigger value="return" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-orange-600 rounded-none text-base font-semibold px-4 py-3">Returns</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value={activeTab} className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-gray-50">
                  {renderTableHeaders()}
                </TableHeader>
                <TableBody>
                  {getFilteredTransactions().length > 0 ? (
                    (() => {
                      const filtered = getFilteredTransactions()
                      const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage))
                      const safePage = Math.min(currentPage, totalPages)
                      const startIndex = (safePage - 1) * itemsPerPage
                      const pageItems = filtered.slice(startIndex, startIndex + itemsPerPage)
                      return pageItems.map((transaction) => renderTableCells(transaction))
                    })()
                  ) : (
                    <TableRow>
                      <TableCell colSpan={getVisibleColumns().length} className="h-24 text-center text-lg text-gray-500">
                        No {activeTab === "all" ? "" : activeTab} transactions found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {/* Pagination Controls */}
            {(() => {
              const filtered = getFilteredTransactions()
              if (filtered.length === 0) return null
              const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage))
              const safePage = Math.min(currentPage, totalPages)
              const startIndex = (safePage - 1) * itemsPerPage
              return (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4">
                  <div className="text-sm text-gray-600">
                    Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filtered.length)} of {filtered.length}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safePage === 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="min-w-[70px]"
                    >
                      Prev
                    </Button>
                    {Array.from({ length: totalPages }).slice(Math.max(0, safePage - 3), Math.max(0, safePage - 3) + 5).map((_, idx) => {
                      const pageNum = Math.max(1, safePage - 2) + idx
                      if (pageNum > totalPages) return null
                      return (
                        <Button
                          key={pageNum}
                          variant={pageNum === safePage ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          className={pageNum === safePage ? "bg-[#2B3068] hover:bg-[#1a1f4a] text-white" : ""}
                        >
                          {pageNum}
                        </Button>
                      )
                    })}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safePage === totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="min-w-[70px]"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )
            })()}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>

    {/* Signature Dialog */}
    {isSignatureDialogOpen && transactionForSignature && (
      <SignatureDialog
        isOpen={isSignatureDialogOpen}
        onClose={() => setIsSignatureDialogOpen(false)}
        onSignatureComplete={handleSignatureComplete}
        customerName={transactionForSignature.customer.name}
      />
    )}

    {/* Receipt Dialog */}
    {transactionForReceipt && (
      <ReceiptDialog
        onClose={() => {
          setIsReceiptDialogOpen(false);
          setTransactionForReceipt(null);
        }}
        sale={transactionForReceipt}
      />
    )}

    {/* Previous Security Select Dialog */}
    <SecuritySelectDialog
      open={showSecurityDialog}
      onOpenChange={setShowSecurityDialog}
      records={securityRecords}
      onSelect={handleSecuritySelect}
    />

    {/* Stock Validation Popup (Admin-style) */}
    {showStockValidationPopup && (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center pointer-events-auto">
        <div 
          className="absolute inset-0 bg-black/20 backdrop-blur-sm pointer-events-auto" 
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            console.log('Background overlay clicked - only closing popup')
            setUserInteractedWithPopup(true)
            setShowStockValidationPopup(false)
            // Only close popup, don't affect form data
          }} 
        />
        <div className="relative bg-white rounded-2xl shadow-2xl p-8 mx-4 max-w-md w-full transform transition-all duration-300 scale-100 animate-in fade-in-0 zoom-in-95 pointer-events-auto z-10">
          {/* Close button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              console.log('Close X button clicked - only closing popup')
              setUserInteractedWithPopup(true)
              setShowStockValidationPopup(false)
              // Only close popup, don't affect form data
            }}
            onMouseEnter={() => setUserInteractedWithPopup(true)}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors pointer-events-auto"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-red-500 to-red-600 rounded-full">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div className="text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Insufficient Stock</h3>
            <p className="text-gray-600 mb-6">{stockValidationMessage}</p>
            
            {/* Action buttons */}
            <div className="flex gap-3 pointer-events-auto">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setUserInteractedWithPopup(true)
                  setShowStockValidationPopup(false)
                }}
                onMouseEnter={() => setUserInteractedWithPopup(true)}
                className="flex-1 bg-gray-100 text-gray-700 font-semibold py-3 px-6 rounded-lg hover:bg-gray-200 transition-all duration-200 pointer-events-auto relative z-20 select-none cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setUserInteractedWithPopup(true)
                  setShowStockValidationPopup(false)
                  // Could add logic to navigate to inventory management
                }}
                onMouseEnter={() => setUserInteractedWithPopup(true)}
                className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-red-600 hover:to-red-700 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl pointer-events-auto relative z-20 select-none cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </div>
  )
}
