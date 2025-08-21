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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Edit, Trash2, Search, Filter, Cylinder, RotateCcw, ArrowDown, ArrowUp } from "lucide-react"
import { cylindersAPI, customersAPI, productsAPI, employeeCylindersAPI, suppliersAPI } from "@/lib/api"
import { CustomerDropdown } from "@/components/ui/customer-dropdown"
import { ReceiptDialog } from "@/components/receipt-dialog"
import { SignatureDialog } from "@/components/signature-dialog"
import SecuritySelectDialog from "@/components/security-select-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import jsPDF from "jspdf"

interface CylinderTransaction {
  _id: string  
  type: "deposit" | "refill" | "return"
  invoiceNumber?: string
  customer?: {
    _id: string
    name: string
    phone: string
    address: string
  }
  supplier?: {
    _id: string
    companyName: string
    contactPerson?: string
    phone?: string
    email?: string
  }
  product?: {
    _id: string
    name: string
    category: string
    cylinderSize?: string
  }
  cylinderSize: string
  quantity: number
  amount: number
  depositAmount?: number
  refillAmount?: number
  returnAmount?: number
  paymentMethod?: "cash" | "cheque"
  cashAmount?: number
  bankName?: string
  checkNumber?: string
  status: "pending" | "cleared" | "overdue"
  notes?: string
  createdAt: string
  updatedAt: string
  isEmployeeTransaction?: boolean
  employee?: {
    _id: string
    name: string
  }
  // New: optional items array for multi-item transactions
  items?: Array<{
    productId: string
    productName: string
    cylinderSize: string
    quantity: number
    amount: number
  }>
  // Optional link to a previous security deposit (used for return transactions)
  linkedDeposit?: any
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
  cylinderSize?: "large" | "small"
  costPrice: number
  leastPrice: number
  currentStock: number
}

interface Supplier {
  _id: string
  companyName: string
  contactPerson?: string
  phone?: string
  email?: string
}

export function CylinderManagement() {
  const [transactions, setTransactions] = useState<CylinderTransaction[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<CylinderTransaction | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [receiptDialogData, setReceiptDialogData] = useState(null as any)
  const [showSignatureDialog, setShowSignatureDialog] = useState(false)
  const [pendingTransaction, setPendingTransaction] = useState<CylinderTransaction | null>(null)
  const [customerSignature, setCustomerSignature] = useState<string>("") 
  const [statusFilter, setStatusFilter] = useState("all")
  const [activeTab, setActiveTab] = useState("all")
  // Export controls
  const [showExportInput, setShowExportInput] = useState(false)
  const [exportSearch, setExportSearch] = useState("")
  const [showExportSuggestions, setShowExportSuggestions] = useState(false)
  const [filteredExportSuggestions, setFilteredExportSuggestions] = useState<string[]>([])
  
  // Export autocomplete - build suggestions from customers and suppliers
  const handleExportSearchChange = (value: string) => {
    setExportSearch(value)
    const v = value.trim().toLowerCase()
    if (v.length === 0) {
      setShowExportSuggestions(false)
      setFilteredExportSuggestions([])
      return
    }
    const customerNames = (customers || []).map((c: Customer) => c.name || "").filter(Boolean)
    const supplierNames = (suppliers || []).map((s: Supplier) => s.companyName || "").filter(Boolean)
    const allNames = Array.from(new Set([...customerNames, ...supplierNames]))
    const filtered = allNames
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
  
  // Security selection dialog state
  const [showSecurityDialog, setShowSecurityDialog] = useState(false)
  const [securityRecords, setSecurityRecords] = useState<any[]>([])
  const [securityPrompted, setSecurityPrompted] = useState(false)
  
  // Customer autocomplete functionality for form
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false)
  const [filteredCustomerSuggestions, setFilteredCustomerSuggestions] = useState<Customer[]>([])
  const [customerSearchTerm, setCustomerSearchTerm] = useState("")
  
  // Search filter autocomplete functionality
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false)
  const [filteredSearchSuggestions, setFilteredSearchSuggestions] = useState<Customer[]>([])

  // Product autocomplete state (per item)
  const [productSearchTerms, setProductSearchTerms] = useState<string[]>([])
  const [showProductSuggestions, setShowProductSuggestions] = useState<boolean[]>([])

  // Single-entry draft item state for 2x2 form
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

  // Stock validation popup state
  const [showStockValidationPopup, setShowStockValidationPopup] = useState(false)
  const [stockValidationMessage, setStockValidationMessage] = useState("")

  // Dynamic column visibility based on active tab
  const getVisibleColumns = () => {
    const baseColumns = ['type', 'customer', 'product', 'cylinderSize', 'quantity', 'amount']
    // Removed invoiceNumber from commonColumns; we'll prefix it explicitly to be first
    const commonColumns = ['paymentMethod', 'cashAmount', 'bankName', 'checkNumber', 'notes', 'status', 'date', 'actions']

    switch (activeTab) {
      case 'deposit':
        return ['invoiceNumber', ...baseColumns, 'depositAmount', ...commonColumns]
      case 'refill': {
        const columnsToHide = ['amount', 'depositAmount', 'refillAmount', 'returnAmount', 'paymentMethod', 'cashAmount', 'bankName', 'checkNumber', 'status']
        return ['invoiceNumber', ...baseColumns, ...commonColumns].filter(col => !columnsToHide.includes(col))
      }
      case 'return':
        return ['invoiceNumber', ...baseColumns, 'returnAmount', ...commonColumns]
      case 'all':
      default:
        return ['invoiceNumber', ...baseColumns, 'depositAmount', 'refillAmount', 'returnAmount', ...commonColumns]
    }
  }

  // Helper function to render table headers based on visible columns
  const renderTableHeaders = () => {
    const visibleColumns = getVisibleColumns()
    const columnHeaders = {
      type: 'Type',
      customer: 'Customer',
      product: 'Product',
      cylinderSize: 'Items / Cylinder Size',
      quantity: 'Quantity',
      amount: 'Amount',
      depositAmount: 'Deposit Amount',
      refillAmount: 'Refill Amount',
      returnAmount: 'Return Amount',
      paymentMethod: 'Payment Method',
      cashAmount: 'Security Cash',
      bankName: 'Bank Name',
      checkNumber: 'Check Number',
      notes: 'Notes',
      status: 'Status',
      invoiceNumber: 'Invoice No.',
      date: 'Date',
      actions: 'Actions'
    }

    return visibleColumns.map(column => (
      <TableHead key={column} className="p-4">
        {columnHeaders[column as keyof typeof columnHeaders]}
      </TableHead>
    ))
  }

  // Helper function to render table cells based on visible columns
  const renderTableCells = (transaction: CylinderTransaction) => {
    const visibleColumns = getVisibleColumns()
    
    const cellRenderers = {
      type: () => (
        <TableCell className="p-4">
          <div className="flex items-center gap-2">
            {getTransactionIcon(transaction.type)}
            {getTypeBadge(transaction.type)}
          </div>
        </TableCell>
      ),
      customer: () => (
        <TableCell className="p-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="font-medium">
                {transaction.customer?.name || transaction.supplier?.companyName || "-"}
              </div>
              {transaction.isEmployeeTransaction ? (
                <div className="flex items-center gap-1">
                  <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-semibold" title={`Created by Employee: ${transaction.employee?.name || 'Unknown Employee'}`}>
                    E
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <div className="w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-xs font-semibold" title="Created by Admin">
                    A
                  </div>
                </div>
              )}

              
            </div>
            <div className="text-sm text-gray-500">{transaction.customer?.phone || transaction.supplier?.phone || ''}</div>
            {transaction.isEmployeeTransaction && (
              <div className="text-xs text-blue-600 font-medium mt-1">
                Employee: {transaction.employee?.name || "Unknown Employee"}
              </div>
            )}
          </div>
        </TableCell>
      ),
      product: () => {
        const items = (transaction as any).items as any[] | undefined
        const productName = transaction.product?.name || "-"
        const content = items && items.length > 0
          ? `${items.length} item${items.length > 1 ? 's' : ''}`
          : productName
        return (
          <TableCell className="p-4">
            <div className="font-medium" title={items && items.length > 0 ? items.map((it: any) => `${it.productName} x${it.quantity} - AED ${Number(it.amount||0).toFixed(2)}`).join('\n') : productName}>
              {content}
            </div>
          </TableCell>
        )
      },
      cylinderSize: () => {
        const items = (transaction as any).items as any[] | undefined
        const hasItems = items && items.length > 0
        return (
          <TableCell className="p-4">
            {hasItems ? (
              <div className="text-sm space-y-1">
                {items!.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="font-medium text-gray-800">{it.productName || products.find(p=>p._id===it.productId)?.name || 'Product'}</span>
                    <span className="text-gray-500">({it.cylinderSize || products.find(p=>p._id===it.productId)?.cylinderSize || '-'})</span>
                    <span className="text-gray-600">x {it.quantity}</span>
                    <span className="text-gray-700">- AED {(Number(it.amount)||0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="font-medium capitalize">{transaction.cylinderSize || '-'}</span>
            )}
          </TableCell>
        )
      },
      quantity: () => {
        const items = (transaction as any).items as any[] | undefined
        const totalQty = items && items.length > 0 ? items.reduce((s, it) => s + (Number(it.quantity)||0), 0) : transaction.quantity
        return (
          <TableCell className="p-4">{totalQty}</TableCell>
        )
      },
      amount: () => {
        const items = (transaction as any).items as any[] | undefined
        const totalAmt = items && items.length > 0 ? items.reduce((s, it) => s + (Number(it.amount)||0), 0) : transaction.amount
        return (
          <TableCell className="p-4 font-semibold">AED {Number(totalAmt).toFixed(2)}</TableCell>
        )
      },
      depositAmount: () => (
        <TableCell className="p-4">
          {transaction.depositAmount ? `AED ${transaction.depositAmount.toFixed(2)}` : '-'}
        </TableCell>
      ),
      refillAmount: () => (
        <TableCell className="p-4">
          {transaction.refillAmount ? `AED ${transaction.refillAmount.toFixed(2)}` : '-'}
        </TableCell>
      ),
      returnAmount: () => (
        <TableCell className="p-4">
          {transaction.returnAmount ? `AED ${transaction.returnAmount.toFixed(2)}` : '-'}
        </TableCell>
      ),
      paymentMethod: () => (
        <TableCell className="p-4">
          {transaction.paymentMethod ? (
            <Badge variant={transaction.paymentMethod === 'cash' ? 'default' : 'secondary'}>
              {transaction.paymentMethod === 'cash' ? 'Cash' : 'Cheque'}
            </Badge>
          ) : '-'}
        </TableCell>
      ),
      cashAmount: () => (
        <TableCell className="p-4">
          {transaction.cashAmount ? `AED ${transaction.cashAmount.toFixed(2)}` : '-'}
        </TableCell>
      ),
      bankName: () => (
        <TableCell className="p-4">
          {transaction.bankName || '-'}
        </TableCell>
      ),
      checkNumber: () => (
        <TableCell className="p-4">
          {transaction.checkNumber || '-'}
        </TableCell>
      ),
      notes: () => (
        <TableCell className="p-4">
          <div className="max-w-32 truncate" title={transaction.notes || ''}>
            {transaction.notes || '-'}
          </div>
        </TableCell>
      ),
      status: () => (
        <TableCell className="p-4">{getStatusBadge(transaction.status)}</TableCell>
      ),
      invoiceNumber: () => (
        <TableCell className="p-4">
          {transaction.invoiceNumber || (transaction._id ? `CYL-${transaction._id.slice(-6).toUpperCase()}` : '-')}
        </TableCell>
      ),
      date: () => (
        <TableCell className="p-4">{new Date(transaction.createdAt).toLocaleDateString()}</TableCell>
      ),
      actions: () => (
        <TableCell className="p-4">
          <div className="flex space-x-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleReceiptClick(transaction)}
              className="text-green-600 border-green-600 hover:bg-green-600 hover:text-white"
            >
              Receipt
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleEdit(transaction)}
              className="text-[#2B3068] border-[#2B3068] hover:bg-[#2B3068] hover:text-white"
            >
              <Edit className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDelete(transaction._id, transaction.isEmployeeTransaction)}
              className="text-red-600 border-red-600 hover:bg-red-600 hover:text-white"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </TableCell>
      )
    }

    return (
      <>
        {visibleColumns.map(column => {
          const renderer = cellRenderers[column as keyof typeof cellRenderers]
          return renderer ? renderer() : null
        })}
      </>
    )
  }

  // Export CSV of transactions filtered by customer or supplier company name
  const exportCylinderCSV = () => {
    try {
      const term = (exportSearch || '').trim().toLowerCase()
      const list = (Array.isArray(transactions) ? transactions : [])
        .filter((t) => {
          if (!term) return true
          const cname = t.customer?.name?.toLowerCase() || ''
          const sname = t.supplier?.companyName?.toLowerCase() || ''
          return cname.includes(term) || sname.includes(term)
        })

      const escape = (val: any) => {
        const s = (val === undefined || val === null) ? '' : String(val)
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"'
        }
        return s
      }

      const headers = [
        'Date',
        'Invoice No.',
        'Type',
        'Customer/Supplier',
        'Product/Items',
        'Cylinder Size',
        'Quantity',
        'Amount',
        'Deposit Amount',
        'Refill Amount',
        'Return Amount',
        'Payment Method',
        'Cash Amount',
        'Bank Name',
        'Check Number',
        'Status',
        'Notes',
        'Source'
      ]

      const rows = list.map((t) => {
        const items = (t as any).items as any[] | undefined
        const hasItems = items && items.length > 0
        const productOrItems = hasItems
          ? items!.map((it) => `${it.productName || ''} x${Number(it.quantity)||0} (AED ${(Number(it.amount)||0).toFixed(2)})`).join(' | ')
          : (t.product?.name || '')
        const cylSize = hasItems
          ? items!.map((it) => `${it.cylinderSize || '-'}`).join(' | ')
          : (t.cylinderSize || '-')
        const qty = hasItems
          ? items!.reduce((s, it) => s + (Number(it.quantity)||0), 0)
          : (t.quantity || 0)
        const amt = hasItems
          ? items!.reduce((s, it) => s + (Number(it.amount)||0), 0)
          : (t.amount || 0)
        const party = t.customer?.name || t.supplier?.companyName || ''
        const inv = (t as any).invoiceNumber || (t?._id ? `CYL-${String(t._id).slice(-6).toUpperCase()}` : '')
        return [
          new Date(t.createdAt).toLocaleDateString(),
          inv,
          t.type,
          party,
          productOrItems,
          cylSize,
          qty,
          Number(amt).toFixed(2),
          t.depositAmount ? Number(t.depositAmount).toFixed(2) : '',
          t.refillAmount ? Number(t.refillAmount).toFixed(2) : '',
          t.returnAmount ? Number(t.returnAmount).toFixed(2) : '',
          t.paymentMethod || '',
          t.cashAmount ? Number(t.cashAmount).toFixed(2) : '',
          t.bankName || '',
          t.checkNumber || '',
          t.status,
          t.notes || '',
          t.isEmployeeTransaction ? 'Employee' : 'Admin',
        ].map(escape).join(',')
      })

      const csv = [headers.join(','), ...rows].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')
      const suffix = term ? `-${term.replace(/[^a-z0-9-_]+/g,'_')}` : ''
      a.href = url
      a.download = `cylinder-transactions${suffix}-${ts}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('[CylinderManagement] Export failed:', e)
      alert('Failed to export CSV')
    }
  }

  // Export PDF of transactions with styled header and no Customer/Supplier column
  const exportCylinderPDF = () => {
    try {
      const term = (exportSearch || '').trim().toLowerCase()
      const list = (Array.isArray(transactions) ? transactions : [])
        .filter((t) => {
          if (!term) return true
          const cname = t.customer?.name?.toLowerCase() || ''
          const sname = t.supplier?.companyName?.toLowerCase() || ''
          return cname.includes(term) || sname.includes(term)
        })

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
      const marginX = 32
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      let y = 52

      // Title
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text('Cylinder Transactions', marginX, y)
      y += 10
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      if (term) { doc.text(`Filter: ${term}`, marginX, y); y += 9 }
      doc.text(`Generated: ${new Date().toLocaleString()}`, marginX, y)
      y += 10

      // Header bar styling
      const headerHeight = 16
      const headerY = y
      doc.setFillColor(43, 48, 104) // brand-like dark blue
      doc.rect(marginX - 4, headerY - 14, pageWidth - marginX * 2 + 8, headerHeight, 'F')

      // Define columns (expanded set)
      const headers = [
        'Type','Customer','Product Items / Cylinder Size','Quantity','Amount',
        'Deposit Amount','Refill Amount','Return Amount','Payment Method','Security Cash','Bank Name','Check Number','Notes','Status','Invoice No.','Date'
      ]
      const colWidths = [
        30, 70, 160, 35, 50,
        60, 60, 60, 65, 60, 65, 70, 100, 50, 75, 60
      ]

      // Draw header text in white
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      let xh = marginX
      headers.forEach((h, i) => {
        doc.text(h, xh, headerY)
        xh += (colWidths[i] || 80)
      })
      // Reset for body
      doc.setTextColor(0, 0, 0)
      y += 12

      // Helper to draw a row with optional zebra striping
      const baseFontSize = 7
      const minFontSize = 6
      const lineHeight = 9
      let rowIndex = 0
      const drawRow = (cells: string[]) => {
        let x = marginX
        // Page break check: leave bottom margin
        if (y > pageHeight - 52) {
          doc.addPage();
          // re-draw header on new page
          y = 52
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(11)
          doc.text('Cylinder Transactions (cont.)', marginX, y)
          y += 10
          doc.setFillColor(43, 48, 104)
          const newHeaderY = y
          doc.rect(marginX - 4, newHeaderY - 14, pageWidth - marginX * 2 + 8, 16, 'F')
          doc.setTextColor(255, 255, 255)
          doc.setFontSize(7.5)
          let nx = marginX
          headers.forEach((h, i) => { doc.text(h, nx, newHeaderY); nx += (colWidths[i] || 80) })
          doc.setTextColor(0,0,0)
          y += 12
          rowIndex = 0
        }
        // Background for zebra striping
        if (rowIndex % 2 === 1) {
          doc.setFillColor(245, 247, 250)
          // height will be determined after measuring text; draw later if needed
        }
        // Measure wrapped text for each cell
        doc.setFont('helvetica', 'normal')
        const cellLines: string[][] = []
        const cellWidths: number[] = []
        cells.forEach((cell, i) => {
          const cw = colWidths[i] || 80
          const padding = 2
          const maxW = cw - padding * 2
          const text = String(cell ?? '')
          const lines = doc.splitTextToSize(text, Math.max(10, maxW)) as string[]
          cellLines.push(lines)
          cellWidths.push(cw)
        })
        const maxLines = cellLines.reduce((m, lines) => Math.max(m, lines.length), 1)
        const rowHeight = Math.max(12, maxLines * lineHeight)
        // Draw zebra background now that we know height
        if (rowIndex % 2 === 1) {
          doc.setFillColor(245, 247, 250)
          doc.rect(marginX - 4, y - (lineHeight - 2), pageWidth - marginX * 2 + 8, rowHeight, 'F')
        }
        // Draw text per cell
        doc.setFontSize(baseFontSize)
        let cx = marginX
        cellLines.forEach((lines, i) => {
          const cw = cellWidths[i]
          lines.forEach((line, li) => {
            doc.text(String(line), cx, y + (li * lineHeight))
          })
          cx += cw
        })
        y += rowHeight
        rowIndex++
      }

      // Rows
      list.forEach((t) => {
        const items = (t as any).items as any[] | undefined
        const hasItems = items && items.length > 0
        const productOrItems = hasItems
          ? items!.map((it) => `${it.productName || ''} x${Number(it.quantity)||0} (AED ${(Number(it.amount)||0).toFixed(2)})`).join(' | ')
          : (t.product?.name || '')
        const cylSize = hasItems
          ? items!.map((it) => `${it.cylinderSize || '-'}`).join(' | ')
          : (t.cylinderSize || '-')
        const qty = hasItems
          ? items!.reduce((s, it) => s + (Number(it.quantity)||0), 0)
          : (t.quantity || 0)
        const amt = hasItems
          ? items!.reduce((s, it) => s + (Number(it.amount)||0), 0)
          : (t.amount || 0)
        const party = t.customer?.name || t.supplier?.companyName || ''
        const inv = (t as any).invoiceNumber || (t?._id ? `CYL-${String(t._id).slice(-6).toUpperCase()}` : '')
        const row = [
          t.type,
          party,
          `${productOrItems} / ${cylSize}`,
          String(qty),
          Number(amt).toFixed(2),
          t.depositAmount ? Number(t.depositAmount).toFixed(2) : '',
          t.refillAmount ? Number(t.refillAmount).toFixed(2) : '',
          t.returnAmount ? Number(t.returnAmount).toFixed(2) : '',
          t.paymentMethod || '',
          t.cashAmount ? Number(t.cashAmount).toFixed(2) : '',
          t.bankName || '',
          t.checkNumber || '',
          t.notes || '',
          t.status,
          inv,
          new Date(t.createdAt).toLocaleDateString(),
        ]
        drawRow(row)
      })

      const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')
      const suffix = term ? `-${term.replace(/[^a-z0-9-_]+/g,'_')}` : ''
      doc.save(`cylinder-transactions${suffix}-${ts}.pdf`)
    } catch (e) {
      console.error('[CylinderManagement] PDF export failed:', e)
      alert('Failed to export PDF')
    }
  }

  // Form state with proper defaults
  const [formData, setFormData] = useState({
    type: "deposit" as "deposit" | "refill" | "return",
    customerId: "",
    supplierId: "",
    productId: "",
    productName: "",
    cylinderSize: "small" as string, // Default to small instead of empty string
    quantity: 1,
    amount: 0,
    depositAmount: 0,
    refillAmount: 0,
    returnAmount: 0,
    // New: payment option to control deposit amount behavior
    paymentOption: "debit" as "debit" | "credit" | "delivery_note",
    paymentMethod: "cash" as "cash" | "cheque",
    cashAmount: 0,
    bankName: "",
    checkNumber: "",
    status: "pending" as "pending" | "cleared" | "overdue",
    notes: "",
    // Items support: when items.length > 0, we submit an array of items in a single transaction
    items: [] as Array<{
      productId: string
      productName: string
      cylinderSize: string
      quantity: number
      amount: number // Row amount in AED
    }>,
    // Link to selected security deposit (applies to return transactions)
    linkedDeposit: "",
  })

  useEffect(() => {
    fetchData()
  }, [])

  // When type switches or customer changes, reset security prompt flag
  useEffect(() => {
    setSecurityPrompted(false)
  }, [formData.type, formData.customerId])

  // Helpers for items
  const getProductById = (id: string) => products.find(p => p._id === id)

  const addItem = () => {
    // Add current draft item to items list (or save edit), then reset draft
    if (!draftItem.productId || !draftItem.cylinderSize || (Number(draftItem.quantity) || 0) <= 0) {
      alert('Please select product, size and quantity')
      return
    }
    // stock validation (skip only for return)
    if (formData.type !== 'return') {
      const ok = validateItemStock(draftItem.productId, Number(draftItem.quantity) || 0)
      if (!ok) return
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
    // reset draft
    setDraftItem({ productId: "", productName: "", cylinderSize: "", quantity: 1, amount: 0 })
    setDraftProductSearchTerm("")
    setShowDraftProductSuggestions(false)
    setEditingIndex(null)
  }

  const updateItem = (index: number, field: keyof (typeof formData.items)[number], value: any) => {
    setFormData(prev => {
      const items = [...prev.items]
      const item = { ...items[index] }
      ;(item as any)[field] = value
      // If product changed, auto update name and default amount from leastPrice
      if (field === 'productId') {
        const p = getProductById(value)
        if (p) {
          item.productName = p.name
          item.amount = Number((p.leastPrice).toFixed(2))
        }
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

  const totalItemsAmount = () => formData.items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0)

  const validateItemStock = (productId: string, qty: number) => {
    const p = getProductById(productId)
    if (!p) return true
    // Refill skips stock validation
    if (formData.type === 'return') return true
    if (qty <= p.currentStock) return true
    alert(`Insufficient stock! Available: ${p.currentStock}, Requested: ${qty}`)
    return false
  }

  // Auto status for deposit based on total Amount (items or single) vs Deposit Amount
  useEffect(() => {
    if (formData.type === 'deposit') {
      const baseAmount = formData.items.length > 0 ? totalItemsAmount() : (Number(formData.amount) || 0)
      const depositAmount = Number(formData.depositAmount) || 0
      setFormData(prev => ({ ...prev, status: depositAmount < baseAmount ? 'pending' : 'cleared' }))
    }
  }, [formData.type, formData.amount, formData.depositAmount, formData.items])

  // Enforce delivery note behavior: no deposit and pending status when delivery_note (legacy safety)
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

  // Fetch previous securities and open dialog when Return + customer selected (skip if already linked)
  useEffect(() => {
    const shouldPrompt = formData.type === 'return' && !!formData.customerId && !securityPrompted && !formData.linkedDeposit
    if (!shouldPrompt) return
    ;(async () => {
      try {
        // Fetch previous deposit/security records for this customer
        const res = await cylindersAPI.getAll({ customerId: formData.customerId, type: 'deposit' } as any)
        const list = (res?.data?.data || res?.data || []) as any[]
        // Keep only records with payment details for clarity
        const filtered = Array.isArray(list)
          ? list.filter(r => r && (r.paymentMethod === 'cash' || r.paymentMethod === 'cheque'))
          : []
        setSecurityRecords(filtered)
        setShowSecurityDialog(true)
      } catch (e) {
        console.error('[CylinderManagement] Failed to fetch security records:', e)
        setSecurityRecords([])
        setShowSecurityDialog(true)
      } finally {
        setSecurityPrompted(true)
      }
    })()
  }, [formData.type, formData.customerId, formData.linkedDeposit, securityPrompted])

  const handleSecuritySelect = (rec: any) => {
    const isCash = rec?.paymentMethod === 'cash'
    // Map items from the selected record (if any) into our form's items array
    const mappedItems = Array.isArray(rec?.items)
      ? rec.items.map((it: any) => {
          const prod = it.productId ? getProductById(it.productId) : undefined
          return {
            productId: String(it.productId || ''),
            productName: String(it.productName || prod?.name || ''),
            cylinderSize: String(it.cylinderSize || prod?.cylinderSize || ''),
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
      linkedDeposit: String(rec?._id || ''),
      // If the selected record has items, use them to populate the items section
      items: mappedItems.length > 0 ? mappedItems : prev.items,
    }))
    // Reset any ongoing draft edit state to reflect the selected items cleanly
    setDraftItem({ productId: "", productName: "", cylinderSize: "", quantity: 1, amount: 0 })
    setDraftProductSearchTerm("")
    setShowDraftProductSuggestions(false)
    setEditingIndex(null)
    setShowSecurityDialog(false)
  }

  // Clear irrelevant party based on type
  useEffect(() => {
    if (formData.type === 'refill') {
      // clear customer selection when switching to refill
      setCustomerSearchTerm("")
      setFormData(prev => ({ ...prev, customerId: prev.customerId ? "" : prev.customerId }))
    } else {
      // clear supplier selection when not refill
      setFormData(prev => ({ ...prev, supplierId: prev.supplierId ? "" : prev.supplierId }))
    }
  }, [formData.type])

  // Since Payment Option is hidden for deposit, force it to 'debit'
  useEffect(() => {
    if (formData.type === 'deposit' && formData.paymentOption !== 'debit') {
      setFormData(prev => ({ ...prev, paymentOption: 'debit' }))
    }
  }, [formData.type, formData.paymentOption])

  // Ensure refill has an amount set from selected product price
  useEffect(() => {
    if (formData.type === 'refill' && formData.productId) {
      const selectedProduct = products.find(p => p._id === formData.productId)
      if (selectedProduct && (!formData.amount || formData.amount === 0)) {
        setFormData(prev => ({ ...prev, amount: selectedProduct.leastPrice }))
      }
    }
  }, [formData.type, formData.productId, products])

  const fetchData = async () => {
    try {
      setLoading(true)
      
      // Fetch data with individual error handling
      let transactionsData: CylinderTransaction[] = []
      let customersData: Customer[] = []
      let productsData: Product[] = []
      let suppliersData: Supplier[] = []
      
      try {
        // Fetch both admin and employee cylinder transactions
        const [adminTransactionsResponse, employeeTransactionsResponse] = await Promise.all([
          cylindersAPI.getAll(),
          employeeCylindersAPI.getAll({ all: true })
        ])
        
        // Process admin transactions
        const adminTransactions = adminTransactionsResponse.data?.data || []

        const employeeTransactions = (employeeTransactionsResponse.data?.data || []).map((t: CylinderTransaction) => ({
          ...t,
          isEmployeeTransaction: true,
        }))
        
        // Combine both transaction types
        transactionsData = [...adminTransactions, ...employeeTransactions]
        
      } catch (error) {
        console.error("Failed to fetch transactions:", error)
        transactionsData = []
      }
      
      try {
        const customersResponse = await customersAPI.getAll()
        customersData = Array.isArray(customersResponse.data?.data) 
          ? customersResponse.data.data 
          : Array.isArray(customersResponse.data) 
            ? customersResponse.data 
            : Array.isArray(customersResponse) 
              ? customersResponse 
              : []

      } catch (error) {
        console.error("Failed to fetch customers:", error)
        customersData = []
      }
      // Fetch suppliers
      try {
        const suppliersResponse = await suppliersAPI.getAll()
        const sup = suppliersResponse.data?.data || suppliersResponse.data || suppliersResponse || []
        suppliersData = Array.isArray(sup) ? sup : []
      } catch (error) {
        console.error("Failed to fetch suppliers:", error)
        suppliersData = []
      }
      
      try {
        const productsResponse = await productsAPI.getAll()
        // The products API returns data directly, not in a data property
        const allProducts = productsResponse.data || productsResponse || []
        productsData = allProducts.filter(
          (product: Product) => product.category === "cylinder"
        )
      } catch (error) {
        console.error("Failed to fetch products:", error)
        // Products API might not exist yet, so we'll continue without products
      }
      
      setTransactions(transactionsData)
      setCustomers(customersData)
      setSuppliers(suppliersData)
      setProducts(productsData)
    } catch (error) {
      console.error("Failed to fetch data:", error)
      setTransactions([])
      setCustomers([])
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      
      // Validate required fields
      if (formData.type === 'refill') {
        if (!formData.supplierId || formData.supplierId === '') {
          alert("Please select a supplier for refill")
          return
        }
      } else {
        if (!formData.customerId || formData.customerId === '') {
          alert("Please select a customer")
          return
        }
      }
      
      if (formData.items.length === 0) {
        if (!formData.productId || formData.productId === '') {
          alert("Please select a product")
          return
        }
        if (!formData.cylinderSize || formData.cylinderSize === '') {
          alert("Please select a cylinder size")
          return
        }
        if (!formData.quantity || formData.quantity <= 0) {
          alert("Please enter a valid quantity")
          return
        }
        if (formData.type !== 'refill' && (!formData.amount || formData.amount <= 0)) {
          alert("Please enter a valid amount")
          return
        }
      } else {
        // Validate items rows
        if (formData.items.some(it => !it.productId)) { alert('Please select product for all items'); return }
        if (formData.items.some(it => !it.cylinderSize)) { alert('Please select size for all items'); return }
        if (formData.items.some(it => !it.quantity || it.quantity <= 0)) { alert('Please enter valid quantity for all items'); return }
        if (formData.type !== 'refill' && formData.items.some(it => !it.amount || it.amount <= 0)) { alert('Please enter amount for all items'); return }
      }

      console.log("Form validation passed, creating transaction data:", formData);

      // Submit-time stock validation for all types except return
      if (formData.type !== 'return') {
        if (formData.items.length === 0) {
          const ok = validateStock(formData.productId, Number(formData.quantity) || 0)
          if (!ok) return
        } else {
          for (const it of formData.items) {
            const ok = validateStock(it.productId, Number(it.quantity) || 0)
            if (!ok) return
          }
        }
      }

      // Build payload: if items exist, aggregate totals and include items array
      const itemsTotal = formData.items.length > 0 ? totalItemsAmount() : Number(formData.amount) || 0
      const single = formData.items.length === 0
      const firstItem = single ? null : formData.items[0]
      const totalQuantity = single ? (Number(formData.quantity) || 0) : formData.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)

      const baseData: any = {
        type: formData.type,
        // Backward-compatible primary fields required by API
        product: single ? formData.productId : (firstItem?.productId || ''),
        cylinderSize: single ? formData.cylinderSize : (firstItem?.cylinderSize || ''),
        quantity: totalQuantity,
        amount: single ? (Number(formData.amount) || 0) : itemsTotal,
        depositAmount: formData.type === 'deposit' ? (formData.paymentOption === 'delivery_note' ? 0 : Number(formData.depositAmount) || 0) : 0,
        refillAmount: formData.type === 'refill' ? (single ? (Number(formData.amount) || 0) : itemsTotal) : 0,
        returnAmount: formData.type === 'return' ? (single ? (Number(formData.amount) || 0) : itemsTotal) : 0,
        paymentOption: formData.paymentOption,
        paymentMethod: formData.paymentOption === 'debit' ? formData.paymentMethod : undefined,
        cashAmount: formData.paymentOption === 'debit' && formData.paymentMethod === 'cash' ? Number(formData.cashAmount) : 0,
        bankName: formData.paymentOption === 'debit' && formData.paymentMethod === 'cheque' ? formData.bankName : undefined,
        checkNumber: formData.paymentOption === 'debit' && formData.paymentMethod === 'cheque' ? formData.checkNumber : undefined,
        status: formData.type === 'return' ? 'cleared' : formData.status,
        notes: formData.notes,
      }

      // Include items array for multi-item transactions
      if (!single) {
        baseData.items = formData.items.map(it => ({
          productId: it.productId,
          productName: it.productName,
          cylinderSize: it.cylinderSize,
          quantity: Number(it.quantity) || 0,
          amount: Number(it.amount) || 0,
        }))
      }

      // Map party fields
      if (formData.type === 'refill') {
        baseData.supplier = formData.supplierId
      } else {
        baseData.customer = formData.customerId
      }

      const transactionData = baseData
      // Attach linkedDeposit only for return transactions
      if (formData.type === 'return' && formData.linkedDeposit) {
        ;(transactionData as any).linkedDeposit = formData.linkedDeposit
      }
      console.log('[CylinderManagement] Submitting payload:', transactionData)

      let savedResponse: any = null
      if (editingTransaction) {
        savedResponse = await cylindersAPI.update(editingTransaction._id, transactionData)
      } else {
        // Use specific endpoints; for refill, use unified POST that supports supplier
        switch (formData.type) {
          case "deposit":
            savedResponse = await cylindersAPI.deposit(transactionData)
            break
          case "refill":
            savedResponse = await cylindersAPI.create(transactionData)
            break
          case "return":
            savedResponse = await cylindersAPI.return(transactionData)
            break
          default:
            savedResponse = await cylindersAPI.create(transactionData)
        }
      }

      await fetchData()
      resetForm()
      setIsDialogOpen(false)

      // Auto-open signature dialog (skip for returns)
      try {
        const savedTx = (savedResponse?.data?.data) || (savedResponse?.data) || null
        const txType = savedTx?.type || formData.type
        if (txType !== 'return') {
          const normalized: any = {
            _id: savedTx?._id || `temp-${Date.now()}`,
            type: txType,
            customer: savedTx?.customer || (txType !== 'refill' ? {
              _id: formData.customerId,
              name: customers.find(c=>c._id===formData.customerId)?.name || 'Customer',
              phone: customers.find(c=>c._id===formData.customerId)?.phone || '',
              address: customers.find(c=>c._id===formData.customerId)?.address || '',
            } : undefined),
            supplier: savedTx?.supplier || (txType === 'refill' ? {
              _id: formData.supplierId,
              companyName: suppliers.find(s=>s._id===formData.supplierId)?.companyName || 'Supplier',
            } : undefined),
            product: savedTx?.product || products.find(p=>p._id===formData.productId) || undefined,
            cylinderSize: savedTx?.cylinderSize || formData.cylinderSize,
            quantity: savedTx?.quantity || (formData.items.length>0 ? formData.items.reduce((s,it)=>s+(Number(it.quantity)||0),0) : formData.quantity),
            amount: savedTx?.amount || (formData.items.length>0 ? formData.items.reduce((s,it)=>s+(Number(it.amount)||0),0) : (Number(formData.amount)||0)),
            items: savedTx?.items || (formData.items.length>0 ? formData.items : undefined),
            status: savedTx?.status || formData.status,
            notes: savedTx?.notes || formData.notes,
            createdAt: savedTx?.createdAt || new Date().toISOString(),
          }
          setPendingTransaction(normalized)
          setShowSignatureDialog(true)
        }
      } catch {}
    } catch (error: any) {
      console.error("Failed to save transaction:", error)
      console.error('Server response data:', error?.response?.data)
      alert(
        error?.response?.data?.details ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to save transaction"
      )
    }
  }

  const resetForm = () => {
    setFormData({
      type: "" as any, // Clear to show placeholder
      customerId: "",
      supplierId: "",
      productId: "",
      productName: "", // Added missing productName field
      cylinderSize: "",
      quantity: "" as any, // Clear to show placeholder
      amount: "" as any, // Clear to show placeholder
      depositAmount: "" as any,
      refillAmount: "" as any,
      returnAmount: "" as any,
      paymentOption: "debit" as any,
      paymentMethod: "cash" as "cash" | "cheque",
      cashAmount: "" as any,
      bankName: "",
      checkNumber: "",
      status: "pending" as any, // Default to pending
      notes: "",
      items: [],
      linkedDeposit: "",
    })
    setCustomerSearchTerm("")
    setShowCustomerSuggestions(false)
    setFilteredCustomerSuggestions([])
    setEditingTransaction(null)
  }

  const handleEdit = (transaction: CylinderTransaction) => {
    setEditingTransaction(transaction)
    const items = (transaction as any).items as any[] | undefined
    const first = items && items.length > 0 ? items[0] : null
    setFormData({
      type: transaction.type,
      customerId: transaction.customer?._id || "",
      supplierId: transaction.supplier?._id || "",
      productId: first ? (first.productId || "") : ((transaction as any).productId || transaction.product?._id || ""),
      productName: first ? (first.productName || "") : ((transaction as any).productName || transaction.product?.name || ""),
      cylinderSize: first ? (first.cylinderSize || "") : transaction.cylinderSize,
      quantity: first ? (first.quantity || 0) : transaction.quantity,
      amount: items && items.length > 0 ? items.reduce((s, it) => s + (Number(it.amount)||0), 0) : transaction.amount,
      depositAmount: transaction.depositAmount || 0,
      refillAmount: transaction.refillAmount || 0,
      returnAmount: transaction.returnAmount || 0,
      paymentOption: ((transaction as any).paymentOption || "debit") as any,
      paymentMethod: (transaction as any).paymentMethod || "cash",
      cashAmount: (transaction as any).cashAmount || 0,
      bankName: (transaction as any).bankName || "",
      checkNumber: (transaction as any).checkNumber || "",
      status: transaction.status,
      notes: transaction.notes || "",
      items: items && items.length > 0 ? items.map((it: any) => ({
        productId: it.productId,
        productName: it.productName,
        cylinderSize: it.cylinderSize,
        quantity: it.quantity,
        amount: it.amount,
      })) : [],
      linkedDeposit: (transaction as any)?.linkedDeposit?._id || (transaction as any)?.linkedDeposit || "",
    })
    setCustomerSearchTerm(transaction.customer?.name || "")
    setShowCustomerSuggestions(false)
    setFilteredCustomerSuggestions([])
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string, isEmployee?: boolean) => {
    if (window.confirm("Are you sure you want to delete this transaction?")) {
      try {
        if (isEmployee) {
          await employeeCylindersAPI.delete(id)
        } else {
          await cylindersAPI.delete(id)
        }
        fetchData()
      } catch (error) {
        console.error("Failed to delete transaction:", error)
      }
    }
  }

  const handleReceiptClick = (transaction: CylinderTransaction) => {
    // Allow receipt generation for all types, including 'return'

    if (!customerSignature) {
      // No signature yet - show signature dialog first
      setPendingTransaction(transaction)
      setShowSignatureDialog(true)
    } else {
      // Signature already exists - show receipt directly with existing signature
      const itemsSrc = (transaction as any).items as any[] | undefined
      const hasItems = Array.isArray(itemsSrc) && itemsSrc.length > 0

      const items = hasItems
        ? itemsSrc.map((it: any) => {
            const baseName = it.productName || products.find(p => p._id === it.productId)?.name || 'Product'
            const sizeLabel = it.cylinderSize ? ` (${it.cylinderSize})` : ''
            const qty = Number(it.quantity) || 0
            const rowTotal = Number(it.amount) || 0
            const unitPrice = qty > 0 ? rowTotal / qty : rowTotal
            return {
              product: { name: `${baseName}${sizeLabel}` },
              quantity: qty,
              price: unitPrice,
              total: rowTotal,
            }
          })
        : [{
            product: {
              name: `${transaction.product?.name || (transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1))}${transaction.cylinderSize ? ` (${transaction.cylinderSize})` : ''}`,
            },
            quantity: Number(transaction.quantity) || 0,
            price: Number(transaction.amount) || 0,
            total: (Number(transaction.amount) || 0) * (Number(transaction.quantity) || 0),
          }]

      const totalAmount = items.reduce((s, it) => s + (Number(it.total) || 0), 0)

      const saleData = {
        _id: transaction._id,
        invoiceNumber: `CYL-${transaction._id.slice(-8).toUpperCase()}`,
        customer: {
          name: transaction.customer?.name || "Unknown Customer",
          phone: transaction.customer?.phone || "",
          address: transaction.customer?.address || ""
        },
        items,
        totalAmount,
        paymentMethod: (transaction as any).paymentMethod || "cash",
        paymentStatus: transaction.status || "pending",
        // include type to support header selection logic in receipt
        type: transaction.type,
        createdAt: transaction.createdAt,
        customerSignature: customerSignature,
      }
      setReceiptDialogData(saleData)
    }
  }

  const handleSignatureComplete = (signature: string) => {
    console.log('CylinderManagement - Signature received:', signature)
    console.log('CylinderManagement - Signature length:', signature?.length)
    console.log('CylinderManagement - Pending transaction:', pendingTransaction?._id)
    
    // Set signature state for future use
    setCustomerSignature(signature)
    setShowSignatureDialog(false)
    
    // Directly open receipt dialog with the pending transaction and signature embedded
    if (pendingTransaction) {
      console.log('CylinderManagement - Opening receipt dialog with signature embedded')
      const itemsSrc = (pendingTransaction as any).items as any[] | undefined
      const hasItems = Array.isArray(itemsSrc) && itemsSrc.length > 0

      const items = hasItems
        ? itemsSrc.map((it: any) => {
            const baseName = it.productName || products.find(p => p._id === it.productId)?.name || 'Product'
            const sizeLabel = it.cylinderSize ? ` (${it.cylinderSize})` : ''
            const qty = Number(it.quantity) || 0
            const rowTotal = Number(it.amount) || 0
            const unitPrice = qty > 0 ? rowTotal / qty : rowTotal
            return {
              product: { name: `${baseName}${sizeLabel}` },
              quantity: qty,
              price: unitPrice,
              total: rowTotal,
            }
          })
        : [{
            product: {
              name: `${pendingTransaction.product?.name || (pendingTransaction.type.charAt(0).toUpperCase() + pendingTransaction.type.slice(1))}${pendingTransaction.cylinderSize ? ` (${pendingTransaction.cylinderSize})` : ''}`,
            },
            quantity: Number(pendingTransaction.quantity) || 0,
            price: Number(pendingTransaction.amount) || 0,
            total: (Number(pendingTransaction.amount) || 0) * (Number(pendingTransaction.quantity) || 0),
          }]

      const totalAmount = items.reduce((s, it) => s + (Number(it.total) || 0), 0)

      const saleData = {
        _id: pendingTransaction._id,
        invoiceNumber: `CYL-${pendingTransaction._id.slice(-8).toUpperCase()}`,
        customer: {
          name: pendingTransaction.customer?.name || "Unknown Customer",
          phone: pendingTransaction.customer?.phone || "",
          address: pendingTransaction.customer?.address || ""
        },
        items,
        totalAmount,
        paymentMethod: (pendingTransaction as any).paymentMethod || "cash",
        paymentStatus: pendingTransaction.status || "pending",
        // include type to support header selection logic in receipt
        type: pendingTransaction.type,
        createdAt: pendingTransaction.createdAt,
        customerSignature: signature,
      }
      setReceiptDialogData(saleData)
      setPendingTransaction(null)
    }
  }

  const handleSignatureCancel = () => {
    setShowSignatureDialog(false)
    setPendingTransaction(null)
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

  // Stock validation function
  const validateStock = (productId: string, requestedQuantity: number) => {
    const selectedProduct = products.find(p => p._id === productId)
    if (!selectedProduct) {
      setStockValidationMessage("Product not found")
      setShowStockValidationPopup(true)
      return false
    }
    // Skip stock validation only for return transactions
    if (formData.type === 'return') {
      return true
    }

    if (requestedQuantity > selectedProduct.currentStock) {
      setStockValidationMessage(
        `Insufficient stock! Available: ${selectedProduct.currentStock}, Requested: ${requestedQuantity}`
      )
      setShowStockValidationPopup(true)
      return false
    }

    return true
  }

  // Auto-status logic based on Amount and Deposit Amount
  const updateStatusBasedOnAmounts = (amount: number, depositAmount: number) => {
    if (formData.type === "deposit" && depositAmount > 0) {
      if (depositAmount >= amount) {
        setFormData(prev => ({ ...prev, status: "cleared" }))
      } else {
        setFormData(prev => ({ ...prev, status: "pending" }))
      }
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

  const filteredTransactions = Array.isArray(transactions) ? transactions.filter((transaction) => {
    const term = searchTerm.toLowerCase()
    const fallbackInv = transaction._id ? `CYL-${transaction._id.slice(-6).toUpperCase()}` : ''
    const inv = (transaction as any).invoiceNumber || fallbackInv
    const matchesSearch =
      transaction.customer?.name?.toLowerCase().includes(term) ||
      transaction.cylinderSize?.toLowerCase().includes(term) ||
      (inv || '').toLowerCase().includes(term)
    const matchesType = activeTab === 'all' || transaction.type === activeTab
    return matchesSearch && matchesType
  }) : []

  // Pagination (20 per page)
  const [txPage, setTxPage] = useState(1)
  const txPageSize = 20
  const txTotalPages = Math.max(1, Math.ceil(filteredTransactions.length / txPageSize))
  const paginatedTransactions = filteredTransactions.slice(
    (txPage - 1) * txPageSize,
    txPage * txPageSize
  )

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "deposit":
        return <ArrowDown className="w-4 h-4 text-blue-600" />
      case "refill":
        return <RotateCcw className="w-4 h-4 text-green-600" />
      case "return":
        return <ArrowUp className="w-4 h-4 text-orange-600" />
      default:
        return <Cylinder className="w-4 h-4" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Pending</Badge>
      case "cleared":
        return <Badge className="bg-green-100 text-green-800 border-green-200">Cleared</Badge>
      case "overdue":
        return <Badge className="bg-red-100 text-red-800 border-red-200">Overdue</Badge>     
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "deposit":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Deposit</Badge>
      case "refill":
        return <Badge className="bg-green-100 text-green-800 border-green-200">Refill</Badge>
      case "return":
        return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Return</Badge>
      default:
        return <Badge variant="secondary">{type}</Badge>
    }
  }

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
        <h1 className="text-4xl font-bold mb-2">Cylinder Management</h1>
        <p className="text-white/80 text-lg">Manage cylinder deposits, refills, and returns</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Total Deposits</CardTitle>
            <ArrowDown className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {(transactions || []).filter((t) => t.type === "deposit").length}
            </div>
            <p className="text-xs text-gray-600 mt-1">Cylinders deposited</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Total Refills</CardTitle>
            <RotateCcw className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {(transactions || []).filter((t) => t.type === "refill").length}
            </div>
            <p className="text-xs text-gray-600 mt-1">Cylinders refilled</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Total Returns</CardTitle>
            <ArrowUp className="h-5 w-5 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              {(transactions || []).filter((t) => t.type === "return").length}
            </div>
            <p className="text-xs text-gray-600 mt-1">Cylinders returned</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Active Cylinders</CardTitle>
            <Cylinder className="h-5 w-5 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {(transactions || []).filter((t) => t.status === "pending").length}
            </div>
            <p className="text-xs text-gray-600 mt-1">Pending/Active</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="w-full">
          <div className="flex items-center gap-3 w-full">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search by invoice no., customer or cylinder size..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={handleSearchInputFocus}
                onBlur={handleSearchInputBlur}
                className="pl-10"
              />
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

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white w-full md:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              New Transaction
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="dialog-description">
            <DialogHeader>
              <DialogTitle>{editingTransaction ? "Edit Transaction" : "Create New Transaction"}</DialogTitle>
              <div id="dialog-description" className="sr-only">
                {editingTransaction ? "Edit an existing cylinder transaction" : "Create a new cylinder transaction with customer, type, and payment details"}
              </div>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Transaction Type *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: "deposit" | "refill" | "return") =>
                      setFormData({ ...formData, type: value })
                    }
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deposit">Deposit</SelectItem>
                      <SelectItem value="refill">Refill</SelectItem>
                      <SelectItem value="return">Return</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.type !== 'refill' ? (
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
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="supplier">Supplier *</Label>
                    <Select
                      value={formData.supplierId}
                      onValueChange={(value) => setFormData({ ...formData, supplierId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s) => (
                          <SelectItem key={s._id} value={s._id}>
                            {s.companyName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Items section: single-entry draft form and items table */}
              <div className="space-y-4">
                <Label className="text-lg font-semibold">Items</Label>

                {/* 2x2 grid draft form */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Product with autocomplete */}
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
                                setDraftItem(prev => ({ ...prev, productId: p._id, productName: p.name, amount: Number((p.leastPrice).toFixed(2)) }))
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

                  {/* Cylinder Size */}
                  <div className="space-y-2">
                    <Label>Cylinder Size *</Label>
                    <Select
                      value={draftItem.cylinderSize}
                      onValueChange={(value) => setDraftItem(prev => ({ ...prev, cylinderSize: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Small</SelectItem>
                        <SelectItem value="large">Large</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Quantity */}
                  <div className="space-y-2">
                    <Label>Quantity *</Label>
                    <Input
                      type="number"
                      min={1}
                      value={draftItem.quantity}
                      onChange={(e) => {
                        const q = Number.parseInt(e.target.value) || 1
                        setDraftItem(prev => ({ ...prev, quantity: q }))
                      }}
                    />
                  </div>

                  {/* Amount */}
                  <div className="space-y-2">
                    <Label>Amount *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={draftItem.amount}
                      onChange={(e) => setDraftItem(prev => ({ ...prev, amount: Number.parseFloat(e.target.value) || 0 }))}
                    />
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
                          <TableHead>Size</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Amount (AED)</TableHead>
                          <TableHead className="w-32">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {formData.items.map((it, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{it.productName || products.find(p => p._id === it.productId)?.name || '-'}</TableCell>
                            <TableCell className="capitalize">{it.cylinderSize || '-'}</TableCell>
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
                          <TableCell colSpan={3} className="text-right font-semibold">Total</TableCell>
                          <TableCell className="font-semibold">AED {formData.items.reduce((s, it) => s + (Number(it.amount)||0), 0).toFixed(2)}</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Removed legacy single-item-only fields; use draft + items table instead */}

              {/* Payment Option, Received Via, Deposit Amount, Status, and Notes Section */}
              {formData.type === 'deposit' && (
                <div className="space-y-4">
                  {/* Received Via (deposit) */}
                  <div className="space-y-2">
                    <Label htmlFor="paymentMethod">Received Via</Label>
                    <Select
                      value={formData.paymentMethod}
                      onValueChange={(value: 'cash' | 'cheque') =>
                        setFormData({ ...formData, paymentMethod: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select received via" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.paymentMethod === 'cash' && (
                    <div className="space-y-2">
                      <Label htmlFor="cashAmount">Security Cash</Label>
                      <Input
                        id="cashAmount"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.cashAmount}
                        onChange={(e) =>
                          setFormData({ ...formData, cashAmount: Number.parseFloat(e.target.value) || 0 })
                        }
                        placeholder="Enter cash amount"
                      />
                    </div>
                  )}

                  {formData.paymentMethod === 'cheque' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="bankName">Bank Name</Label>
                        <Input
                          id="bankName"
                          type="text"
                          value={formData.bankName}
                          onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                          placeholder="Enter bank name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="checkNumber">Check Number</Label>
                        <Input
                          id="checkNumber"
                          type="text"
                          value={formData.checkNumber}
                          onChange={(e) => setFormData({ ...formData, checkNumber: e.target.value })}
                          placeholder="Enter check number"
                        />
                      </div>
                    </div>
                  )}

                  {/* Deposit Amount */}
                  <div className="space-y-2">
                    <Label htmlFor="depositAmount">Deposit Amount</Label>
                    <Input
                      id="depositAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.paymentOption === 'delivery_note' ? 0 : formData.depositAmount}
                      onChange={(e) =>
                        setFormData({ ...formData, depositAmount: parseFloat(e.target.value) || 0 })
                      }
                      disabled={formData.paymentOption === 'delivery_note'}
                    />
                    {formData.paymentOption === 'delivery_note' && (
                      <p className="text-sm text-gray-500">Deposit amount is 0 for Delivery Note. Status will be set to Pending.</p>
                    )}
                  </div>

                  {/* Status */}
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value: 'pending' | 'cleared' | 'overdue') =>
                        setFormData({ ...formData, status: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="cleared">Cleared</SelectItem>
                        <SelectItem value="overdue">Overdue</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Return: Received Via and Security fields */}
              {formData.type === 'return' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="paymentMethod">Received Via</Label>
                    <Select
                      value={formData.paymentMethod}
                      onValueChange={(value: 'cash' | 'cheque') =>
                        setFormData({ ...formData, paymentMethod: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select received via" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.paymentMethod === 'cash' && (
                    <div className="space-y-2">
                      <Label htmlFor="cashAmount">Security Cash</Label>
                      <Input
                        id="cashAmount"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.cashAmount}
                        onChange={(e) =>
                          setFormData({ ...formData, cashAmount: Number.parseFloat(e.target.value) || 0 })
                        }
                        placeholder="Enter cash amount"
                      />
                    </div>
                  )}

                  {formData.paymentMethod === 'cheque' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="bankName">Bank Name</Label>
                        <Input
                          id="bankName"
                          type="text"
                          value={formData.bankName}
                          onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                          placeholder="Enter bank name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="checkNumber">Check Number</Label>
                        <Input
                          id="checkNumber"
                          type="text"
                          value={formData.checkNumber}
                          onChange={(e) => setFormData({ ...formData, checkNumber: e.target.value })}
                          placeholder="Enter check number"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Notes Section - always visible */}
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

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white">
                  {editingTransaction ? 'Update Transaction' : 'Create Transaction'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Stock Validation Popup */}
        {showStockValidationPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowStockValidationPopup(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl p-8 mx-4 max-w-md w-full transform transition-all duration-300 scale-100 animate-in fade-in-0 zoom-in-95">
              <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-red-500 to-red-600 rounded-full">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="text-center">
                <h3 className="text-xl font-bold text-gray-900 mb-2">Stock Validation Error</h3>
                <p className="text-gray-600 mb-6">{stockValidationMessage}</p>
                <button
                  onClick={() => setShowStockValidationPopup(false)}
                  className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-red-600 hover:to-red-700 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  Got It
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

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
                      value={exportSearch}
                      onChange={(e) => handleExportSearchChange(e.target.value)}
                      onFocus={handleExportInputFocus}
                      onBlur={handleExportInputBlur}
                      className="bg-white text-gray-900 placeholder:text-gray-500 w-full sm:w-64 h-9"
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
                <TabsTrigger value="refill" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-green-600 rounded-none text-base font-semibold px-4 py-3">Refills</TabsTrigger>
                <TabsTrigger value="return" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-orange-600 rounded-none text-base font-semibold px-4 py-3">Returns</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value={activeTab} className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      {renderTableHeaders()}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.length > 0 ? (
                      paginatedTransactions.map((transaction) => (
                        <TableRow key={transaction._id} className="hover:bg-gray-50">
                          {renderTableCells(transaction)}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={getVisibleColumns().length} className="h-24 text-center text-lg text-gray-500">
                          No transactions found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination controls */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4">
                <div className="text-sm text-gray-600">
                  Showing {filteredTransactions.length === 0 ? 0 : (txPage - 1) * txPageSize + 1}
                  -{Math.min(txPage * txPageSize, filteredTransactions.length)} of {filteredTransactions.length}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    className="bg-white text-[#2B3068] hover:bg-gray-100"
                    disabled={txPage <= 1}
                    onClick={() => setTxPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <div className="hidden sm:flex items-center gap-1">
                    {Array.from({ length: txTotalPages }, (_, i) => i + 1).slice(
                      Math.max(0, txPage - 3),
                      Math.max(0, txPage - 3) + 5
                    ).map((p) => (
                      <button
                        key={p}
                        onClick={() => setTxPage(p)}
                        className={`px-3 py-1 rounded text-sm ${p === txPage ? 'bg-[#2B3068] text-white' : 'bg-white text-[#2B3068] hover:bg-gray-100 border'}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="secondary"
                    className="bg-white text-[#2B3068] hover:bg-gray-100"
                    disabled={txPage >= txTotalPages}
                    onClick={() => setTxPage((p) => Math.min(txTotalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Receipt Dialog */}
      {receiptDialogData && (
        <ReceiptDialog
          sale={receiptDialogData}
          useReceivingHeader
          onClose={() => setReceiptDialogData(null)}
        />
      )}

      {/* Signature Dialog */}
      {showSignatureDialog && (
        <SignatureDialog
          isOpen={showSignatureDialog}
          onClose={handleSignatureCancel}
          onSignatureComplete={handleSignatureComplete}
        />
      )}

      {/* Previous Security Select Dialog */}
      <SecuritySelectDialog
        open={showSecurityDialog}
        onOpenChange={setShowSecurityDialog}
        records={securityRecords}
        onSelect={handleSecuritySelect}
      />
    </div>
  );
}
