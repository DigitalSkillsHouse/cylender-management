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
import { Plus, Edit, Trash2, Loader2, ShoppingCart, AlertCircle, Package as PackageIcon, ChevronRight, ChevronDown } from "lucide-react"
import { suppliersAPI, productsAPI, purchaseOrdersAPI } from "@/lib/api"
import employeePurchaseOrdersAPI from "@/lib/api/employee-purchase-orders"

interface PurchaseOrder {
  _id: string
  supplier: { _id: string; companyName: string }
  product: { _id: string; name: string }
  employee: { _id: string; name: string; email: string }
  purchaseDate: string
  purchaseType: "gas" | "cylinder"
  cylinderSize?: string
  quantity: number
  unitPrice: number
  totalAmount: number
  notes: string
  status: "pending" | "completed" | "cancelled"
  poNumber: string
}

interface Product {
  _id: string
  name: string
  costPrice: number
  currentStock: number
  category: "gas" | "cylinder"
  cylinderSize?: string
}

interface PurchaseItem {
  purchaseType: "gas"
  productId: string
  quantity: string
  unitPrice: string
  cylinderSize?: string
  emptyCylinderId?: string
  emptyCylinderName?: string
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
  // Expanded state for grouped invoice rows
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  // Single entry item state (2x2 form)
  const [currentItem, setCurrentItem] = useState<{purchaseType: "gas"; productId: string; quantity: string; unitPrice: string; cylinderSize?: string; emptyCylinderId?: string}>({
    purchaseType: "gas",
    productId: "",
    quantity: "",
    unitPrice: "",
    cylinderSize: "",
    emptyCylinderId: "",
  })
  const [productSearchTerm, setProductSearchTerm] = useState("")
  const [showProductSuggestions, setShowProductSuggestions] = useState(false)
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null)
  
  // Empty cylinder selection state
  const [emptyCylinders, setEmptyCylinders] = useState<any[]>([])
  const [cylinderSearchTerm, setCylinderSearchTerm] = useState("")
  const [showCylinderSuggestions, setShowCylinderSuggestions] = useState(false)
  const [formData, setFormData] = useState<{ supplierId: string; purchaseDate: string; invoiceNumber: string; items: PurchaseItem[]; notes: string }>(() => ({
    supplierId: "",
    purchaseDate: new Date().toISOString().split("T")[0],
    invoiceNumber: "",
    items: [],
    notes: "",
  }))

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setError("")
      
      // Fetch suppliers and products first (they don't require auth)
      const [suppliersRes, productsRes] = await Promise.all([
        suppliersAPI.getAll(), 
        productsAPI.getAll()
      ])
      
      const suppliersData = suppliersRes.data || []
      const productsData = productsRes.data || []
      
      setSuppliers(suppliersData)
      setProducts(productsData)
      
      // Fetch employee's empty cylinders from inventory
      try {
        // Check both localStorage and sessionStorage for user data
        let userInfo = typeof window !== 'undefined' ? localStorage.getItem('user') : null
        if (!userInfo && typeof window !== 'undefined') {
          userInfo = sessionStorage.getItem('user')
        }
        if (userInfo) {
          const currentUser = JSON.parse(userInfo)
          if (currentUser?.id) {
            // Fetch from stock-assignments to get correct StockAssignment IDs
            const stockAssignmentsRes = await fetch(`/api/stock-assignments?employeeId=${currentUser.id}`)
            if (stockAssignmentsRes.ok) {
              const assignmentsData = await stockAssignmentsRes.json()
              const assignments = assignmentsData.data || []
              
              // Filter for empty cylinders with received status
              const emptyCylinderItems = assignments.filter((item: any) => {
                const isEmptyCylinder = (
                  item.category === 'cylinder' && 
                  item.cylinderStatus === 'empty'
                )
                
                const hasStock = (item.remainingQuantity > 0)
                const isReceived = (item.status === 'received')
                
                return isEmptyCylinder && hasStock && isReceived
              })
              
              setEmptyCylinders(emptyCylinderItems)
            }
          }
        }
      } catch (cylinderError) {
        console.warn('Failed to load empty cylinders:', cylinderError)
        setEmptyCylinders([])
      }
      
      // Try to fetch employee purchase orders separately (requires auth)
      try {
        // Force API to return only the authenticated employee's orders
        const purchaseOrdersRes = await employeePurchaseOrdersAPI.getAll({ meOnly: true })
        
        // The API response structure is: response.data.data (nested)
        const ordersData = purchaseOrdersRes.data?.data || purchaseOrdersRes.data || []
        
        // Ensure it's always an array
        let finalData = Array.isArray(ordersData) ? ordersData : []
        
        // Client-side safety filter: If we somehow got other employees' orders, filter them out
        // This is a belt-and-suspenders approach in case the API filter fails
        try {
          // Get current user info from localStorage or other source if available
          const userInfo = typeof window !== 'undefined' ? localStorage.getItem('user') : null
          if (userInfo) {
            const currentUser = JSON.parse(userInfo)
            if (currentUser?.id) {
              const beforeCount = finalData.length
              finalData = finalData.filter((order: any) => {
                const orderEmployeeId = order.employee?._id || order.employee
                return orderEmployeeId === currentUser.id
              })
              const afterCount = finalData.length
              if (beforeCount !== afterCount) {
                console.warn(`Filtered out ${beforeCount - afterCount} orders that don't belong to current employee`)
              }
            }
          }
        } catch (filterError) {
          console.warn('Client-side order filtering failed:', filterError)
          // Continue with original data if filtering fails
        }
        
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
      }

      // For editing existing orders (single item), handle as before
      if (editingOrder) {
        const item = formData.items[0]
        const purchaseData = {
          supplier: formData.supplierId,
          product: item.productId,
          purchaseDate: formData.purchaseDate,
          purchaseType: item.purchaseType,
          quantity: Number.parseInt(item.quantity),
          unitPrice: Number.parseFloat(item.unitPrice) || 0,
          notes: formData.notes,
          invoiceNumber: formData.invoiceNumber,
          emptyCylinderId: item.emptyCylinderId,
          emptyCylinderName: item.emptyCylinderName,
        }
        await employeePurchaseOrdersAPI.update(editingOrder._id, purchaseData)
      } else {
        // For new orders, create multiple purchase orders (one per item)
        for (const item of formData.items) {
          const purchaseData = {
            supplier: formData.supplierId,
            product: item.productId,
            purchaseDate: formData.purchaseDate,
            purchaseType: item.purchaseType,
            quantity: Number.parseInt(item.quantity),
            ...(item.unitPrice ? { unitPrice: Number.parseFloat(item.unitPrice) } : {}),
            // totalAmount computed server-side when not provided
            notes: formData.notes,
            invoiceNumber: formData.invoiceNumber.trim(),
            emptyCylinderId: item.emptyCylinderId,
            emptyCylinderName: item.emptyCylinderName,
          }
          await employeePurchaseOrdersAPI.create(purchaseData)
        }
      }

      await fetchData()
      resetForm()
      setIsDialogOpen(false)
    } catch (error: any) {
      setError(error.response?.data?.error || "Failed to save purchase order")
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
    setCurrentItem({ purchaseType: "gas", productId: "", quantity: "", unitPrice: "", cylinderSize: "", emptyCylinderId: "" })
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
      items: [{
        purchaseType: "gas",
        productId: order.product._id,
        quantity: order.quantity.toString(),
        unitPrice: order.unitPrice.toString(),
        cylinderSize: '',
      }],
      notes: order.notes || "",
    })
    // Initialize current item inputs for edit mode of single existing order
    const pName = products.find(p => p._id === order.product._id)?.name || ""
    setCurrentItem({
      purchaseType: "gas",
      productId: order.product._id,
      quantity: order.quantity.toString(),
      unitPrice: order.unitPrice.toString(),
      cylinderSize: order.cylinderSize || "",
    })
    setProductSearchTerm(pName)
    setShowProductSuggestions(false)
    setEditingItemIndex(0)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this purchase order?")) {
      try {
        await employeePurchaseOrdersAPI.delete(id)
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
    
    // Validate empty cylinder quantity if selected
    if (currentItem.emptyCylinderId) {
      const selectedCylinder = emptyCylinders.find(c => c._id === currentItem.emptyCylinderId)
      if (selectedCylinder) {
        const availableQuantity = selectedCylinder.remainingQuantity || 0
        const requestedQuantity = Number(currentItem.quantity) || 0
        
        if (requestedQuantity > availableQuantity) {
          setError(`Insufficient empty cylinders. Available: ${availableQuantity}, Requested: ${requestedQuantity}`)
          return
        }
      }
    }
    // Get cylinder name for display
    const selectedCylinder = emptyCylinders.find(c => c._id === currentItem.emptyCylinderId)
    const cylinderName = selectedCylinder?.product?.name || selectedCylinder?.productName || ''
    
    const nextItems = [...formData.items, {
      purchaseType: currentItem.purchaseType,
      productId: currentItem.productId,
      quantity: currentItem.quantity,
      unitPrice: currentItem.unitPrice,
      emptyCylinderId: currentItem.emptyCylinderId,
      emptyCylinderName: cylinderName,
    }]
    setFormData({ ...formData, items: nextItems })
    // Clear inputs for next entry
    setCurrentItem({ purchaseType: currentItem.purchaseType, productId: "", quantity: "", unitPrice: "", cylinderSize: "", emptyCylinderId: "" })
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

  // Calculate total amount for all items
  const totalAmount = formData.items.reduce((sum, item) => {
    const quantity = Number(item.quantity) || 0
    const unitPrice = Number(item.unitPrice) || 0
    return sum + (quantity * unitPrice)
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
  const displayCylinderSize = (s?: string) => {
    if (!s) return "-"
    if (s === "45kg") return "Large"
    if (s === "5kg") return "Small"
    if (s.toLowerCase() === "large") return "Large"
    if (s.toLowerCase() === "small") return "Small"
    return s
  }
  const filteredOrders = purchaseOrders.filter((o) => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return true
    const supplierName = o.supplier?.companyName
    const productName = o.product?.name
    const dateStr = o.purchaseDate ? new Date(o.purchaseDate).toLocaleDateString() : ""
    return (
      norm(o.poNumber).includes(q) ||
      norm(supplierName).includes(q) ||
      norm(productName).includes(q) ||
      norm(o.status).includes(q) ||
      norm(dateStr).includes(q)
    )
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
    const map: Record<string, InvoiceGroup> = {}
    for (const o of filteredOrders) {
      const key = o.poNumber || `N/A-${o._id}`
      if (!map[key]) {
        map[key] = {
          key,
          invoice: o.poNumber || "N/A",
          supplierName: o.supplier?.companyName || "Unknown Supplier",
          date: o.purchaseDate || "",
          status: o.status,
          totalAmount: 0,
          items: [],
        }
      }
      map[key].items.push(o)
      const itemTotal = typeof o.totalAmount === "number" && !Number.isNaN(o.totalAmount)
        ? o.totalAmount
        : (o.quantity || 0) * (o.unitPrice || 0)
      map[key].totalAmount += itemTotal
    }
    // Keep order roughly by latest date desc
    return Object.values(map).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  })()

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Read-only status display in child rows (no inline updates)

  return (
    <div className="pt-16 lg:pt-0 space-y-6 sm:space-y-8">
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
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 flex items-center gap-2 sm:gap-3">
              <ShoppingCart className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 flex-shrink-0" />
              <span className="truncate">Employee Purchase Management</span>
            </h1>
            <p className="text-white/80 text-sm sm:text-base lg:text-lg">Create and manage your employee purchase orders</p>
          </div>

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
                  <span className="truncate">{editingOrder ? "Edit Employee Purchase Order" : "New Employee Purchase Order"}</span>
                </DialogTitle>
                <div className="sr-only">
                  {editingOrder ? "Edit an existing employee purchase order" : "Create a new employee purchase order with supplier, product, and quantity details"}
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
                        onValueChange={(value: "gas") => {
                          setCurrentItem((ci) => ({ ...ci, purchaseType: value, productId: "", cylinderSize: "" }))
                          setProductSearchTerm("")
                          setShowProductSuggestions(false)
                        }}
                      >
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gas">Gas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 relative">
                      <Label>Product *</Label>
                      <Input
                        value={productSearchTerm}
                        onChange={(e) => {
                          const v = e.target.value
                          setProductSearchTerm(v)
                          setShowProductSuggestions(v.trim().length > 0)
                        }}
                        onFocus={() => setShowProductSuggestions((productSearchTerm || '').trim().length > 0)}
                        onBlur={() => setTimeout(() => setShowProductSuggestions(false), 150)}
                        placeholder="Type to search product"
                        className="h-10"
                      />
                      {showProductSuggestions && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-auto">
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
                                  unitPrice: (p.costPrice ?? '').toString(),
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
                    
                    {/* Empty Cylinder Selection Field */}
                    <div className="space-y-2 relative">
                      <Label>Select Empty Cylinder</Label>
                      <Input
                        value={cylinderSearchTerm}
                        onChange={(e) => {
                          const v = e.target.value
                          setCylinderSearchTerm(v)
                          setShowCylinderSuggestions(v.trim().length > 0)
                        }}
                        onFocus={() => setShowCylinderSuggestions((cylinderSearchTerm || '').trim().length > 0)}
                        onBlur={() => setTimeout(() => setShowCylinderSuggestions(false), 150)}
                        placeholder="Type to search empty cylinders"
                        className="h-10"
                      />
                      {showCylinderSuggestions && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-auto">
                          {emptyCylinders
                            .filter(cylinder => 
                              cylinderSearchTerm.trim().length === 0 ? true : 
                              (cylinder.product?.name || cylinder.productName || '').toLowerCase().includes(cylinderSearchTerm.toLowerCase())
                            )
                            .slice(0, 8).map((cylinder) => (
                            <button
                              type="button"
                              key={cylinder._id}
                              onClick={() => {
                                setCurrentItem((ci) => ({
                                  ...ci,
                                  emptyCylinderId: cylinder._id,
                                }))
                                setCylinderSearchTerm(cylinder.product?.name || cylinder.productName || '')
                                setShowCylinderSuggestions(false)
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                            >
                              <div className="font-medium text-gray-800">
                                {cylinder.product?.name || cylinder.productName}
                              </div>
                              <div className="text-xs text-gray-500">
                                Available: {cylinder.remainingQuantity || 0} • Size: {cylinder.product?.cylinderSize || 'N/A'}
                              </div>
                            </button>
                          ))}
                          {emptyCylinders.filter(cylinder => 
                            (cylinder.product?.name || cylinder.productName || '').toLowerCase().includes(cylinderSearchTerm.toLowerCase())
                          ).length === 0 && (
                            <div className="px-3 py-2 text-sm text-gray-500">No empty cylinders found</div>
                          )}
                        </div>
                      )}
                    </div>
                    
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
                          })
                          setFormData({ ...formData, items: newItems })
                          setEditingItemIndex(null)
                          setCurrentItem({ purchaseType: currentItem.purchaseType, productId: "", quantity: "", unitPrice: "", cylinderSize: "" })
                          setProductSearchTerm("")
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
                          <TableHead>Total (AED)</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {formData.items.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-gray-500">No items added yet</TableCell>
                          </TableRow>
                        )}
                        {formData.items.map((it, idx) => {
                          const p = products.find(p => p._id === it.productId)
                          const qty = Number(it.quantity) || 0
                          const up = Number(it.unitPrice) || 0
                          return (
                            <TableRow key={idx}>
                              <TableCell className="whitespace-nowrap">{it.purchaseType}</TableCell>
                              <TableCell className="max-w-[220px] truncate">{p?.name || 'Product'}</TableCell>
                              <TableCell>{qty}</TableCell>
                              <TableCell>AED {up.toFixed(2)}</TableCell>
                              <TableCell className="font-semibold">AED {(qty * up).toFixed(2)}</TableCell>
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
                                        cylinderSize: "",
                                      })
                                      setProductSearchTerm(p?.name || '')
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

                {/* Total Amount Display */}
                {totalAmount > 0 && (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-blue-200">
                    <div className="flex justify-between items-center">
                      <span className="text-sm sm:text-lg font-semibold text-gray-700">Total Amount:</span>
                      <span className="text-lg sm:text-2xl font-bold text-[#2B3068]">AED {totalAmount.toFixed(2)}</span>
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

      {/* Purchase Orders Table */}
      <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
            <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold flex items-center gap-2 flex-1">
              Employee Purchase Orders
              <Badge variant="secondary" className="bg-white/20 text-white ml-2 text-xs sm:text-sm">
                {filteredOrders.length}/{purchaseOrders.length} orders
              </Badge>
            </CardTitle>
            <div className="bg-white rounded-xl p-2 flex items-center gap-2 w-full lg:w-80">
              <Input
                placeholder="Search INV, supplier, product, status, date..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-10 text-gray-800"
              />
            </div>
          </div>
        </CardHeader>
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
                  <TableHead className="font-bold text-gray-700 p-2 sm:p-4 text-xs sm:text-sm whitespace-nowrap">Total Amount (AED)</TableHead>
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
                      <TableCell className="p-2 sm:p-4 text-xs sm:text-sm">{group.items.length}</TableCell>
                      <TableCell className="p-2 sm:p-4 font-semibold text-xs sm:text-sm">AED {group.totalAmount.toFixed(2)}</TableCell>
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
                                ? "bg-yellow-100"
                                : "bg-red-100"
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
                        <TableCell colSpan={8} className="p-0">
                          <div className="px-4 py-3">
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-white">
                                    <TableHead className="text-xs sm:text-sm">Product</TableHead>
                                    <TableHead className="text-xs sm:text-sm">Type</TableHead>
                                    <TableHead className="text-xs sm:text-sm">Cylinder Size</TableHead>
                                    <TableHead className="text-xs sm:text-sm">Qty</TableHead>
                                    <TableHead className="text-xs sm:text-sm">Unit Price (AED)</TableHead>
                                    <TableHead className="text-xs sm:text-sm">Total (AED)</TableHead>
                                    <TableHead className="text-xs sm:text-sm">Status</TableHead>
                                    <TableHead className="text-xs sm:text-sm">Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {group.items.map((order) => (
                                    <TableRow key={order._id} className="border-b">
                                      <TableCell className="text-xs sm:text-sm max-w-[220px] truncate">{order.product?.name || "Unknown Product"}</TableCell>
                                      <TableCell className="text-xs sm:text-sm whitespace-nowrap">{order.purchaseType}</TableCell>
                                      <TableCell className="text-xs sm:text-sm whitespace-nowrap">-</TableCell>
                                      <TableCell className="text-xs sm:text-sm">{order.quantity || 0}</TableCell>
                                      <TableCell className="font-semibold text-xs sm:text-sm">AED {order.unitPrice?.toFixed(2) || "0.00"}</TableCell>
                                      <TableCell className="font-semibold text-xs sm:text-sm">AED {order.totalAmount?.toFixed(2) || ((order.quantity || 0) * (order.unitPrice || 0)).toFixed(2)}</TableCell>
                                      <TableCell className="text-xs sm:text-sm">
                                        <Badge
                                          variant={
                                            order.status === "completed"
                                              ? "default"
                                              : order.status === "pending"
                                                ? "secondary"
                                                : "destructive"
                                          }
                                          className={`${
                                            order.status === "completed"
                                              ? "bg-green-600"
                                              : order.status === "pending"
                                                ? "bg-yellow-100"
                                                : "bg-red-100"
                                          } text-white font-medium px-2 py-1 rounded-full text-xs`}
                                        >
                                          {order.status}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex space-x-1 sm:space-x-2">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleEdit(order)}
                                            className="border-[#2B3068] text-[#2B3068] hover:bg-[#2B3068] hover:text-white transition-colors p-1 sm:p-2"
                                          >
                                            <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleDelete(order._id)}
                                            className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors p-1 sm:p-2"
                                          >
                                            <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
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
                    <TableCell colSpan={8} className="text-center py-8 sm:py-12">
                      <div className="text-gray-500">
                        <PackageIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p className="text-base sm:text-lg font-medium">No employee purchase orders found</p>
                        <p className="text-sm">Create your first employee purchase order to get started</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
