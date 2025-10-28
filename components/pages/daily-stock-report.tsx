"use client"
import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ListChecks, PlusCircle, FileText, Loader2, Eye } from "lucide-react"

interface DailyStockEntry {
  id: string
  date: string // yyyy-mm-dd
  itemName: string
  openingFull: number
  openingEmpty: number
  refilled: number
  cylinderSales: number
  gasSales: number
  depositCylinder: number
  returnCylinder: number
  closingFull?: number
  closingEmpty?: number
  createdAt: string
}

interface EmployeeLite { 
  _id: string
  name?: string
  email?: string 
}

interface DailyStockReportProps {
  user: {
    id: string
    name: string
    role: string
  }
}

export function DailyStockReport({ user }: DailyStockReportProps) {
  const [showDSRView, setShowDSRView] = useState(false)
  const [showEmployeeDSR, setShowEmployeeDSR] = useState(false)
  const [dsrEntries, setDsrEntries] = useState<DailyStockEntry[]>([])
  const [dsrViewDate, setDsrViewDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [employeeDsrDate, setEmployeeDsrDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("")
  const [loading, setLoading] = useState(false)

  // Products for DSR grid
  interface ProductLite { _id: string; name: string }
  const [dsrProducts, setDsrProducts] = useState<ProductLite[]>([])
  
  // Consistent name normalizer
  const normalizeName = (s: any) => (typeof s === 'string' || typeof s === 'number')
    ? String(s).replace(/\s+/g, ' ').trim().toLowerCase()
    : ''
  
  // Aggregated daily totals
  const [dailyAggGasSales, setDailyAggGasSales] = useState<Record<string, number>>({})
  const [dailyAggCylinderSales, setDailyAggCylinderSales] = useState<Record<string, number>>({})
  const [dailyAggRefills, setDailyAggRefills] = useState<Record<string, number>>({})
  const [dailyAggDeposits, setDailyAggDeposits] = useState<Record<string, number>>({})
  const [dailyAggReturns, setDailyAggReturns] = useState<Record<string, number>>({})
  
  // Enhanced daily sales tracking
  const [dailyGasSales, setDailyGasSales] = useState<Record<string, number>>({})
  const [dailyFullCylinderSales, setDailyFullCylinderSales] = useState<Record<string, number>>({})
  const [dailyEmptyCylinderSales, setDailyEmptyCylinderSales] = useState<Record<string, number>>({})
  const [dailyCylinderRefills, setDailyCylinderRefills] = useState<Record<string, number>>({})
  
  // Inventory data for automated DSR
  const [inventoryData, setInventoryData] = useState<Record<string, { availableFull: number; availableEmpty: number; currentStock: number }>>({})

  const API_BASE = '/api/daily-stock-entries'

  // Local storage helpers
  const saveDsrLocal = (entries: DailyStockEntry[]) => {
    try {
      localStorage.setItem('dsr-entries', JSON.stringify(entries))
    } catch (e) {
      console.warn('Failed to save DSR entries to localStorage:', e)
    }
  }

  const loadDsrLocal = (): DailyStockEntry[] => {
    try {
      const stored = localStorage.getItem('dsr-entries')
      return stored ? JSON.parse(stored) : []
    } catch (e) {
      console.warn('Failed to load DSR entries from localStorage:', e)
      return []
    }
  }

  // Fetch employees for employee DSR
  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/users')
      const data = await response.json()
      if (data.success && Array.isArray(data.data)) {
        const employeeList = data.data.filter((u: any) => u.role === 'employee')
        setEmployees(employeeList)
        if (employeeList.length > 0 && !selectedEmployeeId) {
          setSelectedEmployeeId(employeeList[0]._id)
        }
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error)
    }
  }

  // Fetch inventory data for automated DSR
  const fetchInventoryData = async () => {
    try {
      const [inventoryRes, productsRes] = await Promise.all([
        fetch('/api/inventory-items', { cache: 'no-store' }),
        fetch('/api/products', { cache: 'no-store' })
      ])
      
      const inventoryJson = await inventoryRes.json()
      const productsJson = await productsRes.json()
      
      const inventoryItems = Array.isArray(inventoryJson?.data) ? inventoryJson.data : []
      const products = Array.isArray(productsJson?.data?.data) ? productsJson.data.data : 
                      Array.isArray(productsJson?.data) ? productsJson.data : 
                      Array.isArray(productsJson) ? productsJson : []
      
      // Set only cylinder products for DSR display
      const cylinderProducts = products.filter((product: any) => product.category === 'cylinder')
      setDsrProducts(cylinderProducts.map((p: any) => ({ _id: p._id, name: p.name })))
      
      const inventoryMap: Record<string, { availableFull: number; availableEmpty: number; currentStock: number }> = {}
      
      // Map inventory items by product name
      inventoryItems.forEach((item: any) => {
        if (item.productName) {
          const normalizedName = normalizeName(item.productName)
          inventoryMap[normalizedName] = {
            availableFull: Number(item.availableFull) || 0,
            availableEmpty: Number(item.availableEmpty) || 0,
            currentStock: Number(item.currentStock) || 0
          }
        }
      })
      
      setInventoryData(inventoryMap)
    } catch (error) {
      console.error('Failed to fetch inventory data:', error)
    }
  }

  // Fetch DSR data for a specific date
  const fetchDsrData = async (date: string) => {
    setLoading(true)
    try {
      const [
        salesRes,
        adminRefillsRes,
        productsRes,
        dailyCylinderRes,
        dailySalesRes,
        dailyRefillsRes
      ] = await Promise.all([
        fetch('/api/sales', { cache: 'no-store' }),
        fetch(`/api/daily-refills?date=${date}`, { cache: 'no-store' }),
        fetch('/api/products', { cache: 'no-store' }),
        fetch(`/api/daily-cylinder-transactions?date=${date}`, { cache: 'no-store' }),
        fetch(`/api/daily-sales?date=${date}`, { cache: 'no-store' }), // Enhanced daily sales data
        fetch(`/api/daily-refills?date=${date}`, { cache: 'no-store' }) // Daily refills data
      ])

      const salesJson = await salesRes.json()
      const adminRefillsJson = await adminRefillsRes.json()
      const productsJson = await productsRes.json()
      const dailyCylinderJson = await dailyCylinderRes.json()
      const dailySalesJson = await dailySalesRes.json()
      const dailyRefillsJson = await dailyRefillsRes.json()

      // Process aggregated data
      const inSelectedDay = (dateStr: string) => {
        if (!dateStr) return false
        const d = new Date(dateStr)
        return d.toISOString().slice(0, 10) === date
      }

      // Initialize aggregation objects
      const gas: Record<string, number> = {}
      const cyl: Record<string, number> = {}
      const fullCyl: Record<string, number> = {} // Full cylinder sales
      const emptyCyl: Record<string, number> = {} // Empty cylinder sales
      const ref: Record<string, number> = {}
      const dep: Record<string, number> = {}
      const ret: Record<string, number> = {}

      const inc = (obj: Record<string, number>, key: string, val: number) => {
        obj[key] = (obj[key] || 0) + val
      }

      // Process sales data
      const salesList: any[] = Array.isArray(salesJson?.data) ? salesJson.data : []
      for (const s of salesList) {
        if (!inSelectedDay(s?.createdAt)) continue
        if (!Array.isArray(s?.items)) continue
        
        for (const item of s.items) {
          const productName = item?.product?.name || ''
          const category = item?.category || item?.product?.category || ''
          const quantity = Number(item?.quantity) || 0
          
          if (quantity <= 0 || !productName) continue
          
          const key = normalizeName(productName)
          
          if (category === 'gas') {
            inc(gas, key, quantity)
          } else if (category === 'cylinder') {
            inc(cyl, key, quantity)
          }
        }
      }

      // Process enhanced daily sales data for accurate tracking
      const dailySalesList: any[] = Array.isArray(dailySalesJson?.data) ? dailySalesJson.data : []
      console.log(`[DSR] Processing ${dailySalesList.length} daily sales records for ${date}`)
      
      for (const dailySale of dailySalesList) {
        const productName = dailySale.productName || ''
        const key = normalizeName(productName)
        
        // Gas Sales
        if (dailySale.gasSalesQuantity > 0) {
          inc(gas, key, dailySale.gasSalesQuantity)
          console.log(`[DSR] Gas Sale: ${productName} = ${dailySale.gasSalesQuantity}`)
        }
        
        // Full Cylinder Sales
        if (dailySale.fullCylinderSalesQuantity > 0) {
          inc(fullCyl, key, dailySale.fullCylinderSalesQuantity)
          console.log(`[DSR] Full Cylinder Sale: ${productName} = ${dailySale.fullCylinderSalesQuantity}`)
        }
        
        // Empty Cylinder Sales
        if (dailySale.emptyCylinderSalesQuantity > 0) {
          inc(emptyCyl, key, dailySale.emptyCylinderSalesQuantity)
          console.log(`[DSR] Empty Cylinder Sale: ${productName} = ${dailySale.emptyCylinderSalesQuantity}`)
        }
        
        // Cylinder Refills (from gas purchases with empty cylinders)
        if (dailySale.cylinderRefillsQuantity > 0) {
          inc(ref, key, dailySale.cylinderRefillsQuantity)
          console.log(`[DSR] Cylinder Refill: ${productName} = ${dailySale.cylinderRefillsQuantity}`)
        }
      }
      
      // Process daily refills data (from DailyRefill model)
      const dailyRefillsList: any[] = Array.isArray(dailyRefillsJson?.data) ? dailyRefillsJson.data : []
      console.log(`[DSR] Processing ${dailyRefillsList.length} daily refill records for ${date}`)
      
      for (const refill of dailyRefillsList) {
        const cylinderName = refill.cylinderName || ''
        const key = normalizeName(cylinderName)
        const refillQuantity = Number(refill.todayRefill) || 0
        
        if (refillQuantity > 0) {
          inc(ref, key, refillQuantity)
          console.log(`[DSR] Daily Refill: ${cylinderName} = ${refillQuantity}`)
        }
      }
      
      // Set state variables for use in component render
      setDailyGasSales(gas)
      setDailyFullCylinderSales(fullCyl)
      setDailyEmptyCylinderSales(emptyCyl)
      setDailyCylinderRefills(ref)

      // Note: Removed old cylinder transaction processing to avoid double counting
      // Now using unified daily cylinder transactions from DailyCylinderTransaction model

      // Process daily cylinder transactions
      const dailyCylinderList: any[] = Array.isArray(dailyCylinderJson?.data) ? dailyCylinderJson.data : []
      for (const dailyEntry of dailyCylinderList) {
        const cylinderName = dailyEntry.cylinderName || ''
        const depositQty = Number(dailyEntry.depositQuantity) || 0
        const returnQty = Number(dailyEntry.returnQuantity) || 0
        
        if (cylinderName) {
          const key = normalizeName(cylinderName)
          if (depositQty > 0) inc(dep, key, depositQty)
          if (returnQty > 0) inc(ret, key, returnQty)
        }
      }

      // Update state
      setDailyAggGasSales(gas)
      setDailyAggCylinderSales(cyl)
      setDailyAggRefills(ref)
      setDailyAggDeposits(dep)
      setDailyAggReturns(ret)
      
    } catch (error) {
      console.error('Failed to fetch DSR data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Initialize data on mount
  useEffect(() => {
    setDsrEntries(loadDsrLocal())
    fetchInventoryData()
    if (user.role === 'admin') {
      fetchEmployees()
    }
  }, [user.role])

  // Fetch DSR data when date changes
  useEffect(() => {
    if (showDSRView) {
      fetchDsrData(dsrViewDate)
    }
  }, [dsrViewDate, showDSRView])

  // Download DSR PDF for a specific date
  const downloadDsrGridPdf = (date: string) => {
    try {
      const byKey = new Map<string, DailyStockEntry>()
      dsrEntries.filter(e => e.date === date).forEach(e => byKey.set(normalizeName(e.itemName), e))
      
      const rowsSource = dsrProducts.length > 0 ? dsrProducts : []
      const rows = rowsSource.map(p => {
        const key = normalizeName(p.name)
        const e = byKey.get(key)
        
        const refilledVal = dailyAggRefills[key] ?? (e ? e.refilled : 0)
        const cylSalesVal = dailyAggCylinderSales[key] ?? (e ? e.cylinderSales : 0)
        const gasSalesVal = dailyAggGasSales[key] ?? (e ? e.gasSales : 0)
        const depositVal = dailyAggDeposits[key] ?? (e ? e.depositCylinder : 0)
        const returnVal = dailyAggReturns[key] ?? (e ? e.returnCylinder : 0)
        
        const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
        const openingFull = e?.openingFull ?? inventoryInfo.availableFull
        const openingEmpty = e?.openingEmpty ?? inventoryInfo.availableEmpty
        
        return `
          <tr>
            <td>${p.name}</td>
            <td>${openingFull}</td>
            <td>${openingEmpty}</td>
            <td>${refilledVal || 0}</td>
            <td>${cylSalesVal || 0}</td>
            <td>${gasSalesVal || 0}</td>
            <td>${depositVal || 0}</td>
            <td>${returnVal || 0}</td>
            <td>${typeof e?.closingFull === 'number' ? e!.closingFull : 0}</td>
            <td>${typeof e?.closingEmpty === 'number' ? e!.closingEmpty : 0}</td>
          </tr>
        `
      }).join('')

      const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Daily Stock Report – ${date}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 16px; }
            h1 { font-size: 18px; margin: 0 0 12px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
            th { background: #f7f7f7; text-align: left; }
          </style>
        </head>
        <body>
          <h1>Daily Stock Report – ${date}</h1>
          <table>
            <thead>
              <tr>
                <th>Items</th>
                <th colspan=2>Opening</th>
                <th colspan=5>During the day</th>
                <th colspan=2>Closing</th>
              </tr>
              <tr>
                <th></th>
                <th>Full</th>
                <th>Empty</th>
                <th>Refilled</th>
                <th>Cylinder Sales</th>
                <th>Gas Sales</th>
                <th>Deposit Cylinder</th>
                <th>Return Cylinder</th>
                <th>Full</th>
                <th>Empty</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </body>
      </html>`

      const w = window.open('', '_blank')
      if (!w) {
        alert('Please allow popups to download the PDF.')
        return
      }
      w.document.write(html)
      w.document.close()
      w.focus()
      w.print()
    } catch (err) {
      alert('Failed to prepare PDF')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 text-white">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">Daily Stock Report</h1>
        <p className="text-white/80 text-sm sm:text-base lg:text-lg">
          Automated daily stock tracking with real-time data from inventory, sales, and refilling operations
        </p>
      </div>

      {/* Main DSR Section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle style={{ color: "#2B3068" }}>Daily Stock Report</CardTitle>
          <p className="text-sm text-gray-600">
            Automated daily stock tracking with real-time data from inventory, sales, and refilling operations.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <Button 
            variant="outline" 
            onClick={() => setShowDSRView(true)} 
            className="w-full sm:w-auto" 
            style={{ backgroundColor: "#2B3068", color: "white" }}
          >
            <ListChecks className="h-4 w-4 mr-2" />
            View Daily Stock Report
          </Button>
          {user.role === 'admin' && (
            <div className="sm:ml-auto w-full sm:w-auto">
              <Button 
                variant="secondary" 
                onClick={() => setShowEmployeeDSR(true)} 
                className="w-full sm:w-auto"
              >
                View Employee Daily Stock Report
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Employee DSR Dialog */}
      {user.role === 'admin' && (
        <Dialog open={showEmployeeDSR} onOpenChange={setShowEmployeeDSR}>
          <DialogContent className="w-[95vw] max-w-[900px] p-3 sm:p-6 rounded-lg">
            <DialogHeader>
              <DialogTitle>Employee Daily Stock Report – {employeeDsrDate}</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Label htmlFor="employee-select">Select Employee</Label>
                  <select
                    id="employee-select"
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    className="w-full mt-1 p-2 border rounded-md"
                  >
                    <option value="">Select an employee</option>
                    {employees.map((emp) => (
                      <option key={emp._id} value={emp._id}>
                        {emp.name || emp.email}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <Label htmlFor="employee-dsr-date">Date</Label>
                  <Input
                    id="employee-dsr-date"
                    type="date"
                    value={employeeDsrDate}
                    onChange={(e) => setEmployeeDsrDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              
              <div className="text-center py-8">
                <p className="text-gray-500">Employee DSR functionality will be implemented here</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Main DSR Dialog */}
      <Dialog open={showDSRView} onOpenChange={setShowDSRView}>
        <DialogContent className="w-[95vw] max-w-[900px] p-3 sm:p-6 rounded-lg">
          <DialogHeader>
            <DialogTitle>Daily Stock Report – {dsrViewDate}</DialogTitle>
          </DialogHeader>
          
          <div className="mb-3 flex items-center gap-2">
            <Label htmlFor="dsr-date">Date:</Label>
            <Input
              id="dsr-date"
              type="date"
              value={dsrViewDate}
              onChange={(e) => setDsrViewDate(e.target.value)}
              className="w-auto"
            />
            <Button
              onClick={() => downloadDsrGridPdf(dsrViewDate)}
              variant="outline"
              size="sm"
              className="ml-auto"
            >
              <FileText className="h-4 w-4 mr-1" />
              PDF
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Loading DSR data...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="border-r">Items</TableHead>
                    <TableHead colSpan={2} className="text-center border-r">Opening</TableHead>
                    <TableHead colSpan={6} className="text-center border-r">During the day</TableHead>
                    <TableHead colSpan={2} className="text-center">Closing</TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead className="text-center">Full</TableHead>
                    <TableHead className="text-center border-r">Empty</TableHead>
                    <TableHead className="text-center">Refilled</TableHead>
                    <TableHead className="text-center">Full Cyl Sales</TableHead>
                    <TableHead className="text-center">Empty Cyl Sales</TableHead>
                    <TableHead className="text-center">Gas Sales</TableHead>
                    <TableHead className="text-center">Deposit Cylinder</TableHead>
                    <TableHead className="text-center border-r">Return Cylinder</TableHead>
                    <TableHead className="text-center">Full</TableHead>
                    <TableHead className="text-center">Empty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dsrProducts.map((product) => {
                    const key = normalizeName(product.name)
                    const entry = dsrEntries.find(e => e.date === dsrViewDate && normalizeName(e.itemName) === key)
                    
                    const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
                    const openingFull = entry?.openingFull ?? inventoryInfo.availableFull
                    const openingEmpty = entry?.openingEmpty ?? inventoryInfo.availableEmpty
                    const refilled = dailyCylinderRefills[key] ?? 0
                    const fullCylinderSales = dailyFullCylinderSales[key] ?? 0
                    const emptyCylinderSales = dailyEmptyCylinderSales[key] ?? 0
                    const gasSales = dailyGasSales[key] ?? 0
                    const deposits = dailyAggDeposits[key] ?? 0
                    const returns = dailyAggReturns[key] ?? 0
                    const closingFull = entry?.closingFull ?? 0
                    const closingEmpty = entry?.closingEmpty ?? 0

                    return (
                      <TableRow key={product._id}>
                        <TableCell className="font-medium border-r">{product.name}</TableCell>
                        <TableCell className="text-center">{openingFull}</TableCell>
                        <TableCell className="text-center border-r">{openingEmpty}</TableCell>
                        <TableCell className="text-center">{refilled}</TableCell>
                        <TableCell className="text-center">{fullCylinderSales}</TableCell>
                        <TableCell className="text-center">{emptyCylinderSales}</TableCell>
                        <TableCell className="text-center">{gasSales}</TableCell>
                        <TableCell className="text-center">{deposits}</TableCell>
                        <TableCell className="text-center border-r">{returns}</TableCell>
                        <TableCell className="text-center">{closingFull}</TableCell>
                        <TableCell className="text-center">{closingEmpty}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
