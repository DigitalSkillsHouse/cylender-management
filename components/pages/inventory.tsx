"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Package, Loader2, Edit, ChevronDown } from "lucide-react"
import { purchaseOrdersAPI, inventoryAPI, productsAPI, suppliersAPI } from "@/lib/api"
import employeePurchaseOrdersAPI from "@/lib/api/employee-purchase-orders"

interface InventoryItem {
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
  purchaseType: "gas" | "cylinder" | "multiple"
  cylinderStatus?: "empty" | "full"
  gasType?: string
  emptyCylinderId?: string
  emptyCylinderName?: string
  isEmployeePurchase?: boolean
  employeeName?: string
  employeeId?: string
  groupedItems?: InventoryItem[]
  originalOrderId?: string
  itemIndex?: number
}

interface Product {
  _id: string
  name: string
  category: "gas" | "cylinder"
  cylinderStatus?: "empty" | "full"
  costPrice: number
  leastPrice: number
  currentStock: number
}

interface Supplier {
  _id: string
  name: string
}

export function Inventory() {
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>("")
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    fetchInventoryData()
  }, [])

  const fetchInventoryData = async () => {
    try {
      setError("")
      
      const [purchaseOrdersRes, employeePurchaseOrdersRes, productsRes, suppliersRes] = await Promise.all([
        purchaseOrdersAPI.getAll(),
        employeePurchaseOrdersAPI.getAll(),
        productsAPI.getAll(),
        suppliersAPI.getAll()
      ])

      const purchaseOrdersData = purchaseOrdersRes.data?.data || purchaseOrdersRes.data || []
      const employeePurchaseOrdersData = employeePurchaseOrdersRes.data?.data || employeePurchaseOrdersRes.data || []
      const productsData = Array.isArray(productsRes.data?.data)
        ? productsRes.data.data
        : Array.isArray(productsRes.data)
          ? productsRes.data
          : Array.isArray(productsRes)
            ? productsRes
            : []
      const suppliersData = Array.isArray(suppliersRes.data?.data)
        ? suppliersRes.data.data
        : Array.isArray(suppliersRes.data)
          ? suppliersRes.data
          : Array.isArray(suppliersRes)
            ? suppliersRes
            : []

      const allPurchaseOrders = [
        ...purchaseOrdersData.map((order: any) => ({ ...order, isEmployeePurchase: false })),
        ...employeePurchaseOrdersData.map((order: any) => ({ ...order, isEmployeePurchase: true }))
      ]

      const productsMap = new Map<string, any>(
        (productsData as any[]).filter(Boolean).map((p: any) => [p._id, p])
      )
      const suppliersMap = new Map<string, any>(
        (suppliersData as any[]).filter(Boolean).map((s: any) => [s._id, s])
      )

      const inventoryItems = Array.isArray(allPurchaseOrders)
        ? allPurchaseOrders.flatMap((order: any, idx: number) => {
            const supplierRef = order.supplier ?? order.supplierId ?? order.vendor

            let resolvedSupplierName = 'Unknown Supplier'
            if (supplierRef && typeof supplierRef === 'object') {
              resolvedSupplierName = supplierRef.name || supplierRef.companyName || supplierRef.supplierName || order.supplierName || order.vendorName || resolvedSupplierName
            } else if (typeof supplierRef === 'string') {
              const s = suppliersMap.get(supplierRef)
              if (s) resolvedSupplierName = s.name || s.companyName || s.supplierName || resolvedSupplierName
              else resolvedSupplierName = order.supplierName || order.vendorName || resolvedSupplierName
            } else {
              resolvedSupplierName = order.supplierName || order.vendorName || resolvedSupplierName
            }
            if (resolvedSupplierName === 'Unknown Supplier' && typeof supplierRef === 'string') {
              resolvedSupplierName = supplierRef
            }

            let employeeName = ''
            if (order.isEmployeePurchase && order.employee) {
              if (typeof order.employee === 'object') {
                employeeName = order.employee.name || order.employee.email || ''
              } else if (typeof order.employee === 'string') {
                employeeName = `Employee ${order.employee.slice(-6)}`
              }
            }

            const items = order.items && Array.isArray(order.items) ? order.items : [order]
            
            return items.map((item: any, itemIndex: number) => {
              const productRef = item.product ?? item.productId ?? order.product ?? order.productId

              let resolvedProductName = 'Unknown Product'
              let resolvedProductCode = ''
              if (productRef && typeof productRef === 'object') {
                resolvedProductName = productRef.name || productRef.title || item.productName || order.productName || resolvedProductName
                resolvedProductCode = productRef.productCode || productRef.code || item.productCode || order.productCode || ''
              } else if (typeof productRef === 'string') {
                const p = productsMap.get(productRef)
                if (p) {
                  resolvedProductName = p.name || p.title || resolvedProductName
                  resolvedProductCode = p.productCode || p.code || ''
                } else {
                  resolvedProductName = item.productName || order.productName || resolvedProductName
                  resolvedProductCode = item.productCode || order.productCode || ''
                }
              } else {
                resolvedProductName = item.productName || order.productName || resolvedProductName
                resolvedProductCode = item.productCode || order.productCode || ''
              }
              
              if (resolvedProductName === 'Unknown Product' && typeof productRef === 'string') {
                resolvedProductName = productRef
              }

              const itemStatus = item.inventoryStatus || order.inventoryStatus || 'pending'
              
              // Resolve empty cylinder name if present
              let emptyCylinderName = ''
              if (item.emptyCylinderId) {
                const emptyCylinder = productsMap.get(item.emptyCylinderId)
                emptyCylinderName = emptyCylinder?.name || 'Unknown Cylinder'
              }

              return {
                id: `${order._id}-${itemIndex}`,
                poNumber: order.poNumber || `PO-${order._id?.slice(-6) || 'UNKNOWN'}`,
                productName: resolvedProductName,
                productCode: resolvedProductCode,
                supplierName: resolvedSupplierName,
                purchaseDate: order.purchaseDate || order.createdAt,
                quantity: item.quantity || order.quantity || 0,
                unitPrice: item.unitPrice || order.unitPrice || 0,
                totalAmount: item.itemTotal || item.totalAmount || order.totalAmount || 0,
                status: itemStatus,
                purchaseType: item.purchaseType || order.purchaseType || 'gas',
                cylinderStatus: item.cylinderStatus,
                gasType: item.gasType,
                emptyCylinderId: item.emptyCylinderId,
                emptyCylinderName: emptyCylinderName,
                isEmployeePurchase: order.isEmployeePurchase || false,
                employeeName: employeeName,
                employeeId: order.isEmployeePurchase ? (order.employee?._id || order.employee) : null,
                originalOrderId: order._id,
                itemIndex: itemIndex
              } as InventoryItem
            })
          })
        : []

      setInventory(inventoryItems)
      setProducts(productsData)
      setSuppliers(suppliersData)
    } catch (error: any) {
      setError(`Failed to load inventory: ${error.message}`)
      setInventory([])
      setProducts([])
      setSuppliers([])
    } finally {
      setLoading(false)
    }
  }

  const handleReceiveInventory = async (id: string) => {
    try {
      setError("")
      
      const inventoryItem = inventory.find(item => item.id === id)
      const orderIdToUpdate = inventoryItem?.originalOrderId || id
      const itemIndex = inventoryItem?.itemIndex
      
      console.log("Receiving inventory item:", { id, orderIdToUpdate, itemIndex, inventoryItem })
      
      let response
      if (itemIndex !== undefined && itemIndex >= 0) {
        // Use item-level API for multi-item orders
        response = await inventoryAPI.updateItemStatus(orderIdToUpdate, itemIndex, { status: "received" })
      } else {
        // Use order-level API for single-item orders (backward compatibility)
        response = await inventoryAPI.updateStatus(orderIdToUpdate, { status: "received" })
      }
      
      console.log("Inventory update response:", response)
      
      if (response.data.success) {
        // Update stock based on purchase type and cylinder status
        await updateStockForReceivedItem(inventoryItem!)
        await fetchInventoryData()
        
        // Notify other pages about stock update
        localStorage.setItem('stockUpdated', Date.now().toString())
        window.dispatchEvent(new Event('stockUpdated'))
        console.log('✅ Stock update notification sent to other pages')
      } else {
        setError("Failed to mark inventory as received")
      }
    } catch (error: any) {
      console.error("Failed to receive inventory:", error)
      setError(`Failed to receive inventory: ${error.message}`)
    }
  }

  const updateStockForReceivedItem = async (item: InventoryItem) => {
    try {
      if (item.purchaseType === 'cylinder') {
        if (item.cylinderStatus === 'full') {
          // Full cylinder purchase: Move cylinder to full category and update gas stock
          const cylinderProduct = products.find(p => p.name === item.productName && p.category === 'cylinder')
          if (cylinderProduct) {
            // Update cylinder to full status
            await productsAPI.update(cylinderProduct._id, {
              cylinderStatus: 'full',
              currentStock: cylinderProduct.currentStock + item.quantity
            })
          }
          
          // Update gas stock if gasType is specified
          if (item.gasType) {
            const gasProduct = products.find(p => p.name === item.gasType && p.category === 'gas')
            if (gasProduct) {
              await productsAPI.update(gasProduct._id, {
                currentStock: gasProduct.currentStock + item.quantity
              })
            }
          }
        } else if (item.cylinderStatus === 'empty') {
          // Empty cylinder purchase: Add to empty cylinder stock
          const cylinderProduct = products.find(p => p.name === item.productName && p.category === 'cylinder')
          if (cylinderProduct) {
            await productsAPI.update(cylinderProduct._id, {
              cylinderStatus: 'empty',
              currentStock: cylinderProduct.currentStock + item.quantity
            })
          }
        }
      } else if (item.purchaseType === 'gas') {
        // Gas purchase/refilling: Move empty cylinder to full and update gas stock
        if (item.emptyCylinderId && item.emptyCylinderName) {
          // Reduce empty cylinder stock
          const emptyCylinder = products.find(p => p._id === item.emptyCylinderId)
          if (emptyCylinder && emptyCylinder.currentStock >= item.quantity) {
            await productsAPI.update(item.emptyCylinderId, {
              currentStock: emptyCylinder.currentStock - item.quantity
            })
          }
          
          // Find or create full cylinder with same name
          let fullCylinder = products.find(p => 
            p.name === item.emptyCylinderName && 
            p.category === 'cylinder' && 
            p.cylinderStatus === 'full'
          )
          
          if (fullCylinder) {
            // Update existing full cylinder stock
            await productsAPI.update(fullCylinder._id, {
              currentStock: fullCylinder.currentStock + item.quantity
            })
          } else {
            // Create new full cylinder entry if it doesn't exist
            const emptyCylinderData = products.find(p => p._id === item.emptyCylinderId)
            if (emptyCylinderData) {
              await productsAPI.create({
                name: item.emptyCylinderName,
                category: 'cylinder',
                cylinderStatus: 'full',
                costPrice: emptyCylinderData.costPrice,
                leastPrice: emptyCylinderData.leastPrice,
                currentStock: item.quantity
              })
            }
          }
        }
        
        // Update gas stock
        const gasProduct = products.find(p => p.name === item.productName && p.category === 'gas')
        if (gasProduct) {
          await productsAPI.update(gasProduct._id, {
            currentStock: gasProduct.currentStock + item.quantity
          })
        }
      }
    } catch (error) {
      console.error("Failed to update stock:", error)
    }
  }

  const pendingItems = inventory.filter(item => item.status === "pending")
  const receivedItemsRaw = inventory.filter(item => item.status === "received")

  // Filter functions for received inventory tabs
  const getFilteredReceivedItems = (filter: string) => {
    switch (filter) {
      case 'full-cylinder':
        return receivedItemsRaw.filter(item => item.purchaseType === 'cylinder' && item.cylinderStatus === 'full')
      case 'empty-cylinder':
        return receivedItemsRaw.filter(item => item.purchaseType === 'cylinder' && item.cylinderStatus === 'empty')
      case 'gas':
        return receivedItemsRaw.filter(item => item.purchaseType === 'gas')
      default:
        return receivedItemsRaw
    }
  }

  const norm = (v?: string | number) => (v === undefined || v === null ? "" : String(v)).toLowerCase()
  const matchesQuery = (it: InventoryItem, q: string) =>
    norm(it.poNumber).includes(q) ||
    norm(it.productName).includes(q) ||
    norm(it.supplierName).includes(q) ||
    norm(it.purchaseType).includes(q) ||
    norm(it.quantity).includes(q) ||
    norm(it.unitPrice).includes(q) ||
    norm(it.totalAmount).includes(q)

  const q = searchTerm.trim().toLowerCase()
  const filteredPending = q ? pendingItems.filter((it) => matchesQuery(it, q)) : pendingItems

  const renderInventoryTable = (items: InventoryItem[], showActions: boolean = true) => (
    <div className="w-full overflow-x-auto">
      <div className="inline-block min-w-[1000px] align-top">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 border-b-2 border-gray-200">
              <TableHead className="font-bold text-gray-700 p-4">INV Number</TableHead>
              <TableHead className="font-bold text-gray-700 p-4">Product</TableHead>
              <TableHead className="font-bold text-gray-700 p-4">Details</TableHead>
              <TableHead className="font-bold text-gray-700 p-4">Supplier</TableHead>
              <TableHead className="font-bold text-gray-700 p-4">Employee</TableHead>
              <TableHead className="font-bold text-gray-700 p-4">Type</TableHead>
              <TableHead className="font-bold text-gray-700 p-4">Quantity</TableHead>
              <TableHead className="font-bold text-gray-700 p-4">Unit Price</TableHead>
              <TableHead className="font-bold text-gray-700 p-4">Total</TableHead>
              {showActions && <TableHead className="font-bold text-gray-700 p-4">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className={`hover:bg-gray-50 transition-colors border-b border-gray-100 ${item.isEmployeePurchase ? 'bg-blue-50/30' : ''}`}>
                <TableCell className="font-semibold text-[#2B3068] p-4">
                  <div className="flex items-center gap-2">
                    <span>{item.poNumber}</span>
                    {item.isEmployeePurchase && (
                      <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                        Employee
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="p-4">
                  <div className="font-medium">{item.productName}</div>
                  {item.productCode && (
                    <div className="text-sm text-gray-500 font-mono">{item.productCode}</div>
                  )}
                </TableCell>
                <TableCell className="p-4">
                  <div className="text-sm space-y-1">
                    {item.purchaseType === 'cylinder' && item.cylinderStatus && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">Status:</span>
                        <Badge variant={item.cylinderStatus === 'full' ? 'default' : 'secondary'}>
                          {item.cylinderStatus}
                        </Badge>
                      </div>
                    )}
                    {item.gasType && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">Gas:</span>
                        <span className="font-medium">{item.gasType}</span>
                      </div>
                    )}
                    {item.emptyCylinderName && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">Empty Cylinder:</span>
                        <span className="font-medium">{item.emptyCylinderName}</span>
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="p-4">{item.supplierName}</TableCell>
                <TableCell className="p-4">
                  {item.isEmployeePurchase && item.employeeName ? (
                    <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">
                      {item.employeeName}
                    </Badge>
                  ) : (
                    <span className="text-gray-500 text-sm">Admin</span>
                  )}
                </TableCell>
                <TableCell className="p-4">
                  <Badge variant={item.purchaseType === "gas" ? "default" : "secondary"}>
                    {item.purchaseType}
                  </Badge>
                </TableCell>
                <TableCell className="p-4 font-medium">{item.quantity}</TableCell>
                <TableCell className="p-4">AED {item.unitPrice.toFixed(2)}</TableCell>
                <TableCell className="p-4 font-semibold">AED {item.totalAmount.toFixed(2)}</TableCell>
                {showActions && (
                  <TableCell className="p-4">
                    <div className="flex justify-end gap-2">
                      {item.status === "pending" && (
                        <Button
                          size="sm"
                          onClick={() => handleReceiveInventory(item.id)}
                          style={{ backgroundColor: "#2B3068" }}
                          className="hover:opacity-90 text-white"
                        >
                          {item.isEmployeePurchase ? "Approve & Send to Employee" : "Mark Received"}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={showActions ? 10 : 9} className="text-center text-gray-500 py-12">
                  <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No items found</p>
                  <p className="text-sm">No items match the current filter</p>
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
          <p className="text-gray-600">Loading inventory...</p>
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
          Inventory Management
        </h1>
        <p className="text-white/80 text-sm sm:text-base lg:text-lg">Track and manage your inventory items</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto">
          <TabsTrigger value="pending" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
            Pending Orders ({pendingItems.length})
          </TabsTrigger>
          <TabsTrigger value="received" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
            Received Items ({receivedItemsRaw.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
                <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold flex-1">
                  Pending Purchase Orders ({filteredPending.length}/{pendingItems.length})
                </CardTitle>
                <div className="bg-white rounded-xl p-2 flex items-center gap-2 w-full lg:w-80">
                  <Input
                    placeholder="Search INV, product, supplier, type..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 text-gray-800"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {renderInventoryTable(filteredPending, true)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="received">
          <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
                <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold flex-1">
                  Received Inventory Items ({receivedItemsRaw.length})
                </CardTitle>
                <div className="bg-white rounded-xl p-2 flex items-center gap-2 w-full lg:w-80">
                  <Input
                    placeholder="Search INV, product, supplier, type..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 text-gray-800"
                  />
                </div>
              </div>
            </CardHeader>
            
            {/* Received Inventory Tabs */}
            <Tabs defaultValue="all" className="w-full">
              <div className="px-4 sm:px-6 pt-4">
                <TabsList className="grid w-full grid-cols-4 h-auto">
                  <TabsTrigger value="all" className="text-xs sm:text-sm font-medium py-2">
                    All ({receivedItemsRaw.length})
                  </TabsTrigger>
                  <TabsTrigger value="full-cylinder" className="text-xs sm:text-sm font-medium py-2">
                    Full Cylinders ({receivedItemsRaw.filter(item => item.purchaseType === 'cylinder' && item.cylinderStatus === 'full').length})
                  </TabsTrigger>
                  <TabsTrigger value="empty-cylinder" className="text-xs sm:text-sm font-medium py-2">
                    Empty Cylinders ({receivedItemsRaw.filter(item => item.purchaseType === 'cylinder' && item.cylinderStatus === 'empty').length})
                  </TabsTrigger>
                  <TabsTrigger value="gas" className="text-xs sm:text-sm font-medium py-2">
                    Gas ({receivedItemsRaw.filter(item => item.purchaseType === 'gas').length})
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="all">
                <CardContent className="p-0">
                  {renderInventoryTable(getFilteredReceivedItems('all'), false)}
                </CardContent>
              </TabsContent>

              <TabsContent value="full-cylinder">
                <CardContent className="p-0">
                  {renderInventoryTable(getFilteredReceivedItems('full-cylinder'), false)}
                </CardContent>
              </TabsContent>

              <TabsContent value="empty-cylinder">
                <CardContent className="p-0">
                  {renderInventoryTable(getFilteredReceivedItems('empty-cylinder'), false)}
                </CardContent>
              </TabsContent>

              <TabsContent value="gas">
                <CardContent className="p-0">
                  {renderInventoryTable(getFilteredReceivedItems('gas'), false)}
                </CardContent>
              </TabsContent>
            </Tabs>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
