"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, FileText, Receipt, Edit, Trash } from "lucide-react"
import { SignatureDialog } from "@/components/signature-dialog"
import { ReceiptDialog } from "@/components/receipt-dialog"

interface Customer {
  _id: string
  name: string
  companyName?: string
}

interface Product {
  _id: string
  name: string
  category: string
}

interface RentalItem {
  productId: string
  productName: string
  quantity: number
  days: number
  amountPerDay: number
  subtotal: number
  vat: number
  total: number
}

interface RentalData {
  date: string
  customerId: string
  customerName: string
  items: RentalItem[]
  subtotal: number
  totalVat: number
  finalTotal: number
}

export function RentalCollection() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [rentals, setRentals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  
  // Signature and receipt states
  const [showSignatureDialog, setShowSignatureDialog] = useState(false)
  const [pendingRental, setPendingRental] = useState<any>(null)
  const [customerSignature, setCustomerSignature] = useState<string>("")
  const [receiptRental, setReceiptRental] = useState<any>(null)
  
  // Form state
  const [rentalData, setRentalData] = useState<RentalData>({
    date: new Date().toISOString().split("T")[0],
    customerId: "",
    customerName: "",
    items: [],
    subtotal: 0,
    totalVat: 0,
    finalTotal: 0
  })
  
  // Current item being added
  const [currentItem, setCurrentItem] = useState({
    productId: "",
    productName: "",
    quantity: "",
    days: "",
    amount: "10" // Default amount is 10
  })
  
  // Search states
  const [customerSearchTerm, setCustomerSearchTerm] = useState("")
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false)
  const [productSearchTerm, setProductSearchTerm] = useState("")
  const [showProductSuggestions, setShowProductSuggestions] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      
      // Fetch customers with error handling
      let customersData: Customer[] = []
      try {
        const customersRes = await fetch('/api/customers', { cache: 'no-store' })
        if (customersRes.ok) {
          const customersResponse = await customersRes.json()
          customersData = Array.isArray(customersResponse.data?.data) 
            ? customersResponse.data.data 
            : Array.isArray(customersResponse.data) 
              ? customersResponse.data 
              : Array.isArray(customersResponse) 
                ? customersResponse 
                : []
          setCustomers(customersData)
          console.log('Customers fetched:', customersData.length)
        }
      } catch (error) {
        console.error("Failed to fetch customers:", error)
        setCustomers([])
      }
      
      // Fetch products with error handling
      let productsData: Product[] = []
      try {
        const productsRes = await fetch('/api/products', { cache: 'no-store' })
        if (productsRes.ok) {
          const productsResponse = await productsRes.json()
          // Normalize products from Products API (same as cylinder management)
          const rawProducts = Array.isArray(productsResponse.data?.data)
            ? productsResponse.data.data
            : Array.isArray(productsResponse.data)
              ? productsResponse.data
              : Array.isArray(productsResponse)
                ? productsResponse
                : []

          const allProductsData: Product[] = (rawProducts as any[]).map((p: any) => ({
            _id: p._id,
            name: p.name,
            category: p.category,
          }))

          // Filter only cylinder products
          const cylinderProducts = allProductsData.filter((product: Product) => 
            product.category === 'cylinder'
          )
          
          setProducts(cylinderProducts)
          console.log('Cylinder products fetched:', cylinderProducts.length)
        }
      } catch (error) {
        console.error("Failed to fetch products:", error)
        setProducts([])
      }
      
      // Fetch rentals with error handling
      try {
        const rentalsRes = await fetch('/api/rentals', { cache: 'no-store' })
        if (rentalsRes.ok) {
          const rentalsData = await rentalsRes.json()
          setRentals(rentalsData.data || [])
          console.log('Rentals fetched:', (rentalsData.data || []).length)
        }
      } catch (error) {
        console.error("Failed to fetch rentals:", error)
        setRentals([])
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateItemTotal = (quantity: number, days: number, amount: number) => {
    const subtotal = quantity * days * amount
    const vat = subtotal * 0.05
    const total = subtotal + vat
    return { subtotal, vat, total }
  }

  const addItem = () => {
    if (!currentItem.productId || !currentItem.quantity || !currentItem.days) {
      alert("Please fill all item fields")
      return
    }

    const quantity = parseInt(currentItem.quantity)
    const days = parseInt(currentItem.days)
    const amount = parseFloat(currentItem.amount)
    
    const { subtotal, vat, total } = calculateItemTotal(quantity, days, amount)
    
    const newItem: RentalItem = {
      productId: currentItem.productId,
      productName: currentItem.productName,
      quantity,
      days,
      amountPerDay: amount,
      subtotal,
      vat,
      total
    }

    const updatedItems = [...rentalData.items, newItem]
    const newSubtotal = updatedItems.reduce((sum, item) => sum + item.subtotal, 0)
    const newTotalVat = updatedItems.reduce((sum, item) => sum + item.vat, 0)
    const newFinalTotal = newSubtotal + newTotalVat

    setRentalData({
      ...rentalData,
      items: updatedItems,
      subtotal: newSubtotal,
      totalVat: newTotalVat,
      finalTotal: newFinalTotal
    })

    // Reset current item
    setCurrentItem({
      productId: "",
      productName: "",
      quantity: "",
      days: "",
      amount: "10"
    })
    setProductSearchTerm("")
  }

  const removeItem = (index: number) => {
    const updatedItems = rentalData.items.filter((_, i) => i !== index)
    const newSubtotal = updatedItems.reduce((sum, item) => sum + item.subtotal, 0)
    const newTotalVat = updatedItems.reduce((sum, item) => sum + item.vat, 0)
    const newFinalTotal = newSubtotal + newTotalVat

    setRentalData({
      ...rentalData,
      items: updatedItems,
      subtotal: newSubtotal,
      totalVat: newTotalVat,
      finalTotal: newFinalTotal
    })
  }

  const handleSubmit = async () => {
    if (!rentalData.customerId || rentalData.items.length === 0) {
      alert("Please select customer and add at least one item")
      return
    }

    // Show signature dialog first
    setShowSignatureDialog(true)
  }

  const handleSignatureComplete = async (signature: string) => {
    console.log('RentalCollection - Signature received:', signature)
    setCustomerSignature(signature)
    setShowSignatureDialog(false)

    // Check if this is for a new rental or existing rental receipt
    if (pendingRental) {
      // This is for an existing rental receipt
      showReceiptForRental(pendingRental)
      setPendingRental(null)
      return
    }

    // This is for a new rental - save the rental
    setSubmitting(true)
    try {
      // Prepare data for API
      const rentalPayload = {
        date: rentalData.date,
        customerId: rentalData.customerId,
        customerName: rentalData.customerName,
        items: rentalData.items.map(item => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          days: item.days,
          amountPerDay: item.amountPerDay
        }))
      }

      console.log('Sending rental payload:', rentalPayload)

      const response = await fetch('/api/rentals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(rentalPayload)
      })

      const result = await response.json()
      console.log('Rental API response:', result)

      if (result.success) {
        // Convert rental data to receipt format
        const receiptData = {
          _id: result.data._id,
          invoiceNumber: result.data.rentalNumber,
          customer: {
            name: result.data.customerName,
            phone: '',
            address: '',
          },
          items: result.data.items.map((item: any) => ({
            product: {
              name: item.productName,
              price: item.amountPerDay
            },
            quantity: item.quantity,
            days: item.days, // Add days information for receipt
            price: item.amountPerDay,
            total: item.total
          })),
          totalAmount: result.data.finalTotal,
          paymentMethod: 'rental',
          paymentStatus: 'active',
          type: 'rental',
          createdAt: result.data.createdAt || new Date().toISOString(),
          customerSignature: signature
        }

        // Show receipt with signature
        setReceiptRental(receiptData)
        
        // Refresh data to show new rental
        await fetchData()
        
        // Reset form
        setRentalData({
          date: new Date().toISOString().split("T")[0],
          customerId: "",
          customerName: "",
          items: [],
          subtotal: 0,
          totalVat: 0,
          finalTotal: 0
        })
        setCustomerSearchTerm("")
        setIsDialogOpen(false)
      } else {
        alert(`Failed to generate rental: ${result.error}`)
      }
    } catch (error) {
      console.error('Error generating rental:', error)
      alert('Failed to generate rental')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSignatureCancel = () => {
    setShowSignatureDialog(false)
    setCustomerSignature("")
    setPendingRental(null)
  }

  // Handle receipt button click for existing rentals - show signature dialog first
  const handleReceiptClick = (rental: any) => {
    if (!customerSignature) {
      // No signature yet - show signature dialog first
      setPendingRental(rental)
      setShowSignatureDialog(true)
    } else {
      // Signature already exists - show receipt directly with existing signature
      showReceiptForRental(rental)
    }
  }

  // Show receipt for rental with signature
  const showReceiptForRental = (rental: any) => {
    const receiptData = {
      _id: rental._id,
      invoiceNumber: rental.rentalNumber,
      customer: {
        name: rental.customerName,
        phone: '',
        address: '',
      },
      items: rental.items.map((item: any) => ({
        product: {
          name: item.productName,
          price: item.amountPerDay
        },
        quantity: item.quantity,
        days: item.days, // Add days information for receipt
        price: item.amountPerDay,
        total: item.total
      })),
      totalAmount: rental.finalTotal,
      paymentMethod: 'rental',
      paymentStatus: rental.status,
      type: 'rental',
      createdAt: rental.createdAt,
      customerSignature: customerSignature // Use existing signature if available
    }

    setReceiptRental(receiptData)
  }

  // Handle edit rental
  const handleEditRental = (rental: any) => {
    // TODO: Implement edit functionality
    alert(`Edit functionality for rental ${rental.rentalNumber} - Coming soon!`)
  }

  // Handle delete rental
  const handleDeleteRental = async (rental: any) => {
    if (confirm(`Are you sure you want to delete rental ${rental.rentalNumber}?`)) {
      try {
        const response = await fetch(`/api/rentals?id=${rental._id}`, {
          method: 'DELETE'
        })
        
        const result = await response.json()
        
        if (result.success) {
          alert('Rental deleted successfully!')
          await fetchData() // Refresh the rental list
        } else {
          alert(`Failed to delete rental: ${result.error}`)
        }
      } catch (error) {
        console.error('Error deleting rental:', error)
        alert('Failed to delete rental')
      }
    }
  }

  const filteredCustomers = customers.filter(customer =>
    customerSearchTerm.trim().length === 0 ? true :
    (customer.name || customer.companyName || '').toLowerCase().includes(customerSearchTerm.toLowerCase())
  )

  const filteredProducts = products.filter(product =>
    productSearchTerm.trim().length === 0 ? true :
    product.name.toLowerCase().includes(productSearchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Rental Collection</span>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <FileText className="w-4 h-4 mr-2" />
                  Generate Rental
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Generate Rental</DialogTitle>
                </DialogHeader>
                
                {/* Debug info */}
                <div className="text-xs text-gray-500 bg-gray-100 p-2 rounded">
                  Debug: {customers.length} customers, {products.length} cylinder products loaded
                </div>
                
                <div className="space-y-6">
                  {/* Date and Customer */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={rentalData.date}
                        onChange={(e) => setRentalData({ ...rentalData, date: e.target.value })}
                      />
                    </div>
                    
                    <div className="space-y-2 relative">
                      <Label>Customer Name</Label>
                      <Input
                        value={customerSearchTerm}
                        onChange={(e) => {
                          const value = e.target.value
                          setCustomerSearchTerm(value)
                          setShowCustomerSuggestions(value.trim().length > 0)
                        }}
                        onFocus={() => setShowCustomerSuggestions(customerSearchTerm.trim().length > 0)}
                        onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 150)}
                        placeholder="Type to search customers"
                      />
                      {showCustomerSuggestions && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-auto">
                          {filteredCustomers.slice(0, 8).map((customer) => (
                            <button
                              type="button"
                              key={customer._id}
                              onClick={() => {
                                setRentalData({
                                  ...rentalData,
                                  customerId: customer._id,
                                  customerName: customer.name || customer.companyName || ''
                                })
                                setCustomerSearchTerm(customer.name || customer.companyName || '')
                                setShowCustomerSuggestions(false)
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                            >
                              <div className="font-medium text-gray-800">
                                {customer.name || customer.companyName}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Add Item Section */}
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <h3 className="font-medium mb-4">Add Rental Item</h3>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="space-y-2 relative">
                        <Label>Item (Cylinder)</Label>
                        <Input
                          value={productSearchTerm}
                          onChange={(e) => {
                            const value = e.target.value
                            setProductSearchTerm(value)
                            setShowProductSuggestions(value.trim().length > 0)
                          }}
                          onFocus={() => setShowProductSuggestions(productSearchTerm.trim().length > 0)}
                          onBlur={() => setTimeout(() => setShowProductSuggestions(false), 150)}
                          placeholder="Type to search cylinders"
                        />
                        {showProductSuggestions && (
                          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-auto">
                            {filteredProducts.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-gray-500">
                                {products.length === 0 ? 'No cylinder products available' : 'No cylinders match your search'}
                              </div>
                            ) : (
                              filteredProducts.slice(0, 8).map((product) => (
                                <button
                                  type="button"
                                  key={product._id}
                                  onClick={() => {
                                    setCurrentItem({
                                      ...currentItem,
                                      productId: product._id,
                                      productName: product.name
                                    })
                                    setProductSearchTerm(product.name)
                                    setShowProductSuggestions(false)
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                                >
                                  <div className="font-medium text-gray-800">
                                    {product.name}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    Category: {product.category}
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Quantity</Label>
                        <Input
                          type="number"
                          value={currentItem.quantity}
                          onChange={(e) => setCurrentItem({ ...currentItem, quantity: e.target.value })}
                          placeholder="Enter quantity"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="space-y-2">
                        <Label>Days</Label>
                        <Input
                          type="number"
                          value={currentItem.days}
                          onChange={(e) => setCurrentItem({ ...currentItem, days: e.target.value })}
                          placeholder="Enter days"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Amount (per day)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={currentItem.amount}
                          onChange={(e) => setCurrentItem({ ...currentItem, amount: e.target.value })}
                          placeholder="10.00"
                        />
                      </div>
                      
                      <div className="flex items-end">
                        <Button onClick={addItem} className="w-full text-sm">
                          <Plus className="w-4 h-4 mr-2" />
                          Add Item
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Items Table */}
                  {rentalData.items.length > 0 && (
                    <div>
                      <h3 className="font-medium mb-2">Rental Items</h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>Days</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>VAT 5%</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rentalData.items.map((item, index) => (
                            <TableRow key={index}>
                              <TableCell>{item.productName}</TableCell>
                              <TableCell>{item.quantity}</TableCell>
                              <TableCell>{item.days}</TableCell>
                              <TableCell>AED {item.subtotal.toFixed(2)}</TableCell>
                              <TableCell className="text-green-600">AED {item.vat.toFixed(2)}</TableCell>
                              <TableCell className="font-bold text-blue-600">AED {item.total.toFixed(2)}</TableCell>
                              <TableCell>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => removeItem(index)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      
                      {/* Totals */}
                      <div className="mt-4 space-y-2 text-right">
                        <div>Subtotal: AED {rentalData.subtotal.toFixed(2)}</div>
                        <div className="text-green-600">VAT 5%: AED {rentalData.totalVat.toFixed(2)}</div>
                        <div className="text-xl font-bold text-blue-600">Final Total: AED {rentalData.finalTotal.toFixed(2)}</div>
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <div className="flex flex-col sm:flex-row justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto">
                      Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={submitting} className="w-full sm:w-auto">
                      {submitting ? "Generating..." : "Generate Rental"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rentals.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No rentals yet</h3>
              <p className="text-gray-500 mb-4">Click "Generate Rental" to create your first rental record.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sm:text-sm">Rental #</TableHead>
                    <TableHead className="text-xs sm:text-sm">Date</TableHead>
                    <TableHead className="text-xs sm:text-sm">Customer</TableHead>
                    <TableHead className="text-xs sm:text-sm">Items</TableHead>
                    <TableHead className="text-xs sm:text-sm">Subtotal</TableHead>
                    <TableHead className="text-xs sm:text-sm">VAT 5%</TableHead>
                    <TableHead className="text-xs sm:text-sm">Total</TableHead>
                    <TableHead className="text-xs sm:text-sm">Status</TableHead>
                    <TableHead className="text-xs sm:text-sm min-w-[200px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rentals.map((rental) => (
                    <TableRow key={rental._id}>
                      <TableCell className="font-medium text-xs sm:text-sm">{rental.rentalNumber}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{new Date(rental.date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{rental.customerName}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{rental.items.length} item(s)</TableCell>
                      <TableCell className="text-xs sm:text-sm">AED {rental.subtotal.toFixed(2)}</TableCell>
                      <TableCell className="text-green-600 text-xs sm:text-sm">AED {rental.totalVat.toFixed(2)}</TableCell>
                      <TableCell className="font-bold text-blue-600 text-xs sm:text-sm">AED {rental.finalTotal.toFixed(2)}</TableCell>
                      <TableCell className="text-xs sm:text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          rental.status === 'active' ? 'bg-green-100 text-green-800' :
                          rental.status === 'returned' ? 'bg-gray-100 text-gray-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {rental.status.charAt(0).toUpperCase() + rental.status.slice(1)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col sm:flex-row gap-1 sm:gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReceiptClick(rental)}
                            className="w-full sm:w-auto text-xs sm:text-sm"
                          >
                            <Receipt className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                            Receipt
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditRental(rental)}
                            className="w-full sm:w-auto text-xs sm:text-sm"
                          >
                            <Edit className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteRental(rental)}
                            className="text-red-600 hover:text-red-700 w-full sm:w-auto text-xs sm:text-sm"
                          >
                            <Trash className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Signature Dialog */}
      <SignatureDialog 
        isOpen={showSignatureDialog}
        onClose={handleSignatureCancel}
        onSignatureComplete={handleSignatureComplete}
        customerName={pendingRental ? pendingRental.customerName : rentalData.customerName}
      />

      {/* Receipt Dialog with signature */}
      {receiptRental && (
        <ReceiptDialog 
          sale={receiptRental} 
          signature={customerSignature}
          onClose={() => {
            setReceiptRental(null)
            // Don't clear signature - keep it for reuse
          }}
          open={!!receiptRental}
          disableVAT={false} // Enable VAT calculation for rentals
        />
      )}
    </div>
  )
}
