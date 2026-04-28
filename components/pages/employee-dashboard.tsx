"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Package, Warehouse, PenTool, Fuel, Calendar, X } from "lucide-react"
import { EmployeeSignatureDialog } from "@/components/employee-signature-dialog"
import { getLocalDateString, getLocalDateStringFromDate } from "@/lib/date-utils"

const getCurrentMonthValue = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

interface EmployeeDashboardProps {
  user: { id: string; email: string; name: string; debitAmount?: number; creditAmount?: number }
  setUnreadCount?: (count: number) => void
}

export const EmployeeDashboard = ({ user, setUnreadCount }: EmployeeDashboardProps) => {
  const section3dClass =
    "relative overflow-hidden rounded-[28px] border border-slate-200/90 bg-white/95 shadow-[0_18px_36px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.92)]"
  const statRow3dClass =
    "group relative overflow-hidden rounded-[22px] border border-white/75 p-3.5 sm:p-4 shadow-[0_16px_30px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.94)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_38px_rgba(15,23,42,0.12),0_7px_14px_rgba(15,23,42,0.07),inset_0_1px_0_rgba(255,255,255,0.96)]"

  const [loading, setLoading] = useState(true)
  const [salesData, setSalesData] = useState<any[]>([])
  const [pendingItemsCount, setPendingItemsCount] = useState(0)
  const [showSignatureDialog, setShowSignatureDialog] = useState(false)
  const [filterType, setFilterType] = useState<"all" | "month" | "custom">("month")
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue)
  const [fromDate, setFromDate] = useState(getLocalDateString())
  const [toDate, setToDate] = useState(getLocalDateString())
  const [showDateFilter, setShowDateFilter] = useState(false)

  useEffect(() => {
    if (user?.id) {
      fetchEmployeeData()
    }
  }, [user?.id])

  const fetchJsonWithTimeout = async (url: string, timeoutMs = 15000) => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`Request failed (${response.status}) for ${url}`)
      }
      return await response.json()
    } finally {
      window.clearTimeout(timer)
    }
  }

  const fetchEmployeeData = async () => {
    try {
      const [salesResult, stockResult, purchaseResult] = await Promise.allSettled([
        fetchJsonWithTimeout(`/api/employee-sales?employeeId=${user.id}&mode=list`),
        fetchJsonWithTimeout(`/api/stock-assignments?employeeId=${user.id}`),
        fetchJsonWithTimeout(`/api/employee-purchase-orders?me=true&mode=list`)
      ])

      // Fetch sales data for account summary
      const salesData =
        salesResult.status === "fulfilled"
          ? salesResult.value
          : []
      const salesArray = Array.isArray(salesData?.data?.data)
        ? salesData.data.data
        : Array.isArray(salesData?.data)
          ? salesData.data
          : Array.isArray(salesData?.data?.sales)
            ? salesData.data.sales
        : Array.isArray(salesData)
          ? salesData
          : []
      setSalesData(salesArray)

      // Get pending items count for redirect card
      const stockData =
        stockResult.status === "fulfilled"
          ? stockResult.value
          : { data: [] }
      const purchaseData =
        purchaseResult.status === "fulfilled"
          ? purchaseResult.value
          : { data: [] }

      const stockArray = Array.isArray(stockData?.data?.data)
        ? stockData.data.data
        : Array.isArray(stockData?.data)
          ? stockData.data
          : []
      const purchaseArray = Array.isArray(purchaseData?.data?.data)
        ? purchaseData.data.data
        : Array.isArray(purchaseData?.data)
          ? purchaseData.data
          : []

      const pendingStock = stockArray.filter((s: any) => s.status === 'assigned').length
      const pendingPurchases = purchaseArray.filter((p: any) => p.inventoryStatus === 'approved').length

      setPendingItemsCount(pendingStock + pendingPurchases)
    } catch (error) {
      console.error("Failed to fetch employee data:", error)
      setSalesData([])
      setPendingItemsCount(0)
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
    setSelectedMonth(getCurrentMonthValue())
    setFromDate(getLocalDateString())
    setToDate(getLocalDateString())
    setShowDateFilter(false)
  }

  const hasActiveFilter = filterType !== "month" || selectedMonth !== getCurrentMonthValue()

  const filteredSalesData = salesData.filter((sale) => {
    if (filterType === "all") {
      return true
    }

    const saleDate = getLocalDateStringFromDate(sale?.createdAt)

    if (filterType === "month") {
      return saleDate.slice(0, 7) === selectedMonth
    }

    if (filterType === "custom") {
      if (fromDate && saleDate < fromDate) {
        return false
      }
      if (toDate && saleDate > toDate) {
        return false
      }
    }

    return true
  })

  const quantityStats = filteredSalesData.reduce(
    (totals, sale) => {
      const items = Array.isArray(sale?.items) ? sale.items : []

      items.forEach((item: any) => {
        const quantity = Number(item?.quantity || 0)
        if (quantity <= 0) {
          return
        }

        if (item?.category === "gas") {
          totals.gas += quantity
        }

        if (item?.category === "cylinder") {
          if (item?.cylinderStatus === "full") {
            totals.fullCylinder += quantity
          }

          if (item?.cylinderStatus === "empty") {
            totals.emptyCylinder += quantity
          }
        }
      })

      return totals
    },
    { gas: 0, fullCylinder: 0, emptyCylinder: 0 }
  )

  const quantityCards = [
    {
      title: "Gas Sale",
      value: quantityStats.gas.toString(),
      icon: Fuel,
      color: "#059669",
      bgColor: "bg-gradient-to-br from-green-50 to-emerald-100",
      description: "Gas quantity sold in selected period",
    },
    {
      title: "Full Cylinder Sale",
      value: quantityStats.fullCylinder.toString(),
      icon: Package,
      color: "#C2410C",
      bgColor: "bg-gradient-to-br from-orange-50 to-amber-100",
      description: "Full cylinder quantity sold in selected period",
    },
    {
      title: "Empty Cylinder Sale",
      value: quantityStats.emptyCylinder.toString(),
      icon: Package,
      color: "#1D4ED8",
      bgColor: "bg-gradient-to-br from-sky-50 to-blue-100",
      description: "Empty cylinder quantity sold in selected period",
    },
  ]

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
    <div className="pt-10 sm:pt-16 lg:pt-0 space-y-3">
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-r from-[#2B3068] via-[#262d62] to-[#1a1f4a] px-3 py-3 text-white shadow-[0_20px_44px_rgba(43,48,104,0.22)] sm:rounded-[30px] sm:px-5 sm:py-4 lg:px-6 lg:py-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_34%),radial-gradient(circle_at_80%_22%,rgba(255,255,255,0.14),transparent_24%)]" />
        <div className="absolute -right-10 top-0 h-32 w-32 rounded-full border border-white/10 bg-white/5 blur-2xl" />
        <div className="absolute -left-8 bottom-0 h-24 w-24 rounded-full border border-white/10 bg-white/5 blur-xl" />
        <div className="relative flex flex-col gap-2 sm:gap-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex-1">
              <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.32em] text-white/80 backdrop-blur-sm">
                Employee Overview
              </div>
              <h1 className="mt-2 text-xl font-bold leading-tight sm:mt-2.5 sm:text-3xl lg:text-[2rem]">Welcome back, {user?.name || "User"}!</h1>
              <p className="text-sm text-white sm:text-base sm:text-white/80 max-w-2xl">
                Here&apos;s your sales snapshot and the tools you need for the day.
              </p>
              <div className="mt-3 hidden flex-wrap gap-2 text-[11px] text-white/80 sm:flex">
                <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 backdrop-blur-sm">Personal monthly view</div>
                <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 backdrop-blur-sm">Assigned inventory shortcuts</div>
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

                <Button
                  onClick={() => setShowSignatureDialog(true)}
                  variant="secondary"
                  className="h-11 min-w-0 justify-center rounded-2xl border border-white/15 bg-white/10 px-2.5 text-[11px] leading-tight text-white shadow-[0_10px_22px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-sm hover:bg-white/18 hover:text-white sm:h-9 sm:flex-none sm:rounded-xl sm:px-3.5 sm:text-sm sm:shadow-none"
                  size="sm"
                >
                  <PenTool className="mr-1.5 h-4 w-4 shrink-0 sm:mr-2" />
                  <span className="truncate">Manage Signature</span>
                </Button>

                {hasActiveFilter && (
                  <Button
                    onClick={resetFilter}
                    variant="secondary"
                    className="col-span-2 h-10 rounded-2xl border border-white/15 bg-white/8 px-3 text-white shadow-[0_10px_22px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-sm hover:bg-white/16 hover:text-white sm:col-auto sm:h-9 sm:flex-none sm:rounded-xl sm:px-3.5 sm:shadow-none"
                    size="sm"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Reset Filter
                  </Button>
                )}
              </div>
            </div>
          </div>

          {showDateFilter && (
            <div className="bg-white/10 rounded-2xl p-3.5 border border-white/20 backdrop-blur-sm">
              <div className="flex flex-col gap-3">
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
                    <Label htmlFor="employeeMonth" className="text-white min-w-[80px]">Select Month:</Label>
                    <Input
                      id="employeeMonth"
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
                      <Label htmlFor="employeeFromDate" className="text-white min-w-[80px]">From Date:</Label>
                      <Input
                        id="employeeFromDate"
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="bg-white text-gray-900 max-w-[200px]"
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2.5 items-start sm:items-center">
                      <Label htmlFor="employeeToDate" className="text-white min-w-[80px]">To Date:</Label>
                      <Input
                        id="employeeToDate"
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

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(315px,0.82fr)] items-start">
        <Card className={section3dClass}>
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#059669] via-[#C2410C] to-[#1D4ED8]" />
          <CardHeader className="p-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Quantity Board
                </div>
                <CardTitle className="mt-2 text-lg font-semibold text-slate-900">Sales Stats By Quantity</CardTitle>
                <p className="mt-1 text-sm text-slate-600">Your current month opens fresh, while older records remain available through filters.</p>
              </div>
              <div className="hidden sm:inline-flex rounded-full bg-slate-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-white">
                Live
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5 p-4 pt-0">
            {quantityCards.map((card, index) => (
              <div
                key={index}
                className={`${statRow3dClass} ${card.bgColor}`}
              >
                <div className="absolute inset-y-0 left-0 w-1.5 rounded-full" style={{ backgroundColor: card.color }} />
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl p-2.5 flex-shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]" style={{ backgroundColor: `${card.color}15` }}>
                    <card.icon className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" style={{ color: card.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-gray-500 mb-1">Snapshot</div>
                    <div className="text-sm sm:text-base font-semibold text-gray-800">{card.title}</div>
                    <p className="text-xs sm:text-sm text-gray-600 mt-0.5">{card.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl sm:text-[2rem] font-bold leading-none tracking-tight" style={{ color: card.color }}>{card.value}</div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-gray-500 mt-1">Units</div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-3">
          {pendingItemsCount > 0 && (
            <Card className={`${section3dClass} overflow-hidden`}>
              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#2B3068] to-[#4b5496]" />
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2B3068] text-white shadow-[0_12px_24px_rgba(43,48,104,0.18)]">
                      <Warehouse className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                        Inventory
                      </div>
                      <h3 className="text-base font-semibold text-slate-900">Inventory actions waiting</h3>
                      <p className="mt-1 text-sm text-slate-600 max-w-sm">
                        You have {pendingItemsCount} pending inventory items ready for review on your inventory page.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full sm:w-auto sm:min-w-[220px]">
                    <Button 
                      onClick={() => window.location.href = '?page=employee-stock'}
                      className="bg-[#2B3068] px-5 text-white hover:bg-[#1a1f4a] w-full"
                    >
                      Go to Assigned/Return
                    </Button>
                    <Button 
                      onClick={() => window.location.href = '?page=employee-inventory'}
                      variant="outline"
                      className="border-[#2B3068] text-[#2B3068] hover:bg-[#2B3068] hover:text-white w-full"
                    >
                      Go to Pending Purchase
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <EmployeeSignatureDialog
        isOpen={showSignatureDialog}
        onClose={() => setShowSignatureDialog(false)}
        onSave={() => {
          setShowSignatureDialog(false)
        }}
        employeeId={user?.id}
      />
    </div>
  )
}
