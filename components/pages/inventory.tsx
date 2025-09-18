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
  supplierName: string
  purchaseDate: string
  quantity: number
  unitPrice: number
  totalAmount: number
  status: "pending" | "received"
  purchaseType: "gas" | "cylinder" | "multiple"
  isEmployeePurchase?: boolean
  employeeName?: string
  groupedItems?: InventoryItem[]
}

interface Product {
  _id: string
  name: string
  category: "gas" | "cylinder"
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
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [editFormData, setEditFormData] = useState({
    quantity: "",
    unitPrice: "",
    totalAmount: ""
  })
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null)
  // Group dialog for aggregated received items
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false)
  const [groupDialogMode, setGroupDialogMode] = useState<"edit" | "delete">("edit")
  const [groupItems, setGroupItems] = useState<InventoryItem[]>([])
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    fetchInventoryData()
  }, [])

  const fetchInventoryData = async () => {
    try {
      setError("")
      
      // Fetch both admin and employee purchase orders in parallel
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

      // Combine admin and employee purchase orders
      const allPurchaseOrders = [
        ...purchaseOrdersData.map((order: any) => ({ ...order, isEmployeePurchase: false })),
        ...employeePurchaseOrdersData.map((order: any) => ({ ...order, isEmployeePurchase: true }))
      ]

      // Build quick-lookup maps by ID
      const productsMap = new Map<string, any>(
        (productsData as any[]).filter(Boolean).map((p: any) => [p._id, p])
      )
      const suppliersMap = new Map<string, any>(
        (suppliersData as any[]).filter(Boolean).map((s: any) => [s._id, s])
      )

      const inventoryItems = Array.isArray(allPurchaseOrders)
        ? allPurchaseOrders.map((order: any, idx: number) => {
            const productRef = order.product ?? order.productId
            const supplierRef = order.supplier ?? order.supplierId ?? order.vendor

            // Resolve product name from populated object, ID lookup, or fallback fields
            let resolvedProductName = 'Unknown Product'
            if (productRef && typeof productRef === 'object') {
              resolvedProductName = productRef.name || productRef.title || order.productName || resolvedProductName
            } else if (typeof productRef === 'string') {
              const p = productsMap.get(productRef)
              if (p) resolvedProductName = p.name || p.title || resolvedProductName
              else resolvedProductName = order.productName || resolvedProductName
            } else {
              resolvedProductName = order.productName || resolvedProductName
            }
            
            if (resolvedProductName === 'Unknown Product' && typeof productRef === 'string') {
              resolvedProductName = productRef
            }

            // Resolve supplier name from populated object, ID lookup, or fallback fields
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

            // Resolve employee name for employee purchases
            let employeeName = ''
            if (order.isEmployeePurchase && order.employee) {
              if (typeof order.employee === 'object') {
                employeeName = order.employee.name || order.employee.email || ''
              } else if (typeof order.employee === 'string') {
                // If employee is just an ID, we'll show it as is
                employeeName = `Employee ${order.employee.slice(-6)}`
              }
            }

            // Debug when names cannot be resolved
            if (resolvedSupplierName === 'Unknown Supplier') {
              console.debug('[Inventory] Could not resolve supplier name for PO', order.poNumber || order._id, {
                supplierRef,
                orderSupplier: order.supplier,
                supplierId: typeof supplierRef === 'string' ? supplierRef : supplierRef?._id,
                suppliersSample: suppliersData?.slice?.(0, 1),
              })
            }
            if (resolvedProductName === 'Unknown Product' && idx < 3) {
              console.debug('[Inventory] Could not resolve product name for PO', order.poNumber || order._id, {
                productRef,
                orderProduct: order.product,
                productId: typeof productRef === 'string' ? productRef : productRef?._id,
                productsSample: productsData?.slice?.(0, 1),
              })
            }

            return {
              id: order._id,
              poNumber: order.poNumber || `PO-${order._id?.slice(-6) || 'UNKNOWN'}`,
              productName: resolvedProductName,
              supplierName: resolvedSupplierName,
              purchaseDate: order.purchaseDate || order.createdAt,
              quantity: order.quantity || 0,
              unitPrice: order.unitPrice || 0,
              totalAmount: order.totalAmount || 0,
              status: order.inventoryStatus || 'pending',
              purchaseType: order.purchaseType || 'gas',
              isEmployeePurchase: order.isEmployeePurchase || false,
              employeeName: employeeName
            } as InventoryItem
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
      console.log("Updating inventory status to received for ID:", id)
      
      // Update status in database - the API will handle stock synchronization automatically
      const response = await inventoryAPI.receiveInventory(id)
      console.log("Inventory update response:", response)
      
      if (response.data.success) {
        // Refresh inventory data to get updated values from database
        await fetchInventoryData()
      } else {
        setError("Failed to update inventory status")
      }
    } catch (error: any) {
      console.error("Failed to update inventory status:", error)
      setError(`Failed to update inventory: ${error.message}`)
    }
  }

  const handleEditInventory = (item: InventoryItem) => {
    setEditingItem(item)
    setEditFormData({
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      totalAmount: item.totalAmount.toString()
    })
    setIsEditDialogOpen(true)
  }

  const handleDeleteReceived = async (id: string) => {
    try {
      setError("")
      // Delete the underlying purchase order record which we map as received inventory
      const res = await purchaseOrdersAPI.delete(id)
      if (res.status >= 200 && res.status < 300) {
        await fetchInventoryData()
        setIsDeleteDialogOpen(false)
        setDeleteTarget(null)
      } else {
        setError("Failed to delete the received inventory item.")
      }
    } catch (error: any) {
      console.error("Failed to delete received inventory:", error)
      setError(`Failed to delete received inventory: ${error.message}`)
    }
  }

  // Open group dialog for aggregated received row (by grouped items)
  const openGroupDialog = (aggItem: InventoryItem, mode: "edit" | "delete") => {
    const items = aggItem.groupedItems || [aggItem]
    setGroupItems(items)
    setGroupDialogMode(mode)
    setIsGroupDialogOpen(true)
  }

  // Delete all items in current group
  const handleDeleteAllInGroup = async () => {
    try {
      for (const it of groupItems) {
        await handleDeleteReceived(it.id)
      }
      setIsGroupDialogOpen(false)
    } catch (e) {
      console.error("Failed deleting all in group", e)
    }
  }

  const openDeleteDialog = (item: InventoryItem) => {
    setDeleteTarget(item)
    setIsDeleteDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editingItem || !editFormData.quantity || !editFormData.unitPrice) return

    try {
      const newQuantity = Number.parseFloat(editFormData.quantity)
      const unitPrice = Number.parseFloat(editFormData.unitPrice)
      
      console.log("Updating inventory item:", editingItem.id, { quantity: newQuantity, unitPrice })
      
      // Update in database - the API will handle stock synchronization automatically
      const response = await inventoryAPI.updateItem(editingItem.id, {
        quantity: newQuantity,
        unitPrice
      })
      
      console.log("Inventory update response:", response)
      
      if (response.data.success) {
        // Refresh inventory data to get updated values from database
        await fetchInventoryData()
        setIsEditDialogOpen(false)
        setEditingItem(null)
      } else {
        setError("Failed to update inventory item")
      }
    } catch (error: any) {
      console.error("Failed to update inventory item:", error)
      setError(`Failed to update inventory: ${error.message}`)
    }
  }

  const handleCancelEdit = () => {
    setIsEditDialogOpen(false)
    setEditingItem(null)
    setEditFormData({ quantity: "", unitPrice: "", totalAmount: "" })
  }

  const getAvailableStock = (productName: string) => {
    const product = products.find(p => p.name === productName)
    if (!product) {
      return { stock: 0, color: "text-red-600" }
    }
    const stock = Number(product.currentStock) || 0
    let color = "text-green-600"
    if (stock === 0) color = "text-red-600"
    else if (stock < 10) color = "text-orange-600"
    return { stock, color }
  }

  const pendingItems = inventory.filter((item) => item.status === "pending")
  const receivedItemsRaw = inventory.filter((item) => item.status === "received")

  // Aggregate received items by product, supplier, and type (not by INV number)
  const aggregateReceived = (items: InventoryItem[]) => {
    const map = new Map<string, any>()
    items.forEach((it) => {
      // Create a key based on product, supplier, and type to group similar items
      const key = `${it.productName}|${it.supplierName}|${it.purchaseType}`
      const curr = map.get(key) || {
        idList: [] as string[],
        poNumbers: new Set<string>(),
        productName: it.productName,
        supplierName: it.supplierName,
        purchaseType: it.purchaseType,
        quantity: 0,
        totalAmount: 0,
        items: [] as InventoryItem[],
      }
      curr.idList.push(it.id)
      curr.poNumbers.add(it.poNumber)
      curr.quantity += Number(it.quantity) || 0
      curr.totalAmount += Number(it.totalAmount) || 0
      curr.items.push(it)
      map.set(key, curr)
    })
    return Array.from(map.values()).map((grp) => {
      const unitPrice = grp.quantity ? grp.totalAmount / grp.quantity : 0
      const poNumbersArray = Array.from(grp.poNumbers)
      return {
        id: grp.idList.join(","),
        poNumber: poNumbersArray.length === 1 ? poNumbersArray[0] : `Multiple (${poNumbersArray.length})`,
        productName: grp.productName,
        supplierName: grp.supplierName,
        purchaseDate: "",
        quantity: grp.quantity,
        unitPrice,
        totalAmount: grp.totalAmount,
        status: "received" as const,
        purchaseType: grp.purchaseType,
        isEmployeePurchase: grp.items.some((item: InventoryItem) => item.isEmployeePurchase),
        employeeName: grp.items.find((item: InventoryItem) => item.employeeName)?.employeeName || "",
        groupedItems: grp.items, // Store individual items for dropdown
      } as InventoryItem & { groupedItems: InventoryItem[] }
    })
  }
  const receivedItems = aggregateReceived(receivedItemsRaw)

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
  const filteredReceived = q ? receivedItems.filter((it) => matchesQuery(it, q)) : receivedItems

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
            Received Items ({receivedItems.length})
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
              {/* Table View (all screens) with horizontal scroll on small viewports */}
              <div className="w-full overflow-x-auto">
                <div className="inline-block min-w-[900px] align-top">
                  <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 border-b-2 border-gray-200">
                      <TableHead className="font-bold text-gray-700 p-4">INV Number</TableHead>
                      <TableHead className="font-bold text-gray-700 p-4">Product</TableHead>
                      <TableHead className="font-bold text-gray-700 p-4">Supplier</TableHead>
                      <TableHead className="font-bold text-gray-700 p-4">Employee</TableHead>
                      <TableHead className="font-bold text-gray-700 p-4">Type</TableHead>
                      <TableHead className="font-bold text-gray-700 p-4">Quantity</TableHead>
                      <TableHead className="font-bold text-gray-700 p-4">Unit Price</TableHead>
                      <TableHead className="font-bold text-gray-700 p-4">Total</TableHead>
                      <TableHead className="font-bold text-gray-700 p-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPending.map((item) => (
                      <TableRow key={item.id} className={`hover:bg-gray-50 transition-colors border-b border-gray-100 ${item.isEmployeePurchase ? 'bg-blue-50/30' : ''}`}>
                        <TableCell className="font-semibold text-[#2B3068] p-4">
                          <div className="flex items-center gap-2">
                            {item.poNumber}
                            {item.isEmployeePurchase && (
                              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                                Employee
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="p-4">{item.productName}</TableCell>
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
                        <TableCell className="p-4">{item.quantity}</TableCell>
                        <TableCell className="p-4">AED {item.unitPrice.toFixed(2)}</TableCell>
                        <TableCell className="p-4 font-semibold">AED {item.totalAmount.toFixed(2)}</TableCell>
                        <TableCell className="p-4">
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              onClick={() => handleReceiveInventory(item.id)}
                              style={{ backgroundColor: "#2B3068" }}
                              className="hover:opacity-90 text-white min-h-[36px]"
                            >
                              Mark Received
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              style={{ borderColor: "#2B3068", color: "#2B3068" }}
                              className="hover:bg-slate-50 min-h-[36px]"
                              onClick={() => handleEditInventory(item)}
                            >
                              Edit
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredPending.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-gray-500 py-12">
                          <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                          <p className="text-lg font-medium">No pending orders</p>
                          <p className="text-sm">All orders have been received</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="received">
          <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
                <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold flex-1">
                  Received Inventory Items ({filteredReceived.length}/{receivedItems.length})
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
              <div className="w-full overflow-x-auto">
                <div className="inline-block min-w-[1000px] align-top">
                  <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 border-b-2 border-gray-200">
                      <TableHead className="font-bold text-gray-700 p-4">INV Number</TableHead>
                      <TableHead className="font-bold text-gray-700 p-4">Product</TableHead>
                      <TableHead className="font-bold text-gray-700 p-4">Supplier</TableHead>
                      <TableHead className="font-bold text-gray-700 p-4">Employee</TableHead>
                      <TableHead className="font-bold text-gray-700 p-4">Type</TableHead>
                      <TableHead className="font-bold text-gray-700 p-4">Quantity</TableHead>
                      <TableHead className="font-bold text-gray-700 p-4">Available Stock</TableHead>
                      <TableHead className="font-bold text-gray-700 p-4">Unit Price</TableHead>
                      <TableHead className="font-bold text-gray-700 p-4">Total</TableHead>
                      <TableHead className="font-bold text-gray-700 p-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReceived.map((item) => (
                      <TableRow key={item.id} className={`hover:bg-gray-50 transition-colors border-b border-gray-100 ${item.isEmployeePurchase ? 'bg-blue-50/30' : ''}`}>
                        <TableCell className="font-semibold text-[#2B3068] p-4">
                          <div className="flex items-center gap-2">
                            <div className="flex flex-col">
                              <span>{item.poNumber}</span>
                              {item.groupedItems && item.groupedItems.length > 1 && (
                                <span className="text-xs text-gray-500">
                                  {item.groupedItems.length} orders grouped
                                </span>
                              )}
                            </div>
                            {item.isEmployeePurchase && (
                              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                                Employee
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="p-4">{item.productName}</TableCell>
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
                          {item.purchaseType === "multiple" ? (
                            <Badge variant="secondary">multiple</Badge>
                          ) : (
                            <Badge variant={item.purchaseType === "gas" ? "default" : "secondary"}>
                              {item.purchaseType}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="p-4">{item.quantity}</TableCell>
                        <TableCell className="p-4 font-semibold">
                          {item.productName === "Multiple" ? (
                            <span className="text-gray-500">-</span>
                          ) : (
                            <span className={getAvailableStock(item.productName).color}>
                              {getAvailableStock(item.productName).stock}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="p-4">AED {item.unitPrice.toFixed(2)}</TableCell>
                        <TableCell className="p-4 font-semibold">AED {item.totalAmount.toFixed(2)}</TableCell>
                        <TableCell className="p-4">
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              style={{ borderColor: "#2B3068", color: "#2B3068" }}
                              className="hover:bg-slate-50 min-h-[36px]"
                              onClick={() => openGroupDialog(item, "edit")}
                              aria-label="Expand"
                              title="Expand"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              style={{ borderColor: "#dc2626", color: "#dc2626" }}
                              className="hover:bg-red-50 min-h-[36px]"
                              onClick={() => openGroupDialog(item, "delete")}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredReceived.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-gray-500 py-12">
                          <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                          <p className="text-lg font-medium">No received items</p>
                          <p className="text-sm">All items are pending</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Inventory Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[500px] max-h-[90vh] overflow-y-auto mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl" style={{ color: "#2B3068" }}>
              <Edit className="w-4 h-4 sm:w-5 sm:h-5" />
              Edit Inventory Item
            </DialogTitle>
          </DialogHeader>
          
          {editingItem && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm text-gray-600">INV Number: <span className="font-medium">{editingItem.poNumber}</span></p>
                <p className="text-sm text-gray-600">Product: <span className="font-medium">{editingItem.productName}</span></p>
                <p className="text-sm text-gray-600">Supplier: <span className="font-medium">{editingItem.supplierName}</span></p>
              </div>
              
              <div className="space-y-3">
                <div>
                  <Label htmlFor="edit-quantity" className="text-sm font-medium">Quantity</Label>
                  <Input
                    id="edit-quantity"
                    type="number"
                    value={editFormData.quantity}
                    onChange={(e) => setEditFormData({ ...editFormData, quantity: e.target.value })}
                    min="1"
                    className="h-11 sm:h-12 text-sm sm:text-base"
                  />
                </div>
                
                <div>
                  <Label htmlFor="edit-unitPrice" className="text-sm font-medium">Unit Price (AED)</Label>
                  <Input
                    id="edit-unitPrice"
                    type="number"
                    step="0.01"
                    value={editFormData.unitPrice}
                    onChange={(e) => setEditFormData({ ...editFormData, unitPrice: e.target.value })}
                    min="0.01"
                    className="h-11 sm:h-12 text-sm sm:text-base"
                  />
                </div>
                
                {editFormData.quantity && editFormData.unitPrice && (
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-600">
                      Total Amount: <span className="font-bold text-[#2B3068]">
                        AED {(Number.parseFloat(editFormData.quantity) * Number.parseFloat(editFormData.unitPrice)).toFixed(2)}
                      </span>
                    </p>
                  </div>
                )}
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button
                  onClick={handleSaveEdit}
                  style={{ backgroundColor: "#2B3068" }}
                  className="w-full sm:flex-1 hover:opacity-90 min-h-[44px]"
                  disabled={!editFormData.quantity || !editFormData.unitPrice}
                >
                  Save Changes
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCancelEdit}
                  className="w-full sm:flex-1 min-h-[44px]"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Group Management Dialog for Aggregated Received Items */}
      <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[720px] max-h-[90vh] overflow-y-auto mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl" style={{ color: "#2B3068" }}>
              {groupDialogMode === "edit" ? "Manage Received Entries" : "Delete Received Entries"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {groupItems.length === 0 ? (
              <p className="text-sm text-gray-600">No entries found for this group.</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="p-3">INV Number</TableHead>
                      <TableHead className="p-3">Product</TableHead>
                      <TableHead className="p-3">Supplier</TableHead>
                      <TableHead className="p-3">Employee</TableHead>
                      <TableHead className="p-3">Qty</TableHead>
                      <TableHead className="p-3">Available Stock</TableHead>
                      <TableHead className="p-3">Unit Price</TableHead>
                      <TableHead className="p-3">Total</TableHead>
                      <TableHead className="p-3 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupItems.map((gi) => (
                      <TableRow key={gi.id}>
                        <TableCell className="p-3 font-medium">
                          <div className="flex items-center gap-2">
                            {gi.poNumber}
                            {gi.isEmployeePurchase && (
                              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                                Employee
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="p-3">{gi.productName}</TableCell>
                        <TableCell className="p-3">{gi.supplierName}</TableCell>
                        <TableCell className="p-3">
                          {gi.isEmployeePurchase && gi.employeeName ? (
                            <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">
                              {gi.employeeName}
                            </Badge>
                          ) : (
                            <span className="text-gray-500 text-sm">Admin</span>
                          )}
                        </TableCell>
                        <TableCell className="p-3">{gi.quantity}</TableCell>
                        <TableCell className={`p-3 font-semibold ${getAvailableStock(gi.productName).color}`}>
                          {getAvailableStock(gi.productName).stock}
                        </TableCell>
                        <TableCell className="p-3">AED {gi.unitPrice.toFixed(2)}</TableCell>
                        <TableCell className="p-3 font-semibold">AED {gi.totalAmount.toFixed(2)}</TableCell>
                        <TableCell className="p-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              style={{ borderColor: "#2B3068", color: "#2B3068" }}
                              className="hover:bg-slate-50"
                              onClick={() => {
                                setIsGroupDialogOpen(false)
                                handleEditInventory(gi)
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              style={{ borderColor: "#dc2626", color: "#dc2626" }}
                              className="hover:bg-red-50"
                              onClick={() => {
                                setIsGroupDialogOpen(false)
                                setDeleteTarget(gi)
                                setIsDeleteDialogOpen(true)
                              }}
                            >
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
            {groupDialogMode === "delete" && groupItems.length > 1 && (
              <div className="flex justify-end">
                <Button className="bg-red-600 hover:bg-red-700" onClick={handleDeleteAllInGroup}>
                  Delete All
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Received Inventory</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete this received inventory entry? This action cannot be undone.
            </p>
            {deleteTarget && (
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-sm text-gray-700">INV Number: <span className="font-medium">{deleteTarget.poNumber}</span></p>
                <p className="text-sm text-gray-700">Product: <span className="font-medium">{deleteTarget.productName}</span></p>
                <p className="text-sm text-gray-700">Supplier: <span className="font-medium">{deleteTarget.supplierName}</span></p>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsDeleteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={() => deleteTarget && handleDeleteReceived(deleteTarget.id)}
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
