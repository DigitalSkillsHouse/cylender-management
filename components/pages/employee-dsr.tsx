"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CalendarIcon, RefreshCw } from "lucide-react"

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
      
      // Add inventory data to DSR (only cylinder items)
      inventoryData.forEach((item: any) => {
        if (item.category !== 'cylinder') return
        
        const itemName = item.productName
        
        if (dsrMap.has(itemName)) {
          // Merge with existing sales entry
          const existing = dsrMap.get(itemName)!
          existing.openingFull = item.availableFull || 0
          existing.openingEmpty = item.availableEmpty || 0
          existing.closingFull = (item.availableFull || 0) - existing.fullCylinderSales
          existing.closingEmpty = (item.availableEmpty || 0) + existing.emptyCylinderSales
        } else {
          // Create new entry from inventory data (no sales)
          dsrMap.set(itemName, {
            itemName: itemName,
            openingFull: item.availableFull || 0,
            openingEmpty: item.availableEmpty || 0,
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
            closingFull: item.availableFull || 0,
            closingEmpty: item.availableEmpty || 0,
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Daily Stock Report</h1>
          <p className="text-muted-foreground">
            View your daily stock activities and inventory status
          </p>
        </div>
        <Button onClick={fetchEmployeeDSR} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Date Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Select Date
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-sm">
              <Label htmlFor="dsr-date">DSR Date</Label>
              <Input
                id="dsr-date"
                type="date"
                value={dsrDate}
                onChange={(e) => setDsrDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              Employee: <span className="font-medium">{user.name}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DSR Table */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Stock Report - {dsrDate}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              Loading DSR data...
            </div>
          ) : dsrData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No DSR data found for {dsrDate}</p>
              <p className="text-sm">Your daily stock activities will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="border-r">Items</TableHead>
                    <TableHead colSpan={2} className="text-center border-r">Opening</TableHead>
                    <TableHead colSpan={8} className="text-center border-r">During the day</TableHead>
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
                    <TableHead className="text-center">Return Cylinder</TableHead>
                    <TableHead className="text-center">Transfer Gas</TableHead>
                    <TableHead className="text-center">Transfer Empty</TableHead>
                    <TableHead className="text-center">Received Gas</TableHead>
                    <TableHead className="text-center border-r">Received Empty</TableHead>
                    <TableHead className="text-center">Full</TableHead>
                    <TableHead className="text-center">Empty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dsrData.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium border-r">{item.itemName}</TableCell>
                      <TableCell className="text-center">{item.openingFull}</TableCell>
                      <TableCell className="text-center border-r">{item.openingEmpty}</TableCell>
                      <TableCell className="text-center">{item.refilled}</TableCell>
                      <TableCell className="text-center">{item.fullCylinderSales}</TableCell>
                      <TableCell className="text-center">{item.emptyCylinderSales}</TableCell>
                      <TableCell className="text-center">{item.gasSales}</TableCell>
                      <TableCell className="text-center">{item.deposits}</TableCell>
                      <TableCell className="text-center">{item.returns}</TableCell>
                      <TableCell className="text-center">{item.transferGas}</TableCell>
                      <TableCell className="text-center">{item.transferEmpty}</TableCell>
                      <TableCell className="text-center">{item.receivedGas}</TableCell>
                      <TableCell className="text-center border-r">{item.receivedEmpty}</TableCell>
                      <TableCell className="text-center">{item.closingFull}</TableCell>
                      <TableCell className="text-center">{item.closingEmpty}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {dsrData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {dsrData.reduce((sum, item) => sum + item.fullCylinderSales, 0)}
                </div>
                <div className="text-sm text-muted-foreground">Full Cylinder Sales</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {dsrData.reduce((sum, item) => sum + item.emptyCylinderSales, 0)}
                </div>
                <div className="text-sm text-muted-foreground">Empty Cylinder Sales</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {dsrData.reduce((sum, item) => sum + item.gasSales, 0)}
                </div>
                <div className="text-sm text-muted-foreground">Gas Sales</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {dsrData.reduce((sum, item) => sum + item.transferGas, 0)}
                </div>
                <div className="text-sm text-muted-foreground">Transfer Gas</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {dsrData.reduce((sum, item) => sum + item.transferEmpty, 0)}
                </div>
                <div className="text-sm text-muted-foreground">Transfer Empty</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {dsrData.length}
                </div>
                <div className="text-sm text-muted-foreground">Total Items</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
