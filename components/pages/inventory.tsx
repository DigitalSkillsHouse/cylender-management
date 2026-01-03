"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Package, Loader2, Edit, ChevronDown, RefreshCw } from "lucide-react"
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
  productCode?: string
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

export const Inventory = () => {
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [inventoryAvailability, setInventoryAvailability] = useState<Record<string, { availableEmpty: number; availableFull: number; currentStock: number }>>({})
  const [inventoryList, setInventoryList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>("")
  const [searchTerm, setSearchTerm] = useState("")
  const [processingItems, setProcessingItems] = useState<Set<string>>(new Set())
  
  // Pending returns state
  const [pendingReturns, setPendingReturns] = useState<any[]>([])
  
  // Empty cylinder selection popup state for returns
  const [showReturnCylinderDialog, setShowReturnCylinderDialog] = useState(false)
  const [selectedReturn, setSelectedReturn] = useState<any>(null)
  const [returnEmptyCylinders, setReturnEmptyCylinders] = useState<any[]>([])
  const [returnCylinderSearch, setReturnCylinderSearch] = useState("")
  const [selectedReturnCylinderId, setSelectedReturnCylinderId] = useState("")
  const [showReturnCylinderSuggestions, setShowReturnCylinderSuggestions] = useState(false)

  useEffect(() => {
    // Clear any stale pending returns state on mount
    setPendingReturns([])
    
    // Fetch fresh data from database
    fetchInventoryData()
    fetchPendingReturns()
  }, [])

  // Refresh pending returns when page regains focus (e.g., after database clear)
  useEffect(() => {
    const handleFocus = () => {
      console.log('🔄 [PENDING RETURNS] Page focused, refreshing pending returns...')
      fetchPendingReturns()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  // Listen for stock return events from employees
  useEffect(() => {
    const handleStockReturn = () => {
      console.log('🔄 [PENDING RETURNS] Stock return event received, refreshing pending returns...')
      // Small delay to ensure database is updated
      setTimeout(() => {
        fetchPendingReturns()
      }, 1000)
    }

    // Listen for various events that might indicate a stock return
    window.addEventListener('stockUpdated', handleStockReturn)
    window.addEventListener('employeeInventoryUpdated', handleStockReturn)
    window.addEventListener('notification-refresh', handleStockReturn)
    
    // Also listen for a specific pending returns refresh event
    window.addEventListener('pendingReturnsRefresh', handleStockReturn)

    return () => {
      window.removeEventListener('stockUpdated', handleStockReturn)
      window.removeEventListener('employeeInventoryUpdated', handleStockReturn)
      window.removeEventListener('notification-refresh', handleStockReturn)
      window.removeEventListener('pendingReturnsRefresh', handleStockReturn)
    }
  }, [])

  // Optional: Poll for pending returns every 30 seconds as a fallback
  // This ensures pending returns are refreshed even if events are missed
  useEffect(() => {
    const pollInterval = 30000 // 30 seconds
    
    const intervalId = setInterval(() => {
      console.log('🔄 [PENDING RETURNS] Polling for pending returns (fallback)...')
      fetchPendingReturns()
    }, pollInterval)

    return () => clearInterval(intervalId)
  }, [])

  // Auto-populate cylinder search when return dialog opens with gas product
  useEffect(() => {
    if (showReturnCylinderDialog && selectedReturn?.productName) {
      const productName = selectedReturn.productName.trim()
      // Remove "Gas" prefix (case-insensitive) and add "Cylinder" prefix
      let gasName = productName
      // Remove "Gas" prefix if it exists (case-insensitive)
      if (gasName.toLowerCase().startsWith('gas ')) {
        gasName = gasName.substring(4).trim() // Remove "Gas " prefix
      } else if (gasName.toLowerCase().startsWith('gas')) {
        gasName = gasName.substring(3).trim() // Remove "Gas" prefix (no space)
      }
      // Add "Cylinder" prefix
      const cylinderSearchTerm = `Cylinder ${gasName}`
      setReturnCylinderSearch(cylinderSearchTerm)
      setShowReturnCylinderSuggestions(true)
    }
  }, [showReturnCylinderDialog, selectedReturn])

  const fetchInventoryData = async () => {
    try {
      setError("")
      // Always attempt to load inventory items first (public aggregate source for Received tabs)
      const invItemsRes = await fetch('/api/inventory-items', { cache: 'no-store' })
      const invItemsJson = await (async () => { try { return await invItemsRes.json() } catch { return {} as any } })()
      const invItemsData = Array.isArray(invItemsJson?.data) ? invItemsJson.data : []

      // Best-effort fetch for POs, products, suppliers (may 401). Fall back to [] on error.
      let purchaseOrdersData: any[] = []
      let employeePurchaseOrdersData: any[] = []
      let productsData: any[] = []
      let suppliersData: any[] = []
      try {
        const res = await purchaseOrdersAPI.getAll()
        purchaseOrdersData = res.data?.data || res.data || []
      } catch (_) {}
      try {
        const res = await employeePurchaseOrdersAPI.getAll()
        employeePurchaseOrdersData = res.data?.data || res.data || []
      } catch (_) {}
      try {
        const res = await productsAPI.getAll()
        productsData = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : (Array.isArray(res) ? (res as any) : []))
      } catch (_) {}
      try {
        const res = await suppliersAPI.getAll()
        suppliersData = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : (Array.isArray(res) ? (res as any) : []))
      } catch (_) {}

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
              if (item.emptyCylinderId || order.emptyCylinderId) {
                // First try to get from order data if available
                if (order.emptyCylinderName) {
                  emptyCylinderName = order.emptyCylinderName
                } else if (item.emptyCylinderName) {
                  emptyCylinderName = item.emptyCylinderName
                } else {
                  // Fallback: try to resolve from products map (though this might not work for inventory IDs)
                  const emptyCylinderId = item.emptyCylinderId || order.emptyCylinderId
                  const emptyCylinder = productsMap.get(emptyCylinderId)
                  emptyCylinderName = emptyCylinder?.name || 'Unknown Cylinder'
                }
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
      setInventoryList(invItemsData)
      // Build availability map by productId
      const availMap: Record<string, { availableEmpty: number; availableFull: number; currentStock: number }> = {}
      for (const ii of invItemsData) {
        if (ii?.productId) {
          availMap[ii.productId] = {
            availableEmpty: Number(ii.availableEmpty || 0),
            availableFull: Number(ii.availableFull || 0),
            currentStock: Number(ii.currentStock || 0),
          }
        }
      }
      setInventoryAvailability(availMap)
    } catch (error: any) {
      setError(`Failed to load inventory: ${error.message}`)
      setInventory([])
      setProducts([])
      setSuppliers([])
    } finally {
      setLoading(false)
    }
  }

  // Fetch pending returns from employees
  const fetchPendingReturns = async () => {
    try {
      console.log('🔍 [PENDING RETURNS] Fetching pending returns from employees')
      
      // IMPORTANT: Always fetch fresh from database, never use localStorage or cache
      // Add cache-busting timestamp and headers to ensure fresh data from database
      const cacheBust = Date.now()
      const response = await fetch(`/api/admin/pending-returns?t=${cacheBust}&_=${cacheBust}`, { 
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Requested-With': 'XMLHttpRequest' // Prevent browser caching
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log('📦 [PENDING RETURNS] Raw API response:', data)
        console.log('📦 [PENDING RETURNS] Response keys:', Object.keys(data))
        console.log('📦 [PENDING RETURNS] pendingReturns type:', typeof data.pendingReturns)
        console.log('📦 [PENDING RETURNS] pendingReturns is array:', Array.isArray(data.pendingReturns))
        
        const returns = Array.isArray(data.pendingReturns) ? data.pendingReturns : []
        
        // Always set the fresh data from database, never use cached state
        setPendingReturns(returns)
        console.log('✅ [PENDING RETURNS] Fetched fresh pending returns from database:', returns.length)
        
        // If database was cleared, ensure we don't show stale data
        if (returns.length === 0) {
          console.log('⚠️ [PENDING RETURNS] No pending returns found. This could mean:')
          console.log('   1. No employees have sent back stock yet')
          console.log('   2. All returns have been processed')
          console.log('   3. There may be an issue with the database query')
        } else {
          console.log('📋 [PENDING RETURNS] Return details:', returns.map(r => ({
            id: r.id,
            employee: r.employeeName,
            product: r.productName,
            date: r.returnDate,
            status: r.status
          })))
        }
      } else {
        const errorText = await response.text()
        console.error('❌ [PENDING RETURNS] Failed to fetch pending returns, status:', response.status)
        console.error('❌ [PENDING RETURNS] Error response:', errorText)
        // On error, clear state to avoid showing stale data
        setPendingReturns([])
      }
    } catch (error) {
      console.error('❌ [PENDING RETURNS] Error fetching pending returns:', error)
      // On error, clear state to avoid showing stale data
      setPendingReturns([])
    }
  }

  // Fetch admin's empty cylinders for return acceptance
  const fetchReturnEmptyCylinders = async () => {
    try {
      console.log('🔍 [RETURN CYLINDERS] Fetching admin empty cylinders')
      
      // Use the existing inventoryList data to get empty cylinders
      const emptyCylinderStock = inventoryList.filter((item: any) => 
        item.category === 'cylinder' && item.availableEmpty > 0
      )
      
      setReturnEmptyCylinders(emptyCylinderStock)
      console.log('✅ [RETURN CYLINDERS] Found empty cylinders:', emptyCylinderStock.length)
    } catch (error) {
      console.error('❌ [RETURN CYLINDERS] Error fetching empty cylinders:', error)
      setReturnEmptyCylinders([])
    }
  }

  // Handle return cylinder selection
  const handleReturnCylinderSelection = (cylinderId: string, cylinderName: string) => {
    setSelectedReturnCylinderId(cylinderId)
    setReturnCylinderSearch(cylinderName)
    setShowReturnCylinderSuggestions(false)
  }

  // Handle accepting a return from employee
  const handleAcceptReturn = async (returnId: string) => {
    try {
      setError("")
      
      // Find the return to check if it's a gas return
      const returnItem = pendingReturns.find(r => r.id === returnId)
      
      // If it's a gas return, show cylinder selection popup
      if (returnItem && returnItem.stockType === 'gas') {
        console.log('🔄 [GAS RETURN] Gas return detected, showing cylinder selection popup')
        setSelectedReturn(returnItem)
        
        // Fetch admin's empty cylinders
        await fetchReturnEmptyCylinders()
        setShowReturnCylinderDialog(true)
        return
      }
      
      // For non-gas returns, proceed with direct acceptance
      await processReturnAcceptance(returnId)
      
    } catch (error: any) {
      console.error('❌ [ACCEPT RETURN] Exception:', error)
      setError(`Failed to accept return: ${error.message}`)
    }
  }

  const processReturnAcceptance = async (returnId: string, emptyCylinderId?: string) => {
    try {
      setProcessingItems(prev => new Set(prev).add(returnId))
      
      console.log('🔄 [ACCEPT RETURN] Starting acceptance for return:', returnId)
      
      const requestBody: any = { 
        returnTransactionId: returnId, 
        adminId: 'admin' // You might want to get actual admin ID from auth context
      }
      
      // Add empty cylinder ID if provided (for gas returns)
      if (emptyCylinderId) {
        requestBody.emptyCylinderId = emptyCylinderId
        console.log('🔗 [ACCEPT RETURN] Including empty cylinder:', emptyCylinderId)
      }
      
      console.log('📤 [ACCEPT RETURN] Request body:', requestBody)
      
      const response = await fetch('/api/admin/accept-return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
      
      console.log('📡 [ACCEPT RETURN] Response status:', response.status, response.ok)
      
      if (response.ok) {
        const responseData = await response.json()
        console.log('✅ [ACCEPT RETURN] Success response:', responseData)
        
        // Trigger stock update event to refresh other components (this will cause DSR pages to refetch)
        // Note: We don't clear localStorage here to preserve offline/fallback functionality
        // The cache-busting on API calls ensures fresh data is fetched
        localStorage.setItem('stockUpdated', Date.now().toString())
        window.dispatchEvent(new Event('stockUpdated'))
        window.dispatchEvent(new Event('employeeInventoryUpdated'))
        // Trigger notification refresh (event-driven, no polling needed)
        window.dispatchEvent(new Event('notification-refresh'))
        
        // Refresh data
        await fetchInventoryData()
        await fetchPendingReturns()
        
        // Close dialog if it was a gas return
        if (showReturnCylinderDialog) {
          setShowReturnCylinderDialog(false)
          setSelectedReturn(null)
          setReturnCylinderSearch("")
          setSelectedReturnCylinderId("")
        }
      } else {
        const errorData = await response.json()
        console.error('❌ [ACCEPT RETURN] Error response:', errorData)
        
        // If the error indicates the return was already processed, refresh the pending returns list
        // This handles race conditions where another admin accepted the return
        if (errorData.error && (
          errorData.error.includes('already been accepted') || 
          errorData.error.includes('no longer pending') ||
          errorData.currentStatus === 'received'
        )) {
          console.log('🔄 [ACCEPT RETURN] Return already processed, refreshing pending returns list')
          await fetchPendingReturns() // Refresh to show current state
        }
        
        setError(errorData.error || 'Failed to accept return')
      }
      
    } catch (error: any) {
      console.error('❌ [ACCEPT RETURN] Exception:', error)
      setError(`Failed to accept return: ${error.message}`)
    } finally {
      setProcessingItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(returnId)
        return newSet
      })
    }
  }

  // Handle gas return acceptance with cylinder selection
  const handleGasReturnAcceptance = async () => {
    if (!selectedReturn || !selectedReturnCylinderId) {
      setError("Please select an empty cylinder")
      return
    }
    
    await processReturnAcceptance(selectedReturn.id, selectedReturnCylinderId)
  }

  // Helper: get or create InventoryItem ID for a given product
  const getOrCreateInventoryItemId = async (
    productId: string,
    category: "gas" | "cylinder"
  ): Promise<string> => {
    try {
      const res = await fetch('/api/inventory-items', { cache: 'no-store' })
      const json = await res.json()
      const found = Array.isArray(json?.data)
        ? json.data.find((it: any) => it.productId === productId)
        : null
      if (found?._id) return found._id as string
    } catch (_) {}

    // Create if not found
    try {
      const createRes = await fetch('/api/inventory-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, category })
      })
      const created = await createRes.json()
      return (created?.data?._id as string) || ''
    } catch (e) {
      console.error('Failed to create inventory item', e)
      return ''
    }
  }

  // Helper: apply delta to inventory item
  const patchInventoryDelta = async (
    inventoryItemId: string,
    delta: Partial<{ currentStock: number; availableEmpty: number; availableFull: number }>
  ) => {
    if (!inventoryItemId) return
    await fetch(`/api/inventory-items/${inventoryItemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta })
    })
  }

  const handleReceiveInventory = async (id: string) => {
    try {
      setError("")
      
      const inventoryItem = inventory.find(item => item.id === id)
      
      // Check if item is already received to prevent duplicate processing
      if (inventoryItem?.status === "received") {
        setError("This item has already been received")
        return
      }
      
      const orderIdToUpdate = inventoryItem?.originalOrderId || id
      const itemIndex = inventoryItem?.itemIndex
      
      console.log("Receiving inventory item:", { id, orderIdToUpdate, itemIndex, inventoryItem })
      
      // Add item to processing set to disable the button
      setProcessingItems(prev => new Set(prev).add(id))
      
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
        // For employee purchases, create EmployeeInventory record
        if (inventoryItem?.isEmployeePurchase && inventoryItem?.employeeId) {
          try {
            const product = products.find(p => p.name === inventoryItem.productName)
            if (product) {
              await fetch('/api/employee-inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  employeeId: inventoryItem.employeeId,
                  productId: product._id,
                  quantity: inventoryItem.quantity,
                  leastPrice: product.leastPrice || inventoryItem.unitPrice,
                  type: 'assignment'
                })
              })
              console.log('✅ Employee inventory record created')
            }
          } catch (empError) {
            console.error('Failed to create employee inventory record:', empError)
          }
        }
        
        // Only update main inventory stock for regular purchases, not employee purchases
        if (inventoryItem && !inventoryItem.isEmployeePurchase) {
          await updateStockForReceivedItem(inventoryItem)
        }
        
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
    } finally {
      // Remove item from processing set
      setProcessingItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
    }
  }

  const updateStockForReceivedItem = async (item: InventoryItem) => {
    try {
      // Helper function for robust product name matching
      const normalizeProductName = (name: string) => 
        (name || '').toLowerCase().trim().replace(/\s+/g, ' ')

      if (item.purchaseType === 'cylinder') {
        // Adjust cylinder availability in InventoryItems - Use robust matching with name AND code
        const itemProductName = normalizeProductName(item.productName)
        const itemProductCode = normalizeProductName(item.productCode || '')
        
        const cylinderProduct = products.find(p => {
          if (p.category !== 'cylinder') return false
          
          const productName = normalizeProductName(p.name)
          const productCode = normalizeProductName(p.productCode || '')
          
          // Match by name AND code if both exist, otherwise match by name only
          if (itemProductCode && productCode) {
            return productName === itemProductName && productCode === itemProductCode
          }
          return productName === itemProductName
        })
        
        console.log('🔍 [STOCK UPDATE] Looking for cylinder product:', {
          searchName: itemProductName,
          searchCode: itemProductCode,
          originalName: item.productName,
          originalCode: item.productCode,
          foundProduct: cylinderProduct ? `${cylinderProduct.name} (${cylinderProduct.productCode || 'No Code'})` : 'NOT FOUND',
          availableProducts: products.filter(p => p.category === 'cylinder').map(p => `${p.name} (${p.productCode || 'No Code'})`)
        })
        
        if (cylinderProduct) {
          const invId = await getOrCreateInventoryItemId(cylinderProduct._id, 'cylinder')
          if (item.cylinderStatus === 'full') {
            await patchInventoryDelta(invId, { availableFull: item.quantity })
            console.log('✅ [STOCK UPDATE] Updated full cylinders for:', cylinderProduct.name, 'Quantity:', item.quantity)
          } else if (item.cylinderStatus === 'empty') {
            await patchInventoryDelta(invId, { availableEmpty: item.quantity })
            console.log('✅ [STOCK UPDATE] Updated empty cylinders for:', cylinderProduct.name, 'Quantity:', item.quantity)
          }
        } else {
          console.error('❌ [STOCK UPDATE] Cylinder product not found for:', item.productName)
        }

        // If gasType specified for full cylinders, increase gas stock too
        if (item.cylinderStatus === 'full' && item.gasType) {
          const gasTypeNormalized = normalizeProductName(item.gasType)
          const gasProduct = products.find(p => 
            normalizeProductName(p.name) === gasTypeNormalized && p.category === 'gas'
          )
          if (gasProduct) {
            const invId = await getOrCreateInventoryItemId(gasProduct._id, 'gas')
            await patchInventoryDelta(invId, { currentStock: item.quantity })
            console.log('✅ [STOCK UPDATE] Updated gas stock for:', gasProduct.name, 'Quantity:', item.quantity)
          }
        }
      } else if (item.purchaseType === 'gas') {
        // Gas purchase/refilling: move empty -> full for cylinder, and increase gas stock
        if (item.emptyCylinderId && item.emptyCylinderName) {
          const emptyCylinder = products.find(p => p._id === item.emptyCylinderId && p.category === 'cylinder')
          if (emptyCylinder) {
            const invId = await getOrCreateInventoryItemId(emptyCylinder._id, 'cylinder')
            // Decrease empty, increase full by quantity
            await patchInventoryDelta(invId, { availableEmpty: -item.quantity, availableFull: item.quantity })
            console.log('✅ [STOCK UPDATE] Gas purchase - moved empty to full for:', emptyCylinder.name, 'Quantity:', item.quantity)
          }
        }

        // Update gas stock for the purchased gas product
        const itemGasName = normalizeProductName(item.productName)
        const itemGasCode = normalizeProductName(item.productCode || '')
        
        const gasProduct = products.find(p => {
          if (p.category !== 'gas') return false
          
          const productName = normalizeProductName(p.name)
          const productCode = normalizeProductName(p.productCode || '')
          
          // Match by name AND code if both exist, otherwise match by name only
          if (itemGasCode && productCode) {
            return productName === itemGasName && productCode === itemGasCode
          }
          return productName === itemGasName
        })
        
        console.log('🔍 [STOCK UPDATE] Looking for gas product:', {
          searchName: itemGasName,
          searchCode: itemGasCode,
          originalName: item.productName,
          originalCode: item.productCode,
          foundProduct: gasProduct ? `${gasProduct.name} (${gasProduct.productCode || 'No Code'})` : 'NOT FOUND',
          availableProducts: products.filter(p => p.category === 'gas').map(p => `${p.name} (${p.productCode || 'No Code'})`)
        })
        
        if (gasProduct) {
          const invId = await getOrCreateInventoryItemId(gasProduct._id, 'gas')
          await patchInventoryDelta(invId, { currentStock: item.quantity })
          console.log('✅ [STOCK UPDATE] Updated gas stock for:', gasProduct.name, 'Quantity:', item.quantity)
        } else {
          console.error('❌ [STOCK UPDATE] Gas product not found for:', item.productName)
        }
      }
    } catch (error) {
      console.error("Failed to update stock:", error)
    }
  }

  const pendingItems = inventory.filter(item => item.status === "pending")
  const receivedItemsRaw = inventory.filter(item => item.status === "received")

  // Build aggregated lists for Received tabs from live inventory to show ALL items (including 0 stock)
  const getFilteredReceivedItems = (filter: string) => {
    const rows: InventoryItem[] = [] as any

    const pushRowFromInv = (inv: any, qty: number, kind: 'empty' | 'full' | 'gas', showZeroStock: boolean = true) => {
      // Show all items including those with 0 stock so admin can see what needs purchasing
      if (!showZeroStock && qty <= 0) return
      
      const id = `${inv.productId || inv._id}-${kind}`
      // Try to infer supplier from latest received PO item for same product name
      let inferredSupplier = ''
      const match = receivedItemsRaw.find(it => it.productName === (inv.productName || '') && it.status === 'received')
      if (match) inferredSupplier = match.supplierName || ''
      
      const base = {
        id,
        poNumber: '',
        productName: inv.productName || 'Unknown',
        productCode: inv.productCode || '',
        supplierName: inferredSupplier,
        purchaseDate: '',
        quantity: qty,
        unitPrice: 0,
        totalAmount: 0,
        status: 'received' as const,
        purchaseType: inv.category === 'gas' ? 'gas' : 'cylinder',
        cylinderStatus: kind === 'empty' ? 'empty' : kind === 'full' ? 'full' : undefined,
        gasType: undefined,
        emptyCylinderId: undefined,
        emptyCylinderName: undefined,
        isEmployeePurchase: false,
        // Add stock level indicator for easy identification
        stockLevel: qty === 0 ? 'out-of-stock' : qty < 10 ? 'low-stock' : 'in-stock',
      }
      rows.push(base as any)
    }

    if (filter === 'empty-cylinder') {
      // Show ALL cylinders with their availableEmpty stock (including 0)
      for (const inv of inventoryList.filter(ii => ii.category === 'cylinder')) {
        const avail = Number(inv.availableEmpty || 0)
        pushRowFromInv(inv, avail, 'empty', true) // Show all including 0 stock
      }
      return rows.sort((a, b) => a.quantity - b.quantity) // Sort by quantity (0 stock first)
    }

    if (filter === 'full-cylinder') {
      // Show ALL cylinders with their availableFull stock (including 0)
      for (const inv of inventoryList.filter(ii => ii.category === 'cylinder')) {
        const avail = Number(inv.availableFull || 0)
        pushRowFromInv(inv, avail, 'full', true) // Show all including 0 stock
      }
      return rows.sort((a, b) => a.quantity - b.quantity) // Sort by quantity (0 stock first)
    }

    if (filter === 'gas') {
      // Show ALL gas SKUs with their currentStock (including 0)
      for (const inv of inventoryList.filter(ii => ii.category === 'gas')) {
        const qty = Number(inv.currentStock || 0)
        pushRowFromInv(inv, qty, 'gas', true) // Show all including 0 stock
      }
      return rows.sort((a, b) => a.quantity - b.quantity) // Sort by quantity (0 stock first)
    }

    return receivedItemsRaw
  }

  const norm = (v?: string | number) => (v === undefined || v === null ? "" : String(v)).toLowerCase()
  const matchesQuery = (it: InventoryItem, q: string) =>
    norm(it.productName).includes(q) ||
    norm(it.productCode).includes(q) ||
    norm(it.supplierName).includes(q) ||
    norm(it.purchaseType).includes(q) ||
    norm(it.quantity).includes(q) ||
    norm(it.unitPrice).includes(q) ||
    norm(it.totalAmount).includes(q)

  const q = searchTerm.trim().toLowerCase()
  const filteredPending = q ? pendingItems.filter((it) => matchesQuery(it, q)) : pendingItems

  const renderInventoryTable = (items: InventoryItem[], showActions: boolean = true, currentTab: string = '') => (
    <div className="w-full overflow-x-auto">
      <div className="w-full min-w-[1200px]">
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow className="bg-gray-50 border-b-2 border-gray-200">
              <TableHead className="font-bold text-gray-700 p-4 w-[18%]">Product</TableHead>
              {currentTab === 'pending' && (
                <TableHead className="font-bold text-gray-700 p-4 w-[16%]">Details</TableHead>
              )}
              <TableHead className="font-bold text-gray-700 p-4 w-[12%]">Supplier</TableHead>
              <TableHead className="font-bold text-gray-700 p-4 w-[8%]">Type</TableHead>
              <TableHead className="font-bold text-gray-700 p-4 w-[8%]">Quantity</TableHead>
              <TableHead className="font-bold text-gray-700 p-4 w-[10%]">Unit Price</TableHead>
              <TableHead className="font-bold text-gray-700 p-4 w-[10%]">Total</TableHead>
              {showActions && <TableHead className="font-bold text-gray-700 p-4 w-[18%]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className={`hover:bg-gray-50 transition-colors border-b border-gray-100 ${item.isEmployeePurchase ? 'bg-blue-50/30' : ''}`}>
                <TableCell className="p-4">
                  <div className="flex items-center gap-2">
                    <div>
                      {/* Show different display based on current tab */}
                      {item.purchaseType === 'gas' && item.emptyCylinderName ? (
                        currentTab === 'gas' ? (
                          // In Gas tab: Show only gas information
                          <div className="font-medium">{item.productName}</div>
                        ) : (
                          // In Full Cylinders tab: Show cylinder + gas binding
                          <div>
                            <div className="font-medium">{item.emptyCylinderName}</div>
                            <div className="text-sm text-blue-600 font-medium">Filled with: {item.productName}</div>
                          </div>
                        )
                      ) : (
                        <div className="font-medium">{item.productName}</div>
                      )}
                      {item.productCode && (
                        <div className="text-sm text-gray-500 font-mono">{item.productCode}</div>
                      )}
                    </div>
                    {item.isEmployeePurchase && (
                      <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                        Employee
                      </Badge>
                    )}
                  </div>
                </TableCell>
                {currentTab === 'pending' && (
                  <TableCell className="p-4">
                    <div className="text-sm space-y-1">
                      {/* Show status for cylinder purchases */}
                      {item.purchaseType === 'cylinder' && item.cylinderStatus && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600">Status:</span>
                          <Badge variant={item.cylinderStatus === 'full' ? 'default' : 'secondary'}>
                            {item.cylinderStatus}
                          </Badge>
                        </div>
                      )}
                      
                      {/* For gas purchases in pending tab: show gas-focused info */}
                      {item.purchaseType === 'gas' && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600">Type:</span>
                          <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">
                            Gas Product
                          </Badge>
                        </div>
                      )}
                      
                      {/* Show gas type - always relevant */}
                      {item.gasType && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600">Gas Type:</span>
                          <span className="font-medium text-blue-600">{item.gasType}</span>
                        </div>
                      )}
                      
                      {/* Show cylinder info for gas purchases when available */}
                      {item.purchaseType === 'gas' && item.emptyCylinderName && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600">Cylinder Type:</span>
                          <span className="font-medium">{item.emptyCylinderName}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                )}
                <TableCell className="p-4">{item.supplierName}</TableCell>
                <TableCell className="p-4">
                  {item.purchaseType === "gas" ? (
                    currentTab === 'gas' ? (
                      // In Gas tab: Show as gas
                      <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">
                        Gas
                      </Badge>
                    ) : (
                      // In Full Cylinders tab: Show as full cylinder
                      <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                        Full Cylinder
                      </Badge>
                    )
                  ) : (
                    <Badge variant={item.cylinderStatus === "full" ? "default" : "secondary"}>
                      {item.purchaseType} ({item.cylinderStatus})
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="p-4 font-medium">
                  <div className="flex items-center gap-2">
                    <span className={`${
                      item.quantity === 0 ? 'text-red-600 font-bold' : 
                      item.quantity < 10 ? 'text-orange-600 font-semibold' : 
                      'text-green-600'
                    }`}>
                      {currentTab === 'empty-cylinder' ? (() => {
                        const product = products.find(p => p.category === 'cylinder' && p.name === item.productName)
                        const remaining = product ? (inventoryAvailability[product._id]?.availableEmpty ?? undefined) : undefined
                        return typeof remaining === 'number' ? remaining : item.quantity
                      })() : item.quantity}
                    </span>
                    {item.quantity === 0 && (
                      <Badge variant="destructive" className="text-xs sm:text-xs">
                        <span className="hidden sm:inline">OUT OF STOCK</span>
                        <span className="sm:hidden">Out of stock </span>
                      </Badge>
                    )}
                    {item.quantity > 0 && item.quantity < 10 && (
                      <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800">
                        LOW STOCK
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="p-4">AED {item.unitPrice.toFixed(2)}</TableCell>
                <TableCell className="p-4 font-semibold">AED {item.totalAmount.toFixed(2)}</TableCell>
                {showActions && (
                  <TableCell className="p-4">
                    <div className="flex justify-end gap-2">
                      {item.status === "pending" && !processingItems.has(item.id) && (
                        <Button
                          size="sm"
                          onClick={() => handleReceiveInventory(item.id)}
                          style={{ backgroundColor: "#2B3068" }}
                          className="hover:opacity-90 text-white"
                        >
                          {item.isEmployeePurchase ? "Approve & Send to Employee" : "Mark Received"}
                        </Button>
                      )}
                      {(item.status === "pending" && processingItems.has(item.id)) && (
                        <Button
                          size="sm"
                          disabled={true}
                          style={{ backgroundColor: "#6B7280" }}
                          className="text-white cursor-not-allowed"
                        >
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Processing...
                        </Button>
                      )}
                      {item.status === "received" && (
                        <Button
                          size="sm"
                          disabled={true}
                          style={{ backgroundColor: "#10B981" }}
                          className="text-white cursor-not-allowed"
                        >
                          ✓ Received
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={currentTab === 'pending' ? (showActions ? 8 : 7) : (showActions ? 7 : 6)} className="text-center text-gray-500 py-12">
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

  const renderPendingReturnsTable = () => (
    <div className="w-full overflow-x-auto">
      <Table className="w-full">
        <TableHeader>
          <TableRow className="bg-gray-50 border-b-2 border-gray-200">
            <TableHead className="font-bold text-gray-700 p-4">Employee</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Product</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Stock Type</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Quantity</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Return Date</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pendingReturns.map((returnItem) => (
            <TableRow key={returnItem.id} className="hover:bg-gray-50 transition-colors border-b border-gray-100">
              <TableCell className="p-4">
                <div className="font-medium">{returnItem.employeeName}</div>
                <div className="text-sm text-gray-500">{returnItem.employeeEmail}</div>
              </TableCell>
              <TableCell className="p-4">
                <div className="font-medium">{returnItem.productName}</div>
                {returnItem.productCode && (
                  <div className="text-sm text-gray-500 font-mono">{returnItem.productCode}</div>
                )}
              </TableCell>
              <TableCell className="p-4">
                <Badge variant={returnItem.stockType === "gas" ? "default" : "secondary"}>
                  {returnItem.stockType === 'gas' ? 'Gas' : 'Empty Cylinder'}
                </Badge>
              </TableCell>
              <TableCell className="p-4 font-bold text-lg">
                {returnItem.quantity}
              </TableCell>
              <TableCell className="p-4 text-sm text-gray-600">
                {new Date(returnItem.returnDate).toLocaleDateString()}
              </TableCell>
              <TableCell className="p-4">
                {!processingItems.has(returnItem.id) ? (
                  <Button
                    size="sm"
                    onClick={() => handleAcceptReturn(returnItem.id)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    Accept Return
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
          {pendingReturns.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-gray-500 py-12">
                <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No pending returns</p>
                <p className="text-sm">No employee returns awaiting approval</p>
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
    <div className="pt-6 lg:pt-0 space-y-4 sm:space-y-6">
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
        <TabsList className="grid w-full grid-cols-3 h-auto">
          <TabsTrigger value="pending" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
            Pending Orders
          </TabsTrigger>
          <TabsTrigger value="received" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
            Received Items
          </TabsTrigger>
          <TabsTrigger value="pending-returns" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
            Pending Returns
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
                    placeholder="Search product, code, supplier, type..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 text-gray-800"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {renderInventoryTable(filteredPending, true, 'pending')}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="received">
          <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
                <div className="flex-1">
                  <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold mb-2">
                    Current Inventory Status
                  </CardTitle>
                  <div className="grid grid-cols-3 sm:grid-cols-3 gap-4 text-sm">
                    <div className="bg-white/10 rounded-lg p-3">
                      <div className="font-semibold">Full Cylinders</div>
                      <div className="text-white/80">
                        Total: {getFilteredReceivedItems('full-cylinder').length} | 
                        <span className="text-red-300 ml-1">
                          Out of Stock: {getFilteredReceivedItems('full-cylinder').filter(item => item.quantity === 0).length}
                        </span>
                      </div>
                    </div>
                    <div className="bg-white/10 rounded-lg p-3">
                      <div className="font-semibold">Empty Cylinders</div>
                      <div className="text-white/80">
                        Total: {getFilteredReceivedItems('empty-cylinder').length} | 
                        <span className="text-red-300 ml-1">
                          Out of Stock: {getFilteredReceivedItems('empty-cylinder').filter(item => item.quantity === 0).length}
                        </span>
                      </div>
                    </div>
                    <div className="bg-white/10 rounded-lg p-3">
                      <div className="font-semibold">Gas Products</div>
                      <div className="text-white/80">
                        Total: {getFilteredReceivedItems('gas').length} | 
                        <span className="text-red-300 ml-1">
                          Out of Stock: {getFilteredReceivedItems('gas').filter(item => item.quantity === 0).length}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-2 flex items-center gap-2 w-full lg:w-80">
                  <Input
                    placeholder="Search product, code, supplier, type..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 text-gray-800"
                  />
                </div>
              </div>
            </CardHeader>
            
            {/* Received Inventory Tabs */}
            <Tabs defaultValue="full-cylinder" className="w-full">
              <div className="px-4 sm:px-6 pt-4">
                <TabsList className="grid w-full grid-cols-3 h-auto">
                  <TabsTrigger value="full-cylinder" className="text-xs sm:text-sm font-medium py-2">
                    Full Cylinders
                  </TabsTrigger>
                  <TabsTrigger value="empty-cylinder" className="text-xs sm:text-sm font-medium py-2">
                    Empty Cylinders
                  </TabsTrigger>
                  <TabsTrigger value="gas" className="text-xs sm:text-sm font-medium py-2">
                    Gas
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="full-cylinder">
                <CardContent className="p-0">
                  {renderInventoryTable(getFilteredReceivedItems('full-cylinder'), false, 'full-cylinder')}
                </CardContent>
              </TabsContent>

              <TabsContent value="empty-cylinder">
                <CardContent className="p-0">
                  {renderInventoryTable(getFilteredReceivedItems('empty-cylinder'), false, 'empty-cylinder')}
                </CardContent>
              </TabsContent>

              <TabsContent value="gas">
                <CardContent className="p-0">
                  {renderInventoryTable(getFilteredReceivedItems('gas'), false, 'gas')}
                </CardContent>
              </TabsContent>
            </Tabs>
          </Card>
        </TabsContent>

        <TabsContent value="pending-returns">
          <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold">
                    Pending Returns from Employees ({pendingReturns.length})
                  </CardTitle>
                  <p className="text-white/80 text-sm sm:text-base mt-1">
                    Employee returns awaiting admin approval
                  </p>
                </div>
                <Button
                  onClick={() => {
                    console.log('🔄 [PENDING RETURNS] Manual refresh triggered')
                    fetchPendingReturns()
                  }}
                  variant="outline"
                  size="sm"
                  className="bg-white/10 hover:bg-white/20 text-white border-white/20"
                  title="Refresh pending returns"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="p-0">
              {renderPendingReturnsTable()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Empty Cylinder Selection Dialog for Returns */}
      <Dialog open={showReturnCylinderDialog} onOpenChange={setShowReturnCylinderDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Empty Cylinder</DialogTitle>
            <DialogDescription>
              Choose an empty cylinder to fill with returned {selectedReturn?.productName}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Cylinder Search Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="returnCylinderSearch">Empty Cylinder *</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchReturnEmptyCylinders}
                  className="text-xs"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Refresh
                </Button>
              </div>
              <div className="relative">
                <Input
                  id="returnCylinderSearch"
                  type="text"
                  placeholder="Search for empty cylinder..."
                  value={returnCylinderSearch}
                  onChange={(e) => {
                    setReturnCylinderSearch(e.target.value)
                    setShowReturnCylinderSuggestions(true)
                    setSelectedReturnCylinderId("")
                  }}
                  onFocus={() => setShowReturnCylinderSuggestions(true)}
                  className="w-full"
                />
                
                {/* Cylinder Suggestions Dropdown */}
                {showReturnCylinderSuggestions && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                    {returnEmptyCylinders
                      .filter(cylinder => 
                        cylinder.productName?.toLowerCase().includes(returnCylinderSearch.toLowerCase()) ||
                        cylinder.productCode?.toLowerCase().includes(returnCylinderSearch.toLowerCase())
                      )
                      .map(cylinder => (
                        <div
                          key={cylinder._id}
                          className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                          onClick={() => handleReturnCylinderSelection(cylinder._id, cylinder.productName)}
                        >
                          <div className="font-medium">{cylinder.productName}</div>
                          {cylinder.productCode && (
                            <div className="text-sm text-gray-500 font-mono">{cylinder.productCode}</div>
                          )}
                          <div className="text-sm text-blue-600">
                            Available: {cylinder.availableEmpty} empty cylinders
                          </div>
                        </div>
                      ))
                    }
                    {returnEmptyCylinders.filter(cylinder => 
                      cylinder.productName?.toLowerCase().includes(returnCylinderSearch.toLowerCase()) ||
                      cylinder.productCode?.toLowerCase().includes(returnCylinderSearch.toLowerCase())
                    ).length === 0 && (
                      <div className="px-4 py-3 text-gray-500 text-center">
                        {returnEmptyCylinders.length === 0 ? 'No empty cylinders available' : 'No matching cylinders found'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Selected Return Info */}
            {selectedReturn && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <h4 className="font-medium text-orange-900">Return Details:</h4>
                <p className="text-sm text-orange-700">
                  <strong>Employee:</strong> {selectedReturn.employeeName}
                </p>
                <p className="text-sm text-orange-700">
                  <strong>Product:</strong> {selectedReturn.productName}
                </p>
                <p className="text-sm text-orange-700">
                  <strong>Quantity:</strong> {selectedReturn.quantity} units
                </p>
                <p className="text-sm text-orange-700">
                  <strong>Return Date:</strong> {new Date(selectedReturn.returnDate).toLocaleDateString()}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowReturnCylinderDialog(false)
                  setSelectedReturn(null)
                  setReturnCylinderSearch("")
                  setSelectedReturnCylinderId("")
                  setShowReturnCylinderSuggestions(false)
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleGasReturnAcceptance}
                disabled={!selectedReturnCylinderId || processingItems.has(selectedReturn?.id || "")}
                className="flex-1 bg-[#2B3068] hover:bg-[#1a1f4a] text-white"
              >
                {processingItems.has(selectedReturn?.id || "") ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  'Accept Return & Fill Cylinder'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
