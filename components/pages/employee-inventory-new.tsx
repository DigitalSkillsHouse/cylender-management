"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Package, Loader2, RefreshCw } from "lucide-react"

interface EmployeeInventoryItem {
  id: string
  poNumber: string
  productName: string
  productCode?: string
  supplierName: string
  purchaseDate: string
  quantity: number
  unitPrice: number
  totalAmount: number
  status: "pending" | "received"
  purchaseType: "gas" | "cylinder"
  cylinderStatus?: "empty" | "full"
  gasType?: string
  emptyCylinderId?: string
  emptyCylinderName?: string
  employeeName?: string
  employeeId?: string
  originalOrderId?: string
  itemIndex?: number
}

interface EmployeeInventoryStock {
  _id: string
  productId: string
  productName: string
  productCode?: string
  category: "gas" | "cylinder"
  currentStock: number
  availableEmpty: number
  availableFull: number
  cylinderSize?: string
  gasType?: string
  updatedAt: string
}

interface EmployeeInventoryProps {
  user: { id: string; email: string; role: "admin" | "employee"; name: string }
}

export function EmployeeInventoryNew({ user }: EmployeeInventoryProps) {
  const [pendingOrders, setPendingOrders] = useState<EmployeeInventoryItem[]>([])
  const [receivedStock, setReceivedStock] = useState<EmployeeInventoryStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>("")
  const [searchTerm, setSearchTerm] = useState("")
  const [processingItems, setProcessingItems] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchEmployeeInventoryData()
  }, [])

  const fetchEmployeeInventoryData = async () => {
    try {
      setError("")
      setLoading(true)
      
      console.log('🔄 Fetching employee inventory data for user:', user.id)
      
      // Fetch employee's pending purchase orders
      const pendingRes = await fetch(`/api/employee-inventory-new/pending?employeeId=${user.id}&t=${Date.now()}`, { 
        cache: 'no-store' 
      })
      const pendingData = pendingRes.ok ? await pendingRes.json() : { data: [] }
      
      // Fetch employee's received inventory stock
      const receivedRes = await fetch(`/api/employee-inventory-new/received?employeeId=${user.id}&t=${Date.now()}`, { 
        cache: 'no-store' 
      })
      const receivedData = receivedRes.ok ? await receivedRes.json() : { data: [] }
      
      console.log('📊 Employee inventory data fetched:', {
        pendingOrders: pendingData.data?.length || 0,
        receivedStock: receivedData.data?.length || 0
      })
      
      setPendingOrders(pendingData.data || [])
      setReceivedStock(receivedData.data || [])
      
    } catch (error: any) {
      console.error('❌ Failed to fetch employee inventory:', error)
      setError(`Failed to load inventory: ${error.message}`)
      setPendingOrders([])
      setReceivedStock([])
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptOrder = async (orderId: string) => {
    try {
      setError("")
      setProcessingItems(prev => new Set(prev).add(orderId))
      
      console.log('🔄 Accepting order:', orderId)
      
      const response = await fetch(`/api/employee-inventory-new/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          orderId,
          employeeId: user.id
        })
      })
      
      if (response.ok) {
        console.log('✅ Order accepted successfully')
        await fetchEmployeeInventoryData() // Refresh data
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to accept order')
      }
      
    } catch (error: any) {
      console.error('❌ Failed to accept order:', error)
      setError(`Failed to accept order: ${error.message}`)
    } finally {
      setProcessingItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(orderId)
        return newSet
      })
    }
  }

  // Filter functions for received inventory tabs
  const getGasStock = () => receivedStock.filter(item => 
    item.category === 'gas' && item.currentStock > 0
  )
  
  const getFullCylinderStock = () => receivedStock.filter(item => 
    item.category === 'cylinder' && item.availableFull > 0
  )
  
  const getEmptyCylinderStock = () => receivedStock.filter(item => 
    item.category === 'cylinder' && item.availableEmpty > 0
  )

  // Search filtering
  const filteredPendingOrders = searchTerm 
    ? pendingOrders.filter(item => 
        item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.productCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.poNumber.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : pendingOrders

  const renderPendingOrdersTable = (items: EmployeeInventoryItem[]) => (
    <div className="w-full overflow-x-auto">
      <Table className="w-full">
        <TableHeader>
          <TableRow className="bg-gray-50 border-b-2 border-gray-200">
            <TableHead className="font-bold text-gray-700 p-4">Product</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">PO Number</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Supplier</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Type</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Quantity</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Unit Price</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Total</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} className="hover:bg-gray-50 transition-colors border-b border-gray-100">
              <TableCell className="p-4">
                <div className="font-medium">{item.productName}</div>
                {item.productCode && (
                  <div className="text-sm text-gray-500 font-mono">{item.productCode}</div>
                )}
                {item.emptyCylinderName && (
                  <div className="text-sm text-blue-600">Empty Cylinder: {item.emptyCylinderName}</div>
                )}
              </TableCell>
              <TableCell className="p-4 font-mono text-sm">{item.poNumber}</TableCell>
              <TableCell className="p-4">{item.supplierName}</TableCell>
              <TableCell className="p-4">
                <Badge variant={item.purchaseType === "gas" ? "default" : "secondary"}>
                  {item.purchaseType}
                  {item.cylinderStatus && ` (${item.cylinderStatus})`}
                </Badge>
              </TableCell>
              <TableCell className="p-4 font-medium">{item.quantity}</TableCell>
              <TableCell className="p-4">AED {item.unitPrice.toFixed(2)}</TableCell>
              <TableCell className="p-4 font-semibold">AED {item.totalAmount.toFixed(2)}</TableCell>
              <TableCell className="p-4">
                {!processingItems.has(item.originalOrderId || item.id) ? (
                  <Button
                    size="sm"
                    onClick={() => handleAcceptOrder(item.originalOrderId || item.id)}
                    className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white"
                  >
                    Accept & Add to Stock
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled
                    className="bg-gray-400 text-white cursor-not-allowed"
                  >
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Processing...
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-gray-500 py-12">
                <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No pending orders</p>
                <p className="text-sm">You have no purchase orders awaiting acceptance</p>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )

  const renderReceivedStockTable = (items: EmployeeInventoryStock[], stockType: string) => (
    <div className="w-full overflow-x-auto">
      <Table className="w-full">
        <TableHeader>
          <TableRow className="bg-gray-50 border-b-2 border-gray-200">
            <TableHead className="font-bold text-gray-700 p-4">Product</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Code</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Category</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Available Stock</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Size</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Last Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            let availableQuantity = 0
            if (stockType === 'gas') availableQuantity = item.currentStock
            else if (stockType === 'full') availableQuantity = item.availableFull
            else if (stockType === 'empty') availableQuantity = item.availableEmpty
            
            return (
              <TableRow key={item._id} className="hover:bg-gray-50 transition-colors border-b border-gray-100">
                <TableCell className="p-4">
                  <div className="font-medium">{item.productName}</div>
                </TableCell>
                <TableCell className="p-4 font-mono text-sm">
                  {item.productCode || 'N/A'}
                </TableCell>
                <TableCell className="p-4">
                  <Badge variant="default" className="bg-blue-600 text-white">
                    {stockType === 'gas' ? 'Gas' : 
                     stockType === 'full' ? 'Full Cylinder' : 'Empty Cylinder'}
                  </Badge>
                </TableCell>
                <TableCell className="p-4 font-bold text-lg">
                  {availableQuantity}
                </TableCell>
                <TableCell className="p-4">
                  {item.cylinderSize || 'N/A'}
                </TableCell>
                <TableCell className="p-4 text-sm text-gray-600">
                  {new Date(item.updatedAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            )
          })}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-gray-500 py-12">
                <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No stock available</p>
                <p className="text-sm">You have no {stockType} stock assigned</p>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-[#2B3068]" />
          <p className="text-gray-600">Loading inventory...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-16 lg:pt-0 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 flex items-center gap-3">
              <Package className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />
              My Inventory
            </h1>
            <p className="text-white/80 text-sm sm:text-base lg:text-lg">Track your assigned stock and purchase orders</p>
          </div>
          <Button
            onClick={() => {
              console.log('🔄 Manual refresh triggered')
              fetchEmployeeInventoryData()
            }}
            variant="outline"
            size="sm"
            className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span className="ml-2 hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto">
          <TabsTrigger value="pending" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
            Pending Orders ({filteredPendingOrders.length})
          </TabsTrigger>
          <TabsTrigger value="received" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
            My Stock ({receivedStock.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
                <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold flex-1">
                  Pending Purchase Orders ({filteredPendingOrders.length})
                </CardTitle>
                <div className="bg-white rounded-xl p-2 flex items-center gap-2 w-full lg:w-80">
                  <Input
                    placeholder="Search product, code, supplier..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 text-gray-800"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {renderPendingOrdersTable(filteredPendingOrders)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="received">
          <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
              <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold">
                My Current Stock ({receivedStock.length} items)
              </CardTitle>
            </CardHeader>
            
            {/* Received Inventory Tabs */}
            <Tabs defaultValue="gas" className="w-full">
              <div className="px-4 sm:px-6 pt-4">
                <TabsList className="grid w-full grid-cols-3 h-auto">
                  <TabsTrigger value="gas" className="text-xs sm:text-sm font-medium py-2">
                    Gas Stock ({getGasStock().length})
                  </TabsTrigger>
                  <TabsTrigger value="full-cylinder" className="text-xs sm:text-sm font-medium py-2">
                    Full Cylinders ({getFullCylinderStock().length})
                  </TabsTrigger>
                  <TabsTrigger value="empty-cylinder" className="text-xs sm:text-sm font-medium py-2">
                    Empty Cylinders ({getEmptyCylinderStock().length})
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="gas">
                <CardContent className="p-0">
                  {renderReceivedStockTable(getGasStock(), 'gas')}
                </CardContent>
              </TabsContent>

              <TabsContent value="full-cylinder">
                <CardContent className="p-0">
                  {renderReceivedStockTable(getFullCylinderStock(), 'full')}
                </CardContent>
              </TabsContent>

              <TabsContent value="empty-cylinder">
                <CardContent className="p-0">
                  {renderReceivedStockTable(getEmptyCylinderStock(), 'empty')}
                </CardContent>
              </TabsContent>
            </Tabs>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
