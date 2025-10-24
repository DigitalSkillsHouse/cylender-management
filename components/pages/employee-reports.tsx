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
// Removed admin reportsAPI; employee page fetches scoped endpoints directly
import { SignatureDialog } from "@/components/signature-dialog"
import { ReceiptDialog } from "@/components/receipt-dialog"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"
import CashPaperSection from "@/components/cash-paper-section"

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

export default function EmployeeReports({ user }: { user: { id: string; name: string; email: string; role: "admin" | "employee" } }) {
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
  const [filtersApplied, setFiltersApplied] = useState(false)
  // Hold raw employee datasets for gas sales and cylinder transactions
  const [employeeSales, setEmployeeSales] = useState<any[]>([])
  const [employeeCylinders, setEmployeeCylinders] = useState<any[]>([])

  // Receive Amount dialog state for gas sales and cylinder transactions
  const [paymentDetailsDialog, setPaymentDetailsDialog] = useState<{
    open: boolean
    data: any
    kind: 'sale' | 'cylinder' | null
  }>({
    open: false,
    data: null,
    kind: null
  })

  const [receiveDialog, setReceiveDialog] = useState<{
    open: boolean
    targetId: string | null
    // kind: which collection to update when receiving payment
    // 'sale' = employee sale, 'admin_sale' = admin sale, 'cylinder' = employee cylinder
    kind: 'sale' | 'admin_sale' | 'cylinder'
    totalAmount: number
    currentReceived: number
    inputAmount: string
    paymentMethod: 'cash' | 'cheque'
    bankName: string
    checkNumber: string
    isReceived: boolean
  }>({ 
    open: false, 
    targetId: null, 
    kind: 'sale', 
    totalAmount: 0, 
    currentReceived: 0, 
    inputAmount: '',
    paymentMethod: 'cash',
    bankName: '',
    checkNumber: '',
    isReceived: false
  })

  // Show payment details for a transaction
  const showPaymentDetails = (data: any, kind: 'sale' | 'cylinder') => {
    setPaymentDetailsDialog({
      open: true,
      data,
      kind
    });
  };

  // Close payment details dialog
  const closePaymentDetails = () => {
    setPaymentDetailsDialog({
      open: false,
      data: null,
      kind: null
    });
  };

  // Pending receipt context so we can capture signature before opening receipt
  const [pendingReceiptData, setPendingReceiptData] = useState<{ kind: 'sale' | 'cylinder'; targetId: string } | null>(null)

  const openReceiveDialog = (opts: { id: string; totalAmount: number; currentReceived: number; kind?: 'sale' | 'admin_sale' | 'cylinder' }) => {
    setReceiveDialog({ 
      open: true, 
      targetId: opts.id, 
      kind: opts.kind || 'sale', 
      totalAmount: opts.totalAmount, 
      currentReceived: opts.currentReceived, 
      inputAmount: '',
      paymentMethod: 'cash',
      bankName: '',
      checkNumber: '',
      isReceived: false
    })
  }



  const closeReceiveDialog = () => {
    setReceiveDialog(prev => ({ 
      ...prev, 
      open: false, 
      inputAmount: '', 
      targetId: null,
      paymentMethod: 'cash',
      bankName: '',
      checkNumber: '',
      isReceived: false
    }))
  }

  const submitReceiveAmount = async () => {
    if (!receiveDialog.targetId) return
    const add = Number.parseFloat(receiveDialog.inputAmount || '0')
    if (!Number.isFinite(add) || add <= 0) {
      alert('Enter a valid amount > 0')
      return
    }
    const remaining = Math.max(0, Number(receiveDialog.totalAmount || 0) - Number(receiveDialog.currentReceived || 0))
    if (add > remaining) {
      alert(`Amount exceeds remaining balance. Remaining: ${remaining.toFixed(2)}`)
      return
    }
    
    // Validate payment method
    if (receiveDialog.paymentMethod === 'cheque' && (!receiveDialog.bankName || !receiveDialog.checkNumber)) {
      alert('Please provide bank name and check number for cheque payment')
      return
    }
    
    const newReceived = Number(receiveDialog.currentReceived || 0) + add
    const newStatus = newReceived >= Number(receiveDialog.totalAmount || 0) ? 'cleared' : 'pending'
    
    try {
      // Prepare payment details
      const paymentDetails = {
        paymentMethod: receiveDialog.paymentMethod || 'cash',
        ...(receiveDialog.paymentMethod === 'cheque' ? {
          bankName: receiveDialog.bankName,
          checkNumber: receiveDialog.checkNumber
        } : {})
      }
      
      // Determine endpoint and payload based on kind
      let url = ''
      let body: any = {}
      if (receiveDialog.kind === 'cylinder') {
        url = `/api/employee-cylinders/${receiveDialog.targetId}`
        body = {
          cashAmount: newReceived,
          status: newStatus,
          ...(receiveDialog.paymentMethod === 'cheque' ? {
            bankName: receiveDialog.bankName,
            checkNumber: receiveDialog.checkNumber
          } : {})
        }
      // REMOVED: Admin sale payment processing - Employee should not process admin sales
      // Employee reports are isolated to employee-specific transactions only else {
        // default: employee sale
        url = `/api/employee-sales/${receiveDialog.targetId}`
        body = {
          receivedAmount: newReceived,
          paymentStatus: newStatus,
          paymentMethod: receiveDialog.paymentMethod || 'cash',
          ...(receiveDialog.paymentMethod === 'cheque' ? {
            bankName: receiveDialog.bankName,
            checkNumber: receiveDialog.checkNumber
          } : {})
        }
      }
          
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to update payment')
      
      // Show success message
      toast.success('Payment recorded successfully')
      
      // Close the dialog
      closeReceiveDialog()
      
      // Refresh the page to show updated data
      window.location.reload()
    } catch (e: any) {
      console.error('Error updating payment:', e)
      toast.error(e?.message || 'Failed to update payment')
    }
  }

  // Daily Stock Report local model (automated calculations)
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
    employeeId?: string
    createdAt?: string
  }
  
  // Download pending transactions PDF
  const downloadPendingTransactionsPdf = () => {
    // Filter customers with pending transactions
    const pendingCustomers = customers.filter(customer => {
      // Check if customer has any pending transactions
      const hasPendingGasSales = customer.recentSales?.some((sale: any) => sale.paymentStatus === 'pending') || false;
      const hasPendingCylinders = customer.recentCylinderTransactions?.some((transaction: any) => transaction.status === 'pending') || false;
      return hasPendingGasSales || hasPendingCylinders;
    });

    if (pendingCustomers.length === 0) {
      alert('No pending transactions found.');
      return;
    }

    // Generate HTML content for PDF
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Employee Pending Transactions Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { color: #2B3068; margin-bottom: 10px; }
          .header p { color: #666; margin: 5px 0; }
          .customer-section { margin-bottom: 30px; page-break-inside: avoid; }
          .customer-header { background-color: #f8f9fa; padding: 10px; border-left: 4px solid #2B3068; margin-bottom: 15px; }
          .customer-name { font-size: 16px; font-weight: bold; color: #2B3068; margin-bottom: 5px; }
          .customer-info { font-size: 11px; color: #666; }
          .transactions-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
          .transactions-table th { background-color: #f1f3f4; padding: 8px; text-align: left; border: 1px solid #ddd; font-size: 11px; }
          .transactions-table td { padding: 8px; border: 1px solid #ddd; font-size: 11px; }
          .transactions-table tr:nth-child(even) { background-color: #f9f9f9; }
          .total-row { background-color: #e8f4fd; font-weight: bold; }
          .total-amount { text-align: right; font-weight: bold; color: #2B3068; }
          .no-transactions { color: #999; font-style: italic; padding: 20px; text-align: center; }
          @media print { 
            body { margin: 0; } 
            .customer-section { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Employee Pending Transactions Report</h1>
          <p>Employee: ${user?.name || 'N/A'}</p>
          <p>Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
          <p>Total Customers with Pending Transactions: ${pendingCustomers.length}</p>
        </div>
    `;

    let grandTotal = 0;

    pendingCustomers.forEach(customer => {
      // Get pending gas sales
      const pendingGasSales = customer.recentSales?.filter((sale: any) => sale.paymentStatus === 'pending') || [];
      
      // Get pending cylinder transactions
      const pendingCylinders = customer.recentCylinderTransactions?.filter((transaction: any) => transaction.status === 'pending') || [];

      // Calculate customer total
      const gasSalesTotal = pendingGasSales.reduce((sum: number, sale: any) => sum + (Number(sale.totalAmount) || 0), 0);
      const cylindersTotal = pendingCylinders.reduce((sum: number, transaction: any) => sum + (Number(transaction.amount) || 0), 0);
      const customerTotal = gasSalesTotal + cylindersTotal;
      grandTotal += customerTotal;

      htmlContent += `
        <div class="customer-section">
          <div class="customer-header">
            <div class="customer-name">${customer.name}</div>
            <div class="customer-info">
              TR Number: ${customer.trNumber}
            </div>
          </div>
      `;

      if (pendingGasSales.length > 0 || pendingCylinders.length > 0) {
        htmlContent += `
          <table class="transactions-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice Number</th>
                <th>Reference Name</th>
                <th>Amount (AED)</th>
              </tr>
            </thead>
            <tbody>
        `;

        // Add gas sales
        pendingGasSales.forEach((sale: any) => {
          const date = new Date(sale.createdAt).toLocaleDateString();
          const invoiceNumber = sale.invoiceNumber || 'N/A';
          const createdBy = user?.name || 'Employee';
          const referenceName = createdBy;
          const amount = Number(sale.totalAmount) || 0;

          htmlContent += `
            <tr>
              <td>${date}</td>
              <td>${invoiceNumber}</td>
              <td>${referenceName}</td>
              <td>${formatCurrency(amount)}</td>
            </tr>
          `;
        });

        // Add cylinder transactions
        pendingCylinders.forEach((transaction: any) => {
          const date = new Date(transaction.createdAt).toLocaleDateString();
          const invoiceNumber = transaction.invoiceNumber || transaction.transactionId || 'N/A';
          const createdBy = user?.name || 'Employee';
          const referenceName = createdBy;
          const amount = Number(transaction.amount) || 0;

          htmlContent += `
            <tr>
              <td>${date}</td>
              <td>${invoiceNumber}</td>
              <td>${referenceName}</td>
              <td>${formatCurrency(amount)}</td>
            </tr>
          `;
        });

        htmlContent += `
            <tr class="total-row">
              <td colspan="3" class="total-amount">Customer Total:</td>
              <td class="total-amount">${formatCurrency(customerTotal)}</td>
            </tr>
            </tbody>
          </table>
        `;
      } else {
        htmlContent += `<div class="no-transactions">No pending transactions found for this customer.</div>`;
      }

      htmlContent += `</div>`;
    });

    // Add grand total
    htmlContent += `
        <div style="margin-top: 30px; padding: 15px; background-color: #f8f9fa; border: 2px solid #2B3068; text-align: right;">
          <h2 style="color: #2B3068; margin: 0;">Grand Total: ${formatCurrency(grandTotal)}</h2>
        </div>
      </body>
      </html>
    `;

    // Open PDF in new window for printing
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      
      // Auto-trigger print dialog after content loads
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 500);
      };
    }
  };

  // Download the grid view for a specific date as PDF
  const downloadDsrGridPdf = (date: string) => {
    try {
      const byKey = new Map<string, DailyStockEntry>()
      dsrEntries.filter(e => e.date === date).forEach(e => byKey.set(normalizeName(e.itemName), e))
      
      // Use exact same product source as DSR table
      const rowsSource = (() => {
        // First try DSR products (cylinder products)
        if (dsrProducts.length > 0) return dsrProducts
        // Then try all assigned products
        if (assignedProducts.length > 0) return assignedProducts
        // Build from aggregated data if no assigned products
        const nameSet = new Set<string>()
        Object.keys(dailyAggGasSales || {}).forEach(k => nameSet.add(k))
        Object.keys(dailyAggCylinderSales || {}).forEach(k => nameSet.add(k))
        Object.keys(dailyAggRefills || {}).forEach(k => nameSet.add(k))
        Object.keys(dailyAggDeposits || {}).forEach(k => nameSet.add(k))
        Object.keys(dailyAggReturns || {}).forEach(k => nameSet.add(k))
        return Array.from(nameSet).map((name, i) => ({ _id: String(i), name }))
      })()
      
      const rows = rowsSource.map(p => {
        const key = normalizeName(p.name)
        const e = byKey.get(key)
        const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
        
        const refV = dailyAggRefills[key] ?? 0
        const cylV = dailyAggCylinderSales[key] ?? 0
        
        // For gas sales, try both basic and enhanced normalization for cross-matching
        const gasVBasic = dailyAggGasSales[key] ?? 0
        const enhancedKey = normalizeForGasCylinderMatch(p.name)
        const gasVEnhanced = dailyAggGasSales[enhancedKey] ?? 0
        const gasV = Math.max(gasVBasic, gasVEnhanced) // Use whichever has data
        
        const depV = dailyAggDeposits[key] ?? 0
        const retV = dailyAggReturns[key] ?? 0
        
        const openingFull = e?.openingFull ?? inventoryInfo.availableFull
        const openingEmpty = e?.openingEmpty ?? inventoryInfo.availableEmpty
        
        // Calculate closing stock using admin formula
        const closingFull = Math.max(0, (openingFull + refV) - gasV)
        const closingEmpty = Math.max(0, openingEmpty + gasV + cylV - refV + retV - depV)
        
        return `
          <tr>
            <td>${p.name}</td>
            <td>${openingFull}</td>
            <td>${openingEmpty}</td>
            <td>${refV}</td>
            <td>${cylV}</td>
            <td>${gasV}</td>
            <td>${depV}</td>
            <td>${retV}</td>
            <td>${closingFull}</td>
            <td>${closingEmpty}</td>
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
      console.error(err)
      alert('Failed to prepare PDF')
    }
  }

  // Auto-calculate DSR entries for the selected date
  const autoCalcEmployeeDsr = async (date: string) => {
    try {
      if (!user?.id) {
        alert('User not authenticated')
        return
      }

      // Ensure we have the latest data
      await loadAssignedProducts()
      await fetchInventoryData()
      
      // Wait a moment for state updates
      setTimeout(() => {
        const rowsSource = dsrProducts.length > 0 ? dsrProducts : assignedProducts
        
        if (rowsSource.length === 0) {
          alert('No cylinder products found for DSR calculation')
          return
        }

        const newEntries: DailyStockEntry[] = []
        
        rowsSource.forEach(p => {
          const key = normalizeName(p.name)
          const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
          
          // Get daily activity data
          const refV = dailyAggRefills[key] ?? 0
          const cylV = dailyAggCylinderSales[key] ?? 0
          const gasV = dailyAggGasSales[key] ?? 0
          const depV = dailyAggDeposits[key] ?? 0
          const retV = dailyAggReturns[key] ?? 0
          
          // Use current inventory as opening stock
          const openingFull = inventoryInfo.availableFull
          const openingEmpty = inventoryInfo.availableEmpty
          
          // Calculate closing stock using admin formula
          const closingFull = Math.max(0, (openingFull + refV) - gasV)
          const closingEmpty = Math.max(0, openingEmpty + gasV + cylV - refV + retV - depV)
          
          const entry: DailyStockEntry = {
            id: `${date}-${key}`,
            date,
            itemName: p.name,
            openingFull,
            openingEmpty,
            refilled: refV,
            cylinderSales: cylV,
            gasSales: gasV,
            depositCylinder: depV,
            returnCylinder: retV,
            closingFull,
            closingEmpty,
            employeeId: user.id
          }
          
          newEntries.push(entry)
        })
        
        // Update DSR entries
        const existingEntries = dsrEntries.filter(e => e.date !== date)
        const updatedEntries = [...existingEntries, ...newEntries]
        setDsrEntries(updatedEntries)
        saveDsrLocal(updatedEntries)
        
        // DSR auto-calculated successfully
        alert(`DSR calculated for ${date} with ${newEntries.length} cylinder products`)
      }, 500)
      
    } catch (error) {
      console.error('Failed to auto-calculate DSR:', error)
      alert('Failed to calculate DSR. Please try again.')
    }
  }

  // Save closing stock as next day's opening stock
  const saveClosingAsOpening = async (date: string) => {
    try {
      if (!user?.id) {
        alert('User not authenticated')
        return
      }

      // Calculate next day
      const currentDate = new Date(date)
      currentDate.setDate(currentDate.getDate() + 1)
      const nextDay = currentDate.toISOString().slice(0, 10)

      // Get current DSR data for the selected date
      const byKey = new Map<string, DailyStockEntry>()
      dsrEntries.filter(e => e.date === date).forEach(e => byKey.set(normalizeName(e.itemName), e))

      // Build rows from products
      const rowsSource = (() => {
        if (dsrProducts.length > 0) return dsrProducts
        if (assignedProducts.length > 0) return assignedProducts
        const nameSet = new Set<string>()
        Object.keys(dailyAggGasSales || {}).forEach(k => nameSet.add(k))
        Object.keys(dailyAggCylinderSales || {}).forEach(k => nameSet.add(k))
        Object.keys(dailyAggRefills || {}).forEach(k => nameSet.add(k))
        Object.keys(dailyAggDeposits || {}).forEach(k => nameSet.add(k))
        Object.keys(dailyAggReturns || {}).forEach(k => nameSet.add(k))
        return Array.from(nameSet).map((name, i) => ({ _id: String(i), name }))
      })()

      const newEntries: DailyStockEntry[] = []

      rowsSource.forEach(p => {
        const key = normalizeName(p.name)
        const e = byKey.get(key)
        const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
        
        // Get aggregated daily data
        const refV = dailyAggRefills[key] ?? 0
        const cylV = dailyAggCylinderSales[key] ?? 0
        const gasVBasic = dailyAggGasSales[key] ?? 0
        const enhancedKey = normalizeForGasCylinderMatch(p.name)
        const gasVEnhanced = dailyAggGasSales[enhancedKey] ?? 0
        const gasV = Math.max(gasVBasic, gasVEnhanced)
        const depV = dailyAggDeposits[key] ?? 0
        const retV = dailyAggReturns[key] ?? 0
        
        const openingFull = e?.openingFull ?? inventoryInfo.availableFull
        const openingEmpty = e?.openingEmpty ?? inventoryInfo.availableEmpty
        
        // Calculate closing stock
        const closingFull = Math.max(0, (openingFull + refV) - gasV)
        const closingEmpty = Math.max(0, openingEmpty + gasV + cylV - refV + retV - depV)
        
        // Create entry for next day with closing stock as opening stock
        const entry: DailyStockEntry = {
          id: `${nextDay}-${key}`,
          date: nextDay,
          itemName: p.name,
          openingFull: closingFull,
          openingEmpty: closingEmpty,
          refilled: 0, // Will be updated when next day transactions occur
          cylinderSales: 0, // Will be updated when next day transactions occur
          gasSales: 0, // Will be updated when next day transactions occur
          depositCylinder: 0, // Will be updated when next day transactions occur
          returnCylinder: 0, // Will be updated when next day transactions occur
          closingFull: closingFull, // Will be updated when next day is calculated
          closingEmpty: closingEmpty, // Will be updated when next day is calculated
          employeeId: user.id,
          createdAt: new Date().toISOString()
        }
        
        newEntries.push(entry)
      })

      // Update DSR entries - remove existing entries for next day and add new ones
      const existingEntries = dsrEntries.filter(e => e.date !== nextDay)
      const updatedEntries = [...existingEntries, ...newEntries]
      setDsrEntries(updatedEntries)
      
      // Save to localStorage for persistence
      localStorage.setItem('employeeDsrEntries', JSON.stringify(updatedEntries))
      
      alert(`Closing stock for ${date} has been saved as opening stock for ${nextDay}`)
      
    } catch (error) {
      console.error('Failed to save closing stock as opening:', error)
      alert('Failed to save closing stock. Please try again.')
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
      employeeId: user.id,
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

  const [showDSRView, setShowDSRView] = useState(false)
  const [dsrEntries, setDsrEntries] = useState<DailyStockEntry[]>([])
  const [dsrViewDate, setDsrViewDate] = useState<string>(new Date().toISOString().slice(0, 10))

  // Load saved DSR entries from localStorage on component mount
  useEffect(() => {
    try {
      const savedEntries = localStorage.getItem('employeeDsrEntries')
      if (savedEntries) {
        const parsedEntries = JSON.parse(savedEntries)
        if (Array.isArray(parsedEntries)) {
          setDsrEntries(parsedEntries)
        }
      }
    } catch (error) {
      console.error('Failed to load saved DSR entries:', error)
    }
  }, [])
  // Products for DSR grid
  interface ProductLite { _id: string; name: string }
  const [dsrProducts, setDsrProducts] = useState<ProductLite[]>([])
  // Basic name normalizer for general use (preserves original behavior)
  const normalizeName = (s: any) => (typeof s === 'string' || typeof s === 'number')
    ? String(s).replace(/\s+/g, ' ').trim().toLowerCase()
    : ''
  
  // Enhanced normalizer for gas/cylinder cross-matching
  const normalizeForGasCylinderMatch = (s: any) => {
    if (typeof s !== 'string' && typeof s !== 'number') return ''
    
    let normalized = String(s).replace(/\s+/g, ' ').trim().toLowerCase()
    
    // Handle gas/cylinder name variations for better matching
    // "GAS PROPANE 44KG" should match "Cylinders PROPANE 44KG"
    normalized = normalized
      .replace(/^gas\s+/, '') // Remove "gas " prefix
      .replace(/^cylinders?\s+/, '') // Remove "cylinder " or "cylinders " prefix
      .replace(/\s+gas$/, '') // Remove " gas" suffix
      .replace(/\s+cylinders?$/, '') // Remove " cylinder" or " cylinders" suffix
    
    // Normalization applied
    
    return normalized
  }
  // Aggregated daily totals fed into the DSR view grid 
  const [dailyAggRefills, setDailyAggRefills] = useState<Record<string, number>>({})
  const [dailyAggCylinderSales, setDailyAggCylinderSales] = useState<Record<string, number>>({})
  const [dailyAggGasSales, setDailyAggGasSales] = useState<Record<string, number>>({})
  const [dailyAggDeposits, setDailyAggDeposits] = useState<Record<string, number>>({})
  const [dailyAggReturns, setDailyAggReturns] = useState<Record<string, number>>({})
  // Daily refill data from API with caching
  const [dailyRefillData, setDailyRefillData] = useState<Record<string, number>>({})
  const [lastFetchedDate, setLastFetchedDate] = useState<string>('')
  const [isRefillFetching, setIsRefillFetching] = useState<boolean>(false)
  const [lastSalesFetchedDate, setLastSalesFetchedDate] = useState<string>('')
  const [isSalesFetching, setIsSalesFetching] = useState<boolean>(false)
  // Assigned products for the employee to ensure baseline rows
  const [assignedProducts, setAssignedProducts] = useState<ProductLite[]>([])
  // Track aggregation readiness for employee data
  const [aggReady, setAggReady] = useState<boolean>(false)
  
  // Automated inventory data fetching for DSR
  const [inventoryData, setInventoryData] = useState<Record<string, { availableFull: number; availableEmpty: number; currentStock: number }>>({})

  // Fetch employee inventory data for automated DSR - EMPLOYEE SCOPED ONLY
  const fetchInventoryData = async () => {
    try {
      // Fetch employee inventory from the correct API that has the data
      const [employeeInventoryRes, stockAssignmentsRes] = await Promise.all([
        fetch(`/api/employee-inventory-new/received?employeeId=${user.id}&t=${Date.now()}`, { cache: 'no-store' }),
        fetch(`/api/stock-assignments?employeeId=${user.id}`, { cache: 'no-store' })
      ])
      
      const employeeInventoryJson = await employeeInventoryRes.json()
      const stockAssignmentsJson = await stockAssignmentsRes.json()
      
      // API responses received
      
      // Handle employee inventory response structure from new API
      const employeeInventoryItems = Array.isArray(employeeInventoryJson?.data) 
        ? employeeInventoryJson.data 
        : []
      
      // Handle stock assignments response structure  
      const stockAssignments = Array.isArray(stockAssignmentsJson?.data) 
        ? stockAssignmentsJson.data 
        : Array.isArray(stockAssignmentsJson) 
          ? stockAssignmentsJson 
          : []
      
      // Build DSR products from employee's assigned stock only
      const employeeProducts = new Map()
      
      // Add from employee inventory (using new API structure) - ONLY CYLINDERS for DSR
      employeeInventoryItems.forEach((item: any) => {
        if (item.productName && item.category === 'cylinder') {
          // Only include cylinder products for DSR (not gas)
          employeeProducts.set(item.productId || item._id, {
            _id: item.productId || item._id,
            name: item.productName
          })
        }
      })
      
      // Add from stock assignments - ONLY CYLINDERS for DSR
      stockAssignments.forEach((assignment: any) => {
        if (assignment.product?.name && (assignment.category === 'cylinder' || assignment.product.category === 'cylinder')) {
          // Only include cylinder products from assignments (not gas)
          employeeProducts.set(assignment.product._id || assignment._id, {
            _id: assignment.product._id || assignment._id,
            name: assignment.product.name
          })
        }
      })
      
      setDsrProducts(Array.from(employeeProducts.values()))
      
      // Build inventory map from employee's actual inventory only
      const inventoryMap: Record<string, { availableFull: number; availableEmpty: number; currentStock: number }> = {}
      
      employeeInventoryItems.forEach((item: any) => {
        if (item.productName && item.category === 'cylinder') {
          const key = item.productName.toLowerCase()
          
          // Use the actual stock values from the new API - ONLY FOR CYLINDERS
          const availableFull = item.availableFull || 0
          const availableEmpty = item.availableEmpty || 0
          const currentStock = item.currentStock || 0
          
          inventoryMap[key] = {
            availableFull,
            availableEmpty,
            currentStock
          }
        }
      })
      
      // Add stock assignments to inventory map
      stockAssignments.forEach((assignment: any) => {
        if (assignment.product?.name && assignment.status === 'received') {
          const key = assignment.product.name.toLowerCase()
          if (!inventoryMap[key]) {
            inventoryMap[key] = {
              availableFull: 0,
              availableEmpty: 0,
              currentStock: 0
            }
          }
          
          // Add assignment quantities based on category and cylinder status
          if (assignment.category === 'cylinder') {
            if (assignment.cylinderStatus === 'full') {
              inventoryMap[key].availableFull += assignment.quantity || 0
            } else if (assignment.cylinderStatus === 'empty') {
              inventoryMap[key].availableEmpty += assignment.quantity || 0
            }
          } else if (assignment.category === 'gas') {
            inventoryMap[key].currentStock += assignment.quantity || 0
          }
        }
      })
      
      setInventoryData(inventoryMap)
    } catch (error) {
      console.error('Failed to fetch employee inventory data:', error)
      setInventoryData({})
      setDsrProducts([])
    }
  }
  // Fetch inventory data and assigned products when DSR view opens or date changes
  useEffect(() => {
    if (showDSRView && user?.id) {
      loadAssignedProducts()
      fetchInventoryData()
    }
  }, [showDSRView, dsrViewDate, user.id])
  // Load assigned products function (moved outside useEffect for reusability)
  const loadAssignedProducts = async () => {
    try {
      if (!user?.id) return
      
      // Fetch both stock assignments and employee inventory from correct API
      const [assignmentsRes, inventoryRes] = await Promise.all([
        fetch(`/api/stock-assignments?employeeId=${user.id}`, { cache: 'no-store' }),
        fetch(`/api/employee-inventory-new/received?employeeId=${user.id}&t=${Date.now()}`, { cache: 'no-store' })
      ])
      
      const assignmentsJson = await assignmentsRes.json().catch(() => ({}))
      const inventoryJson = await inventoryRes.json().catch(() => ({}))
      
      // Loading assigned products data
      
      const assignments: any[] = Array.isArray(assignmentsJson) 
        ? assignmentsJson 
        : Array.isArray(assignmentsJson?.data) 
          ? assignmentsJson.data 
          : []
      const inventory: any[] = Array.isArray(inventoryJson?.data) 
        ? inventoryJson.data 
        : []
      
      const seen = new Set<string>()
      const ap: ProductLite[] = []
      
      // Add from stock assignments - ONLY CYLINDERS
      assignments.forEach((a: any) => {
        const name = a?.product?.name || a?.productName
        const id = String(a?.product?._id || a?.product || name || '')
        const key = normalizeName(name)
        if (name && (a.category === 'cylinder' || a?.product?.category === 'cylinder') && !seen.has(key)) {
          seen.add(key)
          ap.push({ _id: id, name: String(name) })
        }
      })
      
      // Add from employee inventory (using new API structure) - ONLY CYLINDERS
      inventory.forEach((item: any) => {
        const name = item?.productName
        const id = String(item?.productId || item?._id || name || '')
        const key = normalizeName(name)
        if (name && item.category === 'cylinder' && !seen.has(key)) {
          seen.add(key)
          ap.push({ _id: id, name: String(name) })
        }
      })
      
      setAssignedProducts(ap)
      
      // DSR should only show cylinder products (ap is already filtered for cylinders)
      setDsrProducts(ap)
    } catch (e) {
      console.error('Failed to load assigned products:', e)
      setAssignedProducts([])
      setDsrProducts([])
    }
  }

  // Load assigned products on component mount
  useEffect(() => {
    if (user?.id) {
      loadAssignedProducts()
    }
  }, [user?.id])

// ... (rest of the code remains the same)
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
      employeeId: user.id,
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
      const url = `${API_BASE}?itemName=${encodeURIComponent(e.itemName)}&date=${encodeURIComponent(e.date)}&employeeId=${encodeURIComponent(user.id)}`
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

  // Helpers: API endpoints + localStorage fallback - EMPLOYEE SCOPED
  const DSR_KEY = `employee_daily_stock_reports_${user.id}` // Scope to specific employee
  const API_BASE = "/api/employee-daily-stock-reports"
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
      const url = new URL(API_BASE, window.location.origin)
      url.searchParams.set('employeeId', user.id)
      const res = await fetch(url.toString(), { cache: "no-store" })
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
        depositCylinder: Number(d.depositCylinder || 0),
        returnCylinder: Number(d.returnCylinder || 0),
        closingFull: typeof d.closingFull === 'number' ? d.closingFull : undefined,
        closingEmpty: typeof d.closingEmpty === 'number' ? d.closingEmpty : undefined,
        employeeId: d.employeeId,
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

  // Fetch daily refill data from API with debouncing
  const fetchDailyRefills = async (date: string) => {
    // Prevent multiple simultaneous calls for the same date
    if (isRefillFetching || lastFetchedDate === date) {
      return
    }
    
    try {
      setIsRefillFetching(true)
      const apiUrl = `/api/daily-refills?date=${date}&employeeId=${user.id}`
      // Fetching daily refills
      
      const response = await fetch(apiUrl, { 
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        // Daily refills data received
        
        const refills: Record<string, number> = {}
        
        if (Array.isArray(data.data)) {
          data.data.forEach((refill: any) => {
            const cylinderName = refill.cylinderName || ''
            const quantity = Number(refill.todayRefill) || 0
            
            if (cylinderName && quantity > 0) {
              const key = normalizeName(cylinderName)
              refills[key] = (refills[key] || 0) + quantity
              // Refill added
            }
          })
        }
        // Refills processed
        
        setDailyRefillData(refills)
        setLastFetchedDate(date)
      } else {
        setDailyRefillData({})
      }
    } catch (error) {
      console.error('Failed to fetch daily refills:', error)
      setDailyRefillData({})
    } finally {
      setIsRefillFetching(false)
    }
  }

  // Update refills when dailyRefillData changes (after main aggregation)
  useEffect(() => {
    console.log('🔍 Post-aggregation useEffect triggered:', {
      dailyRefillDataKeys: Object.keys(dailyRefillData),
      dailyRefillData: dailyRefillData,
      aggReady: aggReady,
      shouldUpdate: Object.keys(dailyRefillData).length > 0 && aggReady
    })
    
    if (Object.keys(dailyRefillData).length > 0 && aggReady) {
      console.log('🔄 Post-aggregation: Updating refills with API data:', dailyRefillData)
      setDailyAggRefills(prev => {
        const updated = {
          ...prev,
          ...dailyRefillData
        }
        console.log('🔄 Updated dailyAggRefills from', prev, 'to', updated)
        return updated
      })
    }
  }, [dailyRefillData, aggReady])

  // Aggregate daily data for DSR based on selected date and employee data
  useEffect(() => {
    console.log('🔍 Main aggregation useEffect triggered:', { dsrViewDate, userId: user?.id })
    if (!dsrViewDate || !user?.id) {
      console.log('❌ Main useEffect early return:', { dsrViewDate, userId: user?.id })
      return
    }
    
    console.log('✅ Main useEffect proceeding with aggregation')
    setAggReady(false)
    
    // Clear cache and force refresh when date changes
    if (lastFetchedDate && lastFetchedDate !== dsrViewDate) {
      console.log('🔄 Date changed from', lastFetchedDate, 'to', dsrViewDate, '- clearing cache')
      setDailyRefillData({})
      setDailyAggRefills({})
      setLastFetchedDate('')
    }
    
    if (lastSalesFetchedDate && lastSalesFetchedDate !== dsrViewDate) {
      console.log('🔄 Sales date changed - clearing sales cache')
      setLastSalesFetchedDate('')
    }
    
    // Only fetch daily refills if we don't have data for this date
    const shouldFetchRefills = lastFetchedDate !== dsrViewDate && !isRefillFetching
    console.log('🔍 Should fetch refills?', shouldFetchRefills, { lastFetchedDate, dsrViewDate, isRefillFetching })
    
    if (shouldFetchRefills) {
      // Debounce the API call
      const timeoutId = setTimeout(() => {
        fetchDailyRefills(dsrViewDate)
      }, 300)
      
      return () => clearTimeout(timeoutId)
    }
    
    // If we're still fetching refills, don't process aggregation yet
    if (isRefillFetching) {
      return
    }
    
    const dayStart = new Date(dsrViewDate + 'T00:00:00').getTime()
    const dayEnd = new Date(dsrViewDate + 'T23:59:59.999').getTime()
    const isOnDay = (t: any) => {
      const ts = t ? new Date(t).getTime() : NaN
      return Number.isFinite(ts) && ts >= dayStart && ts <= dayEnd
    }
    const inc = (map: Record<string, number>, key: string, by: number) => {
      const k = normalizeName(key)
      if (!k) return
      map[k] = (map[k] || 0) + (Number(by) || 0)
    }

    const refills: Record<string, number> = { ...dailyRefillData } // Start with API data
    console.log('🔍 Starting daily aggregation with API refills:', dailyRefillData)
    console.log('🔍 DSR Date being processed:', dsrViewDate)
    console.log('🔍 Last fetched refill date:', lastFetchedDate)
    console.log('🔍 Initial refills object keys:', Object.keys(refills))
    
    const cylSales: Record<string, number> = {}
    const gasSales: Record<string, number> = {}
    const deposits: Record<string, number> = {}
    const returns: Record<string, number> = {}

    // Employee cylinder transactions
    ;(employeeCylinders || []).forEach((tx: any) => {
      if (!isOnDay(tx.createdAt || tx.date)) return
      const type = String(tx.type || '').toLowerCase()
      
      // Handle both single item and items array formats
      if (Array.isArray(tx.items)) {
        tx.items.forEach((it: any) => {
          const nameRaw = it?.productName || it?.product?.name || it?.cylinderSize || it?.size || 'cylinder'
          const qty = Number(it?.quantity || 0)
          if (type === 'refill') inc(refills, nameRaw, qty)
          if (type === 'deposit') {
            inc(cylSales, nameRaw, qty)
            inc(deposits, nameRaw, qty)
          }
          if (type === 'return') {
            inc(returns, nameRaw, qty)
          }
        })
      } else {
        // Single item format
        const nameRaw = tx?.productName || tx?.product?.name || tx?.cylinderSize || 'cylinder'
        const qty = Number(tx?.quantity || 0)
        if (type === 'refill') inc(refills, nameRaw, qty)
        if (type === 'deposit') {
          inc(cylSales, nameRaw, qty)
          inc(deposits, nameRaw, qty)
        }
        if (type === 'return') {
          inc(returns, nameRaw, qty)
        }
      }
    })

    console.log('🔍 Refills after employee cylinder transactions:', refills)
    console.log('🔍 Refills object keys after cylinder transactions:', Object.keys(refills))

    // Employee gas sales - Enhanced with daily tracking system
    ;(employeeSales || []).forEach((sale: any) => {
      if (!isOnDay(sale.createdAt || sale.date)) return
      const items = Array.isArray(sale.items) ? sale.items : []
      items.forEach((it: any) => {
        const nameRaw = it?.product?.name || it?.productName || 'gas'
        const qty = Number(it?.quantity || 0)
        const category = it?.product?.category || it?.category || 'gas'
        const cylinderStatus = it?.cylinderStatus
        
        if (category === 'gas') {
          // For gas sales, attribute to the cylinder that contains the gas (if available)
          const cylinderName = it?.cylinderName || nameRaw
          inc(gasSales, cylinderName, qty)
        } else if (category === 'cylinder') {
          // For cylinder sales, distinguish between full and empty
          if (cylinderStatus === 'full') {
            inc(cylSales, nameRaw, qty) // Full cylinder sales
          }
        }
      })
    })

    // Fetch and process daily employee sales aggregation for enhanced accuracy (with caching)
    if (lastSalesFetchedDate !== dsrViewDate && !isSalesFetching) {
      ;(async () => {
        try {
          setIsSalesFetching(true)
          const dailySalesRes = await fetch(`/api/daily-employee-sales-aggregation?date=${dsrViewDate}&employeeId=${user.id}`, { 
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate'
            }
          })
          
          const dailySalesData = await dailySalesRes.json()
          const dailySalesList = Array.isArray(dailySalesData?.data) ? dailySalesData.data : []
          
          console.log(`Employee DSR: Processing ${dailySalesList.length} daily sales aggregation entries for ${dsrViewDate}`)
          console.log('Daily sales aggregation data structure:', dailySalesList)
          
          dailySalesList.forEach((dailyEntry: any) => {
            const productName = dailyEntry.productName || ''
            const gasQty = Number(dailyEntry.totalGasSales) || 0
            const fullCylinderQty = Number(dailyEntry.totalFullCylinderSales) || 0
            const emptyCylinderQty = Number(dailyEntry.totalEmptyCylinderSales) || 0
            const totalCylinderQty = fullCylinderQty + emptyCylinderQty
            
            if (gasQty > 0) {
              const basicNormalized = normalizeName(productName)
              const enhancedNormalized = normalizeForGasCylinderMatch(productName)
              
              // Store gas sales under both normalizations for better matching
              inc(gasSales, productName, gasQty) // Original name
              if (basicNormalized !== enhancedNormalized) {
                // Also store under enhanced key if different
                const enhancedKey = enhancedNormalized
                gasSales[enhancedKey] = (gasSales[enhancedKey] || 0) + gasQty
              }
              
              console.log(`Employee DSR Daily Gas Sales: ${productName} (basic: ${basicNormalized}, enhanced: ${enhancedNormalized}) - ${gasQty} units sold today`)
            }
            
            // Use total cylinder sales quantity (includes both full and empty cylinder sales)
            if (totalCylinderQty > 0) {
              inc(cylSales, productName, totalCylinderQty)
              console.log(`Employee DSR Daily Cylinder Sales: ${productName} - ${totalCylinderQty} cylinders sold today`)
            }
            
            // Also log full cylinder sales specifically for debugging
            if (fullCylinderQty > 0) {
              console.log(`Employee DSR Daily Full Cylinder Sales: ${productName} - ${fullCylinderQty} full cylinders sold today`)
            }
          })
          
          // Fetch daily employee cylinder aggregation for deposits and returns
          console.log(`Employee DSR: Fetching cylinder aggregation for ${dsrViewDate}`)
          try {
            const cylinderAggRes = await fetch(`/api/daily-employee-cylinder-aggregation?date=${dsrViewDate}&employeeId=${user.id}`, { 
              cache: 'no-store',
              headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate'
              }
            })
            
            if (cylinderAggRes.ok) {
              const cylinderAggData = await cylinderAggRes.json()
              const cylinderAggList = Array.isArray(cylinderAggData?.data) ? cylinderAggData.data : []
              
              console.log(`Employee DSR: Processing ${cylinderAggList.length} cylinder aggregation entries`)
              
              cylinderAggList.forEach((cylinderEntry: any) => {
                const productName = cylinderEntry.productName || ''
                const depositQty = Number(cylinderEntry.totalDeposits) || 0
                const returnQty = Number(cylinderEntry.totalReturns) || 0
                const refillQty = Number(cylinderEntry.totalRefills) || 0
                
                if (depositQty > 0) {
                  inc(deposits, productName, depositQty)
                  console.log(`Employee DSR Cylinder Deposits: ${productName} - ${depositQty} deposits today`)
                }
                
                if (returnQty > 0) {
                  inc(returns, productName, returnQty)
                  console.log(`Employee DSR Cylinder Returns: ${productName} - ${returnQty} returns today`)
                }
                
                if (refillQty > 0) {
                  inc(refills, productName, refillQty)
                  console.log(`Employee DSR Cylinder Refills: ${productName} - ${refillQty} refills today`)
                }
              })
            } else {
              console.warn('Failed to fetch cylinder aggregation:', await cylinderAggRes.text())
            }
          } catch (cylinderAggError) {
            console.warn('Error fetching cylinder aggregation:', cylinderAggError)
          }
          
          // Update the state with enhanced data
          setDailyAggRefills(refills)
          setDailyAggCylinderSales(cylSales)
          setDailyAggGasSales(gasSales)
          setDailyAggDeposits(deposits)
          setDailyAggReturns(returns)
          setAggReady(true)
          setLastSalesFetchedDate(dsrViewDate)
        } catch (dailySalesError) {
        console.warn('Failed to fetch daily employee sales tracking:', dailySalesError instanceof Error ? dailySalesError.message : String(dailySalesError))
        // Fallback to existing data
        setDailyAggRefills(refills)
        setDailyAggCylinderSales(cylSales)
        setDailyAggGasSales(gasSales)
        setDailyAggDeposits(deposits)
        setDailyAggReturns(returns)
        setAggReady(true)
      } finally {
        setIsSalesFetching(false)
      }
    })()
    } else {
      // Use existing data if already fetched for this date
      setDailyAggRefills(refills)
      setDailyAggCylinderSales(cylSales)
      setDailyAggGasSales(gasSales)
      setDailyAggDeposits(deposits)
      setDailyAggReturns(returns)
      setAggReady(true)
    }

    console.log('Final daily aggregation results:', {
      refills,
      cylSales,
      gasSales,
      deposits,
      returns
    })
    
    // Note: State is now set in the async daily sales fetch above for enhanced accuracy
  }, [dsrViewDate, employeeSales, employeeCylinders, user?.id])



  const parseNum = (v: string) => {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }



  // Clear DSR entries (for maintenance purposes)
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
  }

  const handleSignatureComplete = (signature: string) => {
    // Save signature and close dialog
    setCustomerSignature(signature)
    setShowSignatureDialog(false)

    // If invoked from Receive Amount flow, fetch updated record and open receipt
    if (pendingReceiptData) {
      const { kind, targetId } = pendingReceiptData
      const getUrl = kind === 'cylinder' ? `/api/employee-cylinders/${targetId}` : `/api/employee-sales/${targetId}`

      const buildReceiptFromSource = (src: any) => {
        const isCylinder = kind === 'cylinder'
        const customerName = src?.customer?.name || src?.customerName || (typeof src?.customer === 'string' ? src.customer : '-')
        const customerPhone = src?.customer?.phone || src?.customerPhone || '-'
        const customerAddress = src?.customer?.address || src?.customerAddress || '-'
        const createdAt = src?.createdAt || new Date().toISOString()
        const invoiceNumber = src?.invoiceNumber || src?._id || String(targetId)
        const amountTotal = Number(src?.totalAmount ?? src?.amount ?? receiveDialog.totalAmount ?? 0)
        const paymentMethod = (src?.paymentMethod || src?.method || '-').toString()
        const paymentStatus = (src?.paymentStatus || src?.status || '').toString()
        const type = (src?.type || '').toString()

        let items: any[] = []
        if (Array.isArray(src?.items) && src.items.length > 0) {
          items = src.items.map((it: any) => {
            const qty = Number(it?.quantity || 1)
            const unit = Number(((it?.price ?? it?.unitPrice ?? it?.costPrice ?? (Number(it?.total ?? 0) / (qty || 1))) ?? 0))
            const lineTotal = Number(it?.total || (unit * (qty || 0)))
            return {
              product: { name: it?.product?.name || it?.productName || it?.name || 'Item', price: unit },
              quantity: qty,
              price: unit,
              total: lineTotal,
            }
          })
        } else {
          const qty = Number(src?.quantity || 1)
          const unit = (qty > 0) ? (amountTotal / qty) : amountTotal
          const label = isCylinder ? `${type || 'Cylinder'} – ${src?.cylinderSize || ''}` : 'Gas Sale'
          items = [{ product: { name: label, price: unit }, quantity: qty, price: unit, total: amountTotal }]
        }

        return {
          _id: String(src?._id || targetId),
          invoiceNumber,
          customer: { name: customerName, phone: customerPhone, address: customerAddress },
          items,
          totalAmount: items.reduce((s, it) => s + Number(it.total || (Number(it.price || 0) * Number(it.quantity || 0))), 0),
          paymentMethod,
          paymentStatus,
          type,
          createdAt,
          customerSignature: signature,
        }
      }

      ;(async () => {
        try {
          const getRes = await fetch(getUrl)
          if (getRes.ok) {
            const updated = await getRes.json()
            setReceiptDialogData(buildReceiptFromSource(updated))
          } else {
            setReceiptDialogData(buildReceiptFromSource({}))
          }
        } catch {
          setReceiptDialogData(buildReceiptFromSource({}))
        } finally {
          setPendingReceiptData(null)
        }
      })()
      return
    }

    // Fallback: statement print flow for selected customer
    if (pendingCustomer) {
      const filteredSales = (pendingCustomer.recentSales || []).filter((entry: any) => {
        if (filters.status === 'all') return true
        return entry.paymentStatus === filters.status
      })

      const gasItems = filteredSales.flatMap((entry: any) =>
        (entry.items || []).map((it: any) => ({
          product: { name: it?.product?.name || it?.productName || it?.name || 'Item', price: Number(it?.price || 0) },
          quantity: Number(it?.quantity || 1),
          price: Number(it?.price || 0),
          total: Number(it?.total || ((Number(it?.price || 0)) * Number(it?.quantity || 1)))
        }))
      )

      const cylinderItems = (pendingCustomer.recentCylinderTransactions || [])
        .filter((t: any) => (filters.status === 'all') ? true : (t?.status === filters.status))
        .map((t: any) => ({
          product: { name: `${t?.type || 'Cylinder'} – ${t?.cylinderSize || ''}`, price: Number(t?.amount || 0) },
          quantity: Number(t?.quantity || 1),
          price: Number(t?.amount || 0),
          total: Number(t?.amount || 0)
        }))

      const items = [...gasItems, ...cylinderItems]
      const totalAmount = items.reduce((sum, it) => sum + (Number(it.total) || 0), 0)

      const mockSale = {
        _id: pendingCustomer._id,
        invoiceNumber: `STATEMENT-${pendingCustomer.trNumber}`,
        customer: {
          name: pendingCustomer.name,
          phone: pendingCustomer.phone,
          address: pendingCustomer.address
        },
        items,
        totalAmount,
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
  }, [user?.id])

  const fetchReportsData = async (loadCustomers = false) => {
    try {
      if (!user?.id) return
      setLoading(true)

      // Always fetch employee-scoped gas sales, cylinder transactions, and stock assignments
      const [salesRes, cylRes, assignRes] = await Promise.all([
        fetch(`/api/employee-sales?employeeId=${user.id}`, { cache: "no-store" }).then(r => r.ok ? r.json() : []).catch(() => ([])),
        fetch(`/api/employee-cylinders?employeeId=${user.id}`, { cache: "no-store" }).then(r => r.ok ? r.json() : []).catch(() => ([])),
        fetch(`/api/stock-assignments?employeeId=${user.id}&status=assigned`, { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => ([])),
      ])

      // REMOVED: Admin sales fetching - Employee should only see their own transactions
      // Employee reports should not include admin sales data for security and data isolation

      const sales: any[] = Array.isArray(salesRes)
        ? salesRes
        : Array.isArray(salesRes?.data)
          ? salesRes.data
          : []
      const cylinders: any[] = Array.isArray(cylRes)
        ? cylRes
        : Array.isArray(cylRes?.data)
          ? cylRes.data
          : []
      const assignmentsArr: any[] = Array.isArray(assignRes)
        ? assignRes
        : Array.isArray(assignRes?.data)
          ? assignRes.data
          : []
      // REMOVED: Admin sales processing - Employee reports are employee-scoped only

      // Compute lightweight stats for employee
      const totalRevenue = sales.reduce((s, x) => s + (Number(x.totalAmount) || 0), 0)
      const totalReceived = sales.reduce((s, x) => s + (Number(x.receivedAmount) || 0), 0)
      const totalCustomers = new Set(
        [
          ...sales.map(s => s.customer?._id || s.customerId || s.customerName || ""),
          ...cylinders.map(c => c.customer?._id || c.customerId || c.customerName || ""),
        ].filter(Boolean)
      ).size

      setStats({
        totalRevenue: totalRevenue,
        totalEmployees: 1,
        gasSales: sales.length,
        cylinderRefills: cylinders.length,
        totalCustomers: totalCustomers,
        totalCombinedRevenue: totalRevenue,
        pendingCustomers: 0,
        overdueCustomers: 0,
        clearedCustomers: 0,
      })

      // Expose arrays to the UI (for tables/exports if present)
      setEmployeeSales(sales)
      setEmployeeCylinders(cylinders)
      // Build assigned products list (unique by normalized name)
      const seen = new Set<string>()
      const assigned: ProductLite[] = []
      assignmentsArr.forEach((a: any) => {
        const name = a?.product?.name || a?.productName
        const id = String(a?.product?._id || a?.product || name || '')
        const key = normalizeName(name)
        if (name && !seen.has(key)) {
          seen.add(key)
          assigned.push({ _id: id, name: String(name) })
        }
      })
      setAssignedProducts(assigned)

      // Only build customer ledger if requested
      if (loadCustomers) {
        // Derive a minimal customer ledger from employee data
        const byCustomer = new Map<string, CustomerLedgerData>()
        const getKey = (obj: any) => String(obj?.customer?._id || obj?.customerId || obj?.customerName || "unknown")
        const getName = (obj: any) => String(obj?.customer?.name || obj?.customerName || "Unknown")

      // Employee sales into ledger (tag source)
      sales.forEach(s => {
        const key = getKey(s)
        const item = byCustomer.get(key) || {
          _id: key,
          name: getName(s),
          trNumber: s.customer?.trNumber || "",
          phone: s.customer?.phone || "",
          email: s.customer?.email || "",
          address: s.customer?.address || "",
          balance: 0,
          totalDebit: 0,
          totalCredit: 0,
          status: 'pending',
          totalSales: 0,
          totalSalesAmount: 0,
          totalPaidAmount: 0,
          totalCylinderAmount: 0,
          totalDeposits: 0,
          totalRefills: 0,
          totalReturns: 0,
          hasRecentActivity: false,
          lastTransactionDate: null,
          recentSales: [],
          recentCylinderTransactions: [],
        } as CustomerLedgerData
        const total = Number(s.totalAmount) || 0
        const paid = Number(s.receivedAmount) || 0
        item.totalSales += 1
        item.totalSalesAmount += total
        item.totalPaidAmount += paid
        item.totalDebit += total
        item.totalCredit += paid
        item.balance = item.totalDebit - item.totalCredit
        item.hasRecentActivity = true
        item.lastTransactionDate = s.createdAt || item.lastTransactionDate
        item.recentSales.push({ ...s, _source: 'employee' })
        byCustomer.set(key, item)
      })

      // REMOVED: Admin sales processing - Employee reports show only employee's own transactions
      // This ensures data isolation and prevents employees from seeing other employees' or admin transactions

      cylinders.forEach(c => {
        const key = getKey(c)
        const item = byCustomer.get(key) || {
          _id: key,
          name: getName(c),
          trNumber: c.customer?.trNumber || "",
          phone: c.customer?.phone || "",
          email: c.customer?.email || "",
          address: c.customer?.address || "",
          balance: 0,
          totalDebit: 0,
          totalCredit: 0,
          status: 'pending',
          totalSales: 0,
          totalSalesAmount: 0,
          totalPaidAmount: 0,
          totalCylinderAmount: 0,
          totalDeposits: 0,
          totalRefills: 0,
          totalReturns: 0,
          hasRecentActivity: false,
          lastTransactionDate: null,
          recentSales: [],
          recentCylinderTransactions: [],
        } as CustomerLedgerData
        const amt = Number(c.amount) || 0
        item.totalCylinderAmount += amt
        item.balance = item.totalDebit - item.totalCredit + item.totalCylinderAmount
        item.hasRecentActivity = true
        item.lastTransactionDate = c.createdAt || item.lastTransactionDate
        item.recentCylinderTransactions.push(c)
        byCustomer.set(key, item)
      })

        setCustomers(Array.from(byCustomer.values()))
      }
    } catch (error) {
      console.error("Failed to fetch employee report data:", error)
      if (loadCustomers) {
        setCustomers([])
      }
      setStats(prev => ({ ...prev, totalRevenue: 0, gasSales: 0, cylinderRefills: 0, totalCustomers: 0, totalCombinedRevenue: 0 }))
    } finally {
      setLoading(false)
    }
  }

  const handleFilter = async () => {
    setFiltersApplied(true);
    await fetchReportsData(true);
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
    setFiltersApplied(false);
    setCustomers([]);
    setExpandedCustomers(new Set());
  }

  const handleReceiptClick = (customer: CustomerLedgerData) => {
    if (!customerSignature) {
      // No signature yet - show signature dialog first
      setPendingCustomer(customer)
      setShowSignatureDialog(true)
    } else {
      // Build receipt items as separate rows per product for gas sales, plus cylinder transactions
      const filteredSales = (customer.recentSales || []).filter((entry: any) => {
        if (filters.status === 'all') return true
        return entry.paymentStatus === filters.status
      })

      const gasItems = filteredSales.flatMap((entry: any) =>
        (entry.items || []).map((it: any) => ({
          product: {
            name: it?.product?.name || 'Unknown Product',
            price: Number(it?.price || 0),
          },
          quantity: Number(it?.quantity || 1),
          price: Number(it?.price || 0),
          total: Number(it?.total ?? ((Number(it?.price || 0)) * Number(it?.quantity || 1)))
        }))
      )

      // Cylinder transactions (deposit/return have amount; refills treated as 0 amount in receipt)
      const filteredCyl = (customer.recentCylinderTransactions || []).filter((t: any) => {
        if (filters.status === 'all') return true
        return t.status === filters.status
      })
      const cylItems = filteredCyl.map((t: any) => {
        const qty = Number(t?.quantity || 1)
        const total = t?.type === 'refill' ? 0 : Number(t?.amount || 0)
        const unit = qty > 0 ? (total / qty) : total
        return {
          product: {
            name: `Cylinder ${t?.type} - ${t?.cylinderSize}`,
            price: unit,
          },
          quantity: qty,
          price: unit,
          total: total,
        }
      })

      const items = [...gasItems, ...cylItems]

      // Calculate total amount as sum of item totals
      const totalAmount = items.reduce((sum, it) => sum + (Number(it.total) || 0), 0)
      
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

      {/* Daily Stock Report (automated) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle style={{ color: "#2B3068" }}>Daily Stock Report</CardTitle>
          <p className="text-sm text-gray-600">Automated daily stock tracking with real-time data from your assigned inventory, sales, and cylinder operations.</p>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <Button variant="outline" onClick={() => setShowDSRView(true)} className="w-full sm:w-auto" style={{ backgroundColor: "#2B3068", color: "white" }}>
            <ListChecks className="h-4 w-4 mr-2" />
            View Daily Stock Report
          </Button>
        </CardContent>
      </Card>



      {/* DSR Grid View Dialog (automated) */}
      <Dialog open={showDSRView} onOpenChange={setShowDSRView}>
        <DialogContent className="w-[95vw] max-w-[900px] p-3 sm:p-6 rounded-lg">
          <DialogHeader>
            <DialogTitle>Employee Daily Stock Report – {dsrViewDate}</DialogTitle>
          </DialogHeader>
          <div className="mb-3 flex items-center gap-2">
            <Label className="whitespace-nowrap">Date</Label>
            <Input 
              type="date" 
              value={dsrViewDate} 
              onChange={(e) => {
                const newDate = e.target.value
                console.log('📅 DSR Date changed to:', newDate)
                setDsrViewDate(newDate)
                // Force clear all cache when date changes manually
                setDailyRefillData({})
                setDailyAggRefills({})
                setDailyAggCylinderSales({})
                setDailyAggGasSales({})
                setDailyAggDeposits({})
                setDailyAggReturns({})
                setLastFetchedDate('')
                setLastSalesFetchedDate('')
                setAggReady(false)
              }} 
              className="h-9 w-[10.5rem]" 
            />
            <Button variant="outline" onClick={() => saveClosingAsOpening(dsrViewDate)} className="mr-2">
              <ListChecks className="h-4 w-4 mr-2" /> Save as Next Day Opening
            </Button>
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
                  <TableHead colSpan={5}>During the day</TableHead>
                  <TableHead colSpan={2}>Closing</TableHead>
                </TableRow>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>Full</TableHead>
                  <TableHead>Empty</TableHead>
                  <TableHead>Refilled</TableHead>
                  <TableHead>Cylinder Sales</TableHead>
                  <TableHead>Gas Sales</TableHead>
                  <TableHead>Deposit Cylinder</TableHead>
                  <TableHead>Return Cylinder</TableHead>
                  <TableHead>Full</TableHead>
                  <TableHead>Empty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  // Build rows for employee's assigned products with automated calculations
                  const byKey = new Map<string, DailyStockEntry>()
                  dsrEntries
                    .filter(e => e.date === dsrViewDate)
                    .forEach(e => byKey.set(normalizeName(e.itemName), e))
                  
                  // Use employee's assigned products as the base, with fallback to aggregated data
                  const rows = (() => {
                    // First try DSR products (cylinder products)
                    if (dsrProducts.length > 0) return dsrProducts
                    // Then try all assigned products
                    if (assignedProducts.length > 0) return assignedProducts
                    // Build from aggregated data if no assigned products
                    const nameSet = new Set<string>()
                    Object.keys(dailyAggGasSales || {}).forEach(k => nameSet.add(k))
                    Object.keys(dailyAggCylinderSales || {}).forEach(k => nameSet.add(k))
                    Object.keys(dailyAggRefills || {}).forEach(k => nameSet.add(k))
                    Object.keys(dailyAggDeposits || {}).forEach(k => nameSet.add(k))
                    Object.keys(dailyAggReturns || {}).forEach(k => nameSet.add(k))
                    return Array.from(nameSet).map((name, i) => ({ _id: String(i), name }))
                  })()
                  
                  // DSR Grid products determined
                  
                  return rows.length > 0 ? (
                    rows.map(p => {
                      const key = normalizeName(p.name)
                      const e = byKey.get(key)
                      
                      // Get employee inventory data for this product
                      const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
                      
                      // Get aggregated daily data using basic normalization
                      const refV = dailyAggRefills[key] ?? 0
                      
                      // Refill data retrieved
                      const cylV = dailyAggCylinderSales[key] ?? 0
                      const depV = dailyAggDeposits[key] ?? 0
                      const retV = dailyAggReturns[key] ?? 0
                      
                      // For gas sales, try both basic and enhanced normalization for cross-matching
                      const gasVBasic = dailyAggGasSales[key] ?? 0
                      const enhancedKey = normalizeForGasCylinderMatch(p.name)
                      const gasVEnhanced = dailyAggGasSales[enhancedKey] ?? 0
                      const gasV = Math.max(gasVBasic, gasVEnhanced) // Use whichever has data
                      
                      // Daily data aggregated
                      
                      // Calculate opening stock (use stored values or current inventory)
                      const openingFull = e?.openingFull ?? inventoryInfo.availableFull
                      const openingEmpty = e?.openingEmpty ?? inventoryInfo.availableEmpty
                      
                      // Calculate closing stock using admin formula:
                      // Closing Full = (Opening Full + Refilled) - Gas Sales
                      // Closing Empty = Opening Empty + Gas Sales + Cylinder Sales - Refilled + Returns - Deposits
                      const closingFull = Math.max(0, (openingFull + refV) - gasV)
                      const closingEmpty = Math.max(0, openingEmpty + gasV + cylV - refV + retV - depV)
                      
                      return (
                        <TableRow key={p._id || p.name}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-blue-600 font-medium">{openingFull}</TableCell>
                          <TableCell className="text-blue-600 font-medium">{openingEmpty}</TableCell>
                          <TableCell className="text-green-600">{refV}</TableCell>
                          <TableCell className="text-orange-600">{cylV}</TableCell>
                          <TableCell className="text-red-600">{gasV}</TableCell>
                          <TableCell className="text-purple-600">{depV}</TableCell>
                          <TableCell className="text-indigo-600">{retV}</TableCell>
                          <TableCell className="text-blue-800 font-bold">{closingFull}</TableCell>
                          <TableCell className="text-blue-800 font-bold">{closingEmpty}</TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-6 text-gray-500">
                        No inventory data found. Please ensure you have assigned products or transactions for this date.
                        <br />
                        <small className="text-xs text-gray-400 mt-2 block">
                          Debug Info: DSR Products: {dsrProducts.length}, Assigned Products: {assignedProducts.length}<br/>
                          Inventory Data Keys: {Object.keys(inventoryData).length}<br/>
                          Daily Aggregations - Gas: {Object.keys(dailyAggGasSales || {}).length}, Cylinders: {Object.keys(dailyAggCylinderSales || {}).length}, Refills: {Object.keys(dailyAggRefills || {}).length}<br/>
                          Employee Sales: {employeeSales.length}, Employee Cylinders: {employeeCylinders.length}<br/>
                          User ID: {user?.id || 'Not set'}, Date: {dsrViewDate}
                        </small>
                        <br />
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => { loadAssignedProducts(); fetchInventoryData(); }}
                          className="mt-2"
                        >
                          <Activity className="h-4 w-4 mr-2" /> Refresh Inventory Data
                        </Button>
                      </TableCell>
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
      {/* Cash Paper (Employee) */}
      <CashPaperSection title="Cash Paper (Employee)" employeeId={user.id} />

      {/* Stats Cards - Responsive Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {reportCards.map((card, index) => (
          <Card key={index} className="col-span-1">
            <CardContent className="flex items-center p-4 sm:p-6">
              <card.icon className="h-6 w-6 sm:h-8 sm:w-8 mr-2 sm:mr-4" style={{ color: card.color }} />
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">{card.title}</p>
                <div className="text-lg sm:text-xl md:text-2xl font-bold truncate" style={{ color: card.color }}>
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
          {/* Filters - Responsive Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Customer Search - Full width on mobile, half on sm, quarter on lg */}
            <div className="space-y-2 relative sm:col-span-2 lg:col-span-1">
              <Label htmlFor="customerName">Customer Name</Label>
              <Input
                id="customerName"
                placeholder="Search by name, TR number, or phone..."
                value={filters.customerName}
                onChange={(e) => handleCustomerNameChange(e.target.value)}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                className="pr-10 w-full"
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
                        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 text-sm text-gray-500 mt-1">
                          <span className="truncate">TR: {customer.trNumber}</span>
                          <span className="truncate">Phone: {customer.phone}</span>
                          <div className="mt-1 sm:mt-0">
                            {(() => {
                              const dynamicStatus = customer.balance <= 0 ? 'cleared' : customer.status;
                              return getStatusBadge(dynamicStatus);
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Status Dropdown - Half width on mobile, quarter on lg */}
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select 
                value={filters.status} 
                onValueChange={(value) => setFilters({ ...filters, status: value })}
              >
                <SelectTrigger className="w-full">
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

            {/* Date Range - Half width on mobile, quarter on lg */}
            <div className="grid grid-cols-2 gap-4 sm:col-span-2 lg:col-span-1">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  className="w-full"
                />
              </div>
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
            {filters.status === 'pending' && (
              <Button onClick={downloadPendingTransactionsPdf} variant="outline" className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200">
                <FileText className="mr-2 h-4 w-4" />
                Download Pendings
              </Button>
            )}
          </div>

          {/* Customer Ledger Table */}
          {!filtersApplied ? (
            <div className="text-center py-12 bg-gray-50 border rounded-lg">
              <div className="flex flex-col items-center space-y-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                  <ListChecks className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Data to Display</h3>
                  <p className="text-gray-600 max-w-md">
                    Please apply filters above to view customer ledger data. You can filter by customer name, status, or date range.
                  </p>
                </div>
                <Button onClick={() => { setFiltersApplied(true); fetchReportsData(true); }} style={{ backgroundColor: "#2B3068" }}>
                  <Eye className="w-4 h-4 mr-2" />
                  Load All Customers
                </Button>
              </div>
            </div>
          ) : (
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
                    <TableHead>Last Activity</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {customers
                  .filter((customer) => {
                    // Filter by status
                    if (filters.status !== 'all') {
                      const dynamicStatus = customer.balance <= 0 ? 'cleared' : customer.status;
                      if (dynamicStatus !== filters.status) {
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
                        <TableCell colSpan={9} className="bg-gray-50 p-6">
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
                                      invoiceNumber: entry.invoiceNumber,
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
                                      invoiceNumber: transaction.invoiceNumber || transaction.transactionId || `CYL-${transaction._id?.toString().slice(-6)}`,
                                    }))
                                ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                                return allTransactions.length > 0 ? (
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Invoice Number</TableHead>
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
                                          <TableCell className="font-mono text-sm">
                                            {transaction.invoiceNumber || transaction.transactionId || 'N/A'}
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
                                        <TableHead>Action</TableHead>
                                        <TableHead>Items</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {filteredSales.map((sale) => {
                                        return (
                                          <TableRow key={sale._id}>
                                            <TableCell className="font-mono">{sale.invoiceNumber}</TableCell>
                                            <TableCell>{formatDate(sale.createdAt)}</TableCell>
                                            <TableCell>{formatCurrency(sale.totalAmount)}</TableCell>
                                            <TableCell>{formatCurrency(sale.receivedAmount ?? sale.amountPaid ?? 0)}</TableCell>
                                            <TableCell key={`${sale._id}-${sale.paymentStatus}`}>{getStatusBadge(sale.paymentStatus)}</TableCell>
                                            <TableCell>
                                              {String(sale.paymentStatus).toLowerCase() === 'pending' ? (
                                                <Button 
                                                  size="sm" 
                                                  variant="outline" 
                                                  onClick={() => openReceiveDialog({ 
                                                    id: String(sale._id), 
                                                    totalAmount: Number(sale.totalAmount || 0), 
                                                    currentReceived: Number(sale.receivedAmount ?? sale.amountPaid ?? 0),
                                                    kind: (sale as any)._source === 'admin' ? 'admin_sale' : 'sale'
                                                  })}
                                                  className="bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700"
                                                >
                                                  Receive Amount
                                                </Button>
                                              ) : (
                                                <Button 
                                                  size="sm" 
                                                  variant="ghost"
                                                  onClick={() => showPaymentDetails(sale, 'sale')}
                                                  className="text-blue-600 hover:bg-blue-50"
                                                >
                                                  See Details
                                                </Button>
                                              )}
                                            </TableCell>
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
                                        <TableHead>Invoice Number</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Cylinder Size</TableHead>
                                        <TableHead>Quantity</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Paid Amount</TableHead>
                                        <TableHead>Action</TableHead>
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
                                            <TableCell className="font-mono text-sm">
                                              {transaction.invoiceNumber || transaction.transactionId || `CYL-${transaction._id?.toString().slice(-6)}` || 'N/A'}
                                            </TableCell>
                                            <TableCell>{formatDate(transaction.createdAt)}</TableCell>
                                            <TableCell>{transaction.cylinderSize}</TableCell>
                                            <TableCell>{transaction.quantity}</TableCell>
                                            <TableCell>{formatCurrency(transaction.amount)}</TableCell>
                                            <TableCell>{formatCurrency(transaction.cashAmount || 0)}</TableCell>
                                            <TableCell>
                                              {String(transaction.status).toLowerCase() === 'pending' && String(transaction.type).toLowerCase() !== 'refill' ? (
                                                <Button size="sm" variant="outline" onClick={() => openReceiveDialog({ id: String(transaction._id), kind: 'cylinder', totalAmount: Number(transaction.amount || 0), currentReceived: Number(transaction.cashAmount || 0) })}>
                                                  Receive Amount
                                                </Button>
                                              ) : String(transaction.type).toLowerCase() !== 'refill' ? (
                                                <Button size="sm" variant="ghost" onClick={() => showPaymentDetails(transaction, 'cylinder')} className="text-blue-600 hover:bg-blue-50">
                                                  See Details
                                                </Button>
                                              ) : null}
                                            </TableCell>
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
                      <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                        No customers found matching the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
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
          useReceivingHeader
          onClose={() => setReceiptDialogData(null)}
        />
      )}

      {/* Receive Amount Dialog */}
      <Dialog open={receiveDialog.open} onOpenChange={(v) => (v ? null : closeReceiveDialog())}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Receive Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Amount Summary */}
            <div className="space-y-2 p-3 bg-gray-50 rounded-md">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Total Amount</span>
                <span className="font-medium">{formatCurrency(receiveDialog.totalAmount || 0)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Amount Received</span>
                <span className="font-medium">{formatCurrency(receiveDialog.currentReceived || 0)}</span>
              </div>
              <div className="flex items-center justify-between text-sm font-semibold">
                <span className="text-gray-700">Remaining Balance</span>
                <span className="text-blue-600">{formatCurrency(Math.max(0, Number(receiveDialog.totalAmount || 0) - Number(receiveDialog.currentReceived || 0)))}</span>
              </div>
            </div>

            {/* Payment Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount to Receive</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min={0}
                placeholder="0.00"
                value={receiveDialog.inputAmount}
                onChange={(e) => setReceiveDialog(prev => ({ ...prev, inputAmount: e.target.value }))}
                className="text-base"
              />
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={receiveDialog.paymentMethod === 'cash' ? 'default' : 'outline'}
                  className={`${receiveDialog.paymentMethod === 'cash' ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                  onClick={() => setReceiveDialog(prev => ({ ...prev, paymentMethod: 'cash' }))}
                >
                  Cash
                </Button>
                <Button
                  type="button"
                  variant={receiveDialog.paymentMethod === 'cheque' ? 'default' : 'outline'}
                  className={`${receiveDialog.paymentMethod === 'cheque' ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                  onClick={() => setReceiveDialog(prev => ({ ...prev, paymentMethod: 'cheque' }))}
                >
                  Cheque
                </Button>
              </div>

              {/* Cheque Details */}
              {receiveDialog.paymentMethod === 'cheque' && (
                <div className="space-y-3 pt-2 pl-2 border-l-2 border-l-blue-100">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="bankName">Bank Name</Label>
                      <Input
                        id="bankName"
                        placeholder="Bank name"
                        value={receiveDialog.bankName}
                        onChange={(e) => setReceiveDialog(prev => ({ ...prev, bankName: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="checkNumber">Check #</Label>
                      <Input
                        id="checkNumber"
                        placeholder="Check number"
                        value={receiveDialog.checkNumber}
                        onChange={(e) => setReceiveDialog(prev => ({ ...prev, checkNumber: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={closeReceiveDialog} className="px-6">
              Cancel
            </Button>
            <Button 
              onClick={submitReceiveAmount} 
              className="px-6"
              style={{ backgroundColor: "#2B3068" }}
            >
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DSR is now fully automated - no manual form needed */}



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

      {/* Payment Details Dialog */}
      <Dialog open={paymentDetailsDialog.open} onOpenChange={closePaymentDetails}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment Details</DialogTitle>
          </DialogHeader>
          {paymentDetailsDialog.data && (
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-500">Transaction</h4>
                <div className="flex justify-between">
                  <span className="text-sm">Invoice/Ref #</span>
                  <span className="font-medium">
                    {paymentDetailsDialog.data.invoiceNumber || paymentDetailsDialog.data._id?.substring(0, 8) || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Date</span>
                  <span className="font-medium">
                    {formatDate(paymentDetailsDialog.data.createdAt || new Date().toISOString())}
                  </span>
                </div>
                {paymentDetailsDialog.kind === 'sale' && (
                  <div className="flex justify-between">
                    <span className="text-sm">Total Amount</span>
                    <span className="font-medium">
                      {formatCurrency(paymentDetailsDialog.data.totalAmount || 0)}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-2 border-t">
                <h4 className="text-sm font-medium text-gray-500">Payment Information</h4>
                <div className="flex justify-between">
                  <span className="text-sm">Payment Method</span>
                  <span className="font-medium capitalize">
                    {paymentDetailsDialog.data.paymentMethod || 
                     (paymentDetailsDialog.data.bankName ? 'cheque' : 'cash')}
                  </span>
                </div>
                
                {/* Always show payment amount */}
                <div className="flex justify-between">
                  <span className="text-sm">Paid Amount</span>
                  <span className="font-medium text-green-600">
                    {formatCurrency(
                      paymentDetailsDialog.data.receivedAmount || 
                      paymentDetailsDialog.data.amountPaid || 
                      paymentDetailsDialog.data.cashAmount || 
                      0
                    )}
                  </span>
                </div>

                {/* Show cheque details if payment method is cheque or bankName exists */}
                {(paymentDetailsDialog.data.paymentMethod === 'cheque' || paymentDetailsDialog.data.bankName) && (
                  <div className="mt-2 pt-2 border-t">
                    <h4 className="text-xs font-medium text-gray-500 mb-1">Cheque Details</h4>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-sm">Bank Name</span>
                        <span className="font-medium text-right">
                          {paymentDetailsDialog.data.bankName || 'Not provided'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Check #</span>
                        <span className="font-medium">
                          {paymentDetailsDialog.data.checkNumber || 'Not provided'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-sm">Paid Amount</span>
                  <span className="font-medium text-green-600">
                    {formatCurrency(
                      paymentDetailsDialog.data.receivedAmount || 
                      paymentDetailsDialog.data.amountPaid || 
                      paymentDetailsDialog.data.cashAmount || 
                      0
                    )}
                  </span>
                </div>

                {paymentDetailsDialog.kind === 'sale' && (
                  <div className="flex justify-between">
                    <span className="text-sm">Payment Status</span>
                    <span>
                      {getStatusBadge(paymentDetailsDialog.data.paymentStatus || 'pending')}
                    </span>
                  </div>
                )}

                {paymentDetailsDialog.kind === 'cylinder' && (
                  <div className="flex justify-between">
                    <span className="text-sm">Status</span>
                    <span>
                      {getStatusBadge(paymentDetailsDialog.data.status || 'pending')}
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-4 flex justify-end">
                <Button 
                  variant="outline" 
                  onClick={closePaymentDetails}
                  className="px-6"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
