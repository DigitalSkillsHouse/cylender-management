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

  // Customer autocomplete functionality for form
  const [customerSearchTerm, setCustomerSearchTerm] = useState("")
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false)
  const [filteredCustomerSuggestions, setFilteredCustomerSuggestions] = useState<Customer[]>([])
  // Per-item product autocomplete state
  const [productSearchTerms, setProductSearchTerms] = useState<string[]>([""])
  const [showProductSuggestions, setShowProductSuggestions] = useState<boolean[]>([false])

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

  // Item management functions
  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { productId: "", quantity: "1", price: "", category: formData.category || "gas" } as any]
    })
    setProductSearchTerms((prev) => [...prev, ""]) 
    setShowProductSuggestions((prev) => [...prev, false])
  }

  const removeItem = (index: number) => {
    if (formData.items.length > 1) {
      const newItems = formData.items.filter((_, i) => i !== index)
      setFormData({ ...formData, items: newItems })
    }
    setProductSearchTerms((prev) => prev.filter((_, i) => i !== index))
    setShowProductSuggestions((prev) => prev.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: string, value: any) => {
    const newItems: any[] = [...(formData.items as any)]

    if (field === 'category') {
      newItems[index] = {
        ...newItems[index],
        category: value,
        productId: '',
        price: '',
      }
      // Clear product search state for this row
      setProductSearchTerms((prev) => { const cp = [...prev]; cp[index] = ""; return cp })
      setShowProductSuggestions((prev) => { const cp = [...prev]; cp[index] = false; return cp })
    } else if (field === 'productId') {
      const itemCategory = newItems[index].category || formData.category || 'gas'
      const categoryProducts = (allProducts || []).filter((p: Product) => p.category === itemCategory)
      const product = categoryProducts.find((p: Product) => p._id === value)
      newItems[index] = {
        ...newItems[index],
        productId: value,
        quantity: '1',
        price: product ? product.leastPrice.toString() : '',
      }
      // Reflect chosen product name and hide suggestions
      setProductSearchTerms((prev) => { const cp = [...prev]; cp[index] = product?.name || cp[index] || ""; return cp })
      setShowProductSuggestions((prev) => { const cp = [...prev]; cp[index] = false; return cp })
    } else {
      newItems[index] = { ...newItems[index], [field]: value }
    }

    setFormData({ ...formData, items: newItems as any })
  }

  // Product autocomplete handlers
  const handleProductSearchChange = (index: number, value: string) => {
    setProductSearchTerms((prev) => { const cp = [...prev]; cp[index] = value; return cp })
    setShowProductSuggestions((prev) => { const cp = [...prev]; cp[index] = value.trim().length > 0; return cp })
  }

  const handleProductSuggestionClick = (index: number, product: Product) => {
    updateItem(index, 'productId', product._id)
    setProductSearchTerms((prev) => { const cp = [...prev]; cp[index] = product.name; return cp })
    setShowProductSuggestions((prev) => { const cp = [...prev]; cp[index] = false; return cp })
  }

  const handleProductInputFocus = (index: number) => {
    setShowProductSuggestions((prev) => { const cp = [...prev]; cp[index] = (productSearchTerms[index] || '').trim().length > 0; return cp })
  }

  const handleProductInputBlur = (index: number) => {
    setTimeout(() => {
      setShowProductSuggestions((prev) => { const cp = [...prev]; cp[index] = false; return cp })
    }, 200)
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

      if (editingSale) {
        await employeeSalesAPI.update(editingSale._id, saleData)
      } else {
        await employeeSalesAPI.create(saleData)
      }

      fetchData()
      setIsDialogOpen(false)
      resetForm()
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
                filteredSales.map((sale) => (
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

            {/* Category moved to per-item selection below to match Admin UI */}

            {/* Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Items</Label>
              </div>

              {/* Scrollable container (horizontal + vertical) for items only */}
              <div className="w-full overflow-x-auto">
                <div className="inline-block min-w-[900px] align-top">
                  <div className="max-h-[55vh] overflow-y-auto pr-2">
                    {/* Header row */}
                    <div className="grid grid-cols-[1fr_2fr_1fr_1.2fr_1.2fr] gap-3 px-2 py-2 text-xs font-medium text-gray-600 bg-gray-50 rounded-md mb-2 whitespace-nowrap">
                      <div>Category</div>
                      <div>Product</div>
                      <div>Quantity</div>
                      <div>Price (AED)</div>
                      <div>Total</div>
                    </div>

                    <div className="space-y-2">
                      {(formData.items as any[]).map((item: any, index: number) => (
                        <div key={index} className="grid grid-cols-[1fr_2fr_1fr_1.2fr_1.2fr] gap-3 px-2 py-3 border-b last:border-b-0">
                          <div className="space-y-2">
                            <Label className="md:hidden">Category</Label>
                            <Select
                              value={item.category || formData.category || 'gas'}
                              onValueChange={(value) => updateItem(index, 'category', value)}
                            >
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
                            <Label className="md:hidden">Product</Label>
                            <Input
                              placeholder={`Search ${(item.category || formData.category || 'gas')} product`}
                              value={productSearchTerms[index] || ''}
                              onChange={(e) => handleProductSearchChange(index, e.target.value)}
                              onFocus={() => handleProductInputFocus(index)}
                              onBlur={() => handleProductInputBlur(index)}
                              className="pr-10"
                            />
                            {showProductSuggestions[index] && (
                              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                {(allProducts || [])
                                  .filter((p: Product) => p.category === (item.category || formData.category || 'gas'))
                                  .filter((p: Product) => (productSearchTerms[index] || '').trim().length === 0 || p.name.toLowerCase().includes((productSearchTerms[index] || '').toLowerCase()))
                                  .slice(0, 8)
                                  .map((product) => (
                                    <div
                                      key={product._id}
                                      className="px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => handleProductSuggestionClick(index, product)}
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
                            <Label className="md:hidden">Quantity</Label>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => {
                                const enteredQuantity = parseInt(e.target.value) || 0
                                const itemCategory = (item.category || formData.category || 'gas') as any
                                const categoryProducts = (allProducts || []).filter((p: Product) => p.category === itemCategory)
                                const product = categoryProducts.find((p: Product) => p._id === item.productId)
                                if (product && enteredQuantity > product.currentStock) {
                                  setStockErrorMessage(`Insufficient stock for ${product.name}. Available: ${product.currentStock}, Required: ${enteredQuantity}`)
                                  setShowStockInsufficientPopup(true)
                                  setTimeout(() => setShowStockInsufficientPopup(false), 2000)
                                  return
                                }
                                updateItem(index, 'quantity', e.target.value)
                              }}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label className="md:hidden">Price (AED)</Label>
                            <div className="relative">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.price}
                                onChange={(e) => {
                                  const productsByCat = (allProducts || []).filter((p: Product) => p.category === (item.category || formData.category || 'gas'))
                                  const product = productsByCat.find((p: Product) => p._id === item.productId)
                                  const enteredPrice = parseFloat(e.target.value)
                                  if (product && enteredPrice < product.leastPrice) {
                                    setPriceAlert({ message: `Price must be at least ${product.leastPrice.toFixed(2)}`, index })
                                    setTimeout(() => setPriceAlert({ message: '', index: null }), 2000)
                                  }
                                  updateItem(index, 'price', e.target.value)
                                }}
                                placeholder={(() => {
                                  const productsByCat = (allProducts || []).filter((p: Product) => p.category === (item.category || formData.category || 'gas'))
                                  const product = productsByCat.find((p: Product) => p._id === item.productId)
                                  return product?.leastPrice ? `Min: AED ${product.leastPrice.toFixed(2)}` : 'Select product first'
                                })()}
                                className="w-full h-10 sm:h-11"
                              />
                              {priceAlert.index === index && priceAlert.message && (
                                <div className="absolute top-full mt-1 text-xs text-red-500 bg-white p-1 rounded shadow-lg z-10">
                                  {priceAlert.message}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="md:hidden">Total (AED)</Label>
                            <div className="flex items-center gap-2">
                              <div className="w-full text-right text-sm font-medium whitespace-nowrap">
                                AED {(() => { const p = parseFloat(item.price)||0; const q = parseFloat(item.quantity)||0; return (p*q).toFixed(2) })()}
                              </div>
                              {formData.items.length > 1 && (
                                <Button type="button" variant="outline" size="sm" onClick={() => removeItem(index)} className="text-red-600">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-2">
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  Add Item
                </Button>
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