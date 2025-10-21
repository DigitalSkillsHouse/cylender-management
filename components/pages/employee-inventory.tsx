"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Package, Loader2, ArrowLeft } from "lucide-react"

interface EmployeeInventoryItem {
  _id: string
  product: {
    _id: string
    name: string
    category: string
    cylinderSize?: string
    productCode?: string
  }
  assignedQuantity: number
  currentStock: number
  availableEmpty?: number
  availableFull?: number
  cylinderSize?: string
  leastPrice: number
  status: "assigned" | "received" | "active" | "returned"
  employee: {
    name: string
    email: string
  }
  assignedDate: string
  lastUpdated: string
  category?: string  // Added this - category from StockAssignment
  cylinderStatus?: string  // Added this - cylinder status from StockAssignment
  displayCategory?: string  // Added this - display category from StockAssignment
  transactions?: Array<{
    type: string
    quantity: number
    date: string
    notes?: string
  }>
}

interface EmployeeInventoryProps {
  user: { id: string; email: string; role: "admin" | "employee"; name: string }
}

export function EmployeeInventory({ user }: EmployeeInventoryProps) {
  const [inventory, setInventory] = useState<EmployeeInventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>("")
  const [searchTerm, setSearchTerm] = useState("")
  const [processingItems, setProcessingItems] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchEmployeeInventory()
  }, [])

  const fetchEmployeeInventory = async () => {
    try {
      setError("")
      const response = await fetch(`/api/employee-inventory?employeeId=${user.id}`)
      const data = await response.json()
      
      if (response.ok) {
        setInventory(data.data || [])
        console.log('📦 Employee inventory loaded:', {
          totalItems: data.data?.length || 0,
          assignedItems: data.data?.filter((item: EmployeeInventoryItem) => item.status === "assigned").length || 0,
          receivedItems: data.data?.filter((item: EmployeeInventoryItem) => item.status === "received" || item.status === "active").length || 0,
          allStatuses: data.data?.map((item: EmployeeInventoryItem) => item.status) || [],
          items: data.data?.map((item: EmployeeInventoryItem) => ({
            id: item._id,
            product: item.product?.name,
            status: item.status,
            quantity: item.assignedQuantity,
            currentStock: item.currentStock,
            category: item.category
          })) || []
        })
        
        // Debug individual items to see data structure
        if (data.data && data.data.length > 0) {
          data.data.forEach((item, index) => {
            console.log(`🔍 Inventory item ${index + 1} structure:`, {
              rawItem: item,
              hasId: !!item._id,
              id: item._id,
              hasProduct: !!item.product,
              productStructure: item.product,
              hasStatus: !!item.status,
              status: item.status,
              assignedQuantity: item.assignedQuantity,
              currentStock: item.currentStock,
              category: item.category,
              isMongooseDoc: item.constructor?.name === 'model'
            })
          })
        }
      } else {
        setError(data.error || "Failed to load inventory")
        console.error('API Error:', data.error)
      }
    } catch (error: any) {
      setError(`Failed to load inventory: ${error.message}`)
      console.error('Fetch Error:', error)
      setInventory([])
    } finally {
      setLoading(false)
    }
  }

  // Filter inventory by status with null checks
  // Admin approves employee purchase orders and creates StockAssignment records with status "assigned"
  // Employee accepts assignments which changes status to "received", then they become active inventory
  const assignedItems = inventory.filter(item => {
    const isValid = item && item._id && item.product && item.status === "assigned"
    if (item && !isValid) {
      console.warn('⚠️ Filtering out invalid assigned item:', {
        hasId: !!item._id,
        hasProduct: !!item.product,
        status: item.status,
        item: item
      })
    }
    return isValid
  })
  
  const receivedItems = inventory.filter(item => {
    const isValid = item && item._id && item.product && (item.status === "received" || item.status === "active")
    if (item && !isValid) {
      console.warn('⚠️ Filtering out invalid received item:', {
        hasId: !!item._id,
        hasProduct: !!item.product,
        status: item.status,
        item: item
      })
    }
    return isValid
  })
  
  const returnedItems = inventory.filter(item => {
    const isValid = item && item._id && item.product && item.status === "returned"
    return isValid
  })
  
  console.log('📋 Filtered inventory items:', {
    total: inventory.length,
    assigned: assignedItems.length,
    received: receivedItems.length,
    returned: returnedItems.length,
    allStatuses: inventory.map(item => item?.status),
    statusBreakdown: {
      assigned: inventory.filter(item => item?.status === 'assigned').length,
      received: inventory.filter(item => item?.status === 'received').length,
      active: inventory.filter(item => item?.status === 'active').length,
      returned: inventory.filter(item => item?.status === 'returned').length,
      undefined: inventory.filter(item => !item?.status).length
    },
    assignedItems: assignedItems.map(item => ({
      id: item?._id,
      product: item?.product?.name,
      status: item?.status,
      currentStock: item?.currentStock
    })),
    receivedItems: receivedItems.map(item => ({
      id: item?._id,
      product: item?.product?.name,
      status: item?.status,
      currentStock: item?.currentStock
    }))
  })

  // Process inventory data like admin inventory to get correct categorization
  const processInventoryData = () => {
    const gasItems: EmployeeInventoryItem[] = []
    const fullCylinderItems: EmployeeInventoryItem[] = []
    const emptyCylinderItems: EmployeeInventoryItem[] = []
    
    for (const item of receivedItems) {
      // Add null checks for item and product
      if (!item || !item.product) {
        console.warn('⚠️ Skipping invalid inventory item:', item)
        continue
      }
      
      const category = (item as any).category || (item as any).displayCategory || item.product.category
      const cylinderStatus = (item as any).cylinderStatus
      
      console.log('🔍 Processing item for categorization:', {
        productName: item.product.name,
        category: category,
        cylinderStatus: cylinderStatus,
        productCategory: item.product.category,
        currentStock: item.currentStock
      })
      
      // Gas items: items with gas category or gas products
      if (category === 'Gas' || category === 'gas' || item.product.category === 'gas') {
        if (item.currentStock > 0) {
          gasItems.push(item)
        }
      }
      
      // Full cylinder items: cylinders with full status or full cylinder category
      else if (category === 'Full Cylinder' || 
               (item.product.category === 'cylinder' && cylinderStatus === 'full') ||
               (category === 'cylinder' && cylinderStatus === 'full')) {
        if (item.currentStock > 0) {
          fullCylinderItems.push(item)
        }
      }
      
      // Empty cylinder items: cylinders with empty status, empty cylinder category, or cylinders without status
      else if (category === 'Empty Cylinder' || 
               (item.product.category === 'cylinder' && cylinderStatus === 'empty') ||
               (category === 'cylinder' && cylinderStatus === 'empty') ||
               (item.product.category === 'cylinder' && !cylinderStatus)) {
        if (item.currentStock > 0) {
          emptyCylinderItems.push(item)
        }
      }
      
      // Fallback: if it's a cylinder product but doesn't match above, put in empty cylinders
      else if (item.product.category === 'cylinder') {
        if (item.currentStock > 0) {
          emptyCylinderItems.push(item)
        }
      }
    }
    
    console.log('📊 Employee inventory categorization results:', {
      total: receivedItems.length,
      gas: gasItems.length,
      fullCylinder: fullCylinderItems.length,
      emptyCylinder: emptyCylinderItems.length,
      gasItems: gasItems.map(i => ({ name: i.product.name, stock: i.currentStock })),
      fullCylinderItems: fullCylinderItems.map(i => ({ name: i.product.name, stock: i.currentStock })),
      emptyCylinderItems: emptyCylinderItems.map(i => ({ name: i.product.name, stock: i.currentStock }))
    })
    
    return { gasItems, fullCylinderItems, emptyCylinderItems }
  }
  
  const { gasItems, fullCylinderItems, emptyCylinderItems } = processInventoryData()

  const norm = (v?: string | number) => (v === undefined || v === null ? "" : String(v)).toLowerCase()
  const matchesQuery = (item: EmployeeInventoryItem, q: string) =>
    norm(item.product.name).includes(q) ||
    norm(item.product.category).includes(q) ||
    norm(item.assignedQuantity).includes(q) ||
    norm(item.currentStock).includes(q)

  const q = searchTerm.trim().toLowerCase()

  const handleAcceptAssignment = async (item: EmployeeInventoryItem) => {
    try {
      setProcessingItems(prev => new Set(prev).add(item._id))
      
      // Update StockAssignment status to 'received' (employee has accepted the assignment)
      const response = await fetch(`/api/stock-assignments/${item._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'received',
          createEmployeeInventory: true,
          employeeId: user.id
        })
      })
      
      if (response.ok) {
        console.log('✅ Assignment accepted successfully, refreshing inventory...')
        // Add a small delay to ensure database operations complete
        setTimeout(async () => {
          await fetchEmployeeInventory()
        }, 1000)
      } else {
        const errorData = await response.json()
        console.error('❌ Failed to accept assignment:', errorData)
        setError(errorData.error || 'Failed to accept assignment')
      }
    } catch (error: any) {
      setError(`Failed to accept assignment: ${error.message}`)
    } finally {
      setProcessingItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(item._id)
        return newSet
      })
    }
  }

  const renderInventoryTable = (items: EmployeeInventoryItem[], showActions: boolean = false, currentTab: string = '') => (
    <div className="w-full overflow-x-auto">
      <div className="w-full min-w-[800px]">
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow className="bg-gray-50 border-b-2 border-gray-200">
              <TableHead className="font-bold text-gray-700 p-4 w-[20%]">Product</TableHead>
              <TableHead className="font-bold text-gray-700 p-4 w-[10%]">Code</TableHead>
              <TableHead className="font-bold text-gray-700 p-4 w-[12%]">Category</TableHead>
              <TableHead className="font-bold text-gray-700 p-4 w-[10%]">Assigned</TableHead>
              <TableHead className="font-bold text-gray-700 p-4 w-[10%]">Current Stock</TableHead>
              <TableHead className="font-bold text-gray-700 p-4 w-[10%]">Price (AED)</TableHead>
              <TableHead className="font-bold text-gray-700 p-4 w-[10%]">Status</TableHead>
              <TableHead className="font-bold text-gray-700 p-4 w-[10%]">Date</TableHead>
              {showActions && <TableHead className="font-bold text-gray-700 p-4 w-[13%]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.filter(item => item && item._id && item.product).map((item) => (
              <TableRow key={item._id} className="hover:bg-gray-50 transition-colors border-b border-gray-100">
                <TableCell className="p-4">
                  <div>
                    {/* Display product name based on current tab context */}
                    {currentTab === 'gas' && item.product.category === 'gas' ? (
                      // In Gas tab: Show gas product name
                      <div className="font-medium">{item.product.name}</div>
                    ) : currentTab === 'full-cylinder' && (item as any).gasProductId ? (
                      // In Full Cylinders tab: Show cylinder + gas binding if available
                      <div>
                        <div className="font-medium">{item.product.name}</div>
                        <div className="text-sm text-blue-600 font-medium">Contains Gas</div>
                      </div>
                    ) : (
                      // Default: Show product name
                      <div className="font-medium">{item.product.name}</div>
                    )}
                    
                    {/* Show product code if available */}
                    {item.product?.productCode && (
                      <div className="text-sm text-gray-500 font-mono">{item.product.productCode}</div>
                    )}
                    
                    {/* Show cylinder size if available */}
                    {item.product?.cylinderSize && (
                      <div className="text-sm text-gray-500">Size: {item.product.cylinderSize}</div>
                    )}
                    
                    {/* Show cylinder status context */}
                    {currentTab !== 'gas' && (item as any).cylinderStatus && (
                      <div className="text-sm text-blue-600 font-medium">
                        {(item as any).cylinderStatus === 'empty' ? 'Empty Cylinder' : 'Full Cylinder'}
                      </div>
                    )}
                    
                    {/* Show category context for assigned items */}
                    {currentTab === '' && item.product.category === 'cylinder' && !(item as any).cylinderStatus && (
                      <div className="text-sm text-gray-500">
                        Cylinder Product
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="p-4 text-sm font-mono">
                  {item.product?.productCode || 'N/A'}
                </TableCell>
                <TableCell className="p-4">
                  <Badge variant={(() => {
                    const category = (item as any).category || (item as any).displayCategory || item.product.category
                    const cylinderStatus = (item as any).cylinderStatus
                    
                    if (currentTab === 'gas' || category === 'Gas' || category === 'gas' || item.product.category === 'gas') {
                      return "default"
                    } else if (currentTab === 'full-cylinder' || category === 'Full Cylinder' || 
                              (item.product.category === 'cylinder' && cylinderStatus === 'full')) {
                      return "default"
                    } else {
                      return "secondary"
                    }
                  })()}
                  className={(() => {
                    const category = (item as any).category || (item as any).displayCategory || item.product.category
                    const cylinderStatus = (item as any).cylinderStatus
                    
                    if (currentTab === 'gas' || category === 'Gas' || category === 'gas' || item.product.category === 'gas') {
                      return "bg-blue-600 hover:bg-blue-700 text-white"
                    } else if (currentTab === 'full-cylinder' || category === 'Full Cylinder' || 
                              (item.product.category === 'cylinder' && cylinderStatus === 'full')) {
                      return "bg-green-600 hover:bg-green-700 text-white"
                    } else {
                      return "bg-amber-600 hover:bg-amber-700 text-white"
                    }
                  })()}>
                    {(() => {
                      // Display category based on current tab and item properties
                      if (currentTab === 'gas') {
                        return 'Gas'
                      } else if (currentTab === 'full-cylinder') {
                        return 'Full Cylinder'
                      } else if (currentTab === 'empty-cylinder') {
                        return 'Empty Cylinder'
                      }
                      
                      // Fallback to item's actual category
                      const displayCategory = (item as any).displayCategory
                      if (displayCategory) return displayCategory
                      
                      const category = (item as any).category
                      if (category && category !== 'cylinder' && category !== 'gas') return category
                      
                      if (item.product.category === 'cylinder' || category === 'cylinder') {
                        const cylinderStatus = (item as any).cylinderStatus
                        if (cylinderStatus === 'full') return 'Full Cylinder'
                        if (cylinderStatus === 'empty') return 'Empty Cylinder'
                        return 'Empty Cylinder' // Default for cylinders
                      }
                      
                      return item.product.category === 'gas' || category === 'gas' ? 'Gas' : (category || item.product.category)
                    })()
                    }
                  </Badge>
                </TableCell>
                <TableCell className="p-4 font-medium">{item.assignedQuantity || 0}</TableCell>
                <TableCell className="p-4 font-medium">
                  {(() => {
                    // Show appropriate stock quantity based on current tab
                    if (currentTab === 'gas' && item.product.category === 'gas') {
                      return item.currentStock
                    } else if (currentTab === 'full-cylinder') {
                      // For full cylinders, show current stock (should be full cylinder count)
                      return item.currentStock
                    } else if (currentTab === 'empty-cylinder') {
                      // For empty cylinders, show current stock (should be empty cylinder count)
                      return item.currentStock
                    } else {
                      // Default: show current stock
                      return item.currentStock
                    }
                  })()
                  }
                </TableCell>
                <TableCell className="p-4">AED {(item.leastPrice || 0).toFixed(2)}</TableCell>
                <TableCell className="p-4">
                  <Badge
                    variant={
                      item.status === "received"
                        ? "default"
                        : item.status === "assigned"
                          ? "secondary"
                          : "outline"
                    }
                    className={
                      item.status === "received" || item.status === "active"
                        ? "bg-green-100 text-green-800"
                        : item.status === "assigned"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-800"
                    }
                  >
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell className="p-4">
                  {new Date(item.assignedDate).toLocaleDateString()}
                </TableCell>
                {showActions && (
                  <TableCell className="p-4">
                    {item.status === "assigned" && !processingItems.has(item._id) && (
                      <Button
                        size="sm"
                        onClick={() => handleAcceptAssignment(item)}
                        className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white"
                      >
                        Accept & Add to Inventory
                      </Button>
                    )}
                    {item.status === "assigned" && processingItems.has(item._id) && (
                      <Button
                        size="sm"
                        disabled
                        className="bg-gray-400 text-white cursor-not-allowed"
                      >
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Processing...
                      </Button>
                    )}
                    {item.status === "received" && (
                      <Button
                        size="sm"
                        disabled
                        className="bg-green-500 text-white cursor-not-allowed"
                      >
                        ✓ Accepted
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={showActions ? 9 : 8} className="text-center text-gray-500 py-12">
                  <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No items found</p>
                  <p className="text-sm">
                    {currentTab === 'gas' ? 'No gas products in your inventory' :
                     currentTab === 'full-cylinder' ? 'No full cylinders in your inventory' :
                     currentTab === 'empty-cylinder' ? 'No empty cylinders in your inventory' :
                     'No inventory items match the current filter'}
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-[#2B3068]" />
          <p className="text-gray-600">Loading your inventory...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-16 lg:pt-0 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8 text-white">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 flex items-center gap-3">
          <Package className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />
          My Inventory
        </h1>
        <p className="text-white/80 text-sm sm:text-base lg:text-lg">Track your assigned stock and inventory</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {!error && !loading && (
        <Tabs defaultValue="assigned" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-auto">
            <TabsTrigger value="assigned" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
              Pending Assignments ({assignedItems.length})
            </TabsTrigger>
          <TabsTrigger value="received" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
            My Stock ({receivedItems.length})
          </TabsTrigger>
          <TabsTrigger value="returned" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
            Returned ({returnedItems.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assigned">
          <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
                <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold flex-1">
                  Pending Assignments ({assignedItems.length})
                </CardTitle>
                <div className="bg-white rounded-xl p-2 flex items-center gap-2 w-full lg:w-80">
                  <Input
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 text-gray-800"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {renderInventoryTable(q ? assignedItems.filter(item => matchesQuery(item, q)) : assignedItems, true, 'assigned')}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="received">
          <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
                <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold flex-1">
                  My Current Stock ({receivedItems.length})
                </CardTitle>
                <div className="bg-white rounded-xl p-2 flex items-center gap-2 w-full lg:w-80">
                  <Input
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 text-gray-800"
                  />
                </div>
              </div>
            </CardHeader>
            
            {/* My Stock Tabs */}
            <Tabs defaultValue="gas" className="w-full">
              <div className="px-4 sm:px-6 pt-4">
                <TabsList className="grid w-full grid-cols-3 h-auto">
                  <TabsTrigger value="gas" className="text-xs sm:text-sm font-medium py-2">
                    Gas ({gasItems.length})
                  </TabsTrigger>
                  <TabsTrigger value="full-cylinder" className="text-xs sm:text-sm font-medium py-2">
                    Full Cylinders ({fullCylinderItems.length})
                  </TabsTrigger>
                  <TabsTrigger value="empty-cylinder" className="text-xs sm:text-sm font-medium py-2">
                    Empty Cylinders ({emptyCylinderItems.length})
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="gas">
                <CardContent className="p-0">
                  {renderInventoryTable(q ? gasItems.filter(item => matchesQuery(item, q)) : gasItems, false, 'gas')}
                </CardContent>
              </TabsContent>

              <TabsContent value="full-cylinder">
                <CardContent className="p-0">
                  {renderInventoryTable(q ? fullCylinderItems.filter(item => matchesQuery(item, q)) : fullCylinderItems, false, 'full-cylinder')}
                </CardContent>
              </TabsContent>

              <TabsContent value="empty-cylinder">
                <CardContent className="p-0">
                  {renderInventoryTable(q ? emptyCylinderItems.filter(item => matchesQuery(item, q)) : emptyCylinderItems, false, 'empty-cylinder')}
                </CardContent>
              </TabsContent>
            </Tabs>
          </Card>
        </TabsContent>

        <TabsContent value="returned">
          <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
                <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold flex-1">
                  Returned Stock ({returnedItems.length})
                </CardTitle>
                <div className="bg-white rounded-xl p-2 flex items-center gap-2 w-full lg:w-80">
                  <Input
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 text-gray-800"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {renderInventoryTable(q ? returnedItems.filter(item => matchesQuery(item, q)) : returnedItems, false, 'returned')}
            </CardContent>
          </Card>
        </TabsContent>
        </Tabs>
      )}
    </div>
  )
}