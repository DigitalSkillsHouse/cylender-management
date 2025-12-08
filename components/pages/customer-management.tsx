"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Edit, Trash2, Users, Loader2, AlertCircle, Search, Upload } from "lucide-react"
import { customersAPI } from "@/lib/api"
import { CustomerImportDialog } from "@/components/customer-import-dialog"

interface Customer {
  _id: string
  name: string
  serialNumber: string
  trNumber: string
  phone: string
  email: string
  address: string
}

export function CustomerManagement() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [error, setError] = useState<string>("")
  const [searchTerm, setSearchTerm] = useState("")
  
  // Autocomplete functionality state for search filter
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false)
  const [filteredSearchSuggestions, setFilteredSearchSuggestions] = useState<Customer[]>([])
  
  const [formData, setFormData] = useState({
    name: "",
    serialNumber: "",
    trNumber: "",
    phone: "",
    email: "",
    address: "",
  })

  useEffect(() => {
    fetchCustomers()
  }, [])

  // Initialize form with next serial number when dialog opens
  useEffect(() => {
    if (isDialogOpen && !editingCustomer) {
      setFormData({
        name: "",
        serialNumber: generateNextSerialNumber(),
        trNumber: "",
        phone: "",
        email: "",
        address: "",
      })
    }
  }, [isDialogOpen, editingCustomer, customers])

  // Generate next serial number
  const generateNextSerialNumber = () => {
    if (customers.length === 0) {
      return "CU-0001"
    }
    
    // Find the highest existing serial number
    const serialNumbers = customers
      .map(customer => customer.serialNumber)
      .filter(serial => serial && serial.startsWith("CU-"))
      .map(serial => {
        const num = parseInt(serial.replace("CU-", ""))
        return isNaN(num) ? 0 : num
      })
    
    const maxNumber = Math.max(0, ...serialNumbers)
    const nextNumber = maxNumber + 1
    return `CU-${nextNumber.toString().padStart(4, '0')}`
  }

  const fetchCustomers = async () => {
    try {
      setError("")
      const response = await customersAPI.getAll()
      
      // Handle nested data structure: response.data.data (same as other APIs)
      const customersData = Array.isArray(response?.data?.data) 
        ? response.data.data 
        : Array.isArray(response?.data) 
          ? response.data 
          : Array.isArray(response) 
            ? response 
            : []
      
      setCustomers(customersData)
    } catch (error: any) {
      setError("Failed to load customers. Please refresh the page.")
      setCustomers([])
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError("")

    try {
      // Validate form data - name and TR Number are required
      if (!formData.name) {
        throw new Error("Customer name is required")
      }
      if (!formData.trNumber) {
        throw new Error("TR Number is required")
      }

      if (editingCustomer) {
        await customersAPI.update(editingCustomer._id, formData)
      } else {
        await customersAPI.create(formData)
      }

      await fetchCustomers()
      resetForm()
      setIsDialogOpen(false)
    } catch (error: any) {
      setError(error.response?.data?.error || error.message || "Failed to save customer")
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      serialNumber: generateNextSerialNumber(),
      trNumber: "",
      phone: "",
      email: "",
      address: "",
    })
    setEditingCustomer(null)
    setError("")
  }

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer)
    setFormData({
      name: customer.name,
      serialNumber: customer.serialNumber || generateNextSerialNumber(),
      trNumber: customer.trNumber,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
    })
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this customer? This action cannot be undone.")) {
      try {
        await customersAPI.delete(id)
        await fetchCustomers()
      } catch (error: any) {
        alert(error.response?.data?.error || "Failed to delete customer")
      }
    }
  }

  // Customer search autocomplete functionality
  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    
    if (value.trim().length > 0) {
      const filtered = customers.filter(customer => 
        customer.name.toLowerCase().includes(value.toLowerCase()) ||
        customer.serialNumber?.toLowerCase().includes(value.toLowerCase()) ||
        customer.trNumber.toLowerCase().includes(value.toLowerCase()) ||
        customer.phone.includes(value) ||
        customer.email.toLowerCase().includes(value.toLowerCase())
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

  // Filter customers based on search term and sort alphabetically by name
  const filteredCustomers = customers
    .filter(customer => {
      if (!searchTerm.trim()) return true
      return customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
             customer.serialNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
             customer.trNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
             customer.phone.includes(searchTerm) ||
             customer.email.toLowerCase().includes(searchTerm.toLowerCase())
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-[#2B3068]" />
          <p className="text-gray-600">Loading customers...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-6 lg:pt-0 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8 text-white">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">Customer Management</h1>
        <p className="text-white/80 text-sm sm:text-base lg:text-lg">Manage your customer database</p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm sm:text-base">{error}</p>
        </div>
      )}

      {/* Add Customer Button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 sm:w-8 sm:h-8 text-[#2B3068]" />
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#2B3068]">Customers</h2>
            <p className="text-gray-600 text-sm sm:text-base">Manage customer information</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Button
            onClick={() => setIsImportDialogOpen(true)}
            variant="outline"
            className="w-full sm:w-auto border-[#2B3068] text-[#2B3068] hover:bg-[#2B3068] hover:text-white"
          >
            <Upload className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
            Import Names
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={resetForm}
                className="w-full sm:w-auto bg-[#2B3068] hover:bg-[#1a1f4a] text-white px-4 sm:px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 min-h-[44px]"
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                Add Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto mx-auto">
              <DialogHeader>
                <DialogTitle className="text-xl sm:text-2xl font-bold text-[#2B3068]">
                  {editingCustomer ? "Edit Customer" : "Add New Customer"}
                </DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium text-gray-700">
                      Customer Name *
                    </Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="Enter customer name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      className="h-11 sm:h-12 border-gray-300 focus:border-[#2B3068] focus:ring-[#2B3068] text-sm sm:text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="serialNumber" className="text-sm font-medium text-gray-700">
                      Serial Number *
                    </Label>
                    <Input
                      id="serialNumber"
                      type="text"
                      placeholder="Enter serial number"
                      value={formData.serialNumber}
                      onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                      required
                      className="h-11 sm:h-12 border-gray-300 focus:border-[#2B3068] focus:ring-[#2B3068] text-sm sm:text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trNumber" className="text-sm font-medium text-gray-700">
                      TR Number *
                    </Label>
                    <Input
                      id="trNumber"
                      type="text"
                      placeholder="Enter TR number"
                      value={formData.trNumber}
                      onChange={(e) => setFormData({ ...formData, trNumber: e.target.value })}
                      className="h-11 sm:h-12 border-gray-300 focus:border-[#2B3068] focus:ring-[#2B3068] text-sm sm:text-base"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium text-gray-700">
                      Phone Number
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="Enter phone number (optional)"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="h-11 sm:h-12 border-gray-300 focus:border-[#2B3068] focus:ring-[#2B3068] text-sm sm:text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter email address (optional)"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="h-11 sm:h-12 border-gray-300 focus:border-[#2B3068] focus:ring-[#2B3068] text-sm sm:text-base"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address" className="text-sm font-medium text-gray-700">
                    Address
                  </Label>
                  <Input
                    id="address"
                    type="text"
                    placeholder="Enter full address (optional)"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="h-11 sm:h-12 border-gray-300 focus:border-[#2B3068] focus:ring-[#2B3068] text-sm sm:text-base"
                  />
                </div>
                <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    className="w-full sm:w-auto px-4 sm:px-6 py-3 border-gray-300 text-gray-700 hover:bg-gray-50 min-h-[44px]"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full sm:w-auto bg-[#2B3068] hover:bg-[#1a1f4a] text-white px-4 sm:px-6 py-3 disabled:opacity-50 min-h-[44px]"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 mr-2 animate-spin" />
                        {editingCustomer ? "Updating..." : "Adding..."}
                      </>
                    ) : (
                      <>{editingCustomer ? "Update Customer" : "Add Customer"}</>
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search Filter */}
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg border border-gray-200 p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <Search className="w-5 h-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-800">Search Customers</h3>
        </div>
        <div className="relative">
          <Input
            type="text"
            placeholder="Search by name, serial number, TR number, phone, or email..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={handleSearchInputFocus}
            onBlur={handleSearchInputBlur}
            className="w-full h-11 sm:h-12 px-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2B3068] focus:border-transparent"
          />
          
          {/* Search Suggestions Dropdown */}
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
                      <p className="text-sm text-gray-600">Serial: {customer.serialNumber || 'N/A'} • TR: {customer.trNumber}</p>
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
      </div>

      {/* Customers List */}
      <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold">
            Customers List ({Array.isArray(filteredCustomers) ? filteredCustomers.length : 0}
            {searchTerm && ` of ${Array.isArray(customers) ? customers.length : 0}`})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Table View (all screens) with horizontal scroll on small viewports */}
          <div className="w-full overflow-x-auto">
            <div className="inline-block min-w-[900px] align-top">
              <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 border-b-2 border-gray-200">
                  <TableHead className="font-bold text-gray-700 p-4">Name</TableHead>
                  <TableHead className="font-bold text-gray-700 p-4">Serial Number</TableHead>
                  <TableHead className="font-bold text-gray-700 p-4">TR Number</TableHead>
                  <TableHead className="font-bold text-gray-700 p-4">Phone</TableHead>
                  <TableHead className="font-bold text-gray-700 p-4">Email</TableHead>
                  <TableHead className="font-bold text-gray-700 p-4">Address</TableHead>
                  <TableHead className="font-bold text-gray-700 p-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.isArray(filteredCustomers) && filteredCustomers.map((customer) => (
                  <TableRow key={customer._id} className="hover:bg-gray-50 transition-colors border-b border-gray-100">
                    <TableCell className="font-semibold text-[#2B3068] p-4">{customer.name}</TableCell>
                    <TableCell className="p-4 font-medium text-blue-600">{customer.serialNumber || 'N/A'}</TableCell>
                    <TableCell className="p-4">{customer.trNumber}</TableCell>
                    <TableCell className="p-4">{customer.phone}</TableCell>
                    <TableCell className="p-4">{customer.email}</TableCell>
                    <TableCell className="p-4">{customer.address}</TableCell>
                    <TableCell className="p-4">
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(customer)}
                          className="border-[#2B3068] text-[#2B3068] hover:bg-[#2B3068] hover:text-white transition-colors min-h-[36px]"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(customer._id)}
                          className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors min-h-[36px]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(!Array.isArray(filteredCustomers) || filteredCustomers.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <div className="text-gray-500">
                        <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">
                          {searchTerm ? "No customers match your search" : "No customers found"}
                        </p>
                        <p className="text-sm">
                          {searchTerm ? "Try adjusting your search terms" : "Add your first customer to get started"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </div>
          </CardContent>
      </Card>

      {/* Customer Import Dialog */}
      <CustomerImportDialog
        isOpen={isImportDialogOpen}
        onClose={() => setIsImportDialogOpen(false)}
        onImportComplete={() => {
          fetchCustomers()
          setIsImportDialogOpen(false)
        }}
      />
    </div>
  )
}
