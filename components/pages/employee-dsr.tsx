"use client"

import React, { useState, useEffect, useRef } from "react"
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
  
  // Track current fetch to cancel previous ones when date changes
  const fetchAbortControllerRef = useRef<AbortController | null>(null)
  const currentFetchDateRef = useRef<string>('')

  // Helper function to normalize product names (same as admin DSR)
  const normalizeName = (s: any): string => {
    if (typeof s === 'string' || typeof s === 'number') {
      return String(s).replace(/\s+/g, ' ').trim().toLowerCase()
    }
    return ''
  }

  // Fetch stored employee DSR reports for opening values
  const fetchStoredEmployeeDsrReports = async (date: string) => {
    // Check if this fetch is for the current date (cancel if date changed)
    if (currentFetchDateRef.current !== date) {
      console.log(`⚠️ [EMPLOYEE DSR] Date changed during fetch, cancelling fetch for ${date}`)
      return
    }
    
    try {
      const response = await fetch(`/api/employee-daily-stock-reports?employeeId=${user.id}&date=${date}`)
      
      // Check again if date changed during fetch
      if (currentFetchDateRef.current !== date) {
        console.log(`⚠️ [EMPLOYEE DSR] Date changed after fetch started, ignoring results for ${date}`)
        return
      }
      
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
          
          // Get previous day's date to fetch closing stock (timezone-safe)
          // Parse date as YYYY-MM-DD and subtract 1 day
          const [year, month, day] = date.split('-').map(Number)
          const currentDate = new Date(Date.UTC(year, month - 1, day))
          const previousDate = new Date(currentDate)
          previousDate.setUTCDate(previousDate.getUTCDate() - 1)
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
              // IMPORTANT: Check both closingFull/closingEmpty and also check if they're null/undefined
              // If closing values are 0 or missing, try to calculate them from the report data
              let prevClosingFull = (report.closingFull !== null && report.closingFull !== undefined) ? report.closingFull : null
              let prevClosingEmpty = (report.closingEmpty !== null && report.closingEmpty !== undefined) ? report.closingEmpty : null
              
              // If closing values are missing or 0, try to calculate them from the report data
              if (prevClosingFull === null || prevClosingFull === 0 || prevClosingEmpty === null || prevClosingEmpty === 0) {
                console.log(`⚠️ [EMPLOYEE DSR] ${report.itemName}: Closing values missing or 0, attempting to calculate from report data...`)
                const openingFull = report.openingFull || 0
                const openingEmpty = report.openingEmpty || 0
                const fullPurchase = report.fullPurchase || 0
                const emptyPurchase = report.emptyPurchase || 0
                const refilled = report.refilled || 0
                const fullCylinderSales = report.fullCylinderSales || 0
                const emptyCylinderSales = report.emptyCylinderSales || 0
                const gasSales = report.gasSales || 0
                const deposits = report.deposits || 0
                const returns = report.returns || 0
                const transferGas = report.transferGas || 0
                const transferEmpty = report.transferEmpty || 0
                const receivedGas = report.receivedGas || 0
                const receivedEmpty = report.receivedEmpty || 0
                
                // Calculate closing using the same formula
                const calculatedClosingFull = Math.max(0, 
                  openingFull + fullPurchase + refilled - fullCylinderSales - gasSales - transferGas + receivedGas
                )
                const calculatedClosingEmpty = Math.max(0, 
                  openingFull + openingEmpty + fullPurchase + emptyPurchase - fullCylinderSales - emptyCylinderSales - deposits + returns - transferEmpty + receivedEmpty - calculatedClosingFull
                )
                
                if (prevClosingFull === null || prevClosingFull === 0) {
                  prevClosingFull = calculatedClosingFull
                  console.log(`📊 [EMPLOYEE DSR] Calculated closingFull=${calculatedClosingFull} for ${report.itemName}`)
                }
                if (prevClosingEmpty === null || prevClosingEmpty === 0) {
                  prevClosingEmpty = calculatedClosingEmpty
                  console.log(`📊 [EMPLOYEE DSR] Calculated closingEmpty=${calculatedClosingEmpty} for ${report.itemName}`)
                }
              }
              
              prevReports[key] = {
                openingFull: prevClosingFull,
                openingEmpty: prevClosingEmpty
              }
              console.log(`✅ [EMPLOYEE DSR] ${report.itemName} (key: ${key}): Previous day closing = ${prevClosingFull} Full, ${prevClosingEmpty} Empty → Using as opening stock`)
              console.log(`🔍 [EMPLOYEE DSR] Raw report data:`, { closingFull: report.closingFull, closingEmpty: report.closingEmpty, itemName: report.itemName, openingFull: report.openingFull, openingEmpty: report.openingEmpty, fullPurchase: report.fullPurchase, emptyPurchase: report.emptyPurchase, refilled: report.refilled, fullCylinderSales: report.fullCylinderSales, emptyCylinderSales: report.emptyCylinderSales, gasSales: report.gasSales, deposits: report.deposits, returns: report.returns, transferGas: report.transferGas, transferEmpty: report.transferEmpty, receivedGas: report.receivedGas, receivedEmpty: report.receivedEmpty })
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
        
        // Get previous day's date to fetch closing stock (timezone-safe)
        const [year, month, day] = date.split('-').map(Number)
        const currentDate = new Date(Date.UTC(year, month - 1, day))
        const previousDate = new Date(currentDate)
        previousDate.setUTCDate(previousDate.getUTCDate() - 1)
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
      // Get previous day's date to fetch closing stock (timezone-safe)
      const [year, month, day] = date.split('-').map(Number)
      const currentDate = new Date(Date.UTC(year, month - 1, day))
      const previousDate = new Date(currentDate)
      previousDate.setUTCDate(previousDate.getUTCDate() - 1)
      const previousDateStr = previousDate.toISOString().slice(0, 10)
      
      // Fetch previous day's DSR to get closing stock
      const prevResponse = await fetch(`/api/employee-daily-stock-reports?employeeId=${user.id}&date=${previousDateStr}`)
      const prevData = await prevResponse.json()
      const prevReports: Record<string, { closingFull: number; closingEmpty: number }> = {}
      
      if (prevData.success && Array.isArray(prevData.data) && prevData.data.length > 0) {
        prevData.data.forEach((report: any) => {
          const key = report.itemName.toLowerCase().replace(/\s+/g, ' ').trim()
          // IMPORTANT: Check both closingFull/closingEmpty and also check if they're null/undefined
          // If closing values are 0 or missing, try to calculate them from the report data
          let closingFull = (report.closingFull !== null && report.closingFull !== undefined) ? report.closingFull : null
          let closingEmpty = (report.closingEmpty !== null && report.closingEmpty !== undefined) ? report.closingEmpty : null
          
          // If closing values are missing or 0, try to calculate them from the report data
          if (closingFull === null || closingFull === 0 || closingEmpty === null || closingEmpty === 0) {
            const openingFull = report.openingFull || 0
            const openingEmpty = report.openingEmpty || 0
            const fullPurchase = report.fullPurchase || 0
            const emptyPurchase = report.emptyPurchase || 0
            const refilled = report.refilled || 0
            const fullCylinderSales = report.fullCylinderSales || 0
            const emptyCylinderSales = report.emptyCylinderSales || 0
            const gasSales = report.gasSales || 0
            const deposits = report.deposits || 0
            const returns = report.returns || 0
            const transferGas = report.transferGas || 0
            const transferEmpty = report.transferEmpty || 0
            const receivedGas = report.receivedGas || 0
            const receivedEmpty = report.receivedEmpty || 0
            
            // Calculate closing using the same formula
            const calculatedClosingFull = Math.max(0, 
              openingFull + fullPurchase + refilled - fullCylinderSales - gasSales - transferGas + receivedGas
            )
            const calculatedClosingEmpty = Math.max(0, 
              openingFull + openingEmpty + fullPurchase + emptyPurchase - fullCylinderSales - emptyCylinderSales - deposits + returns - transferEmpty + receivedEmpty - calculatedClosingFull
            )
            
            if (closingFull === null || closingFull === 0) {
              closingFull = calculatedClosingFull
            }
            if (closingEmpty === null || closingEmpty === 0) {
              closingEmpty = calculatedClosingEmpty
            }
          }
          
          prevReports[key] = {
            closingFull: closingFull || 0,
            closingEmpty: closingEmpty || 0
          }
          console.log(`📦 [EMPLOYEE DSR] ${report.itemName} (key: ${key}): Previous day closing = ${closingFull} Full, ${closingEmpty} Empty`)
        })
        console.log(`📦 [EMPLOYEE DSR] Loaded ${Object.keys(prevReports).length} items from previous day (${previousDateStr})`)
      } else {
        console.log(`⚠️ [EMPLOYEE DSR] No previous day data found for ${previousDateStr}`)
      }
      
      const reports: Record<string, { openingFull: number; openingEmpty: number }> = {}
      
      for (const item of inventoryData) {
        if (item.category !== 'cylinder') continue
        
        const key = item.productName.toLowerCase().replace(/\s+/g, ' ').trim()
        const prevClosing = prevReports[key]
        
        // Opening should ALWAYS be from previous day's closing stock, never from current inventory
        // If no previous day data exists, use 0 (not current inventory)
        const openingFull = prevClosing?.closingFull ?? 0
        const openingEmpty = prevClosing?.closingEmpty ?? 0
        
        console.log(`📅 [EMPLOYEE DSR] ${item.productName}: Opening = ${openingFull} Full, ${openingEmpty} Empty (from previous day closing: ${prevClosing ? `${prevClosing.closingFull}/${prevClosing.closingEmpty}` : 'N/A - using 0'})`)
        
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
      
      // Get previous day's date to fetch closing stock (timezone-safe)
      const [year, month, day] = dsrDate.split('-').map(Number)
      const currentDate = new Date(Date.UTC(year, month - 1, day))
      const previousDate = new Date(currentDate)
      previousDate.setUTCDate(previousDate.getUTCDate() - 1)
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
        
        // Opening should ALWAYS be from previous day's closing stock, never from current inventory
        // If no previous day data exists, use 0 (not current inventory)
        const openingFull = prevClosing?.closingFull ?? 0
        const openingEmpty = prevClosing?.closingEmpty ?? 0
        
        console.log(`📅 [EMPLOYEE DSR] ${item.productName}: Opening = ${openingFull} Full, ${openingEmpty} Empty (from previous day closing: ${prevClosing ? `${prevClosing.closingFull}/${prevClosing.closingEmpty}` : 'N/A - using 0'})`)
        
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
        await saveEmployeeDsrRecord(false) // false = don't show alert
      }
    } catch (error) {
      console.error('Failed to fetch and lock employee inventory:', error)
    } finally {
      setLoading(false)
    }
  }

  // Save employee DSR record with closing values
  const saveEmployeeDsrRecord = async (showAlert: boolean = true) => {
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
        
        // Log the calculation for debugging
        console.log(`💾 [EMPLOYEE SAVE] ${item.itemName}: Opening=${openingFull}/${openingEmpty}, FullPur=${item.fullPurchase || 0}, EmptyPur=${item.emptyPurchase || 0}, Refilled=${item.refilled}, FullCylSales=${item.fullCylinderSales}, EmptyCylSales=${item.emptyCylinderSales}, GasSales=${item.gasSales}, Deposits=${item.deposits}, Returns=${item.returns}, TransferGas=${item.transferGas}, TransferEmpty=${item.transferEmpty}, ReceivedGas=${item.receivedGas}, ReceivedEmpty=${item.receivedEmpty} → Closing=${closingFull}/${closingEmpty}`)
        
        const response = await fetch('/api/employee-daily-stock-reports', {
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
        
        const saveResult = await response.json()
        if (!saveResult.success) {
          console.error(`❌ [EMPLOYEE SAVE] Failed to save ${item.itemName}:`, saveResult.error)
        } else {
          console.log(`✅ [EMPLOYEE SAVE] Saved ${item.itemName} with closing=${closingFull}/${closingEmpty}`)
        }
      }
      
      // Only show alert if explicitly requested (for manual saves)
      if (showAlert) {
        alert('Employee DSR record saved successfully!')
      }
    } catch (error) {
      console.error('Failed to save employee DSR record:', error)
      if (showAlert) {
        alert('Failed to save employee DSR record')
      }
    } finally {
      setLoading(false)
    }
  }

  // Fetch employee DSR data
  const fetchEmployeeDSR = async () => {
    if (!user.id || !dsrDate) return
    
    // Cancel any previous fetch
    if (fetchAbortControllerRef.current) {
      fetchAbortControllerRef.current.abort()
    }
    
    // Create new abort controller for this fetch
    const abortController = new AbortController()
    fetchAbortControllerRef.current = abortController
    currentFetchDateRef.current = dsrDate
    
    // Clear previous data immediately to prevent stale data from showing
    setDsrData([])
    setStoredDsrReports({})
    setIsInventoryFetched(false)
    
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
      
      // Step 1.8: Fetch stock assignments to track received stock (when employee accepts stock)
      const stockAssignmentsResponse = await fetch(`/api/stock-assignments?employeeId=${user.id}`)
      let stockAssignmentsData = []
      
      if (stockAssignmentsResponse.ok) {
        const stockAssignmentsResult = await stockAssignmentsResponse.json()
        stockAssignmentsData = Array.isArray(stockAssignmentsResult?.data) 
          ? stockAssignmentsResult.data 
          : Array.isArray(stockAssignmentsResult) 
            ? stockAssignmentsResult 
            : []
        console.log('📦 Stock assignments fetched:', stockAssignmentsData.length, 'records')
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
      
      // CRITICAL: Add all cylinders from inventory to dsrMap BEFORE processing stock assignments
      // This ensures all cylinder rows exist so stock assignments can match to them
      // Store inventory data for later use
      setInventoryData(inventoryData)
      
      // Pre-populate dsrMap with all cylinder items from inventory (with empty values)
      // This ensures stock assignments can always find the correct cylinder row to add receivedGas/receivedEmpty to
      inventoryData.forEach((item: any) => {
        if (item.category !== 'cylinder') return
        
        const itemName = item.productName
        const key = normalizeName(itemName)
        
        // Only create entry if it doesn't exist yet
        if (!dsrMap.has(itemName)) {
          // Check if it exists by normalized name
          let exists = false
          for (const [mapKey] of dsrMap.entries()) {
            if (normalizeName(mapKey) === key) {
              exists = true
              break
            }
          }
          
          if (!exists) {
            // Create empty entry for this cylinder - it will be populated with opening stock later
            dsrMap.set(itemName, {
              itemName: itemName,
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
              closingEmpty: 0,
              category: 'cylinder'
            })
            console.log(`📦 [EMPLOYEE DSR] Pre-created cylinder entry for: ${itemName}`)
          }
        }
      })
      
      console.log(`📊 [EMPLOYEE DSR] After pre-populating inventory, dsrMap has ${dsrMap.size} entries`)
      
      // Process stock assignments to track received stock (when employee accepts stock)
      // Helper function to check if a date matches the DSR date
      const inSelectedDay = (dateStr: string | Date): boolean => {
        if (!dateStr) return false
        let dateObj: Date
        if (typeof dateStr === 'string') {
          dateObj = new Date(dateStr)
        } else {
          dateObj = dateStr
        }
        const dateOnly = dateObj.toISOString().slice(0, 10)
        return dateOnly === dsrDate
      }
      
      console.log(`🔍 [EMPLOYEE DSR] Processing ${stockAssignmentsData.length} stock assignments for date ${dsrDate}`)
      
      stockAssignmentsData.forEach((assignment: any) => {
        const productName = assignment.product?.name || assignment.productName || ''
        // Get category from multiple possible sources
        let category = assignment.category || assignment.displayCategory || assignment.product?.category || ''
        // Normalize category to lowercase for comparison
        if (category) {
          category = category.toLowerCase()
        }
        const cylinderStatus = assignment.cylinderStatus || ''
        const quantity = Number(assignment.quantity || assignment.remainingQuantity || 0)
        const status = assignment.status || ''
        
        // Get received date - check multiple possible fields
        let receivedDate = assignment.receivedDate || assignment.updatedAt || assignment.createdAt || ''
        if (receivedDate && typeof receivedDate === 'object' && receivedDate.toISOString) {
          receivedDate = receivedDate.toISOString()
        }
        
        // Also check if status is 'received' and use assignedDate if receivedDate is not available
        // (some assignments might be marked as received immediately)
        if (status === 'received' && !receivedDate) {
          receivedDate = assignment.assignedDate || assignment.createdAt || ''
          if (receivedDate && typeof receivedDate === 'object' && receivedDate.toISOString) {
            receivedDate = receivedDate.toISOString()
          }
        }
        
        console.log(`🔍 [EMPLOYEE DSR] Checking assignment: ${productName}, status: ${status}, receivedDate: ${receivedDate}, category: ${category} (from assignment.category=${assignment.category}, assignment.displayCategory=${assignment.displayCategory}, product.category=${assignment.product?.category}), quantity: ${quantity}`)
        
        // Only process assignments that were received on the selected date
        // Also check if status is 'received' even if receivedDate doesn't match (might be same day)
        const isReceived = status === 'received' || status === 'active'
        const dateMatches = receivedDate && inSelectedDay(receivedDate)
        const isToday = !receivedDate && dsrDate === new Date().toISOString().slice(0, 10) // If no receivedDate but status is received and it's today
        
        if (isReceived && (dateMatches || isToday)) {
          // Determine which cylinder row this should be added to
          // For gas assignments, check if there's a related cylinder
          let targetCylinderName = productName
          let targetItemName = productName
          
          // If this is gas, try to find the related cylinder
          if (category === 'gas') {
            // Check for related cylinder in multiple possible fields
            // Priority: cylinderProductId (populated) > relatedCylinderName > cylinderProductId (ID only)
            const relatedCylinderName = (assignment.cylinderProductId?.name) || 
                                       assignment.relatedCylinderName || 
                                       (assignment.cylinderProductId && typeof assignment.cylinderProductId === 'string' ? '' : '') ||
                                       ''
            
            if (relatedCylinderName) {
              targetCylinderName = relatedCylinderName
              targetItemName = relatedCylinderName
              console.log(`🔗 [EMPLOYEE DSR] Gas assignment linked to cylinder: ${productName} → ${relatedCylinderName}`)
            } else {
              // If no related cylinder, try to infer from product name or find matching cylinder
              // For gas products, they're usually related to a cylinder - try to find a matching cylinder in inventory
              for (const invItem of inventoryData) {
                if (invItem.category === 'cylinder') {
                  // Check if the gas product name contains the cylinder name or vice versa
                  const gasNameLower = productName.toLowerCase()
                  const cylNameLower = invItem.productName.toLowerCase()
                  // Simple heuristic: if cylinder name is in gas name or gas name suggests a cylinder
                  if (gasNameLower.includes(cylNameLower) || cylNameLower.includes(gasNameLower.split(' ')[0])) {
                    targetCylinderName = invItem.productName
                    targetItemName = invItem.productName
                    console.log(`🔗 [EMPLOYEE DSR] Inferred cylinder from gas name: ${productName} → ${targetCylinderName}`)
                    break
                  }
                }
              }
              if (targetItemName === productName) {
                console.log(`⚠️ [EMPLOYEE DSR] Gas assignment ${productName} has no related cylinder, will try to match by name to existing cylinder rows`)
              }
            }
          }
          
          // Normalize the target name for matching
          const normalizedTargetName = normalizeName(targetItemName)
          
          console.log(`📥 [EMPLOYEE DSR] Processing received stock assignment: ${productName} (${quantity}), category: ${category}, targetCylinder: ${targetCylinderName}, receivedDate: ${receivedDate}, dateMatches: ${dateMatches}, isToday: ${isToday}`)
          
          // Try to find the item in dsrMap by exact name or normalized name
          let foundItem: DSRItem | null = null
          let foundKey: string | null = null
          
          // First try exact match with target item name
          if (dsrMap.has(targetItemName)) {
            foundItem = dsrMap.get(targetItemName)!
            foundKey = targetItemName
          } else {
            // Try to find by normalized name
            for (const [key, value] of dsrMap.entries()) {
              const normalizedKey = normalizeName(key)
              if (normalizedKey === normalizedTargetName) {
                foundItem = value
                foundKey = key
                break
              }
            }
          }
          
          if (foundItem && foundKey) {
            // Merge with existing entry - add to the correct cylinder row
            if (category === 'gas') {
              foundItem.receivedGas += quantity
              console.log(`✅ [EMPLOYEE DSR] Added ${quantity} to Received Gas for ${foundKey} (cylinder row). New total: ${foundItem.receivedGas}`)
            } else if (category === 'cylinder' || !category) {
              // For cylinders or if category is not set, track as received empty
              // Full cylinders transferred become empty at employee location
              foundItem.receivedEmpty += quantity
              console.log(`✅ [EMPLOYEE DSR] Added ${quantity} to Received Empty for ${foundKey} (cylinder row). New total: ${foundItem.receivedEmpty}`)
            } else {
              console.log(`⚠️ [EMPLOYEE DSR] Unknown category "${category}" for ${targetItemName}, defaulting to receivedEmpty`)
              foundItem.receivedEmpty += quantity
            }
          } else {
            // Item not found in dsrMap - this shouldn't happen for cylinders, but might for gas
            // Only create a new entry if it's a cylinder (gas should always match to a cylinder row)
            if (category === 'cylinder' || !category) {
              const newEntry: DSRItem = {
                itemName: targetItemName,
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
                receivedEmpty: quantity,
                closingFull: 0,
                closingEmpty: 0,
                category: 'cylinder'
              }
              dsrMap.set(targetItemName, newEntry)
              console.log(`✅ [EMPLOYEE DSR] Created new cylinder entry for received stock: ${targetItemName} with receivedEmpty=${quantity}`)
            } else {
              console.log(`⚠️ [EMPLOYEE DSR] Gas assignment ${productName} could not be matched to any cylinder row. Related cylinder: ${targetCylinderName}`)
            }
          }
        } else {
          console.log(`⚠️ [EMPLOYEE DSR] Skipping assignment: ${productName}, isReceived: ${isReceived}, dateMatches: ${dateMatches}, isToday: ${isToday}`)
        }
      })
      
      console.log(`📊 [EMPLOYEE DSR] After processing stock assignments, dsrMap has ${dsrMap.size} entries`)
      
      // Now update inventory data entries with opening stock and calculate closing
      // (inventory entries were already created above, now we just update them with opening stock)
      inventoryData.forEach((item: any) => {
        if (item.category !== 'cylinder') return
        
        const itemName = item.productName
        const key = itemName.toLowerCase().replace(/\s+/g, ' ').trim()
        
        // Opening should ALWAYS be from previous day's closing stock, never from current inventory
        // If no stored opening data exists, use 0 (not current inventory)
        const storedOpening = storedDsrReports[key]
        const openingFull = storedOpening?.openingFull ?? 0
        const openingEmpty = storedOpening?.openingEmpty ?? 0
        
        // Try to find existing entry by exact name or normalized name
        let existingEntry: DSRItem | null = null
        let existingKey: string | null = null
        
        if (dsrMap.has(itemName)) {
          existingEntry = dsrMap.get(itemName)!
          existingKey = itemName
        } else {
          // Try to find by normalized name
          for (const [mapKey, mapValue] of dsrMap.entries()) {
            const normalizedMapKey = mapKey.toLowerCase().replace(/\s+/g, ' ').trim()
            if (normalizedMapKey === key) {
              existingEntry = mapValue
              existingKey = mapKey
              break
            }
          }
        }
        
        if (existingEntry && existingKey) {
          // Merge with existing entry - preserve receivedGas and receivedEmpty values
          existingEntry.openingFull = openingFull
          existingEntry.openingEmpty = openingEmpty
          // Preserve receivedGas and receivedEmpty if they were already set from stock assignments
          const preservedReceivedGas = existingEntry.receivedGas || 0
          const preservedReceivedEmpty = existingEntry.receivedEmpty || 0
          // Closing Full = Opening Full + Full Purchase + Refilled - Full Cyl Sales - Gas Sales - Transfer Gas + Received Gas
          existingEntry.closingFull = Math.max(0, openingFull + (existingEntry.fullPurchase || 0) + existingEntry.refilled - existingEntry.fullCylinderSales - existingEntry.gasSales - existingEntry.transferGas + preservedReceivedGas)
          // Closing Empty = Opening Full + Opening Empty + Full Purchase + Empty Purchase - Full Cyl Sales - Empty Cyl Sales - Deposit Cylinder + Return Cylinder - Transfer Empty + Received Empty - Closing Full
          existingEntry.closingEmpty = Math.max(0, openingFull + openingEmpty + (existingEntry.fullPurchase || 0) + (existingEntry.emptyPurchase || 0) - existingEntry.fullCylinderSales - existingEntry.emptyCylinderSales - existingEntry.deposits + existingEntry.returns - existingEntry.transferEmpty + preservedReceivedEmpty - existingEntry.closingFull)
          console.log(`🔄 [EMPLOYEE DSR] Updated existing entry for ${itemName}, preserved receivedGas=${preservedReceivedGas}, receivedEmpty=${preservedReceivedEmpty}`)
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
      // BUT include items that have receivedGas or receivedEmpty > 0 (even if they're gas products)
      const finalDsrData = Array.from(dsrMap.values()).filter(item => {
        const itemNameLower = item.itemName.toLowerCase()
        // Include items with receivedGas or receivedEmpty (these are stock assignments that were received)
        if (item.receivedGas > 0 || item.receivedEmpty > 0) {
          console.log(`✅ [EMPLOYEE DSR] Including item with received stock: ${item.itemName} (receivedGas=${item.receivedGas}, receivedEmpty=${item.receivedEmpty})`)
          return true
        }
        // Exclude items that start with "gas " but include items with "cylinder" in the name
        return !itemNameLower.startsWith('gas ') || itemNameLower.includes('cylinder')
      })
      
      // Check if fetch was cancelled (date changed)
      if (abortController.signal.aborted || currentFetchDateRef.current !== dsrDate) {
        console.log(`⚠️ [EMPLOYEE DSR] Fetch cancelled or date changed, not updating data`)
        return
      }
      
      setDsrData(finalDsrData)
      
      // Fetch stored DSR reports for opening values (must complete before showing data)
      await fetchStoredEmployeeDsrReports(dsrDate)
      
      // Check again if date changed during fetchStoredEmployeeDsrReports
      if (abortController.signal.aborted || currentFetchDateRef.current !== dsrDate) {
        console.log(`⚠️ [EMPLOYEE DSR] Fetch cancelled or date changed after fetching stored reports, not updating data`)
        return
      }
      
      // Recalculate and save closing stock after all data is loaded
      // This ensures closing values are persisted to the database for next day's opening stock
      setTimeout(async () => {
        // Check if date changed during timeout
        if (currentFetchDateRef.current !== dsrDate) {
          console.log(`⚠️ [EMPLOYEE RECALC] Date changed during recalculation, cancelling for ${dsrDate}`)
          return
        }
        
        if (finalDsrData.length > 0 && storedDsrReports) {
          console.log(`🔄 [EMPLOYEE RECALC] Recalculating and saving closing stock for ${dsrDate}...`)
          for (const item of finalDsrData) {
            // Check again inside loop
            if (currentFetchDateRef.current !== dsrDate) {
              console.log(`⚠️ [EMPLOYEE RECALC] Date changed during save loop, cancelling`)
              return
            }
            const key = item.itemName.toLowerCase().replace(/\s+/g, ' ').trim()
            const openingFull = storedDsrReports[key]?.openingFull || item.openingFull || 0
            const openingEmpty = storedDsrReports[key]?.openingEmpty || item.openingEmpty || 0
            
            // Calculate closing values using DSR formula
            const closingFull = Math.max(0, 
              openingFull + (item.fullPurchase || 0) + item.refilled - item.fullCylinderSales - item.gasSales - item.transferGas + item.receivedGas
            )
            const closingEmpty = Math.max(0, 
              openingFull + openingEmpty + (item.fullPurchase || 0) + (item.emptyPurchase || 0) - item.fullCylinderSales - item.emptyCylinderSales - item.deposits + item.returns - item.transferEmpty + item.receivedEmpty - closingFull
            )
            
            // Save closing values to database
            console.log(`💾 [EMPLOYEE RECALC-SAVE] ${item.itemName} for ${dsrDate}: Closing=${closingFull}/${closingEmpty}`)
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
          console.log(`✅ [EMPLOYEE RECALC-SAVE] Recalculated and saved closing values for ${dsrDate}`)
        }
      }, 1000) // Wait 1 second for all state to be updated
      
      console.log('✅ Employee DSR data processed:', {
        salesRecords: salesData.length,
        cylinderRecords: cylinderData.length,
        refillRecords: refillData.length,
        inventoryItems: inventoryData.length,
        finalDsrItems: finalDsrData.length,
        items: finalDsrData
      })
      
    } catch (error: any) {
      // Don't show error if fetch was aborted (user changed date)
      if (error.name === 'AbortError' || abortController.signal.aborted) {
        console.log('ℹ️ [EMPLOYEE DSR] Fetch aborted (date changed)')
        return
      }
      console.error('❌ Failed to fetch employee DSR:', error)
      // Only clear data if this is still the current date
      if (currentFetchDateRef.current === dsrDate) {
        setDsrData([])
      }
    } finally {
      // Only update loading state if this is still the current date
      if (currentFetchDateRef.current === dsrDate) {
        setLoading(false)
      }
    }
  }

  // Fetch DSR data when component mounts or date changes
  useEffect(() => {
    if (user.id && dsrDate) {
      // Clear previous data immediately when date changes
      setDsrData([])
      setStoredDsrReports({})
      setIsInventoryFetched(false)
      
      fetchEmployeeDSR()
    }
    
    // Cleanup: abort fetch when component unmounts or date changes
    return () => {
      if (fetchAbortControllerRef.current) {
        fetchAbortControllerRef.current.abort()
      }
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
          saveEmployeeDsrRecord(false) // false = don't show alert for auto-save
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
                {isInventoryFetched ? '✓ Opening stock loaded from previous day - Data auto-saved' : '⏳ Loading previous day\'s closing stock as opening stock...'}
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
