"use client"

import { useState, useEffect } from "react"
import { useNotifications } from "@/hooks/useNotifications"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Package, Warehouse, FileDown } from "lucide-react"
import { productsAPI } from "@/lib/api"
import ProductQuoteDialog from "@/components/product-quote-dialog"

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
  const [products, setProducts] = useState<any[]>([])
  const [showQuoteDialog, setShowQuoteDialog] = useState(false)

  useEffect(() => {
    if (user?.id) {
      fetchEmployeeData()
    }
  }, [user?.id])

  const fetchEmployeeData = async () => {
    try {
      const [salesResponse, stockResponse, purchaseResponse, productsResponse] = await Promise.all([
        fetch(`/api/employee-sales?employeeId=${user.id}`),
        fetch(`/api/stock-assignments?employeeId=${user.id}`),
        fetch(`/api/employee-purchase-orders?me=true`),
        productsAPI.getAll()
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
      
      // Fetch products for quotation paper
      const productsData = productsResponse.data
      const productsArray = Array.isArray(productsData?.data) ? productsData.data : (Array.isArray(productsData) ? productsData : [])
      setProducts(productsArray)
      
    } catch (error) {
      console.error("Failed to fetch employee data:", error)
      setSalesData([])
      setTotalDebit(0)
      setTotalCredit(0)
      setPendingItemsCount(0)
      setProducts([])
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
    <div className="pt-5 space-y-8 " >
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-2xl p-8 text-white">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-4xl font-bold mb-2">Welcome back, {user?.name || "User"}!</h1>
            <p className="text-white/80 text-lg">Here's your current status and assignments</p>
          </div>
          <Button 
            onClick={() => setShowQuoteDialog(true)} 
            className="bg-white text-[#2B3068] hover:bg-white/90 font-semibold min-h-[44px]"
          >
            <FileDown className="w-4 h-4 mr-2" />
            Generate Quote Paper
          </Button>
        </div>
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
      )      }

      {showQuoteDialog && (
        <ProductQuoteDialog
          products={products.map((p) => ({
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
    </div>
  )
}
