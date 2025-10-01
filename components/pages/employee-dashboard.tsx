"use client"

import { useState, useEffect } from "react"
import { useNotifications } from "@/hooks/useNotifications"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Package, AlertCircle, CheckCircle, Bell } from "lucide-react"
import { stockAPI, notificationsAPI } from "@/lib/api"

interface EmployeeDashboardProps {
  user: { id: string; email: string; name: string; debitAmount?: number; creditAmount?: number }
  setUnreadCount?: (count: number) => void
}

export function EmployeeDashboard({ user, setUnreadCount }: EmployeeDashboardProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [assignedStock, setAssignedStock] = useState<any[]>([])
  const [pendingInventory, setPendingInventory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<{ message: string; visible: boolean }>({ message: "", visible: false })
  
  // Use optimized notifications hook with 60-second polling
  const { 
    notifications, 
    unreadCount,
    markAsRead 
  } = useNotifications({
    userId: user.id,
    types: ['stock_assignment'],
    unreadOnly: true,
    pollInterval: 60000 // Poll every 60 seconds instead of 5
  })
  const [salesData, setSalesData] = useState<any[]>([])
  const [cylinderTxns, setCylinderTxns] = useState<any[]>([])
  const [totalDebit, setTotalDebit] = useState(0)
  const [totalCredit, setTotalCredit] = useState(0)

  useEffect(() => {
    if (user?.id) {
      fetchEmployeeData()
      // Note: Notifications are now handled by the useNotifications hook
    }
  }, [user?.id])

  // Debug effect to monitor state changes
  useEffect(() => {
    console.log('State updated - Debit:', totalDebit, 'Credit:', totalCredit)
  }, [totalDebit, totalCredit])

  const fetchEmployeeData = async () => {
    try {
      const [stockResponse, notificationsResponse, salesResponse, empCylResponse, empPurchaseResponse] = await Promise.all([
        stockAPI.getAll(),
        notificationsAPI.getAll(user.id),
        fetch(`/api/employee-sales?employeeId=${user.id}`),
        fetch(`/api/employee-cylinders?employeeId=${user.id}`),
        fetch(`/api/employee-purchase-orders?me=true`),
      ])

      // Filter stock assignments for current employee
      const stockData = Array.isArray(stockResponse.data) ? stockResponse.data : (stockResponse.data?.data || []);
      const employeeStock = stockData.filter((stock: any) => stock.employee?._id === user.id)
      setAssignedStock(employeeStock)
      // Notifications are now handled by useNotifications hook
      if (setUnreadCount) setUnreadCount(unreadCount)

      // Fetch and process sales data
      const salesData = await salesResponse.json()
      const cylData = await empCylResponse.json()
      const purchaseData = await empPurchaseResponse.json()
      
      // API returns sales directly as an array, not wrapped in data property
      const salesArray = Array.isArray(salesData) ? salesData : []
      
      setSalesData(salesArray)
      setCylinderTxns(Array.isArray(cylData?.data) ? cylData.data : Array.isArray(cylData) ? cylData : [])
      
      // Process employee purchase orders to find approved items pending for employee
      const purchaseArray = Array.isArray(purchaseData?.data) ? purchaseData.data : Array.isArray(purchaseData) ? purchaseData : []
      const approvedPurchases = purchaseArray.filter((purchase: any) => {
        const employeeId = purchase.employee?._id || purchase.employee
        const isApproved = purchase.inventoryStatus === "approved"
        const isCurrentEmployee = employeeId === user.id
        
        console.log("Purchase filter debug:", {
          purchaseId: purchase._id,
          inventoryStatus: purchase.inventoryStatus,
          employeeId: employeeId,
          currentUserId: user.id,
          isApproved,
          isCurrentEmployee,
          shouldInclude: isApproved && isCurrentEmployee
        })
        
        return isApproved && isCurrentEmployee
      })
      
      console.log("Approved purchases for employee:", approvedPurchases.length, approvedPurchases)
      setPendingInventory(approvedPurchases)
      
      // Calculate Debit (Total Amount) and Credit (Received Amount)
      const debit = salesArray.reduce((sum: number, sale: any) => sum + (sale.totalAmount || 0), 0)
      const credit = salesArray.reduce((sum: number, sale: any) => sum + (sale.receivedAmount || 0), 0)
      
      setTotalDebit(debit)
      setTotalCredit(credit)
      
    } catch (error) {
      console.error("Failed to fetch employee data:", error)
      setAssignedStock([])
      setPendingInventory([])
      // Notifications handled by useNotifications hook
      setSalesData([])
      setCylinderTxns([])
      setTotalDebit(0)
      setTotalCredit(0)
      if (setUnreadCount) setUnreadCount(0)
    } finally {
      setLoading(false)
    }
  }

  const handleReceiveInventory = async (purchaseOrderId: string) => {
    try {
      // Call the inventory API to mark as received (itemIndex 0 for employee orders)
      const response = await fetch(`/api/inventory/item/${purchaseOrderId}/0`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'received' })
      })
      
      const result = await response.json()
      
      if (result.success) {
        // Refresh the employee data to update the pending inventory
        await fetchEmployeeData()
        
        // Show success notification
        setNotification({ 
          message: "Inventory item received successfully!", 
          visible: true 
        })
        setTimeout(() => setNotification({ message: "", visible: false }), 3000)
      } else {
        console.error("Failed to receive inventory:", result.error)
        setNotification({ 
          message: `Failed to receive inventory: ${result.error}`, 
          visible: true 
        })
        setTimeout(() => setNotification({ message: "", visible: false }), 5000)
      }
    } catch (error) {
      console.error("Error receiving inventory:", error)
      setNotification({ 
        message: "Error receiving inventory. Please try again.", 
        visible: true 
      })
      setTimeout(() => setNotification({ message: "", visible: false }), 5000)
    }
  }

  // Notification checking replaced by useNotifications hook

  const showNotification = (message: string) => {
    setNotification({ message, visible: true })
    setTimeout(() => {
      setNotification({ message: "", visible: false })
    }, 5000)
  }

  const handleReceiveStock = async (assignmentId: string) => {
    try {
      await stockAPI.receive(assignmentId)
      fetchEmployeeData() // Refresh data
    } catch (error) {
      console.error("Failed to receive stock:", error)
    }
  }

  const handleRejectStock = async (assignmentId: string) => {
    try {
      await stockAPI.reject(assignmentId)
      await fetchEmployeeData()
    } catch (error) {
      console.error("Failed to reject stock:", error)
      alert('Failed to reject stock. Please try again.')
    }
  }

  const handleReturnStock = async (assignmentId: string) => {
    try {
      await stockAPI.returnStock(assignmentId);
      // Refresh data immediately to ensure UI updates
      await fetchEmployeeData();
      console.log('Stock returned successfully');
    } catch (error) {
      console.error("Failed to return stock:", error);
      alert('Failed to return stock. Please try again.');
    }
  };

  const pendingStock = assignedStock.filter((stock: any) => stock.status === "assigned")
  const receivedStock = assignedStock.filter((stock: any) => stock.status === "received")
  const returnedStock = assignedStock.filter((stock: any) => stock.status === "returned")

  // Helpers to compute employee usage per product - defined before use
  const usageByProductFromGas = (productId: string) => {
    try {
      return salesData.reduce((sum: number, sale: any) => {
        const items = Array.isArray(sale.items) ? sale.items : []
        const used = items.reduce((s: number, it: any) => {
          const isGas = it?.product?.category === 'gas'
          const matches = it?.product?._id === productId
          return s + (isGas && matches ? (Number(it.quantity) || 0) : 0)
        }, 0)
        return sum + used
      }, 0)
    } catch {
      return 0
    }
  }

  const usageByProductFromCylinders = (productId: string, size?: string) => {
    try {
      return cylinderTxns.reduce((sum: number, t: any) => {
        if (t?.product?._id !== productId) return sum
        if (size && t?.cylinderSize && t.cylinderSize !== size) return sum
        // Decrease for deposits (given out), increase back for returns
        if (t.type === 'deposit') return sum + (Number(t.quantity) || 0)
        if (t.type === 'return') return sum - (Number(t.quantity) || 0)
        return sum
      }, 0)
    } catch {
      return 0
    }
  }

  const usageByProductFromCylinderSales = (productId: string, size?: string) => {
    try {
      return salesData.reduce((sum: number, sale: any) => {
        const items = Array.isArray(sale.items) ? sale.items : []
        const used = items.reduce((s: number, it: any) => {
          const isCylinder = it?.product?.category === 'cylinder'
          const matchesProduct = it?.product?._id === productId
          const matchesSize = size ? (it?.product?.cylinderType ? it.product.cylinderType === size : true) : true
          return s + (isCylinder && matchesProduct && matchesSize ? (Number(it.quantity) || 0) : 0)
        }, 0)
        return sum + used
      }, 0)
    } catch {
      return 0
    }
  }

  // Define getAvailableForStock function after helper functions
  const getAvailableForStock = (stock: any) => {
    const baseQty = Number(stock.quantity) || 0
    const productId = stock.product?._id
    if (!productId) return baseQty
    const category = stock.product?.category
    if (category === 'gas') {
      const used = usageByProductFromGas(productId)
      const remaining = baseQty - used
      return remaining < 0 ? 0 : remaining
    }
    if (category === 'cylinder') {
      const size = stock.cylinderSize
      const usedTxns = usageByProductFromCylinders(productId, size)
      const usedSales = usageByProductFromCylinderSales(productId, size)
      const netUsed = usedTxns + usedSales
      const remaining = baseQty - netUsed
      return remaining < 0 ? 0 : remaining
    }
    return baseQty
  }

  // Filtering logic for category
  const pendingStockFiltered = categoryFilter ? pendingStock.filter((stock: any) => stock.product?.category === categoryFilter) : pendingStock;
  const receivedStockFiltered = categoryFilter ? receivedStock.filter((stock: any) => stock.product?.category === categoryFilter) : receivedStock;
  
  // Group received stock by product name and product code
  const groupedReceivedStock = receivedStockFiltered.reduce((groups: any, stock: any) => {
    const productName = stock.product?.name || "Unknown Product"
    const productCode = stock.product?.productCode || stock.product?.code || 'N/A'
    const key = `${productName}-${productCode}`
    
    if (!groups[key]) {
      groups[key] = {
        ...stock,
        totalQuantity: 0,
        totalAvailableQuantity: 0,
        items: [],
        lastReceivedDate: stock.receivedDate
      }
    }
    
    groups[key].totalQuantity += stock.quantity || 0
    groups[key].totalAvailableQuantity += getAvailableForStock(stock)
    groups[key].items.push(stock)
    
    // Keep the most recent received date
    if (stock.receivedDate && (!groups[key].lastReceivedDate || new Date(stock.receivedDate) > new Date(groups[key].lastReceivedDate))) {
      groups[key].lastReceivedDate = stock.receivedDate
    }
    
    return groups
  }, {})
  
  const groupedReceivedStockArray = Object.values(groupedReceivedStock)
  const unreadNotifications = notifications.filter((n) => !n.isRead)
  
  // Enhanced stock calculations using the new logic
  const totalAssignedQuantity = assignedStock
    .filter((stock) => stock.status !== "returned")
    .reduce((sum, stock) => sum + (stock.quantity || 0), 0)
  
  const totalPendingQuantity = pendingStock.reduce((sum, stock) => sum + (stock.quantity || 0), 0)
  
  const totalRemainingQuantity = receivedStock.reduce((sum, stock) => sum + (stock.remainingQuantity || stock.quantity || 0), 0)
  
  const totalReturnedQuantity = returnedStock.reduce((sum, stock) => sum + (stock.quantity || 0), 0)

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

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-2xl p-8 text-white">
        <h1 className="text-4xl font-bold mb-2">Welcome back, {user?.name || "User"}!</h1>
        <p className="text-white/80 text-lg">Here's your current status and assignments</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-100 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Total Assigned Stock</CardTitle>
            <Package className="h-5 w-5 text-[#2B3068]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[#2B3068]">{totalAssignedQuantity}</div>
            <p className="text-xs text-gray-600 mt-1">Total quantity ever assigned</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Pending Stock</CardTitle>
            <AlertCircle className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-500">{totalPendingQuantity}</div>
            <p className="text-xs text-gray-600 mt-1">Awaiting receipt</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-emerald-100 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Remaining Stock</CardTitle>
            <CheckCircle className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">{totalRemainingQuantity}</div>
            <p className="text-xs text-gray-600 mt-1">Current stock after sales</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Returned Stock</CardTitle>
            <Package className="h-5 w-5 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">{totalReturnedQuantity}</div>
            <p className="text-xs text-gray-600 mt-1">Stock returned to admin</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white rounded-t-lg">
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Received Stock Assignments
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Product Code</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Cylinder Size</TableHead>
                    <TableHead>Total Quantity</TableHead>
                    <TableHead>Available Quantity</TableHead>
                    <TableHead>Least Price (Assigned)</TableHead>
                    <TableHead>Last Received</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedReceivedStockArray.map((group: any) => (
                    <TableRow key={`${group.product?.name}-${group.product?.productCode || group.product?.code || 'N/A'}`}>
                      <TableCell className="font-medium">{group.product?.name || "Unknown Product"}</TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600 font-mono">
                          {group.product?.productCode || group.product?.code || 'N/A'}
                        </span>
                      </TableCell>
                      <TableCell>{group.product?.category || "-"}</TableCell>
                      <TableCell>
                        {group.product?.category === 'cylinder'
                          ? (() => {
                              const size = (group.cylinderSize || group.product?.cylinderSize || '').toString()
                              return size ? size.charAt(0).toUpperCase() + size.slice(1) : '-'
                            })()
                          : '-'}
                      </TableCell>
                      <TableCell className="font-semibold text-blue-600">{group.totalQuantity}</TableCell>
                      <TableCell className="font-semibold text-green-600">{group.totalAvailableQuantity}</TableCell>
                      <TableCell>{(() => {
                        const leastPrice = group.leastPrice ?? group.product?.leastPrice;
                        return leastPrice ? `AED ${leastPrice}` : <span className="text-gray-400">N/A</span>;
                      })()}</TableCell>
                      <TableCell>{group.lastReceivedDate ? new Date(group.lastReceivedDate).toLocaleDateString() : "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              // Return all items in this group
                              group.items.forEach((item: any) => handleReturnStock(item._id))
                            }}
                            className="border-red-600 text-red-600 hover:bg-red-600 hover:text-white text-xs"
                          >
                            Return All ({group.items.length})
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {receivedStock.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-gray-500 py-8">
                        No received stock assignments.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Unified Pending Items Section - Both Stock Assignments and Approved Purchase Orders */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-orange-600 to-orange-800 text-white rounded-t-lg">
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Pending Items to Receive ({pendingStock.length + pendingInventory.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Product Code</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Price/Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Stock Assignments */}
                {pendingStockFiltered.map((stock) => (
                  <TableRow key={`stock-${stock._id}`}>
                    <TableCell>
                      <Badge variant="default" className="bg-blue-600">
                        Stock Assignment
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{stock.product?.name || "Unknown Product"}</TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600 font-mono">
                        {stock.product?.productCode || stock.product?.code || 'N/A'}
                      </span>
                    </TableCell>
                    <TableCell>{stock.product?.category || "-"}</TableCell>
                    <TableCell>{stock.quantity}</TableCell>
                    <TableCell>{(() => {
                      const leastPrice = stock.leastPrice ?? stock.product?.leastPrice;
                      return leastPrice ? `AED ${leastPrice}` : <span className="text-gray-400">N/A</span>;
                    })()}</TableCell>
                    <TableCell>{new Date(stock.assignedDate).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        Admin Assignment
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleReceiveStock(stock._id)}
                          style={{ backgroundColor: "#2B3068" }}
                          className="hover:opacity-90"
                        >
                          Receive
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRejectStock(stock._id)}
                          className="border-red-600 text-red-600 hover:bg-red-600 hover:text-white"
                        >
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                
                {/* Approved Purchase Orders */}
                {pendingInventory.map((item) => (
                  <TableRow key={`inventory-${item._id}`}>
                    <TableCell>
                      <Badge variant="secondary" className="bg-orange-600 text-white">
                        Purchase Order
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{item.product?.name || "Unknown Product"}</TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600 font-mono">
                        {item.product?.productCode || item.product?.code || item.productCode || 'N/A'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.purchaseType === "gas" ? "default" : "secondary"}>
                        {item.purchaseType}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell className="font-semibold">AED {item.totalAmount?.toFixed(2) || '0.00'}</TableCell>
                    <TableCell>{new Date(item.purchaseDate).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {item.supplier?.companyName || "Unknown Supplier"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => handleReceiveInventory(item._id)}
                        style={{ backgroundColor: "#2B3068" }}
                        className="hover:opacity-90 text-white"
                      >
                        Receive Item
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                
                {/* Empty State */}
                {pendingStock.length === 0 && pendingInventory.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-gray-500 py-8">
                      <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">No pending items to receive</p>
                      <p className="text-sm">Stock assignments and approved purchase orders will appear here</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white rounded-t-lg">
          <CardTitle>Account Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">AED {totalCredit.toFixed(2)}</div>
              <p className="text-sm text-gray-600">Total Credit (Received Amount)</p>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">AED {totalDebit.toFixed(2)}</div>
              <p className="text-sm text-gray-600">Total Debit (Total Amount)</p>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-[#2B3068]">
                AED {(totalCredit - totalDebit).toFixed(2)}
              </div>
              <p className="text-sm text-gray-600">Net Balance</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Popup */}
      {notification.visible && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-6 py-4 rounded-lg shadow-lg max-w-md">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">Stock Assignment Notification</span>
          </div>
          <p className="mt-1 text-sm">{notification.message}</p>
        </div>
      )}
    </div>
  )
}
