"use client"

import React, { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CalendarIcon, RefreshCw, Eye, PlusCircle, FileText } from "lucide-react"
import { getLocalDateString, getPreviousDate, getNextDate, getLocalDateStringFromDate, isToday } from "@/lib/date-utils"

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

const EmployeeDSR = ({ user }: EmployeeDSRProps) => {
  const [dsrDate, setDsrDate] = useState(getLocalDateString())
  const [dsrData, setDsrData] = useState<DSRItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Stored DSR reports with locked opening values
  const [storedDsrReports, setStoredDsrReports] = useState<Record<string, { openingFull: number; openingEmpty: number }>>({})
  const [isInventoryFetched, setIsInventoryFetched] = useState(false)
  const [inventoryData, setInventoryData] = useState<any[]>([])
  
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
  // Returns the reports data directly for immediate use (avoids state update delay)
  const fetchStoredEmployeeDsrReports = async (date: string): Promise<Record<string, { openingFull: number; openingEmpty: number }>> => {
    // Check if this fetch is for the current date (cancel if date changed)
    if (currentFetchDateRef.current !== date) {
      return {}
    }
    
    const today = getLocalDateString()
    const isTodayDate = date === today
    
    console.log(`🔍 [DIAGNOSTIC] fetchStoredEmployeeDsrReports called for date: ${date}`)
    console.log(`🔍 [DIAGNOSTIC] Is today's date? ${isToday(date)}`)
    
    try {
      const response = await fetch(`/api/employee-daily-stock-reports?employeeId=${user.id}&date=${date}`)
      
      // Check again if date changed during fetch
      if (currentFetchDateRef.current !== date) {
        return {}
      }
      
      const data = await response.json()
      
      console.log(`🔍 [DIAGNOSTIC] API response for ${date}:`, { 
        success: data.success, 
        dataCount: Array.isArray(data.data) ? data.data.length : 0,
        itemNames: Array.isArray(data.data) ? data.data.map((r: any) => r.itemName) : []
      })
      
      const reports: Record<string, { openingFull: number; openingEmpty: number }> = {}
      
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        // Check if stored data has valid opening stock (non-zero) or if we need to fetch previous day's closing stock
        const hasValidOpeningStock = data.data.some((report: any) => 
          (report.openingFull && report.openingFull > 0) || (report.openingEmpty && report.openingEmpty > 0)
        )
        
        console.log(`🔍 [DIAGNOSTIC] Has valid opening stock? ${hasValidOpeningStock}, checking ${data.data.length} reports`)
        
        if (hasValidOpeningStock) {
          // CRITICAL FIX: Even if stored data exists, we MUST verify it matches previous day's closing stock
          // This ensures opening stock is always correct and not from an old/incorrect save
          const previousDateStr = getPreviousDate(date)
          console.log(`🔍 [DIAGNOSTIC] Stored data exists for ${date}, but verifying against yesterday (${previousDateStr}) closing stock...`)
          
          // Fetch yesterday's closing stock to verify/update stored opening stock
          try {
            const prevResponse = await fetch(`/api/employee-daily-stock-reports?employeeId=${user.id}&date=${previousDateStr}`)
            const prevData = await prevResponse.json()
            
            const prevReportsMap: Record<string, { closingFull: number; closingEmpty: number }> = {}
            if (prevData.success && Array.isArray(prevData.data) && prevData.data.length > 0) {
              prevData.data.forEach((report: any) => {
                const key = normalizeName(report.itemName)
                // Get closing stock, calculate if missing
                let closingFull = (report.closingFull !== null && report.closingFull !== undefined) ? report.closingFull : null
                let closingEmpty = (report.closingEmpty !== null && report.closingEmpty !== undefined) ? report.closingEmpty : null
                
                if (closingFull === null || closingEmpty === null) {
                  // Calculate closing if missing
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
                  
                  if (closingFull === null) {
                    closingFull = Math.max(0, openingFull + fullPurchase + refilled - fullCylinderSales - gasSales - transferGas + receivedGas)
                  }
                  if (closingEmpty === null) {
                    closingEmpty = Math.max(0, openingFull + openingEmpty + fullPurchase + emptyPurchase - fullCylinderSales - emptyCylinderSales - deposits + returns - transferEmpty + receivedEmpty - closingFull)
                  }
                }
                
                prevReportsMap[key] = {
                  closingFull: closingFull || 0,
                  closingEmpty: closingEmpty || 0
                }
              })
            }
            
            // Use previous day's closing stock as opening stock (ALWAYS, even if stored data exists)
            // This ensures correctness - opening stock MUST equal previous day's closing stock
            if (inventoryData.length > 0) {
              for (const item of inventoryData) {
                if (item.category !== 'cylinder') continue
                const key = normalizeName(item.productName)
                const prevClosing = prevReportsMap[key]
                const storedOpening = data.data.find((r: any) => normalizeName(r.itemName) === key)
                
                if (prevClosing) {
                  // ALWAYS use previous day's closing stock as opening stock
                  reports[key] = {
                    openingFull: prevClosing.closingFull,
                    openingEmpty: prevClosing.closingEmpty
                  }
                  
                  // Log if stored data differs from previous day's closing
                  if (storedOpening && (storedOpening.openingFull !== prevClosing.closingFull || storedOpening.openingEmpty !== prevClosing.closingEmpty)) {
                    console.warn(`⚠️ [DIAGNOSTIC] ${item.productName}: Stored opening (${storedOpening.openingFull}/${storedOpening.openingEmpty}) differs from yesterday's closing (${prevClosing.closingFull}/${prevClosing.closingEmpty}). Using yesterday's closing.`)
                  } else {
                    console.log(`✅ [DIAGNOSTIC] ${item.productName}: Using yesterday's closing (${prevClosing.closingFull}/${prevClosing.closingEmpty}) as today's opening`)
                  }
                } else {
                  // No previous day data, use stored data or default to 0
                  reports[key] = {
                    openingFull: storedOpening?.openingFull || 0,
                    openingEmpty: storedOpening?.openingEmpty || 0
                  }
                  console.log(`🔍 [DIAGNOSTIC] ${item.productName}: No yesterday data, using stored opening (${reports[key].openingFull}/${reports[key].openingEmpty})`)
                }
              }
            } else {
              // If inventory not loaded yet, use stored data temporarily
              data.data.forEach((report: any) => {
                const key = normalizeName(report.itemName)
                reports[key] = {
                  openingFull: report.openingFull || 0,
                  openingEmpty: report.openingEmpty || 0
                }
              })
            }
          } catch (err) {
            console.error('Failed to fetch yesterday data for verification:', err)
            // Fallback to stored data on error
            data.data.forEach((report: any) => {
              const key = normalizeName(report.itemName)
              reports[key] = {
                openingFull: report.openingFull || 0,
                openingEmpty: report.openingEmpty || 0
              }
            })
            setIsInventoryFetched(true)
            setStoredDsrReports(reports)
            console.log(`✅ [DIAGNOSTIC] Opening stock verified/updated for ${date} from yesterday (${previousDateStr}) closing stock, storedDsrReports set with ${Object.keys(reports).length} items`)
            return reports
          }
          
          setIsInventoryFetched(true)
          setStoredDsrReports(reports)
          console.log(`✅ [DIAGNOSTIC] Opening stock verified/updated for ${date} from yesterday (${previousDateStr}) closing stock, storedDsrReports set with ${Object.keys(reports).length} items`)
          return reports
        } else {
          // Stored data exists but has zero opening stock - fetch previous day's closing stock instead
          console.log(`🔍 [DIAGNOSTIC] Stored data for ${date} has zero opening stock, fetching previous day's closing stock...`)
          setIsInventoryFetched(false)
          
          // Get previous day's date to fetch closing stock (Dubai timezone-safe)
          // Use getPreviousDate to ensure consistent timezone handling
          const previousDateStr = getPreviousDate(date)
          
          console.log(`🔍 [DIAGNOSTIC] TODAY: ${date}, YESTERDAY: ${previousDateStr} - Fetching yesterday's closing stock...`)
          
          const prevResponse = await fetch(`/api/employee-daily-stock-reports?employeeId=${user.id}&date=${previousDateStr}`)
          const prevData = await prevResponse.json()
          
          const prevReports: Record<string, { openingFull: number; openingEmpty: number }> = {}
          
          if (prevData.success && Array.isArray(prevData.data) && prevData.data.length > 0) {
            console.log(`🔍 [DIAGNOSTIC] Found ${prevData.data.length} reports from yesterday (${previousDateStr})`)
            prevData.data.forEach((report: any) => {
              const key = normalizeName(report.itemName)
              const prevClosingFull = report.closingFull ?? 0
              const prevClosingEmpty = report.closingEmpty ?? 0
              prevReports[key] = {
                openingFull: prevClosingFull,
                openingEmpty: prevClosingEmpty
              }
              console.log(`🔍 [DIAGNOSTIC] ${report.itemName}: Yesterday's closingFull=${prevClosingFull}, closingEmpty=${prevClosingEmpty}`)
            })
          }
          
          // CRITICAL: Ensure ALL products in inventoryData have entries in prevReports
          if (inventoryData.length > 0) {
            for (const item of inventoryData) {
              if (item.category !== 'cylinder') continue
              const key = normalizeName(item.productName)
              if (!prevReports[key]) {
                prevReports[key] = { openingFull: 0, openingEmpty: 0 }
                console.log(`🔍 [DIAGNOSTIC] ${item.productName} (key: ${key}) not in yesterday's data, defaulting to 0/0 opening stock`)
              }
            }
          }
          
          setIsInventoryFetched(true)
          setStoredDsrReports(prevReports)
          console.log(`✅ [DIAGNOSTIC] storedDsrReports SET for ${date} with ${Object.keys(prevReports).length} items:`, Object.keys(prevReports))
          return prevReports
        }
      } else {
        // No stored data for this date - fetch previous day's closing stock to use as opening stock
        console.log(`🔍 [DIAGNOSTIC] No stored data for ${date}, fetching previous day's closing stock...`)
        setIsInventoryFetched(false)
        
        // Get previous day's date to fetch closing stock (Dubai timezone-safe)
        // Use getPreviousDate to ensure consistent timezone handling
        const previousDateStr = getPreviousDate(date)
        
        console.log(`🔍 [DIAGNOSTIC] TODAY: ${date}, YESTERDAY: ${previousDateStr} - Fetching yesterday's closing stock...`)
        console.log(`✅ [VERIFY] Date calculation: getPreviousDate("${date}") = "${previousDateStr}" (should be exactly 1 day before)`)
        
        const prevResponse = await fetch(`/api/employee-daily-stock-reports?employeeId=${user.id}&date=${previousDateStr}`)
        const prevData = await prevResponse.json()
        
        const prevReports: Record<string, { openingFull: number; openingEmpty: number }> = {}
        
        if (prevData.success && Array.isArray(prevData.data) && prevData.data.length > 0) {
          console.log(`🔍 [DIAGNOSTIC] Found ${prevData.data.length} reports from yesterday (${previousDateStr})`)
          prevData.data.forEach((report: any) => {
            const key = normalizeName(report.itemName)
            const prevClosingFull = report.closingFull ?? 0
            const prevClosingEmpty = report.closingEmpty ?? 0
            prevReports[key] = {
              openingFull: prevClosingFull,
              openingEmpty: prevClosingEmpty
            }
            console.log(`🔍 [DIAGNOSTIC] ${report.itemName}: Yesterday's closingFull=${prevClosingFull}, closingEmpty=${prevClosingEmpty}`)
          })
        }
        
        // CRITICAL: Ensure ALL products in inventoryData have entries in prevReports
        if (inventoryData.length > 0) {
          for (const item of inventoryData) {
            if (item.category !== 'cylinder') continue
            const key = normalizeName(item.productName)
            if (!prevReports[key]) {
              prevReports[key] = { openingFull: 0, openingEmpty: 0 }
              console.log(`🔍 [DIAGNOSTIC] ${item.productName} (key: ${key}) not in yesterday's data, defaulting to 0/0 opening stock`)
            }
          }
        }
        
        setIsInventoryFetched(true)
        setStoredDsrReports(prevReports)
        console.log(`✅ [DIAGNOSTIC] storedDsrReports SET for ${date} with ${Object.keys(prevReports).length} items:`, Object.keys(prevReports))
        console.log(`✅ [DIAGNOSTIC] isInventoryFetched set to TRUE for ${date}`)
        return prevReports
      }
    } catch (error) {
      console.error('Failed to fetch stored employee DSR reports:', error)
      setIsInventoryFetched(false)
      return {}
    }
  }

  // Auto-fetch inventory for new days
  const autoFetchEmployeeInventoryForNewDay = async (date: string) => {
    try {
      // Get previous day's date to fetch closing stock (Dubai timezone-safe)
      // Use getPreviousDate to ensure consistent timezone handling
      const previousDateStr = getPreviousDate(date)
      
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
        })
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
      
      // Get previous day's date to fetch closing stock (Dubai timezone-safe)
      // Use getPreviousDate to ensure consistent timezone handling
      const previousDateStr = getPreviousDate(dsrDate)
      
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
    } catch (error) {
      console.error('Failed to fetch and lock employee inventory:', error)
    } finally {
      setLoading(false)
    }
  }

  // Manual save employee DSR record with closing values
  const handleManualSave = async () => {
    if (!isInventoryFetched || dsrData.length === 0) {
      alert('Please wait for data to load before saving')
      return
    }
    
    setSaving(true)
    try {
      for (const item of dsrData) {
        const key = normalizeName(item.itemName)
        const openingFull = storedDsrReports[key]?.openingFull || 0
        const openingEmpty = storedDsrReports[key]?.openingEmpty || 0
        
        // Calculate all transaction values
        const fullPurchase = item.fullPurchase || 0
        const emptyPurchase = item.emptyPurchase || 0
        const refilled = item.refilled || 0
        const fullCylinderSales = item.fullCylinderSales || 0
        const emptyCylinderSales = item.emptyCylinderSales || 0
        const gasSales = item.gasSales || 0
        const deposits = item.deposits || 0
        const returns = item.returns || 0
        const transferGas = item.transferGas || 0
        const transferEmpty = item.transferEmpty || 0
        const receivedGas = item.receivedGas || 0
        const receivedEmpty = item.receivedEmpty || 0
        
        // Check if there are any transactions (same logic as admin DSR)
        const hasTransactions = fullPurchase > 0 || emptyPurchase > 0 || refilled > 0 || 
                                fullCylinderSales > 0 || emptyCylinderSales > 0 || gasSales > 0 || 
                                deposits > 0 || returns > 0 || transferGas > 0 || transferEmpty > 0 || 
                                receivedGas > 0 || receivedEmpty > 0
        
        // If no transactions, closing stock equals opening stock (same as admin DSR)
        let closingFull: number
        let closingEmpty: number
        
        if (!hasTransactions) {
          closingFull = openingFull
          closingEmpty = openingEmpty
        } else {
          // Closing Full = Opening Full + Full Purchase + Refilled - Full Cyl Sales - Gas Sales - Transfer Gas + Received Gas
          closingFull = Math.max(0, openingFull + fullPurchase + refilled - fullCylinderSales - gasSales - transferGas + receivedGas)
          // Closing Empty = Opening Full + Opening Empty + Full Purchase + Empty Purchase - Full Cyl Sales - Empty Cyl Sales - Deposit Cylinder + Return Cylinder - Transfer Empty + Received Empty - Closing Full
          closingEmpty = Math.max(0, openingFull + openingEmpty + fullPurchase + emptyPurchase - fullCylinderSales - emptyCylinderSales - deposits + returns - transferEmpty + receivedEmpty - closingFull)
        }
        
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
          console.log(`✅ [DIAGNOSTIC] Successfully saved ${item.itemName} (key: ${key}) for ${dsrDate} - closingFull=${closingFull}, closingEmpty=${closingEmpty}`)
        }
      }
      
      // Log saved closing stocks that will be used as next day's opening (Dubai timezone)
      const nextDateStr = getNextDate(dsrDate)
      
      console.log(`✅ [DIAGNOSTIC] Saved closing stocks for ${dsrDate} - These will be tomorrow (${nextDateStr}) opening stock`)
      
      alert('Employee DSR record saved successfully!')
    } catch (error) {
      console.error('Failed to save employee DSR record:', error)
      alert('Failed to save employee DSR record')
    } finally {
      setSaving(false)
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
    
    // Only clear data if this is a new date fetch (not a re-fetch for the same date)
    // This prevents clearing data when just switching tabs
    if (currentFetchDateRef.current !== dsrDate) {
      setDsrData([])
      setStoredDsrReports({})
      setIsInventoryFetched(false)
    }
    
    setLoading(true)
    try {
      // Step 1: Fetch sales data from daily employee sales
      const salesResponse = await fetch(`/api/daily-employee-sales?employeeId=${user.id}&date=${dsrDate}`)
      let salesData = []
      
      if (salesResponse.ok) {
        const salesResult = await salesResponse.json()
        salesData = salesResult.data || []
      }
      
      // Step 1.5: Fetch cylinder transaction data from daily employee cylinder aggregation
      const cylinderResponse = await fetch(`/api/daily-employee-cylinder-aggregation?employeeId=${user.id}&date=${dsrDate}`)
      let cylinderData = []
      
      if (cylinderResponse.ok) {
        const cylinderResult = await cylinderResponse.json()
        cylinderData = cylinderResult.data || []
      }
      
      // Step 1.6: Fetch refill data from daily refills
      const refillResponse = await fetch(`/api/daily-refills?employeeId=${user.id}&date=${dsrDate}`)
      let refillData = []
      
      if (refillResponse.ok) {
        const refillResult = await refillResponse.json()
        refillData = refillResult.data || []
      }
      
      // Step 1.7: Fetch purchase data from daily cylinder transactions
      const purchaseResponse = await fetch(`/api/daily-cylinder-transactions?date=${dsrDate}&employeeId=${user.id}`)
      let purchaseData = []
      
      if (purchaseResponse.ok) {
        const purchaseResult = await purchaseResponse.json()
        purchaseData = purchaseResult.data || []
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
      }
      
      // If no data from new API, try old API
      if (inventoryData.length === 0) {
        const oldInventoryResponse = await fetch(`/api/employee-inventory-items?employeeId=${user.id}`)
        if (oldInventoryResponse.ok) {
          const oldInventoryResult = await oldInventoryResponse.json()
          inventoryData = oldInventoryResult.data || []
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
          }
        }
      })
      
      // Process stock assignments to track received stock (when employee accepts stock)
      // CRITICAL: Only process assignments with status === 'received' (employee has accepted)
      // Do NOT include 'assigned' status (pending, not yet accepted by employee)
      // This matches the inventory logic which only shows accepted assignments
      
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
        
        // CRITICAL FIX: Only process assignments that have been ACCEPTED by employee
        // Status must be 'received' - do NOT include 'assigned' (pending) or 'active' status
        if (status !== 'received') {
          // Skip assignments that haven't been accepted yet
          return
        }
        
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
        
        // Only process assignments that were received on the selected date
        const dateMatches = receivedDate && inSelectedDay(receivedDate)
        const isTodayCheck = !receivedDate && isToday(dsrDate) // If no receivedDate but status is received and it's today
        
        if (dateMatches || isTodayCheck) {
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
                    break
                  }
                }
              }
            }
          }
          
          // Normalize the target name for matching
          const normalizedTargetName = normalizeName(targetItemName)
          
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
            } else if (category === 'cylinder' || !category) {
              // For cylinders or if category is not set, track as received empty
              // Full cylinders transferred become empty at employee location
              foundItem.receivedEmpty += quantity
            } else {
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
            }
          }
        }
      })
      
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
          
          // Calculate all transaction values
          const fullPurchase = existingEntry.fullPurchase || 0
          const emptyPurchase = existingEntry.emptyPurchase || 0
          const refilled = existingEntry.refilled || 0
          const fullCylinderSales = existingEntry.fullCylinderSales || 0
          const emptyCylinderSales = existingEntry.emptyCylinderSales || 0
          const gasSales = existingEntry.gasSales || 0
          const deposits = existingEntry.deposits || 0
          const returns = existingEntry.returns || 0
          const transferGas = existingEntry.transferGas || 0
          const transferEmpty = existingEntry.transferEmpty || 0
          
          // Check if there are any transactions (same logic as admin DSR)
          const hasTransactions = fullPurchase > 0 || emptyPurchase > 0 || refilled > 0 || 
                                  fullCylinderSales > 0 || emptyCylinderSales > 0 || gasSales > 0 || 
                                  deposits > 0 || returns > 0 || transferGas > 0 || transferEmpty > 0 || 
                                  preservedReceivedGas > 0 || preservedReceivedEmpty > 0
          
          // If no transactions, closing stock equals opening stock (same as admin DSR)
          if (!hasTransactions) {
            existingEntry.closingFull = openingFull
            existingEntry.closingEmpty = openingEmpty
          } else {
            // Closing Full = Opening Full + Full Purchase + Refilled - Full Cyl Sales - Gas Sales - Transfer Gas + Received Gas
            existingEntry.closingFull = Math.max(0, openingFull + fullPurchase + refilled - fullCylinderSales - gasSales - transferGas + preservedReceivedGas)
            // Closing Empty = Opening Full + Opening Empty + Full Purchase + Empty Purchase - Full Cyl Sales - Empty Cyl Sales - Deposit Cylinder + Return Cylinder - Transfer Empty + Received Empty - Closing Full
            existingEntry.closingEmpty = Math.max(0, openingFull + openingEmpty + fullPurchase + emptyPurchase - fullCylinderSales - emptyCylinderSales - deposits + returns - transferEmpty + preservedReceivedEmpty - existingEntry.closingFull)
          }
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
      
      // Fetch stored DSR reports for opening values FIRST (before setting data)
      // Get the reports data directly from the function instead of relying on state
      const storedReportsData = await fetchStoredEmployeeDsrReports(dsrDate)
      
      // Check again if date changed during fetchStoredEmployeeDsrReports
      if (abortController.signal.aborted || currentFetchDateRef.current !== dsrDate) {
        console.log(`⚠️ [EMPLOYEE DSR] Fetch cancelled or date changed after fetching stored reports, not updating data`)
        return
      }
      
      // Recalculate closing stock after fetching stored reports to ensure it's correct
      // Use the directly returned data instead of state (which may not be updated yet)
      finalDsrData.forEach((item) => {
        const key = normalizeName(item.itemName)
        const openingFull = storedReportsData[key]?.openingFull ?? item.openingFull
        const openingEmpty = storedReportsData[key]?.openingEmpty ?? item.openingEmpty
        
        // Recalculate closing stock with correct opening values
        const fullPurchase = item.fullPurchase || 0
        const emptyPurchase = item.emptyPurchase || 0
        const refilled = item.refilled || 0
        const fullCylinderSales = item.fullCylinderSales || 0
        const emptyCylinderSales = item.emptyCylinderSales || 0
        const gasSales = item.gasSales || 0
        const deposits = item.deposits || 0
        const returns = item.returns || 0
        const transferGas = item.transferGas || 0
        const transferEmpty = item.transferEmpty || 0
        const receivedGas = item.receivedGas || 0
        const receivedEmpty = item.receivedEmpty || 0
        
        // Check if there are any transactions
        const hasTransactions = fullPurchase > 0 || emptyPurchase > 0 || refilled > 0 || 
                                fullCylinderSales > 0 || emptyCylinderSales > 0 || gasSales > 0 || 
                                deposits > 0 || returns > 0 || transferGas > 0 || transferEmpty > 0 || 
                                receivedGas > 0 || receivedEmpty > 0
        
        // Update opening stock from stored reports
        item.openingFull = openingFull
        item.openingEmpty = openingEmpty
        
        // Recalculate closing stock
        if (!hasTransactions) {
          item.closingFull = openingFull
          item.closingEmpty = openingEmpty
        } else {
          item.closingFull = Math.max(0, openingFull + fullPurchase + refilled - fullCylinderSales - gasSales - transferGas + receivedGas)
          item.closingEmpty = Math.max(0, openingFull + openingEmpty + fullPurchase + emptyPurchase - fullCylinderSales - emptyCylinderSales - deposits + returns - transferEmpty + receivedEmpty - item.closingFull)
        }
      })
      
      // Set data with recalculated closing stock
      setDsrData(finalDsrData)
      
      
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
        return
      }
      console.error('Failed to fetch employee DSR:', error)
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
      // Only clear data if date actually changed (not just a re-render from tab switch)
      // The fetchEmployeeDSR function will handle clearing data if needed for new dates
      const previousDate = currentFetchDateRef.current
      if (previousDate && previousDate !== dsrDate) {
        // Date changed - clear data
        setDsrData([])
        setStoredDsrReports({})
        setIsInventoryFetched(false)
      }
      // If same date, don't clear - just refetch to ensure data is fresh
      
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
        fetchAndLockEmployeeInventory()
      } else {
        // For previous dates, just fetch stored reports
        fetchStoredEmployeeDsrReports(dsrDate)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, inventoryData.length, dsrDate, isInventoryFetched])


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
              {(() => {
                const today = new Date().toISOString().slice(0, 10)
                const isToday = dsrDate === today
                
                if (isToday && isInventoryFetched && dsrData.length > 0) {
                  return (
                    <Button
                      onClick={handleManualSave}
                      size="sm"
                      disabled={loading || saving}
                      className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto text-xs sm:text-sm"
                    >
                      {saving ? (
                        <>
                          <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <PlusCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                          Save Today
                        </>
                      )}
                    </Button>
                  )
                }
                return null
              })()}
              
              <span className="text-xs sm:text-sm text-gray-500">
                {loading && !isInventoryFetched ? (
                  '⏳ Loading data and calculating results...'
                ) : !isInventoryFetched ? (
                  '⏳ Loading previous day\'s closing stock as opening stock...'
                ) : (
                  '✓ Opening stock loaded from previous day'
                )}
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
                    {dsrData.map((item, index) => {
                      // Diagnostic log for opening stock values (only for first 3 items to avoid spam)
                      if (isInventoryFetched && index < 3) {
                        const key = normalizeName(item.itemName)
                        const storedOpening = storedDsrReports[key]
                        const openingFull = storedOpening?.openingFull ?? item.openingFull ?? 0
                        const openingEmpty = storedOpening?.openingEmpty ?? item.openingEmpty ?? 0
                        console.log(`🔍 [DIAGNOSTIC] TABLE RENDER - ${item.itemName} (key: ${key}): storedDsrReports[${key}] =`, storedOpening, `→ Displaying openingFull=${openingFull}, openingEmpty=${openingEmpty}`)
                      }
                      
                      const key = normalizeName(item.itemName)
                      const storedOpening = storedDsrReports[key]
                      const openingFull = storedOpening?.openingFull ?? item.openingFull ?? 0
                      const openingEmpty = storedOpening?.openingEmpty ?? item.openingEmpty ?? 0
                      
                      return (
                      <TableRow key={index}>
                        <TableCell className="font-medium border-r sticky left-0 bg-background z-10 min-w-[120px]">{item.itemName}</TableCell>
                        <TableCell className="text-center min-w-[60px]">{openingFull}</TableCell>
                        <TableCell className="text-center border-r min-w-[60px]">{openingEmpty}</TableCell>
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
                    )})}
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

export default EmployeeDSR
