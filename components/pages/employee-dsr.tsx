"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CalendarIcon, RefreshCw, Eye, PlusCircle, FileText } from "lucide-react"

interface EmployeeDSRProps {
  user: {
    id: string
    name: string
    role: string
  }
}

interface DSRItem {
  itemName: string
  openingFull: number
  openingEmpty: number
  refilled: number
  fullCylinderSales: number
  emptyCylinderSales: number
  gasSales: number
  deposits: number
  returns: number
  transferGas: number
  transferEmpty: number
  receivedGas: number
  receivedEmpty: number
  closingFull: number
  closingEmpty: number
  category: string
}

export default function EmployeeDSR({ user }: EmployeeDSRProps) {
  const [dsrDate, setDsrDate] = useState(new Date().toISOString().slice(0, 10))
  const [dsrData, setDsrData] = useState<DSRItem[]>([])
  const [loading, setLoading] = useState(false)
  
  // Stored DSR reports with locked opening values
  const [storedDsrReports, setStoredDsrReports] = useState<Record<string, { openingFull: number; openingEmpty: number }>>({})
  const [isInventoryFetched, setIsInventoryFetched] = useState(false)
  const [inventoryData, setInventoryData] = useState<any[]>([])
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true)

  // Fetch stored employee DSR reports for opening values
  const fetchStoredEmployeeDsrReports = async (date: string) => {
    try {
      const response = await fetch(`/api/employee-daily-stock-reports?employeeId=${user.id}&date=${date}`)
      const data = await response.json()
      
      const reports: Record<string, { openingFull: number; openingEmpty: number }> = {}
      let hasStoredData = false
      
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        data.data.forEach((report: any) => {
          const key = report.itemName.toLowerCase().replace(/\s+/g, ' ').trim()
          reports[key] = {
            openingFull: report.openingFull || 0,
            openingEmpty: report.openingEmpty || 0
          }
        })
        hasStoredData = true
        setIsInventoryFetched(true)
      } else {
        // No stored data for this date - auto-fetch inventory for new days
        setIsInventoryFetched(false)
        if (inventoryData.length > 0) {
          await autoFetchEmployeeInventoryForNewDay(date)
          return
        }
      }
      
      setStoredDsrReports(reports)
    } catch (error) {
      console.error('Failed to fetch stored employee DSR reports:', error)
      setIsInventoryFetched(false)
    }
  }

  // Auto-fetch inventory for new days
  const autoFetchEmployeeInventoryForNewDay = async (date: string) => {
    try {
      const reports: Record<string, { openingFull: number; openingEmpty: number }> = {}
      
      for (const item of inventoryData) {
        if (item.category !== 'cylinder') continue
        
        const key = item.productName.toLowerCase().replace(/\s+/g, ' ').trim()
        
        // Auto-create employee DSR entry with current inventory for new day
        await fetch('/api/employee-daily-stock-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: user.id,
            date,
            itemName: item.productName,
            openingFull: item.availableFull || 0,
            openingEmpty: item.availableEmpty || 0
          })
        })
        
        reports[key] = {
          openingFull: item.availableFull || 0,
          openingEmpty: item.availableEmpty || 0
        }
      }
      
      setStoredDsrReports(reports)
      setIsInventoryFetched(true)
    } catch (error) {
      console.error('Failed to auto-fetch employee inventory for new day:', error)
    }
  }

  // Fetch and lock employee inventory
  const fetchAndLockEmployeeInventory = async () => {
    try {
      setLoading(true)
      
      // Fetch current inventory data
      let currentInventoryData = []
      
      // Try new inventory API first
      const newInventoryResponse = await fetch(`/api/employee-inventory-new/received?employeeId=${user.id}`)
      if (newInventoryResponse.ok) {
        const newInventoryResult = await newInventoryResponse.json()
        const newInventoryItems = newInventoryResult.data || []
        
        currentInventoryData = newInventoryItems.map((item: any) => ({
          productName: item.productName || item.name,
          availableFull: item.availableFull || 0,
          availableEmpty: item.availableEmpty || 0,
          currentStock: item.currentStock || item.quantity || 0,
          category: item.category
        }))
      }
      
      // If no data from new API, try old API
      if (currentInventoryData.length === 0) {
        const oldInventoryResponse = await fetch(`/api/employee-inventory-items?employeeId=${user.id}`)
        if (oldInventoryResponse.ok) {
          const oldInventoryResult = await oldInventoryResponse.json()
          currentInventoryData = oldInventoryResult.data || []
        }
      }
      
      const reports: Record<string, { openingFull: number; openingEmpty: number }> = {}
      
      for (const item of currentInventoryData) {
        if (item.category !== 'cylinder') continue
        
        const key = item.productName.toLowerCase().replace(/\s+/g, ' ').trim()
        
        // Create/update employee DSR entry with current inventory
        await fetch('/api/employee-daily-stock-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: user.id,
            date: dsrDate,
            itemName: item.productName,
            openingFull: item.availableFull || 0,
            openingEmpty: item.availableEmpty || 0
          })
        })
        
        reports[key] = {
          openingFull: item.availableFull || 0,
          openingEmpty: item.availableEmpty || 0
        }
      }
      
      setStoredDsrReports(reports)
      setIsInventoryFetched(true)
    } catch (error) {
      console.error('Failed to fetch and lock employee inventory:', error)
    } finally {
      setLoading(false)
    }
  }

  // Save employee DSR record with closing values
  const saveEmployeeDsrRecord = async () => {
    try {
      setLoading(true)
      
      for (const item of dsrData) {
        const key = item.itemName.toLowerCase().replace(/\s+/g, ' ').trim()
        const openingFull = storedDsrReports[key]?.openingFull || 0
        const openingEmpty = storedDsrReports[key]?.openingEmpty || 0
        
        // Calculate closing values using DSR formula
        const closingFull = Math.max(0, 
          openingFull + item.refilled - item.fullCylinderSales - item.gasSales - item.transferGas + item.receivedGas
        )
        // Closing Empty = Opening Full + Opening Empty - Full Cyl Sales - Empty Cyl Sales - Deposit Cylinder + Return Cylinder - Transfer Empty + Received Empty
        const closingEmpty = Math.max(0, 
          openingFull + openingEmpty - item.fullCylinderSales - item.emptyCylinderSales - item.deposits + item.returns - item.transferEmpty + item.receivedEmpty
        )
        
        await fetch('/api/employee-daily-stock-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: user.id,
            date: dsrDate,
            itemName: item.itemName,
            openingFull,
            openingEmpty,
            closingFull,
            closingEmpty
          })
        })
      }
      
      alert('Employee DSR record saved successfully!')
    } catch (error) {
      console.error('Failed to save employee DSR record:', error)
      alert('Failed to save employee DSR record')
    } finally {
      setLoading(false)
    }
  }

  // Fetch employee DSR data
  const fetchEmployeeDSR = async () => {
    if (!user.id || !dsrDate) return
    
    setLoading(true)
    try {
      console.log('🚀 Fetching employee DSR for:', { employeeId: user.id, date: dsrDate })
      
      // Step 1: Fetch sales data from daily employee sales
      const salesResponse = await fetch(`/api/daily-employee-sales?employeeId=${user.id}&date=${dsrDate}`)
      let salesData = []
      
      if (salesResponse.ok) {
        const salesResult = await salesResponse.json()
        salesData = salesResult.data || []
        console.log('📊 Sales data fetched:', salesData.length, 'records')
      }
      
      // Step 1.5: Fetch cylinder transaction data from daily employee cylinder aggregation
      const cylinderResponse = await fetch(`/api/daily-employee-cylinder-aggregation?employeeId=${user.id}&date=${dsrDate}`)
      let cylinderData = []
      
      if (cylinderResponse.ok) {
        const cylinderResult = await cylinderResponse.json()
        cylinderData = cylinderResult.data || []
        console.log('🔄 Cylinder data fetched:', cylinderData.length, 'records')
      }
      
      // Step 1.6: Fetch refill data from daily refills
      const refillResponse = await fetch(`/api/daily-refills?employeeId=${user.id}&date=${dsrDate}`)
      let refillData = []
      
      if (refillResponse.ok) {
        const refillResult = await refillResponse.json()
        refillData = refillResult.data || []
        console.log('⛽ Refill data fetched:', refillData.length, 'records')
      }
      
      // Step 2: Fetch inventory data for opening/closing stock
      let inventoryData = []
      
      // Try new inventory API first
      const newInventoryResponse = await fetch(`/api/employee-inventory-new/received?employeeId=${user.id}`)
      if (newInventoryResponse.ok) {
        const newInventoryResult = await newInventoryResponse.json()
        const newInventoryItems = newInventoryResult.data || []
        
        // Convert new API format to standard format
        inventoryData = newInventoryItems.map((item: any) => ({
          productName: item.productName || item.name,
          availableFull: item.availableFull || 0,
          availableEmpty: item.availableEmpty || 0,
          currentStock: item.currentStock || item.quantity || 0,
          category: item.category
        }))
        
        console.log('📦 Inventory data fetched:', inventoryData.length, 'items')
      }
      
      // If no data from new API, try old API
      if (inventoryData.length === 0) {
        const oldInventoryResponse = await fetch(`/api/employee-inventory-items?employeeId=${user.id}`)
        if (oldInventoryResponse.ok) {
          const oldInventoryResult = await oldInventoryResponse.json()
          inventoryData = oldInventoryResult.data || []
          console.log('📦 Fallback inventory data fetched:', inventoryData.length, 'items')
        }
      }
      
      // Step 3: Merge sales and inventory data into DSR format
      const dsrMap = new Map<string, DSRItem>()
      
      // Add sales data to DSR (only cylinder items)
      salesData.forEach((sale: any) => {
        // Skip gas items, only process cylinder items
        if (sale.category === 'gas') return
        
        const itemName = sale.productName
        
        if (dsrMap.has(itemName)) {
          // Merge with existing entry
          const existing = dsrMap.get(itemName)!
          existing.fullCylinderSales += sale.fullCylinderSalesQuantity || 0
          existing.emptyCylinderSales += sale.emptyCylinderSalesQuantity || 0
          existing.gasSales += sale.gasSalesQuantity || 0
        } else {
          // Create new entry from sales data
          dsrMap.set(itemName, {
            itemName: itemName,
            openingFull: 0,
            openingEmpty: 0,
            refilled: 0,
            fullCylinderSales: sale.fullCylinderSalesQuantity || 0,
            emptyCylinderSales: sale.emptyCylinderSalesQuantity || 0,
            gasSales: sale.gasSalesQuantity || 0,
            deposits: 0,
            returns: 0,
            transferGas: 0,
            transferEmpty: 0,
            receivedGas: 0,
            receivedEmpty: 0,
            closingFull: 0,
            closingEmpty: 0,
            category: 'cylinder'
          })
        }
      })
      
      // Add cylinder transaction data to DSR (deposits and returns)
      cylinderData.forEach((cylinder: any) => {
        const itemName = cylinder.productName
        
        if (dsrMap.has(itemName)) {
          // Merge with existing entry
          const existing = dsrMap.get(itemName)!
          existing.deposits += cylinder.totalDeposits || 0
          existing.returns += cylinder.totalReturns || 0
          existing.refilled += cylinder.totalRefills || 0
          existing.transferGas += cylinder.totalTransferGas || 0
          existing.transferEmpty += cylinder.totalTransferEmpty || 0
        } else {
          // Create new entry from cylinder data
          dsrMap.set(itemName, {
            itemName: itemName,
            openingFull: 0,
            openingEmpty: 0,
            refilled: cylinder.totalRefills || 0,
            fullCylinderSales: 0,
            emptyCylinderSales: 0,
            gasSales: 0,
            deposits: cylinder.totalDeposits || 0,
            returns: cylinder.totalReturns || 0,
            transferGas: cylinder.totalTransferGas || 0,
            transferEmpty: cylinder.totalTransferEmpty || 0,
            receivedGas: 0,
            receivedEmpty: 0,
            closingFull: 0,
            closingEmpty: 0,
            category: 'cylinder'
          })
        }
      })
      
      // Add refill data to DSR (cylinders refilled through gas purchases)
      refillData.forEach((refill: any) => {
        const itemName = refill.cylinderName
        
        if (dsrMap.has(itemName)) {
          // Merge with existing entry
          const existing = dsrMap.get(itemName)!
          existing.refilled += refill.todayRefill || 0
        } else {
          // Create new entry from refill data
          dsrMap.set(itemName, {
            itemName: itemName,
            openingFull: 0,
            openingEmpty: 0,
            refilled: refill.todayRefill || 0,
            fullCylinderSales: 0,
            emptyCylinderSales: 0,
            gasSales: 0,
            deposits: 0,
            returns: 0,
            transferGas: 0,
            transferEmpty: 0,
            receivedGas: 0,
            receivedEmpty: 0,
            closingFull: 0,
            closingEmpty: 0,
            category: 'cylinder'
          })
        }
      })
      
      // Store inventory data for later use
      setInventoryData(inventoryData)
      
      // Add inventory data to DSR (only cylinder items)
      inventoryData.forEach((item: any) => {
        if (item.category !== 'cylinder') return
        
        const itemName = item.productName
        const key = itemName.toLowerCase().replace(/\s+/g, ' ').trim()
        
        // Use stored opening values if available, otherwise use current inventory
        const openingFull = storedDsrReports[key]?.openingFull ?? (isInventoryFetched ? 0 : (item.availableFull || 0))
        const openingEmpty = storedDsrReports[key]?.openingEmpty ?? (isInventoryFetched ? 0 : (item.availableEmpty || 0))
        
        if (dsrMap.has(itemName)) {
          // Merge with existing sales entry
          const existing = dsrMap.get(itemName)!
          existing.openingFull = openingFull
          existing.openingEmpty = openingEmpty
          existing.closingFull = Math.max(0, openingFull + existing.refilled - existing.fullCylinderSales - existing.gasSales - existing.transferGas + existing.receivedGas)
          // Closing Empty = Opening Full + Opening Empty - Full Cyl Sales - Empty Cyl Sales - Deposit Cylinder + Return Cylinder - Transfer Empty + Received Empty
          existing.closingEmpty = Math.max(0, openingFull + openingEmpty - existing.fullCylinderSales - existing.emptyCylinderSales - existing.deposits + existing.returns - existing.transferEmpty + existing.receivedEmpty)
        } else {
          // Create new entry from inventory data (no sales)
          dsrMap.set(itemName, {
            itemName: itemName,
            openingFull,
            openingEmpty,
            refilled: 0,
            fullCylinderSales: 0,
            emptyCylinderSales: 0,
            gasSales: 0,
            deposits: 0,
            returns: 0,
            transferGas: 0,
            transferEmpty: 0,
            receivedGas: 0,
            receivedEmpty: 0,
            closingFull: openingFull,
            closingEmpty: openingEmpty,
            category: item.category
          })
        }
      })
      
      // Filter to show only cylinder items in DSR (exclude gas products)
      const finalDsrData = Array.from(dsrMap.values()).filter(item => {
        const itemNameLower = item.itemName.toLowerCase()
        // Exclude items that start with "gas " but include items with "cylinder" in the name
        return !itemNameLower.startsWith('gas ') || itemNameLower.includes('cylinder')
      })
      
      setDsrData(finalDsrData)
      
      // Fetch stored DSR reports for opening values
      await fetchStoredEmployeeDsrReports(dsrDate)
      
      console.log('✅ Employee DSR data processed:', {
        salesRecords: salesData.length,
        cylinderRecords: cylinderData.length,
        refillRecords: refillData.length,
        inventoryItems: inventoryData.length,
        finalDsrItems: finalDsrData.length,
        items: finalDsrData
      })
      
    } catch (error) {
      console.error('❌ Failed to fetch employee DSR:', error)
      setDsrData([])
    } finally {
      setLoading(false)
    }
  }

  // Fetch DSR data when component mounts or date changes
  useEffect(() => {
    if (user.id && dsrDate) {
      fetchEmployeeDSR()
    }
  }, [user.id, dsrDate])

  // Auto-fetch inventory when employee DSR opens for the first time (today's date)
  useEffect(() => {
    if (user.id && inventoryData.length > 0 && !isInventoryFetched) {
      const today = new Date().toISOString().slice(0, 10)
      if (dsrDate === today) {
        fetchStoredEmployeeDsrReports(dsrDate)
      }
    }
  }, [user.id, inventoryData.length, dsrDate, isInventoryFetched])

  // Auto-save employee DSR at 11:55 PM Dubai time
  useEffect(() => {
    if (!autoSaveEnabled || !user.id || !isInventoryFetched) return

    const checkAutoSave = () => {
      const now = new Date()
      // Convert to Dubai time (UTC+4)
      const dubaiTime = new Date(now.getTime() + (4 * 60 * 60 * 1000))
      const hours = dubaiTime.getHours()
      const minutes = dubaiTime.getMinutes()
      
      // Check if it's 11:55 PM Dubai time
      if (hours === 23 && minutes === 55) {
        const today = new Date().toISOString().slice(0, 10)
        if (dsrDate === today) {
          saveEmployeeDsrRecord()
          console.log('🕚 Auto-saved Employee DSR at 11:55 PM Dubai time')
        }
      }
    }

    // Check every minute
    const interval = setInterval(checkAutoSave, 60000)
    return () => clearInterval(interval)
  }, [autoSaveEnabled, user.id, isInventoryFetched, dsrDate])

  // Download DSR as PDF
  const downloadDsrGridPdf = (date: string) => {
    try {
      if (dsrData.length === 0) {
        alert('No DSR data available to download')
        return
      }

      const rows = dsrData.map(item => {
        return `
          <tr>
            <td>${item.itemName}</td>
            <td>${item.openingFull}</td>
            <td>${item.openingEmpty}</td>
            <td>${item.refilled}</td>
            <td>${item.fullCylinderSales}</td>
            <td>${item.emptyCylinderSales}</td>
            <td>${item.gasSales}</td>
            <td>${item.deposits}</td>
            <td>${item.returns}</td>
            <td>${item.transferGas}</td>
            <td>${item.transferEmpty}</td>
            <td>${item.receivedGas}</td>
            <td>${item.receivedEmpty}</td>
            <td>${item.closingFull}</td>
            <td>${item.closingEmpty}</td>
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
          <p><strong>Employee:</strong> ${user.name}</p>
          <table>
            <thead>
              <tr>
                <th>Items</th>
                <th colspan=2>Opening</th>
                <th colspan=10>During the day</th>
                <th colspan=2>Closing</th>
              </tr>
              <tr>
                <th></th>
                <th>Full</th>
                <th>Empty</th>
                <th>Refilled</th>
                <th>Full Cyl Sales</th>
                <th>Empty Cyl Sales</th>
                <th>Gas Sales</th>
                <th>Deposit Cylinder</th>
                <th>Return Cylinder</th>
                <th>Transfer Gas</th>
                <th>Transfer Empty</th>
                <th>Received Gas</th>
                <th>Received Empty</th>
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
      console.error('Failed to prepare PDF:', err)
      alert('Failed to prepare PDF')
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-2 sm:p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">My Daily Stock Report</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            View your daily stock activities and inventory status
          </p>
        </div>
        <Button onClick={fetchEmployeeDSR} disabled={loading} size="sm" className="w-full sm:w-auto">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Date Selection */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            Select Date
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 md:p-6">
          <div className="space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <div className="flex-1 w-full sm:max-w-sm">
                <Label htmlFor="dsr-date" className="text-xs sm:text-sm">DSR Date</Label>
                <Input
                  id="dsr-date"
                  type="date"
                  value={dsrDate}
                  onChange={(e) => setDsrDate(e.target.value)}
                  className="mt-1 text-sm"
                />
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground self-center">
                Employee: <span className="font-medium">{user.name}</span>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 flex-wrap">
              <Button
                onClick={fetchAndLockEmployeeInventory}
                variant="outline"
                size="sm"
                disabled={loading}
                className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 w-full sm:w-auto text-xs sm:text-sm"
              >
                <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                {isInventoryFetched ? 'Refresh Inventory' : 'Fetch Inventory'}
              </Button>
              
              {isInventoryFetched && (
                <Button
                  onClick={saveEmployeeDsrRecord}
                  size="sm"
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto text-xs sm:text-sm"
                >
                  <PlusCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  Save Record
                </Button>
              )}
              
              <span className="text-xs sm:text-sm text-gray-500">
                {isInventoryFetched ? '✓ Inventory Locked' : '⚠ Click Fetch Inventory'}
              </span>
              
              {isInventoryFetched && (
                <label className="flex items-center gap-2 text-xs sm:text-sm">
                  <input
                    type="checkbox"
                    checked={autoSaveEnabled}
                    onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                    className="rounded"
                  />
                  Auto-save at 11:55 PM
                </label>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DSR Table */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="text-base sm:text-lg">Daily Stock Report - {dsrDate}</CardTitle>
            {dsrData.length > 0 && (
              <Button
                onClick={() => downloadDsrGridPdf(dsrDate)}
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
              >
                <FileText className="h-4 w-4 mr-1" />
                Download PDF
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-2 sm:p-4 md:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-6 sm:py-8">
              <RefreshCw className="h-5 w-5 sm:h-6 sm:w-6 animate-spin mr-2" />
              <span className="text-sm sm:text-base">Loading DSR data...</span>
            </div>
          ) : dsrData.length === 0 ? (
            <div className="text-center py-6 sm:py-8 text-muted-foreground">
              <p className="text-sm sm:text-base">No DSR data found for {dsrDate}</p>
              <p className="text-xs sm:text-sm mt-1">Your daily stock activities will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <Table className="text-xs sm:text-sm min-w-[1200px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead rowSpan={2} className="border-r sticky left-0 bg-background z-10 min-w-[120px]">Items</TableHead>
                      <TableHead colSpan={2} className="text-center border-r">Opening</TableHead>
                      <TableHead colSpan={10} className="text-center border-r">During the day</TableHead>
                      <TableHead colSpan={2} className="text-center bg-blue-100 font-semibold">Closing</TableHead>
                    </TableRow>
                    <TableRow>
                      <TableHead className="text-center min-w-[60px]">Full</TableHead>
                      <TableHead className="text-center border-r min-w-[60px]">Empty</TableHead>
                      <TableHead className="text-center min-w-[70px]">Refilled</TableHead>
                      <TableHead className="text-center min-w-[90px]">Full Cyl Sales</TableHead>
                      <TableHead className="text-center min-w-[90px]">Empty Cyl Sales</TableHead>
                      <TableHead className="text-center min-w-[70px]">Gas Sales</TableHead>
                      <TableHead className="text-center min-w-[100px]">Deposit Cylinder</TableHead>
                      <TableHead className="text-center min-w-[100px]">Return Cylinder</TableHead>
                      <TableHead className="text-center min-w-[90px]">Transfer Gas</TableHead>
                      <TableHead className="text-center min-w-[100px]">Transfer Empty</TableHead>
                      <TableHead className="text-center min-w-[90px]">Received Gas</TableHead>
                      <TableHead className="text-center border-r min-w-[100px]">Received Empty</TableHead>
                      <TableHead className="text-center bg-blue-100 font-semibold min-w-[60px]">Full</TableHead>
                      <TableHead className="text-center bg-blue-100 font-semibold min-w-[60px]">Empty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dsrData.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium border-r sticky left-0 bg-background z-10 min-w-[120px]">{item.itemName}</TableCell>
                        <TableCell className="text-center min-w-[60px]">{item.openingFull}</TableCell>
                        <TableCell className="text-center border-r min-w-[60px]">{item.openingEmpty}</TableCell>
                        <TableCell className="text-center min-w-[70px]">{item.refilled}</TableCell>
                        <TableCell className="text-center min-w-[90px]">{item.fullCylinderSales}</TableCell>
                        <TableCell className="text-center min-w-[90px]">{item.emptyCylinderSales}</TableCell>
                        <TableCell className="text-center min-w-[70px]">{item.gasSales}</TableCell>
                        <TableCell className="text-center min-w-[100px]">{item.deposits}</TableCell>
                        <TableCell className="text-center min-w-[100px]">{item.returns}</TableCell>
                        <TableCell className="text-center min-w-[90px]">{item.transferGas}</TableCell>
                        <TableCell className="text-center min-w-[100px]">{item.transferEmpty}</TableCell>
                        <TableCell className="text-center min-w-[90px]">{item.receivedGas}</TableCell>
                        <TableCell className="text-center border-r min-w-[100px]">{item.receivedEmpty}</TableCell>
                        <TableCell className="text-center font-semibold bg-blue-50 min-w-[60px]">{item.closingFull}</TableCell>
                        <TableCell className="text-center font-semibold bg-blue-50 min-w-[60px]">{item.closingEmpty}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {dsrData.length > 0 && (
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="text-base sm:text-lg">Summary</CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-4 md:p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4">
              <div className="text-center p-2 sm:p-3">
                <div className="text-lg sm:text-xl md:text-2xl font-bold text-blue-600">
                  {dsrData.reduce((sum, item) => sum + item.fullCylinderSales, 0)}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-1">Full Cylinder Sales</div>
              </div>
              <div className="text-center p-2 sm:p-3">
                <div className="text-lg sm:text-xl md:text-2xl font-bold text-green-600">
                  {dsrData.reduce((sum, item) => sum + item.emptyCylinderSales, 0)}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-1">Empty Cylinder Sales</div>
              </div>
              <div className="text-center p-2 sm:p-3">
                <div className="text-lg sm:text-xl md:text-2xl font-bold text-purple-600">
                  {dsrData.reduce((sum, item) => sum + item.gasSales, 0)}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-1">Gas Sales</div>
              </div>
              <div className="text-center p-2 sm:p-3">
                <div className="text-lg sm:text-xl md:text-2xl font-bold text-red-600">
                  {dsrData.reduce((sum, item) => sum + item.transferGas, 0)}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-1">Transfer Gas</div>
              </div>
              <div className="text-center p-2 sm:p-3">
                <div className="text-lg sm:text-xl md:text-2xl font-bold text-yellow-600">
                  {dsrData.reduce((sum, item) => sum + item.transferEmpty, 0)}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-1">Transfer Empty</div>
              </div>
              <div className="text-center p-2 sm:p-3">
                <div className="text-lg sm:text-xl md:text-2xl font-bold text-orange-600">
                  {dsrData.length}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-1">Total Items</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
