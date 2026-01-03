"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Edit, Trash2, Loader2, FileDown } from "lucide-react"
import { productsAPI } from "@/lib/api"
import ProductQuoteDialog from "@/components/product-quote-dialog"

interface Product {
  _id: string
  name: string
  productCode: string
  category: "gas" | "cylinder"
  costPrice: number
  leastPrice: number
}

export const ProductManagement = () => {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [showQuoteDialog, setShowQuoteDialog] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    productCode: "",
    category: "gas" as "gas" | "cylinder",
    costPrice: "",
    leastPrice: "",
  })

  useEffect(() => {
    fetchProducts()
    
    // Listen for stock updates from other pages (inventory, employee management, etc.)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'stockUpdated' && e.newValue) {
        console.log('Stock update detected from another page, refreshing products...')
        fetchProducts()
        // Clear the storage item after handling
        localStorage.removeItem('stockUpdated')
      }
    }
    
    // Listen for custom events from same page
    const handleStockUpdate = () => {
      console.log('Stock update event detected, refreshing products...')
      fetchProducts()
    }
    
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('stockUpdated', handleStockUpdate)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('stockUpdated', handleStockUpdate)
    }
  }, [])

  const fetchProducts = async () => {
    try {
      const response = await productsAPI.getAll()
      setProducts(response.data)
    } catch (error) {
      console.error("Failed to fetch products:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      // Validate required fields
      if (!formData.name.trim()) {
        alert("Product name is required")
        return
      }
      
      if (!formData.leastPrice.trim()) {
        alert("Least price is required")
        return
      }
      
      // Parse and validate prices
      const costPrice = formData.costPrice.trim() ? Number.parseFloat(formData.costPrice) : 0
      const leastPrice = Number.parseFloat(formData.leastPrice)
      
      if (isNaN(leastPrice) || leastPrice < 0) {
        alert("Please enter a valid least price")
        return
      }
      
      if (formData.costPrice.trim() && (isNaN(costPrice) || costPrice < 0)) {
        alert("Please enter a valid cost price")
        return
      }

      // Validate product code
      if (!formData.productCode.trim()) {
        alert("Product code is required. Click 'Auto-Generate' to create one.")
        return
      }

      const productData = {
        name: formData.name,
        productCode: formData.productCode,
        category: formData.category,
        costPrice: costPrice,
        leastPrice: leastPrice,
        // Only set currentStock to 0 for new products, not when updating existing ones
        ...(editingProduct ? {} : { currentStock: 0 }),
      }

      console.log("Sending product data:", productData)

      if (editingProduct) {
        await productsAPI.update(editingProduct._id, productData)
      } else {
        await productsAPI.create(productData)
      }

      await fetchProducts()
      resetForm()
      setIsDialogOpen(false)
    } catch (error: any) {
      console.error("Product save error:", error)
      const errorMessage = error.response?.data?.error || "Failed to save product"
      const errorDetails = error.response?.data?.details
      const duplicateMessage = error.response?.data?.message
      const existingProduct = error.response?.data?.existingProduct
      
      // Handle duplicate product error specifically
      if (error.response?.status === 409 && existingProduct) {
        alert(`❌ Duplicate Product Detected!\n\n${duplicateMessage}\n\nExisting Product:\n- Name: ${existingProduct.name}\n- Code: ${existingProduct.productCode}\n- Category: ${existingProduct.category}${existingProduct.cylinderStatus ? `\n- Status: ${existingProduct.cylinderStatus}` : ''}\n\nPlease use the existing product or choose a different name.`)
      } else if (errorDetails) {
        if (Array.isArray(errorDetails)) {
          alert(`${errorMessage}:\n${errorDetails.join('\n')}`)
        } else {
          alert(`${errorMessage}: ${errorDetails}`)
        }
      } else {
        alert(errorMessage)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const generateProductCode = () => {
    if (!formData.name.trim()) {
      alert("Please enter a product name first")
      return
    }

    // Generate prefix from product name
    const prefix = formData.name.trim().split(/\s+/).map((word, index) => {
      const upperWord = word.toUpperCase()
      if (index === 0) {
        // First word: apply special abbreviations
        if (upperWord.startsWith('CYL')) return 'CY'
        if (upperWord.startsWith('GAS')) return 'GA'
        if (upperWord.startsWith('OXY')) return 'OX'
      }
      // All other words (or first word without special pattern): just first letter
      return word.charAt(0).toUpperCase()
    }).join('')

    // Find ALL existing product numbers across all prefixes to determine next number
    const existingNumbers = products
      .map(p => p.productCode)
      .filter(code => code.includes('-'))
      .map(code => {
        const parts = code.split('-')
        if (parts.length === 2) {
          const num = parseInt(parts[1])
          return isNaN(num) ? 0 : num
        }
        return 0
      })
      .filter(num => num > 0) // Only valid numbers

    // Find the next available number across all products
    const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1
    const paddedNumber = nextNumber.toString().padStart(3, '0')
    
    const newProductCode = `${prefix}-${paddedNumber}`
    setFormData({ ...formData, productCode: newProductCode })
  }

  const resetForm = () => {
    setFormData({
      name: "",
      productCode: "",
      category: "gas",
      costPrice: "",
      leastPrice: "",
    })
    setEditingProduct(null)
  }

  const handleEdit = (product: Product) => {
    setEditingProduct(product)
    setFormData({
      name: product.name,
      productCode: product.productCode,
      category: product.category,
      costPrice: product.costPrice.toString(),
      leastPrice: product.leastPrice.toString(),
    })
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    setDeleting(true)
    try {
      await productsAPI.delete(id)
      await fetchProducts()
      setProductToDelete(null)
      setDeleteDialogOpen(false)
    } catch (error: any) {
      alert(error.response?.data?.error || "Failed to delete product")
    } finally {
      setDeleting(false)
    }
  }

  const openDeleteDialog = (product: Product) => {
    setProductToDelete(product)
    setDeleteDialogOpen(true)
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

  const norm = (v?: string) => (v || "").toLowerCase()
  const filteredProducts = products.filter((p) => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return true
    return (
      norm(p.name).includes(q) ||
      norm(p.category).includes(q)
    )
  })

  return (
    <div className="pt-6 lg:pt-0 space-y-4 sm:space-y-6 lg:space-y-8">
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8 text-white">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">Product Management</h1>
            <p className="text-white/80 text-sm sm:text-base lg:text-lg">Manage your product inventory</p>
          </div>

          <div className="w-full sm:w-auto flex-shrink-0">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    onClick={resetForm}
                    className="w-full sm:w-auto bg-white text-[#2B3068] hover:bg-white/90 font-semibold px-4 sm:px-6 lg:px-8 py-3 sm:py-4 text-sm sm:text-base lg:text-lg rounded-xl shadow-lg transition-all duration-300 hover:scale-105 min-h-[44px]"
                  >
                    <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    Add Product
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[95vw] max-w-[500px] max-h-[90vh] overflow-y-auto mx-auto">
                <DialogHeader>
                  <DialogTitle className="text-lg sm:text-xl font-bold text-[#2B3068]">
                    {editingProduct ? "Edit Product" : "Add New Product"}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium">Product Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => {
                        setFormData({ ...formData, name: e.target.value })
                        // Auto-generate product code for new products when name changes
                        if (!editingProduct && e.target.value.trim()) {
                          setTimeout(() => {
                            // Use setTimeout to ensure the state is updated first
                            const prefix = e.target.value.trim().split(/\s+/).map((word, index) => {
                              const upperWord = word.toUpperCase()
                              if (index === 0) {
                                if (upperWord.startsWith('CYL')) return 'CY'
                                if (upperWord.startsWith('GAS')) return 'GA'
                                if (upperWord.startsWith('OXY')) return 'OX'
                              }
                              return word.charAt(0).toUpperCase()
                            }).join('')

                            const existingNumbers = products
                              .map(p => p.productCode)
                              .filter(code => code.includes('-'))
                              .map(code => {
                                const parts = code.split('-')
                                if (parts.length === 2) {
                                  const num = parseInt(parts[1])
                                  return isNaN(num) ? 0 : num
                                }
                                return 0
                              })
                              .filter(num => num > 0) // Only valid numbers

                            const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1
                            const paddedNumber = nextNumber.toString().padStart(3, '0')
                            const newProductCode = `${prefix}-${paddedNumber}`
                            
                            setFormData(prev => ({ ...prev, productCode: newProductCode }))
                          }, 100)
                        }
                      }}
                      required
                      className="h-11 sm:h-12 text-sm sm:text-base"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="productCode" className="text-sm font-medium">Product Code</Label>
                    <Input
                      id="productCode"
                      value={formData.productCode}
                      onChange={(e) => setFormData({ ...formData, productCode: e.target.value })}
                      placeholder="Auto-generated or enter custom code"
                      className="h-11 sm:h-12 text-sm sm:text-base font-mono"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500">Editable product code</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => generateProductCode()}
                        className="text-xs h-7"
                      >
                        Auto-Generate
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category" className="text-sm font-medium">Category</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value: "gas" | "cylinder") => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger className="h-11 sm:h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gas">Gas</SelectItem>
                        <SelectItem value="cylinder">Cylinder</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Removed Cylinder Status selection from Product form as it's handled in Purchase Management */}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="costPrice" className="text-sm font-medium">Cost Price (AED) <span className="text-gray-500 font-normal">(Optional)</span></Label>
                      <Input
                        id="costPrice"
                        type="number"
                        step="0.01"
                        value={formData.costPrice}
                        onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
                        placeholder="0.00"
                        className="h-11 sm:h-12 text-sm sm:text-base"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="leastPrice" className="text-sm font-medium">Least Price (AED)</Label>
                      <Input
                        id="leastPrice"
                        type="number"
                        step="0.01"
                        value={formData.leastPrice}
                        onChange={(e) => setFormData({ ...formData, leastPrice: e.target.value })}
                        required
                        className="h-11 sm:h-12 text-sm sm:text-base"
                      />
                    </div>
                  </div>



                  <div className="flex flex-col sm:flex-row gap-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                      className="w-full sm:flex-1 min-h-[44px]"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="w-full sm:flex-1 min-h-[44px]"
                      style={{ backgroundColor: "#2B3068" }}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {editingProduct ? "Updating..." : "Creating..."}
                        </>
                      ) : (
                        <>{editingProduct ? "Update Product" : "Save Product"}</>
                      )}
                    </Button>
                  </div>
                </form>
                </DialogContent>
              </Dialog>
          </div>
        </div>
      </div>

      <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
            <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold flex-1">Product List ({filteredProducts.length}/{products.length})</CardTitle>
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <div className="bg-white rounded-xl p-2 flex items-center gap-2 w-full lg:w-80">
                <Input
                  placeholder="Search product name, category, type..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 text-gray-800"
                />
              </div>
              <Button onClick={() => setShowQuoteDialog(true)} className="bg-white text-[#2B3068] hover:bg-white/90 font-semibold min-h-[44px]">
                <FileDown className="w-4 h-4 mr-2" />
                Generate Quote Paper
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 border-b-2 border-gray-200">
                  <TableHead className="font-bold text-gray-700 p-4">Product Code</TableHead>
                  <TableHead className="font-bold text-gray-700 p-4">Product Name</TableHead>
                  <TableHead className="font-bold text-gray-700 p-4">Category</TableHead>
                  <TableHead className="font-bold text-gray-700 p-4">Cost Price (AED)</TableHead>
                  <TableHead className="font-bold text-gray-700 p-4">Least Price (AED)</TableHead>
                  <TableHead className="font-bold text-gray-700 p-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product._id} className="hover:bg-gray-50 transition-colors border-b border-gray-100">
                    <TableCell className="font-mono font-semibold text-[#2B3068] p-4">{product.productCode || "N/A"}</TableCell>
                    <TableCell className="font-semibold text-[#2B3068] p-4">{product.name}</TableCell>
                    <TableCell className="capitalize p-4">{product.category}</TableCell>
                    <TableCell className="p-4">AED {product.costPrice.toFixed(2)}</TableCell>
                    <TableCell className="p-4">AED {product.leastPrice.toFixed(2)}</TableCell>
                    <TableCell className="p-4">
                      <div className="flex space-x-2">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(product)} className="min-h-[36px]">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDeleteDialog(product)}
                          className="text-red-600 hover:text-red-700 min-h-[36px]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500 py-12">
                      <div className="text-gray-500">
                        <Plus className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">No products found</p>
                        <p className="text-sm">Add your first product to get started</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Rows (scrollable) */}
          <div className="lg:hidden overflow-x-auto">
            <div className="min-w-[520px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 border-b border-gray-200">
                    <TableHead className="p-3 text-xs font-semibold text-gray-700">Code</TableHead>
                    <TableHead className="p-3 text-xs font-semibold text-gray-700">Product</TableHead>
                    <TableHead className="p-3 text-xs font-semibold text-gray-700">Category</TableHead>
                    <TableHead className="p-3 text-xs font-semibold text-gray-700">Cost</TableHead>
                    <TableHead className="p-3 text-xs font-semibold text-gray-700">Least</TableHead>
                    <TableHead className="p-3 text-xs font-semibold text-gray-700">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product._id} className="border-b border-gray-100">
                      <TableCell className="p-3 font-mono font-medium text-[#2B3068] text-sm">{product.productCode || "N/A"}</TableCell>
                      <TableCell className="p-3 font-medium text-[#2B3068] text-sm truncate max-w-[160px]">{product.name}</TableCell>
                      <TableCell className="p-3 capitalize text-sm">{product.category}</TableCell>
                      <TableCell className="p-3 text-sm">AED {product.costPrice.toFixed(2)}</TableCell>
                      <TableCell className="p-3 text-sm">AED {product.leastPrice.toFixed(2)}</TableCell>
                      <TableCell className="p-3">
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEdit(product)} className="min-h-[36px]">
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openDeleteDialog(product)} className="text-red-600 hover:text-red-700 min-h-[36px]">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredProducts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                        <div className="text-gray-500">
                          <Plus className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p className="text-sm font-medium">No products found</p>
                          <p className="text-xs">Add your first product to get started</p>
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

      {showQuoteDialog && (
        <ProductQuoteDialog
          products={filteredProducts.map((p) => ({
            _id: p._id,
            name: p.name,
            productCode: p.productCode,
            category: p.category,
            costPrice: p.costPrice,
            leastPrice: p.leastPrice,
          }))}
          totalCount={products.length}
          onClose={() => setShowQuoteDialog(false)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#2B3068]">
              <Trash2 className="w-5 h-5 text-red-600" />
              Delete Product
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-700">
              Are you sure you want to delete{' '}
              <span className="font-semibold">{productToDelete?.name || 'this product'}</span>?
              {' '}This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false)
                  setProductToDelete(null)
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => productToDelete && handleDelete(productToDelete._id)}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>Delete</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
