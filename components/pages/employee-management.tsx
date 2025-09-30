"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useNotifications } from "@/hooks/useNotifications"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Edit, Trash2, Search, Filter, UserCheck, CheckCircle, Bell } from "lucide-react"
import { employeesAPI, productsAPI, stockAssignmentsAPI } from "@/lib/api"

interface Employee {
  _id: string
  name: string
  email: string
  phone: string
  address: string
  position: string
  salary: number
  hireDate: string
  status: "active" | "inactive"
  password?: string
  debitAmount: number
  creditAmount: number
  createdAt: string
  updatedAt: string
}

interface Product {
  _id: string
  name: string
  category: string
  costPrice: number
  leastPrice: number
  currentStock: number
  cylinderSize?: string
}

interface EmployeeManagementProps {
  user: { id: string; email: string; role: "admin" | "employee"; name: string }
}

export function EmployeeManagement({ user }: EmployeeManagementProps) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isStockDialogOpen, setIsStockDialogOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [stockAssignments, setStockAssignments] = useState<any[]>([])
  const [notification, setNotification] = useState<{ message: string; visible: boolean }>({ message: "", visible: false })
  const [isProductListDialogOpen, setIsProductListDialogOpen] = useState(false)
  const [selectedEmployeeProducts, setSelectedEmployeeProducts] = useState<any[]>([])
  const [updateNotification, setUpdateNotification] = useState<{ message: string; visible: boolean; type: 'success' | 'warning' }>({ message: "", visible: false, type: 'success' })
  
  // Use optimized notifications hook with 60-second polling
  const { 
    notifications: adminNotifications, 
    unreadCount: unreadNotificationCount,
    markAsRead 
  } = useNotifications({
    userId: user.id,
    types: ['stock_returned', 'stock_rejected'],
    unreadOnly: true,
    pollInterval: 60000 // Poll every 60 seconds instead of 5
  })

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    status: "active" as "active" | "inactive",
    password: "",
  })

  // Stock assignment form state
  const [stockFormData, setStockFormData] = useState({
    category: "cylinder" as "gas" | "cylinder",
    productId: "",
    quantity: 1,
    notes: "",
  })

  // Autocomplete state for product search
  const [productSearchTerm, setProductSearchTerm] = useState("")
  const [showProductSuggestions, setShowProductSuggestions] = useState(false)
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [selectedProductName, setSelectedProductName] = useState("")

  // Handle product search
  const handleProductSearch = (searchTerm: string) => {
    setProductSearchTerm(searchTerm)
    
    if (searchTerm.trim().length > 0) {
      const filtered = products.filter(product => 
        product.category === stockFormData.category &&
        (product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
         (product.cylinderSize && product.cylinderSize.toLowerCase().includes(searchTerm.toLowerCase())))
      ).slice(0, 5) // Limit to 5 suggestions
      
      setFilteredProducts(filtered)
      setShowProductSuggestions(true)
    } else {
      setShowProductSuggestions(false)
      setFilteredProducts([])
    }
  }

  const handleProductSelect = (product: Product) => {
    setStockFormData({ ...stockFormData, productId: product._id })
    setSelectedProductName(product.name)
    setProductSearchTerm(product.cylinderSize ? `${product.name} - ${product.cylinderSize.charAt(0).toUpperCase()}${product.cylinderSize.slice(1)}` : product.name)
    setShowProductSuggestions(false)
    setFilteredProducts([])
  }

  const handleProductInputBlur = () => {
    // Delay hiding suggestions to allow click events
    setTimeout(() => {
      setShowProductSuggestions(false)
    }, 200)
  }

  const handleProductInputFocus = () => {
    if (productSearchTerm.trim().length > 0 && filteredProducts.length > 0) {
      setShowProductSuggestions(true)
    }
  }

  useEffect(() => {
    fetchData()
    fetchStockAssignments()
    // Note: Notifications are now handled by the useNotifications hook
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [employeesResponse, productsResponse] = await Promise.all([employeesAPI.getAll(), productsAPI.getAll()])

      setEmployees(employeesResponse.data || [])
      const products = productsResponse.data || []
      setProducts(products)
      
      // Debug logging
      
      if (products.length > 0) {
        const cylinderProducts = products.filter((p: Product) => p.category === 'cylinder')
        const gasProducts = products.filter((p: Product) => p.category === 'gas')
        
        
      }
    } catch (error) {
      setEmployees([])
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  const fetchStockAssignments = async () => {
    try {
      const response = await stockAssignmentsAPI.getAll()
      const stockData = Array.isArray(response.data) ? response.data : (response.data?.data || []);
setStockAssignments(stockData)
    } catch (error) {
      setStockAssignments([])
    }
  }

  // Notification functions replaced by useNotifications hook

  const showNotification = (message: string) => {
    setNotification({ message, visible: true })
    setTimeout(() => {
      setNotification({ message: "", visible: false })
    }, 5000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const employeeData = {
        ...formData,
      }

      if (editingEmployee) {
        await employeesAPI.update(editingEmployee._id, employeeData)
      } else {
        await employeesAPI.create(employeeData)
      }

      await fetchData()
      resetForm()
      setIsDialogOpen(false)
    } catch (error: any) {
      alert(error.response?.data?.error || "Failed to save employee")
    }
  }

  const handleStockAssignment = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!selectedEmployee) return

      // Get the selected product and validate stock availability
      const selectedProduct = products.find(p => p._id === stockFormData.productId)
      if (!selectedProduct) {
        setUpdateNotification({
          message: 'Selected product not found',
          visible: true,
          type: 'warning'
        })
        setTimeout(() => {
          setUpdateNotification({ message: '', visible: false, type: 'success' })
        }, 5000)
        return
      }

      // Check if product has sufficient stock
      if (selectedProduct.currentStock === 0) {
        setUpdateNotification({
          message: `${selectedProduct.name} is out of stock and cannot be assigned`,
          visible: true,
          type: 'warning'
        })
        setTimeout(() => {
          setUpdateNotification({ message: '', visible: false, type: 'success' })
        }, 5000)
        return
      }

      if (stockFormData.quantity > selectedProduct.currentStock) {
        setUpdateNotification({
          message: `Insufficient stock. Available: ${selectedProduct.currentStock}, Requested: ${stockFormData.quantity}`,
          visible: true,
          type: 'warning'
        })
        setTimeout(() => {
          setUpdateNotification({ message: '', visible: false, type: 'success' })
        }, 5000)
        return
      }

      // Check if this product is already assigned to this employee
      const existingAssignment = stockAssignments.find(
        (assignment) => 
          assignment.employee?._id === selectedEmployee._id && 
          assignment.product?._id === stockFormData.productId &&
          assignment.status === 'assigned'
      )

      if (existingAssignment) {
        // Product already assigned - update the quantity instead
        const updatedQuantity = existingAssignment.quantity + stockFormData.quantity
        
        // Update the existing assignment
        await fetch(`/api/stock-assignments/${existingAssignment._id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            quantity: updatedQuantity,
            notes: stockFormData.notes || existingAssignment.notes,
          }),
        })

        // Get product name for notifications
        const product = products.find(p => p._id === stockFormData.productId)
        const productName = product?.name || 'Product'

        // Show success notification
        setUpdateNotification({
          message: 'Stock updated successfully!',
          visible: true,
          type: 'success'
        })

        // Auto-hide notification after 3 seconds
        setTimeout(() => {
          setUpdateNotification({ message: '', visible: false, type: 'success' })
        }, 3000)

        // Send notification to employee
        await fetch('/api/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: selectedEmployee._id,
            type: 'stock_assignment',
            message: `${productName} stock is added in your inventory. New quantity: ${updatedQuantity}`,
            read: false,
          }),
        })
      } else {
        // No existing assignment - create new one
        const assignmentData = {
          employee: selectedEmployee._id,
          product: stockFormData.productId,
          quantity: stockFormData.quantity,
          assignedBy: user.id,
          notes: stockFormData.notes,
          leastPrice: selectedProduct.leastPrice,
        }

        await stockAssignmentsAPI.create(assignmentData)

        // Get product name for notification
        const product = products.find(p => p._id === stockFormData.productId)
        const productName = product?.name || 'Product'

        // Send notification to employee
        await fetch('/api/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: selectedEmployee._id,
            type: 'stock_assignment',
            message: `${productName} has been assigned to your inventory. Quantity: ${stockFormData.quantity}`,
            read: false,
          }),
        })
      }

      // Reset form and close dialog
      setStockFormData({
        category: "cylinder" as "cylinder",
        productId: "",
        quantity: 1,
        notes: "",
      })
      setProductSearchTerm("")
      setSelectedProductName("")
      setShowProductSuggestions(false)
      setFilteredProducts([])
      setIsStockDialogOpen(false)
      setSelectedEmployee(null)

      // Refresh both employee data and stock assignments
      await fetchData()
      await fetchStockAssignments()
    } catch (error: any) {
      setUpdateNotification({
        message: error.response?.data?.error || "Failed to assign stock",
        visible: true,
        type: 'warning'
      })
      
      // Auto-hide error notification after 5 seconds
      setTimeout(() => {
        setUpdateNotification({ message: '', visible: false, type: 'success' })
      }, 5000)
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      address: "",
      status: "active",
      password: "",
    })
    setEditingEmployee(null)
  }

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee)
    setFormData({
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      address: employee.address,
      status: employee.status,
      password: employee.password || "",
    })
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this employee?")) {
      try {
        await employeesAPI.delete(id)
        await fetchData()
      } catch (error) {
        alert("Failed to delete employee")
      }
    }
  }

  const handleAssignStock = (employee: Employee) => {
    setSelectedEmployee(employee)
    setIsStockDialogOpen(true)
  }



  const filteredEmployees = employees.filter((employee) => {
    const matchesSearch =
      employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || employee.status === statusFilter
    return matchesSearch && matchesStatus
  })

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
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-2xl p-8 text-white">
        <div>
          <h1 className="text-4xl font-bold mb-2">Employee Management</h1>
          <p className="text-white/80 text-lg">Manage your team and assign stock efficiently</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-row flex-wrap gap-3 flex-1 items-center">
          <div className="relative flex-1 min-w-0 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 sm:w-48">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Add Employee
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingEmployee ? "Edit Employee" : "Add New Employee"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value: "active" | "inactive") => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Leave empty to keep current"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white">
                  {editingEmployee ? "Update Employee" : "Add Employee"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white rounded-t-lg">
          <CardTitle>Employee List</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="p-2 sm:p-4">Name</TableHead>
                  <TableHead className="p-2 sm:p-4">Email</TableHead>
                  <TableHead className="p-2 sm:p-4">Phone</TableHead>
                  <TableHead className="p-2 sm:p-4">Status</TableHead>
                  <TableHead className="p-2 sm:p-4">Product Assigned</TableHead>
                  <TableHead className="p-2 sm:p-4">Assigned Stock</TableHead>
                  <TableHead className="p-2 sm:p-4">Least Price (Assigned)</TableHead>
                  <TableHead className="p-2 sm:p-4">Remaining Stock</TableHead>
                  <TableHead className="p-2 sm:p-4">Received Back Stock</TableHead>
                  <TableHead className="p-2 sm:p-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.map((employee) => {
                  // Assigned Stock = Total cumulative stock ever assigned (all statuses except returned)
                  const assignedStock = stockAssignments
                    .filter((a) => a.employee?._id === employee._id && a.status !== "returned")
                    .reduce((sum, a) => sum + (a.quantity || 0), 0)
                  
                  // Remaining Stock = Current stock employee has after sales (using remainingQuantity)
                  const remainingStock = stockAssignments
                    .filter((a) => a.employee?._id === employee._id && a.status === "received")
                    .reduce((sum, a) => sum + (a.remainingQuantity || a.quantity || 0), 0)
                  
                  const receivedBackStock = stockAssignments
                    .filter((a) => a.employee?._id === employee._id && a.status === "returned")
                    .reduce((sum, a) => sum + (a.quantity || 0), 0)
                  
                  // Get unique products assigned to this employee
                  const employeeProducts = stockAssignments
                    .filter((a) => a.employee?._id === employee._id)
                    .map((a) => a.product?.name)
                    .filter((name, index, arr) => name && arr.indexOf(name) === index)
                  
                  const handleViewProducts = () => {
                    const employeeAssignments = stockAssignments.filter((a) => a.employee?._id === employee._id)
                    setSelectedEmployeeProducts(employeeAssignments)
                    setIsProductListDialogOpen(true)
                  }
                  
                  return (
                    <TableRow key={employee._id}>
                      <TableCell className="p-2 sm:p-4 font-medium text-xs sm:text-sm">{employee.name}</TableCell>
                      <TableCell className="p-2 sm:p-4 text-xs sm:text-sm">{employee.email}</TableCell>
                      <TableCell className="p-2 sm:p-4 text-xs sm:text-sm">{employee.phone || "Not provided"}</TableCell>
                      <TableCell className="p-2 sm:p-4">
                        <Badge
                          variant={(employee.status || "active") === "active" ? "default" : "secondary"}
                          className={
                            (employee.status || "active") === "active"
                              ? "bg-green-100 text-green-800 text-xs"
                              : "bg-gray-100 text-gray-800 text-xs"
                          }
                        >
                          {employee.status || "active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-2 sm:p-4 text-xs sm:text-sm">
                        {employeeProducts.length === 0 ? (
                          <span className="text-gray-500">No products assigned</span>
                        ) : employeeProducts.length === 1 ? (
                          <span className="font-medium">{employeeProducts[0]}</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleViewProducts}
                            className="text-[#2B3068] border-[#2B3068] hover:bg-[#2B3068] hover:text-white text-xs px-2 py-1"
                          >
                            See More ({employeeProducts.length})
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="p-2 sm:p-4 text-xs sm:text-sm">{assignedStock}</TableCell>
                      <TableCell className="p-2 sm:p-4 text-xs sm:text-sm">
                        {(() => {
                          const assignment = stockAssignments.find(
                            (a) => a.employee?._id === employee._id && a.status !== 'returned'
                          );
                          const leastPrice = assignment?.leastPrice ?? assignment?.product?.leastPrice;
                          return leastPrice ? `AED ${leastPrice}` : <span className="text-gray-400">N/A</span>;
                        })()}
                      </TableCell>
                      <TableCell className="p-2 sm:p-4 text-xs sm:text-sm">{remainingStock}</TableCell>
                      <TableCell className="p-2 sm:p-4 text-xs sm:text-sm">{receivedBackStock}</TableCell>
                      <TableCell className="p-2 sm:p-4">
                        <div className="flex space-x-1 sm:space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAssignStock(employee)}
                            className="text-[#2B3068] border-[#2B3068] hover:bg-[#2B3068] hover:text-white text-xs p-1 sm:p-2"
                          >
                            Stock
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(employee)}
                            className="text-xs p-1 sm:p-2"
                          >
                            <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(employee._id)}
                            className="text-red-600 border-red-600 hover:bg-red-600 hover:text-white text-xs p-1 sm:p-2"
                          >
                            <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filteredEmployees.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                      No employees found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Stock Assignment Dialog */}
      <Dialog open={isStockDialogOpen} onOpenChange={setIsStockDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Stock to {selectedEmployee?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleStockAssignment} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select
                value={stockFormData.category}
                onValueChange={(value: "gas" | "cylinder") => {
                  setStockFormData({ ...stockFormData, category: value, productId: "" })
                }}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gas">Gas</SelectItem>
                  <SelectItem value="cylinder">Cylinder</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 relative">
              <Label htmlFor="product">Product *</Label>
              <Input
                id="product"
                placeholder={stockFormData.category ? "Type to search products..." : "Select category first"}
                value={productSearchTerm}
                onChange={(e) => handleProductSearch(e.target.value)}
                onFocus={handleProductInputFocus}
                onBlur={handleProductInputBlur}
                required
                disabled={!stockFormData.category}
                className="w-full"
              />
              {showProductSuggestions && filteredProducts.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {filteredProducts.map((product) => (
                    <div
                      key={product._id}
                      className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      onClick={() => handleProductSelect(product)}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">
                          {product.category === 'cylinder'
                            ? `${product.name} - ${(product.cylinderSize || '').charAt(0).toUpperCase()}${(product.cylinderSize || '').slice(1)}`
                            : product.name}
                        </span>
                        <span className="text-sm text-gray-500">
                          Available: {product.currentStock} | Cost: AED {product.costPrice}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {showProductSuggestions && filteredProducts.length === 0 && productSearchTerm.trim().length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
                  <div className="px-4 py-3 text-sm text-gray-500 text-center">
                    No products found matching "{productSearchTerm}"
                  </div>
                </div>
              )}
            </div>

            {stockFormData.category === "cylinder" && stockFormData.productId && (
              <div className="space-y-2">
                <Label htmlFor="cylinderSize">Cylinder Size</Label>
                <Input
                  id="cylinderSize"
                  value={(() => {
                    const p = products.find((prod) => prod._id === stockFormData.productId)
                    const val = p?.cylinderSize || ""
                    return val ? val.charAt(0).toUpperCase() + val.slice(1) : ""
                  })()}
                  disabled
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={stockFormData.quantity}
                onChange={(e) => setStockFormData({ ...stockFormData, quantity: Number.parseInt(e.target.value) || 1 })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={stockFormData.notes}
                onChange={(e) => setStockFormData({ ...stockFormData, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setIsStockDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white">
                Assign Stock
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Product List Dialog */}
      <Dialog open={isProductListDialogOpen} onOpenChange={setIsProductListDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Products Assigned to Employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedEmployeeProducts.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No products assigned to this employee.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date Assigned</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedEmployeeProducts.map((assignment, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">
                          {assignment.product?.name || 'Unknown Product'}
                        </TableCell>
                        <TableCell>{assignment.quantity}</TableCell>
                        <TableCell>
                          <Badge
                            variant={assignment.status === 'assigned' ? 'default' : 
                                   assignment.status === 'received' ? 'secondary' : 'outline'}
                            className={
                              assignment.status === 'assigned' ? 'bg-blue-100 text-blue-800' :
                              assignment.status === 'received' ? 'bg-green-100 text-green-800' :
                              'bg-gray-100 text-gray-800'
                            }
                          >
                            {assignment.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {assignment.createdAt ? new Date(assignment.createdAt).toLocaleDateString() : 'N/A'}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {assignment.notes || 'No notes'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <Button 
              variant="outline" 
              onClick={() => setIsProductListDialogOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock Return Notification Popup */}
      {notification.visible && (
        <div className="fixed top-4 right-4 z-[9999] bg-green-500 text-white px-6 py-4 rounded-lg shadow-lg max-w-md">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">Stock Return Notification</span>
          </div>
          <p className="mt-1 text-sm">{notification.message}</p>
        </div>
      )}

      {/* Stock Update Notification Popup */}
      {updateNotification.visible && (
        <div className={`fixed top-4 right-4 z-[9999] px-6 py-4 rounded-lg shadow-lg max-w-md ${
          updateNotification.type === 'success' 
            ? 'bg-green-500 text-white' 
            : 'bg-orange-500 text-white'
        }`}>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">
              {updateNotification.type === 'success' ? 'Stock Update' : 'Assignment Notice'}
            </span>
          </div>
          <p className="mt-1 text-sm">{updateNotification.message}</p>
        </div>
      )}
    </div>
  )
}
