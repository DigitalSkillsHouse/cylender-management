"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DollarSign, Users, Package, AlertCircle, Fuel, PenTool, Calendar, X } from "lucide-react"
import { dashboardAPI } from "@/lib/api"
import { InactiveCustomersNotification } from "@/components/inactive-customers-notification"
import { AdminSignatureDialog } from "@/components/admin-signature-dialog"
import { getLocalDateString } from "@/lib/date-utils"

const getCurrentMonthValue = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

interface DashboardProps {
  user?: {
    id: string
    email: string
    role: "admin" | "employee"
    name: string
  }
}

export const Dashboard = ({ user }: DashboardProps) => {
  const card3dClass =
    "group relative overflow-hidden rounded-[24px] border border-white/70 shadow-[0_18px_34px_rgba(15,23,42,0.08),0_4px_12px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.92)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_44px_rgba(15,23,42,0.14),0_8px_18px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.96)]"
  const quantity3dClass =
    "group relative overflow-hidden rounded-[22px] border border-white/75 p-3 shadow-[0_14px_26px_rgba(15,23,42,0.08),0_3px_8px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.9)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_34px_rgba(15,23,42,0.12),0_6px_12px_rgba(15,23,42,0.07),inset_0_1px_0_rgba(255,255,255,0.94)]"
  const panel3dClass =
    "relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_18px_36px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.95)]"

  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalDue: 0,
    totalCustomers: 0,
    totalEmployees: 0,
    productsSold: 0,
    totalSales: 0,
    gasSales: 0,
    cylinderRevenue: 0,
    salesQuantityGas: 0,
    salesQuantityFullCylinder: 0,
    salesQuantityEmptyCylinder: 0,
    inactiveCustomers: [],
    inactiveCustomersCount: 0,
  })
  const [loading, setLoading] = useState(true)
  const [showAdminSignatureDialog, setShowAdminSignatureDialog] = useState(false)
  const [filterType, setFilterType] = useState<"all" | "month" | "custom">("month")
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue)
  const [fromDate, setFromDate] = useState(getLocalDateString())
  const [toDate, setToDate] = useState(getLocalDateString())
  const [showDateFilter, setShowDateFilter] = useState(false)

  useEffect(() => {
    fetchStats()
  }, [filterType, selectedMonth, fromDate, toDate])

  const fetchStats = async () => {
    try {
      setLoading(true)

      const params: any = {}

      if (filterType === "month") {
        const [year, month] = selectedMonth.split("-")
        const startDate = `${year}-${month}-01`
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate()
        const endDate = `${year}-${month}-${String(lastDay).padStart(2, "0")}`
        params.fromDate = startDate
        params.toDate = endDate
      } else if (filterType === "custom") {
        if (fromDate) params.fromDate = fromDate
        if (toDate) params.toDate = toDate
      }

      const response = await dashboardAPI.getStats(params)
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
        salesQuantityGas: Number(statsData.salesQuantity?.gas || 0),
        salesQuantityFullCylinder: Number(statsData.salesQuantity?.fullCylinder || 0),
        salesQuantityEmptyCylinder: Number(statsData.salesQuantity?.emptyCylinder || 0),
        inactiveCustomers: statsData.inactiveCustomers || [],
        inactiveCustomersCount: Number(statsData.inactiveCustomersCount || 0),
      })
    } catch (error) {
      setStats({
        totalRevenue: 0,
        totalDue: 0,
        totalCustomers: 0,
        totalEmployees: 0,
        productsSold: 0,
        totalSales: 0,
        gasSales: 0,
        cylinderRevenue: 0,
        salesQuantityGas: 0,
        salesQuantityFullCylinder: 0,
        salesQuantityEmptyCylinder: 0,
        inactiveCustomers: [],
        inactiveCustomersCount: 0,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleFilterTypeChange = (type: "all" | "month" | "custom") => {
    setFilterType(type)
    setShowDateFilter(type !== "all")
  }

  const resetFilter = () => {
    setFilterType("month")
    setShowDateFilter(false)
    setSelectedMonth(getCurrentMonthValue())
    setFromDate(getLocalDateString())
    setToDate(getLocalDateString())
  }

  const hasActiveFilter = filterType !== "month" || selectedMonth !== getCurrentMonthValue()

  const formatCurrency = (amount: number) => {
    if (amount === null || amount === undefined || isNaN(amount)) {
      return "0.00"
    }
    const formatted = Number(amount).toFixed(2)
    return formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  }

  const cards = [
    {
      title: "Total Revenue",
      value: `AED ${formatCurrency(stats.totalRevenue)}`,
      icon: DollarSign,
      color: "#2B3068",
      bgColor: "bg-gradient-to-br from-blue-50 to-indigo-100",
      description: "Combined revenue from all sources",
    },
    {
      title: "Gas Sales Revenue",
      value: `AED ${formatCurrency(stats.gasSales)}`,
      icon: Fuel,
      color: "#059669",
      bgColor: "bg-gradient-to-br from-green-50 to-emerald-100",
      description: "Revenue from gas sales",
    },
    {
      title: "Total Due",
      value: `AED ${formatCurrency(stats.totalDue)}`,
      icon: AlertCircle,
      color: "#DC2626",
      bgColor: "bg-gradient-to-br from-red-50 to-red-100",
      description: "Outstanding payments",
    },
    {
      title: "Total Customers",
      value: stats.totalCustomers.toString(),
      icon: Users,
      color: "#F59E0B",
      bgColor: "bg-gradient-to-br from-yellow-50 to-amber-100",
      description: "Customers added in selected period",
    },
  ]

  const quantityCards = [
    {
      title: "Gas Sale",
      value: stats.salesQuantityGas.toString(),
      icon: Fuel,
      color: "#059669",
      bgColor: "bg-gradient-to-br from-green-50 to-emerald-100",
      description: "Gas quantity sold in selected period",
    },
    {
      title: "Full Cylinder Sale",
      value: stats.salesQuantityFullCylinder.toString(),
      icon: Package,
      color: "#C2410C",
      bgColor: "bg-gradient-to-br from-orange-50 to-amber-100",
      description: "Full cylinder quantity sold in selected period",
    },
    {
      title: "Empty Cylinder Sale",
      value: stats.salesQuantityEmptyCylinder.toString(),
      icon: Package,
      color: "#1D4ED8",
      bgColor: "bg-gradient-to-br from-sky-50 to-blue-100",
      description: "Empty cylinder quantity sold in selected period",
    },
  ]

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-28 bg-gray-200 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="pt-10 sm:pt-16 lg:pt-0 space-y-3">
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-r from-[#2B3068] via-[#262d62] to-[#1a1f4a] px-3 py-3 text-white shadow-[0_20px_44px_rgba(43,48,104,0.22)] sm:rounded-[30px] sm:px-5 sm:py-4 lg:px-6 lg:py-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_34%),radial-gradient(circle_at_78%_22%,rgba(255,255,255,0.14),transparent_24%)]" />
        <div className="absolute -right-10 top-0 h-32 w-32 rounded-full border border-white/10 bg-white/5 blur-2xl" />
        <div className="absolute -left-8 bottom-0 h-24 w-24 rounded-full border border-white/10 bg-white/5 blur-xl" />
        <div className="relative flex flex-col gap-2 sm:gap-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex-1">
              <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.32em] text-white/80 backdrop-blur-sm">
                Admin Overview
              </div>
              <h1 className="mt-2 text-xl font-bold sm:mt-2.5 sm:text-3xl lg:text-[2rem]">Dashboard</h1>
              <p className="text-sm text-white sm:text-base sm:text-white/80 max-w-2xl">
                Welcome to SYED TAYYAB INDUSTRIAL Gas Management System
              </p>
              <div className="mt-3 hidden flex-wrap gap-2 text-[11px] text-white/80 sm:flex">
                <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 backdrop-blur-sm">Live monthly snapshot</div>
                <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 backdrop-blur-sm">Filter-ready history</div>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end xl:max-w-[48%]">
              <div className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                <Button
                  onClick={() => setShowDateFilter(!showDateFilter)}
                  variant="secondary"
                  className="h-11 min-w-0 justify-center rounded-2xl border border-white/15 bg-white/10 px-2.5 text-[11px] leading-tight text-white shadow-[0_10px_22px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-sm hover:bg-white/18 hover:text-white sm:h-9 sm:flex-none sm:rounded-xl sm:px-3.5 sm:text-sm sm:shadow-none"
                  size="sm"
                >
                  <Calendar className="mr-1.5 h-4 w-4 shrink-0 sm:mr-2" />
                  <span className="truncate sm:hidden">
                    {filterType === "all" ? "Date Filter" : filterType === "month" ? "By Month" : "Custom Range"}
                  </span>
                  <span className="hidden sm:inline">
                    {filterType === "all" ? "Filter by Date" : filterType === "month" ? "Filtered by Month" : "Filtered by Custom Range"}
                  </span>
                </Button>

                {user?.role === "admin" && (
                  <Button
                    onClick={() => setShowAdminSignatureDialog(true)}
                    variant="secondary"
                    className="h-11 min-w-0 justify-center rounded-2xl border border-white/15 bg-white/10 px-2.5 text-[11px] leading-tight text-white shadow-[0_10px_22px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-sm hover:bg-white/18 hover:text-white sm:h-9 sm:flex-none sm:rounded-xl sm:px-3.5 sm:text-sm sm:shadow-none"
                    size="sm"
                  >
                    <PenTool className="mr-1.5 h-4 w-4 shrink-0 sm:mr-2" />
                    <span className="truncate sm:hidden">Manage Signature</span>
                    <span className="hidden sm:inline">Manage Admin Signature</span>
                  </Button>
                )}

                {hasActiveFilter && (
                  <Button
                    onClick={resetFilter}
                    variant="secondary"
                    className="col-span-2 h-10 rounded-2xl border border-white/15 bg-white/8 px-3 text-white shadow-[0_10px_22px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-sm hover:bg-white/16 hover:text-white sm:col-auto sm:h-9 sm:flex-none sm:rounded-xl sm:px-3.5 sm:shadow-none"
                    size="sm"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Reset Filter
                  </Button>
                )}
              </div>

              <div className="w-full sm:w-auto">
                <InactiveCustomersNotification
                  inactiveCustomers={stats.inactiveCustomers}
                  inactiveCustomersCount={stats.inactiveCustomersCount}
                  onMarkAsViewed={fetchStats}
                />
              </div>
            </div>
          </div>

          {showDateFilter && (
            <div className="rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur-sm sm:p-3.5">
              <div className="flex flex-col gap-2.5 sm:gap-3">
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => handleFilterTypeChange("all")}
                    variant={filterType === "all" ? "default" : "secondary"}
                    size="sm"
                    className={filterType === "all" ? "bg-white text-[#2B3068]" : "bg-white/10 text-white hover:bg-white/20"}
                  >
                    All Time
                  </Button>
                  <Button
                    onClick={() => handleFilterTypeChange("month")}
                    variant={filterType === "month" ? "default" : "secondary"}
                    size="sm"
                    className={filterType === "month" ? "bg-white text-[#2B3068]" : "bg-white/10 text-white hover:bg-white/20"}
                  >
                    By Month
                  </Button>
                  <Button
                    onClick={() => handleFilterTypeChange("custom")}
                    variant={filterType === "custom" ? "default" : "secondary"}
                    size="sm"
                    className={filterType === "custom" ? "bg-white text-[#2B3068]" : "bg-white/10 text-white hover:bg-white/20"}
                  >
                    Custom Range
                  </Button>
                </div>

                {filterType === "month" && (
                  <div className="flex flex-col sm:flex-row gap-2.5 items-start sm:items-center">
                    <Label htmlFor="month" className="text-white min-w-[80px]">Select Month:</Label>
                    <Input
                      id="month"
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="bg-white text-gray-900 max-w-[200px]"
                    />
                  </div>
                )}

                {filterType === "custom" && (
                  <div className="flex flex-col sm:flex-row gap-2.5 items-start sm:items-center">
                    <div className="flex flex-col sm:flex-row gap-2.5 items-start sm:items-center">
                      <Label htmlFor="fromDate" className="text-white min-w-[80px]">From Date:</Label>
                      <Input
                        id="fromDate"
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="bg-white text-gray-900 max-w-[200px]"
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2.5 items-start sm:items-center">
                      <Label htmlFor="toDate" className="text-white min-w-[80px]">To Date:</Label>
                      <Input
                        id="toDate"
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="bg-white text-gray-900 max-w-[200px]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {user?.role === "admin" && (
        <AdminSignatureDialog
          isOpen={showAdminSignatureDialog}
          onClose={() => setShowAdminSignatureDialog(false)}
          onSave={() => {
            setShowAdminSignatureDialog(false)
          }}
        />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.12fr)_minmax(330px,0.88fr)] gap-3 items-start">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cards.map((card, index) => (
            <Card key={index} className={`${card3dClass} ${card.bgColor}`}>
              <div className="absolute inset-x-0 top-0 h-1.5 opacity-90" style={{ backgroundColor: card.color }} />
              <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full opacity-40 blur-2xl" style={{ backgroundColor: `${card.color}22` }} />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                <div className="space-y-2">
                  <div className="inline-flex items-center rounded-full border border-white/60 bg-white/45 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-gray-600">
                    Insight
                  </div>
                  <CardTitle className="text-xs sm:text-sm font-medium text-gray-700 leading-tight">{card.title}</CardTitle>
                </div>
                <div className="rounded-2xl p-2.5 flex-shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]" style={{ backgroundColor: `${card.color}15` }}>
                  <card.icon className="h-4 w-4 sm:h-5 sm:w-5 transition-transform duration-300 group-hover:scale-110" style={{ color: card.color }} />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-xl sm:text-2xl lg:text-[2rem] font-bold" style={{ color: card.color }}>
                  {card.value}
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {card.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className={panel3dClass}>
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#2B3068] via-[#059669] to-[#1D4ED8]" />
          <CardHeader className="pb-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Quantity Board
                </div>
                <CardTitle className="mt-2 text-lg sm:text-xl font-semibold text-gray-900">Sales Stats By Quantity</CardTitle>
                <p className="mt-1 text-sm text-gray-600">
                  Month-wise snapshot stays separate, and previous data can be checked with month or custom range filters.
                </p>
              </div>
              <div className="hidden sm:inline-flex rounded-full bg-slate-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-white">
                Live
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5 p-4 pt-0">
            {quantityCards.map((card, index) => (
              <div key={index} className={`${quantity3dClass} ${card.bgColor}`}>
                <div className="absolute inset-y-0 left-0 w-1.5 rounded-full" style={{ backgroundColor: card.color }} />
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl p-2.5 flex-shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]" style={{ backgroundColor: `${card.color}15` }}>
                    <card.icon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: card.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-gray-500 mb-1">Snapshot</div>
                    <div className="text-sm sm:text-base font-semibold text-gray-800">{card.title}</div>
                    <p className="text-xs text-gray-600 mt-0.5">{card.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl sm:text-[2rem] font-bold leading-none" style={{ color: card.color }}>
                      {card.value}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.24em] text-gray-500 mt-0.5">Units</div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
