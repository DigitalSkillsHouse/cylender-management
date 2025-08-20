"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DollarSign, Users, Package, TrendingUp, AlertCircle, Fuel, Cylinder } from "lucide-react"
import { dashboardAPI } from "@/lib/api"

export function Dashboard() {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalDue: 0,
    totalCustomers: 0,
    totalEmployees: 0,
    productsSold: 0,
    totalSales: 0,
    gasSales: 0,
    cylinderRevenue: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const response = await dashboardAPI.getStats()
      
      // Handle nested data structure if needed
      const statsData = response.data?.data || response.data || {}
      
      setStats({
        totalRevenue: Number(statsData.totalRevenue || 0),
        totalDue: Number(statsData.totalDue || 0),
        totalCustomers: Number(statsData.totalCustomers || 0),
        totalEmployees: Number(statsData.totalEmployees || 0),
        productsSold: Number(statsData.productsSold || 0),
        totalSales: Number(statsData.totalSales || 0),
        gasSales: Number(statsData.gasSales || 0),
        cylinderRevenue: Number(statsData.cylinderRefills || 0),
      })
    } catch (error) {
      // console.error("Error details:", error.response?.data || error.message)
      // Set default values on error - ensure they are displayed as 0
      setStats({
        totalRevenue: 0,
        totalDue: 0,
        totalCustomers: 0,
        totalEmployees: 0,
        productsSold: 0,
        totalSales: 0,
        gasSales: 0,
        cylinderRevenue: 0,
      })
    } finally {
      setLoading(false)
    }
  }

  const cards = [
    {
      title: "Total Revenue",
      value: `AED ${(stats.totalRevenue + stats.gasSales + stats.cylinderRevenue).toLocaleString()}`,
      icon: DollarSign,
      color: "#2B3068",
      bgColor: "bg-gradient-to-br from-blue-50 to-indigo-100",
      description: "Combined revenue from all sources"
    },
    {
      title: "Gas Sales Revenue",
      value: `AED ${stats.gasSales.toLocaleString()}`,
      icon: Fuel,
      color: "#059669",
      bgColor: "bg-gradient-to-br from-green-50 to-emerald-100",
      description: "Revenue from gas sales"
    },
    {
      title: "Cylinder Revenue",
      value: `AED ${stats.cylinderRevenue.toLocaleString()}`,
      icon: Cylinder,
      color: "#7C3AED",
      bgColor: "bg-gradient-to-br from-purple-50 to-violet-100",
      description: "Deposits, refills & returns"
    },
    {
      title: "Total Due",
      value: `AED ${stats.totalDue.toLocaleString()}`,
      icon: AlertCircle,
      color: "#DC2626",
      bgColor: "bg-gradient-to-br from-red-50 to-red-100",
      description: "Outstanding payments"
    },
    {
      title: "Total Customers",
      value: stats.totalCustomers.toString(),
      icon: Users,
      color: "#F59E0B",
      bgColor: "bg-gradient-to-br from-yellow-50 to-amber-100",
      description: "Registered customers"
    },
    {
      title: "Products Sold",
      value: stats.productsSold.toString(),
      icon: Package,
      color: "#10B981",
      bgColor: "bg-gradient-to-br from-teal-50 to-green-100",
      description: "Units sold"
    },
  ]

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-32 bg-gray-200 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="pt-16 lg:pt-0 space-y-4 sm:space-y-6 lg:space-y-8">
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8 text-white">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">Dashboard</h1>
        <p className="text-white/80 text-sm sm:text-base lg:text-lg">Welcome to BARAKAH ALJAZEERA Gas Management System</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
        {cards.map((card, index) => (
          <Card key={index} className={`hover:shadow-xl transition-all duration-300 border-0 ${card.bgColor}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-700 leading-tight">{card.title}</CardTitle>
              <div className="p-2 rounded-lg flex-shrink-0" style={{ backgroundColor: `${card.color}15` }}>
                <card.icon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: card.color }} />
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="text-xl sm:text-2xl lg:text-3xl font-bold" style={{ color: card.color }}>
                {card.value}
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {card.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white rounded-t-lg p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 rounded-lg gap-1 sm:gap-0">
                <span className="text-sm text-gray-700">New customer registered</span>
                <span className="text-xs text-gray-500">2 hours ago</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 rounded-lg gap-1 sm:gap-0">
                <span className="text-sm text-gray-700">Gas sale completed</span>
                <span className="text-xs text-gray-500">4 hours ago</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 rounded-lg gap-1 sm:gap-0">
                <span className="text-sm text-gray-700">Inventory updated</span>
                <span className="text-xs text-gray-500">6 hours ago</span>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
