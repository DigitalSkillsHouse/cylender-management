"use client"
import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DollarSign, Users, Fuel, Cylinder, UserCheck, ChevronDown, ChevronRight, Eye, Activity, Loader2, Receipt, FileText, ListChecks, PlusCircle } from "lucide-react"
import { reportsAPI } from "@/lib/api";
import { SignatureDialog } from "@/components/signature-dialog"
import { ReceiptDialog } from "@/components/receipt-dialog"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DialogDescription } from "@radix-ui/react-dialog"

interface CustomerLedgerData {
  _id: string
  name: string
  trNumber: string
  phone: string
  email: string
  address: string
  balance: number
  totalDebit: number
  totalCredit: number
  status: 'pending' | 'cleared' | 'overdue' | 'error'
  totalSales: number
  totalSalesAmount: number
  totalPaidAmount: number
  totalCylinderAmount: number
  totalDeposits: number
  totalRefills: number
  totalReturns: number
  hasRecentActivity: boolean
  lastTransactionDate: string | null
  recentSales: any[]
  recentCylinderTransactions: any[]
  error?: string
}

export function Reports() {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalEmployees: 0,
    gasSales: 0,
    cylinderRefills: 0,
    totalCustomers: 0,
    totalCombinedRevenue: 0,
    pendingCustomers: 0,
    overdueCustomers: 0,
    clearedCustomers: 0
  })

  

  const [filters, setFilters] = useState({
    customerName: "",
    status: "all",
    startDate: "",
    endDate: "",
  })

  const [customers, setCustomers] = useState<CustomerLedgerData[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set())

  // Compute a customer's aggregate ledger status for the summary row and filters
  // Priority: overdue > pending > cleared (if no dues) > fallback to existing status
  const computeLedgerStatus = (c: CustomerLedgerData): 'pending' | 'cleared' | 'overdue' | 'error' => {
    try {
      const sales = Array.isArray(c.recentSales) ? c.recentSales : []
      const cyl = Array.isArray(c.recentCylinderTransactions) ? c.recentCylinderTransactions : []
      const hasOverdue = sales.some((s: any) => s?.paymentStatus === 'overdue') || cyl.some((t: any) => t?.status === 'overdue')
      if (hasOverdue) return 'overdue'
      const hasPending = sales.some((s: any) => s?.paymentStatus === 'pending') || cyl.some((t: any) => t?.status === 'pending')
      if (hasPending) return 'pending'
      if ((c.balance ?? 0) <= 0) return 'cleared'
      return (c.status || 'cleared') as any
    } catch {
      return c.status
    }
  }

  // Daily Stock Report local model (stored in localStorage)
  interface DailyStockEntry {
    id: string
    date: string // yyyy-mm-dd
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
  interface EmployeeLite { _id: string; name?: string; email?: string }
  // Download the grid view for a specific date as PDF
  const downloadDsrGridPdf = (date: string) => {
    try {
      const byKey = new Map<string, DailyStockEntry>()
      dsrEntries.filter(e => e.date === date).forEach(e => byKey.set(normalizeName(e.itemName), e))
      // Build rows from multiple sources similar to DSR Grid View
      const rowsSource = (() => {
        if (dsrProducts.length > 0) return dsrProducts
        const nameSet = new Set<string>()
        dsrEntries.filter(e => e.date === date).forEach(e => nameSet.add(normalizeName(String(e.itemName))))
        Object.keys(dailyAggGasSales || {}).forEach(k => nameSet.add(k))
        Object.keys(dailyAggCylinderSales || {}).forEach(k => nameSet.add(k))
        Object.keys(dailyAggRefills || {}).forEach(k => nameSet.add(k))
        const arr = Array.from(nameSet)
        return arr.map((n, i) => ({ _id: String(i), name: n } as any))
      })()
      const rows = rowsSource.map(p => {
        const key = normalizeName(p.name)
        const e = byKey.get(key)
        const refilledVal = dailyAggRefills[key] ?? (e ? e.refilled : 0)
        const cylSalesVal = dailyAggCylinderSales[key] ?? (e ? e.cylinderSales : 0)
        const gasSalesVal = dailyAggGasSales[key] ?? (e ? e.gasSales : 0)
        return `
          <tr>
            <td>${p.name}</td>
            <td>${e ? e.openingFull : 0}</td>
            <td>${e ? e.openingEmpty : 0}</td>
            <td>${refilledVal || 0}</td>
            <td>${cylSalesVal || 0}</td>
            <td>${gasSalesVal || 0}</td>
            <td>${typeof e?.closingFull === 'number' ? e!.closingFull : 0}</td>
            <td>${typeof e?.closingEmpty === 'number' ? e!.closingEmpty : 0}</td>
          </tr>
        `
      }).join('')

      const html = `<!doctype html>
      <html>
        <head>
          <meta charset=\"utf-8\" />
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
                <th colspan=3>During the day</th>
                <th colspan=2>Closing</th>
              </tr>
              <tr>
                <th></th>
                <th>Full</th>
                <th>Empty</th>
                <th>Refilled</th>
                <th>Cylinder Sales</th>
                <th>Gas Sales</th>
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
      console.error(err)
      alert('Failed to prepare PDF')
    }
  }

  // Open the closing stock dialog for a specific entry
  const openClosingDialog = (e: DailyStockEntry) => {
    setClosingDialog({
      open: true,
      date: e.date,
      itemName: e.itemName,
      closingFull: "",
      closingEmpty: "",
    })
  }

  // Submit closing stock values; updates backend and table row
  const submitClosingDialog = () => {
    const cf = Number.parseFloat(closingDialog.closingFull)
    const ce = Number.parseFloat(closingDialog.closingEmpty)
    if (!Number.isFinite(cf) || cf < 0) return alert("Enter valid Remaining Full Cylinders")
    if (!Number.isFinite(ce) || ce < 0) return alert("Enter valid Remaining Empty Cylinders")

    const payload = {
      date: closingDialog.date,
      itemName: closingDialog.itemName,
      closingFull: cf,
      closingEmpty: ce,
    }

    ;(async () => {
      try {
        const res = await fetch(API_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error("post failed")
        const json = await res.json()
        const d = json?.data || payload
        const updated = dsrEntries.map(row =>
          row.itemName === payload.itemName && row.date === payload.date
            ? { ...row, closingFull: d.closingFull, closingEmpty: d.closingEmpty }
            : row
        )
        setDsrEntries(updated)
        saveDsrLocal(updated)
      } catch (e) {
        const updated = dsrEntries.map(row =>
          row.itemName === payload.itemName && row.date === payload.date
            ? { ...row, closingFull: payload.closingFull, closingEmpty: payload.closingEmpty }
            : row
        )
        setDsrEntries(updated)
        saveDsrLocal(updated)
        alert("Saved locally (offline). Will sync when online.")
      } finally {
        setClosingDialog(prev => ({ ...prev, open: false }))
      }
    })()
  }

  const [showDSRForm, setShowDSRForm] = useState(false)
  const [showDSRList, setShowDSRList] = useState(false)
  const [showDSRView, setShowDSRView] = useState(false)
  const [dsrEntries, setDsrEntries] = useState<DailyStockEntry[]>([])
  const [dsrViewDate, setDsrViewDate] = useState<string>(new Date().toISOString().slice(0, 10))
  // Products for DSR grid
  interface ProductLite { _id: string; name: string }
  const [dsrProducts, setDsrProducts] = useState<ProductLite[]>([])
  type DsrGridRow = {
    itemId: string
    itemName: string
    openingFull: string
    openingEmpty: string
    closingFull: string
    closingEmpty: string
  }
  const [dsrGrid, setDsrGrid] = useState<DsrGridRow[]>([])
  // Consistent name normalizer used across aggregation and rendering
  const normalizeName = (s: any) => (typeof s === 'string' || typeof s === 'number')
    ? String(s).replace(/\s+/g, ' ').trim().toLowerCase()
    : ''
  // Aggregated daily totals fed into the DSR view grid (by product name, lowercase)
  const [dailyAggGasSales, setDailyAggGasSales] = useState<Record<string, number>>({})
  const [dailyAggCylinderSales, setDailyAggCylinderSales] = useState<Record<string, number>>({})
  const [dailyAggRefills, setDailyAggRefills] = useState<Record<string, number>>({})
  // Also aggregate by product ID to avoid any name mismatch issues
  const [dailyAggGasSalesById, setDailyAggGasSalesById] = useState<Record<string, number>>({})
  const [dailyAggCylinderSalesById, setDailyAggCylinderSalesById] = useState<Record<string, number>>({})
  const [dailyAggRefillsById, setDailyAggRefillsById] = useState<Record<string, number>>({})
  // Aggregation readiness flag
  const [aggReady, setAggReady] = useState<boolean>(false)
  
  // Types and state for Employee-scoped Daily Stock Report viewing
  interface EmployeeLite { _id: string; name?: string; email?: string }
  const [showEmployeeDSR, setShowEmployeeDSR] = useState(false)
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  const [empLoading, setEmpLoading] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("")
  const [employeeDsrDate, setEmployeeDsrDate] = useState<string>(new Date().toISOString().slice(0,10))
  const [employeeDsrEntries, setEmployeeDsrEntries] = useState<DailyStockEntry[]>([])
  const [empGridRows, setEmpGridRows] = useState<{ itemName: string; openingFull: number; openingEmpty: number; refilled: number; cylinderSales: number; gasSales: number; closingFull?: number; closingEmpty?: number }[]>([])

  // Load employees when the Employee DSR dialog opens
  useEffect(() => {
    const loadEmployees = async () => {
      try {
        setEmpLoading(true)
        const res = await fetch('/api/employees', { cache: 'no-store' })
        const json = await res.json().catch(() => ({}))
        const list: any[] = Array.isArray(json)
          ? json
          : Array.isArray(json?.data?.data)
            ? json.data.data
            : Array.isArray(json?.data)
              ? json.data
              : []
        const mapped: EmployeeLite[] = list.map((e: any) => ({ _id: String(e._id || e.id), name: e.name, email: e.email }))
        setEmployees(mapped)
      } catch (e) {
        console.error('Failed to load employees', e)
        setEmployees([])
      } finally {
        setEmpLoading(false)
      }
    }
    if (showEmployeeDSR) loadEmployees()
  }, [showEmployeeDSR])

  // Fetch per-employee DSR for selected date and build grid rows
  const loadEmployeeDsr = async () => {
    if (!selectedEmployeeId || !employeeDsrDate) return
    try {
      setEmpLoading(true)
      const url = new URL('/api/employee-daily-stock-reports', window.location.origin)
      url.searchParams.set('employeeId', selectedEmployeeId)
      url.searchParams.set('date', employeeDsrDate)
      const res = await fetch(url.toString(), { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      const list: any[] = Array.isArray(json)
        ? json
        : Array.isArray(json?.data?.data)
          ? json.data.data
          : Array.isArray(json?.data)
            ? json.data
            : []
      const mapped: DailyStockEntry[] = list.map((d: any) => ({
        id: String(d._id || `${d.itemName}-${d.date}`),
        date: d.date,
        itemName: d.itemName,
        openingFull: Number(d.openingFull || 0),
        openingEmpty: Number(d.openingEmpty || 0),
        refilled: Number(d.refilled || 0),
        cylinderSales: Number(d.cylinderSales || 0),
        gasSales: Number(d.gasSales || 0),
        closingFull: typeof d?.closingFull === 'number' ? d.closingFull : undefined,
        closingEmpty: typeof d?.closingEmpty === 'number' ? d.closingEmpty : undefined,
        createdAt: d.createdAt || new Date().toISOString(),
      }))
      setEmployeeDsrEntries(mapped)

      const rowsSource = (dsrProducts.length > 0 ? dsrProducts : Array.from(new Set(mapped.map(e => e.itemName))).map((n, i) => ({ _id: String(i), name: n } as any)))
      const byKey = new Map<string, DailyStockEntry>()
      mapped.forEach(e => byKey.set(e.itemName.toLowerCase(), e))
      const rows = rowsSource.map((p: any) => {
        const e = byKey.get(String(p.name).toLowerCase())
        return {
          itemName: p.name,
          openingFull: e ? e.openingFull : 0,
          openingEmpty: e ? e.openingEmpty : 0,
          refilled: e ? e.refilled : 0,
          cylinderSales: e ? e.cylinderSales : 0,
          gasSales: e ? e.gasSales : 0,
          closingFull: typeof e?.closingFull === 'number' ? e!.closingFull : undefined,
          closingEmpty: typeof e?.closingEmpty === 'number' ? e!.closingEmpty : undefined,
        }
      })
      setEmpGridRows(rows)
    } catch (e) {
      console.error('Failed to load employee DSR', e)
      setEmployeeDsrEntries([])
      setEmpGridRows([])
    } finally {
      setEmpLoading(false)
    }
  }

  // Download Employee DSR grid as PDF
  const downloadEmployeeDsrGridPdf = (date: string) => {
    try {
      const byKey = new Map<string, DailyStockEntry>()
      employeeDsrEntries.forEach(e => byKey.set(e.itemName.toLowerCase(), e))
      const rowsSource = (dsrProducts.length > 0 ? dsrProducts : Array.from(new Set(employeeDsrEntries.map(e => e.itemName))).map((n, i) => ({ _id: String(i), name: n } as any)))
      const rows = rowsSource.map(p => {
        const e = byKey.get(String(p.name).toLowerCase())
        return `
          <tr>
            <td>${p.name}</td>
            <td>${e ? e.openingFull : 0}</td>
            <td>${e ? e.openingEmpty : 0}</td>
            <td>${e ? e.refilled : 0}</td>
            <td>${e ? e.cylinderSales : 0}</td>
            <td>${e ? e.gasSales : 0}</td>
            <td>${typeof e?.closingFull === 'number' ? e!.closingFull : 0}</td>
            <td>${typeof e?.closingEmpty === 'number' ? e!.closingEmpty : 0}</td>
          </tr>
        `
      }).join('')

      const html = `<!doctype html>
      <html>
        <head>
          <meta charset=\"utf-8\" />
          <title>Employee Daily Stock Report – ${date}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 16px; }
            h1 { font-size: 18px; margin: 0 0 12px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
            th { background: #f7f7f7; text-align: left; }
          </style>
        </head>
        <body>
          <h1>Employee Daily Stock Report – ${date}</h1>
          <table>
            <thead>
              <tr>
                <th>Items</th>
                <th colspan=2>Opening</th>
                <th colspan=3>During the day</th>
                <th colspan=2>Closing</th>
              </tr>
              <tr>
                <th></th>
                <th>Full</th>
                <th>Empty</th>
                <th>Refilled</th>
                <th>Cylinder Sales</th>
                <th>Gas Sales</th>
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
      const win = window.open('', '_blank')
      if (win) {
        win.document.write(html)
        win.document.close()
        win.focus()
        win.print()
      }
    } catch (e) {
      console.error('Failed to print employee DSR', e)
    }
  }
  // Load products when DSR form opens and build empty grid
  useEffect(() => {
    if (!showDSRForm) return
    ;(async () => {
      try {
        const res = await fetch('/api/products', { cache: 'no-store' })
        const json = await res.json().catch(() => ({}))
        const list: any[] = Array.isArray(json?.data?.data)
          ? json.data.data
          : Array.isArray(json?.data)
            ? json.data
            : Array.isArray(json)
              ? (json as any[])
              : []
        const products: ProductLite[] = list
          .filter((p: any) => p && (p.name || p.title))
          .map((p: any) => ({ _id: String(p._id || p.id || p.name), name: String(p.name || p.title) }))
        setDsrProducts(products)
        // Initialize grid with empty values, items populated
        const baseGrid = products.map(p => ({
          itemId: p._id,
          itemName: p.name,
          openingFull: '',
          openingEmpty: '',
          closingFull: '',
          closingEmpty: '',
        }))
        setDsrGrid(baseGrid)
        // Prefill openings from previous day closings per item
        await prefillDsrGridOpenings(dsrForm.date, baseGrid)
      } catch (e) {
        setDsrProducts([])
        setDsrGrid([])
      }
    })()
  }, [showDSRForm])

  const updateDsrGridCell = (itemId: string, field: keyof Omit<DsrGridRow, 'itemId' | 'itemName'>, value: string) => {
    setDsrGrid(prev => prev.map(r => r.itemId === itemId ? { ...r, [field]: value } as DsrGridRow : r))
  }
  // Prefill Opening columns from previous day's closing for each item in the grid
  const prefillDsrGridOpenings = async (date: string, rows: DsrGridRow[]) => {
    const updated = await Promise.all(rows.map(async (r) => {
      try {
        const url = `${API_BASE}/previous?itemName=${encodeURIComponent(r.itemName)}&date=${encodeURIComponent(date)}`
        const res = await fetch(url, { cache: 'no-store' })
        if (res.ok) {
          const json = await res.json()
          if (json?.data) {
            return {
              ...r,
              openingFull: String(json.data.closingFull ?? ''),
              openingEmpty: String(json.data.closingEmpty ?? ''),
            }
          }
        }
      } catch {}
      return r
    }))
    setDsrGrid(updated)
  }

  // Save handler for grid: persists each row (skips completely empty rows)
  const saveDsrGrid = async () => {
    const date = dsrForm.date
    const rowsToSave = dsrGrid.filter(r => r.openingFull !== '' || r.openingEmpty !== '' || r.closingFull !== '' || r.closingEmpty !== '')
    if (rowsToSave.length === 0) {
      setShowDSRForm(false)
      return
    }
    const toNumber = (v: string) => {
      const n = Number.parseFloat(v)
      return Number.isFinite(n) ? n : 0
    }
    try {
      const results = await Promise.all(rowsToSave.map(async (r) => {
        const payload: any = {
          date,
          itemName: r.itemName,
          openingFull: toNumber(r.openingFull),
          openingEmpty: toNumber(r.openingEmpty),
        }
        if (r.closingFull !== '') payload.closingFull = toNumber(r.closingFull)
        if (r.closingEmpty !== '') payload.closingEmpty = toNumber(r.closingEmpty)
        try {
          const res = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!res.ok) throw new Error('post failed')
          const json = await res.json()
          return json?.data || payload
        } catch {
          // offline/local fallback
          return payload
        }
      }))

      // Merge into local state list
      const merged = [...dsrEntries]
      results.forEach((d: any) => {
        const id = d._id || `${d.itemName}-${d.date}`
        const idx = merged.findIndex(x => (x.itemName === d.itemName && x.date === d.date))
        const entry = {
          id,
          date: d.date,
          itemName: d.itemName,
          openingFull: Number(d.openingFull || 0),
          openingEmpty: Number(d.openingEmpty || 0),
          refilled: Number(d.refilled || 0),
          cylinderSales: Number(d.cylinderSales || 0),
          gasSales: Number(d.gasSales || 0),
          closingFull: typeof d.closingFull === 'number' ? d.closingFull : undefined,
          closingEmpty: typeof d.closingEmpty === 'number' ? d.closingEmpty : undefined,
          createdAt: d.createdAt || new Date().toISOString(),
        } as DailyStockEntry
        if (idx >= 0) merged[idx] = entry; else merged.unshift(entry)
      })
      setDsrEntries(merged)
      saveDsrLocal(merged)
    } finally {
      setShowDSRForm(false)
    }
  }
  // Download the current DSR list as PDF via browser print dialog
  const downloadDsrPdf = () => {
    try {
      const rows = dsrEntries.map(e => `
        <tr>
          <td>${e.date || ''}</td>
          <td>${e.itemName || ''}</td>
          <td>${e.openingFull ?? ''}</td>
          <td>${e.openingEmpty ?? ''}</td>
          <td>${e.refilled ?? ''}</td>
          <td>${e.cylinderSales ?? ''}</td>
          <td>${e.gasSales ?? ''}</td>
          <td>${typeof e.closingFull === 'number' ? e.closingFull : ''}</td>
          <td>${typeof e.closingEmpty === 'number' ? e.closingEmpty : ''}</td>
        </tr>
      `).join('')

      const html = `<!doctype html>
      <html>
        <head>
          <meta charset=\"utf-8\" />
          <title>Daily Stock Reports</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 16px; }
            h1 { font-size: 18px; margin: 0 0 12px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
            th { background: #f7f7f7; text-align: left; }
          </style>
        </head>
        <body>
          <h1>Daily Stock Reports</h1>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Item</th>
                <th>Opening Full</th>
                <th>Opening Empty</th>
                <th>Refilled</th>
                <th>Cylinder Sales</th>
                <th>Gas Sales</th>
                <th>Closing Full</th>
                <th>Closing Empty</th>
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
      // Do not auto-close to allow user to re-print if needed
    } catch (err) {
      console.error(err)
      alert('Failed to prepare PDF')
    }
  }
  const [dsrForm, setDsrForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    itemName: "",
    openingFull: "",
    openingEmpty: "",
    refilled: "",
    cylinderSales: "",
    gasSales: "",
  } as Record<string, string>)
  // Closing stock dialog state
  const [closingDialog, setClosingDialog] = useState({
    open: false,
    date: "",
    itemName: "",
    closingFull: "",
    closingEmpty: "",
  })

  // DSR inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string>>({
    date: "",
    itemName: "",
    openingFull: "",
    openingEmpty: "",
    refilled: "",
    cylinderSales: "",
    gasSales: "",
    closingFull: "",
    closingEmpty: "",
  })

  const openEdit = (e: DailyStockEntry) => {
    setEditingId(e.id)
    setEditForm({
      date: e.date,
      itemName: e.itemName,
      openingFull: String(e.openingFull ?? 0),
      openingEmpty: String(e.openingEmpty ?? 0),
      refilled: String(e.refilled ?? 0),
      cylinderSales: String(e.cylinderSales ?? 0),
      gasSales: String(e.gasSales ?? 0),
      closingFull: e.closingFull !== undefined ? String(e.closingFull) : "",
      closingEmpty: e.closingEmpty !== undefined ? String(e.closingEmpty) : "",
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const saveEdit = async () => {
    if (!editingId) return
    if (!editForm.itemName.trim()) return alert("Please enter item name")
    const payload: any = {
      date: editForm.date,
      itemName: editForm.itemName.trim(),
      openingFull: parseNum(editForm.openingFull),
      openingEmpty: parseNum(editForm.openingEmpty),
      refilled: parseNum(editForm.refilled),
      cylinderSales: parseNum(editForm.cylinderSales),
      gasSales: parseNum(editForm.gasSales),
    }
    if (editForm.closingFull !== "") payload.closingFull = parseNum(editForm.closingFull)
    if (editForm.closingEmpty !== "") payload.closingEmpty = parseNum(editForm.closingEmpty)

    try {
      const res = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("post failed")
      const json = await res.json()
      const d = json?.data || payload
      const updated = dsrEntries.map(row =>
        row.id === editingId
          ? {
              ...row,
              date: payload.date,
              itemName: payload.itemName,
              openingFull: payload.openingFull,
              openingEmpty: payload.openingEmpty,
              refilled: payload.refilled,
              cylinderSales: payload.cylinderSales,
              gasSales: payload.gasSales,
              closingFull: typeof d.closingFull === 'number' ? d.closingFull : row.closingFull,
              closingEmpty: typeof d.closingEmpty === 'number' ? d.closingEmpty : row.closingEmpty,
            }
          : row
      )
      setDsrEntries(updated)
      saveDsrLocal(updated)
      setEditingId(null)
    } catch (e) {
      // Offline/local fallback
      const updated = dsrEntries.map(row =>
        row.id === editingId
          ? {
              ...row,
              date: payload.date,
              itemName: payload.itemName,
              openingFull: payload.openingFull,
              openingEmpty: payload.openingEmpty,
              refilled: payload.refilled,
              cylinderSales: payload.cylinderSales,
              gasSales: payload.gasSales,
              closingFull: payload.closingFull ?? row.closingFull,
              closingEmpty: payload.closingEmpty ?? row.closingEmpty,
            }
          : row
      )
      setDsrEntries(updated)
      saveDsrLocal(updated)
      setEditingId(null)
      alert("Saved locally (offline). Will sync when online.")
    }
  }

  const deleteEntry = async (e: DailyStockEntry) => {
    if (!confirm(`Delete DSR for ${e.itemName} on ${e.date}?`)) return
    try {
      const url = `${API_BASE}?itemName=${encodeURIComponent(e.itemName)}&date=${encodeURIComponent(e.date)}`
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
    } catch (err) {
      // proceed with local removal
    } finally {
      const updated = dsrEntries.filter(x => x.id !== e.id)
      setDsrEntries(updated)
      saveDsrLocal(updated)
    }
  }

  // Helpers: API endpoints + localStorage fallback
  const DSR_KEY = "daily_stock_reports"
  const API_BASE = "/api/daily-stock-reports"
  const saveDsrLocal = (items: DailyStockEntry[]) => {
    try { localStorage.setItem(DSR_KEY, JSON.stringify(items)) } catch {}
  }
  const loadDsrLocal = (): DailyStockEntry[] => {
    try {
      const raw = localStorage.getItem(DSR_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed as DailyStockEntry[] : []
    } catch { return [] }
  }
  const fetchDsrEntries = async () => {
    try {
      const res = await fetch(API_BASE, { cache: "no-store" })
      if (!res.ok) throw new Error("api failed")
      const data = await res.json()
      const items = (data?.data || data?.results || []) as any[]
      const mapped: DailyStockEntry[] = items.map((d: any) => ({
        id: d._id || `${d.itemName}-${d.date}-${d.createdAt}`,
        date: d.date,
        itemName: d.itemName,
        openingFull: Number(d.openingFull || 0),
        openingEmpty: Number(d.openingEmpty || 0),
        refilled: Number(d.refilled || 0),
        cylinderSales: Number(d.cylinderSales || 0),
        gasSales: Number(d.gasSales || 0),
        closingFull: typeof d.closingFull === 'number' ? d.closingFull : undefined,
        closingEmpty: typeof d.closingEmpty === 'number' ? d.closingEmpty : undefined,
        createdAt: d.createdAt || new Date().toISOString(),
      }))
      setDsrEntries(mapped)
      // keep a local mirror for offline viewing
      saveDsrLocal(mapped)
    } catch (e) {
      // Fallback to local
      const local = loadDsrLocal()
      setDsrEntries(local)
    }
  }

  // Load on mount
  useEffect(() => {
    fetchDsrEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Compute daily aggregates (Gas Sales, Cylinder Sales, Refilled) by product for selected DSR view date
  useEffect(() => {
    if (!dsrViewDate) return
    setAggReady(false)
    // Build local start/end of selected day to avoid timezone/string mismatches
    const getDayBounds = (ymd: string) => {
      // ymd expected format: YYYY-MM-DD
      const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10))
      if (!y || !m || !d) return { start: 0, end: 0 }
      const start = new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
      const end = new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
      return { start, end }
    }
    const { start: dayStart, end: dayEnd } = getDayBounds(dsrViewDate)
    const inSelectedDay = (val: any) => {
      const t = new Date(val).getTime()
      return Number.isFinite(t) && t >= dayStart && t <= dayEnd
    }
    const inc = (map: Record<string, number>, key: string, by: number) => {
      const k = normalizeName(key)
      if (!k) return
      map[k] = (map[k] || 0) + (Number(by) || 0)
    }
    const incId = (map: Record<string, number>, id: any, by: number) => {
      const k = (typeof id === 'string' || typeof id === 'number') ? String(id) : ''
      if (!k) return
      map[k] = (map[k] || 0) + (Number(by) || 0)
    }
    ;(async () => {
      try {
        // Admin-side only: Sales (gas + cylinder) and Cylinders (refill)
        const [salesRes, cylTxRes] = await Promise.all([
          fetch('/api/sales', { cache: 'no-store' }),
          fetch('/api/cylinders', { cache: 'no-store' }),
        ])
        const salesJson = await salesRes.json().catch(() => ({}))
        const cylTxJson = await cylTxRes.json().catch(() => ({}))
        console.log('[DSR] Aggregation start for date:', dsrViewDate)

        const gas: Record<string, number> = {}
        const gasById: Record<string, number> = {}
        const cyl: Record<string, number> = {}
        const cylById: Record<string, number> = {}
        const ref: Record<string, number> = {}
        const refById: Record<string, number> = {}

        // Admin sales
        const salesList: any[] = Array.isArray(salesJson?.data) ? salesJson.data : (Array.isArray(salesJson) ? salesJson : [])
        console.log('[DSR] /api/sales count:', Array.isArray(salesList) ? salesList.length : 0)
        for (const s of salesList) {
          if (!inSelectedDay(s?.createdAt)) continue
          const items: any[] = Array.isArray(s?.items) ? s.items : []
          if (!items.length) {
            console.debug('[DSR] Sale has no items, invoice:', s?.invoiceNumber)
          }
          for (const it of items) {
            const product = it?.product
            const name = product?.name || ''
            const pid = product?._id
            const qty = Number(it?.quantity) || 0
            const category = product?.category || ''
            if (category === 'gas') { inc(gas, name, qty); incId(gasById, pid, qty) }
            else if (category === 'cylinder') { inc(cyl, name, qty); incId(cylById, pid, qty) }
          }
        }

        // Refills from admin cylinder transactions (type=refill)
        const cylTxList: any[] = Array.isArray(cylTxJson?.data) ? cylTxJson.data : (Array.isArray(cylTxJson) ? cylTxJson : [])
        console.log('[DSR] /api/cylinders count:', Array.isArray(cylTxList) ? cylTxList.length : 0)
        for (const t of cylTxList) {
          if (t?.type !== 'refill') continue
          if (!inSelectedDay(t?.createdAt)) continue
          // Admin cylinder transaction shape: single product per tx
          const name = t?.product?.name || ''
          const pid = t?.product?._id
          const qty = Number(t?.quantity) || 0
          inc(ref, name, qty)
          incId(refById, pid, qty)
        }

        console.log('[DSR] Totals gas:', gas)
        console.log('[DSR] Totals cylinder:', cyl)
        console.log('[DSR] Totals refilled:', ref)

        setDailyAggGasSales(gas)
        setDailyAggCylinderSales(cyl)
        setDailyAggRefills(ref)
        setDailyAggGasSalesById(gasById)
        setDailyAggCylinderSalesById(cylById)
        setDailyAggRefillsById(refById)
        setAggReady(true)
      } catch (err) {
        console.error('[DSR] Aggregation failed:', err)
        setDailyAggGasSales({})
        setDailyAggCylinderSales({})
        setDailyAggRefills({})
        setDailyAggGasSalesById({})
        setDailyAggCylinderSalesById({})
        setDailyAggRefillsById({})
        setAggReady(false)
      }
    })()
  }, [dsrViewDate])

  // Prefill opening from previous day closing for same item (API first, fallback local)
  const prefillOpeningFromPrevious = (date: string, itemName: string) => {
    if (!date || !itemName) return
    ;(async () => {
      try {
        const url = `${API_BASE}/previous?itemName=${encodeURIComponent(itemName)}&date=${encodeURIComponent(date)}`
        const res = await fetch(url, { cache: "no-store" })
        if (res.ok) {
          const json = await res.json()
          if (json?.data) {
            setDsrForm(prevState => ({
              ...prevState,
              openingFull: String(json.data.closingFull ?? 0),
              openingEmpty: String(json.data.closingEmpty ?? 0),
            }))
            return
          }
        }
      } catch {}
      // fallback to local mirror
      const all = loadDsrLocal().filter(e => e.itemName.toLowerCase() === itemName.toLowerCase())
      if (all.length === 0) return
      const prev = all
        .filter(e => e.date < date)
        .sort((a, b) => b.date.localeCompare(a.date))[0]
      if (prev) {
        setDsrForm(prevState => ({
          ...prevState,
          openingFull: String(prev.closingFull ?? 0),
          openingEmpty: String(prev.closingEmpty ?? 0),
        }))
      }
    })()
  }

  const parseNum = (v: string) => {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }

  const computeClosing = () => {
    const openingFull = parseNum(dsrForm.openingFull)
    const openingEmpty = parseNum(dsrForm.openingEmpty)
    const refilled = parseNum(dsrForm.refilled)
    const cylinderSales = parseNum(dsrForm.cylinderSales)
    const gasSales = parseNum(dsrForm.gasSales)
    // Business rule (as provided): closing = opening + refilled - sales
    const closingFull = Math.max(0, openingFull + refilled - cylinderSales)
    // For empty, a reasonable simple flow: empty increases by sales and decreases by refills
    const closingEmpty = Math.max(0, openingEmpty + cylinderSales - refilled)
    return { closingFull, closingEmpty }
  }

  const handleDsrChange = (field: string, value: string) => {
    setDsrForm(prev => ({ ...prev, [field]: value }))
    if (field === "itemName" || field === "date") {
      const itemName = field === "itemName" ? value : prevItemNameRef.current
      const date = field === "date" ? value : dsrForm.date
      // Attempt carry-forward when both are present
      if ((field === "itemName" && value) || (field === "date" && dsrForm.itemName)) {
        prefillOpeningFromPrevious(date, field === "itemName" ? value : dsrForm.itemName)
      }
      if (field === "itemName") prevItemNameRef.current = value
    }
  }

  const prevItemNameRef = React.useRef("")

  const handleDsrSubmit = () => {
    if (!dsrForm.itemName.trim()) return alert("Please enter item name")
    const payload = {
      date: dsrForm.date,
      itemName: dsrForm.itemName.trim(),
      openingFull: parseNum(dsrForm.openingFull),
      openingEmpty: parseNum(dsrForm.openingEmpty),
      refilled: parseNum(dsrForm.refilled),
      cylinderSales: parseNum(dsrForm.cylinderSales),
      gasSales: parseNum(dsrForm.gasSales),
    }
    ;(async () => {
      try {
        const res = await fetch(API_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error("post failed")
        const json = await res.json()
        const d = json?.data || payload
        const entry: DailyStockEntry = {
          id: d._id || `${payload.itemName}-${payload.date}-${Date.now()}`,
          date: payload.date,
          itemName: payload.itemName,
          openingFull: payload.openingFull,
          openingEmpty: payload.openingEmpty,
          refilled: payload.refilled,
          cylinderSales: payload.cylinderSales,
          gasSales: payload.gasSales,
          closingFull: typeof d.closingFull === 'number' ? d.closingFull : undefined as any,
          closingEmpty: typeof d.closingEmpty === 'number' ? d.closingEmpty : undefined as any,
          createdAt: d.createdAt || new Date().toISOString(),
        }
        const updated = [entry, ...dsrEntries]
        setDsrEntries(updated)
        saveDsrLocal(updated)
      } catch (e) {
        // Offline/local fallback
        const entry: DailyStockEntry = {
          id: `${payload.itemName}-${payload.date}-${Date.now()}`,
          ...payload,
          createdAt: new Date().toISOString(),
        }
        const updated = [entry, ...dsrEntries]
        setDsrEntries(updated)
        saveDsrLocal(updated)
        alert("Saved locally (offline). Will sync when online.")
      } finally {
        setShowDSRForm(false)
      }
    })()
  }

  const clearDsr = () => {
    if (!confirm("Clear all Daily Stock Reports?")) return
    setDsrEntries([])
    saveDsrLocal([])
  }

  
  // Autocomplete functionality state
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filteredSuggestions, setFilteredSuggestions] = useState<CustomerLedgerData[]>([])

  // Receipt and signature functionality state
  const [showSignatureDialog, setShowSignatureDialog] = useState(false)
  const [pendingCustomer, setPendingCustomer] = useState<CustomerLedgerData | null>(null)
  const [customerSignature, setCustomerSignature] = useState<string>("")
  const [receiptDialogData, setReceiptDialogData] = useState<any>(null)

  // Signature dialog handlers
  const handleSignatureCancel = () => {
    setShowSignatureDialog(false)
    setPendingCustomer(null)
    setCustomerSignature("")
  }

  const handleSignatureComplete = (signature: string) => {
    console.log('Reports - Signature received:', signature)
    console.log('Reports - Signature length:', signature?.length)
    console.log('Reports - Pending customer:', pendingCustomer?.name)
    
    // Set signature state for future use
    setCustomerSignature(signature)
    setShowSignatureDialog(false)
    
    // Directly open receipt dialog with the pending customer and signature embedded
    if (pendingCustomer) {
      console.log('Reports - Opening receipt dialog with signature embedded')
      
      // Use the same data structure as "All Transactions" tab for receipt generation
      const allTransactions = [
        // Add gas sales transactions (filter by status if needed)
        ...(pendingCustomer.recentSales || [])
          .filter(entry => {
            if (filters.status === 'all') return true;
            return entry.paymentStatus === filters.status;
          })
          .map(entry => ({
            ...entry,
            _id: `ledger-${entry._id}`,
            createdAt: entry.createdAt,
            type: 'gas_sale',
            displayType: 'Gas Sale',
            description: entry.items.map((item: any) => `${item.product?.name || 'Unknown Product'} (${item.quantity}x)`).join(', '),
            amount: entry.totalAmount,
            paidAmount: entry.amountPaid || 0,
            status: entry.paymentStatus,
          })),
        // Add cylinder transactions (filter by status if needed, EXCLUDE refills from amount calculations)
        ...(pendingCustomer.recentCylinderTransactions || [])
          .filter(transaction => {
            if (filters.status === 'all') return true;
            return transaction.status === filters.status;
          })
          .map(transaction => ({
            ...transaction,
            _id: `cylinder-${transaction._id}`,
            createdAt: transaction.createdAt,
            type: transaction.type,
            displayType: `Cylinder ${transaction.type}`,
            description: `${transaction.cylinderSize} (${transaction.quantity}x)`,
            // EXCLUDE refills from amount totals
            amount: transaction.type === 'refill' ? 0 : (transaction.amount || 0),
            paidAmount: transaction.type === 'refill' ? 0 : (transaction.amount || 0),
            status: transaction.status,
          }))
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Create receipt items from All Transactions data
      // IMPORTANT: Use transaction total amounts, not paid amounts (pending sales would otherwise show 0)
      const items = allTransactions.map((transaction, index) => {
        const qty = transaction.type === 'gas_sale'
          ? (transaction.items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 1)
          : (transaction.quantity || 1)
        const lineTotal = Number(transaction.amount || 0)
        const unitPrice = qty > 0 ? lineTotal / qty : lineTotal
        return ({
          product: {
            name: `${transaction.displayType} - ${transaction.description}`,
            price: unitPrice,
          },
          quantity: qty,
          price: unitPrice,
          total: lineTotal,
        })
      });

      // Calculate total amount using transaction.amount (refills already excluded via amount=0)
      const totalAmount = allTransactions.reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);
      
      // If no items, add a placeholder
      if (items.length === 0) {
        items.push({
          product: { name: "No transactions found", price: 0 },
          quantity: 1,
          price: 0,
          total: 0
        })
      }
      
      const mockSale = {
        _id: pendingCustomer._id,
        invoiceNumber: `STATEMENT-${pendingCustomer.trNumber}`,
        customer: {
          name: pendingCustomer.name,
          phone: pendingCustomer.phone,
          address: pendingCustomer.address
        },
        items: items,
        totalAmount: totalAmount,
        paymentMethod: "Account Statement",
        paymentStatus: pendingCustomer.status,
        createdAt: pendingCustomer.lastTransactionDate || new Date().toISOString(),
        customerSignature: signature
      }
      
      setReceiptDialogData(mockSale)
      setPendingCustomer(null)
    }
  }

  useEffect(() => {
    fetchReportsData()
  }, [])

  const fetchReportsData = async () => {
    try {
      setLoading(true);
      const [statsResponse, ledgerResponse] = await Promise.all([
        reportsAPI.getStats(),
        reportsAPI.getLedger()
      ]);

      if (statsResponse.data?.success) {
        const statsData = statsResponse.data.data;
        setStats({
          totalRevenue: Number(statsData.totalRevenue) || 0,
          totalEmployees: Number(statsData.totalEmployees) || 0,
          gasSales: Number(statsData.gasSales) || 0,
          cylinderRefills: Number(statsData.cylinderRefills) || 0,
          totalCustomers: Number(statsData.totalCustomers) || 0,
          totalCombinedRevenue: Number(statsData.totalCombinedRevenue) || 0,
          pendingCustomers: Number(statsData.pendingCustomers) || 0,
          overdueCustomers: Number(statsData.overdueCustomers) || 0,
          clearedCustomers: Number(statsData.clearedCustomers) || 0
        });
      }

      if (ledgerResponse.data?.success && Array.isArray(ledgerResponse.data.data)) {
        setCustomers(ledgerResponse.data.data);
      } else {
        console.error("Failed to fetch ledger data:", ledgerResponse.data?.error || "Unexpected response format");
        setCustomers([]);
      }

    } catch (error) {
      console.error("Failed to fetch report data:", error);
      setStats({
        totalRevenue: 0, totalEmployees: 0, gasSales: 0, cylinderRefills: 0,
        totalCustomers: 0, totalCombinedRevenue: 0, pendingCustomers: 0, 
        overdueCustomers: 0, clearedCustomers: 0
      });
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = async () => {
    setLoading(true);
    await fetchReportsData();
  };

  // Autocomplete functionality
  const handleCustomerNameChange = (value: string) => {
    setFilters({ ...filters, customerName: value })
    
    if (value.trim().length > 0) {
      const filtered = customers.filter(customer => 
        customer.name.toLowerCase().includes(value.toLowerCase()) ||
        customer.trNumber.toLowerCase().includes(value.toLowerCase()) ||
        customer.phone.includes(value)
      ).slice(0, 5) // Limit to 5 suggestions
      
      setFilteredSuggestions(filtered)
      setShowSuggestions(true)
    } else {
      setShowSuggestions(false)
      setFilteredSuggestions([])
    }
  }

  const handleSuggestionClick = (customer: CustomerLedgerData) => {
    setFilters({ ...filters, customerName: customer.name })
    setShowSuggestions(false)
    setFilteredSuggestions([])
  }

  const handleInputBlur = () => {
    // Delay hiding suggestions to allow click events
    setTimeout(() => {
      setShowSuggestions(false)
    }, 200)
  }

  const handleInputFocus = () => {
    if (filters.customerName.trim().length > 0 && filteredSuggestions.length > 0) {
      setShowSuggestions(true)
    }
  }

  const toggleCustomerExpansion = (customerId: string) => {
    const newExpanded = new Set(expandedCustomers)
    if (newExpanded.has(customerId)) {
      newExpanded.delete(customerId)
    } else {
      newExpanded.add(customerId)
    }
    setExpandedCustomers(newExpanded)
  }

  const getStatusBadge = (status?: string) => {
    if (!status) {
      return <Badge variant="destructive" className="bg-gray-500 hover:bg-gray-600 text-white">Error</Badge>
    }

    const statusConfig = {
      pending: { variant: 'secondary' as const, className: 'bg-yellow-500 hover:bg-yellow-600 text-white', label: 'Pending' },
      cleared: { variant: 'default' as const, className: 'bg-green-500 hover:bg-green-600 text-white', label: 'Cleared' },
      overdue: { variant: 'destructive' as const, className: 'bg-red-500 hover:bg-red-600 text-white', label: 'Overdue' },
      error: { variant: 'destructive' as const, className: 'bg-gray-500 hover:bg-gray-600 text-white', label: 'Error' }
    }
    
    const config = statusConfig[status.toLowerCase() as keyof typeof statusConfig] || statusConfig.error
    
    return (
      <Badge variant={config.variant} className={config.className}>
        {config.label}
      </Badge>
    )
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: 'AED'
    }).format(amount)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString()
  }

  const resetFilters = () => {
    setFilters({
      customerName: "",
      status: "all",
      startDate: "",
      endDate: "",
    })
    // Trigger refetch with cleared filters
    setTimeout(() => fetchReportsData(), 100)
  }

  const handleReceiptClick = (customer: CustomerLedgerData) => {
    if (!customerSignature) {
      // No signature yet - show signature dialog first
      setPendingCustomer(customer)
      setShowSignatureDialog(true)
    } else {
      // Use the same data structure as "All Transactions" tab for receipt generation
      const allTransactions = [
        // Add gas sales transactions (filter by status if needed)
        ...(customer.recentSales || [])
          .filter(entry => {
            if (filters.status === 'all') return true;
            return entry.paymentStatus === filters.status;
          })
          .map(entry => ({
            ...entry,
            _id: `ledger-${entry._id}`,
            createdAt: entry.createdAt,
            type: 'gas_sale',
            displayType: 'Gas Sale',
            description: entry.items.map((item: any) => `${item.product?.name || 'Unknown Product'} (${item.quantity}x)`).join(', '),
            amount: entry.totalAmount,
            paidAmount: entry.amountPaid || 0,
            status: entry.paymentStatus,
          })),
        // Add cylinder transactions (filter by status if needed, EXCLUDE refills from amount calculations)
        ...(customer.recentCylinderTransactions || [])
          .filter(transaction => {
            if (filters.status === 'all') return true;
            return transaction.status === filters.status;
          })
          .map(transaction => ({
            ...transaction,
            _id: `cylinder-${transaction._id}`,
            createdAt: transaction.createdAt,
            type: transaction.type,
            displayType: `Cylinder ${transaction.type}`,
            description: `${transaction.cylinderSize} (${transaction.quantity}x)`,
            // EXCLUDE refills from amount totals
            amount: transaction.type === 'refill' ? 0 : (transaction.amount || 0),
            paidAmount: transaction.type === 'refill' ? 0 : (transaction.amount || 0),
            status: transaction.status,
          }))
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Create receipt items from All Transactions data (use amount-based totals)
      const items = allTransactions.map((transaction, index) => {
        const qty = transaction.type === 'gas_sale'
          ? (transaction.items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 1)
          : (transaction.quantity || 1)
        const lineTotal = Number(transaction.amount || 0)
        const unitPrice = qty > 0 ? lineTotal / qty : lineTotal
        return ({
          product: {
            name: `${transaction.displayType} - ${transaction.description}`,
            price: unitPrice,
          },
          quantity: qty,
          price: unitPrice,
          total: lineTotal,
        })
      });

      // Calculate total amount using transaction.amount
      const totalAmount = allTransactions.reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);
      
      // If no items, add a placeholder
      if (items.length === 0) {
        items.push({
          product: { name: "No transactions found", price: 0 },
          quantity: 1,
          price: 0,
          total: 0
        })
      }
      
      const mockSale = {
        _id: customer._id,
        invoiceNumber: `STATEMENT-${customer.trNumber}`,
        customer: {
          name: customer.name,
          phone: customer.phone,
          address: customer.address
        },
        items: items,
        totalAmount: totalAmount,
        paymentMethod: "Account Statement",
        paymentStatus: customer.status,
        createdAt: customer.lastTransactionDate || new Date().toISOString(),
        customerSignature: customerSignature
      }
      
      setReceiptDialogData(mockSale)
    }
  }

  const reportCards = [
    {
      title: "Total Revenue",
      value: formatCurrency(stats.totalRevenue),
      icon: DollarSign,
      color: "#2B3068",
    },
    {
      title: "Total Customers",
      value: stats.totalCustomers.toLocaleString(),
      icon: Users,
      color: "#2B3068",
    },
    {
      title: "Cleared Customers",
      value: stats.clearedCustomers,
      icon: UserCheck,
      color: "text-green-500",
      bgColor: "bg-green-100"
    },
    {
      title: "Gas Sales",
      value: stats.gasSales.toLocaleString(),
      icon: Fuel,
      color: "#2B3068",
    },
    {
      title: "Cylinder Refills",
      value: stats.cylinderRefills.toLocaleString(),
      icon: Cylinder,
      color: "#2B3068",
    },
    {
      title: "Total Employees",
      value: stats.totalEmployees.toLocaleString(),
      icon: UserCheck,
      color: "#2B3068",
    },
  ];

  if (loading && customers.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading reports data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-16 lg:pt-0 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8 text-white">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 flex items-center gap-3">
          <FileText className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />
          Reports & Analytics
        </h1>
        <p className="text-white/80 text-sm sm:text-base lg:text-lg">Comprehensive business insights and customer ledger</p>
      </div>

      {/* Daily Stock Report (local model) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle style={{ color: "#2B3068" }}>Daily Stock Report</CardTitle>
          <p className="text-sm text-gray-600">Track opening/closing stock with daily refills and sales. Stored locally on this device.</p>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <Button onClick={() => setShowDSRForm(true)} className="w-full sm:w-auto" style={{ backgroundColor: "#2B3068" }}>
            <PlusCircle className="h-4 w-4 mr-2" />
            Daily Stock Report
          </Button>
          <Button variant="outline" onClick={() => setShowDSRView(true)} className="w-full sm:w-auto">
            <ListChecks className="h-4 w-4 mr-2" />
            View Reports
          </Button>
          <div className="sm:ml-auto w-full sm:w-auto">
            <Button variant="secondary" onClick={() => setShowEmployeeDSR(true)} className="w-full sm:w-auto">
              View Employee Daily Stock Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* View Employee DSR Dialog */}
      <Dialog open={showEmployeeDSR} onOpenChange={setShowEmployeeDSR}>
        <DialogContent className="max-w-[900px] sm:max-w-[1000px]">
          <DialogHeader>
            <DialogTitle>Employee Daily Stock Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Employee and Date selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>Employee</Label>
                <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={empLoading ? "Loading..." : "Select employee"} /></SelectTrigger>
                  <SelectContent>
                    {employees.map(e => (
                      <SelectItem key={String(e._id)} value={String(e._id)}>
                        {e.name || e.email || e._id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={employeeDsrDate} onChange={(e) => setEmployeeDsrDate(e.target.value)} />
              </div>
            </div>

            <div className="flex gap-2">
              <Button disabled={!selectedEmployeeId || empLoading} onClick={loadEmployeeDsr} style={{ backgroundColor: "#2B3068" }}>
                {empLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />} Load Report
              </Button>
              <Button variant="outline" disabled={employeeDsrEntries.length === 0} onClick={() => downloadEmployeeDsrGridPdf(employeeDsrDate)}>
                <FileText className="h-4 w-4 mr-2" /> Download PDF
              </Button>
            </div>

            {/* Read-only grid like existing layout */}
            <div className="overflow-x-auto border rounded-md">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Items</TableHead>
                    <TableHead>Opening Full</TableHead>
                    <TableHead>Opening Empty</TableHead>
                    <TableHead>Refilled</TableHead>
                    <TableHead>Cylinder Sales</TableHead>
                    <TableHead>Gas Sales</TableHead>
                    <TableHead>Closing Full</TableHead>
                    <TableHead>Closing Empty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empGridRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-gray-500">{selectedEmployeeId ? "No data for selected date" : "Select employee and date to view"}</TableCell>
                    </TableRow>
                  ) : empGridRows.map((r) => (
                    <TableRow key={r.itemName}>
                      <TableCell className="font-medium">{r.itemName}</TableCell>
                      <TableCell>{r.openingFull}</TableCell>
                      <TableCell>{r.openingEmpty}</TableCell>
                      <TableCell>{r.refilled}</TableCell>
                      <TableCell>{r.cylinderSales}</TableCell>
                      <TableCell>{r.gasSales}</TableCell>
                      <TableCell>{typeof r.closingFull === 'number' ? r.closingFull : '-'}</TableCell>
                      <TableCell>{typeof r.closingEmpty === 'number' ? r.closingEmpty : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Daily Stock Report - Excel-like Dialog */}
      <Dialog open={showDSRForm} onOpenChange={setShowDSRForm}>
        <DialogContent className="w-screen max-w-screen sm:w-[95vw] sm:max-w-[1090px] p-0 sm:p-6 overflow-x-visible" style={{ overflowX: 'visible' }}>
          <DialogHeader>
            <DialogTitle>Daily Stock Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Optional date selector aligned with report */}
            <div className="flex items-center gap-3">
              <Label className="w-24">Date</Label>
              <Input
                type="date"
                value={dsrForm.date}
                onChange={(e) => setDsrForm(prev => ({ ...prev, date: e.target.value }))}
                className="w-48"
              />
            </div>

            {/* Force full-viewport width on mobile so horizontal scroll is available */}
            <div className="w-screen sm:w-auto -mx-4 sm:mx-0">
              <div className="overflow-x-auto sm:overflow-x-auto overscroll-x-contain w-full max-w-full border rounded-md touch-pan-x px-4 pointer-events-auto" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' }}>
                <table className="min-w-[1200px] sm:min-w-[1000px] border-collapse whitespace-nowrap">
                  <thead>
                  <tr>
                    <th className="border px-3 py-2 text-left bg-gray-50 min-w-[12rem]">Items</th>
                    <th className="border px-3 py-2 text-center bg-gray-50 min-w-[8rem]" colSpan={2}>Opening</th>
                    <th className="border px-3 py-2 text-center bg-gray-50 min-w-[8rem]" colSpan={2}>Closing</th>
                  </tr>
                  <tr>
                    <th className="border px-3 py-2 text-left bg-white whitespace-nowrap min-w-[12rem]"></th>
                    <th className="border px-3 py-2 text-center bg-white whitespace-nowrap min-w-[7.5rem]">Full</th>
                    <th className="border px-3 py-2 text-center bg-white whitespace-nowrap min-w-[7.5rem]">Empty</th>
                    <th className="border px-3 py-2 text-center bg-white whitespace-nowrap min-w-[7.5rem]">Full</th>
                    <th className="border px-3 py-2 text-center bg-white whitespace-nowrap min-w-[7.5rem]">Empty</th>
                  </tr>
                </thead>
                <tbody>
                  {dsrGrid.length === 0 ? (
                    <tr>
                      <td className="border px-3 py-3 text-center text-gray-500" colSpan={5}>No products found</td>
                    </tr>
                  ) : (
                    dsrGrid.map(row => (
                      <tr key={row.itemId}>
                        <td className="border px-3 py-2 whitespace-nowrap min-w-[12rem]">{row.itemName}</td>
                        <td className="border px-2 py-1 w-28 min-w-[7.5rem]">
                          <Input
                            type="number"
                            min={0}
                            value={row.openingFull}
                            onChange={(e) => updateDsrGridCell(row.itemId, 'openingFull', e.target.value)}
                            className="w-full min-w-[6.5rem]"
                          />
                        </td>
                        <td className="border px-2 py-1 w-28 min-w-[7.5rem]">
                          <Input
                            type="number"
                            min={0}
                            value={row.openingEmpty}
                            onChange={(e) => updateDsrGridCell(row.itemId, 'openingEmpty', e.target.value)}
                            className="w-full min-w-[6.5rem]"
                          />
                        </td>
                        <td className="border px-2 py-1 w-28 min-w-[7.5rem]">
                          <Input
                            type="number"
                            min={0}
                            value={row.closingFull}
                            onChange={(e) => updateDsrGridCell(row.itemId, 'closingFull', e.target.value)}
                            className="w-full min-w-[6.5rem]"
                          />
                        </td>
                        <td className="border px-2 py-1 w-28 min-w-[7.5rem]">
                          <Input
                            type="number"
                            min={0}
                            value={row.closingEmpty}
                            onChange={(e) => updateDsrGridCell(row.itemId, 'closingEmpty', e.target.value)}
                            className="w-full min-w-[6.5rem]"
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDSRForm(false)}>Cancel</Button>
              <Button style={{ backgroundColor: '#2B3068' }} onClick={saveDsrGrid}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DSR Grid View Dialog (read-only) */}
      <Dialog open={showDSRView} onOpenChange={setShowDSRView}>
        <DialogContent className="w-[95vw] max-w-[900px] p-3 sm:p-6 rounded-lg">
          <DialogHeader>
            <DialogTitle>Daily Stock Report – {dsrViewDate}</DialogTitle>
            <DialogDescription className="sr-only">Daily totals are derived from admin gas/cylinder sales and admin refills for the selected date.</DialogDescription>
          </DialogHeader>
          <div className="mb-3 flex items-center gap-2">
            <Label className="whitespace-nowrap">Date</Label>
            <Input type="date" value={dsrViewDate} onChange={(e) => setDsrViewDate(e.target.value)} className="h-9 w-[10.5rem]" />
            <Button variant="outline" onClick={() => downloadDsrGridPdf(dsrViewDate)} className="ml-auto">
              <FileText className="h-4 w-4 mr-2" /> Download PDF
            </Button>
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Items</TableHead>
                  <TableHead colSpan={2}>Opening</TableHead>
                  <TableHead colSpan={3}>During the day</TableHead>
                  <TableHead colSpan={2}>Closing</TableHead>
                </TableRow>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>Full</TableHead>
                  <TableHead>Empty</TableHead>
                  <TableHead>Refilled</TableHead>
                  <TableHead>Cylinder Sales</TableHead>
                  <TableHead>Gas Sales</TableHead>
                  <TableHead>Full</TableHead>
                  <TableHead>Empty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  // Build rows for all products; merge with entries for selected date
                  const byKey = new Map<string, DailyStockEntry>()
                  dsrEntries
                    .filter(e => e.date === dsrViewDate)
                    .forEach(e => byKey.set(normalizeName(e.itemName), e))
                  // Build rows from multiple sources to ensure items that only appear in today's aggregates are shown
                  const rows = (() => {
                    if (dsrProducts.length > 0) return dsrProducts
                    const nameSet = new Set<string>()
                    // Names from DSR entries for selected date
                    dsrEntries.filter(e => e.date === dsrViewDate).forEach(e => nameSet.add(normalizeName(String(e.itemName))))
                    // Names from daily aggregates (gas, cylinder, refills)
                    Object.keys(dailyAggGasSales || {}).forEach(k => nameSet.add(k))
                    Object.keys(dailyAggCylinderSales || {}).forEach(k => nameSet.add(k))
                    Object.keys(dailyAggRefills || {}).forEach(k => nameSet.add(k))
                    const arr = Array.from(nameSet)
                    return arr.map((n, i) => ({ _id: String(i), name: n } as any))
                  })()
                  return rows.length > 0 ? (
                    rows.map(p => {
                      const key = normalizeName(p.name)
                      const e = byKey.get(key)
                      const idKey = p._id ? String(p._id) : ''
                      const refV = (dailyAggRefills[key]
                        ?? (idKey ? dailyAggRefillsById[idKey] : undefined)
                        ?? (e ? e.refilled : 0)) ?? 0
                      const cylV = (dailyAggCylinderSales[key]
                        ?? (idKey ? dailyAggCylinderSalesById[idKey] : undefined)
                        ?? (e ? e.cylinderSales : 0)) ?? 0
                      const gasV = (dailyAggGasSales[key]
                        ?? (idKey ? dailyAggGasSalesById[idKey] : undefined)
                        ?? (e ? e.gasSales : 0)) ?? 0
                      // Temporary debug per row
                      try { console.debug('[DSR Row]', { name: p.name, key, refV, cylV, gasV }) } catch {}
                      return (
                        <TableRow key={p._id || p.name}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>{e ? e.openingFull : 0}</TableCell>
                          <TableCell>{e ? e.openingEmpty : 0}</TableCell>
                          <TableCell>{refV}</TableCell>
                          <TableCell>{cylV}</TableCell>
                          <TableCell>{gasV}</TableCell>
                          <TableCell>{typeof e?.closingFull === 'number' ? e!.closingFull : 0}</TableCell>
                          <TableCell>{typeof e?.closingEmpty === 'number' ? e!.closingEmpty : 0}</TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-6 text-gray-500">No data for selected date</TableCell>
                    </TableRow>
                  )
                })()}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDSRView(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {reportCards.map((card, index) => (
          <Card key={index}>
            <CardContent className="flex items-center p-6">
              <card.icon className="h-8 w-8 mr-4" style={{ color: card.color }} />
              <div>
                <p className="text-sm font-medium text-gray-600">{card.title}</p>
                <div className="text-2xl font-bold" style={{ color: card.color }}>
                  {card.value}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Enhanced Customer Ledger */}
      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#2B3068" }}>Enhanced Customer Ledger</CardTitle>
          <p className="text-sm text-gray-600">
            Comprehensive view of all customer transactions including gas sales, cylinder management, and financial history
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2 relative">
              <Label htmlFor="customerName">Customer Name</Label>
              <Input
                id="customerName"
                placeholder="Search by name, TR number, or phone..."
                value={filters.customerName}
                onChange={(e) => handleCustomerNameChange(e.target.value)}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                className="pr-10"
              />
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {filteredSuggestions.map((customer) => (
                    <div
                      key={customer._id}
                      className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      onClick={() => handleSuggestionClick(customer)}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{customer.name}</span>
                        <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                          <span>TR: {customer.trNumber}</span>
                          <span>Phone: {customer.phone}</span>
                          <TableCell className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {(() => {
                              const aggStatus = computeLedgerStatus(customer as any)
                              return getStatusBadge(aggStatus)
                            })()}
                          </TableCell>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="cleared">Cleared</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              />
            </div>
          </div>

          <div className="flex space-x-2">
            <Button onClick={handleFilter} style={{ backgroundColor: "#2B3068" }} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply Filters
            </Button>
            <Button onClick={resetFilters} variant="outline">
              Reset
            </Button>
          </div>

          {/* Customer Ledger Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>Customer Name</TableHead>
                  <TableHead>TR Number</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Total Paid Amount</TableHead>
                  <TableHead>Total Sales</TableHead>
                  <TableHead>Cylinder Transactions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers
                  .filter((customer) => {
                    // Filter by status
                    if (filters.status !== 'all') {
                      const aggStatus = computeLedgerStatus(customer)
                      if (aggStatus !== filters.status) {
                        return false;
                      }
                    }
                    
                    // Filter by customer name
                    if (filters.customerName.trim() !== '') {
                      return customer.name.toLowerCase().includes(filters.customerName.toLowerCase()) ||
                             customer.trNumber.toLowerCase().includes(filters.customerName.toLowerCase());
                    }
                    
                    return true;
                  })
                  .map((customer) => (
                  <React.Fragment key={customer._id}>
                    <TableRow className="cursor-pointer hover:bg-gray-50">
                      <TableCell className="p-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleCustomerExpansion(customer._id)}
                          className="p-0 h-auto"
                        >
                          {expandedCustomers.has(customer._id) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell>{customer.trNumber}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{customer.phone}</div>
                          <div className="text-gray-500">{customer.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={`font-semibold ${customer.balance > 0 ? 'text-red-600' : customer.balance < 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          {formatCurrency(customer.balance)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{customer.totalSales + customer.totalDeposits + customer.totalRefills + customer.totalReturns} transactions</div>
                          <div className="text-gray-500">{formatCurrency((customer.totalSalesAmount || 0) + (customer.totalCylinderAmount || 0))}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{customer.totalDeposits + customer.totalRefills + customer.totalReturns} transactions</div>
                          <div className="text-gray-500">{formatCurrency(customer.totalCylinderAmount)}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const aggStatus = computeLedgerStatus(customer)
                          return getStatusBadge(aggStatus)
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {formatDate(customer.lastTransactionDate)}
                          {customer.hasRecentActivity && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              <Activity className="w-3 h-3 mr-1" />
                              Recent
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReceiptClick(customer)}
                          className="flex items-center gap-2"
                        >
                          <Receipt className="h-4 w-4" />
                          Receipt
                        </Button>
                      </TableCell>
                    </TableRow>
                    
                    {/* Expanded Details */}
                    {expandedCustomers.has(customer._id) && (
                      <TableRow>
                        <TableCell colSpan={10} className="bg-gray-50 p-6">
                          <Tabs defaultValue="all" className="w-full">
                            <TabsList className="grid w-full grid-cols-4">
                              <TabsTrigger value="all">All Transactions</TabsTrigger>
                              <TabsTrigger value="gas_sales">Gas Sales ({customer.recentSales?.length || 0})</TabsTrigger>
                              <TabsTrigger value="cylinders">Cylinder Mgmt ({customer.recentCylinderTransactions?.length || 0})</TabsTrigger>
                              <TabsTrigger value="summary">Summary</TabsTrigger>
                            </TabsList>

                            <TabsContent value="all" className="mt-4">
                              {(() => {
                                const allTransactions = [
                                  // Add gas sales transactions (filter by status if needed)
                                  ...(customer.recentSales || [])
                                    .filter(entry => {
                                      if (filters.status === 'all') return true;
                                      return entry.paymentStatus === filters.status;
                                    })
                                    .map(entry => ({
                                      ...entry,
                                      _id: `ledger-${entry._id}`,
                                      createdAt: entry.createdAt,
                                      type: 'gas_sale',
                                      displayType: 'Gas Sale',
                                      description: entry.items.map((item: any) => `${item.product?.name || 'Unknown Product'} (${item.quantity}x)`).join(', '),
                                      amount: entry.totalAmount,
                                      paidAmount: entry.amountPaid || 0,
                                      status: entry.paymentStatus,
                                    })),
                                  // Add cylinder transactions (filter by status if needed)
                                  ...(customer.recentCylinderTransactions || [])
                                    .filter(transaction => {
                                      if (filters.status === 'all') return true;
                                      return transaction.status === filters.status;
                                    })
                                    .map(transaction => ({
                                      ...transaction,
                                      _id: `cylinder-${transaction._id}`,
                                      createdAt: transaction.createdAt,
                                      type: transaction.type,
                                      displayType: `Cylinder ${transaction.type}`,
                                      description: `${transaction.cylinderSize} (${transaction.quantity}x)`,
                                      amount: transaction.amount,
                                      paidAmount: transaction.amount || 0,
                                      status: transaction.status,
                                    }))
                                ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                                return allTransactions.length > 0 ? (
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Total</TableHead>
                                        <TableHead>Paid Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {allTransactions.map((transaction, index) => (
                                        <TableRow key={`${transaction.type}-${transaction._id}-${index}`}>
                                          <TableCell>
                                            <Badge 
                                              variant={transaction.type === 'gas_sale' ? 'default' : 'outline'}
                                              className={transaction.type === 'gas_sale' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}
                                            >
                                              {transaction.displayType}
                                            </Badge>
                                          </TableCell>
                                          <TableCell>{formatDate(transaction.createdAt)}</TableCell>
                                          <TableCell>{transaction.description}</TableCell>
                                          <TableCell>{formatCurrency(transaction.amount)}</TableCell>
                                          <TableCell>{formatCurrency(transaction.paidAmount || 0)}</TableCell>
                                          <TableCell>{getStatusBadge(transaction.status)}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                ) : (
                                  <p className="text-gray-500 text-center py-4">No transactions found</p>
                                );
                              })()}
                            </TabsContent>
                            
                            <TabsContent value="gas_sales" className="mt-4">
                              {(() => {
                                const filteredSales = customer.recentSales?.filter(sale => {
                                  if (filters.status === 'all') return true;
                                  return sale.paymentStatus === filters.status;
                                }) || [];
                                
                                return filteredSales.length > 0 ? (
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Invoice #</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Total</TableHead>
                                        <TableHead>Paid Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Items</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {filteredSales.map((sale) => {
                                        console.log(`[Ledger Render] Sale: ${sale.invoiceNumber}, Status: ${sale.paymentStatus}`);
                                        return (
                                          <TableRow key={sale._id}>
                                            <TableCell className="font-mono">{sale.invoiceNumber}</TableCell>
                                            <TableCell>{formatDate(sale.createdAt)}</TableCell>
                                            <TableCell>{formatCurrency(sale.totalAmount)}</TableCell>
                                            <TableCell>{formatCurrency(sale.amountPaid || 0)}</TableCell>
                                            <TableCell key={`${sale._id}-${sale.paymentStatus}`}>{getStatusBadge(sale.paymentStatus)}</TableCell>
                                            <TableCell>
                                              {sale.items?.map((item: any) => (
                                                <div key={item._id || item.product?._id}>{item.product?.name || 'N/A'} (x{item.quantity})</div>
                                              ))}
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                ) : (
                                  <div className="text-center text-gray-500 py-4">No gas sales found.</div>
                                );
                              })()}
                            </TabsContent>
                            
                            <TabsContent value="cylinders" className="mt-4">
                              {(() => {
                                const filteredCylinderTransactions = customer.recentCylinderTransactions?.filter(transaction => {
                                  if (filters.status === 'all') return true;
                                  return transaction.status === filters.status;
                                }) || [];
                                
                                return filteredCylinderTransactions.length > 0 ? (
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Cylinder Size</TableHead>
                                        <TableHead>Quantity</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Paid Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {filteredCylinderTransactions.map((transaction) => (
                                          <TableRow key={transaction._id}>
                                            <TableCell>
                                              <Badge variant="outline" className="capitalize">
                                                {transaction.type}
                                              </Badge>
                                            </TableCell>
                                            <TableCell>{formatDate(transaction.createdAt)}</TableCell>
                                            <TableCell>{transaction.cylinderSize}</TableCell>
                                            <TableCell>{transaction.quantity}</TableCell>
                                            <TableCell>{formatCurrency(transaction.amount)}</TableCell>
                                            <TableCell>{formatCurrency(transaction.amount || 0)}</TableCell>
                                            <TableCell>{getStatusBadge(transaction.status)}</TableCell>
                                          </TableRow>
                                        ))}
                                    </TableBody>
                                  </Table>
                                ) : (
                                  <p className="text-gray-500 text-center py-4">No recent cylinder transactions found</p>
                                );
                              })()}
                            </TabsContent>
                            
                            <TabsContent value="summary" className="mt-4">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Card>
                                  <CardHeader className="pb-2">
                                    <CardTitle className="text-sm flex items-center gap-2">
                                      <Fuel className="h-4 w-4 text-blue-600" />
                                      Gas Sales Summary
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="space-y-2 text-sm">
                                      <div className="flex justify-between">
                                        <span>Total Sales:</span>
                                        <span className="font-semibold">{customer.totalSales}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Sales Amount:</span>
                                        <span className="font-semibold text-blue-600">{formatCurrency(customer.totalSalesAmount)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Amount Paid:</span>
                                        <span className="font-semibold text-green-600">{formatCurrency(customer.totalPaidAmount)}</span>
                                      </div>
                                      <div className="flex justify-between border-t pt-2">
                                        <span>Outstanding:</span>
                                        <span className={`font-semibold ${(customer.totalSalesAmount - customer.totalPaidAmount) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                          {formatCurrency(customer.totalSalesAmount - customer.totalPaidAmount)}
                                        </span>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                                
                                <Card>
                                  <CardHeader className="pb-2">
                                    <CardTitle className="text-sm flex items-center gap-2">
                                      <Cylinder className="h-4 w-4 text-green-600" />
                                      Cylinder Management
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="space-y-2 text-sm">
                                      <div className="flex justify-between">
                                        <span>Deposits:</span>
                                        <span className="font-semibold">{customer.totalDeposits}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Refills:</span>
                                        <span className="font-semibold">{customer.totalRefills}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Returns:</span>
                                        <span className="font-semibold">{customer.totalReturns}</span>
                                      </div>
                                      <div className="flex justify-between border-t pt-2">
                                        <span>Total Amount:</span>
                                        <span className="font-semibold text-green-600">{formatCurrency(customer.totalCylinderAmount)}</span>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                                
                                <Card>
                                  <CardHeader className="pb-2">
                                    <CardTitle className="text-sm flex items-center gap-2">
                                      <DollarSign className="h-4 w-4 text-purple-600" />
                                      Overall Financial Summary
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="space-y-2 text-sm">
                                      <div className="flex justify-between">
                                        <span>Gas Sales Revenue:</span>
                                        <span className="font-semibold text-blue-600">{formatCurrency(customer.totalSalesAmount)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Cylinder Revenue:</span>
                                        <span className="font-semibold text-green-600">{formatCurrency(customer.totalCylinderAmount)}</span>
                                      </div>
                                      <div className="flex justify-between border-t pt-1">
                                        <span>Total Revenue:</span>
                                        <span className="font-semibold">{formatCurrency(customer.totalSalesAmount + customer.totalCylinderAmount)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Total Debit:</span>
                                        <span className="font-semibold text-red-600">{formatCurrency(customer.totalDebit)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Total Credit:</span>
                                        <span className="font-semibold text-green-600">{formatCurrency(customer.totalCredit)}</span>
                                      </div>
                                      <div className="flex justify-between border-t pt-2">
                                        <span>Current Balance:</span>
                                        <span className={`font-bold ${customer.balance > 0 ? 'text-red-600' : customer.balance < 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                          {formatCurrency(customer.balance)}
                                        </span>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              </div>
                            </TabsContent>
                          </Tabs>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
                {customers.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                      No customers found matching the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Signature Dialog */}
      <SignatureDialog
        isOpen={showSignatureDialog}
        onClose={handleSignatureCancel}
        onSignatureComplete={handleSignatureComplete}
        customerName={pendingCustomer?.name}
      />

      {/* Receipt Dialog */}
      {receiptDialogData && (
        <ReceiptDialog
          sale={receiptDialogData}
          onClose={() => setReceiptDialogData(null)}
        />
      )}

      {/* Removed old DSR Form Dialog (replaced by Excel-like grid dialog) */}

      {/* DSR List Dialog */}
      <Dialog open={showDSRList} onOpenChange={setShowDSRList}>
        <DialogContent className="w-[95vw] max-w-[900px] p-3 sm:p-6 rounded-lg">
          <DialogHeader>
            <DialogTitle>Daily Stock Reports</DialogTitle>
            <DialogDescription className="sr-only">Grid view shows admin totals for the selected date. Use the date input to change day.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-2">
            <div className="text-sm text-gray-600">Grid view · Select date to view</div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Input type="date" value={dsrViewDate} onChange={(e) => setDsrViewDate(e.target.value)} className="h-9 w-[9.5rem]" />
              <Button className="w-full bg-yellow-500 sm:w-auto" variant="outline" disabled={!aggReady} title={!aggReady ? 'Please wait… loading daily totals' : ''} onClick={() => downloadDsrGridPdf(dsrViewDate)}>Download PDF</Button>
            </div>
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Items</TableHead>
                  <TableHead colSpan={2}>Opening</TableHead>
                  <TableHead colSpan={3}>During the day</TableHead>
                  <TableHead colSpan={2}>Closing</TableHead>
                </TableRow>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>Full</TableHead>
                  <TableHead>Empty</TableHead>
                  <TableHead>Refilled</TableHead>
                  <TableHead>Cylinder Sales</TableHead>
                  <TableHead>Gas Sales</TableHead>
                  <TableHead>Full</TableHead>
                  <TableHead>Empty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const byKey = new Map<string, DailyStockEntry>()
                  dsrEntries.filter(e => e.date === dsrViewDate).forEach(e => byKey.set(normalizeName(e.itemName), e))
                  const rowsSource = (dsrProducts.length > 0 ? dsrProducts : Array.from(new Set(dsrEntries.map(e => e.itemName))).map((n, i) => ({ _id: String(i), name: n } as any)))
                  if (rowsSource.length === 0) {
                    return (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-6 text-gray-500">No data to show</TableCell>
                      </TableRow>
                    )
                  }
                  return rowsSource.map((p: any) => {
                    const e = byKey.get(normalizeName(p.name))
                    return (
                      <TableRow key={p._id || p.name}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{e ? e.openingFull : 0}</TableCell>
                        <TableCell>{e ? e.openingEmpty : 0}</TableCell>
                        <TableCell>{e ? e.refilled : 0}</TableCell>
                        <TableCell>{e ? e.cylinderSales : 0}</TableCell>
                        <TableCell>{e ? e.gasSales : 0}</TableCell>
                        <TableCell>{typeof e?.closingFull === 'number' ? e!.closingFull : 0}</TableCell>
                        <TableCell>{typeof e?.closingEmpty === 'number' ? e!.closingEmpty : 0}</TableCell>
                      </TableRow>
                    )
                  })
                })()}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Closing Stock Dialog */}
      <Dialog open={closingDialog.open} onOpenChange={(v) => setClosingDialog(prev => ({ ...prev, open: v }))}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Closing Stock</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 text-sm text-gray-600">{closingDialog.itemName} · {closingDialog.date}</div>
            <div className="space-y-2">
              <Label>Remaining Full Cylinders</Label>
              <Input type="number" min={0} value={closingDialog.closingFull} onChange={e => setClosingDialog(prev => ({ ...prev, closingFull: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Remaining Empty Cylinders</Label>
              <Input type="number" min={0} value={closingDialog.closingEmpty} onChange={e => setClosingDialog(prev => ({ ...prev, closingEmpty: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosingDialog(prev => ({ ...prev, open: false }))}>Cancel</Button>
            <Button style={{ backgroundColor: "#2B3068" }} onClick={() => submitClosingDialog()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
