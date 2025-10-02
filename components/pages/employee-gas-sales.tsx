"use client"

import { useState, useEffect, Fragment } from "react"

import type { SVGProps } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { customersAPI } from "@/lib/api"

import employeeSalesAPI from "@/utils/apis/employeeSalesAPI"
import { ReceiptDialog } from '@/components/receipt-dialog';
import { SignatureDialog } from '@/components/signature-dialog';
import { ProductDropdown } from '@/components/ui/product-dropdown';
import { Trash2, MoveHorizontalIcon, SearchIcon } from 'lucide-react';
import jsPDF from 'jspdf'

interface EmployeeGasSalesProps {
  user: {
    id: string
    name: string
    role: string
  }
}

interface Sale {
  _id: string
  invoiceNumber: string
  customer: Customer
  category: string
  items: {
    product: {
      _id: string
      name: string
      costPrice: number
      leastPrice: number
    }
    quantity: number
    price: number
  }[]
  totalAmount: number
  paymentMethod: string
  paymentStatus: string
  receivedAmount?: number
  notes?: string
  customerSignature?: string
  employee: string
  createdAt: string
}

interface Customer {
  _id: string
  name: string
  serialNumber?: string
  phone?: string
  email?: string
  address?: string
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

// Types for form state to avoid inference issues when initializing with empty arrays
type FormItem = {
  productId: string
  quantity: string
  price: string
  category?: "gas" | "cylinder"
  cylinderSize?: string
}

type FormState = {
  customerId: string
  category: "gas" | "cylinder"
  items: FormItem[]
  receivedAmount: string
  paymentMethod: string
  paymentStatus: "cleared" | "pending" | "overdue"
  paymentOption: "debit" | "credit" | "delivery_note"
  notes: string
}

export function EmployeeGasSales({ user }: EmployeeGasSalesProps) {
  const [sales, setSales] = useState<Sale[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingSale, setEditingSale] = useState<Sale | null>(null)
  const [priceAlert, setPriceAlert] = useState<{ message: string; index: number | null }>({ message: '', index: null })
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null)
  const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false)
  const [saleForReceipt, setSaleForReceipt] = useState<any | null>(null);

  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  // Export filters
  const [exportStart, setExportStart] = useState<string>("")
  const [exportEnd, setExportEnd] = useState<string>("")
  const [exportCustomerId, setExportCustomerId] = useState<string>("")
  const [exportCustomerSearch, setExportCustomerSearch] = useState<string>("")
  const [exportSuggestions, setExportSuggestions] = useState<Customer[]>([])
  // Show/Hide export inputs in header (to match admin styling)
  const [showExportInput, setShowExportInput] = useState(false)

  // Customer autocomplete functionality for form
  const [customerSearchTerm, setCustomerSearchTerm] = useState("")
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false)
  const [filteredCustomerSuggestions, setFilteredCustomerSuggestions] = useState<Customer[]>([])
  // Per-item product autocomplete state
  const [productSearchTerms, setProductSearchTerms] = useState<string[]>([""])
  const [showProductSuggestions, setShowProductSuggestions] = useState<boolean[]>([false])
  // Single-entry item input state (2x2 grid)
  const [currentItem, setCurrentItem] = useState<{ category: "gas" | "cylinder"; productId: string; quantity: string; price: string; cylinderSize?: string }>({
    category: "gas",
    productId: "",
    quantity: "1",
    price: "",
  })
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null)
  const [entryProductSearch, setEntryProductSearch] = useState("")
  const [showEntrySuggestions, setShowEntrySuggestions] = useState(false)

  // Form state
  const [formData, setFormData] = useState<FormState>({
    customerId: "",
    category: "gas",
    items: [],
    receivedAmount: "",
    paymentMethod: "cash",
    paymentStatus: "cleared",
    paymentOption: "debit", // debit | credit | delivery_note
    notes: "",
  })

  // Stock and price validation states
  const [showStockInsufficientPopup, setShowStockInsufficientPopup] = useState(false)
  const [stockErrorMessage, setStockErrorMessage] = useState("")
  const [userInteractedWithPopup, setUserInteractedWithPopup] = useState(false)
  const [showPriceValidationPopup, setShowPriceValidationPopup] = useState(false)
  const [validationMessage, setValidationMessage] = useState("")

  // Track expanded invoice groups in Sales History table
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  // Auto-dismiss stock popup after 5s, but only if user hasn't interacted with it
  useEffect(() => {
    if (showStockInsufficientPopup && !userInteractedWithPopup) {
      const timer = setTimeout(() => {
        setShowStockInsufficientPopup(false)
      }, 5000) // 5 seconds for better user experience
      return () => clearTimeout(timer)
    }
  }, [showStockInsufficientPopup, userInteractedWithPopup])

  // Reset interaction state when popup is closed
  useEffect(() => {
    if (!showStockInsufficientPopup) {
      setUserInteractedWithPopup(false)
    }
  }, [showStockInsufficientPopup])

  useEffect(() => {
    fetchData()
  }, [user.id])

  // Reset pagination on filter/search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter])

  // Export customer autocomplete
  useEffect(() => {
    const term = exportCustomerSearch.trim().toLowerCase()
    if (!term) {
      setExportSuggestions([])
      return
    }
    const list = customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(term) ||
        (customer.phone && customer.phone.includes(term)) ||
        (customer.email && customer.email.toLowerCase().includes(term))
    ).slice(0, 8)
    setExportSuggestions(list)
  }, [exportCustomerSearch, customers])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [salesResponse, customersResponse, stockAssignmentsResponse] = await Promise.all([
        fetch(`/api/employee-sales?employeeId=${user.id}`),
        customersAPI.getAll(),
        fetch(`/api/stock-assignments?employeeId=${user.id}&status=received`),
      ])
      
      const salesData = await salesResponse.json()
      console.log('Employee sales response:', salesData)
      
      // Ensure sales data is always an array
      const salesArray = Array.isArray(salesData?.data) 
        ? salesData.data 
        : Array.isArray(salesData) 
          ? salesData 
          : []
      
      let customersData = Array.isArray(customersResponse.data?.data) 
        ? customersResponse.data.data 
        : Array.isArray(customersResponse.data) 
          ? customersResponse.data 
          : Array.isArray(customersResponse) 
            ? customersResponse 
            : []
      
      // Fetch employee's assigned products from stock assignments
      const stockAssignmentsData = await stockAssignmentsResponse.json()
      console.log('Employee stock assignments:', stockAssignmentsData)
      
      // Extract products from stock assignments with remaining quantities
      const allEmployeeProducts: Product[] = [];
      if (stockAssignmentsData?.data && Array.isArray(stockAssignmentsData.data)) {
        stockAssignmentsData.data.forEach((assignment: any) => {
          if (assignment.product && assignment.remainingQuantity > 0) {
            const productWithStock = {
              ...assignment.product,
              currentStock: assignment.remainingQuantity // Use remaining quantity as current stock
            }
            allEmployeeProducts.push(productWithStock)
          }
        })
      }
      // Deduplicate products by _id
      const dedupedAllProducts = Array.from(
        new Map(allEmployeeProducts.map(p => [p._id, p])).values()
      )
      // Filter products for the current category
      const initialCategory = formData.category || "gas";
      const filteredProducts = dedupedAllProducts.filter((product: Product) => product.category === initialCategory);
      setCustomers(customersData)
      setAllProducts(dedupedAllProducts)
      setProducts(filteredProducts)
      setSales(salesArray)
    } catch (error) {
      console.error("Failed to fetch data:", error)
      setSales([])
      setCustomers([])
      setProducts([])
      setAllProducts([])
    } finally {
      setLoading(false)
    }
  }

  // Edit an existing sale: populate form and open dialog
  const handleEdit = (sale: Sale) => {
    setEditingSale(sale)

    // Map sale items to form items
    const formItems: FormItem[] = (Array.isArray(sale.items) ? sale.items : []).map((it: any) => {
      const productId = typeof it.product === 'object' ? (it.product?._id || '') : (it.product || '')
      const category = (it.category as 'gas' | 'cylinder') || (typeof it.product === 'object' ? it.product?.category : undefined)
      return {
        productId,
        quantity: String(it.quantity ?? ''),
        price: String(it.price ?? ''),
        category,
        cylinderSize: (it.cylinderSize as any) || undefined,
      }
    })

    setFormData({
      customerId: (sale.customer as any)?._id || (sale.customer as any) || '',
      category: (sale as any).category || 'gas',
      items: formItems,
      receivedAmount: typeof sale.receivedAmount === 'number' ? String(sale.receivedAmount) : (sale as any).receivedAmount || '',
      paymentMethod: (sale as any).paymentMethod || 'cash',
      paymentStatus: (sale as any).paymentStatus || 'cleared',
      paymentOption: formData.paymentOption, // keep current selection
      notes: (sale as any).notes || '',
    })

    setCustomerSearchTerm((sale.customer as any)?.name || '')
    setIsDialogOpen(true)
    setEditingItemIndex(null)
    setEntryProductSearch('')
    setShowEntrySuggestions(false)
  }

  const resetForm = () => {
    setFormData({
      customerId: "",
      category: "gas",
      items: [],
      receivedAmount: "",
      paymentMethod: "cash",
      paymentStatus: "cleared",
      paymentOption: "debit",
      notes: "",
    })
    setCustomerSearchTerm("")
    setProductSearchTerms([""])
    setShowProductSuggestions([false])
    setEditingSale(null)
    resetCurrentItem()
  }

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case "cleared":
        return <Badge className="bg-green-100 text-green-800">Cleared</Badge>
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
      case "overdue":
        return <Badge className="bg-red-100 text-red-800">Overdue</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    const numericValue = parseFloat(value) || 0
    
    let newFormData = { ...formData, [name]: value }
    
    // Auto-select status based on received amount vs total amount
    if (name === "receivedAmount") {
      const totalAmount = calculateTotalAmount()
      if (numericValue === totalAmount && totalAmount > 0) {
        newFormData.paymentStatus = "cleared"
      } else if (numericValue > 0 && numericValue < totalAmount) {
        newFormData.paymentStatus = "pending"
      } else if (numericValue === 0) {
        newFormData.paymentStatus = "pending"
      }
    }
    
    setFormData(newFormData)
  }

  // Calculate total amount from items
  const calculateTotalAmount = () => {
    return formData.items.reduce((sum: number, item: FormItem) => {
      const quantity = Number(item.quantity) || 0
      const price = Number(item.price) || 0
      return sum + price * quantity
    }, 0)
  }

  const handleCustomerSearchChange = (value: string) => {
    setCustomerSearchTerm(value)
    if (value) {
      const filtered = customers.filter(
        (customer) =>
          customer.name.toLowerCase().includes(value.toLowerCase()) ||
          (customer.serialNumber && customer.serialNumber.toLowerCase().includes(value.toLowerCase())) ||
          (customer.phone && customer.phone.includes(value)) ||
          (customer.email && customer.email.toLowerCase().includes(value.toLowerCase()))
      )
      setFilteredCustomerSuggestions(filtered)
      setShowCustomerSuggestions(true)
    } else {
      setShowCustomerSuggestions(false)
    }
  }

  const handleCustomerSelect = (customer: Customer) => {
    setFormData({ ...formData, customerId: customer._id })
    setCustomerSearchTerm(customer.name)
    setShowCustomerSuggestions(false)
    setFilteredCustomerSuggestions([])
  }

  // Single-entry item handlers
  const resetCurrentItem = () => {
    setCurrentItem({ category: "gas", productId: "", quantity: "1", price: "", cylinderSize: undefined })
    setEntryProductSearch("")
    setShowEntrySuggestions(false)
    setEditingItemIndex(null)
  }

  const handleEntryCategoryChange = (value: "gas" | "cylinder") => {
    setCurrentItem({ category: value, productId: "", quantity: "1", price: "", cylinderSize: undefined })
    setEntryProductSearch("")
  }

  const handleEntryProductSearchChange = (value: string) => {
    setEntryProductSearch(value)
    setShowEntrySuggestions(value.trim().length > 0)
  }

  const handleEntryProductSelect = (product: Product) => {
    const sizeLabel = (() => {
      if (!product || product.category !== 'cylinder') return ""
      if (product.cylinderSize === 'large') return 'Large'
      if (product.cylinderSize === 'small') return 'Small'
      return ""
    })()
    setCurrentItem({ category: product.category, productId: product._id, quantity: "1", price: product.leastPrice.toString(), cylinderSize: sizeLabel })
    setEntryProductSearch(product.name)
    setShowEntrySuggestions(false)
  }

  const handleEntryQuantityChange = (value: string) => {
    const enteredQuantity = parseInt(value) || 0
    const product = allProducts.find((p: Product) => p._id === currentItem.productId)
    if (product && enteredQuantity > product.currentStock) {
      setStockErrorMessage(`Insufficient stock for ${product.name}. Available: ${product.currentStock}, Required: ${enteredQuantity}`)
      setShowStockInsufficientPopup(true)
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
    const items: FormItem[] = [...formData.items]
    if (editingItemIndex !== null && editingItemIndex >= 0 && editingItemIndex <= items.length) {
      items.splice(editingItemIndex, 0, { ...currentItem } as FormItem)
    } else {
      items.push({ ...currentItem } as FormItem)
    }
    setFormData({ ...formData, items })
    resetCurrentItem()
  }

  const handleEditRow = (index: number) => {
    const items = [...formData.items]
    const [row] = items.splice(index, 1)
    setFormData({ ...formData, items })
    const prod = allProducts.find(p => p._id === (row as any).productId)
    const sizeLabel = (() => {
      if (!prod || prod.category !== 'cylinder') return ""
      if ((prod as any)?.cylinderSize === 'large') return 'Large'
      if ((prod as any)?.cylinderSize === 'small') return 'Small'
      return ""
    })()
    setCurrentItem({
      category: (row as any).category || 'gas',
      productId: (row as any).productId || '',
      quantity: (row as any).quantity || '1',
      price: (row as any).price || '',
      cylinderSize: sizeLabel,
    })
    const pName = allProducts.find(p => p._id === (row as any).productId)?.name || ''
    setEntryProductSearch(pName)
    setEditingItemIndex(index)
  }

  // Remove item from current list
  const removeItem = (index: number) => {
    const items = [...formData.items]
    if (index < 0 || index >= items.length) return
    items.splice(index, 1)
    setFormData({ ...formData, items })
    // If we were editing a row after this index, shift editing index left
    if (editingItemIndex !== null) {
      if (index === editingItemIndex) {
        // Removed the item that was pending update; reset the entry
        resetCurrentItem()
      } else if (index < editingItemIndex) {
        setEditingItemIndex(Math.max(0, editingItemIndex - 1))
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.customerId) {
      alert("Please select a customer")
      return
    }
    
    // Validate items
    const hasValidItems = formData.items.some(item => 
      item.productId && item.quantity && parseFloat(item.quantity) > 0 && item.price && parseFloat(item.price) > 0
    )
    
    if (!hasValidItems) {
      alert("Please add at least one valid item with product, quantity, and price")
      return
    }

    const totalAmount = calculateTotalAmount()
    if (totalAmount <= 0) {
      alert("Total amount must be greater than 0")
      return
    }

    try {
      // Transform items to match API expectations
      const transformedItems = formData.items
        .filter(item => item.productId && item.quantity && parseFloat(item.quantity) > 0)
        .map(item => {
          const prod = allProducts.find((p: Product) => p._id === item.productId)
          const category = (prod?.category || (item as any).category || 'gas') as 'gas' | 'cylinder'
          const cylinderSize = category === 'cylinder' ? (prod as any)?.cylinderSize : undefined
          return {
            product: item.productId,  // API expects 'product', not 'productId'
            quantity: parseInt(item.quantity),
            price: parseFloat(item.price),
            category,
            cylinderSize,
          }
        })

      // Derive final payment fields from paymentOption
      let derivedPaymentMethod = formData.paymentMethod || "cash"
      let derivedPaymentStatus = formData.paymentStatus || "cleared"
      let derivedReceivedAmount = 0

      if (formData.paymentOption === 'credit') {
        derivedPaymentMethod = 'credit'
        derivedPaymentStatus = 'pending'
      } else if (formData.paymentOption === 'delivery_note') {
        derivedPaymentMethod = 'delivery_note'
        derivedPaymentStatus = 'pending'
      } else if (formData.paymentOption === 'debit') {
        derivedPaymentMethod = 'debit'
        // Use entered received amount for debit
        derivedReceivedAmount = parseFloat(formData.receivedAmount || '0') || 0
        // Force status to cleared for debit, per requirement
        derivedPaymentStatus = 'cleared'
      }

      const saleData = {
        employeeId: user.id,  // API expects 'employeeId', not 'employee'
        customer: formData.customerId,
        items: transformedItems,
        totalAmount: totalAmount,
        paymentMethod: derivedPaymentMethod,
        paymentStatus: derivedPaymentStatus,
        notes: formData.notes || "",
        receivedAmount: derivedReceivedAmount,
      }

      console.log('Sending sale data to API:', saleData)

      let savedResponse: any = null
      if (editingSale) {
        savedResponse = await employeeSalesAPI.update(editingSale._id, saleData)
      } else {
        savedResponse = await employeeSalesAPI.create(saleData)
      }

      fetchData()
      setIsDialogOpen(false)
      resetForm()

      // Prepare a normalized sale object and open signature dialog automatically
      try {
        const saved = (savedResponse?.data?.data) || (savedResponse?.data) || null
        const selectedCustomer = (customers || []).find((c) => c._id === formData.customerId)

        const itemsNormalized = (saved?.items && Array.isArray(saved.items) && saved.items.length > 0)
          ? saved.items.map((it: any) => {
              const prodId = it?.product?._id || it?.product
              const pName = it?.product?.name || (allProducts.find(p=>p._id === prodId)?.name) || 'Product'
              const qty = Number(it.quantity) || 0
              const price = Number(it.price) || 0
              const total = Number(it.total) || (price * qty)
              return { product: { _id: prodId, name: pName }, quantity: qty, price, total }
            })
          : (formData.items || []).map((it: any) => {
              const p = (allProducts || []).find(p => p._id === it.productId)
              const qty = Number(it.quantity)||0
              const price = Number(it.price)||0
              return { product: { _id: p?._id || it.productId, name: p?.name || 'Product' }, quantity: qty, price, total: price*qty }
            })

        const totalAmt = itemsNormalized.reduce((s: number, it: any) => s + (Number(it.total) || 0), 0)

        const normalizedSale: any = {
          _id: saved?._id || `temp-${Date.now()}`,
          invoiceNumber: saved?.invoiceNumber || `EMP-${(saved?._id||'TEMP').slice(-6).toUpperCase()}`,
          customer: saved?.customer || {
            _id: formData.customerId,
            name: selectedCustomer?.name || 'Customer',
            phone: selectedCustomer?.phone || 'N/A',
            address: selectedCustomer?.address || 'N/A',
          },
          items: itemsNormalized,
          totalAmount: saved?.totalAmount || totalAmt,
          paymentMethod: saved?.paymentMethod || derivedPaymentMethod,
          paymentStatus: saved?.paymentStatus || derivedPaymentStatus,
          receivedAmount: saved?.receivedAmount ?? derivedReceivedAmount,
          notes: saved?.notes || formData.notes,
          employee: user.id,
          createdAt: saved?.createdAt || new Date().toISOString(),
        }

        setSaleForSignature(normalizedSale)
        setIsSignatureDialogOpen(true)
      } catch {}
    } catch (error) {
      console.error("Failed to save sale:", error)
      alert("Failed to save sale. Please try again.")
    }
  }


  const handleDeleteClick = (sale: Sale) => {
    setSaleToDelete(sale)
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!saleToDelete) return
    try {
      await employeeSalesAPI.delete(saleToDelete._id)
      fetchData()
      setIsDeleteDialogOpen(false)
      setSaleToDelete(null)
    } catch (error) {
      console.error("Failed to delete sale:", error)
      alert("Failed to delete sale. Please try again.")
    }
  }

const [isSignatureDialogOpen, setIsSignatureDialogOpen] = useState(false);
const [saleForSignature, setSaleForSignature] = useState<any | null>(null);

  const handleViewReceipt = (sale: Sale) => {
    const saleWithAddress = {
      ...sale,
      customer: {
        ...sale.customer,
        address: sale.customer.address || "N/A",
        phone: sale.customer.phone || "N/A",
      },
    };
    setSaleForSignature(saleWithAddress);
    setIsSignatureDialogOpen(true);
  };

  const handleSignatureComplete = (signature: string) => {
    if (saleForSignature) {
      const saleWithSignature = {
        ...saleForSignature,
        customerSignature: signature,
      };
      setSaleForReceipt(saleWithSignature);
      setIsSignatureDialogOpen(false);
      setIsReceiptDialogOpen(true);
    }
  };

  // Derived filtered sales for table
  const filteredSales = (sales || [])
    .filter((s) => {
      const matchesStatus =
        statusFilter === "all" ? true : (s.paymentStatus || "").toLowerCase() === statusFilter.toLowerCase()
      const term = (searchTerm || "").toLowerCase()
      const matchesSearch =
        !term ||
        (s.invoiceNumber || "").toLowerCase().includes(term) ||
        (s.customer?.name || "").toLowerCase().includes(term)
      return matchesStatus && matchesSearch
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  // Group by invoice number with aggregates
  type InvoiceGroup = {
    key: string
    invoice: string
    customerName: string
    date: string
    status: string
    totalAmount: number
    receivedAmount: number
    items: Array<{
      productName: string
      category?: string
      cylinderSize?: string
      quantity: number
      price: number
    }>
    referenceSale: Sale
  }

  const groupedByInvoice: InvoiceGroup[] = (() => {
    const map: Record<string, InvoiceGroup> = {}
    for (const s of filteredSales) {
      const key = s.invoiceNumber || `N/A-${s._id}`
      if (!map[key]) {
        map[key] = {
          key,
          invoice: s.invoiceNumber || "N/A",
          customerName: s.customer?.name || "-",
          date: s.createdAt,
          status: s.paymentStatus,
          totalAmount: 0,
          receivedAmount: 0,
          items: [],
          referenceSale: s,
        }
      }
      // Aggregate amounts
      const itemTotal = typeof s.totalAmount === 'number' && !Number.isNaN(s.totalAmount)
        ? s.totalAmount
        : (Array.isArray(s.items) ? s.items.reduce((sum, it:any) => sum + (Number(it.price)||0)*(Number(it.quantity)||0), 0) : 0)
      map[key].totalAmount += itemTotal
      map[key].receivedAmount += Number(s.receivedAmount || 0)

      // Collect items
      const items = Array.isArray(s.items) ? s.items : []
      for (const it of items) {
        map[key].items.push({
          productName: (it as any)?.product?.name || '-',
          category: (it as any)?.product?.category || (it as any)?.category,
          cylinderSize: (it as any)?.cylinderSize,
          quantity: Number(it?.quantity || 0),
          price: Number(it?.price || 0),
        })
      }
    }
    return Object.values(map).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  })()

  // Pagination derived data (group-level)
  const totalPages = Math.max(1, Math.ceil(groupedByInvoice.length / itemsPerPage))
  const safePage = Math.min(currentPage, totalPages)
  const startIndex = (safePage - 1) * itemsPerPage
  const paginatedGroups = groupedByInvoice.slice(startIndex, startIndex + itemsPerPage)

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Helpers for export filtering
  const isWithinDateRange = (iso: string) => {
    const d = new Date(iso)
    if (exportStart) {
      const s = new Date(exportStart)
      if (d < new Date(s.getFullYear(), s.getMonth(), s.getDate())) return false
    }
    if (exportEnd) {
      const e = new Date(exportEnd)
      // inclusive end date
      const eEnd = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999)
      if (d > eEnd) return false
    }
    return true
  }

  const getExportFilteredSales = () => {
    return (sales || []).filter(s => {
      const dateOk = isWithinDateRange(s.createdAt)
      const custOk = exportCustomerId ? ((s.customer as any)?._id === exportCustomerId) : true
      return dateOk && custOk
    })
  }

  const escapeCsv = (v: any) => {
    const s = String(v ?? '')
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }

  const exportSalesCSV = () => {
    const list = getExportFilteredSales()
    const headers = [
      'Invoice #',
      'Customer Name',
      'Items',
      'Total Amount (AED)',
      'Received Amount (AED)',
      'Payment Method',
      'Payment Status',
      'Notes',
      'Added By',
      'Date',
    ]
    const rows = list.map(s => {
      const itemsStr = (Array.isArray(s.items) ? s.items : []).map((it: any) => {
        const name = it?.product?.name || 'Product'
        const qty = Number(it?.quantity||0)
        const price = Number(it?.price||0).toFixed(2)
        return `${name} x${qty} @${price}`
      }).join(' | ')
      const addedBy = `Employee: ${user?.name || 'N/A'}`
      return [
        s.invoiceNumber || '-',
        s.customer?.name || '-',
        itemsStr,
        Number(s.totalAmount||0).toFixed(2),
        Number((s as any).receivedAmount||0).toFixed(2),
        s.paymentMethod || '-',
        s.paymentStatus || '-',
        s.notes || '',
        addedBy,
        new Date(s.createdAt).toLocaleString(),
      ]
    })
    const csv = [headers, ...rows].map(r => r.map(escapeCsv).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const name = `employee-gas-sales-${exportStart || 'all'}-to-${exportEnd || 'all'}.csv`
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

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

  const exportSalesPDF = async () => {
    try {
      const list = getExportFilteredSales()
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
      const arabicReady = await ensureArabicFont(doc)
      if (arabicReady) { try { doc.setFont('NotoNaskhArabic', 'normal') } catch {} } else { try { doc.setFont('helvetica', 'normal') } catch {} }

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
      const selectedCustomerName = exportCustomerId ? (customers.find(c=>c._id===exportCustomerId)?.name || '') : ''
      if (selectedCustomerName) { doc.text(`Customer: ${selectedCustomerName}`, marginX, y); y += 9 }
      if (exportStart || exportEnd) { doc.text(`Date: ${(exportStart||'...')} to ${(exportEnd||'...')}`, marginX, y); y += 9 }
      doc.text(`Generated: ${new Date().toLocaleString()}`, marginX, y); y += 16

      // Header bar
      const headerHeight = 16
      const headerY = y
      doc.setFillColor(43, 48, 104)
      doc.rect(marginX - 4, headerY - 14, pageWidth - marginX * 2 + 8, headerHeight, 'F')

      // Headers (match admin: Debit/Credit)
      const headers = ['Invoice #','Items','Debit (AED)','Credit (AED)','Payment Method','Payment Status','Notes','Added By','Date']
      const colWidths = [80, 320, 80, 80, 100, 100, 140, 80, 100]

      // Draw headers
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      let xh = marginX
      headers.forEach((h, i) => { doc.text(h, xh, headerY); xh += (colWidths[i] || 80) })
      doc.setTextColor(0, 0, 0)
      y += 12

      // Row drawing with dynamic height and zebra background
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

      // Build rows
      list.forEach((s: any) => {
        const itemsDesc = (s.items || []).map((it: any) => {
          const name = it?.product?.name || 'Product'
          const qty = Number(it?.quantity)||0
          const price = Number(it?.price)||0
          return `${name} x${qty} @ ${price}`
        }).join('\n')
        const addedBy = `Employee: ${user?.name || ''}`
        const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleString() : ''
        const totalStr = Number(s.totalAmount||0).toFixed(2)
        const receivedStr = Number((s as any).receivedAmount||0).toFixed(2)
        const row = [
          s.invoiceNumber || '-',
          itemsDesc,
          totalStr,
          receivedStr,
          s.paymentMethod || '-',
          s.paymentStatus || '-',
          s.notes || '',
          addedBy,
          dateStr,
        ]
        drawRow(row)
      })

      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const custPart = selectedCustomerName ? `-cust-${selectedCustomerName.replace(/\s+/g, '_')}` : ''
      const datePart = (exportStart || exportEnd)
        ? `-date-${(exportStart||'start').replace(/[^0-9-]/g,'')}_to_${(exportEnd||'end').replace(/[^0-9-]/g,'')}`
        : ''
      doc.save(`employee-sales-export${custPart}${datePart}-${ts}.pdf`)
    } catch (err) {
      console.error('Failed to export sales PDF:', err)
      alert('Failed to export PDF')
    }
  }

  return (
    <div className="pt-16 lg:pt-0 space-y-8">
      {/* Page Heading - match admin gradient style */}
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-2xl p-8 text-white">
        <h1 className="text-4xl font-bold mb-2">Employee Gas Sales</h1>
        <p className="text-white/80 text-lg">Create and manage your gas sales</p>
      </div>

      {/* Toolbar: search/filter and New Sale button */}
      <div className="flex items-center justify-between gap-3 flex-col sm:flex-row">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-80">
            <Input
              placeholder="Search by invoice or customer"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="cleared">Cleared</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => {
            resetForm()
            setIsDialogOpen(true)
          }}
          className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white w-full sm:w-auto"
        >
          <PlusIcon className="mr-2 h-4 w-4" /> New Sale
        </Button>
      </div>

      {/* Sales History */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white rounded-t-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle>Sales History</CardTitle>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
              {showExportInput && (
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 items-center">
                  <div className="col-span-1">
                    <Label className="text-xs text-white/80">From</Label>
                    <Input
                      className="bg-white text-black"
                      type="date"
                      value={exportStart}
                      onChange={e=>setExportStart(e.target.value)}
                    />
                  </div>
                  <div className="col-span-1">
                    <Label className="text-xs text-white/80">To</Label>
                    <Input
                      className="bg-white text-black"
                      type="date"
                      value={exportEnd}
                      onChange={e=>setExportEnd(e.target.value)}
                    />
                  </div>
                  <div className="col-span-1 relative">
                    <Label className="text-xs text-white/80">Customer</Label>
                    <Input
                      className="bg-white text-black"
                      placeholder="Type to search customer"
                      value={exportCustomerSearch}
                      onChange={(e)=>{ setExportCustomerSearch(e.target.value); setExportCustomerId("") }}
                    />
                    {exportSuggestions.length > 0 && (
                      <div className="absolute z-50 bg-white text-black border rounded mt-1 w-full max-h-40 overflow-auto text-sm">
                        {exportSuggestions.map(c => (
                          <div
                            key={c._id}
                            className="px-2 py-1 hover:bg-gray-100 cursor-pointer"
                            onMouseDown={() => { setExportCustomerId(c._id); setExportCustomerSearch(c.name); setExportSuggestions([]) }}
                          >
                            {c.name} {c.phone ? `- ${c.phone}`: ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="col-span-1 flex gap-2 mt-6 sm:mt-6 lg:mt-6">
                    <Button variant="secondary" className="bg-white text-[#2B3068] hover:bg-gray-100 w-full sm:w-auto" onClick={exportSalesCSV}>Export CSV</Button>
                    <Button variant="secondary" className="bg-white text-[#2B3068] hover:bg-gray-100 w-full sm:w-auto" onClick={exportSalesPDF}>Export PDF</Button>
                  </div>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Total (AED)</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedByInvoice.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-6 text-muted-foreground">
                    {loading ? "Loading..." : "No sales found"}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedGroups.map((group) => {
                  const isExpanded = !!expandedGroups[group.key]
                  const showItems = group.items.slice(0, 1)
                  const remaining = group.items.length - showItems.length
                  const refSale = group.referenceSale
                  return (
                    <Fragment key={group.key}>
                      <TableRow>
                        <TableCell className="font-medium">{group.invoice}</TableCell>
                        <TableCell>{group.customerName}</TableCell>
                        <TableCell colSpan={3}>
                          <div className="space-y-1">
                            {showItems.map((it, idx) => (
                              <div key={idx} className="text-xs flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{it.productName}</span>
                                <span className="text-muted-foreground">x{it.quantity}</span>
                                {it.category && (
                                  <Badge className={it.category === 'gas' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}>
                                    {it.category}
                                  </Badge>
                                )}
                                {it.cylinderSize && (
                                  <Badge variant="outline">{it.cylinderSize}</Badge>
                                )}
                                <span className="text-muted-foreground">AED {it.price.toFixed(2)}</span>
                              </div>
                            ))}
                            {remaining > 0 && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="px-0 h-auto text-xs">
                                    View all items ({group.items.length})
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-[22rem] max-h-80 overflow-auto p-2">
                                  <div className="space-y-2">
                                    {group.items.map((it, idx) => (
                                      <div key={idx} className="text-xs rounded border p-2 bg-white">
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="min-w-0">
                                            <div className="font-medium truncate">{it.productName}</div>
                                            <div className="flex items-center gap-2 flex-wrap mt-1">
                                              {it.category && (
                                                <Badge className={it.category === 'gas' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}>
                                                  {it.category}
                                                </Badge>
                                              )}
                                              {it.cylinderSize && (
                                                <Badge variant="outline">{it.cylinderSize}</Badge>
                                              )}
                                            </div>
                                          </div>
                                          <div className="text-right shrink-0">
                                            <div>qty {it.quantity}</div>
                                            <div className="text-muted-foreground">AED {it.price.toFixed(2)}</div>
                                            <div className="font-semibold">AED {(it.price * it.quantity).toFixed(2)}</div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{(group.totalAmount || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{(group.receivedAmount || 0).toFixed(2)}</TableCell>
                        <TableCell>{getPaymentStatusBadge(group.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleEdit(refSale)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleViewReceipt(refSale)}>
                              Receipt
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteClick(refSale)}>
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                          <TableCell colSpan={7}>
                            <div className="p-3 bg-gray-50 rounded-md">
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {group.items.map((it, idx) => (
                                  <div key={idx} className="text-xs border rounded p-2 bg-white">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium">{it.productName}</span>
                                      {it.category && (
                                        <Badge className={it.category === 'gas' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}>
                                          {it.category}
                                        </Badge>
                                      )}
                                      {it.cylinderSize && (
                                        <Badge variant="outline">{it.cylinderSize}</Badge>
                                      )}
                                    </div>
                                    <div className="mt-1 text-muted-foreground">
                                      Qty: {it.quantity} • Price: AED {it.price.toFixed(2)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination Controls */}
      {groupedByInvoice.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-2">
          <div className="text-sm text-gray-600">
            Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, groupedByInvoice.length)} of {groupedByInvoice.length}
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
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sale</DialogTitle>
            <DialogDescription>
              {saleToDelete ? `Are you sure you want to delete invoice ${saleToDelete.invoiceNumber}? This action will restore product stock for the items in this sale.` : "Are you sure you want to delete this sale?"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" type="button" onClick={handleDeleteConfirm}>
              Confirm Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create / Edit Sale Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{editingSale ? "Edit Sale" : "Create Sale"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 overflow-x-hidden">

            {/* Customer autocomplete */}
            <div className="space-y-2">
              <Label>Customer</Label>
              <div className="relative">
                <Input
                  placeholder="Type to search customer"
                  value={customerSearchTerm}
                  onChange={(e) => handleCustomerSearchChange(e.target.value)}
                  onFocus={() => setShowCustomerSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 150)}
                />
                {showCustomerSuggestions && filteredCustomerSuggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow">
                    {filteredCustomerSuggestions.map((c) => (
                      <div
                        key={c._id}
                        className="cursor-pointer px-3 py-2 hover:bg-muted"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleCustomerSelect(c)}
                      >
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.email || c.phone || ""}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Items */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Items</Label>
              </div>

              {/* 2x2 single-entry grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={currentItem.category} onValueChange={(v: any) => handleEntryCategoryChange(v)}>
                    <SelectTrigger>
                      <SelectValue />
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
                      {(allProducts || [])
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
                              <span className="font-medium text-gray-900">
                                {product.name}
                                {product.category === 'cylinder' && (
                                  <span className="ml-2 text-xs text-gray-600">(
                                    {(product as any)?.cylinderSize === 'large' ? 'Large' : (product as any)?.cylinderSize === 'small' ? 'Small' : ''}
                                  )</span>
                                )}
                              </span>
                              <span className="text-xs text-gray-500">Min AED {product.leastPrice.toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                {currentItem.category === 'cylinder' && (
                  <div className="space-y-2">
                    <Label>Cylinder Size</Label>
                    <Select value={(currentItem.cylinderSize || '') as any} disabled>
                      <SelectTrigger>
                        <SelectValue placeholder="Auto from product" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Large">Large</SelectItem>
                        <SelectItem value="Small">Small</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input type="number" min="1" value={currentItem.quantity} onChange={(e) => handleEntryQuantityChange(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Price (AED)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={currentItem.price}
                    onChange={(e) => handleEntryPriceChange(e.target.value)}
                    placeholder={(() => { const p = allProducts.find(ap => ap._id === currentItem.productId); return p?.leastPrice ? `Min: AED ${p.leastPrice.toFixed(2)}` : 'Select product first' })()}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  {(() => { const q = Number(currentItem.quantity)||0; const pr = Number(currentItem.price)||0; return q>0 && pr>0 ? `Line Total: AED ${(q*pr).toFixed(2)}` : '' })()}
                </div>
                <div>
                  <Button type="button" onClick={addOrUpdateItem}>
                    {editingItemIndex !== null ? 'Update Item' : 'Add Item'}
                  </Button>
                </div>
              </div>

              {/* Items table */}
              <div className="w-full overflow-x-auto">
                <div className="inline-block min-w-[700px] align-top">
                  <div className="max-h-[40vh] overflow-y-auto pr-2">
                    <div className="grid grid-cols-[1fr_2fr_1fr_1fr_1.2fr_1fr] gap-3 px-2 py-2 text-xs font-medium text-gray-600 bg-gray-50 rounded-md mb-2 whitespace-nowrap">
                      <div>Category</div>
                      <div>Product</div>
                      <div>Cylinder Size</div>
                      <div>Qty</div>
                      <div>Price (AED)</div>
                      <div>Actions</div>
                    </div>
                    <div className="space-y-1">
                      {(formData.items as any[]).map((it: any, idx: number) => {
                        const p = allProducts.find((ap) => ap._id === it.productId)
                        return (
                          <div key={idx} className="grid grid-cols-[1fr_2fr_1fr_1fr_1.2fr_1fr] gap-3 px-2 py-2 border-b last:border-b-0 items-center">
                            <div className="truncate">{(it as any).category || 'gas'}</div>
                            <div className="truncate">{p?.name || '-'}</div>
                            <div className="truncate">{p?.category === 'cylinder' ? ((p as any)?.cylinderSize === 'large' ? 'Large' : (p as any)?.cylinderSize === 'small' ? 'Small' : '-') : '-'}</div>
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
            </div>

            {/* Payment Option / Received Amount Section */}
            <div className="space-y-3">
              <Label>Received Amount (AED) *</Label>
              <Select
                value={formData.paymentOption}
                onValueChange={(value) => {
                  const next: any = { ...formData, paymentOption: value as any }
                  if (value === 'delivery_note') {
                    next.receivedAmount = '0'
                    next.paymentStatus = 'pending'
                    next.paymentMethod = 'delivery_note'
                  } else if (value === 'credit') {
                    // For credit, fix receivedAmount to 0 and keep status pending
                    next.paymentMethod = 'credit'
                    next.paymentStatus = 'pending'
                    next.receivedAmount = '0'
                  } else if (value === 'debit') {
                    next.paymentMethod = 'debit'
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

              {formData.paymentOption === 'debit' && (
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
                      const totalAmount = calculateTotalAmount()
                      let newPaymentStatus = formData.paymentStatus
                      if (receivedValue === totalAmount && totalAmount > 0) newPaymentStatus = 'cleared'
                      else if (receivedValue > 0 && receivedValue < totalAmount) newPaymentStatus = 'pending'
                      else if (receivedValue === 0) newPaymentStatus = 'pending'
                      setFormData({ ...formData, receivedAmount, paymentStatus: newPaymentStatus, paymentMethod: 'debit' })
                    }}
                    className="text-lg"
                  />
                  {formData.receivedAmount && (
                    <div className="text-sm text-gray-600">
                      {(() => { const rv = parseFloat(formData.receivedAmount)||0; const rem = calculateTotalAmount() - rv; if(rem>0){return `Remaining: AED ${rem.toFixed(2)}`} else if(rem<0){return `Excess: AED ${Math.abs(rem).toFixed(2)}`} else {return '✓ Fully paid'} })()}
                    </div>
                  )}
                </div>
              )}

              {/* For credit, no received amount input; it is fixed to 0 and status pending */}

              {formData.paymentOption === 'delivery_note' && (
                <div className="space-y-2">
                  <div className="text-sm text-gray-600">Only item and quantity are required. A delivery note will be generated.</div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingSale ? "Update" : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Signature and Receipt Flow */}
      <SignatureDialog
        isOpen={isSignatureDialogOpen}
        onClose={() => setIsSignatureDialogOpen(false)}
        onSignatureComplete={handleSignatureComplete}
      />
      {isReceiptDialogOpen && saleForReceipt && (
        <ReceiptDialog
          onClose={() => setIsReceiptDialogOpen(false)}
          sale={saleForReceipt}
        />
      )}

      {/* Stock Insufficient Popup */}
      {showStockInsufficientPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          {/* Background blur overlay */}
          <div 
            className="absolute inset-0 bg-black/20 backdrop-blur-sm" 
            onClick={() => {
              setUserInteractedWithPopup(true)
              setShowStockInsufficientPopup(false)
            }}
          />
          
          {/* Modal with animations */}
          <div className="relative bg-white rounded-2xl shadow-2xl p-8 mx-4 max-w-md w-full transform transition-all duration-300 scale-100 animate-in fade-in-0 zoom-in-95">
            {/* Close button */}
            <button
              onClick={() => {
                setUserInteractedWithPopup(true)
                setShowStockInsufficientPopup(false)
              }}
              onMouseEnter={() => setUserInteractedWithPopup(true)}
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
                  onClick={() => {
                    setUserInteractedWithPopup(true)
                    setShowStockInsufficientPopup(false)
                  }}
                  onMouseEnter={() => setUserInteractedWithPopup(true)}
                  className="flex-1 bg-gray-100 text-gray-700 font-semibold py-3 px-6 rounded-lg hover:bg-gray-200 transition-all duration-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setUserInteractedWithPopup(true)
                    setShowStockInsufficientPopup(false)
                    // Could add logic to navigate to inventory management
                  }}
                  onMouseEnter={() => setUserInteractedWithPopup(true)}
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

function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}