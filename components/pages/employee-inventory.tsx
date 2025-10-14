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
        console.log('Employee inventory loaded:', data.data?.length || 0, 'items')
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

  // Filter inventory by status
  const assignedItems = inventory.filter(item => item.status === "assigned")
  const receivedItems = inventory.filter(item => item.status === "received" || item.status === "active")
  const returnedItems = inventory.filter(item => item.status === "returned")

  // Group received items by category for tabs
  const gasItems = receivedItems.filter(item => item.product.category === "gas")
  const fullCylinderItems = receivedItems.filter(item => 
    item.product.category === "cylinder" && 
    ((item as any).cylinderStatus === 'full' || ((item.availableFull || 0) > 0))
  )
  const emptyCylinderItems = receivedItems.filter(item => 
    item.product.category === "cylinder" && 
    ((item as any).cylinderStatus === 'empty' || ((item.availableEmpty || 0) > 0) || (item.currentStock > 0 && !(item as any).cylinderStatus))
  )

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
      
      // Update StockAssignment status to 'received' and create EmployeeInventory records
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
        await fetchEmployeeInventory()
      } else {
        setError('Failed to accept assignment')
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

  const renderInventoryTable = (items: EmployeeInventoryItem[], showActions: boolean = false) => (
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
            {items.map((item) => (
              <TableRow key={item._id} className="hover:bg-gray-50 transition-colors border-b border-gray-100">
                <TableCell className="p-4">
                  <div>
                    <div className="font-medium">{item.product.name}</div>
                    {item.product.cylinderSize && (
                      <div className="text-sm text-gray-500">Size: {item.product.cylinderSize}</div>
                    )}
                    {(item as any).cylinderStatus && (
                      <div className="text-sm text-blue-600 font-medium">
                        Status: {(item as any).cylinderStatus === 'empty' ? 'Empty Cylinder' : 'Full Cylinder'}
                      </div>
                    )}
                    {item.product.category === 'cylinder' && !(item as any).cylinderStatus && (
                      <div className="text-sm text-gray-500">
                        Cylinder Product
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="p-4 text-sm font-mono">
                  {(item.product as any).productCode || 'N/A'}
                </TableCell>
                <TableCell className="p-4">
                  <Badge variant={(item as any).category === "Gas" ? "default" : "secondary"}>
                    {(item as any).category || item.product.category}
                  </Badge>
                </TableCell>
                <TableCell className="p-4 font-medium">{item.assignedQuantity}</TableCell>
                <TableCell className="p-4 font-medium">{item.currentStock}</TableCell>
                <TableCell className="p-4">AED {item.leastPrice.toFixed(2)}</TableCell>
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
                        Accept
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
                  <p className="text-sm">No inventory items match the current filter</p>
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
              Assigned ({assignedItems.length})
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
                  Assigned Stock ({assignedItems.length})
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
              {renderInventoryTable(q ? assignedItems.filter(item => matchesQuery(item, q)) : assignedItems, true)}
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
                  {renderInventoryTable(q ? gasItems.filter(item => matchesQuery(item, q)) : gasItems)}
                </CardContent>
              </TabsContent>

              <TabsContent value="full-cylinder">
                <CardContent className="p-0">
                  {renderInventoryTable(q ? fullCylinderItems.filter(item => matchesQuery(item, q)) : fullCylinderItems)}
                </CardContent>
              </TabsContent>

              <TabsContent value="empty-cylinder">
                <CardContent className="p-0">
                  {renderInventoryTable(q ? emptyCylinderItems.filter(item => matchesQuery(item, q)) : emptyCylinderItems)}
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
              {renderInventoryTable(q ? returnedItems.filter(item => matchesQuery(item, q)) : returnedItems)}
            </CardContent>
          </Card>
        </TabsContent>
        </Tabs>
      )}
    </div>
  )
}