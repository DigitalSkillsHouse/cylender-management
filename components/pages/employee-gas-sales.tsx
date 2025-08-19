"use client"

import { useState, useEffect } from "react"
import type { SVGProps } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
  phone?: string
  email?: string
  address?: string
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

  // Customer autocomplete functionality for form
  const [customerSearchTerm, setCustomerSearchTerm] = useState("")
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false)
  const [filteredCustomerSuggestions, setFilteredCustomerSuggestions] = useState<Customer[]>([])
  // Per-item product autocomplete state
  const [productSearchTerms, setProductSearchTerms] = useState<string[]>([""])
  const [showProductSuggestions, setShowProductSuggestions] = useState<boolean[]>([false])
  // Single-entry item input state (2x2 grid)
  const [currentItem, setCurrentItem] = useState<{ category: "gas" | "cylinder"; productId: string; quantity: string; price: string }>({
    category: "gas",
    productId: "",
    quantity: "1",
    price: "",
  })
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null)
  const [entryProductSearch, setEntryProductSearch] = useState("")
  const [showEntrySuggestions, setShowEntrySuggestions] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    customerId: "",
    category: "gas",
    items: [{ productId: "", quantity: "", price: "" }],
    receivedAmount: "",
    paymentMethod: "cash",
    paymentStatus: "cleared",
    paymentOption: "debit", // debit | credit | delivery_note
    notes: "",
  })

  // Stock and price validation states
  const [showStockInsufficientPopup, setShowStockInsufficientPopup] = useState(false)
  const [stockErrorMessage, setStockErrorMessage] = useState("")
  const [showPriceValidationPopup, setShowPriceValidationPopup] = useState(false)
  const [validationMessage, setValidationMessage] = useState("")

  useEffect(() => {
    fetchData()
  }, [user.id])

  // Reset pagination on filter/search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter])

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

  const resetForm = () => {
    setFormData({
      customerId: "",
      category: "gas",
      items: [{ productId: "", quantity: "", price: "" }],
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
    return formData.items.reduce((sum, item) => {
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
    setCurrentItem({ category: product.category, productId: product._id, quantity: "1", price: product.leastPrice.toString() })
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
      items.splice(editingItemIndex, 0, { ...currentItem } as any)
    } else {
      items.push({ ...currentItem } as any)
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
        .map(item => ({
          product: item.productId,  // API expects 'product', not 'productId'
          quantity: parseInt(item.quantity),
          price: parseFloat(item.price)
        }))

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

  const handleEdit = (sale: Sale) => {
    setEditingSale(sale)
    
    // Convert sale items to form format
    const formItems = sale.items && sale.items.length > 0 
      ? sale.items.map(item => ({
          productId: item.product._id,
          quantity: item.quantity.toString(),
          price: item.price.toString()
        }))
      : [{ productId: "", quantity: "", price: "" }]
    
    setFormData({
      customerId: sale.customer._id,
      category: sale.category || 'gas',
      items: formItems,
      receivedAmount: sale.receivedAmount?.toString() || "",
      paymentMethod: sale.paymentMethod || "cash",
      paymentStatus: sale.paymentStatus,
      paymentOption: (() => {
        const pm = sale.paymentMethod || "cash"
        if (pm === 'credit') return 'credit'
        if (pm === 'delivery_note') return 'delivery_note'
        if (pm === 'debit') return 'debit'
        return 'debit'
      })(),
      notes: sale.notes || "",
    })
    setCustomerSearchTerm(sale.customer.name)
    setIsDialogOpen(true)
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

  // Pagination derived data
  const totalPages = Math.max(1, Math.ceil(filteredSales.length / itemsPerPage))
  const safePage = Math.min(currentPage, totalPages)
  const startIndex = (safePage - 1) * itemsPerPage
  const paginatedSales = filteredSales.slice(startIndex, startIndex + itemsPerPage)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Employee Gas Sales</h2>
        <Button
          onClick={() => {
            resetForm()
            setIsDialogOpen(true)
          }}
        >
          <PlusIcon className="mr-2 h-4 w-4" /> New Sale
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
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

      <Card>
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
              {filteredSales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                    {loading ? "Loading..." : "No sales found"}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedSales.map((sale) => (
                  <TableRow key={sale._id}>
                    <TableCell className="font-medium">{sale.invoiceNumber}</TableCell>
                    <TableCell>{sale.customer?.name || "-"}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {(Array.isArray(sale.items) ? sale.items : []).map((it: any, idx: number) => (
                          <div key={idx} className="text-xs">
                            {it?.product?.category || '-'}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {(Array.isArray(sale.items) ? sale.items : []).map((it: any, idx: number) => (
                          <div key={idx} className="text-xs">
                            {it?.product?.name || '-'}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="space-y-1">
                        {(Array.isArray(sale.items) ? sale.items : []).map((it: any, idx: number) => (
                          <div key={idx} className="text-xs">
                            {Number(it?.quantity || 0)}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{(sale.totalAmount || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{(sale.receivedAmount || 0).toFixed(2)}</TableCell>
                    <TableCell>{getPaymentStatusBadge(sale.paymentStatus)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(sale)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleViewReceipt(sale)}>
                          Receipt
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDeleteClick(sale)}>
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination Controls */}
      {filteredSales.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-2">
          <div className="text-sm text-gray-600">
            Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredSales.length)} of {filteredSales.length}
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
                    <div className="grid grid-cols-[1fr_2fr_1fr_1.2fr_1fr] gap-3 px-2 py-2 text-xs font-medium text-gray-600 bg-gray-50 rounded-md mb-2 whitespace-nowrap">
                      <div>Category</div>
                      <div>Product</div>
                      <div>Qty</div>
                      <div>Price (AED)</div>
                      <div>Actions</div>
                    </div>
                    <div className="space-y-1">
                      {(formData.items as any[]).map((it: any, idx: number) => {
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
    </div>
  )

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

}