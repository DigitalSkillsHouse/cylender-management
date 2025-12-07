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
        // Check if stored data has valid opening stock (non-zero) or if we need to fetch previous day's closing stock
        const hasValidOpeningStock = data.data.some((report: any) => 
          (report.openingFull && report.openingFull > 0) || (report.openingEmpty && report.openingEmpty > 0)
        )
        
        if (hasValidOpeningStock) {
          // Use stored data with valid opening stock
          data.data.forEach((report: any) => {
            const key = report.itemName.toLowerCase().replace(/\s+/g, ' ').trim()
            reports[key] = {
              openingFull: report.openingFull || 0,
              openingEmpty: report.openingEmpty || 0
            }
          })
          hasStoredData = true
          setIsInventoryFetched(true)
          setStoredDsrReports(reports)
          console.log(`✅ [EMPLOYEE DSR] Using stored data for ${date} with valid opening stock`)
        } else {
          // Stored data exists but has zero opening stock - fetch previous day's closing stock instead
          console.log(`⚠️ [EMPLOYEE DSR] Stored data for ${date} has zero opening stock, fetching previous day's closing stock...`)
          setIsInventoryFetched(false)
          
          // Get previous day's date to fetch closing stock
          const currentDate = new Date(date + 'T00:00:00')
          const previousDate = new Date(currentDate)
          previousDate.setDate(previousDate.getDate() - 1)
          const previousDateStr = previousDate.toISOString().slice(0, 10)
          
          console.log(`🔍 [EMPLOYEE DSR] Fetching previous day (${previousDateStr}) closing stock for ${date}...`)
          
          const prevResponse = await fetch(`/api/employee-daily-stock-reports?employeeId=${user.id}&date=${previousDateStr}`)
          const prevData = await prevResponse.json()
          
          const prevReports: Record<string, { openingFull: number; openingEmpty: number }> = {}
          
          if (prevData.success && Array.isArray(prevData.data) && prevData.data.length > 0) {
            console.log(`📊 [EMPLOYEE DSR] Found ${prevData.data.length} reports from previous day (${previousDateStr})`)
            prevData.data.forEach((report: any) => {
              const key = report.itemName.toLowerCase().replace(/\s+/g, ' ').trim()
              // Use previous day's closing stock as opening stock
              const prevClosingFull = report.closingFull ?? 0
              const prevClosingEmpty = report.closingEmpty ?? 0
              prevReports[key] = {
                openingFull: prevClosingFull,
                openingEmpty: prevClosingEmpty
              }
              console.log(`✅ [EMPLOYEE DSR] ${report.itemName} (key: ${key}): Previous day closing = ${prevClosingFull} Full, ${prevClosingEmpty} Empty → Using as opening stock`)
            })
            setStoredDsrReports(prevReports)
            console.log(`✅ [EMPLOYEE DSR] Set storedDsrReports with ${Object.keys(prevReports).length} items for ${date}`)
            
            // Update the stored DSR records in database with correct opening stock
            if (inventoryData.length > 0) {
              for (const item of inventoryData) {
                if (item.category !== 'cylinder') continue
                const key = item.productName.toLowerCase().replace(/\s+/g, ' ').trim()
                const prevClosing = prevReports[key]
                if (prevClosing) {
                  await fetch('/api/employee-daily-stock-reports', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      employeeId: user.id,
                      date,
                      itemName: item.productName,
                      openingFull: prevClosing.openingFull,
                      openingEmpty: prevClosing.openingEmpty
                    })
                  })
                }
              }
              console.log(`✅ [EMPLOYEE DSR] Updated stored DSR records with previous day's closing stock`)
            }
          } else {
            console.log(`⚠️ [EMPLOYEE DSR] No previous day data found for ${previousDateStr}, will use current inventory`)
            if (inventoryData.length > 0) {
              await autoFetchEmployeeInventoryForNewDay(date)
            }
          }
        }
      } else {
        // No stored data for this date - fetch previous day's closing stock to use as opening stock
        console.log(`📅 [EMPLOYEE DSR] No stored data for ${date}, fetching previous day's closing stock...`)
        setIsInventoryFetched(false)
        
        // Get previous day's date to fetch closing stock
        const currentDate = new Date(date + 'T00:00:00')
        const previousDate = new Date(currentDate)
        previousDate.setDate(previousDate.getDate() - 1)
        const previousDateStr = previousDate.toISOString().slice(0, 10)
        
        console.log(`🔍 [EMPLOYEE DSR] Fetching previous day (${previousDateStr}) closing stock for ${date}...`)
        
        const prevResponse = await fetch(`/api/employee-daily-stock-reports?employeeId=${user.id}&date=${previousDateStr}`)
        const prevData = await prevResponse.json()
        
        const prevReports: Record<string, { openingFull: number; openingEmpty: number }> = {}
        
        if (prevData.success && Array.isArray(prevData.data) && prevData.data.length > 0) {
          console.log(`📊 [EMPLOYEE DSR] Found ${prevData.data.length} reports from previous day (${previousDateStr})`)
          prevData.data.forEach((report: any) => {
            const key = report.itemName.toLowerCase().replace(/\s+/g, ' ').trim()
            // Use previous day's closing stock as opening stock
            const prevClosingFull = report.closingFull ?? 0
            const prevClosingEmpty = report.closingEmpty ?? 0
            prevReports[key] = {
              openingFull: prevClosingFull,
              openingEmpty: prevClosingEmpty
            }
            console.log(`✅ [EMPLOYEE DSR] ${report.itemName} (key: ${key}): Previous day closing = ${prevClosingFull} Full, ${prevClosingEmpty} Empty → Using as opening stock`)
          })
          setStoredDsrReports(prevReports)
          console.log(`✅ [EMPLOYEE DSR] Set storedDsrReports with ${Object.keys(prevReports).length} items for ${date}`)
          
          // If inventory is loaded, also call autoFetchEmployeeInventoryForNewDay to create DSR entries
          if (inventoryData.length > 0) {
            await autoFetchEmployeeInventoryForNewDay(date)
            // After autoFetchEmployeeInventoryForNewDay, ensure storedDsrReports still has the previous day's closing stock
            if (Object.keys(prevReports).length > 0) {
              setStoredDsrReports(prevReports)
              console.log(`✅ [EMPLOYEE DSR] Preserved previous day's closing stock after autoFetchEmployeeInventoryForNewDay`)
            }
          }
        } else {
          console.log(`⚠️ [EMPLOYEE DSR] No previous day data found for ${previousDateStr}, will use current inventory`)
          if (inventoryData.length > 0) {
            await autoFetchEmployeeInventoryForNewDay(date)
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch stored employee DSR reports:', error)
      setIsInventoryFetched(false)
    }
  }

  // Auto-fetch inventory for new days
  const autoFetchEmployeeInventoryForNewDay = async (date: string) => {
    try {
      // Get previous day's date to fetch closing stock
      const currentDate = new Date(date + 'T00:00:00')
      const previousDate = new Date(currentDate)
      previousDate.setDate(previousDate.getDate() - 1)
      const previousDateStr = previousDate.toISOString().slice(0, 10)
      
      // Fetch previous day's DSR to get closing stock
      const prevResponse = await fetch(`/api/employee-daily-stock-reports?employeeId=${user.id}&date=${previousDateStr}`)
      const prevData = await prevResponse.json()
      const prevReports: Record<string, { closingFull: number; closingEmpty: number }> = {}
      
      if (prevData.success && Array.isArray(prevData.data) && prevData.data.length > 0) {
        prevData.data.forEach((report: any) => {
          const key = report.itemName.toLowerCase().replace(/\s+/g, ' ').trim()
          prevReports[key] = {
            closingFull: report.closingFull || 0,
            closingEmpty: report.closingEmpty || 0
          }
        })
        console.log(`📦 [EMPLOYEE DSR] Loaded ${Object.keys(prevReports).length} items from previous day (${previousDateStr})`)
      }
      
      const reports: Record<string, { openingFull: number; openingEmpty: number }> = {}
      
      for (const item of inventoryData) {
        if (item.category !== 'cylinder') continue
        
        const key = item.productName.toLowerCase().replace(/\s+/g, ' ').trim()
        const prevClosing = prevReports[key]
        const inventoryInfo = { availableFull: item.availableFull || 0, availableEmpty: item.availableEmpty || 0 }
        
        // Use previous day's closing stock as opening stock, fallback to current inventory
        const openingFull = prevClosing?.closingFull ?? inventoryInfo.availableFull ?? 0
        const openingEmpty = prevClosing?.closingEmpty ?? inventoryInfo.availableEmpty ?? 0
        
        console.log(`📅 [EMPLOYEE DSR] ${item.productName}: Opening = ${openingFull} Full, ${openingEmpty} Empty (from previous day closing: ${prevClosing ? `${prevClosing.closingFull}/${prevClosing.closingEmpty}` : 'N/A'})`)
        
        // Auto-create employee DSR entry with previous day's closing stock as opening stock
        await fetch('/api/employee-daily-stock-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: user.id,
            date,
            itemName: item.productName,
            openingFull: openingFull,
            openingEmpty: openingEmpty
          })
        })
        
        reports[key] = {
          openingFull: openingFull,
          openingEmpty: openingEmpty
        }
      }
      
      // Only update storedDsrReports if it's not already set (to preserve values from fetchStoredEmployeeDsrReports)
      setStoredDsrReports((prev) => {
        // If prev is empty, use reports. Otherwise, merge but prefer prev values
        if (Object.keys(prev).length === 0) {
          return reports
        } else {
          // Merge: use prev if it exists, otherwise use reports
          const merged: Record<string, { openingFull: number; openingEmpty: number }> = {}
          for (const item of inventoryData) {
            if (item.category !== 'cylinder') continue
            const key = item.productName.toLowerCase().replace(/\s+/g, ' ').trim()
            merged[key] = prev[key] || reports[key] || { openingFull: 0, openingEmpty: 0 }
          }
          return merged
        }
      })
      setIsInventoryFetched(true)
    } catch (error) {
      console.error('Failed to auto-fetch employee inventory for new day:', error)
    }
  }

  // Fetch and lock employee inventory
  const fetchAndLockEmployeeInventory = async () => {
    try {
      setLoading(true)
      
      // Get previous day's date to fetch closing stock
      const currentDate = new Date(dsrDate + 'T00:00:00')
      const previousDate = new Date(currentDate)
      previousDate.setDate(previousDate.getDate() - 1)
      const previousDateStr = previousDate.toISOString().slice(0, 10)
      
      // Fetch previous day's DSR to get closing stock
      const prevResponse = await fetch(`/api/employee-daily-stock-reports?employeeId=${user.id}&date=${previousDateStr}`)
      const prevData = await prevResponse.json()
      const prevReports: Record<string, { closingFull: number; closingEmpty: number }> = {}
      
      if (prevData.success && Array.isArray(prevData.data) && prevData.data.length > 0) {
        prevData.data.forEach((report: any) => {
          const key = report.itemName.toLowerCase().replace(/\s+/g, ' ').trim()
          prevReports[key] = {
            closingFull: report.closingFull || 0,
            closingEmpty: report.closingEmpty || 0
          }
        })
      }
      
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
        const prevClosing = prevReports[key]
        const inventoryInfo = { availableFull: item.availableFull || 0, availableEmpty: item.availableEmpty || 0 }
        
        // Use previous day's closing stock as opening stock, fallback to current inventory
        const openingFull = prevClosing?.closingFull ?? inventoryInfo.availableFull ?? 0
        const openingEmpty = prevClosing?.closingEmpty ?? inventoryInfo.availableEmpty ?? 0
        
        console.log(`📅 [EMPLOYEE DSR] ${item.productName}: Opening = ${openingFull} Full, ${openingEmpty} Empty (from previous day closing: ${prevClosing ? `${prevClosing.closingFull}/${prevClosing.closingEmpty}` : 'N/A'})`)
        
        // Create/update employee DSR entry with previous day's closing stock as opening stock
        await fetch('/api/employee-daily-stock-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: user.id,
            date: dsrDate,
            itemName: item.productName,
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
      
      // Auto-save DSR data after fetching (silently, no alerts)
      if (dsrData.length > 0) {
        await saveEmployeeDsrRecord()
      }
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
        
        // Calculate closing values using DSR formula (including purchases)
        // Closing Full = Opening Full + Full Purchase + Refilled - Full Cyl Sales - Gas Sales - Transfer Gas + Received Gas
        const closingFull = Math.max(0, 
          openingFull + (item.fullPurchase || 0) + item.refilled - item.fullCylinderSales - item.gasSales - item.transferGas + item.receivedGas
        )
        // Closing Empty = Opening Full + Opening Empty + Full Purchase + Empty Purchase - Full Cyl Sales - Empty Cyl Sales - Deposit Cylinder + Return Cylinder - Transfer Empty + Received Empty - Closing Full
        const closingEmpty = Math.max(0, 
          openingFull + openingEmpty + (item.fullPurchase || 0) + (item.emptyPurchase || 0) - item.fullCylinderSales - item.emptyCylinderSales - item.deposits + item.returns - item.transferEmpty + item.receivedEmpty - closingFull
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
      
      // Step 1.7: Fetch purchase data from daily cylinder transactions
      const purchaseResponse = await fetch(`/api/daily-cylinder-transactions?date=${dsrDate}&employeeId=${user.id}`)
      let purchaseData = []
      
      if (purchaseResponse.ok) {
        const purchaseResult = await purchaseResponse.json()
        purchaseData = purchaseResult.data || []
        console.log('🛒 Purchase data fetched:', purchaseData.length, 'records')
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
            emptyPurchase: 0,
            fullPurchase: 0,
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
            emptyPurchase: 0,
            fullPurchase: 0,
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
      
      // Add purchase data to DSR (full and empty cylinder purchases)
      purchaseData.forEach((purchase: any) => {
        const itemName = purchase.cylinderName || ''
        if (!itemName) return
        
        if (dsrMap.has(itemName)) {
          // Merge with existing entry
          const existing = dsrMap.get(itemName)!
          existing.emptyPurchase += Number(purchase.emptyCylinderPurchaseQuantity || 0)
          existing.fullPurchase += Number(purchase.fullCylinderPurchaseQuantity || 0)
        } else {
          // Create new entry from purchase data
          dsrMap.set(itemName, {
            itemName: itemName,
            openingFull: 0,
            openingEmpty: 0,
            emptyPurchase: Number(purchase.emptyCylinderPurchaseQuantity || 0),
            fullPurchase: Number(purchase.fullCylinderPurchaseQuantity || 0),
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
            emptyPurchase: 0,
            fullPurchase: 0,
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
        // Use stored opening stock (which should be previous day's closing stock for new days)
        // If not available, use current inventory (for first day ever)
        const storedOpening = storedDsrReports[key]
        const openingFull = storedOpening?.openingFull ?? (item.availableFull || 0)
        const openingEmpty = storedOpening?.openingEmpty ?? (item.availableEmpty || 0)
        
        if (dsrMap.has(itemName)) {
          // Merge with existing sales entry
          const existing = dsrMap.get(itemName)!
          existing.openingFull = openingFull
          existing.openingEmpty = openingEmpty
          // Closing Full = Opening Full + Full Purchase + Refilled - Full Cyl Sales - Gas Sales - Transfer Gas + Received Gas
          existing.closingFull = Math.max(0, openingFull + (existing.fullPurchase || 0) + existing.refilled - existing.fullCylinderSales - existing.gasSales - existing.transferGas + existing.receivedGas)
          // Closing Empty = Opening Full + Opening Empty + Full Purchase + Empty Purchase - Full Cyl Sales - Empty Cyl Sales - Deposit Cylinder + Return Cylinder - Transfer Empty + Received Empty - Closing Full
          existing.closingEmpty = Math.max(0, openingFull + openingEmpty + (existing.fullPurchase || 0) + (existing.emptyPurchase || 0) - existing.fullCylinderSales - existing.emptyCylinderSales - existing.deposits + existing.returns - existing.transferEmpty + existing.receivedEmpty - existing.closingFull)
        } else {
          // Create new entry from inventory data (no sales)
          dsrMap.set(itemName, {
            itemName: itemName,
            openingFull,
            openingEmpty,
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

  // Auto-fetch inventory when employee DSR opens (for today's date)
  useEffect(() => {
    if (user.id && inventoryData.length > 0 && !isInventoryFetched) {
      const today = new Date().toISOString().slice(0, 10)
      if (dsrDate === today) {
        // Auto-fetch and lock inventory for today's date
        console.log('🔄 [EMPLOYEE DSR] Auto-fetching inventory for today\'s DSR')
        fetchAndLockEmployeeInventory()
      } else {
        // For previous dates, just fetch stored reports
        fetchStoredEmployeeDsrReports(dsrDate)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            <td>${item.emptyPurchase || 0}</td>
            <td>${item.fullPurchase || 0}</td>
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

      // Calculate totals for PDF
      const totals = dsrData.reduce((acc, item) => ({
        openingFull: acc.openingFull + item.openingFull,
        openingEmpty: acc.openingEmpty + item.openingEmpty,
        emptyPurchase: acc.emptyPurchase + (item.emptyPurchase || 0),
        fullPurchase: acc.fullPurchase + (item.fullPurchase || 0),
        refilled: acc.refilled + item.refilled,
        fullCylinderSales: acc.fullCylinderSales + item.fullCylinderSales,
        emptyCylinderSales: acc.emptyCylinderSales + item.emptyCylinderSales,
        gasSales: acc.gasSales + item.gasSales,
        deposits: acc.deposits + item.deposits,
        returns: acc.returns + item.returns,
        transferGas: acc.transferGas + item.transferGas,
        transferEmpty: acc.transferEmpty + item.transferEmpty,
        receivedGas: acc.receivedGas + item.receivedGas,
        receivedEmpty: acc.receivedEmpty + item.receivedEmpty,
        closingFull: acc.closingFull + item.closingFull,
        closingEmpty: acc.closingEmpty + item.closingEmpty
      }), {
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
          <p><strong>Employee:</strong> ${user.name}</p>
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
              {isInventoryFetched && (
                <Button
                  onClick={saveEmployeeDsrRecord}
                  size="sm"
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto text-xs sm:text-sm"
                >
                  <PlusCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  Save
                </Button>
              )}
              
              <span className="text-xs sm:text-sm text-gray-500">
                {isInventoryFetched ? '✓ Inventory Locked - Data auto-saved' : '⏳ Fetching inventory and auto-saving data...'}
              </span>
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
                      <TableHead colSpan={12} className="text-center border-r">During the day</TableHead>
                      <TableHead colSpan={2} className="text-center bg-blue-100 font-semibold">Closing</TableHead>
                    </TableRow>
                    <TableRow>
                      <TableHead className="text-center min-w-[60px]">Full</TableHead>
                      <TableHead className="text-center border-r min-w-[60px]">Empty</TableHead>
                      <TableHead className="text-center min-w-[70px]">Empty Pur</TableHead>
                      <TableHead className="text-center min-w-[70px]">Full Pur</TableHead>
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
                        <TableCell className="text-center min-w-[70px]">{item.emptyPurchase || 0}</TableCell>
                        <TableCell className="text-center min-w-[70px]">{item.fullPurchase || 0}</TableCell>
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
                    {/* Totals Row */}
                    <TableRow className="bg-gray-100 font-bold">
                      <TableCell className="font-bold border-r sticky left-0 bg-gray-100 z-10 min-w-[120px]">TOTAL</TableCell>
                      <TableCell className="text-center min-w-[60px]">
                        {dsrData.reduce((sum, item) => sum + item.openingFull, 0)}
                      </TableCell>
                      <TableCell className="text-center border-r min-w-[60px]">
                        {dsrData.reduce((sum, item) => sum + item.openingEmpty, 0)}
                      </TableCell>
                      <TableCell className="text-center min-w-[70px]">
                        {dsrData.reduce((sum, item) => sum + (item.emptyPurchase || 0), 0)}
                      </TableCell>
                      <TableCell className="text-center min-w-[70px]">
                        {dsrData.reduce((sum, item) => sum + (item.fullPurchase || 0), 0)}
                      </TableCell>
                      <TableCell className="text-center min-w-[70px]">
                        {dsrData.reduce((sum, item) => sum + item.refilled, 0)}
                      </TableCell>
                      <TableCell className="text-center min-w-[90px]">
                        {dsrData.reduce((sum, item) => sum + item.fullCylinderSales, 0)}
                      </TableCell>
                      <TableCell className="text-center min-w-[90px]">
                        {dsrData.reduce((sum, item) => sum + item.emptyCylinderSales, 0)}
                      </TableCell>
                      <TableCell className="text-center min-w-[70px]">
                        {dsrData.reduce((sum, item) => sum + item.gasSales, 0)}
                      </TableCell>
                      <TableCell className="text-center min-w-[100px]">
                        {dsrData.reduce((sum, item) => sum + item.deposits, 0)}
                      </TableCell>
                      <TableCell className="text-center min-w-[100px]">
                        {dsrData.reduce((sum, item) => sum + item.returns, 0)}
                      </TableCell>
                      <TableCell className="text-center min-w-[90px]">
                        {dsrData.reduce((sum, item) => sum + item.transferGas, 0)}
                      </TableCell>
                      <TableCell className="text-center min-w-[100px]">
                        {dsrData.reduce((sum, item) => sum + item.transferEmpty, 0)}
                      </TableCell>
                      <TableCell className="text-center min-w-[90px]">
                        {dsrData.reduce((sum, item) => sum + item.receivedGas, 0)}
                      </TableCell>
                      <TableCell className="text-center border-r min-w-[100px]">
                        {dsrData.reduce((sum, item) => sum + item.receivedEmpty, 0)}
                      </TableCell>
                      <TableCell className="text-center font-semibold bg-blue-50 min-w-[60px]">
                        {dsrData.reduce((sum, item) => sum + item.closingFull, 0)}
                      </TableCell>
                      <TableCell className="text-center font-semibold bg-blue-50 min-w-[60px]">
                        {dsrData.reduce((sum, item) => sum + item.closingEmpty, 0)}
                      </TableCell>
                    </TableRow>
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
