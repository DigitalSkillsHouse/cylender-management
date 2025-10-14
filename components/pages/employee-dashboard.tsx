"use client"

import { useState, useEffect } from "react"
import { useNotifications } from "@/hooks/useNotifications"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Package, Warehouse } from "lucide-react"

interface EmployeeDashboardProps {
  user: { id: string; email: string; name: string; debitAmount?: number; creditAmount?: number }
  setUnreadCount?: (count: number) => void
}

export function EmployeeDashboard({ user, setUnreadCount }: EmployeeDashboardProps) {
  const [loading, setLoading] = useState(true)
  const [salesData, setSalesData] = useState<any[]>([])
  const [totalDebit, setTotalDebit] = useState(0)
  const [totalCredit, setTotalCredit] = useState(0)
  const [pendingItemsCount, setPendingItemsCount] = useState(0)

  useEffect(() => {
    if (user?.id) {
      fetchEmployeeData()
    }
  }, [user?.id])

  const fetchEmployeeData = async () => {
    try {
      const [salesResponse, stockResponse, purchaseResponse] = await Promise.all([
        fetch(`/api/employee-sales?employeeId=${user.id}`),
        fetch(`/api/stock-assignments?employeeId=${user.id}`),
        fetch(`/api/employee-purchase-orders?me=true`)
      ])

      // Fetch sales data for account summary
      const salesData = await salesResponse.json()
      const salesArray = Array.isArray(salesData) ? salesData : []
      setSalesData(salesArray)
      
      // Calculate Debit (Total Amount) and Credit (Received Amount)
      const debit = salesArray.reduce((sum: number, sale: any) => sum + (sale.totalAmount || 0), 0)
      const credit = salesArray.reduce((sum: number, sale: any) => sum + (sale.receivedAmount || 0), 0)
      
      setTotalDebit(debit)
      setTotalCredit(credit)
      
      // Get pending items count for redirect card
      const stockData = await stockResponse.json()
      const purchaseData = await purchaseResponse.json()
      
      const pendingStock = Array.isArray(stockData?.data) ? stockData.data.filter((s: any) => s.status === 'assigned').length : 0
      const pendingPurchases = Array.isArray(purchaseData?.data) ? purchaseData.data.filter((p: any) => p.inventoryStatus === 'approved').length : 0
      
      setPendingItemsCount(pendingStock + pendingPurchases)
      
    } catch (error) {
      console.error("Failed to fetch employee data:", error)
      setSalesData([])
      setTotalDebit(0)
      setTotalCredit(0)
      setPendingItemsCount(0)
    } finally {
      setLoading(false)
    }
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

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-2xl p-8 text-white">
        <h1 className="text-4xl font-bold mb-2">Welcome back, {user?.name || "User"}!</h1>
        <p className="text-white/80 text-lg">Here's your current status and assignments</p>
      </div>

      {/* Inventory Management Redirect Card */}
      {pendingItemsCount > 0 && (
        <Card className="border-0 shadow-lg">
          <CardContent className="p-8">
            <div className="text-center">
              <Warehouse className="w-16 h-16 mx-auto mb-4 text-[#2B3068]" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Inventory Management</h3>
              <p className="text-gray-600 max-w-md mx-auto mb-4">
                You have {pendingItemsCount} pending inventory items. Visit your dedicated inventory page to manage them.
              </p>
              <Button 
                onClick={() => window.location.href = '?page=employee-inventory'}
                className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white"
              >
                Go to My Inventory
              </Button>
            </div>
          </CardContent>
        </Card>
      )}



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


    </div>
  )
}
