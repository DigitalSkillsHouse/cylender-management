"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Package, Loader2, RefreshCw } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

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
  const [pendingAssignments, setPendingAssignments] = useState<any[]>([])
  const [receivedStock, setReceivedStock] = useState<EmployeeInventoryStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>("")
  const [searchTerm, setSearchTerm] = useState("")
  const [processingItems, setProcessingItems] = useState<Set<string>>(new Set())
  
  // Empty cylinder selection popup state
  const [showCylinderDialog, setShowCylinderDialog] = useState(false)
  const [selectedGasOrder, setSelectedGasOrder] = useState<EmployeeInventoryItem | null>(null)
  const [emptyCylinders, setEmptyCylinders] = useState<EmployeeInventoryStock[]>([])
  const [cylinderSearch, setCylinderSearch] = useState("")
  const [selectedCylinderId, setSelectedCylinderId] = useState("")
  const [showCylinderSuggestions, setShowCylinderSuggestions] = useState(false)
  // Track which full cylinder the employee selects when sending gas back
  const [selectedFullCylinder, setSelectedFullCylinder] = useState<Record<string, string>>({})
  // Track cylinder search terms for each gas item when sending back
  const [cylinderSearchTerms, setCylinderSearchTerms] = useState<Record<string, string>>({})
  // Track whether to show suggestions for each gas item when sending back
  const [showSendBackCylinderSuggestions, setShowSendBackCylinderSuggestions] = useState<Record<string, boolean>>({})
  // Track which pending sub-tab is active (purchase-orders or assignments)
  const [pendingSubTab, setPendingSubTab] = useState<string>("purchase-orders")

  useEffect(() => {
    fetchEmployeeInventoryData()
  }, [])

  // Auto-populate cylinder search for gas items when sending back
  useEffect(() => {
    const gasItems = receivedStock.filter(item => item.category === 'gas' && item.currentStock > 0)
    const updates: Record<string, string> = {}
    gasItems.forEach((item) => {
      if (item.productName && !cylinderSearchTerms[item._id]) {
        // Remove "Gas" prefix (case-insensitive) and add "Cylinder" prefix
        let gasName = item.productName.trim()
        // Remove "Gas" prefix if it exists (case-insensitive)
        if (gasName.toLowerCase().startsWith('gas ')) {
          gasName = gasName.substring(4).trim() // Remove "Gas " prefix
        } else if (gasName.toLowerCase().startsWith('gas')) {
          gasName = gasName.substring(3).trim() // Remove "Gas" prefix (no space)
        }
        // Add "Cylinder" prefix
        const cylinderSearchTerm = `Cylinder ${gasName}`
        updates[item._id] = cylinderSearchTerm
      }
    })
    if (Object.keys(updates).length > 0) {
      setCylinderSearchTerms(prev => ({ ...prev, ...updates }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receivedStock])

  // Listen for stock assignment events
  useEffect(() => {
    const handleStockUpdate = () => {
      console.log('🔄 [EMPLOYEE INVENTORY] Stock update event received, refreshing...')
      setTimeout(() => {
        fetchEmployeeInventoryData()
      }, 1000) // Small delay to ensure database is updated
    }

    window.addEventListener('employeeInventoryUpdated', handleStockUpdate)
    window.addEventListener('stockUpdated', handleStockUpdate)

    return () => {
      window.removeEventListener('employeeInventoryUpdated', handleStockUpdate)
      window.removeEventListener('stockUpdated', handleStockUpdate)
    }
  }, [])

  const fetchEmployeeInventoryData = async () => {
    try {
      setError("")
      setLoading(true)
      
      console.log('🔍 [EMPLOYEE INVENTORY] Starting fetch for employee:', user.id)
      
      // Fetch employee's pending purchase orders
      // Add cache-busting timestamp and headers to ensure fresh data
      const pendingUrl = `/api/employee-inventory-new/pending?employeeId=${user.id}&t=${Date.now()}`
      console.log('📡 [PENDING] Fetching from:', pendingUrl)
      
      const pendingRes = await fetch(pendingUrl, { 
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
      console.log('📡 [PENDING] Response status:', pendingRes.status, pendingRes.ok)
      
      if (!pendingRes.ok) {
        const errorText = await pendingRes.text()
        console.error('📡 [PENDING] Error response:', errorText)
      }
      
      const pendingData = pendingRes.ok ? await pendingRes.json() : { data: [] }
      console.log('📊 [PENDING] Data received:', pendingData)
      console.log('📊 [PENDING] Orders count:', pendingData.data?.length || 0)
      console.log('📊 [PENDING] Individual orders:', pendingData.data)
      
      // Fetch employee's pending assignments from admin
      // Add cache-busting timestamp and headers to ensure fresh data
      const assignmentsUrl = `/api/employee-inventory-new/assignments?employeeId=${user.id}&t=${Date.now()}`
      console.log('📡 [ASSIGNMENTS] Fetching from:', assignmentsUrl)
      
      const assignmentsRes = await fetch(assignmentsUrl, { 
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
      console.log('📡 [ASSIGNMENTS] Response status:', assignmentsRes.status, assignmentsRes.ok)
      
      const assignmentsData = assignmentsRes.ok ? await assignmentsRes.json() : { data: [] }
      console.log('📊 [ASSIGNMENTS] Data received:', assignmentsData)
      
      // Fetch employee's received inventory stock
      // Add cache-busting timestamp and headers to ensure fresh data
      const receivedUrl = `/api/employee-inventory-new/received?employeeId=${user.id}&t=${Date.now()}`
      console.log('📡 [RECEIVED] Fetching from:', receivedUrl)
      
      const receivedRes = await fetch(receivedUrl, { 
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
      console.log('📡 [RECEIVED] Response status:', receivedRes.status, receivedRes.ok)
      
      const receivedData = receivedRes.ok ? await receivedRes.json() : { data: [] }
      console.log('📊 [RECEIVED] Data received:', receivedData)
      
      setPendingOrders(pendingData.data || [])
      setPendingAssignments(assignmentsData.data || [])
      setReceivedStock(receivedData.data || [])
      
      console.log('✅ [EMPLOYEE INVENTORY] Fetch completed successfully')
      
    } catch (error: any) {
      console.error('❌ [EMPLOYEE INVENTORY] Fetch failed:', error)
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
      
      // Find the order to check if it's a gas order
      const order = pendingOrders.find(o => (o.originalOrderId || o.id) === orderId)
      
      // Only show cylinder selection popup for gas orders that DON'T already have an empty cylinder assigned
      // (Employee purchases already have empty cylinders selected, admin assignments don't)
      if (order && order.purchaseType === 'gas' && !order.emptyCylinderId) {
        console.log('🔄 [GAS ORDER] Gas order without cylinder detected, showing cylinder selection popup')
        setSelectedGasOrder(order)
        
        // Fetch employee's empty cylinders
        await fetchEmptyCylinders()
        setShowCylinderDialog(true)
        return
      }
      
      // For non-gas orders or gas orders with cylinders already assigned, proceed with direct acceptance
      await processOrderAcceptance(orderId)
      
    } catch (error: any) {
      console.error('❌ [ACCEPT ORDER] Exception:', error)
      setError(`Failed to accept order: ${error.message}`)
    }
  }

  const processOrderAcceptance = async (orderId: string, emptyCylinderId?: string) => {
    try {
      setProcessingItems(prev => new Set(prev).add(orderId))
      
      console.log('🔄 [ACCEPT ORDER] Starting acceptance for order:', orderId)
      console.log('👤 [ACCEPT ORDER] Employee ID:', user.id)
      
      const requestBody: any = { orderId, employeeId: user.id }
      
      // Add empty cylinder ID if provided (for gas orders)
      if (emptyCylinderId) {
        requestBody.emptyCylinderId = emptyCylinderId
        console.log('🔗 [ACCEPT ORDER] Including empty cylinder:', emptyCylinderId)
      }
      
      console.log('📤 [ACCEPT ORDER] Request body:', requestBody)
      
      const response = await fetch(`/api/employee-inventory-new/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
      
      console.log('📡 [ACCEPT ORDER] Response status:', response.status, response.ok)
      
      if (response.ok) {
        const responseData = await response.json()
        console.log('✅ [ACCEPT ORDER] Success response:', responseData)
        await fetchEmployeeInventoryData() // Refresh data
        
        // Close dialog if it was a gas order
        if (showCylinderDialog) {
          setShowCylinderDialog(false)
          setSelectedGasOrder(null)
          setCylinderSearch("")
          setSelectedCylinderId("")
        }
      } else {
        const errorData = await response.json()
        console.error('❌ [ACCEPT ORDER] Error response:', errorData)
        setError(errorData.error || 'Failed to accept order')
      }
      
    } catch (error: any) {
      console.error('❌ [ACCEPT ORDER] Exception:', error)
      setError(`Failed to accept order: ${error.message}`)
    } finally {
      setProcessingItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(orderId)
        return newSet
      })
    }
  }

  // Fetch employee's empty cylinders for selection
  const fetchEmptyCylinders = async () => {
    try {
      console.log('🔍 [EMPTY CYLINDERS] Fetching employee empty cylinders')
      
      // First try to use already loaded receivedStock data
      const emptyCylinderStock = receivedStock.filter((item: EmployeeInventoryStock) => 
        item.category === 'cylinder' && item.availableEmpty > 0
      )
      
      if (emptyCylinderStock.length > 0) {
        console.log('✅ [EMPTY CYLINDERS] Using already loaded data:', emptyCylinderStock)
        setEmptyCylinders(emptyCylinderStock)
        return
      }
      
      // If no data in receivedStock, fetch fresh data
      console.log('🔄 [EMPTY CYLINDERS] No empty cylinders in loaded data, fetching fresh...')
      const response = await fetch(`/api/employee-inventory-new/received?employeeId=${user.id}`)
      
      if (response.ok) {
        const data = await response.json()
        console.log('📋 [EMPTY CYLINDERS] Fresh data received:', data)
        
        // Filter for empty cylinders from the received stock
        const freshEmptyCylinderStock = data.receivedStock?.filter((item: EmployeeInventoryStock) => 
          item.category === 'cylinder' && item.availableEmpty > 0
        ) || []
        
        setEmptyCylinders(freshEmptyCylinderStock)
        console.log('✅ [EMPTY CYLINDERS] Fresh empty cylinders:', freshEmptyCylinderStock)
        console.log('🔍 [EMPTY CYLINDERS] Available empty cylinders count:', freshEmptyCylinderStock.length)
      } else {
        console.error('❌ [EMPTY CYLINDERS] Failed to fetch empty cylinders, status:', response.status)
        const errorData = await response.json()
        console.error('❌ [EMPTY CYLINDERS] Error data:', errorData)
        setEmptyCylinders([])
      }
    } catch (error) {
      console.error('❌ [EMPTY CYLINDERS] Error fetching empty cylinders:', error)
      setEmptyCylinders([])
    }
  }

  // Handle cylinder selection
  const handleCylinderSelection = (cylinderId: string, cylinderName: string) => {
    setSelectedCylinderId(cylinderId)
    setCylinderSearch(cylinderName)
    setShowCylinderSuggestions(false)
  }

  // Handle gas order/assignment acceptance with cylinder selection
  const handleGasOrderAcceptance = async () => {
    if (!selectedGasOrder || !selectedCylinderId) {
      setError("Please select an empty cylinder")
      return
    }
    
    const orderId = selectedGasOrder.originalOrderId || selectedGasOrder.id
    
    // Check if this is an assignment (from admin) or a purchase order (from employee)
    const isAssignment = pendingAssignments.some(a => a.assignmentId === orderId)
    
    if (isAssignment) {
      await processAssignmentAcceptance(orderId, selectedCylinderId)
    } else {
      await processOrderAcceptance(orderId, selectedCylinderId)
    }
  }

  // Handle sending items back to admin
  const handleSendBack = async (itemId: string, stockType: string) => {
    try {
      setError("")
      
      // Get quantity from input field
      const quantityInput = document.getElementById(`quantity-${itemId}`) as HTMLInputElement
      const quantity = parseInt(quantityInput?.value || '0')
      
      if (!quantity || quantity <= 0) {
        setError("Please enter a valid quantity")
        return
      }
      
      // Find the item to validate quantity
      const item = receivedStock.find(stock => stock._id === itemId)
      if (!item) {
        setError("Item not found")
        return
      }
      
      const availableQuantity = stockType === 'gas' ? item.currentStock : item.availableEmpty
      if (quantity > availableQuantity) {
        setError(`Cannot send more than available quantity (${availableQuantity})`)
        return
      }

      // For gas returns, a full cylinder must be chosen so we can convert it to empty
      let selectedCylinderProductId = ""
      if (stockType === 'gas') {
        selectedCylinderProductId = selectedFullCylinder[itemId] || ""
        if (!selectedCylinderProductId) {
          setError("Please select the full cylinder used for this gas")
          return
        }

        const cylinderStock = receivedStock.find(rs => rs.category === 'cylinder' && rs.productId === selectedCylinderProductId)
        if (!cylinderStock) {
          setError("Selected cylinder not found in your inventory")
          return
        }
        if (quantity > (cylinderStock.availableFull || 0)) {
          setError(`Not enough full cylinders available. Available: ${cylinderStock.availableFull || 0}`)
          return
        }
      }
      
      console.log('🔄 [SEND BACK] Sending back to admin:', {
        itemId,
        stockType,
        quantity,
        employeeId: user.id,
        cylinderProductId: selectedCylinderProductId || undefined
      })
      
      const response = await fetch('/api/employee-inventory-new/send-back', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          stockType,
          quantity,
          employeeId: user.id,
          cylinderProductId: selectedCylinderProductId || undefined
        })
      })
      
      if (response.ok) {
        const responseData = await response.json()
        console.log('✅ [SEND BACK] Success:', responseData)
        
        // Clear the input field
        if (quantityInput) quantityInput.value = ''
        
        // Trigger stock update event to refresh other components (this will cause DSR pages to refetch)
        // Note: We don't clear localStorage here to preserve offline/fallback functionality
        // The cache-busting on API calls ensures fresh data is fetched
        localStorage.setItem('stockUpdated', Date.now().toString())
        window.dispatchEvent(new Event('stockUpdated'))
        window.dispatchEvent(new Event('employeeInventoryUpdated'))
        // Trigger notification refresh (event-driven, no polling needed)
        window.dispatchEvent(new Event('notification-refresh'))
        // Trigger specific pending returns refresh for admin pages
        window.dispatchEvent(new Event('pendingReturnsRefresh'))
        
        // Refresh inventory data
        await fetchEmployeeInventoryData()
        
        // Show success message (you could add a toast notification here)
        setError("")
      } else {
        const errorData = await response.json()
        console.error('❌ [SEND BACK] Error:', errorData)
        setError(errorData.error || 'Failed to send back to admin')
      }
      
    } catch (error: any) {
      console.error('❌ [SEND BACK] Exception:', error)
      setError(`Failed to send back: ${error.message}`)
    }
  }

  // Handle accepting assignment from admin
  const handleAcceptAssignment = async (assignmentId: string) => {
    try {
      setError("")
      
      // Find the assignment to check if it's a gas assignment
      const assignment = pendingAssignments.find(a => a.assignmentId === assignmentId)
      
      // If it's a gas assignment from admin, show cylinder selection popup
      if (assignment && assignment.category === 'gas') {
        console.log('🔄 [GAS ASSIGNMENT] Gas assignment from admin detected, showing cylinder selection popup')
        
        // Convert assignment to order format for the popup
        const gasOrder = {
          id: assignmentId,
          originalOrderId: assignmentId,
          productName: assignment.productName,
          quantity: assignment.quantity,
          purchaseType: 'gas' as const,
          unitPrice: 0,
          totalAmount: 0,
          poNumber: '',
          supplierName: 'Admin Assignment',
          purchaseDate: assignment.assignedDate,
          status: 'pending' as const,
          emptyCylinderId: undefined // No cylinder assigned yet
        }
        
        setSelectedGasOrder(gasOrder)
        
        // Fetch employee's empty cylinders
        await fetchEmptyCylinders()
        setShowCylinderDialog(true)
        return
      }
      
      // For non-gas assignments, proceed with direct acceptance
      await processAssignmentAcceptance(assignmentId)
      
    } catch (error: any) {
      console.error('❌ [ACCEPT ASSIGNMENT] Exception:', error)
      setError(`Failed to accept assignment: ${error.message}`)
    }
  }

  // Process assignment acceptance (separated for reuse)
  const processAssignmentAcceptance = async (assignmentId: string, emptyCylinderId?: string) => {
    try {
      setProcessingItems(prev => new Set(prev).add(assignmentId))
      
      console.log('🔄 [ACCEPT ASSIGNMENT] Starting acceptance for assignment:', assignmentId)
      console.log('👤 [ACCEPT ASSIGNMENT] Employee ID:', user.id)
      
      const requestBody: any = { 
        status: 'received', // Change from assigned to received
        createEmployeeInventory: true,
        employeeId: user.id
      }
      
      // Add empty cylinder ID if provided (for gas assignments)
      if (emptyCylinderId) {
        requestBody.emptyCylinderId = emptyCylinderId
        console.log('🔗 [ACCEPT ASSIGNMENT] Including empty cylinder:', emptyCylinderId)
      }
      
      const response = await fetch(`/api/stock-assignments/${assignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
      
      console.log('📡 [ACCEPT ASSIGNMENT] Response status:', response.status, response.ok)
      
      if (response.ok) {
        const responseData = await response.json()
        console.log('✅ [ACCEPT ASSIGNMENT] Success response:', responseData)
        
        // Refresh both assignments and inventory data
        await fetchEmployeeInventoryData()
        
        // Close dialog if it was a gas assignment
        if (showCylinderDialog) {
          setShowCylinderDialog(false)
          setSelectedGasOrder(null)
          setCylinderSearch("")
          setSelectedCylinderId("")
        }
        
        setError("")
      } else {
        const errorData = await response.json()
        console.error('❌ [ACCEPT ASSIGNMENT] Error response:', errorData)
        setError(errorData.error || 'Failed to accept assignment')
      }
      
    } catch (error: any) {
      console.error('❌ [ACCEPT ASSIGNMENT] Exception:', error)
      setError(`Failed to accept assignment: ${error.message}`)
    } finally {
      setProcessingItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(assignmentId)
        return newSet
      })
    }
  }

  // Filter functions for received inventory tabs - Show ALL items including 0 stock like admin
  const getGasStock = () => {
    const gasItems = receivedStock.filter(item => 
      item.category === 'gas'
    ).sort((a, b) => a.currentStock - b.currentStock) // Sort by quantity (0 stock first)
    console.log('🔍 [GAS FILTER] Gas items (including 0 stock):', gasItems)
    return gasItems
  }
  
  const getFullCylinderStock = () => {
    const fullItems = receivedStock.filter(item => 
      item.category === 'cylinder'
    ).sort((a, b) => a.availableFull - b.availableFull) // Sort by quantity (0 stock first)
    console.log('🔍 [FULL FILTER] Full cylinder items (including 0 stock):', fullItems)
    return fullItems
  }
  
  const getEmptyCylinderStock = () => {
    const emptyItems = receivedStock.filter(item => 
      item.category === 'cylinder'
    ).sort((a, b) => a.availableEmpty - b.availableEmpty) // Sort by quantity (0 stock first)
    console.log('🔍 [EMPTY FILTER] Empty cylinder items (including 0 stock):', emptyItems)
    console.log('🔍 [EMPTY FILTER] All received stock:', receivedStock.map(item => ({
      category: item.category,
      currentStock: item.currentStock,
      availableFull: item.availableFull,
      availableEmpty: item.availableEmpty,
      productName: item.productName
    })))
    return emptyItems
  }

  // Search filtering
  const filteredPendingOrders = searchTerm 
    ? pendingOrders.filter(item => 
        item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.productCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.purchaseType.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : pendingOrders

  const renderPendingOrdersTable = (items: EmployeeInventoryItem[]) => (
    <div className="w-full overflow-x-auto">
      <Table className="w-full">
        <TableHeader>
          <TableRow className="bg-gray-50 border-b-2 border-gray-200">
            <TableHead className="font-bold text-gray-700 p-4">Product</TableHead>
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
              <TableCell colSpan={6} className="text-center text-gray-500 py-12">
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

  const renderPendingAssignmentsTable = (items: any[]) => (
    <div className="w-full overflow-x-auto">
      <Table className="w-full">
        <TableHeader>
          <TableRow className="bg-gray-50 border-b-2 border-gray-200">
            <TableHead className="font-bold text-gray-700 p-4">Product</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Code</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Category</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Assigned By</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Quantity</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Date</TableHead>
            <TableHead className="font-bold text-gray-700 p-4">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} className="hover:bg-gray-50 transition-colors border-b border-gray-100">
              <TableCell className="p-4">
                <div className="font-medium">{item.productName}</div>
                {item.notes && (
                  <div className="text-sm text-gray-500 mt-1">{item.notes}</div>
                )}
              </TableCell>
              <TableCell className="p-4 font-mono text-sm">
                {item.productCode || 'N/A'}
              </TableCell>
              <TableCell className="p-4">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  {item.displayCategory || item.category}
                </Badge>
              </TableCell>
              <TableCell className="p-4 text-sm">
                {item.assignedBy}
              </TableCell>
              <TableCell className="p-4 font-bold text-lg text-blue-600">
                {item.quantity}
              </TableCell>
              <TableCell className="p-4 text-sm text-gray-600">
                {new Date(item.assignedDate).toLocaleDateString()}
              </TableCell>
              <TableCell className="p-4">
                <Button
                  onClick={() => handleAcceptAssignment(item.assignmentId)}
                  disabled={processingItems.has(item.assignmentId)}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm"
                >
                  {processingItems.has(item.assignmentId) ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Accepting...
                    </>
                  ) : (
                    'Accept Assignment'
                  )}
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-gray-500 py-12">
                <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No pending assignments</p>
                <p className="text-sm">You have no stock assignments from admin</p>
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
                  <span className={availableQuantity === 0 ? 'text-red-600' : availableQuantity < 10 ? 'text-yellow-600' : 'text-green-600'}>
                    {availableQuantity}
                    {availableQuantity === 0 && <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-1 rounded">OUT OF STOCK</span>}
                    {availableQuantity > 0 && availableQuantity < 10 && <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">LOW STOCK</span>}
                  </span>
                </TableCell>
                <TableCell className="p-4 text-sm text-gray-600">
                  {new Date(item.updatedAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            )
          })}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-gray-500 py-12">
                <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No {stockType} products</p>
                <p className="text-sm">You have no {stockType} products assigned</p>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )

  const renderSendBackTable = (items: EmployeeInventoryStock[], stockType: string) => {
    const fullCylinderOptions = getFullCylinderStock().filter(item => item.availableFull > 0)

    return (
      <div className="w-full overflow-x-auto">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="bg-gray-50 border-b-2 border-gray-200">
              <TableHead className="font-bold text-gray-700 p-4">Product</TableHead>
              <TableHead className="font-bold text-gray-700 p-4">Code</TableHead>
              <TableHead className="font-bold text-gray-700 p-4">Available Stock</TableHead>
              {stockType === 'gas' && (
                <TableHead className="font-bold text-gray-700 p-4">Full Cylinder Used</TableHead>
              )}
              <TableHead className="font-bold text-gray-700 p-4">Quantity to Send</TableHead>
              <TableHead className="font-bold text-gray-700 p-4">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              let availableQuantity = 0
              if (stockType === 'gas') availableQuantity = item.currentStock
              else if (stockType === 'empty') availableQuantity = item.availableEmpty
              
              return (
                <TableRow key={item._id} className="hover:bg-gray-50 transition-colors border-b border-gray-100">
                  <TableCell className="p-4">
                    <div className="font-medium">{item.productName}</div>
                  </TableCell>
                  <TableCell className="p-4 font-mono text-sm">
                    {item.productCode || 'N/A'}
                  </TableCell>
                  <TableCell className="p-4 font-bold text-lg">
                    {availableQuantity}
                  </TableCell>

                  {stockType === 'gas' && (
                    <TableCell className="p-4">
                      <div className="relative">
                        <Input
                          type="text"
                          placeholder="Search full cylinder..."
                          value={cylinderSearchTerms[item._id] || ""}
                          onChange={(e) => {
                            const searchTerm = e.target.value
                            setCylinderSearchTerms(prev => ({ ...prev, [item._id]: searchTerm }))
                            setShowSendBackCylinderSuggestions(prev => ({ ...prev, [item._id]: true }))
                            setSelectedFullCylinder(prev => ({ ...prev, [item._id]: "" }))
                          }}
                          onFocus={() => setShowSendBackCylinderSuggestions(prev => ({ ...prev, [item._id]: true }))}
                          onBlur={() => setTimeout(() => setShowSendBackCylinderSuggestions(prev => ({ ...prev, [item._id]: false })), 200)}
                          className="w-full border border-gray-200 rounded-md px-2 py-2 text-sm"
                        />
                        {showSendBackCylinderSuggestions[item._id] && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                            {fullCylinderOptions
                              .filter(cyl => {
                                const searchTerm = (cylinderSearchTerms[item._id] || "").toLowerCase()
                                return searchTerm.trim().length === 0 || 
                                  cyl.productName.toLowerCase().includes(searchTerm)
                              })
                              .map(cyl => (
                                <div
                                  key={cyl.productId}
                                  className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setSelectedFullCylinder(prev => ({ ...prev, [item._id]: cyl.productId }))
                                    setCylinderSearchTerms(prev => ({ ...prev, [item._id]: cyl.productName }))
                                    setShowSendBackCylinderSuggestions(prev => ({ ...prev, [item._id]: false }))
                                  }}
                                >
                                  <div className="font-medium text-gray-900">{cyl.productName}</div>
                                  <div className="text-xs text-gray-500">Available: {cyl.availableFull} full</div>
                                </div>
                              ))}
                            {fullCylinderOptions.filter(cyl => {
                              const searchTerm = (cylinderSearchTerms[item._id] || "").toLowerCase()
                              return searchTerm.trim().length === 0 || 
                                cyl.productName.toLowerCase().includes(searchTerm)
                            }).length === 0 && (
                              <div className="px-4 py-3 text-gray-500 text-center text-sm">
                                No matching cylinders found
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  )}

                  <TableCell className="p-4">
                    <Input
                      type="number"
                      min="1"
                      max={availableQuantity}
                      placeholder="0"
                      className="w-20"
                      id={`quantity-${item._id}`}
                    />
                  </TableCell>
                  <TableCell className="p-4">
                    <Button
                      size="sm"
                      onClick={() => handleSendBack(item._id, stockType)}
                      className="bg-red-600 hover:bg-red-700 text-white"
                      disabled={availableQuantity === 0}
                    >
                      Send Back
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={stockType === 'gas' ? 6 : 5} className="text-center text-gray-500 py-12">
                  <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No {stockType} stock available</p>
                  <p className="text-sm">You have no {stockType} stock to send back</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    )
  }

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
    <div className="pt-5 lg:pt-0 space-y-4 sm:space-y-6">
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
        <TabsList className="grid w-full grid-cols-3 h-auto">
          <TabsTrigger value="pending" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
            Pending ({filteredPendingOrders.length + pendingAssignments.length})
          </TabsTrigger>
          <TabsTrigger value="received" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
            My Stock ({receivedStock.length})
          </TabsTrigger>
          <TabsTrigger value="send-back" className="text-xs sm:text-sm font-medium py-2 sm:py-3">
            Send back to Admin
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
                <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold flex-1">
                  Pending Items ({filteredPendingOrders.length + pendingAssignments.length})
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
            
            {/* Pending Sub-tabs */}
            <Tabs value={pendingSubTab} onValueChange={setPendingSubTab} className="w-full">
              <div className="px-4 sm:px-6 pt-4">
                <TabsList className="grid w-full grid-cols-2 h-auto">
                  <TabsTrigger value="purchase-orders" className="text-xs sm:text-sm font-medium py-2">
                    Pending Purchase
                  </TabsTrigger>
                  <TabsTrigger value="assignments" className="text-xs sm:text-sm font-medium py-2">
                    Pending Assignments
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="purchase-orders">
                <CardContent className="p-0">
                  {renderPendingOrdersTable(filteredPendingOrders)}
                </CardContent>
              </TabsContent>

              <TabsContent value="assignments">
                <CardContent className="p-0">
                  {renderPendingAssignmentsTable(pendingAssignments)}
                </CardContent>
              </TabsContent>
            </Tabs>
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
                  <div className="grid grid-cols-3 sm:grid-cols-3 gap-2 text-sm">
                    <div className="bg-white/10 rounded-lg p-3">
                      <div className="font-semibold">Full Cylinders</div>
                      <div className="text-white/80">
                        Total: {getFullCylinderStock().length} | 
                        <span className="text-red-300 ml-1">
                          Out of Stock: {getFullCylinderStock().filter(item => item.availableFull === 0).length}
                        </span>
                      </div>
                    </div>
                    <div className="bg-white/10 rounded-lg p-3">
                      <div className="font-semibold">Empty Cylinders</div>
                      <div className="text-white/80">
                        Total: {getEmptyCylinderStock().length} | 
                        <span className="text-red-300 ml-1">
                          Out of Stock: {getEmptyCylinderStock().filter(item => item.availableEmpty === 0).length}
                        </span>
                      </div>
                    </div>
                    <div className="bg-white/10 rounded-lg p-3">
                      <div className="font-semibold">Gas Products</div>
                      <div className="text-white/80">
                        Total: {getGasStock().length} | 
                        <span className="text-red-300 ml-1">
                          Out of Stock: {getGasStock().filter(item => item.currentStock === 0).length}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            
            {/* Received Inventory Tabs */}
            <Tabs defaultValue="gas" className="w-full">
              <div className="px-4 sm:px-6 pt-4">
                <TabsList className="grid w-full grid-cols-3 h-auto">
                  <TabsTrigger value="gas" className="text-xs sm:text-sm font-medium py-2">
                    Gas Stock
                  </TabsTrigger>
                  <TabsTrigger value="full-cylinder" className="text-xs sm:text-sm font-medium py-2">
                    Full Cylinders
                  </TabsTrigger>
                  <TabsTrigger value="empty-cylinder" className="text-xs sm:text-sm font-medium py-2">
                    Empty Cylinders
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

        <TabsContent value="send-back">
          <Card className="border-0 shadow-xl rounded-xl sm:rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
              <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold">
                Send back to Admin
              </CardTitle>
              <p className="text-white/80 text-sm sm:text-base">
                Return gas or empty cylinders to admin inventory
              </p>
            </CardHeader>
            
            <CardContent className="p-4 sm:p-6">
              <Tabs defaultValue="send-gas" className="w-full">
                <TabsList className="grid w-full grid-cols-2 h-auto mb-6">
                  <TabsTrigger value="send-gas" className="text-xs sm:text-sm font-medium py-2">
                    Send Gas
                  </TabsTrigger>
                  <TabsTrigger value="send-empty" className="text-xs sm:text-sm font-medium py-2">
                    Send Empty Cylinders
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="send-gas">
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h3 className="font-medium text-blue-900 mb-2">Send Gas to Admin</h3>
                      <p className="text-sm text-blue-700">
                        Select gas items from your inventory to send back to admin
                      </p>
                    </div>
                    {renderSendBackTable(getGasStock(), 'gas')}
                  </div>
                </TabsContent>

                <TabsContent value="send-empty">
                  <div className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h3 className="font-medium text-green-900 mb-2">Send Empty Cylinders to Admin</h3>
                      <p className="text-sm text-green-700">
                        Select empty cylinders from your inventory to send back to admin
                      </p>
                    </div>
                    {renderSendBackTable(getEmptyCylinderStock(), 'empty')}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Empty Cylinder Selection Dialog */}
      <Dialog open={showCylinderDialog} onOpenChange={setShowCylinderDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Empty Cylinder</DialogTitle>
            <DialogDescription>
              Choose an empty cylinder to fill with {selectedGasOrder?.productName}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Cylinder Search Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="cylinderSearch">Empty Cylinder *</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchEmptyCylinders}
                  className="text-xs"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Refresh
                </Button>
              </div>
              <div className="relative">
                <Input
                  id="cylinderSearch"
                  type="text"
                  placeholder="Search for empty cylinder..."
                  value={cylinderSearch}
                  onChange={(e) => {
                    setCylinderSearch(e.target.value)
                    setShowCylinderSuggestions(true)
                    setSelectedCylinderId("")
                  }}
                  onFocus={() => setShowCylinderSuggestions(true)}
                  className="w-full"
                />
                
                {/* Cylinder Suggestions Dropdown */}
                {showCylinderSuggestions && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                    {emptyCylinders
                      .filter(cylinder => 
                        cylinder.productName.toLowerCase().includes(cylinderSearch.toLowerCase()) ||
                        cylinder.productCode?.toLowerCase().includes(cylinderSearch.toLowerCase())
                      )
                      .map(cylinder => (
                        <div
                          key={cylinder._id}
                          className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                          onClick={() => handleCylinderSelection(cylinder._id, cylinder.productName)}
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
                    {emptyCylinders.filter(cylinder => 
                      cylinder.productName.toLowerCase().includes(cylinderSearch.toLowerCase()) ||
                      cylinder.productCode?.toLowerCase().includes(cylinderSearch.toLowerCase())
                    ).length === 0 && (
                      <div className="px-4 py-3 text-gray-500 text-center">
                        {emptyCylinders.length === 0 ? (
                          <div>
                            <div>No empty cylinders available</div>
                            <div className="text-xs mt-1">
                              Debug: Total received stock: {receivedStock.length}, 
                              Cylinders: {receivedStock.filter(item => item.category === 'cylinder').length},
                              Empty: {receivedStock.filter(item => item.category === 'cylinder' && item.availableEmpty > 0).length}
                            </div>
                          </div>
                        ) : 'No matching cylinders found'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Selected Gas Order Info */}
            {selectedGasOrder && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <h4 className="font-medium text-blue-900">Gas Order Details:</h4>
                <p className="text-sm text-blue-700">
                  <strong>Product:</strong> {selectedGasOrder.productName}
                </p>
                <p className="text-sm text-blue-700">
                  <strong>Quantity:</strong> {selectedGasOrder.quantity} units
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCylinderDialog(false)
                  setSelectedGasOrder(null)
                  setCylinderSearch("")
                  setSelectedCylinderId("")
                  setShowCylinderSuggestions(false)
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleGasOrderAcceptance}
                disabled={!selectedCylinderId || processingItems.has(selectedGasOrder?.originalOrderId || selectedGasOrder?.id || "")}
                className="flex-1 bg-[#2B3068] hover:bg-[#1a1f4a] text-white"
              >
                {processingItems.has(selectedGasOrder?.originalOrderId || selectedGasOrder?.id || "") ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  'Accept & Fill Cylinder'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
