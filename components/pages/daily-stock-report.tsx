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
import { getLocalDateString } from "@/lib/date-utils"

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
  transfer?: number
  receivedBack?: number
  closingFull?: number
  closingEmpty?: number
  createdAt: string
}

interface EmployeeDailyStockEntry {
  _id: string
  employeeId: string
  date: string
  itemName: string
  openingFull: number
  openingEmpty: number
  emptyPurchase: number
  fullPurchase: number
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
  const [employeeDsrData, setEmployeeDsrData] = useState<EmployeeDailyStockEntry[]>([])
  const [employeeLoading, setEmployeeLoading] = useState(false)

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
  const [dailyEmptyPurchases, setDailyEmptyPurchases] = useState<Record<string, number>>({})
  const [dailyFullPurchases, setDailyFullPurchases] = useState<Record<string, number>>({})
  const [dailyTransfers, setDailyTransfers] = useState<Record<string, number>>({})
  const [dailyReceivedBack, setDailyReceivedBack] = useState<Record<string, number>>({})
  
  // New separate tracking for gas and empty cylinders
  const [dailyTransferGas, setDailyTransferGas] = useState<Record<string, number>>({})
  const [dailyTransferEmpty, setDailyTransferEmpty] = useState<Record<string, number>>({})
  const [dailyReceivedGas, setDailyReceivedGas] = useState<Record<string, number>>({})
  const [dailyReceivedEmpty, setDailyReceivedEmpty] = useState<Record<string, number>>({})
  
  // Inventory data for automated DSR
  const [inventoryData, setInventoryData] = useState<Record<string, { availableFull: number; availableEmpty: number; currentStock: number }>>({})
  
  // Stored DSR reports with locked opening values
  const [storedDsrReports, setStoredDsrReports] = useState<Record<string, { openingFull: number; openingEmpty: number }>>({})
  const [isInventoryFetched, setIsInventoryFetched] = useState(false)

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
      console.log('Fetching employees...')
      const response = await fetch('/api/employees')
      const data = await response.json()
      console.log('Employees API response:', data)
      
      if (Array.isArray(data)) {
        console.log('Found employees:', data)
        setEmployees(data)
        if (data.length > 0 && !selectedEmployeeId) {
          setSelectedEmployeeId(data[0]._id)
        }
      } else {
        console.log('No employees found or invalid response structure')
        setEmployees([])
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error)
      setEmployees([])
    }
  }

  // Fetch employee DSR data
  const fetchEmployeeDsrData = async (employeeId: string, date: string) => {
    if (!employeeId) return
    
    setEmployeeLoading(true)
    try {
      // Fetch stored DSR records (for opening/closing values)
      const storedDsrUrl = new URL('/api/employee-daily-stock-reports', window.location.origin)
      storedDsrUrl.searchParams.set('employeeId', employeeId)
      storedDsrUrl.searchParams.set('date', date)
      const storedDsrRes = await fetch(storedDsrUrl.toString(), { cache: 'no-store' })
      const storedDsrJson = await storedDsrRes.json()
      const storedList: any[] = Array.isArray(storedDsrJson)
        ? storedDsrJson
        : Array.isArray(storedDsrJson?.data?.data)
          ? storedDsrJson.data.data
          : Array.isArray(storedDsrJson?.data)
            ? storedDsrJson.data
            : []
      
      // Fetch employee inventory to show all cylinder products (even without sales)
      let inventoryData: any[] = []
      try {
        const inventoryRes = await fetch(`/api/employee-inventory-new/received?employeeId=${employeeId}`, { cache: 'no-store' })
        if (inventoryRes.ok) {
          const inventoryJson = await inventoryRes.json()
          inventoryData = inventoryJson?.data || []
        }
      } catch (error) {
        console.warn('Failed to fetch employee inventory:', error)
      }
      
      // If inventory API fails, try old API
      if (inventoryData.length === 0) {
        try {
          const oldInventoryRes = await fetch(`/api/employee-inventory-items?employeeId=${employeeId}`, { cache: 'no-store' })
          if (oldInventoryRes.ok) {
            const oldInventoryJson = await oldInventoryRes.json()
            inventoryData = oldInventoryJson?.data || []
          }
        } catch (error) {
          console.warn('Failed to fetch employee inventory from old API:', error)
        }
      }
      
      // Fetch actual employee transaction data for the date
      const [salesRes, cylinderRes, refillRes, empStockEmpRes, stockAssignmentsRes, purchaseRes] = await Promise.all([
        fetch(`/api/daily-employee-sales?employeeId=${employeeId}&date=${date}`, { cache: 'no-store' }),
        fetch(`/api/daily-employee-cylinder-aggregation?employeeId=${employeeId}&date=${date}`, { cache: 'no-store' }),
        fetch(`/api/daily-refills?employeeId=${employeeId}&date=${date}`, { cache: 'no-store' }),
        fetch(`/api/emp-stock-emp?employeeId=${employeeId}`, { cache: 'no-store' }),
        fetch(`/api/stock-assignments?employeeId=${employeeId}`, { cache: 'no-store' }),
        fetch(`/api/daily-cylinder-transactions?date=${date}&employeeId=${employeeId}`, { cache: 'no-store' })
      ])
      
      const salesJson = await salesRes.json()
      const cylinderJson = await cylinderRes.json()
      const refillJson = await refillRes.json()
      const empStockEmpJson = await empStockEmpRes.json()
      const stockAssignmentsJson = await stockAssignmentsRes.json()
      const purchaseJson = await purchaseRes.json()
      
      const salesData: any[] = salesJson?.data || []
      const cylinderData: any[] = cylinderJson?.data || []
      const refillData: any[] = refillJson?.data || []
      const empStockEmpData: any[] = empStockEmpJson?.data || []
      const stockAssignmentsData: any[] = stockAssignmentsJson?.data || []
      const purchaseData: any[] = purchaseJson?.data || []
      
      // Helper to check if date is in selected day
      const inSelectedDay = (dateStr: string) => {
        if (!dateStr) return false
        const d = new Date(dateStr)
        const selected = new Date(`${date}T00:00:00.000`)
        return d.toISOString().slice(0, 10) === selected.toISOString().slice(0, 10)
      }
      
      // Build a map of actual transaction data by product name
      const transactionMap = new Map<string, {
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
        emptyPurchase: number
        fullPurchase: number
      }>()
      
      // Process sales data
      salesData.forEach((sale: any) => {
        if (sale.category === 'gas') return // Skip gas items, only process cylinders
        
        const itemName = sale.productName || ''
        if (!itemName) return
        
        const existing = transactionMap.get(itemName) || {
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
          emptyPurchase: 0,
          fullPurchase: 0
        }
        
        existing.fullCylinderSales += Number(sale.fullCylinderSalesQuantity || 0)
        existing.emptyCylinderSales += Number(sale.emptyCylinderSalesQuantity || 0)
        existing.gasSales += Number(sale.gasSalesQuantity || 0)
        
        transactionMap.set(itemName, existing)
      })
      
      // Process cylinder transaction data
      cylinderData.forEach((cylinder: any) => {
        const itemName = cylinder.productName || ''
        if (!itemName) return
        
        const existing = transactionMap.get(itemName) || {
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
          emptyPurchase: 0,
          fullPurchase: 0
        }
        
        existing.refilled += Number(cylinder.totalRefills || 0)
        existing.deposits += Number(cylinder.totalDeposits || 0)
        existing.returns += Number(cylinder.totalReturns || 0)
        // Add transfers from cylinder aggregation API (already tracked, no double counting)
        existing.transferGas += Number(cylinder.totalTransferGas || 0)
        existing.transferEmpty += Number(cylinder.totalTransferEmpty || 0)
        existing.receivedGas += Number(cylinder.totalReceivedGas || 0)
        existing.receivedEmpty += Number(cylinder.totalReceivedEmpty || 0)
        
        transactionMap.set(itemName, existing)
      })
      
      // Process refill data
      refillData.forEach((refill: any) => {
        const itemName = refill.cylinderName || ''
        if (!itemName) return
        
        const existing = transactionMap.get(itemName) || {
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
          emptyPurchase: 0,
          fullPurchase: 0
        }
        
        existing.refilled += Number(refill.todayRefill || 0)
        
        transactionMap.set(itemName, existing)
      })
      
      // Process EmpStockEmp assignments (transfers from admin to employee)
      // NOTE: Skipping EmpStockEmp transfer processing to avoid double counting
      // Transfers are already tracked in:
      // 1. StockAssignment records (processed below)
      // 2. daily-employee-cylinder-aggregation API (cylinderData.totalTransferGas/totalTransferEmpty)
      // Processing EmpStockEmp would cause double counting
      console.log(`[Employee DSR] Skipping ${empStockEmpData.length} EmpStockEmp assignments - transfers already tracked in StockAssignment and cylinder aggregation`)
      
      // EmpStockEmp transfers are now tracked via StockAssignment and cylinder aggregation API
      // Only process if needed for other purposes (not transfers)
      
      // Process StockAssignment records (from Employee Management page)
      // NOTE: Skipping StockAssignment processing for employee DSR to avoid double counting
      // Transfers are already tracked in daily-employee-cylinder-aggregation API (cylinderData)
      // This ensures consistency with the employee's own DSR view
      console.log(`[Employee DSR] Skipping ${stockAssignmentsData.length} StockAssignment records - transfers already tracked in cylinder aggregation API`)
      
      // StockAssignment transfers are now tracked via cylinder aggregation API
      // This matches how the employee DSR component processes data
      
      // Merge stored DSR records with actual transaction data
      const storedMap = new Map<string, any>()
      storedList.forEach((d: any) => {
        storedMap.set((d.itemName || '').toLowerCase(), d)
      })
      
      // Get all unique product names from stored DSR, transactions, and inventory
      const allProductNames = new Set<string>()
      storedList.forEach((d: any) => {
        if (d.itemName) allProductNames.add(d.itemName)
      })
      transactionMap.forEach((_, itemName) => {
        allProductNames.add(itemName)
      })
      // Add all cylinder products from inventory (even if no transactions)
      inventoryData.forEach((item: any) => {
        if (item.category === 'cylinder' && item.productName) {
          allProductNames.add(item.productName)
        }
      })
      
      // Build merged DSR entries
      const mergedData: EmployeeDailyStockEntry[] = Array.from(allProductNames).map((itemName) => {
        const stored = storedMap.get(itemName.toLowerCase())
        const transactions = transactionMap.get(itemName) || {
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
          emptyPurchase: 0,
          fullPurchase: 0
        }
        
        // Find inventory item for this product to get opening stock if not stored
        const inventoryItem = inventoryData.find((item: any) => 
          item.productName === itemName && item.category === 'cylinder'
        )
        
        // Use stored opening values if available, otherwise use current inventory
        const openingFull = stored?.openingFull !== undefined 
          ? Number(stored.openingFull) 
          : (inventoryItem ? Number(inventoryItem.availableFull || 0) : 0)
        const openingEmpty = stored?.openingEmpty !== undefined 
          ? Number(stored.openingEmpty) 
          : (inventoryItem ? Number(inventoryItem.availableEmpty || 0) : 0)
        
        // Calculate closing values if not stored
        let closingFull = stored?.closingFull
        let closingEmpty = stored?.closingEmpty
        
        if (closingFull === undefined || closingEmpty === undefined) {
          // Calculate closing using DSR formula (matching admin DSR)
          // Closing Full = Opening Full + Full Purchase + Refilled - Full Cyl Sales - Gas Sales - Transfer Gas + Received Gas
          closingFull = Math.max(0, 
            openingFull + (transactions.fullPurchase || 0) + transactions.refilled - transactions.fullCylinderSales - transactions.gasSales - transactions.transferGas + transactions.receivedGas
          )
          // Closing Empty = Opening Full + Opening Empty + Full Purchase + Empty Purchase - Full Cyl Sales - Empty Cyl Sales - Deposit Cylinder + Return Cylinder - Transfer Empty + Received Empty - Closing Full
          closingEmpty = Math.max(0, 
            openingFull + openingEmpty + (transactions.fullPurchase || 0) + (transactions.emptyPurchase || 0) - transactions.fullCylinderSales - transactions.emptyCylinderSales - transactions.deposits + transactions.returns - transactions.transferEmpty + transactions.receivedEmpty - closingFull
          )
        }
        
        return {
          _id: String(stored?._id || `${itemName}-${date}`),
          employeeId: employeeId,
          date: date,
          itemName: itemName,
          openingFull: openingFull,
          openingEmpty: openingEmpty,
          emptyPurchase: transactions.emptyPurchase || 0,
          fullPurchase: transactions.fullPurchase || 0,
          refilled: transactions.refilled || Number(stored?.refilled || 0),
          fullCylinderSales: transactions.fullCylinderSales || Number(stored?.fullCylinderSales || 0),
          emptyCylinderSales: transactions.emptyCylinderSales || Number(stored?.emptyCylinderSales || 0),
          gasSales: transactions.gasSales || Number(stored?.gasSales || 0),
          deposits: transactions.deposits || Number(stored?.deposits || 0),
          returns: transactions.returns || Number(stored?.returns || 0),
          transferGas: transactions.transferGas || 0,
          transferEmpty: transactions.transferEmpty || 0,
          receivedGas: transactions.receivedGas || 0,
          receivedEmpty: transactions.receivedEmpty || 0,
          closingFull: typeof closingFull === 'number' ? closingFull : 0,
          closingEmpty: typeof closingEmpty === 'number' ? closingEmpty : 0,
          createdAt: stored?.createdAt || new Date().toISOString(),
        }
      })
      
      setEmployeeDsrData(mergedData)
    } catch (error) {
      console.error('Failed to fetch employee DSR data:', error)
      setEmployeeDsrData([])
    } finally {
      setEmployeeLoading(false)
    }
  }

  // Fetch inventory data for automated DSR
  const fetchInventoryData = async () => {
    try {
      // Fetch admin inventory and products
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
      
      // Admin sees all cylinder products
      const productsToShow = products.filter((product: any) => product.category === 'cylinder')
      setDsrProducts(productsToShow.map((p: any) => ({ _id: p._id, name: p.name })))
      
      const inventoryMap: Record<string, { availableFull: number; availableEmpty: number; currentStock: number }> = {}
      
      // Map inventory items by product name
      inventoryItems.forEach((item: any) => {
        // Admin inventory structure
        const productName = item.productName || ''
        const availableFull = Number(item.availableFull) || 0
        const availableEmpty = Number(item.availableEmpty) || 0
        const currentStock = Number(item.currentStock) || 0
        
        if (productName) {
          const normalizedName = normalizeName(productName)
          inventoryMap[normalizedName] = {
            availableFull,
            availableEmpty,
            currentStock
          }
        }
      })
      
      setInventoryData(inventoryMap)
    } catch (error) {
      console.error('Failed to fetch inventory data:', error)
    }
  }

  // Fetch stored DSR reports for opening values
  const fetchStoredDsrReports = async (date: string) => {
    try {
      const response = await fetch(`/api/daily-stock-reports?date=${date}`)
      const data = await response.json()
      
      const reports: Record<string, { openingFull: number; openingEmpty: number }> = {}
      let hasStoredData = false
      
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        // Check if stored data has valid opening stock (non-zero) or if we need to fetch previous day's closing stock
        const hasValidOpeningStock = data.data.some((report: any) => 
          (report.openingFull && report.openingFull > 0) || (report.openingEmpty && report.openingEmpty > 0)
        )
        
        if (hasValidOpeningStock) {
          // Use stored data with valid opening stock
          data.data.forEach((report: any) => {
            const key = normalizeName(report.itemName)
            reports[key] = {
              openingFull: report.openingFull || 0,
              openingEmpty: report.openingEmpty || 0
            }
          })
          hasStoredData = true
          setIsInventoryFetched(true)
          setStoredDsrReports(reports)
          console.log(`✅ [DSR] Using stored data for ${date} with valid opening stock`)
        } else {
          // Stored data exists but has zero opening stock - fetch previous day's closing stock instead
          console.log(`⚠️ [DSR] Stored data for ${date} has zero opening stock, fetching previous day's closing stock...`)
          setIsInventoryFetched(false)
          
          // Get previous day's date to fetch closing stock
          const currentDate = new Date(date + 'T00:00:00')
          const previousDate = new Date(currentDate)
          previousDate.setDate(previousDate.getDate() - 1)
          const previousDateStr = previousDate.toISOString().slice(0, 10)
          
          console.log(`🔍 [DSR] Fetching previous day (${previousDateStr}) closing stock for ${date}...`)
          
          const prevResponse = await fetch(`/api/daily-stock-reports?date=${previousDateStr}`)
          const prevData = await prevResponse.json()
          
          const prevReports: Record<string, { openingFull: number; openingEmpty: number }> = {}
          
          if (prevData.success && Array.isArray(prevData.data) && prevData.data.length > 0) {
            console.log(`📊 [DSR] Found ${prevData.data.length} reports from previous day (${previousDateStr})`)
            prevData.data.forEach((report: any) => {
              const key = normalizeName(report.itemName)
              // Use previous day's closing stock as opening stock
              const prevClosingFull = report.closingFull ?? 0
              const prevClosingEmpty = report.closingEmpty ?? 0
              prevReports[key] = {
                openingFull: prevClosingFull,
                openingEmpty: prevClosingEmpty
              }
              console.log(`✅ [DSR] ${report.itemName} (key: ${key}): Previous day closing = ${prevClosingFull} Full, ${prevClosingEmpty} Empty → Using as opening stock`)
            })
            setStoredDsrReports(prevReports)
            console.log(`✅ [DSR] Set storedDsrReports with ${Object.keys(prevReports).length} items for ${date}`)
            console.log(`📋 [DSR] storedDsrReports contents:`, prevReports)
            
            // Update the stored DSR records in database with correct opening stock
            if (dsrProducts.length > 0) {
              for (const product of dsrProducts) {
                const key = normalizeName(product.name)
                const prevClosing = prevReports[key]
                if (prevClosing) {
                  await fetch('/api/daily-stock-reports', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      date,
                      itemName: product.name,
                      openingFull: prevClosing.openingFull,
                      openingEmpty: prevClosing.openingEmpty
                    })
                  })
                }
              }
              console.log(`✅ [DSR] Updated stored DSR records with previous day's closing stock`)
            }
          } else {
            console.log(`⚠️ [DSR] No previous day data found for ${previousDateStr}, will use current inventory`)
          }
        }
      } else {
        // No stored data for this date - fetch previous day's closing stock to use as opening stock
        console.log(`📅 [DSR] No stored data for ${date}, fetching previous day's closing stock...`)
        setIsInventoryFetched(false)
        
        // Get previous day's date to fetch closing stock
        const currentDate = new Date(date + 'T00:00:00')
        const previousDate = new Date(currentDate)
        previousDate.setDate(previousDate.getDate() - 1)
        const previousDateStr = previousDate.toISOString().slice(0, 10)
        
        console.log(`🔍 [DSR] Fetching previous day (${previousDateStr}) closing stock for ${date}...`)
        
        const prevResponse = await fetch(`/api/daily-stock-reports?date=${previousDateStr}`)
        const prevData = await prevResponse.json()
        
        const prevReports: Record<string, { openingFull: number; openingEmpty: number }> = {}
        
        if (prevData.success && Array.isArray(prevData.data) && prevData.data.length > 0) {
          console.log(`📊 [DSR] Found ${prevData.data.length} reports from previous day (${previousDateStr})`)
          prevData.data.forEach((report: any) => {
            const key = normalizeName(report.itemName)
            // Use previous day's closing stock as opening stock
            const prevClosingFull = report.closingFull ?? 0
            const prevClosingEmpty = report.closingEmpty ?? 0
            prevReports[key] = {
              openingFull: prevClosingFull,
              openingEmpty: prevClosingEmpty
            }
            console.log(`✅ [DSR] ${report.itemName} (key: ${key}): Previous day closing = ${prevClosingFull} Full, ${prevClosingEmpty} Empty → Using as opening stock`)
          })
          // IMPORTANT: Set storedDsrReports BEFORE calling autoFetchInventoryForNewDay
          // This ensures the table displays the correct opening stock immediately
          setStoredDsrReports(prevReports)
          console.log(`✅ [DSR] Set storedDsrReports with ${Object.keys(prevReports).length} items for ${date}`)
          console.log(`📋 [DSR] storedDsrReports contents:`, prevReports)
        } else {
          console.log(`⚠️ [DSR] No previous day data found for ${previousDateStr} (response: ${prevData.success ? 'success but empty' : 'failed'}), will use current inventory`)
        }
        
        // If products are loaded, also call autoFetchInventoryForNewDay to create DSR entries in database
        // But don't let it overwrite storedDsrReports - we already set it above
        if (dsrProducts.length > 0) {
          await autoFetchInventoryForNewDay(date)
          // After autoFetchInventoryForNewDay, ensure storedDsrReports still has the previous day's closing stock
          // (autoFetchInventoryForNewDay should use the same values, but we'll preserve what we set)
          if (Object.keys(prevReports).length > 0) {
            setStoredDsrReports(prevReports)
            console.log(`✅ [DSR] Preserved previous day's closing stock after autoFetchInventoryForNewDay`)
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch stored DSR reports:', error)
      setIsInventoryFetched(false)
    }
  }

  // Auto-fetch inventory for new days
  const autoFetchInventoryForNewDay = async (date: string) => {
    try {
      await fetchInventoryData()
      
      // Get previous day's date to fetch closing stock
      const currentDate = new Date(date + 'T00:00:00')
      const previousDate = new Date(currentDate)
      previousDate.setDate(previousDate.getDate() - 1)
      const previousDateStr = previousDate.toISOString().slice(0, 10)
      
      // Fetch previous day's DSR to get closing stock
      const prevResponse = await fetch(`/api/daily-stock-reports?date=${previousDateStr}`)
      const prevData = await prevResponse.json()
      const prevReports: Record<string, { closingFull: number; closingEmpty: number }> = {}
      
      if (prevData.success && Array.isArray(prevData.data) && prevData.data.length > 0) {
        prevData.data.forEach((report: any) => {
          const key = normalizeName(report.itemName)
          prevReports[key] = {
            closingFull: report.closingFull || 0,
            closingEmpty: report.closingEmpty || 0
          }
        })
        console.log(`📦 [AUTO-FETCH] Loaded ${Object.keys(prevReports).length} items from previous day (${previousDateStr})`)
      }
      
      const reports: Record<string, { openingFull: number; openingEmpty: number }> = {}
      
      for (const product of dsrProducts) {
        const key = normalizeName(product.name)
        const prevClosing = prevReports[key]
        const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
        
        // Use previous day's closing stock as opening stock, fallback to current inventory
        const openingFull = prevClosing?.closingFull ?? inventoryInfo.availableFull ?? 0
        const openingEmpty = prevClosing?.closingEmpty ?? inventoryInfo.availableEmpty ?? 0
        
        console.log(`📅 [AUTO-FETCH] ${product.name}: Opening = ${openingFull} Full, ${openingEmpty} Empty (from previous day closing: ${prevClosing ? `${prevClosing.closingFull}/${prevClosing.closingEmpty}` : 'N/A'})`)
        
        // Auto-create DSR entry with previous day's closing stock as opening stock
        await fetch('/api/daily-stock-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            itemName: product.name,
            openingFull: openingFull,
            openingEmpty: openingEmpty
          })
        })
        
        reports[key] = {
          openingFull: openingFull,
          openingEmpty: openingEmpty
        }
      }
      
      // Only update storedDsrReports if it's not already set (to preserve values from fetchStoredDsrReports)
      // This prevents overwriting the correct opening stock values
      setStoredDsrReports((prev) => {
        // If prev is empty, use reports. Otherwise, merge but prefer prev values
        if (Object.keys(prev).length === 0) {
          return reports
        } else {
          // Merge: use prev if it exists, otherwise use reports
          const merged: Record<string, { openingFull: number; openingEmpty: number }> = {}
          for (const product of dsrProducts) {
            const key = normalizeName(product.name)
            merged[key] = prev[key] || reports[key] || { openingFull: 0, openingEmpty: 0 }
          }
          return merged
        }
      })
      setIsInventoryFetched(true)
    } catch (error) {
      console.error('Failed to auto-fetch inventory for new day:', error)
    }
  }

  // Fetch inventory and create DSR entries
  const fetchAndLockInventory = async () => {
    try {
      setLoading(true)
      await fetchInventoryData()
      
      // Get previous day's date to fetch closing stock
      const currentDate = new Date(dsrViewDate + 'T00:00:00')
      const previousDate = new Date(currentDate)
      previousDate.setDate(previousDate.getDate() - 1)
      const previousDateStr = previousDate.toISOString().slice(0, 10)
      
      // Fetch previous day's DSR to get closing stock
      const prevResponse = await fetch(`/api/daily-stock-reports?date=${previousDateStr}`)
      const prevData = await prevResponse.json()
      const prevReports: Record<string, { closingFull: number; closingEmpty: number }> = {}
      
      if (prevData.success && Array.isArray(prevData.data) && prevData.data.length > 0) {
        prevData.data.forEach((report: any) => {
          const key = normalizeName(report.itemName)
          prevReports[key] = {
            closingFull: report.closingFull || 0,
            closingEmpty: report.closingEmpty || 0
          }
        })
      }
      
      const reports: Record<string, { openingFull: number; openingEmpty: number }> = {}
      
      for (const product of dsrProducts) {
        const key = normalizeName(product.name)
        const prevClosing = prevReports[key]
        const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
        
        // Use previous day's closing stock as opening stock, fallback to current inventory
        const openingFull = prevClosing?.closingFull ?? inventoryInfo.availableFull ?? 0
        const openingEmpty = prevClosing?.closingEmpty ?? inventoryInfo.availableEmpty ?? 0
        
        console.log(`📅 [OPENING STOCK] ${product.name}: Opening = ${openingFull} Full, ${openingEmpty} Empty (from previous day closing: ${prevClosing ? `${prevClosing.closingFull}/${prevClosing.closingEmpty}` : 'N/A'})`)
        
        // Create/update DSR entry with previous day's closing stock as opening stock
        await fetch('/api/daily-stock-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: dsrViewDate,
            itemName: product.name,
            openingFull: openingFull,
            openingEmpty: openingEmpty
          })
        })
        
        reports[key] = {
          openingFull: openingFull,
          openingEmpty: openingEmpty
        }
      }
      
      setStoredDsrReports(reports)
      setIsInventoryFetched(true)
    } catch (error) {
      console.error('Failed to fetch and lock inventory:', error)
    } finally {
      setLoading(false)
    }
  }

  // Save DSR record with closing values
  const saveDsrRecord = async (date: string, isManual: boolean = false) => {
    const saveType = isManual ? 'MANUAL SAVE' : 'AUTO-SAVE'
    
    try {
      // Get current Dubai time for logging
      const now = new Date()
      const dubaiTime = now.toLocaleString('en-US', {
        timeZone: 'Asia/Dubai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
      console.log(`💾 [${saveType}] Saving DSR records for date: ${date} at Dubai time: ${dubaiTime}`)
      
      for (const product of dsrProducts) {
        const key = normalizeName(product.name)
        const openingFull = storedDsrReports[key]?.openingFull || 0
        const openingEmpty = storedDsrReports[key]?.openingEmpty || 0
        
        // Get all transaction data
        const refilled = dailyCylinderRefills[key] ?? 0
        const fullCylinderSales = dailyFullCylinderSales[key] ?? 0
        const emptyCylinderSales = dailyEmptyCylinderSales[key] ?? 0
        const gasSales = dailyGasSales[key] ?? 0
        const deposits = dailyAggDeposits[key] ?? 0
        const returns = dailyAggReturns[key] ?? 0
        const transferGasQuantity = dailyTransferGas[key] ?? 0
        const transferEmptyQuantity = dailyTransferEmpty[key] ?? 0
        const receivedGasQuantity = dailyReceivedGas[key] ?? 0
        const receivedEmptyQuantity = dailyReceivedEmpty[key] ?? 0
        const emptyPurchase = dailyEmptyPurchases[key] ?? 0
        const fullPurchase = dailyFullPurchases[key] ?? 0
        
        // Calculate closing values using the correct formula
        // Closing Full = Opening Full + Full Purchase + Refilled - Full Cyl Sales - Gas Sales - Transfer Gas + Received Gas
        const closingFull = Math.max(0, 
          openingFull + fullPurchase + refilled - fullCylinderSales - gasSales - transferGasQuantity + receivedGasQuantity
        )
        // Closing Empty = Opening Full + Opening Empty + Full Purchase + Empty Purchase - Full Cyl Sales - Empty Cyl Sales - Deposit Cylinder + Return Cylinder - Transfer Empty + Received Empty - Closing Full
        const closingEmpty = Math.max(0, 
          openingFull + openingEmpty + fullPurchase + emptyPurchase - fullCylinderSales - emptyCylinderSales - deposits + returns - transferEmptyQuantity + receivedEmptyQuantity - closingFull
        )
        
        await fetch('/api/daily-stock-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: date,
            itemName: product.name,
            openingFull,
            openingEmpty,
            emptyPurchase,
            fullPurchase,
            refilled,
            fullCylinderSales,
            emptyCylinderSales,
            gasSales,
            deposits,
            returns,
            transferGas: transferGasQuantity,
            transferEmpty: transferEmptyQuantity,
            receivedGas: receivedGasQuantity,
            receivedEmpty: receivedEmptyQuantity,
            closingFull,
            closingEmpty
          })
        })
      }
      
      // Log completion with Dubai time
      const completionTime = new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Dubai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
      console.log(`✅ [${saveType}] DSR records saved successfully for date: ${date} at Dubai time: ${completionTime}`)
      
      // Verify next day's opening stock would use today's closing stock
      if (isManual) {
        const currentDate = new Date(date + 'T00:00:00')
        const nextDate = new Date(currentDate)
        nextDate.setDate(nextDate.getDate() + 1)
        const nextDateStr = nextDate.toISOString().slice(0, 10)
        
        console.log(`🔍 [VERIFICATION] Checking if next day (${nextDateStr}) would use today's closing stock as opening stock...`)
        
        // Calculate today's closing stock for verification
        const todayClosingStocks: Record<string, { closingFull: number; closingEmpty: number }> = {}
        for (const product of dsrProducts) {
          const key = normalizeName(product.name)
          const openingFull = storedDsrReports[key]?.openingFull || 0
          const openingEmpty = storedDsrReports[key]?.openingEmpty || 0
          const refilled = dailyCylinderRefills[key] ?? 0
          const fullCylinderSales = dailyFullCylinderSales[key] ?? 0
          const emptyCylinderSales = dailyEmptyCylinderSales[key] ?? 0
          const gasSales = dailyGasSales[key] ?? 0
          const deposits = dailyAggDeposits[key] ?? 0
          const returns = dailyAggReturns[key] ?? 0
          const transferGasQuantity = dailyTransferGas[key] ?? 0
          const transferEmptyQuantity = dailyTransferEmpty[key] ?? 0
          const receivedGasQuantity = dailyReceivedGas[key] ?? 0
          const receivedEmptyQuantity = dailyReceivedEmpty[key] ?? 0
          const emptyPurchase = dailyEmptyPurchases[key] ?? 0
          const fullPurchase = dailyFullPurchases[key] ?? 0
          
          const closingFull = Math.max(0, 
            openingFull + fullPurchase + refilled - fullCylinderSales - gasSales - transferGasQuantity + receivedGasQuantity
          )
          const closingEmpty = Math.max(0, 
            openingFull + openingEmpty + fullPurchase + emptyPurchase - fullCylinderSales - emptyCylinderSales - deposits + returns - transferEmptyQuantity + receivedEmptyQuantity - closingFull
          )
          
          todayClosingStocks[key] = { closingFull, closingEmpty }
        }
        
        // Fetch what would be used as opening stock for next day
        const nextDayResponse = await fetch(`/api/daily-stock-reports?date=${nextDateStr}`)
        const nextDayData = await nextDayResponse.json()
        
        // Check a few products to verify
        let verifiedCount = 0
        let totalChecked = 0
        
        for (const product of dsrProducts.slice(0, 5)) { // Check first 5 products
          const key = normalizeName(product.name)
          const todayClosing = todayClosingStocks[key] || { closingFull: 0, closingEmpty: 0 }
          
          if (nextDayData.success && Array.isArray(nextDayData.data)) {
            const nextDayReport = nextDayData.data.find((r: any) => normalizeName(r.itemName) === key)
            if (nextDayReport) {
              totalChecked++
              const nextDayOpeningFull = nextDayReport.openingFull || 0
              const nextDayOpeningEmpty = nextDayReport.openingEmpty || 0
              
              if (nextDayOpeningFull === todayClosing.closingFull && nextDayOpeningEmpty === todayClosing.closingEmpty) {
                verifiedCount++
                console.log(`✅ [VERIFICATION] ${product.name}: Next day opening matches today's closing (${todayClosing.closingFull} Full, ${todayClosing.closingEmpty} Empty)`)
              } else {
                console.log(`⚠️ [VERIFICATION] ${product.name}: Next day opening (${nextDayOpeningFull} Full, ${nextDayOpeningEmpty} Empty) does NOT match today's closing (${todayClosing.closingFull} Full, ${todayClosing.closingEmpty} Empty)`)
              }
            } else {
              console.log(`ℹ️ [VERIFICATION] ${product.name}: Next day DSR not created yet - will use today's closing (${todayClosing.closingFull} Full, ${todayClosing.closingEmpty} Empty) when created`)
            }
          }
        }
        
        if (totalChecked > 0) {
          console.log(`📊 [VERIFICATION] Verified ${verifiedCount}/${totalChecked} products - Next day opening stock correctly uses today's closing stock`)
        } else {
          console.log(`ℹ️ [VERIFICATION] Next day DSR not created yet - will use today's closing stock when created`)
        }
      }
    } catch (error) {
      console.error(`❌ [${saveType}] Failed to save DSR record:`, error)
    }
  }
  
  // Manual save handler
  const handleManualSave = async () => {
    if (!isInventoryFetched || dsrProducts.length === 0) {
      alert('Please wait for inventory to be fetched first')
      return
    }
    
    setLoading(true)
    try {
      await saveDsrRecord(dsrViewDate, true)
      alert('DSR saved successfully! Next day\'s opening stock will use today\'s closing stock.')
    } catch (error) {
      console.error('Failed to save DSR:', error)
      alert('Failed to save DSR record')
    } finally {
      setLoading(false)
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
        dailyRefillsRes,
        empStockEmpRes,
        stockAssignmentsRes
      ] = await Promise.all([
        // Fetch admin sales only (no employee sales in admin DSR)
        fetch('/api/sales', { cache: 'no-store' }),
        fetch(`/api/daily-refills?date=${date}`, { cache: 'no-store' }),
        fetch('/api/products', { cache: 'no-store' }),
        fetch(`/api/daily-cylinder-transactions?date=${date}&adminOnly=true`, { cache: 'no-store' }),
        // Fetch admin daily sales data only
        fetch(`/api/daily-sales?date=${date}&adminOnly=true`, { cache: 'no-store' }),
        fetch(`/api/daily-refills?date=${date}`, { cache: 'no-store' }), // Daily refills data
        // Fetch admin EmpStockEmp assignments only
        fetch(`/api/emp-stock-emp?date=${date}&adminOnly=true`, { cache: 'no-store' }),
        // Fetch StockAssignment records (from Employee Management page) - filter by date
        fetch(`/api/stock-assignments?date=${date}`, { cache: 'no-store' })
      ])

      const salesJson = await salesRes.json()
      const adminRefillsJson = await adminRefillsRes.json()
      const productsJson = await productsRes.json()
      const dailyCylinderJson = await dailyCylinderRes.json()
      const dailySalesJson = await dailySalesRes.json()
      const dailyRefillsJson = await dailyRefillsRes.json()
      const empStockEmpJson = await empStockEmpRes.json()
      const stockAssignmentsJson = await stockAssignmentsRes.json()

      // Process aggregated data
      const inSelectedDay = (dateStr: string | Date | undefined) => {
        if (!dateStr) return false
        
        // Handle Date objects
        if (dateStr instanceof Date) {
          return dateStr.toISOString().slice(0, 10) === date
        }
        
        // Handle ISO strings or YYYY-MM-DD format
        if (typeof dateStr === 'string') {
          // If already in YYYY-MM-DD format, compare directly
          if (dateStr.length === 10 && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return dateStr === date
          }
          // Otherwise parse and compare
          const d = new Date(dateStr)
          if (isNaN(d.getTime())) return false
          return d.toISOString().slice(0, 10) === date
        }
        
        return false
      }

      // Initialize aggregation objects
      const gas: Record<string, number> = {}
      const cyl: Record<string, number> = {}
      const fullCyl: Record<string, number> = {} // Full cylinder sales
      const emptyCyl: Record<string, number> = {} // Empty cylinder sales
      const ref: Record<string, number> = {}
      const dep: Record<string, number> = {}
      const ret: Record<string, number> = {}
      const transfer: Record<string, number> = {} // Transfer tracking (admin assigns to employees)
      const receivedBack: Record<string, number> = {} // Received back tracking (employees return to admin)
      
      // New separate tracking for gas and empty cylinders
      const transferGas: Record<string, number> = {}
      const transferEmpty: Record<string, number> = {}
      const receivedGas: Record<string, number> = {}
      const receivedEmpty: Record<string, number> = {}

      const inc = (obj: Record<string, number>, key: string, val: number) => {
        obj[key] = (obj[key] || 0) + val
      }

      // Process sales data
      // NOTE: We skip processing raw sales here because gas/cylinder sales are now tracked in DailySales model
      // Processing both would cause double counting. DailySales model provides accurate tracking.
      // The old sales processing is kept for backward compatibility but gas/cylinder sales are skipped
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
          
          // Skip gas and cylinder sales - these are now tracked in DailySales model to avoid double counting
          // Only process other categories if needed
          if (category === 'gas') {
            // Skip - gas sales are tracked in DailySales model
            console.log(`[DSR] Skipping gas sale from raw sales (tracked in DailySales): ${productName} = ${quantity}`)
          } else if (category === 'cylinder') {
            // Skip - cylinder sales are tracked in DailySales model
            console.log(`[DSR] Skipping cylinder sale from raw sales (tracked in DailySales): ${productName} = ${quantity}`)
          }
        }
      }

      // Process enhanced daily sales data for accurate tracking
      const dailySalesList: any[] = Array.isArray(dailySalesJson?.data) ? dailySalesJson.data : []
      console.log(`[DSR] Processing ${dailySalesList.length} daily sales records for ${date}`)
      
      for (const dailySale of dailySalesList) {
        const productName = dailySale.productName || ''
        const key = normalizeName(productName)
        
        // Gas Sales - Only count gas sales from cylinder products (not from gas products)
        // Gas sales are recorded under cylinder products when gas is sold with a cylinder
        // We should NOT count gas sales from gas product records to avoid double counting
        if (dailySale.gasSalesQuantity > 0 && dailySale.category === 'cylinder') {
          inc(gas, key, dailySale.gasSalesQuantity)
          console.log(`[DSR] Gas Sale: ${productName} = ${dailySale.gasSalesQuantity}`)
        } else if (dailySale.gasSalesQuantity > 0 && dailySale.category === 'gas') {
          // Skip gas product records - gas sales should only be counted from cylinder product records
          console.log(`[DSR] Skipping gas sale from gas product record: ${productName} = ${dailySale.gasSalesQuantity} (should be counted under cylinder product)`)
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
        
        // Transfer tracking (admin assigns stock to employees)
        // NOTE: Skipping DailySales transferQuantity to avoid double counting
        // Transfers are already tracked in StockAssignment records (processed below)
        // which provides more detailed tracking (transferGas vs transferEmpty)
        if (dailySale.transferQuantity > 0) {
          console.log(`[DSR] Skipping DailySales transferQuantity: ${productName} = ${dailySale.transferQuantity} (tracked in StockAssignment)`)
        }
        
        // Received back tracking (employees return stock to admin)
        if (dailySale.receivedBackQuantity > 0) {
          inc(receivedBack, key, dailySale.receivedBackQuantity)
          console.log(`[DSR] Received Back: ${productName} = ${dailySale.receivedBackQuantity}`)
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
      
      // Process EmpStockEmp assignments for received items (returns from employees)
      // NOTE: We skip EmpStockEmp TRANSFERS to avoid double counting (transfers are tracked in StockAssignment)
      // But we MUST process EmpStockEmp RETURN TRANSACTIONS for "Received Gas" and "Received Empty" columns
      // Return transactions have assignmentMethod: 'return_transaction' and status: 'accepted'
      const empStockEmpList: any[] = Array.isArray(empStockEmpJson?.data) ? empStockEmpJson.data : []
      console.log(`[DSR] Processing ${empStockEmpList.length} EmpStockEmp records - filtering for return transactions only`)
      
      for (const assignment of empStockEmpList) {
        const productName = assignment.productName || assignment.product?.name || ''
        const category = assignment.category || assignment.product?.category || ''
        const cylinderStatus = assignment.cylinderStatus || ''
        const quantity = Number(assignment.assignedQuantity || assignment.quantity || 0)
        const status = assignment.status || ''
        const assignmentMethod = assignment.assignmentMethod || ''
        const relatedCylinderName = assignment.relatedCylinderName || ''
        
        // Get assignment date - handle both Date objects and ISO strings
        let assignmentDate = assignment.assignmentDate || assignment.createdAt || assignment.assignedDate || ''
        if (assignmentDate && typeof assignmentDate === 'object' && assignmentDate.toISOString) {
          assignmentDate = assignmentDate.toISOString()
        }
        
        if (!productName || quantity <= 0) continue
        
        // Only process RETURN TRANSACTIONS (when employees send stock back to admin)
        // These have assignmentMethod: 'return_transaction' and status: 'accepted'
        // Skip regular transfers (those are tracked in StockAssignment)
        if (assignmentMethod !== 'return_transaction' || status !== 'accepted') {
          continue
        }
        
        // Check if assignment date matches selected date (when admin accepted the return)
        if (assignmentDate && !inSelectedDay(assignmentDate)) {
          console.log(`[DSR] EmpStockEmp return transaction date mismatch: ${assignmentDate} vs ${date}`)
          continue
        }
        
        // For gas returns, use the related cylinder name for DSR grouping
        // This shows gas returns under the cylinder they're related to
        let dsrKey = normalizeName(productName)
        if (category === 'gas' && relatedCylinderName) {
          dsrKey = normalizeName(relatedCylinderName)
          console.log(`[DSR] Gas return linked to cylinder: ${productName} → ${relatedCylinderName}`)
        }
        
        // Track received items (when admin accepts return from employee)
        if (category === 'gas') {
          inc(receivedGas, dsrKey, quantity)
          console.log(`[DSR] ✅ Received Gas (from return): ${productName} = ${quantity} (under ${relatedCylinderName || productName})`)
        } else if (category === 'cylinder' && cylinderStatus === 'empty') {
          inc(receivedEmpty, dsrKey, quantity)
          console.log(`[DSR] ✅ Received Empty (from return): ${productName} = ${quantity}`)
        } else if (category === 'cylinder' && !cylinderStatus) {
          // If no cylinder status specified, assume empty (most common case for returns)
          inc(receivedEmpty, dsrKey, quantity)
          console.log(`[DSR] ✅ Received Empty (from return, no status): ${productName} = ${quantity}`)
        }
      }
      
      // Process StockAssignment records (from Employee Management page)
      const stockAssignmentsList: any[] = Array.isArray(stockAssignmentsJson?.data) ? stockAssignmentsJson.data : []
      console.log(`[DSR] Processing ${stockAssignmentsList.length} StockAssignment records for date ${date}`)
      
      for (const assignment of stockAssignmentsList) {
        const productName = assignment.product?.name || assignment.productName || ''
        const category = assignment.category || assignment.product?.category || ''
        const cylinderStatus = assignment.cylinderStatus || ''
        const quantity = Number(assignment.quantity || assignment.remainingQuantity || 0)
        const status = assignment.status || ''
        
        // Get dates - handle both Date objects and ISO strings
        let assignedDate = assignment.assignedDate || assignment.createdAt || ''
        let receivedDate = assignment.receivedDate || ''
        
        // Convert Date objects to ISO strings if needed
        if (assignedDate && typeof assignedDate === 'object' && assignedDate.toISOString) {
          assignedDate = assignedDate.toISOString()
        }
        if (receivedDate && typeof receivedDate === 'object' && receivedDate.toISOString) {
          receivedDate = receivedDate.toISOString()
        }
        
        console.log(`[DSR] StockAssignment record:`, {
          productName,
          category,
          cylinderStatus,
          quantity,
          status,
          assignedDate,
          receivedDate,
          assignmentId: assignment._id
        })
        
        if (!productName || quantity <= 0) {
          console.log(`[DSR] ⚠️ Skipping assignment - missing productName or quantity <= 0`)
          continue
        }
        
        // Check if assignment date matches selected date (for transfers)
        // Or if received date matches (for received items)
        const isTransferDate = assignedDate && inSelectedDay(assignedDate)
        const isReceivedDate = receivedDate && inSelectedDay(receivedDate)
        
        console.log(`[DSR] Date matching for ${productName}:`, {
          assignedDate,
          receivedDate,
          selectedDate: date,
          isTransferDate,
          isReceivedDate
        })
        
        if (!isTransferDate && !isReceivedDate) {
          // Skip if neither date matches
          console.log(`[DSR] ⚠️ Skipping assignment - date mismatch`)
          continue
        }
        
        const dsrKey = normalizeName(productName)
        console.log(`[DSR] Processing assignment for DSR key: ${dsrKey}`)
        
        // Track transfers (when stock is assigned to employee on this date)
        // Status 'assigned' means pending, 'received' means employee accepted it
        // Both count as transfers on the assignment date
        if (isTransferDate && (status === 'assigned' || status === 'received')) {
          if (category === 'gas') {
            inc(transferGas, dsrKey, quantity)
            console.log(`[DSR] ✅ StockAssignment Transfer Gas: ${productName} = ${quantity} (status: ${status}, key: ${dsrKey})`)
          } else if (category === 'cylinder') {
            if (cylinderStatus === 'empty') {
              inc(transferEmpty, dsrKey, quantity)
              console.log(`[DSR] ✅ StockAssignment Transfer Empty: ${productName} = ${quantity} (status: ${status}, key: ${dsrKey})`)
            } else if (cylinderStatus === 'full' || !cylinderStatus) {
              // Full cylinders or unspecified status - track as empty transfer
              // When full cylinders are transferred, they become available as empty at employee
              inc(transferEmpty, dsrKey, quantity)
              console.log(`[DSR] ✅ StockAssignment Transfer Full Cylinder (as empty): ${productName} = ${quantity} (status: ${status}, key: ${dsrKey})`)
            } else {
              console.log(`[DSR] ⚠️ StockAssignment cylinder with unknown status: ${cylinderStatus}`)
            }
          } else {
            console.log(`[DSR] ⚠️ StockAssignment with unknown category: ${category}`)
          }
        }
        
        // Track received items (when employee returns stock to admin on this date)
        // Status 'returned' means employee returned stock back to admin
        if (isReceivedDate && status === 'returned') {
          if (category === 'gas') {
            inc(receivedGas, dsrKey, quantity)
            console.log(`[DSR] StockAssignment Received Gas: ${productName} = ${quantity} (returned by employee, date: ${receivedDate})`)
          } else if (category === 'cylinder' && (cylinderStatus === 'empty' || !cylinderStatus)) {
            inc(receivedEmpty, dsrKey, quantity)
            console.log(`[DSR] StockAssignment Received Empty: ${productName} = ${quantity} (returned by employee, date: ${receivedDate})`)
          }
        }
      }
      
      console.log(`[DSR] Final transfer totals after processing:`, {
        transferGas: Object.keys(transferGas).length > 0 ? transferGas : 'empty',
        transferEmpty: Object.keys(transferEmpty).length > 0 ? transferEmpty : 'empty',
        receivedGas: Object.keys(receivedGas).length > 0 ? receivedGas : 'empty',
        receivedEmpty: Object.keys(receivedEmpty).length > 0 ? receivedEmpty : 'empty'
      })

      // Set state variables for use in component render
      setDailyGasSales(gas)
      setDailyFullCylinderSales(fullCyl)
      setDailyEmptyCylinderSales(emptyCyl)
      setDailyCylinderRefills(ref)
      setDailyTransfers(transfer)
      setDailyReceivedBack(receivedBack)
      
      // Set new separate tracking state variables
      setDailyTransferGas(transferGas)
      setDailyTransferEmpty(transferEmpty)
      setDailyReceivedGas(receivedGas)
      setDailyReceivedEmpty(receivedEmpty)

      // Note: Removed old cylinder transaction processing to avoid double counting
      // Now using unified daily cylinder transactions from DailyCylinderTransaction model

      // Process daily cylinder transactions
      const dailyCylinderList: any[] = Array.isArray(dailyCylinderJson?.data) ? dailyCylinderJson.data : []
      console.log(`[DSR] Processing ${dailyCylinderList.length} daily cylinder transactions for date ${date}`)
      const emptyPur: Record<string, number> = {}
      const fullPur: Record<string, number> = {}
      
      for (const dailyEntry of dailyCylinderList) {
        const cylinderName = dailyEntry.cylinderName || ''
        const depositQty = Number(dailyEntry.depositQuantity) || 0
        const returnQty = Number(dailyEntry.returnQuantity) || 0
        const emptyPurQty = Number(dailyEntry.emptyCylinderPurchaseQuantity) || 0
        const fullPurQty = Number(dailyEntry.fullCylinderPurchaseQuantity) || 0
        
        if (cylinderName) {
          const key = normalizeName(cylinderName)
          if (depositQty > 0) inc(dep, key, depositQty)
          if (returnQty > 0) inc(ret, key, returnQty)
          if (emptyPurQty > 0) {
            emptyPur[key] = (emptyPur[key] || 0) + emptyPurQty
            console.log(`[DSR] ✅ Empty Purchase: ${cylinderName} (key: ${key}) = ${emptyPurQty} (total: ${emptyPur[key]})`)
          }
          if (fullPurQty > 0) {
            fullPur[key] = (fullPur[key] || 0) + fullPurQty
            console.log(`[DSR] ✅ Full Purchase: ${cylinderName} (key: ${key}) = ${fullPurQty} (total: ${fullPur[key]})`)
          }
        }
      }
      
      console.log(`[DSR] Final purchase totals:`, {
        emptyPurchases: Object.keys(emptyPur).length > 0 ? emptyPur : 'none',
        fullPurchases: Object.keys(fullPur).length > 0 ? fullPur : 'none'
      })
      
      setDailyEmptyPurchases(emptyPur)
      setDailyFullPurchases(fullPur)

      // Update state
      setDailyAggGasSales(gas)
      setDailyAggCylinderSales(cyl)
      setDailyAggRefills(ref)
      setDailyAggDeposits(dep)
      setDailyAggReturns(ret)
      
      // Fetch stored DSR reports for opening values
      // This will also fetch previous day's closing stock if current day has zero opening stock
      await fetchStoredDsrReports(date)
      
      // Auto-save DSR data after fetching (silently, no alerts)
      // This ensures all data is saved automatically for historical viewing
      // Note: fetchStoredDsrReports will have already updated storedDsrReports state
      // and will have updated the database with correct opening stock if needed
      if (isInventoryFetched && dsrProducts.length > 0) {
        await saveDsrRecord(date)
      }
      
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

  // Fetch employees when employee DSR dialog opens
  useEffect(() => {
    if (showEmployeeDSR) {
      console.log('Employee DSR dialog opened, current employees:', employees.length)
      fetchEmployees()
    }
  }, [showEmployeeDSR])

  // Fetch DSR data when date changes
  useEffect(() => {
    if (showDSRView) {
      fetchDsrData(dsrViewDate)
    }
  }, [dsrViewDate, showDSRView])

  // Auto-fetch inventory when DSR opens (for today's date)
  useEffect(() => {
    if (showDSRView && dsrProducts.length > 0 && !isInventoryFetched) {
      const today = new Date().toISOString().slice(0, 10)
      if (dsrViewDate === today) {
        // Auto-fetch and lock inventory for today's date
        console.log('🔄 [AUTO-FETCH] Auto-fetching inventory for today\'s DSR')
        fetchAndLockInventory()
      } else {
        // For previous dates, just fetch stored reports
        fetchStoredDsrReports(dsrViewDate)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDSRView, dsrProducts.length, dsrViewDate, isInventoryFetched])

  // Scheduled auto-save at 11:55 PM Dubai time
  useEffect(() => {
    let lastSavedMinute = -1 // Track last saved minute to prevent duplicate saves
    
    const checkAndSave = async () => {
      const now = new Date()
      // Get Dubai time
      const dubaiTime = now.toLocaleString('en-US', {
        timeZone: 'Asia/Dubai',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
      
      const [hours, minutes] = dubaiTime.split(':').map(Number)
      
      // Check if it's 11:55 PM Dubai time and we haven't saved in this minute yet
      if (hours === 23 && minutes === 55 && lastSavedMinute !== 55) {
        // Get current Dubai date
        const todayStr = getLocalDateString()
        
        const dubaiTimeFull = now.toLocaleString('en-US', {
          timeZone: 'Asia/Dubai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })
        
        console.log(`🕚 [SCHEDULED SAVE] 11:55 PM Dubai time reached (${dubaiTimeFull}). Saving DSR for date: ${todayStr}`)
        
        // Only save if we have products and inventory is fetched
        if (dsrProducts.length > 0 && isInventoryFetched) {
          lastSavedMinute = 55
          await saveDsrRecord(todayStr)
          console.log(`✅ [SCHEDULED SAVE] DSR saved successfully for ${todayStr} at 11:55 PM Dubai time`)
        } else {
          console.log('⚠️ [SCHEDULED SAVE] Skipping - products or inventory not ready')
        }
      } else if (minutes !== 55) {
        // Reset the flag when we're not at 55 minutes
        lastSavedMinute = -1
      }
    }
    
    // Check every minute
    const interval = setInterval(checkAndSave, 60000)
    
    // Also check immediately in case we're already at 11:55 PM
    checkAndSave()
    
    return () => clearInterval(interval)
  }, [dsrProducts.length, isInventoryFetched])

  // Fetch employee DSR data when employee or date changes
  useEffect(() => {
    if (showEmployeeDSR && selectedEmployeeId && employeeDsrDate) {
      fetchEmployeeDsrData(selectedEmployeeId, employeeDsrDate)
    }
  }, [showEmployeeDSR, selectedEmployeeId, employeeDsrDate])

  // Download DSR PDF for a specific date
  const downloadDsrGridPdf = (date: string) => {
    try {
      const byKey = new Map<string, DailyStockEntry>()
      dsrEntries.filter(e => e.date === date).forEach(e => byKey.set(normalizeName(e.itemName), e))
      
      const rowsSource = dsrProducts.length > 0 ? dsrProducts : []
      const rows = rowsSource.map(p => {
        const key = normalizeName(p.name)
        const e = byKey.get(key)
        
        const emptyPurchaseVal = dailyEmptyPurchases[key] ?? 0
        const fullPurchaseVal = dailyFullPurchases[key] ?? 0
        const refilledVal = dailyAggRefills[key] ?? (e ? e.refilled : 0)
        const fullCylinderSalesVal = dailyFullCylinderSales[key] ?? 0
        const emptyCylinderSalesVal = dailyEmptyCylinderSales[key] ?? 0
        const gasSalesVal = dailyAggGasSales[key] ?? (e ? e.gasSales : 0)
        const depositVal = dailyAggDeposits[key] ?? (e ? e.depositCylinder : 0)
        const returnVal = dailyAggReturns[key] ?? (e ? e.returnCylinder : 0)
        
        const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
        const openingFull = storedDsrReports[key]?.openingFull ?? inventoryInfo.availableFull
        const openingEmpty = storedDsrReports[key]?.openingEmpty ?? inventoryInfo.availableEmpty
        
        // Calculate closing stock using DSR formula (matching main DSR view)
        const transferGasVal = dailyTransferGas[key] ?? 0
        const transferEmptyVal = dailyTransferEmpty[key] ?? 0
        const receivedGasVal = dailyReceivedGas[key] ?? 0
        const receivedEmptyVal = dailyReceivedEmpty[key] ?? 0
        
        // Closing Full = Opening Full + Full Purchase + Refilled - Full Cylinder Sales - Gas Sales - Transfer Gas + Received Gas
        const closingFull = Math.max(0, 
          openingFull + fullPurchaseVal + (refilledVal || 0) - (fullCylinderSalesVal || 0) - (gasSalesVal || 0) - transferGasVal + receivedGasVal
        )
        // Closing Empty = Opening Full + Opening Empty + Full Purchase + Empty Purchase - Full Cyl Sales - Empty Cyl Sales - Deposit Cylinder + Return Cylinder - Transfer Empty + Received Empty - Closing Full
        const closingEmpty = Math.max(0, 
          openingFull + openingEmpty + fullPurchaseVal + emptyPurchaseVal - (fullCylinderSalesVal || 0) - (emptyCylinderSalesVal || 0) - (depositVal || 0) + (returnVal || 0) - transferEmptyVal + receivedEmptyVal - closingFull
        )
        
        return `
          <tr>
            <td>${p.name}</td>
            <td>${openingFull}</td>
            <td>${openingEmpty}</td>
            <td>${emptyPurchaseVal}</td>
            <td>${fullPurchaseVal}</td>
            <td>${refilledVal || 0}</td>
            <td>${fullCylinderSalesVal || 0}</td>
            <td>${emptyCylinderSalesVal || 0}</td>
            <td>${gasSalesVal || 0}</td>
            <td>${depositVal || 0}</td>
            <td>${returnVal || 0}</td>
            <td>${transferGasVal}</td>
            <td>${transferEmptyVal}</td>
            <td>${receivedGasVal}</td>
            <td>${receivedEmptyVal}</td>
            <td>${closingFull}</td>
            <td>${closingEmpty}</td>
          </tr>
        `
      }).join('')

      // Calculate totals for PDF
      const totals = rowsSource.reduce((acc, p) => {
        const key = normalizeName(p.name)
        const e = byKey.get(key)
        
        const refilledVal = dailyAggRefills[key] ?? (e ? e.refilled : 0)
        const fullCylinderSalesVal = dailyFullCylinderSales[key] ?? 0
        const emptyCylinderSalesVal = dailyEmptyCylinderSales[key] ?? 0
        const gasSalesVal = dailyAggGasSales[key] ?? (e ? e.gasSales : 0)
        const depositVal = dailyAggDeposits[key] ?? (e ? e.depositCylinder : 0)
        const returnVal = dailyAggReturns[key] ?? (e ? e.returnCylinder : 0)
        
        const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
        const openingFull = storedDsrReports[key]?.openingFull ?? inventoryInfo.availableFull
        const openingEmpty = storedDsrReports[key]?.openingEmpty ?? inventoryInfo.availableEmpty
        
        const emptyPurchaseVal = dailyEmptyPurchases[key] ?? 0
        const fullPurchaseVal = dailyFullPurchases[key] ?? 0
        const transferGasVal = dailyTransferGas[key] ?? 0
        const transferEmptyVal = dailyTransferEmpty[key] ?? 0
        const receivedGasVal = dailyReceivedGas[key] ?? 0
        const receivedEmptyVal = dailyReceivedEmpty[key] ?? 0
        
        // Closing Full = Opening Full + Full Purchase + Refilled - Full Cyl Sales - Gas Sales - Transfer Gas + Received Gas
        const closingFull = Math.max(0, 
          openingFull + fullPurchaseVal + (refilledVal || 0) - (fullCylinderSalesVal || 0) - (gasSalesVal || 0) - transferGasVal + receivedGasVal
        )
        // Closing Empty = Opening Full + Opening Empty + Full Purchase + Empty Purchase - Full Cyl Sales - Empty Cyl Sales - Deposit Cylinder + Return Cylinder - Transfer Empty + Received Empty - Closing Full
        const closingEmpty = Math.max(0, 
          openingFull + openingEmpty + fullPurchaseVal + emptyPurchaseVal - (fullCylinderSalesVal || 0) - (emptyCylinderSalesVal || 0) - (depositVal || 0) + (returnVal || 0) - transferEmptyVal + receivedEmptyVal - closingFull
        )
        
        return {
          openingFull: acc.openingFull + openingFull,
          openingEmpty: acc.openingEmpty + openingEmpty,
          emptyPurchase: acc.emptyPurchase + emptyPurchaseVal,
          fullPurchase: acc.fullPurchase + fullPurchaseVal,
          refilled: acc.refilled + (refilledVal || 0),
          fullCylinderSales: acc.fullCylinderSales + (fullCylinderSalesVal || 0),
          emptyCylinderSales: acc.emptyCylinderSales + (emptyCylinderSalesVal || 0),
          gasSales: acc.gasSales + (gasSalesVal || 0),
          deposits: acc.deposits + (depositVal || 0),
          returns: acc.returns + (returnVal || 0),
          transferGas: acc.transferGas + transferGasVal,
          transferEmpty: acc.transferEmpty + transferEmptyVal,
          receivedGas: acc.receivedGas + receivedGasVal,
          receivedEmpty: acc.receivedEmpty + receivedEmptyVal,
          closingFull: acc.closingFull + closingFull,
          closingEmpty: acc.closingEmpty + closingEmpty
        }
      }, {
        openingFull: 0,
        openingEmpty: 0,
        emptyPurchase: 0,
        fullPurchase: 0,
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
        closingFull: 0,
        closingEmpty: 0
      })

      const totalsRow = `
        <tr style="background-color: #f3f4f6; font-weight: bold;">
          <td><strong>TOTAL</strong></td>
          <td>${totals.openingFull}</td>
          <td>${totals.openingEmpty}</td>
          <td>${totals.emptyPurchase}</td>
          <td>${totals.fullPurchase}</td>
          <td>${totals.refilled}</td>
          <td>${totals.fullCylinderSales}</td>
          <td>${totals.emptyCylinderSales}</td>
          <td>${totals.gasSales}</td>
          <td>${totals.deposits}</td>
          <td>${totals.returns}</td>
          <td>${totals.transferGas}</td>
          <td>${totals.transferEmpty}</td>
          <td>${totals.receivedGas}</td>
          <td>${totals.receivedEmpty}</td>
          <td>${totals.closingFull}</td>
          <td>${totals.closingEmpty}</td>
        </tr>
      `

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
                <th colspan=12>During the day</th>
                <th colspan=2>Closing</th>
              </tr>
              <tr>
                <th></th>
                <th>Full</th>
                <th>Empty</th>
                <th>Empty Pur</th>
                <th>Full Pur</th>
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
              ${totalsRow}
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
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3">
            <Button 
              variant="outline" 
              onClick={() => setShowDSRView(true)} 
              className="w-full" 
              style={{ backgroundColor: "#2B3068", color: "white" }}
            >
              <ListChecks className="h-4 w-4 mr-2" />
              View Daily Stock Report
            </Button>
            {user.role === 'admin' && (
              <Button 
                variant="secondary" 
                onClick={() => setShowEmployeeDSR(true)} 
                className="w-full"
              >
                View Employee Daily Stock Report
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Employee DSR Dialog */}
      {user.role === 'admin' && (
        <Dialog open={showEmployeeDSR} onOpenChange={setShowEmployeeDSR}>
          <DialogContent className="w-[95vw] max-w-[900px] h-[90vh] max-h-[90vh] p-3 sm:p-4 md:p-6 rounded-lg overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="text-base sm:text-lg">Employee Daily Stock Report – {employeeDsrDate}</DialogTitle>
            </DialogHeader>
            
            <div className="flex-1 overflow-auto space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 flex-shrink-0">
                <div className="flex-1">
                  <Label htmlFor="employee-select" className="text-sm">Select Employee</Label>
                  <select
                    id="employee-select"
                    value={selectedEmployeeId}
                    onChange={(e) => {
                      console.log('Employee selected:', e.target.value)
                      setSelectedEmployeeId(e.target.value)
                    }}
                    className="w-full mt-1 p-2 border rounded-md text-sm"
                  >
                    <option value="">Select an employee ({employees.length} available)</option>
                    {employees.map((emp) => {
                      console.log('Rendering employee option:', emp)
                      return (
                        <option key={emp._id} value={emp._id}>
                          {emp.name || emp.email || emp._id}
                        </option>
                      )
                    })}
                  </select>
                </div>
                <div className="flex-1">
                  <Label htmlFor="employee-dsr-date" className="text-sm">Date</Label>
                  <Input
                    id="employee-dsr-date"
                    type="date"
                    value={employeeDsrDate}
                    onChange={(e) => setEmployeeDsrDate(e.target.value)}
                    className="mt-1 text-sm"
                  />
                </div>
              </div>
              
              {employeeLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin mr-2" />
                  <span className="text-sm sm:text-base">Loading employee DSR data...</span>
                </div>
              ) : employeeDsrData.length > 0 ? (
                <div className="overflow-x-auto -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6">
                  <div className="min-w-[700px]">
                    <Table className="text-xs sm:text-sm">
                      <TableHeader>
                        <TableRow>
                          <TableHead rowSpan={2} className="border-r whitespace-nowrap">Items</TableHead>
                          <TableHead colSpan={2} className="text-center border-r">Opening</TableHead>
                          <TableHead colSpan={12} className="text-center border-r">During the day</TableHead>
                          <TableHead colSpan={2} className="text-center bg-blue-100 font-semibold">Closing</TableHead>
                        </TableRow>
                        <TableRow>
                          <TableHead className="text-center">Full</TableHead>
                          <TableHead className="text-center border-r">Empty</TableHead>
                          <TableHead className="text-center">Empty Pur</TableHead>
                          <TableHead className="text-center">Full Pur</TableHead>
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
                          <TableHead className="text-center bg-blue-100 font-semibold">Full</TableHead>
                          <TableHead className="text-center bg-blue-100 font-semibold">Empty</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {employeeDsrData.map((entry) => (
                          <TableRow key={entry._id}>
                            <TableCell className="font-medium border-r whitespace-nowrap">{entry.itemName}</TableCell>
                            <TableCell className="text-center">{entry.openingFull || 0}</TableCell>
                            <TableCell className="text-center border-r">{entry.openingEmpty || 0}</TableCell>
                            <TableCell className="text-center">{entry.emptyPurchase || 0}</TableCell>
                            <TableCell className="text-center">{entry.fullPurchase || 0}</TableCell>
                            <TableCell className="text-center">{entry.refilled || 0}</TableCell>
                            <TableCell className="text-center">{entry.fullCylinderSales || 0}</TableCell>
                            <TableCell className="text-center">{entry.emptyCylinderSales || 0}</TableCell>
                            <TableCell className="text-center">{entry.gasSales || 0}</TableCell>
                            <TableCell className="text-center">{entry.deposits || 0}</TableCell>
                            <TableCell className="text-center">{entry.returns || 0}</TableCell>
                            <TableCell className="text-center">{entry.transferGas || 0}</TableCell>
                            <TableCell className="text-center">{entry.transferEmpty || 0}</TableCell>
                            <TableCell className="text-center">{entry.receivedGas || 0}</TableCell>
                            <TableCell className="text-center border-r">{entry.receivedEmpty || 0}</TableCell>
                            <TableCell className="text-center font-semibold bg-blue-50">{entry.closingFull || 0}</TableCell>
                            <TableCell className="text-center font-semibold bg-blue-50">{entry.closingEmpty || 0}</TableCell>
                          </TableRow>
                        ))}
                        {/* Totals Row */}
                        <TableRow className="bg-gray-100 font-bold">
                          <TableCell className="font-bold border-r">TOTAL</TableCell>
                          <TableCell className="text-center">
                            {employeeDsrData.reduce((sum, entry) => sum + (entry.openingFull || 0), 0)}
                          </TableCell>
                          <TableCell className="text-center border-r">
                            {employeeDsrData.reduce((sum, entry) => sum + (entry.openingEmpty || 0), 0)}
                          </TableCell>
                          <TableCell className="text-center">
                            {employeeDsrData.reduce((sum, entry) => sum + (entry.emptyPurchase || 0), 0)}
                          </TableCell>
                          <TableCell className="text-center">
                            {employeeDsrData.reduce((sum, entry) => sum + (entry.fullPurchase || 0), 0)}
                          </TableCell>
                          <TableCell className="text-center">
                            {employeeDsrData.reduce((sum, entry) => sum + (entry.refilled || 0), 0)}
                          </TableCell>
                          <TableCell className="text-center">
                            {employeeDsrData.reduce((sum, entry) => sum + (entry.fullCylinderSales || 0), 0)}
                          </TableCell>
                          <TableCell className="text-center">
                            {employeeDsrData.reduce((sum, entry) => sum + (entry.emptyCylinderSales || 0), 0)}
                          </TableCell>
                          <TableCell className="text-center">
                            {employeeDsrData.reduce((sum, entry) => sum + (entry.gasSales || 0), 0)}
                          </TableCell>
                          <TableCell className="text-center">
                            {employeeDsrData.reduce((sum, entry) => sum + (entry.deposits || 0), 0)}
                          </TableCell>
                          <TableCell className="text-center">
                            {employeeDsrData.reduce((sum, entry) => sum + (entry.returns || 0), 0)}
                          </TableCell>
                          <TableCell className="text-center">
                            {employeeDsrData.reduce((sum, entry) => sum + (entry.transferGas || 0), 0)}
                          </TableCell>
                          <TableCell className="text-center">
                            {employeeDsrData.reduce((sum, entry) => sum + (entry.transferEmpty || 0), 0)}
                          </TableCell>
                          <TableCell className="text-center">
                            {employeeDsrData.reduce((sum, entry) => sum + (entry.receivedGas || 0), 0)}
                          </TableCell>
                          <TableCell className="text-center border-r">
                            {employeeDsrData.reduce((sum, entry) => sum + (entry.receivedEmpty || 0), 0)}
                          </TableCell>
                          <TableCell className="text-center font-semibold bg-blue-50">
                            {employeeDsrData.reduce((sum, entry) => sum + (entry.closingFull || 0), 0)}
                          </TableCell>
                          <TableCell className="text-center font-semibold bg-blue-50">
                            {employeeDsrData.reduce((sum, entry) => sum + (entry.closingEmpty || 0), 0)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm sm:text-base">
                    {selectedEmployeeId ? 'No DSR data found for this employee on the selected date.' : 'Please select an employee to view their DSR data.'}
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Main DSR Dialog */}
      <Dialog open={showDSRView} onOpenChange={setShowDSRView}>
        <DialogContent className="w-[98vw] max-w-[1200px] h-[90vh] p-2 sm:p-4 md:p-6 rounded-lg overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Daily Stock Report – {dsrViewDate}</DialogTitle>
          </DialogHeader>
          
          <div className="mb-3 space-y-3 flex-shrink-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="dsr-date" className="text-sm">Date:</Label>
                <Input
                  id="dsr-date"
                  type="date"
                  value={dsrViewDate}
                  onChange={(e) => setDsrViewDate(e.target.value)}
                  className="w-auto text-sm"
                />
              </div>
              <Button
                onClick={() => downloadDsrGridPdf(dsrViewDate)}
                variant="outline"
                size="sm"
                className="w-full sm:w-auto sm:ml-auto"
              >
                <FileText className="h-4 w-4 mr-1" />
                PDF
              </Button>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  {isInventoryFetched ? '✓ Inventory Locked - Data auto-saved' : '⏳ Fetching inventory and auto-saving data...'}
                </span>
                {isInventoryFetched && (
                  <Button
                    onClick={handleManualSave}
                    size="sm"
                    disabled={loading}
                    className="bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm ml-2"
                  >
                    <PlusCircle className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Loading DSR data...</span>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <div className="min-w-[1000px]">
                <Table className="text-xs sm:text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="border-r">Items</TableHead>
                    <TableHead colSpan={2} className="text-center border-r">Opening</TableHead>
                    <TableHead colSpan={12} className="text-center border-r">During the day</TableHead>
                    <TableHead colSpan={2} className="text-center bg-blue-100 font-semibold">Closing</TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead className="text-center">Full</TableHead>
                    <TableHead className="text-center border-r">Empty</TableHead>
                    <TableHead className="text-center">Empty Pur</TableHead>
                    <TableHead className="text-center">Full Pur</TableHead>
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
                  {dsrProducts.map((product) => {
                    const key = normalizeName(product.name)
                    const entry = dsrEntries.find(e => e.date === dsrViewDate && normalizeName(e.itemName) === key)
                    
                    const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
                    // Use stored opening stock (which should be previous day's closing stock for new days)
                    // If not available, use current inventory (for first day ever)
                    const storedOpening = storedDsrReports[key]
                    const openingFull = storedOpening?.openingFull ?? inventoryInfo.availableFull ?? 0
                    const openingEmpty = storedOpening?.openingEmpty ?? inventoryInfo.availableEmpty ?? 0
                    
                    // Debug log for first few products to verify values
                    if (dsrProducts.indexOf(product) < 3) {
                      console.log(`🔍 [TABLE RENDER] ${product.name} (key: ${key}): storedDsrReports[key] =`, storedOpening, `→ openingFull=${openingFull}, openingEmpty=${openingEmpty}`)
                    }
                    const refilled = dailyCylinderRefills[key] ?? 0
                    const fullCylinderSales = dailyFullCylinderSales[key] ?? 0
                    const emptyCylinderSales = dailyEmptyCylinderSales[key] ?? 0
                    const gasSales = dailyGasSales[key] ?? 0
                    const deposits = dailyAggDeposits[key] ?? 0
                    const returns = dailyAggReturns[key] ?? 0
                    const transferQuantity = dailyTransfers[key] ?? 0
                    const receivedBackQuantity = dailyReceivedBack[key] ?? 0
                    
                    // New separate tracking values
                    const transferGasQuantity = dailyTransferGas[key] ?? 0
                    const transferEmptyQuantity = dailyTransferEmpty[key] ?? 0
                    const receivedGasQuantity = dailyReceivedGas[key] ?? 0
                    const receivedEmptyQuantity = dailyReceivedEmpty[key] ?? 0
                    
                    // Purchase quantities
                    const emptyPurchase = dailyEmptyPurchases[key] ?? 0
                    const fullPurchase = dailyFullPurchases[key] ?? 0
                    
                    // Calculate closing stock using DSR formula (including purchases)
                    // Closing Full = Opening Full + Full Purchase + Refilled - Full Cyl Sales - Gas Sales - Transfer Gas + Received Gas
                    const closingFull = Math.max(0, 
                      openingFull + fullPurchase + refilled - fullCylinderSales - gasSales - transferGasQuantity + receivedGasQuantity
                    )
                    // Closing Empty = Opening Full + Opening Empty + Full Purchase + Empty Purchase - Full Cyl Sales - Empty Cyl Sales - Deposit Cylinder + Return Cylinder - Transfer Empty + Received Empty - Closing Full
                    const closingEmpty = Math.max(0, 
                      openingFull + openingEmpty + fullPurchase + emptyPurchase - fullCylinderSales - emptyCylinderSales - deposits + returns - transferEmptyQuantity + receivedEmptyQuantity - closingFull
                    )

                    return (
                      <TableRow key={product._id}>
                        <TableCell className="font-medium border-r">{product.name}</TableCell>
                        <TableCell className="text-center">{openingFull}</TableCell>
                        <TableCell className="text-center border-r">{openingEmpty}</TableCell>
                        <TableCell className="text-center">{emptyPurchase}</TableCell>
                        <TableCell className="text-center">{fullPurchase}</TableCell>
                        <TableCell className="text-center">{refilled}</TableCell>
                        <TableCell className="text-center">{fullCylinderSales}</TableCell>
                        <TableCell className="text-center">{emptyCylinderSales}</TableCell>
                        <TableCell className="text-center">{gasSales}</TableCell>
                        <TableCell className="text-center">{deposits}</TableCell>
                        <TableCell className="text-center">{returns}</TableCell>
                        <TableCell className="text-center">{transferGasQuantity}</TableCell>
                        <TableCell className="text-center">{transferEmptyQuantity}</TableCell>
                        <TableCell className="text-center">{receivedGasQuantity}</TableCell>
                        <TableCell className="text-center border-r">{receivedEmptyQuantity}</TableCell>
                        <TableCell className="text-center font-semibold bg-blue-50">{closingFull}</TableCell>
                        <TableCell className="text-center font-semibold bg-blue-50">{closingEmpty}</TableCell>
                      </TableRow>
                    )
                  })}
                  {/* Totals Row */}
                  <TableRow className="bg-gray-100 font-bold">
                    <TableCell className="font-bold border-r">TOTAL</TableCell>
                    <TableCell className="text-center">
                      {dsrProducts.reduce((sum, product) => {
                        const key = normalizeName(product.name)
                        const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
                        const openingFull = storedDsrReports[key]?.openingFull ?? inventoryInfo.availableFull ?? 0
                        return sum + openingFull
                      }, 0)}
                    </TableCell>
                    <TableCell className="text-center border-r">
                      {dsrProducts.reduce((sum, product) => {
                        const key = normalizeName(product.name)
                        const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
                        const openingEmpty = storedDsrReports[key]?.openingEmpty ?? inventoryInfo.availableEmpty ?? 0
                        return sum + openingEmpty
                      }, 0)}
                    </TableCell>
                    <TableCell className="text-center">
                      {dsrProducts.reduce((sum, product) => {
                        const key = normalizeName(product.name)
                        return sum + (dailyEmptyPurchases[key] ?? 0)
                      }, 0)}
                    </TableCell>
                    <TableCell className="text-center">
                      {dsrProducts.reduce((sum, product) => {
                        const key = normalizeName(product.name)
                        return sum + (dailyFullPurchases[key] ?? 0)
                      }, 0)}
                    </TableCell>
                    <TableCell className="text-center">
                      {dsrProducts.reduce((sum, product) => {
                        const key = normalizeName(product.name)
                        return sum + (dailyCylinderRefills[key] ?? 0)
                      }, 0)}
                    </TableCell>
                    <TableCell className="text-center">
                      {dsrProducts.reduce((sum, product) => {
                        const key = normalizeName(product.name)
                        return sum + (dailyFullCylinderSales[key] ?? 0)
                      }, 0)}
                    </TableCell>
                    <TableCell className="text-center">
                      {dsrProducts.reduce((sum, product) => {
                        const key = normalizeName(product.name)
                        return sum + (dailyEmptyCylinderSales[key] ?? 0)
                      }, 0)}
                    </TableCell>
                    <TableCell className="text-center">
                      {dsrProducts.reduce((sum, product) => {
                        const key = normalizeName(product.name)
                        return sum + (dailyGasSales[key] ?? 0)
                      }, 0)}
                    </TableCell>
                    <TableCell className="text-center">
                      {dsrProducts.reduce((sum, product) => {
                        const key = normalizeName(product.name)
                        return sum + (dailyAggDeposits[key] ?? 0)
                      }, 0)}
                    </TableCell>
                    <TableCell className="text-center">
                      {dsrProducts.reduce((sum, product) => {
                        const key = normalizeName(product.name)
                        return sum + (dailyAggReturns[key] ?? 0)
                      }, 0)}
                    </TableCell>
                    <TableCell className="text-center">
                      {dsrProducts.reduce((sum, product) => {
                        const key = normalizeName(product.name)
                        return sum + (dailyTransferGas[key] ?? 0)
                      }, 0)}
                    </TableCell>
                    <TableCell className="text-center">
                      {dsrProducts.reduce((sum, product) => {
                        const key = normalizeName(product.name)
                        return sum + (dailyTransferEmpty[key] ?? 0)
                      }, 0)}
                    </TableCell>
                    <TableCell className="text-center">
                      {dsrProducts.reduce((sum, product) => {
                        const key = normalizeName(product.name)
                        return sum + (dailyReceivedGas[key] ?? 0)
                      }, 0)}
                    </TableCell>
                    <TableCell className="text-center border-r">
                      {dsrProducts.reduce((sum, product) => {
                        const key = normalizeName(product.name)
                        return sum + (dailyReceivedEmpty[key] ?? 0)
                      }, 0)}
                    </TableCell>
                    <TableCell className="text-center font-semibold bg-blue-50">
                      {dsrProducts.reduce((sum, product) => {
                        const key = normalizeName(product.name)
                        const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
                        const storedOpening = storedDsrReports[key]
                        const openingFull = storedOpening?.openingFull ?? inventoryInfo.availableFull ?? 0
                        const refilled = dailyCylinderRefills[key] ?? 0
                        const fullCylinderSales = dailyFullCylinderSales[key] ?? 0
                        const gasSales = dailyGasSales[key] ?? 0
                        const transferGasQuantity = dailyTransferGas[key] ?? 0
                        const receivedGasQuantity = dailyReceivedGas[key] ?? 0
                        const fullPurchase = dailyFullPurchases[key] ?? 0
                        // Use the same formula as individual rows
                        // Closing Full = Opening Full + Full Purchase + Refilled - Full Cyl Sales - Gas Sales - Transfer Gas + Received Gas
                        const closingFull = Math.max(0, 
                          openingFull + fullPurchase + refilled - fullCylinderSales - gasSales - transferGasQuantity + receivedGasQuantity
                        )
                        return sum + closingFull
                      }, 0)}
                    </TableCell>
                    <TableCell className="text-center font-semibold bg-blue-50">
                      {dsrProducts.reduce((sum, product) => {
                        const key = normalizeName(product.name)
                        const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
                        const openingFull = storedDsrReports[key]?.openingFull ?? inventoryInfo.availableFull ?? 0
                        const openingEmpty = storedDsrReports[key]?.openingEmpty ?? inventoryInfo.availableEmpty ?? 0
                        const fullCylinderSales = dailyFullCylinderSales[key] ?? 0
                        const emptyCylinderSales = dailyEmptyCylinderSales[key] ?? 0
                        const deposits = dailyAggDeposits[key] ?? 0
                        const returns = dailyAggReturns[key] ?? 0
                        const transferEmptyQuantity = dailyTransferEmpty[key] ?? 0
                        const receivedEmptyQuantity = dailyReceivedEmpty[key] ?? 0
                        const emptyPurchase = dailyEmptyPurchases[key] ?? 0
                        const fullPurchase = dailyFullPurchases[key] ?? 0
                        const refilled = dailyCylinderRefills[key] ?? 0
                        const gasSales = dailyGasSales[key] ?? 0
                        const transferGasQuantity = dailyTransferGas[key] ?? 0
                        const receivedGasQuantity = dailyReceivedGas[key] ?? 0
                        // Closing Full = Opening Full + Full Purchase + Refilled - Full Cyl Sales - Gas Sales - Transfer Gas + Received Gas
                        const closingFull = Math.max(0, openingFull + fullPurchase + refilled - fullCylinderSales - gasSales - transferGasQuantity + receivedGasQuantity)
                        // Closing Empty = Opening Full + Opening Empty + Full Purchase + Empty Purchase - Full Cyl Sales - Empty Cyl Sales - Deposit Cylinder + Return Cylinder - Transfer Empty + Received Empty - Closing Full
                        const closingEmpty = Math.max(0, openingFull + openingEmpty + fullPurchase + emptyPurchase - fullCylinderSales - emptyCylinderSales - deposits + returns - transferEmptyQuantity + receivedEmptyQuantity - closingFull)
                        return sum + closingEmpty
                      }, 0)}
                    </TableCell>
                  </TableRow>
                </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Summary Section */}
          {!loading && dsrProducts.length > 0 && (
            <div className="mt-4 pt-4 border-t flex-shrink-0">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-bold text-blue-600">
                    {dsrProducts.reduce((sum, product) => {
                      const key = normalizeName(product.name)
                      return sum + (dailyFullCylinderSales[key] ?? 0)
                    }, 0)}
                  </div>
                  <div className="text-xs sm:text-sm text-muted-foreground">Full Cylinder Sales</div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-bold text-green-600">
                    {dsrProducts.reduce((sum, product) => {
                      const key = normalizeName(product.name)
                      return sum + (dailyEmptyCylinderSales[key] ?? 0)
                    }, 0)}
                  </div>
                  <div className="text-xs sm:text-sm text-muted-foreground">Empty Cylinder Sales</div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-bold text-purple-600">
                    {dsrProducts.reduce((sum, product) => {
                      const key = normalizeName(product.name)
                      return sum + (dailyGasSales[key] ?? 0)
                    }, 0)}
                  </div>
                  <div className="text-xs sm:text-sm text-muted-foreground">Gas Sales</div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-bold text-red-600">
                    {dsrProducts.reduce((sum, product) => {
                      const key = normalizeName(product.name)
                      return sum + (dailyTransferGas[key] ?? 0)
                    }, 0)}
                  </div>
                  <div className="text-xs sm:text-sm text-muted-foreground">Transfer Gas</div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-bold text-yellow-600">
                    {dsrProducts.reduce((sum, product) => {
                      const key = normalizeName(product.name)
                      return sum + (dailyTransferEmpty[key] ?? 0)
                    }, 0)}
                  </div>
                  <div className="text-xs sm:text-sm text-muted-foreground">Transfer Empty</div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-bold text-orange-600">
                    {dsrProducts.length}
                  </div>
                  <div className="text-xs sm:text-sm text-muted-foreground">Total Items</div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
