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
  refilled: number
  cylinderSales: number
  gasSales: number
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
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true)

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
      const [salesRes, cylinderRes, refillRes] = await Promise.all([
        fetch(`/api/daily-employee-sales?employeeId=${employeeId}&date=${date}`, { cache: 'no-store' }),
        fetch(`/api/daily-employee-cylinder-aggregation?employeeId=${employeeId}&date=${date}`, { cache: 'no-store' }),
        fetch(`/api/daily-refills?employeeId=${employeeId}&date=${date}`, { cache: 'no-store' })
      ])
      
      const salesJson = await salesRes.json()
      const cylinderJson = await cylinderRes.json()
      const refillJson = await refillRes.json()
      
      const salesData: any[] = salesJson?.data || []
      const cylinderData: any[] = cylinderJson?.data || []
      const refillData: any[] = refillJson?.data || []
      
      // Build a map of actual transaction data by product name
      const transactionMap = new Map<string, {
        refilled: number
        fullCylinderSales: number
        emptyCylinderSales: number
        gasSales: number
        deposits: number
        returns: number
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
          returns: 0
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
          returns: 0
        }
        
        existing.refilled += Number(cylinder.totalRefills || 0)
        existing.deposits += Number(cylinder.totalDeposits || 0)
        existing.returns += Number(cylinder.totalReturns || 0)
        
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
          returns: 0
        }
        
        existing.refilled += Number(refill.todayRefill || 0)
        
        transactionMap.set(itemName, existing)
      })
      
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
          returns: 0
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
          // Calculate closing using DSR formula
          closingFull = Math.max(0, openingFull + transactions.refilled - transactions.fullCylinderSales - transactions.gasSales)
          closingEmpty = Math.max(0, openingEmpty + transactions.gasSales + transactions.fullCylinderSales - transactions.refilled + transactions.deposits - transactions.returns)
        }
        
        return {
          _id: String(stored?._id || `${itemName}-${date}`),
          employeeId: employeeId,
          date: date,
          itemName: itemName,
          openingFull: openingFull,
          openingEmpty: openingEmpty,
          refilled: transactions.refilled || Number(stored?.refilled || 0),
          cylinderSales: transactions.fullCylinderSales || Number(stored?.cylinderSales || 0),
          gasSales: transactions.gasSales || Number(stored?.gasSales || 0),
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
        data.data.forEach((report: any) => {
          const key = normalizeName(report.itemName)
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
        if (dsrProducts.length > 0) {
          await autoFetchInventoryForNewDay(date)
          return
        }
      }
      
      setStoredDsrReports(reports)
    } catch (error) {
      console.error('Failed to fetch stored DSR reports:', error)
      setIsInventoryFetched(false)
    }
  }

  // Auto-fetch inventory for new days
  const autoFetchInventoryForNewDay = async (date: string) => {
    try {
      await fetchInventoryData()
      
      const reports: Record<string, { openingFull: number; openingEmpty: number }> = {}
      
      for (const product of dsrProducts) {
        const key = normalizeName(product.name)
        const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
        
        // Auto-create DSR entry with current inventory for new day
        await fetch('/api/daily-stock-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            itemName: product.name,
            openingFull: inventoryInfo.availableFull,
            openingEmpty: inventoryInfo.availableEmpty
          })
        })
        
        reports[key] = {
          openingFull: inventoryInfo.availableFull,
          openingEmpty: inventoryInfo.availableEmpty
        }
      }
      
      setStoredDsrReports(reports)
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
      
      const reports: Record<string, { openingFull: number; openingEmpty: number }> = {}
      
      for (const product of dsrProducts) {
        const key = normalizeName(product.name)
        const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
        
        // Create/update DSR entry with current inventory
        await fetch('/api/daily-stock-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: dsrViewDate,
            itemName: product.name,
            openingFull: inventoryInfo.availableFull,
            openingEmpty: inventoryInfo.availableEmpty
          })
        })
        
        reports[key] = {
          openingFull: inventoryInfo.availableFull,
          openingEmpty: inventoryInfo.availableEmpty
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
  const saveDsrRecord = async () => {
    try {
      setLoading(true)
      
      for (const product of dsrProducts) {
        const key = normalizeName(product.name)
        const openingFull = storedDsrReports[key]?.openingFull || 0
        const openingEmpty = storedDsrReports[key]?.openingEmpty || 0
        
        // Calculate closing values
        const refilled = dailyCylinderRefills[key] ?? 0
        const fullCylinderSales = dailyFullCylinderSales[key] ?? 0
        const gasSales = dailyGasSales[key] ?? 0
        const deposits = dailyAggDeposits[key] ?? 0
        const returns = dailyAggReturns[key] ?? 0
        const transferGasQuantity = dailyTransferGas[key] ?? 0
        const transferEmptyQuantity = dailyTransferEmpty[key] ?? 0
        const receivedGasQuantity = dailyReceivedGas[key] ?? 0
        const receivedEmptyQuantity = dailyReceivedEmpty[key] ?? 0
        
        const closingFull = Math.max(0, 
          openingFull + refilled - fullCylinderSales - gasSales - transferGasQuantity + receivedGasQuantity
        )
        const closingEmpty = Math.max(0, 
          openingEmpty + gasSales + fullCylinderSales - refilled + deposits - returns - transferEmptyQuantity + receivedEmptyQuantity
        )
        
        await fetch('/api/daily-stock-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: dsrViewDate,
            itemName: product.name,
            openingFull,
            openingEmpty,
            closingFull,
            closingEmpty
          })
        })
      }
      
      alert('DSR record saved successfully!')
    } catch (error) {
      console.error('Failed to save DSR record:', error)
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
        empStockEmpRes
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
        fetch(`/api/emp-stock-emp?date=${date}&adminOnly=true`, { cache: 'no-store' })
      ])

      const salesJson = await salesRes.json()
      const adminRefillsJson = await adminRefillsRes.json()
      const productsJson = await productsRes.json()
      const dailyCylinderJson = await dailyCylinderRes.json()
      const dailySalesJson = await dailySalesRes.json()
      const dailyRefillsJson = await dailyRefillsRes.json()
      const empStockEmpJson = await empStockEmpRes.json()

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
        
        // Transfer tracking (admin assigns stock to employees)
        if (dailySale.transferQuantity > 0) {
          inc(transfer, key, dailySale.transferQuantity)
          console.log(`[DSR] Transfer: ${productName} = ${dailySale.transferQuantity}`)
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
      
      // Process EmpStockEmp assignments for separate gas/empty tracking
      const empStockEmpList: any[] = Array.isArray(empStockEmpJson?.data) ? empStockEmpJson.data : []
      console.log(`[DSR] Processing ${empStockEmpList.length} EmpStockEmp assignments`)
      
      for (const assignment of empStockEmpList) {
        const productName = assignment.productName || ''
        const category = assignment.category || ''
        const cylinderStatus = assignment.cylinderStatus || ''
        const quantity = Number(assignment.assignedQuantity) || 0
        const status = assignment.status || ''
        const relatedCylinderName = assignment.relatedCylinderName || ''
        const assignmentMethod = assignment.assignmentMethod || ''
        
        if (!productName || quantity <= 0) continue
        
        // For gas assignments, use the related cylinder name for DSR grouping
        // This shows gas transfers under the cylinder they're related to
        let dsrKey = productName.toLowerCase().replace(/\s+/g, ' ').trim()
        if (category === 'gas' && relatedCylinderName) {
          dsrKey = relatedCylinderName.toLowerCase().replace(/\s+/g, ' ').trim()
          console.log(`[DSR] Gas assignment linked to cylinder: ${productName} → ${relatedCylinderName}`)
        }
        
        // Only process assignments (transfers from admin to employee)
        // For received back, we would need a different status or separate tracking
        // For transfer tracking - exclude return transactions
        if ((status === 'assigned' || status === 'accepted') && assignmentMethod !== 'return_transaction') {
          if (category === 'gas') {
            inc(transferGas, dsrKey, quantity)
            console.log(`[DSR] Transfer Gas: ${productName} = ${quantity} (under ${relatedCylinderName || productName})`)
          } else if (category === 'cylinder' && cylinderStatus === 'empty') {
            inc(transferEmpty, dsrKey, quantity)
            console.log(`[DSR] Transfer Empty: ${productName} = ${quantity}`)
          }
        }
        
        // For received back tracking - check for return transactions
        // Return transactions have assignmentMethod: 'return_transaction' and status: 'accepted'
        if (assignmentMethod === 'return_transaction' && status === 'accepted') {
          if (category === 'gas') {
            inc(receivedGas, dsrKey, quantity)
            console.log(`[DSR] Received Gas: ${productName} = ${quantity} (returned by employee)`)
          } else if (category === 'cylinder' && cylinderStatus === 'empty') {
            inc(receivedEmpty, dsrKey, quantity)
            console.log(`[DSR] Received Empty: ${productName} = ${quantity} (returned by employee)`)
          }
        }
      }

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
      
      // Fetch stored DSR reports for opening values
      await fetchStoredDsrReports(date)
      
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

  // Auto-fetch inventory when DSR opens for the first time (today's date)
  useEffect(() => {
    if (showDSRView && dsrProducts.length > 0 && !isInventoryFetched) {
      const today = new Date().toISOString().slice(0, 10)
      if (dsrViewDate === today) {
        fetchStoredDsrReports(dsrViewDate)
      }
    }
  }, [showDSRView, dsrProducts.length, dsrViewDate, isInventoryFetched])

  // Auto-save DSR at 11:55 PM Dubai time
  useEffect(() => {
    if (!autoSaveEnabled || !showDSRView || !isInventoryFetched) return

    const checkAutoSave = () => {
      const now = new Date()
      // Convert to Dubai time (UTC+4)
      const dubaiTime = new Date(now.getTime() + (4 * 60 * 60 * 1000))
      const hours = dubaiTime.getHours()
      const minutes = dubaiTime.getMinutes()
      
      // Check if it's 11:55 PM Dubai time
      if (hours === 23 && minutes === 55) {
        const today = new Date().toISOString().slice(0, 10)
        if (dsrViewDate === today) {
          saveDsrRecord()
          console.log('🕚 Auto-saved DSR at 11:55 PM Dubai time')
        }
      }
    }

    // Check every minute
    const interval = setInterval(checkAutoSave, 60000)
    return () => clearInterval(interval)
  }, [autoSaveEnabled, showDSRView, isInventoryFetched, dsrViewDate])

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
        
        const refilledVal = dailyAggRefills[key] ?? (e ? e.refilled : 0)
        const cylSalesVal = dailyAggCylinderSales[key] ?? (e ? e.cylinderSales : 0)
        const gasSalesVal = dailyAggGasSales[key] ?? (e ? e.gasSales : 0)
        const depositVal = dailyAggDeposits[key] ?? (e ? e.depositCylinder : 0)
        const returnVal = dailyAggReturns[key] ?? (e ? e.returnCylinder : 0)
        
        const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
        const openingFull = storedDsrReports[key]?.openingFull ?? inventoryInfo.availableFull
        const openingEmpty = storedDsrReports[key]?.openingEmpty ?? inventoryInfo.availableEmpty
        
        // Calculate closing stock using DSR formula
        const transferGasVal = dailyTransferGas[key] ?? 0
        const transferEmptyVal = dailyTransferEmpty[key] ?? 0
        const receivedGasVal = dailyReceivedGas[key] ?? 0
        const receivedEmptyVal = dailyReceivedEmpty[key] ?? 0
        
        const closingFull = Math.max(0, 
          openingFull + (refilledVal || 0) - (cylSalesVal || 0) - (gasSalesVal || 0) - transferGasVal + receivedGasVal
        )
        const closingEmpty = Math.max(0, 
          openingEmpty + (gasSalesVal || 0) + (cylSalesVal || 0) - (refilledVal || 0) + (depositVal || 0) - (returnVal || 0) - transferEmptyVal + receivedEmptyVal
        )
        
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
            <td>${transferGasVal}</td>
            <td>${transferEmptyVal}</td>
            <td>${receivedGasVal}</td>
            <td>${receivedEmptyVal}</td>
            <td>${closingFull}</td>
            <td>${closingEmpty}</td>
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
                <th colspan=7>During the day</th>
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
                    onChange={(e) => {
                      console.log('Employee selected:', e.target.value)
                      setSelectedEmployeeId(e.target.value)
                    }}
                    className="w-full mt-1 p-2 border rounded-md"
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
              
              {employeeLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>Loading employee DSR data...</span>
                </div>
              ) : employeeDsrData.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table className="text-xs sm:text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item Name</TableHead>
                        <TableHead className="text-center">Opening Full</TableHead>
                        <TableHead className="text-center">Opening Empty</TableHead>
                        <TableHead className="text-center">Refilled</TableHead>
                        <TableHead className="text-center">Cylinder Sales</TableHead>
                        <TableHead className="text-center">Gas Sales</TableHead>
                        <TableHead className="text-center">Deposit</TableHead>
                        <TableHead className="text-center">Return</TableHead>
                        <TableHead className="text-center">Closing Full</TableHead>
                        <TableHead className="text-center">Closing Empty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeeDsrData.map((entry) => (
                        <TableRow key={entry._id}>
                          <TableCell className="font-medium">{entry.itemName}</TableCell>
                          <TableCell className="text-center">{entry.openingFull || 0}</TableCell>
                          <TableCell className="text-center">{entry.openingEmpty || 0}</TableCell>
                          <TableCell className="text-center">{entry.refilled || 0}</TableCell>
                          <TableCell className="text-center">{entry.cylinderSales || 0}</TableCell>
                          <TableCell className="text-center">{entry.gasSales || 0}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                          <TableCell className="text-center">-</TableCell>
                          <TableCell className="text-center">{entry.closingFull || 0}</TableCell>
                          <TableCell className="text-center">{entry.closingEmpty || 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">
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
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <Button
                  onClick={fetchAndLockInventory}
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 w-full sm:w-auto text-xs sm:text-sm"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  {isInventoryFetched ? 'Refresh' : 'Fetch'}
                </Button>
                
                {isInventoryFetched && (
                  <Button
                    onClick={saveDsrRecord}
                    size="sm"
                    disabled={loading}
                    className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto text-xs sm:text-sm"
                  >
                    <PlusCircle className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                )}
              </div>
              
              <div className="flex flex-col gap-1 w-full sm:w-auto">
                <span className="text-xs text-gray-500">
                  {isInventoryFetched ? '✓ Inventory Locked' : '⚠ Click Fetch Inventory'}
                </span>
                
                {isInventoryFetched && (
                  <label className="flex items-center gap-2 text-xs">
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
                  {dsrProducts.map((product) => {
                    const key = normalizeName(product.name)
                    const entry = dsrEntries.find(e => e.date === dsrViewDate && normalizeName(e.itemName) === key)
                    
                    const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
                    const openingFull = storedDsrReports[key]?.openingFull ?? (isInventoryFetched ? 0 : inventoryInfo.availableFull)
                    const openingEmpty = storedDsrReports[key]?.openingEmpty ?? (isInventoryFetched ? 0 : inventoryInfo.availableEmpty)
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
                    
                    // Calculate closing stock using DSR formula
                    const closingFull = Math.max(0, 
                      openingFull + refilled - fullCylinderSales - gasSales - transferGasQuantity + receivedGasQuantity
                    )
                    const closingEmpty = Math.max(0, 
                      openingEmpty + gasSales + fullCylinderSales - refilled + deposits - returns - transferEmptyQuantity + receivedEmptyQuantity
                    )

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
                        <TableCell className="text-center">{returns}</TableCell>
                        <TableCell className="text-center">{transferGasQuantity}</TableCell>
                        <TableCell className="text-center">{transferEmptyQuantity}</TableCell>
                        <TableCell className="text-center">{receivedGasQuantity}</TableCell>
                        <TableCell className="text-center border-r">{receivedEmptyQuantity}</TableCell>
                        <TableCell className="text-center">{closingFull}</TableCell>
                        <TableCell className="text-center">{closingEmpty}</TableCell>
                      </TableRow>
                    )
                  })}
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
