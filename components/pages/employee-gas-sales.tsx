"use client"

import { useState, useEffect, useMemo, Fragment } from "react"

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
  const [showEntrySuggestions, setShowEntrySuggestions] = useState(false)
  // Gas product autocomplete for Full cylinder
  const [entryGasSearch, setEntryGasSearch] = useState("")
  const [showEntryGasSuggestions, setShowEntryGasSuggestions] = useState(false)
  // Cylinder product autocomplete for Gas sales
  const [entryCylinderSearch, setEntryCylinderSearch] = useState("")
  const [showEntryCylinderSuggestions, setShowEntryCylinderSuggestions] = useState(false)
  // Live availability from inventory-items (authoritative for cylinder availability)
  const [inventoryAvailability, setInventoryAvailability] = useState<Record<string, { availableEmpty: number; availableFull: number; currentStock: number }>>({})

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

  // Stock validation notification state (replacing popup)
  const [showStockNotification, setShowStockNotification] = useState(false)
  const [stockErrorMessage, setStockErrorMessage] = useState("")
  const [showPriceValidationPopup, setShowPriceValidationPopup] = useState(false)
  const [validationMessage, setValidationMessage] = useState("")

  // Track expanded invoice groups in Sales History table
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  // Auto-dismiss stock notification after 5s
  useEffect(() => {
    if (showStockNotification) {
      const timer = setTimeout(() => {
        setShowStockNotification(false)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [showStockNotification])

  useEffect(() => {
    fetchData()
  }, [user.id])

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

  // Reset pagination on filter/search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter])

  // Compute filtered products based on category (using useMemo to avoid render-phase updates)
  const filteredProducts = useMemo(() => {
    if (allProducts.length === 0) return []
    
    const filtered = allProducts.filter((product: Product) => {
      if (product.category !== formData.category) return false
      
      if (product.category === 'cylinder') {
        // For cylinders, only show full cylinders (available for sale) - matching admin logic
        if ((product as any).cylinderStatus !== 'full') return false
        // Check cylinder stock from inventory availability
        const availableFull = inventoryAvailability[product._id]?.availableFull || 0
        return availableFull > 0
      } else if (product.category === 'gas') {
        // For gas, check currentStock from inventory availability (Gas tab) - matching admin logic
        const gasStock = inventoryAvailability[product._id]?.currentStock || product.currentStock || 0
        return gasStock > 0
      }
      
      // Fallback to product.currentStock for other categories
      return (product.currentStock || 0) > 0
    })
    
    console.log('EmployeeGasSales - Category changed to:', formData.category)
    console.log('EmployeeGasSales - Re-filtered products:', filtered.length)
    return filtered
  }, [formData.category, allProducts, inventoryAvailability])

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
      const [salesResponse, customersResponse, employeeInventoryResponse] = await Promise.all([
        fetch(`/api/employee-sales?employeeId=${user.id}`),
        customersAPI.getAll(),
        fetch(`/api/employee-inventory?employeeId=${user.id}`),
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
      
      // Fetch employee's own inventory
      const employeeInventoryData = await employeeInventoryResponse.json()
      console.log('Employee inventory response:', employeeInventoryData)
      
      // Debug: Log each inventory item structure
      if (employeeInventoryData?.data && Array.isArray(employeeInventoryData.data)) {
        console.log('🔍 DEBUG: Employee inventory items:')
        employeeInventoryData.data.forEach((item:any, index:any) => {
          console.log(`Item ${index}:`, {
            id: item._id,
            productId: item.product?._id,
            productName: item.product?.name,
            productCategory: item.product?.category,
            inventoryCategory: item.category,
            currentStock: item.currentStock,
            availableEmpty: item.availableEmpty,
            availableFull: item.availableFull,
            cylinderStatus: item.cylinderStatus,
            displayCategory: item.displayCategory
          })
        })
      }
      
      // Extract products from employee inventory with any stock (gas, full cylinders, or empty cylinders)
      const allEmployeeProducts: Product[] = [];
      if (employeeInventoryData?.data && Array.isArray(employeeInventoryData.data)) {
        employeeInventoryData.data.forEach((inventoryItem: any) => {
          if (inventoryItem.product) {
            // Include products that have any stock (gas, full cylinders, or empty cylinders)
            const currentStock = inventoryItem.currentStock || 0
            const availableEmpty = inventoryItem.availableEmpty || 0
            const availableFull = inventoryItem.availableFull || 0
            
            // Only include if there's any stock available
            if (currentStock > 0 || availableEmpty > 0 || availableFull > 0) {
              // Map inventory categories to product categories for proper filtering
              let productCategory = inventoryItem.product.category || 'gas'
              if (inventoryItem.category) {
                // Convert inventory display categories to product categories
                if (inventoryItem.category === 'Gas') {
                  productCategory = 'gas'
                } else if (inventoryItem.category === 'Full Cylinder' || inventoryItem.category === 'Empty Cylinder') {
                  productCategory = 'cylinder'
                }
              }
              
              const productWithStock = {
                ...inventoryItem.product,
                currentStock: currentStock,
                // Add inventory-specific fields for availability checking
                availableEmpty: availableEmpty,
                availableFull: availableFull,
                category: productCategory,
                cylinderStatus: inventoryItem.cylinderStatus,
                // Ensure price fields are preserved
                leastPrice: inventoryItem.product?.leastPrice || 0,
                costPrice: inventoryItem.product?.costPrice || 0
              }
              console.log(`✅ Including product:`, {
                name: productWithStock.name,
                category: productWithStock.category,
                currentStock: currentStock,
                availableEmpty: availableEmpty,
                availableFull: availableFull,
                cylinderStatus: inventoryItem.cylinderStatus,
                leastPrice: productWithStock.leastPrice,
                costPrice: productWithStock.costPrice,
                originalProductLeastPrice: inventoryItem.product?.leastPrice,
                originalProductCostPrice: inventoryItem.product?.costPrice
              })
              allEmployeeProducts.push(productWithStock)
            } else {
              console.log(`❌ Excluding product (no stock):`, {
                name: inventoryItem.product?.name,
                category: inventoryItem.category || inventoryItem.product?.category,
                currentStock: currentStock,
                availableEmpty: availableEmpty,
                availableFull: availableFull
              })
            }
          }
        })
      }
      // Deduplicate products by _id
      const dedupedAllProducts = Array.from(
        new Map(allEmployeeProducts.map(p => [p._id, p])).values()
      )
      
      // Build inventory availability map from employee inventory FIRST (before filtering)
      const availMap: Record<string, { availableEmpty: number; availableFull: number; currentStock: number }> = {}
      if (employeeInventoryData?.data && Array.isArray(employeeInventoryData.data)) {
        employeeInventoryData.data.forEach((inventoryItem: any) => {
          if (inventoryItem.product?._id) {
            availMap[inventoryItem.product._id] = {
              availableEmpty: Number(inventoryItem.availableEmpty || 0),
              availableFull: Number(inventoryItem.availableFull || 0),
              currentStock: Number(inventoryItem.currentStock || 0),
            }
          }
        })
      }
      
      // Filter by selected category using inventory data for accurate stock levels (matching admin logic)
      const filteredProducts = dedupedAllProducts.filter((product: Product) => {
        console.log(`🔍 Filtering product:`, {
          name: product.name,
          productCategory: product.category,
          selectedCategory: formData.category,
          cylinderStatus: (product as any).cylinderStatus,
          availMapStock: availMap[product._id],
          productStock: product.currentStock
        })
        
        if (product.category !== formData.category) {
          console.log(`❌ Category mismatch: ${product.category} !== ${formData.category}`)
          return false
        }
        
        if (product.category === 'cylinder') {
          // For cylinders, only show full cylinders (available for sale) - matching admin logic
          if ((product as any).cylinderStatus !== 'full') {
            console.log(`❌ Cylinder not full: ${(product as any).cylinderStatus}`)
            return false
          }
          // Check cylinder stock from inventory availability
          const availableFull = availMap[product._id]?.availableFull || 0
          console.log(`🔍 Cylinder full stock check: ${availableFull}`)
          return availableFull > 0
        } else if (product.category === 'gas') {
          // For gas, check currentStock from inventory availability (Gas tab) - matching admin logic
          const gasStock = availMap[product._id]?.currentStock || 0
          console.log(`🔍 Gas stock check: ${gasStock}`)
          return gasStock > 0
        }
        
        // Fallback to product.currentStock for other categories
        const fallbackStock = (product.currentStock || 0)
        console.log(`🔍 Fallback stock check: ${fallbackStock}`)
        return fallbackStock > 0
      });
      setInventoryAvailability(availMap)
      
      setCustomers(customersData)
      setAllProducts(dedupedAllProducts)
      setSales(salesArray)
      
      console.log('Employee Gas Sales - Category filter:', formData.category)
      console.log('Employee Gas Sales - All products:', dedupedAllProducts.length)
      console.log('Employee Gas Sales - Filtered products:', filteredProducts.length)
      console.log('Employee Gas Sales - Gas products with stock:', dedupedAllProducts.filter(p => p.category === 'gas').map(p => ({
        name: p.name,
        productStock: p.currentStock,
        inventoryStock: availMap[p._id]?.currentStock || 0
      })))
      console.log('Employee Gas Sales - Cylinder products with stock:', dedupedAllProducts.filter(p => p.category === 'cylinder').map(p => ({
        name: p.name,
        status: (p as any).cylinderStatus,
        availableFull: availMap[p._id]?.availableFull || 0,
        availableEmpty: availMap[p._id]?.availableEmpty || 0
      })))
      console.log('Employee Gas Sales - Loaded inventory:', {
        totalItems: employeeInventoryData?.data?.length || 0,
        gasProducts: dedupedAllProducts.filter(p => p.category === 'gas').length,
        cylinderProducts: dedupedAllProducts.filter(p => p.category === 'cylinder').length,
        availabilityMap: Object.keys(availMap).length,
        sampleProduct: dedupedAllProducts[0] ? {
          name: dedupedAllProducts[0].name,
          leastPrice: dedupedAllProducts[0].leastPrice,
          costPrice: dedupedAllProducts[0].costPrice
        } : null
      })
    } catch (error) {
      console.error("Failed to fetch data:", error)
      setSales([])
      setCustomers([])
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
    
    // Auto-select status based on received amount vs total amount (with VAT)
    if (name === "receivedAmount") {
      const totalWithVAT = calculateTotalAmount() * 1.05
      // Use Math.abs for floating point comparison to handle precision issues
      if (Math.abs(numericValue - totalWithVAT) < 0.01 && totalWithVAT > 0) {
        newFormData.paymentStatus = "cleared"
      } else if (numericValue > 0 && numericValue < totalWithVAT) {
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

  // Helper function to calculate reserved stock from current form items
  const calculateReservedStock = (productId: string, category: 'gas' | 'cylinder', cylinderStatus?: 'full' | 'empty') => {
    return formData.items.reduce((reserved, item) => {
      if (item.productId === productId) {
        // For cylinders, also match the status
        if (category === 'cylinder') {
          const itemStatus = (item as any).cylinderStatus
          if (cylinderStatus && itemStatus !== cylinderStatus) {
            return reserved // Don't count if status doesn't match
          }
        }
        return reserved + (Number(item.quantity) || 0)
      }
      return reserved
    }, 0)
  }

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
      price: (Number(product.leastPrice) || Number(product.costPrice) || 0).toString(),
      cylinderStatus: currentItem.cylinderStatus || "empty" as "empty" | "full",
      gasProductId: "",
      cylinderProductId: currentItem.cylinderProductId || "",
    }

    // If gas selected, auto-pick a suitable full cylinder in stock
    if (product.category === 'gas') {
      const gasSize = product.cylinderSize as ("large" | "small" | undefined)
      let candidates = allProducts.filter((p: Product) => {
        if (p.category !== 'cylinder') return false
        const avail = inventoryAvailability[p._id]?.availableFull || 0
        return avail > 0
      })
      // Fallback: if none via availability map, use currentStock as a backup
      if (candidates.length === 0) {
        candidates = allProducts.filter((p: Product) => p.category === 'cylinder' && (p.currentStock || 0) > 0)
      }
      const sizeMatched = gasSize ? candidates.filter((c: Product) => (c.cylinderSize as any) === gasSize) : []
      const pick = (sizeMatched.length > 0 ? sizeMatched : candidates)
        .sort((a, b) => (((inventoryAvailability[b._id]?.availableFull ?? b.currentStock) || 0) - ((inventoryAvailability[a._id]?.availableFull ?? a.currentStock) || 0)))[0]
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
        const gasStock = p.currentStock || 0
        return gasStock > 0
      })
      // Try to match cylinder size with gas size if available
      const sizeMatched = cylinderSize ? gasProducts.filter((g: Product) => (g.cylinderSize as any) === cylinderSize) : []
      const pick = (sizeMatched.length > 0 ? sizeMatched : gasProducts)
        .sort((a, b) => ((b.currentStock || 0) - (a.currentStock || 0)))[0]
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

  const handleEntryQuantityChange = (value: string) => {
    const enteredQuantity = parseInt(value) || 0
    const product = allProducts.find((p: Product) => p._id === currentItem.productId)
    
    if (product && enteredQuantity > 0) {
      // Comprehensive stock validation with reserved stock calculation
      let totalStock = 0
      let reservedStock = 0
      let availableStock = 0
      let stockType = ''
      
      if (currentItem.category === 'gas') {
        // For gas sales, validate gas stock from employee inventory with reserved stock
        totalStock = inventoryAvailability[product._id]?.currentStock || product.currentStock || 0
        reservedStock = calculateReservedStock(product._id, 'gas')
        availableStock = totalStock - reservedStock
        stockType = 'Gas'
        
        if (enteredQuantity > availableStock) {
          setStockErrorMessage(`Insufficient ${stockType} stock for ${product.name}. Available: ${totalStock}, Reserved: ${reservedStock}, Remaining: ${availableStock}, Required: ${enteredQuantity}`)
          setShowStockNotification(true)
          return
        }
      } else if (currentItem.category === 'cylinder') {
        // For cylinders, check based on cylinderStatus with reserved stock
        if (currentItem.cylinderStatus === 'full') {
          totalStock = inventoryAvailability[product._id]?.availableFull || 0
          reservedStock = calculateReservedStock(product._id, 'cylinder', 'full')
          availableStock = totalStock - reservedStock
          stockType = 'Full Cylinders'
        } else {
          totalStock = inventoryAvailability[product._id]?.availableEmpty || 0
          reservedStock = calculateReservedStock(product._id, 'cylinder', 'empty')
          availableStock = totalStock - reservedStock
          stockType = 'Empty Cylinders'
        }
        
        if (enteredQuantity > availableStock) {
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
    const minPrice = product?.leastPrice || product?.costPrice || 0
    if (product && !isNaN(enteredPrice) && enteredPrice < minPrice) {
      setPriceAlert({ message: `Price must be at least ${minPrice.toFixed(2)}`, index: -1 })
      setTimeout(() => setPriceAlert({ message: '', index: null }), 2000)
    }
    setCurrentItem((prev) => ({ ...prev, price: value }))
  }

  const addOrUpdateItem = () => {
    const qty = Number(currentItem.quantity) || 0
    const pr = Number(currentItem.price) || 0
    
    console.log('🔍 AddOrUpdateItem - Validation check:', {
      productId: currentItem.productId,
      quantity: currentItem.quantity,
      price: currentItem.price,
      qty: qty,
      pr: pr,
      hasProductId: !!currentItem.productId,
      qtyValid: qty > 0,
      priceValid: pr > 0
    })
    
    if (!currentItem.productId) {
      console.log('❌ AddOrUpdateItem failed: No product selected')
      return
    }
    if (qty <= 0) {
      console.log('❌ AddOrUpdateItem failed: Invalid quantity:', qty)
      return
    }
    if (pr <= 0) {
      console.log('❌ AddOrUpdateItem failed: Invalid price:', pr)
      return
    }
    
    console.log('✅ AddOrUpdateItem validation passed, proceeding...')
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
    // If cylinder is Full and a gas product is selected, add an auxiliary zero-priced GAS item
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
      
      items.push({
        productId: currentItem.gasProductId,
        quantity: currentItem.quantity,
        price: '0',
        category: 'gas' as any,
        gasProductId: currentItem.gasProductId, // Also add to auxiliary item
      } as any)
    }

    // If GAS is being sold, add an auxiliary zero-priced CYLINDER item to convert full->empty
    if (currentItem.category === 'gas') {
      const cylinderProduct = allProducts.find((p: Product) => p._id === currentItem.cylinderProductId)
      
      if (cylinderProduct) {
        // Skip frontend cylinder validation - let backend handle it with proper inventory data
        items.push({
          productId: currentItem.cylinderProductId,
          quantity: currentItem.quantity,
          price: '0',
          category: 'cylinder' as any,
          cylinderStatus: 'full_to_empty',
          cylinderName: cylinderProduct.name, // Store cylinder name for display
        } as any)
      }
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

    // Validate debit amount is required when debit payment option is selected
    if (formData.paymentOption === 'debit') {
      const receivedAmount = parseFloat(formData.receivedAmount) || 0
      if (receivedAmount <= 0) {
        alert("Please enter the debit amount when 'Debit' payment option is selected")
        return
      }
    }

    try {
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
            console.log('EmployeeGasSales - Adding gasProductId to cylinder item:', (item as any).gasProductId)
          }
          
          return saleItem
        })

      // Also create auxiliary items for backend inventory processing
      const auxiliaryItems = formData.items
        .filter((item) => {
          const quantity = Number(item.quantity) || 0
          const price = Number(item.price) || 0
          // Include auxiliary items (price = 0) for inventory conversion
          return item.productId && quantity > 0 && price === 0
        })
        .map((item) => {
          const quantity = Number(item.quantity) || 1
          const prod = allProducts.find((p: Product) => p._id === item.productId)
          const category = (item as any).category || prod?.category || 'cylinder'
          return {
            product: item.productId,
            quantity: quantity,
            price: 0,
            total: 0,
            category: category,
            cylinderStatus: (item as any).cylinderStatus || 'full_to_empty',
            cylinderName: (item as any).cylinderName,
            cylinderSize: prod?.cylinderSize || 'large', // Add cylinder size for backend
          }
        })

      // Combine main items and auxiliary items for complete inventory processing
      const allItems = [...saleItems, ...auxiliaryItems]

      if (saleItems.length === 0) {
        alert("Please add at least one item")
        return
      }

      const subtotalAmount = saleItems.reduce((sum, item) => sum + item.total, 0)
      const totalAmount = subtotalAmount * 1.05 // Add 5% VAT

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
        items: saleItems,  // Send only main items - backend should handle cylinder conversion internally
        totalAmount,
        paymentMethod: derivedPaymentMethod,
        paymentStatus: derivedPaymentStatus,
        receivedAmount: derivedReceivedAmount,
        notes: formData.notes,
        // Include inventory availability data so backend uses same source as frontend
        inventoryAvailability: inventoryAvailability,
      }

      console.log('EmployeeGasSales - Submitting sale data:', saleData)
      console.log('EmployeeGasSales - Sale items (main):', saleItems)
      console.log('EmployeeGasSales - Auxiliary items:', auxiliaryItems)
      console.log('EmployeeGasSales - All items (combined):', allItems)
      console.log('EmployeeGasSales - Form data items:', formData.items)
      console.log('EmployeeGasSales - Inventory availability data:', inventoryAvailability)
      
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
      
      // Log detailed item structure for debugging
      allItems.forEach((item, index) => {
        console.log(`EmployeeGasSales - Item ${index}:`, {
          product: item.product,
          category: item.category,
          quantity: item.quantity,
          price: item.price,
          cylinderStatus: item.cylinderStatus,
          cylinderProductId: item.cylinderProductId,
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
        savedResponse = await employeeSalesAPI.create(saleData)
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

      // Prepare a normalized sale object and open signature dialog automatically
      try {
        const saved = (savedResponse?.data?.data) || (savedResponse?.data) || null
        // Notify other pages about sale completion
        localStorage.setItem('saleCompleted', Date.now().toString())
        window.dispatchEvent(new Event('saleCompleted'))
        console.log('✅ Gas sale completed and sale completion notification sent to other pages')
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

        const subtotalAmt = itemsNormalized.reduce((s: number, it: any) => s + (Number(it.total) || 0), 0)
        const totalAmt = subtotalAmt * 1.05 // Add 5% VAT

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
          subtotalAmount: subtotalAmt, // Add subtotal for receipt
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
    } catch (error: any) {
      console.error("Failed to save sale:", error?.response?.data || error?.message, error)
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
                    const filteredProducts = allProducts
                      .filter((p: Product) => {
                        // Filter by category
                        if (p.category !== currentItem.category) return false;
                        // For cylinders, filter based on selected status
                        if (p.category === 'cylinder') {
                          if (currentItem.cylinderStatus === 'empty') {
                            // Show cylinders with empty stock available
                            const availableEmpty = (p as any).availableEmpty || inventoryAvailability[p._id]?.availableEmpty || 0;
                            if (availableEmpty <= 0) return false;
                          } else {
                            // Show cylinders with full stock available
                            const availableFull = (p as any).availableFull || inventoryAvailability[p._id]?.availableFull || 0;
                            if (availableFull <= 0) return false;
                          }
                        }
                        // For gas, only show products that are in stock (align with Inventory 'Gas' tab)
                        if (p.category === 'gas' && (p.currentStock || 0) <= 0) return false;
                        // Filter by search term
                        if (entryProductSearch.trim().length > 0) {
                          const searchTerm = entryProductSearch.toLowerCase().trim()
                          const productName = p.name.toLowerCase().trim()
                          if (!productName.includes(searchTerm)) return false;
                        }
                        return true;
                      })
                      .slice(0, 8)
                    
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
                                  {product.category === 'cylinder' && (
                                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                      {currentItem.cylinderStatus === 'empty' ? 'Empty' : 'Full'}: {currentItem.cylinderStatus === 'empty' ? (inventoryAvailability[product._id]?.availableEmpty || 0) : (inventoryAvailability[product._id]?.availableFull || 0)}
                                    </span>
                                  )}
                                  <span className="text-xs text-gray-500">Min AED {(product.leastPrice || product.costPrice || 0).toFixed(2)}</span>
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
                              const avail = (p as any).availableFull || inventoryAvailability[p._id]?.availableFull || 0
                              return avail > 0
                            })
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
                                <span className="text-xs text-gray-500">Stock: {product.currentStock}</span>
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
                      const minPrice = p?.leastPrice || p?.costPrice || 0
                      return minPrice > 0 ? `Min: AED ${minPrice.toFixed(2)}` : 'Select product first'
                    })()}
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
                              })()
                              }
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
            </div>

            {/* Total with VAT Section */}
            <div className="text-right space-y-2">
              <div className="text-lg text-gray-700">Subtotal: AED {calculateTotalAmount().toFixed(2)}</div>
              <div className="text-lg text-gray-700">VAT (5%): AED {(calculateTotalAmount() * 0.05).toFixed(2)}</div>
              <div className="border-t pt-2">
                <div className="text-2xl font-bold text-[#2B3068]">Total: AED {(calculateTotalAmount() * 1.05).toFixed(2)}</div>
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
                      const totalWithVAT = calculateTotalAmount() * 1.05
                      let newPaymentStatus = formData.paymentStatus
                      // Use Math.abs for floating point comparison to handle precision issues
                      if (Math.abs(receivedValue - totalWithVAT) < 0.01 && totalWithVAT > 0) newPaymentStatus = 'cleared'
                      else if (receivedValue > 0 && receivedValue < totalWithVAT) newPaymentStatus = 'pending'
                      else if (receivedValue === 0) newPaymentStatus = 'pending'
                      setFormData({ ...formData, receivedAmount, paymentStatus: newPaymentStatus, paymentMethod: 'debit' })
                    }}
                    className="text-lg"
                  />
                  {formData.receivedAmount && (
                    <div className="text-sm text-gray-600">
                      {(() => { const rv = parseFloat(formData.receivedAmount)||0; const totalWithVAT = calculateTotalAmount() * 1.05; const rem = totalWithVAT - rv; if(rem>0){return `Remaining: AED ${rem.toFixed(2)}`} else if(rem<0){return `Excess: AED ${Math.abs(rem).toFixed(2)}`} else {return '✓ Fully paid'} })()}
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