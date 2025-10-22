// ⚠️ DEPRECATED: This file uses the old inventory system and should not be used.
// Use employee-cylinder-sales.tsx instead, which has been updated to work with the new inventory system.

"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Edit, Trash2, Search, DollarSign, Package, TrendingUp, Users } from "lucide-react"
import { toast } from "sonner"

interface EmployeeCylinderSalesProps {
  user: {
    id: string
    name: string
    email: string
    role: string
  }
}

interface Customer {
  _id: string
  name: string
  email: string
  phone: string
  address: string
}

interface Product {
  _id: string
  name: string
  category: string
  cylinderType: string
  costPrice: number
  leastPrice: number
  currentStock: number
}

interface CylinderTransaction {
  _id: string
  type: "deposit" | "refill" | "return"
  customer: Customer
  product: Product
  cylinderSize: "small" | "large"
  quantity: number
  amount: number
  depositAmount: number
  refillAmount: number
  returnAmount: number
  paymentMethod: "cash" | "cheque"
  cashAmount: number
  bankName: string
  checkNumber: string
  status: "pending" | "cleared" | "overdue"
  notes: string
  employee: string
  createdAt: string
  updatedAt: string
}

interface StockAssignment {
  _id: string
  employee: {
    _id: string
    name: string
  }
  product: Product
  quantity: number
  remainingQuantity: number
  status: "assigned" | "received" | "returned"
  assignedBy: string
  createdAt: string
}

export default function EmployeeCylinderSales({ user }: EmployeeCylinderSalesProps) {
  // State management
  const [transactions, setTransactions] = useState<CylinderTransaction[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [stockAssignments, setStockAssignments] = useState<StockAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("all")
  const [editingTransaction, setEditingTransaction] = useState<CylinderTransaction | null>(null)

  // Customer search state
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false)
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([])

  // Form state
  const [formData, setFormData] = useState({
    type: "deposit" as "deposit" | "refill" | "return",
    customer: "",
    product: "",
    cylinderSize: "small" as "small" | "large",
    quantity: 1,
    amount: 0,
    depositAmount: 0,
    refillAmount: 0,
    returnAmount: 0,
    paymentMethod: "cash" as "cash" | "cheque",
    cashAmount: 0,
    bankName: "",
    checkNumber: "",
    status: "pending" as "pending" | "cleared" | "overdue",
    notes: ""
  })

  // Fetch data on component mount
  useEffect(() => {
    fetchData()
  }, [user.id])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [transactionsResponse, customersResponse, productsResponse, stockAssignmentsResponse] = await Promise.all([
        fetch(`/api/employee-cylinders?employeeId=${user.id}`),
        fetch("/api/customers"),
        fetch("/api/products"),
        fetch(`/api/stock-assignments?employeeId=${user.id}&status=received`)
      ])

      if (transactionsResponse.ok) {
        const transactionsData = await transactionsResponse.json()
        setTransactions(Array.isArray(transactionsData) ? transactionsData : [])
      } else {
        setTransactions([])
      }

      if (customersResponse.ok) {
        const customersData = await customersResponse.json()
        const customers = customersData.data || customersData
        setCustomers(Array.isArray(customers) ? customers : [])
      } else {
        setCustomers([])
      }

      if (productsResponse.ok) {
        const productsData = await productsResponse.json()
        const products = productsData.data || productsData
        const cylinderProducts = Array.isArray(products) ? products.filter((p: Product) => p.category === "cylinder") : []
        setProducts(cylinderProducts)
      } else {
        setProducts([])
      }

      if (stockAssignmentsResponse.ok) {
        const stockData = await stockAssignmentsResponse.json()
        setStockAssignments(Array.isArray(stockData) ? stockData : [])
      } else {
        setStockAssignments([])
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

  const resetForm = () => {
    setFormData({
      type: "deposit",
      customer: "",
      product: "",
      cylinderSize: "small",
      quantity: 1,
      amount: 0,
      depositAmount: 0,
      refillAmount: 0,
      returnAmount: 0,
      paymentMethod: "cash",
      cashAmount: 0,
      bankName: "",
      checkNumber: "",
      status: "pending",
      notes: ""
    })
    setCustomerSearch("")
    setShowCustomerSuggestions(false)
    setFilteredCustomers([])
    setEditingTransaction(null)
  }

  // Customer search functions
  const handleCustomerSearchChange = (value: string) => {
    setCustomerSearch(value)
    if (value.trim()) {
      const filtered = customers.filter(customer =>
        customer.name.toLowerCase().includes(value.toLowerCase()) ||
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

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.customer || !formData.product || !formData.cylinderSize || formData.quantity <= 0) {
      toast.error("Please fill in all required fields")
      return
    }

    const selectedProduct = products.find(p => p._id === formData.product)
    if (!selectedProduct) {
      toast.error("Please select a valid product")
      return
    }

    const stockAssignment = stockAssignments.find(sa => 
      sa.product._id === formData.product && sa.remainingQuantity >= formData.quantity
    )
    
    if (!stockAssignment) {
      toast.error(`Insufficient assigned stock for ${selectedProduct.name}. Please check your inventory.`)
      return
    }

    try {
      const transactionData = {
        ...formData,
        employee: user.id,
        cylinderSize: formData.cylinderSize === "small" ? "5kg" : "45kg"
      }

      const url = editingTransaction 
        ? `/api/employee-cylinders/${editingTransaction._id}`
        : "/api/employee-cylinders"
      
      const method = editingTransaction ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(transactionData),
      })

      if (response.ok) {
        toast.success(editingTransaction ? "Transaction updated successfully!" : "Transaction created successfully!")
        await fetchData()
        setIsDialogOpen(false)
        resetForm()
      } else {
        const errorData = await response.json()
        toast.error(errorData.message || "Failed to save transaction")
      }
    } catch (error) {
      console.error("Error saving transaction:", error)
      toast.error("Failed to save transaction")
    }
  }

  return <div>Employee Cylinder Sales Component - Part 1 Complete</div>
}
