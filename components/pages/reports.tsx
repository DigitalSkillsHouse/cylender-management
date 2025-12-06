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
  const [filtersApplied, setFiltersApplied] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filteredSuggestions, setFilteredSuggestions] = useState<CustomerLedgerData[]>([])
  const [showSignatureDialog, setShowSignatureDialog] = useState(false)
  const [pendingCustomer, setPendingCustomer] = useState<CustomerLedgerData | null>(null)
  const [customerSignature, setCustomerSignature] = useState<string>("")
  const [receiptDialogData, setReceiptDialogData] = useState<any>(null)
  // Receive Amount dialog state for gas sales and cylinders
  const [receiveDialog, setReceiveDialog] = useState<{
    open: boolean
    targetId: string | null
    // kind: 'sale' (admin sale), 'employee_sale' (employee gas sale), or 'cylinder' (admin cylinder tx)
    kind: 'sale' | 'employee_sale' | 'cylinder'
    totalAmount: number
    currentReceived: number
    inputAmount: string
    method: 'cash' | 'cheque'
    bankName?: string
    chequeNumber?: string
  }>({ open: false, targetId: null, kind: 'sale', totalAmount: 0, currentReceived: 0, inputAmount: '', method: 'cash', bankName: '', chequeNumber: '' })

  // Pending receipt context for signature-first flow after Receive Amount
  const [pendingReceiptData, setPendingReceiptData] = useState<{ kind: 'sale' | 'employee_sale' | 'cylinder'; targetId: string } | null>(null)

  const openReceiveDialog = (opts: { id: string; totalAmount: number; currentReceived: number; kind?: 'sale' | 'employee_sale' | 'cylinder' }) => {
    setReceiveDialog({ open: true, targetId: opts.id, kind: opts.kind || 'sale', totalAmount: opts.totalAmount, currentReceived: opts.currentReceived, inputAmount: '', method: 'cash', bankName: '', chequeNumber: '' })
  }

  // Local record of last payment received per item (per kind)
  type PaymentRecord = { kind: 'sale' | 'employee_sale' | 'cylinder'; id: string; amount: number; method: 'cash' | 'cheque'; bankName?: string; chequeNumber?: string; newTotalReceived: number; at: string }
  const [paymentRecords, setPaymentRecords] = useState<Record<string, PaymentRecord>>({})
  const paymentKey = (kind: 'sale' | 'employee_sale' | 'cylinder', id: string) => `${kind}:${id}`
  const [showPaymentDetail, setShowPaymentDetail] = useState<PaymentRecord | null>(null)

  // Auto-calculate Closing Full/Empty for a given date (admin scope) and roll forward to next day openings
  const autoCalcAndSaveDsrForDate = async (date: string) => {
    try {
      if (!date) return
      // Build item set from products, existing entries and aggregates; also keep display names
      const byKey = new Map<string, DailyStockEntry>()
      dsrEntries.filter(e => e.date === date).forEach(e => byKey.set(normalizeName(e.itemName), e))
      const nameSet = new Set<string>()
      const nameToDisplay = new Map<string, string>()
      // Prefer product list names if present
      if (dsrProducts.length > 0) dsrProducts.forEach(p => {
        const k = normalizeName(p.name)
        nameSet.add(k)
        if (!nameToDisplay.has(k)) nameToDisplay.set(k, p.name)
      })
      // Existing entries for the date
      dsrEntries.filter(e => e.date === date).forEach(e => {
        const k = normalizeName(String(e.itemName))
        nameSet.add(k)
        if (!nameToDisplay.has(k)) nameToDisplay.set(k, e.itemName)
      })
      // Aggregates
      Object.keys(dailyAggGasSales || {}).forEach(k => nameSet.add(k))
      Object.keys(dailyAggCylinderSales || {}).forEach(k => nameSet.add(k))
      Object.keys(dailyAggRefills || {}).forEach(k => nameSet.add(k))
      Object.keys(dailyAggDeposits || {}).forEach(k => nameSet.add(k))
      Object.keys(dailyAggReturns || {}).forEach(k => nameSet.add(k))

      const items = Array.from(nameSet)
      if (items.length === 0) return

      // Build previous day's map to backfill today's openings
      const prevDate = new Date(date)
      prevDate.setDate(prevDate.getDate() - 1)
      const prevDateStr = prevDate.toISOString().slice(0, 10)
      const prevByKey = new Map<string, DailyStockEntry>()
      dsrEntries.filter(e => e.date === prevDateStr).forEach(e => prevByKey.set(normalizeName(e.itemName), e))

      // Compute closings per formula
      const computed: { itemName: string; closingFull: number; closingEmpty: number; openingFull: number; openingEmpty: number; refilled: number; cylinderSales: number; gasSales: number; deposit: number; ret: number }[] = []
      for (const key of items) {
        const rec = byKey.get(key)
        // Use real-time inventory data for opening stock, with fallbacks
        const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
        const openingFull = Number(rec?.openingFull ?? prevByKey.get(key)?.closingFull ?? inventoryInfo.availableFull ?? 0)
        const openingEmpty = Number(rec?.openingEmpty ?? prevByKey.get(key)?.closingEmpty ?? inventoryInfo.availableEmpty ?? 0)
        const refilled = Number((dailyAggRefills as any)?.[key] ?? rec?.refilled ?? 0)
        const cylinderSales = Number((dailyAggCylinderSales as any)?.[key] ?? rec?.cylinderSales ?? 0)
        const gasSales = Number((dailyAggGasSales as any)?.[key] ?? rec?.gasSales ?? 0)
        const deposit = Number((dailyAggDeposits as any)?.[key] ?? 0)
        const ret = Number((dailyAggReturns as any)?.[key] ?? 0)

        // Updated: Closing Full = (Opening Full + Refilled) - Gas Sales
        let closingFull = (openingFull + refilled) - gasSales
        if (closingFull < 0) closingFull = 0
        let closingEmpty = (openingFull + openingEmpty) - cylinderSales - deposit + ret - closingFull
        if (closingEmpty < 0) closingEmpty = 0

        const itemName = nameToDisplay.get(key) || rec?.itemName || key
        computed.push({ itemName, closingFull, closingEmpty, openingFull, openingEmpty, refilled, cylinderSales, gasSales, deposit, ret })
      }

      // Persist closings for the date (upsert)
      const saveResults = await Promise.all(computed.map(async (c) => {
        const payload: any = {
          date,
          itemName: c.itemName,
          closingFull: c.closingFull,
          closingEmpty: c.closingEmpty,
        }
        // include openings and during-day values if known, useful for upsert completeness
        payload.openingFull = c.openingFull
        payload.openingEmpty = c.openingEmpty
        payload.refilled = c.refilled
        payload.cylinderSales = c.cylinderSales
        payload.gasSales = c.gasSales
        try {
          const res = await fetch(API_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
          if (!res.ok) throw new Error('post failed')
          const json = await res.json().catch(() => ({}))
          return json?.data || payload
        } catch {
          return payload
        }
      }))

      // Roll forward: save next day's openings as today's closings
      const nextDate = new Date(date)
      nextDate.setDate(nextDate.getDate() + 1)
      const nextDateStr = nextDate.toISOString().slice(0, 10)
      await Promise.all(computed.map(async (c) => {
        const payload: any = {
          date: nextDateStr,
          itemName: c.itemName,
          openingFull: c.closingFull,
          openingEmpty: c.closingEmpty,
        }
        try {
          const res = await fetch(API_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
          if (!res.ok) throw new Error('post failed')
          return await res.json().catch(() => ({}))
        } catch {
          return null
        }
      }))

      // Merge into local state for current date rows
      const merged = [...dsrEntries]
      for (const d of saveResults as any[]) {
        const id = d._id || `${d.itemName}-${d.date}`
        const idx = merged.findIndex(x => x.itemName && normalizeName(x.itemName) === normalizeName(d.itemName) && x.date === d.date)
        const entry = {
          id,
          date: d.date,
          itemName: d.itemName,
          openingFull: Number(d.openingFull ?? byKey.get(normalizeName(d.itemName))?.openingFull ?? 0),
          openingEmpty: Number(d.openingEmpty ?? byKey.get(normalizeName(d.itemName))?.openingEmpty ?? 0),
          refilled: Number(d.refilled ?? 0),
          cylinderSales: Number(d.cylinderSales ?? 0),
          gasSales: Number(d.gasSales ?? 0),
          depositCylinder: Number(d.depositCylinder ?? 0),
          returnCylinder: Number(d.returnCylinder ?? 0),
          closingFull: Number(d.closingFull ?? 0),
          closingEmpty: Number(d.closingEmpty ?? 0),
          createdAt: d.createdAt || new Date().toISOString(),
        } as DailyStockEntry
        if (idx >= 0) merged[idx] = entry; else merged.unshift(entry)
      }
      setDsrEntries(merged)
      saveDsrLocal(merged)
      alert('Auto-calculated and saved closing stock for the selected date. Next day openings updated.')
    } catch (e) {
      alert('Failed to auto-calc. Please try again.')
    }
  }

  const closeReceiveDialog = () => {
    setReceiveDialog(prev => ({ ...prev, open: false, inputAmount: '', targetId: null }))
  }

  const submitReceiveAmount = async () => {
    if (!receiveDialog.targetId) return
    const add = Number.parseFloat(receiveDialog.inputAmount || '0')
    if (!Number.isFinite(add) || add <= 0) {
      alert('Enter a valid amount > 0')
      return
    }
    // If cheque is selected, require bank name and cheque number
    if (receiveDialog.method === 'cheque') {
      const bank = String(receiveDialog.bankName || '').trim()
      const chq = String(receiveDialog.chequeNumber || '').trim()
      if (!bank || !chq) {
        alert('Please enter Bank Name and Cheque Number')
        return
      }
    }
    const remaining = Math.max(0, Number(receiveDialog.totalAmount || 0) - Number(receiveDialog.currentReceived || 0))
    if (add > remaining) {
      alert(`Amount exceeds remaining balance. Remaining: ${remaining.toFixed(2)}`)
      return
    }
    const newReceived = Number(receiveDialog.currentReceived || 0) + add
    const newStatus = newReceived >= Number(receiveDialog.totalAmount || 0) ? 'cleared' : 'pending'
    try {
      let url = ''
      let body: any = {}
      if (receiveDialog.kind === 'cylinder') {
        url = `/api/cylinders/${receiveDialog.targetId}`
        body = { cashAmount: newReceived, status: newStatus }
      } else if (receiveDialog.kind === 'employee_sale') {
        url = `/api/employee-sales/${receiveDialog.targetId}`
        body = { receivedAmount: newReceived, paymentStatus: newStatus }
      } else {
        url = `/api/sales/${receiveDialog.targetId}`
        body = { receivedAmount: newReceived, paymentStatus: newStatus }
      }
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())

      // Try to refresh data without full reload (global helpers only; do not reload to preserve receipt flow)
      let usedRefreshHelpers = false
      try {
        const gd = (globalThis as any)?.fetchDashboard
        if (typeof gd === 'function') { await gd(); usedRefreshHelpers = true }
        const gc = (globalThis as any)?.fetchCustomers
        if (typeof gc === 'function') { await gc(); usedRefreshHelpers = true }
      } catch (e) {
      }

      // Soft refresh: re-fetch reports data so status/amounts update immediately
      try { await fetchReportsData() } catch {}

      // Close receive dialog first to avoid overlay conflicts
      // Record last payment details locally
      if (receiveDialog.targetId) {
        const rec: PaymentRecord = {
          kind: receiveDialog.kind,
          id: String(receiveDialog.targetId),
          amount: add,
          method: receiveDialog.method,
          bankName: receiveDialog.method === 'cheque' ? (receiveDialog.bankName || '') : undefined,
          chequeNumber: receiveDialog.method === 'cheque' ? (receiveDialog.chequeNumber || '') : undefined,
          newTotalReceived: newReceived,
          at: new Date().toISOString(),
        }
        setPaymentRecords(prev => ({ ...prev, [paymentKey(rec.kind, rec.id)]: rec }))
      }

      closeReceiveDialog()
      // Signature-first: store pending receipt context and open signature dialog
      setPendingReceiptData({ kind: receiveDialog.kind, targetId: String(receiveDialog.targetId) })
      setShowSignatureDialog(true)
      // Removed success alert to avoid interrupting receipt preview flow
    } catch (e: any) {
      alert(`Failed to update payment: ${e?.message || 'Unknown error'}`)
    }
  }

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
    depositCylinder: number
    returnCylinder: number
    closingFull?: number
    closingEmpty?: number
    createdAt: string
  }
  interface EmployeeLite { _id: string; name?: string; email?: string }
  
  // Download pending transactions PDF
  const downloadPendingTransactionsPdf = async () => {
    // Filter customers with pending transactions
    let pendingCustomers = customers.filter(customer => {
      // Check if customer has any pending transactions
      const hasPendingGasSales = customer.recentSales?.some((sale: any) => sale.paymentStatus === 'pending') || false;
      const hasPendingCylinders = customer.recentCylinderTransactions?.some((transaction: any) => transaction.status === 'pending') || false;
      return hasPendingGasSales || hasPendingCylinders;
    });

    // If a specific customer is selected, filter to only that customer
    if (filters.customerName.trim() !== '') {
      pendingCustomers = pendingCustomers.filter(customer => 
        customer.name.toLowerCase().includes(filters.customerName.toLowerCase()) ||
        customer.trNumber.toLowerCase().includes(filters.customerName.toLowerCase())
      );
    }

    if (pendingCustomers.length === 0) {
      const message = filters.customerName.trim() !== '' 
        ? `No pending transactions found for customer "${filters.customerName}".`
        : 'No pending transactions found for any customers.';
      alert(message);
      return;
    }

    // Load admin signature from localStorage
    const adminSignature = typeof window !== 'undefined' ? localStorage.getItem("adminSignature") : null;

    // Import jsPDF dynamically
    const jsPDFModule = await import("jspdf");
    const pdf = new (jsPDFModule as any).jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;

    try {
      // Add header image
      const headerImg = new Image();
      headerImg.crossOrigin = "anonymous";
      
      await new Promise<void>((resolve, reject) => {
        headerImg.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = headerImg.width;
            canvas.height = headerImg.height;
            
            if (ctx) {
              ctx.drawImage(headerImg, 0, 0);
              const headerImgData = canvas.toDataURL("image/png");
              
              const headerWidth = pageWidth - margin * 2;
              const headerHeight = (headerImg.height * headerWidth) / headerImg.width;
              
              pdf.addImage(headerImgData, "PNG", margin, margin, headerWidth, headerHeight);
            }
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        headerImg.onerror = () => reject(new Error("Failed to load header image"));
        headerImg.src = "/images/Customer-Ledger-header.jpg";
      });

      // Add report title and info
      let currentY = margin + 60; // Start below header image
      
      
      currentY += 10;
      pdf.setFontSize(10);
      pdf.setFont(undefined, 'normal');
      pdf.text(`Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, pageWidth / 2, currentY, { align: "center" });
      
      currentY += 6;
      const filterText = filters.customerName.trim() !== '' 
        ? `Customer Filter: ${filters.customerName}`
        : `All Customers with Pending Transactions`;
      pdf.text(filterText, pageWidth / 2, currentY, { align: "center" });
      
      currentY += 6;
      pdf.text(`Total Customers: ${pendingCustomers.length}`, pageWidth / 2, currentY, { align: "center" });
      
      currentY += 15;

      let grandTotal = 0;

      // Process each customer
      for (const customer of pendingCustomers) {
        // Get pending gas sales
        const pendingGasSales = customer.recentSales?.filter((sale: any) => sale.paymentStatus === 'pending') || [];
        
        // Get pending cylinder transactions
        const pendingCylinders = customer.recentCylinderTransactions?.filter((transaction: any) => transaction.status === 'pending') || [];

        // Calculate customer total
        const gasSalesTotal = pendingGasSales.reduce((sum: number, sale: any) => sum + (Number(sale.totalAmount) || 0), 0);
        const cylindersTotal = pendingCylinders.reduce((sum: number, transaction: any) => sum + (Number(transaction.amount) || 0), 0);
        const customerTotal = gasSalesTotal + cylindersTotal;
        grandTotal += customerTotal;

        // Check if we need a new page
        if (currentY > pageHeight - 80) {
          pdf.addPage();
          currentY = margin + 20;
        }

        // Customer header
        pdf.setFillColor(248, 249, 250); // Light gray background
        pdf.rect(margin, currentY, pageWidth - margin * 2, 15, 'F');
        
        pdf.setFontSize(12);
        pdf.setTextColor(43, 48, 104); // #2B3068
        pdf.setFont(undefined, 'bold');
        pdf.text(customer.name, margin + 5, currentY + 8);
        
        pdf.setFontSize(9);
        pdf.setFont(undefined, 'normal');
        pdf.setTextColor(102, 102, 102);
        pdf.text(`TR Number: ${customer.trNumber}`, margin + 5, currentY + 12);
        
        currentY += 20;

        if (pendingGasSales.length > 0 || pendingCylinders.length > 0) {
          // Table header
          pdf.setFillColor(241, 243, 244); // Light gray
          pdf.rect(margin, currentY, pageWidth - margin * 2, 8, 'F');
          
          pdf.setFontSize(9);
          pdf.setTextColor(0, 0, 0);
          pdf.setFont(undefined, 'bold');
          pdf.text('Date', margin + 2, currentY + 5);
          pdf.text('Invoice Number', margin + 35, currentY + 5);
          pdf.text('Reference Name', margin + 80, currentY + 5);
          pdf.text('Amount (AED)', pageWidth - margin - 25, currentY + 5, { align: 'right' });
          
          currentY += 10;

          // Add gas sales
          pendingGasSales.forEach((sale: any) => {
            const date = new Date(sale.createdAt).toLocaleDateString();
            const invoiceNumber = sale.invoiceNumber || 'N/A';
            // Get employee name properly - check if sale is from employee and get name
            let createdBy = 'Admin';
            if (sale.employee && sale.employee.name) {
              createdBy = sale.employee.name;
            } else if (sale.saleSource === 'employee' || sale._saleSource === 'employee') {
              // Employee sale but name not available
              createdBy = 'Employee';
            }
            const amount = Number(sale.totalAmount) || 0;

            pdf.setFont(undefined, 'normal');
            pdf.setFontSize(8);
            pdf.text(date, margin + 2, currentY + 4);
            pdf.text(invoiceNumber, margin + 35, currentY + 4);
            pdf.text(createdBy, margin + 80, currentY + 4);
            pdf.text(formatCurrency(amount), pageWidth - margin - 2, currentY + 4, { align: 'right' });
            
            currentY += 6;
          });

          // Add cylinder transactions
          pendingCylinders.forEach((transaction: any) => {
            const date = new Date(transaction.createdAt).toLocaleDateString();
            const invoiceNumber = transaction.invoiceNumber || transaction.transactionId || 'N/A';
            // Get employee name properly - employee should be populated with name from API
            let createdBy = 'Admin';
            if (transaction.employee && transaction.employee.name) {
              createdBy = transaction.employee.name;
            }
            const amount = Number(transaction.amount) || 0;

            pdf.setFont(undefined, 'normal');
            pdf.setFontSize(8);
            pdf.text(date, margin + 2, currentY + 4);
            pdf.text(invoiceNumber, margin + 35, currentY + 4);
            pdf.text(createdBy, margin + 80, currentY + 4);
            pdf.text(formatCurrency(amount), pageWidth - margin - 2, currentY + 4, { align: 'right' });
            
            currentY += 6;
          });

          // Customer total
          pdf.setFillColor(232, 244, 253); // Light blue
          pdf.rect(margin, currentY, pageWidth - margin * 2, 8, 'F');
          
          pdf.setFont(undefined, 'bold');
          pdf.setFontSize(9);
          pdf.setTextColor(43, 48, 104);
          pdf.text('Customer Total:', margin + 80, currentY + 5);
          pdf.text(formatCurrency(customerTotal), pageWidth - margin - 2, currentY + 5, { align: 'right' });
          
          currentY += 12;
        } else {
          pdf.setFontSize(9);
          pdf.setTextColor(153, 153, 153);
          pdf.text('No pending transactions found for this customer.', pageWidth / 2, currentY + 10, { align: 'center' });
          currentY += 20;
        }

        currentY += 10; // Space between customers
      }

      // Add grand total
      if (currentY > pageHeight - 40) {
        pdf.addPage();
        currentY = margin + 20;
      }

      pdf.setFillColor(248, 249, 250);
      pdf.setDrawColor(43, 48, 104);
      pdf.setLineWidth(1);
      pdf.rect(margin, currentY, pageWidth - margin * 2, 15, 'FD');
      
      pdf.setFontSize(14);
      pdf.setTextColor(43, 48, 104);
      pdf.setFont(undefined, 'bold');
      pdf.text(`Grand Total: ${formatCurrency(grandTotal)}`, pageWidth - margin - 5, currentY + 10, { align: 'right' });

      // Add footer image and admin signature
      const footerY = pageHeight - 60;
      
      const footerImg = new Image();
      footerImg.crossOrigin = "anonymous";
      
      await new Promise<void>((resolve, reject) => {
        footerImg.onload = async () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = footerImg.width;
            canvas.height = footerImg.height;
            
            if (ctx) {
              ctx.drawImage(footerImg, 0, 0);
              const footerImgData = canvas.toDataURL("image/png");
              
              const footerWidth = pageWidth - margin * 2;
              const actualFooterHeight = (footerImg.height * footerWidth) / footerImg.width;
              
              pdf.addImage(footerImgData, "PNG", margin, footerY, footerWidth, actualFooterHeight);
              
              // Add admin signature on bottom right of footer image
              if (adminSignature) {
                try {
                  await new Promise<void>((sigResolve, sigReject) => {
                    const signatureImg = new Image();
                    signatureImg.crossOrigin = "anonymous";
                    signatureImg.onload = () => {
                      try {
                        const sigCanvas = document.createElement('canvas');
                        const sigCtx = sigCanvas.getContext('2d');
                        
                        const aspectRatio = signatureImg.width / signatureImg.height;
                        sigCanvas.width = 120;
                        sigCanvas.height = 120 / aspectRatio;
                        
                        if (sigCtx) {
                          sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
                          sigCtx.drawImage(signatureImg, 0, 0, sigCanvas.width, sigCanvas.height);
                          
                          // Process signature to remove background
                          const imageData = sigCtx.getImageData(0, 0, sigCanvas.width, sigCanvas.height);
                          const data = imageData.data;
                          
                          for (let i = 0; i < data.length; i += 4) {
                            const r = data[i];
                            const g = data[i + 1];
                            const b = data[i + 2];
                            
                            const brightness = (r + g + b) / 3;
                            if (brightness > 200) {
                              data[i + 3] = 0; // Make transparent
                            } else {
                              data[i] = Math.max(0, r - 50);
                              data[i + 1] = Math.max(0, g - 50);
                              data[i + 2] = Math.max(0, b - 50);
                              data[i + 3] = 255;
                            }
                          }
                          
                          sigCtx.putImageData(imageData, 0, 0);
                          const sigImgData = sigCanvas.toDataURL("image/png");
                          
                          const sigWidth = 30;
                          const sigHeight = 30 / aspectRatio;
                          const sigX = pageWidth - margin - sigWidth - 8;
                          const sigY = footerY + actualFooterHeight - sigHeight - 8;
                          
                          pdf.addImage(sigImgData, "PNG", sigX, sigY, sigWidth, sigHeight);
                        }
                        sigResolve();
                      } catch (err) {
                        console.warn("Failed to add signature image:", err);
                        sigReject(err);
                      }
                    };
                    signatureImg.onerror = () => {
                      console.warn("Failed to load admin signature image");
                      sigReject(new Error("Failed to load signature"));
                    };
                    signatureImg.src = adminSignature;
                  });
                } catch (sigError) {
                  console.warn("Signature loading failed:", sigError);
                  // Add text fallback
                  pdf.setFontSize(8);
                  pdf.setTextColor(43, 48, 104);
                  pdf.setFont(undefined, 'bold');
                  pdf.text("Admin Signature", pageWidth - margin - 30, footerY + actualFooterHeight - 8, { align: "center" });
                }
              } else {
                // Add text-based admin signature
                pdf.setFontSize(8);
                pdf.setTextColor(43, 48, 104);
                pdf.setFont(undefined, 'bold');
                pdf.text("Admin Signature", pageWidth - margin - 30, footerY + actualFooterHeight - 8, { align: "center" });
              }
            }
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        footerImg.onerror = () => reject(new Error("Failed to load footer image"));
        footerImg.src = "/images/Footer-qoute-paper.jpg";
      });

      // Save the PDF
      const dt = new Date();
      const stamp = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      pdf.save(`pending-transactions-${stamp}.pdf`);

    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    }
  };


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
        const arr = Array.from(nameSet)
        return arr.map((n, i) => ({ _id: String(i), name: n } as any))
      })()
      const rows = rowsSource.map(p => {
        const key = normalizeName(p.name)
        const e = byKey.get(key)
        
        // Use real-time aggregation data (like employee system) instead of stored values
        const refilledVal = dailyAggRefills[key] ?? (e ? e.refilled : 0)
        const cylSalesVal = dailyAggCylinderSales[key] ?? (e ? e.cylinderSales : 0)
        const gasSalesVal = dailyAggGasSales[key] ?? (e ? e.gasSales : 0)
        const depositVal = dailyAggDeposits[key] ?? (e ? e.depositCylinder : 0)
        const returnVal = dailyAggReturns[key] ?? (e ? e.returnCylinder : 0)
        // Use real-time inventory data for opening stock in PDF
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

  const [showDSRList, setShowDSRList] = useState(false)
  const [showDSRView, setShowDSRView] = useState(false)
  const [dsrEntries, setDsrEntries] = useState<DailyStockEntry[]>([])
  const [dsrViewDate, setDsrViewDate] = useState<string>(new Date().toISOString().slice(0, 10))
  // Products for DSR grid
  interface ProductLite { _id: string; name: string }
  const [dsrProducts, setDsrProducts] = useState<ProductLite[]>([])
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
  // New: Deposit and Return cylinder aggregates (by name and by ID)
  const [dailyAggDeposits, setDailyAggDeposits] = useState<Record<string, number>>({})
  const [dailyAggReturns, setDailyAggReturns] = useState<Record<string, number>>({})
  const [dailyAggDepositsById, setDailyAggDepositsById] = useState<Record<string, number>>({})
  const [dailyAggReturnsById, setDailyAggReturnsById] = useState<Record<string, number>>({})
  // Aggregation readiness flag
  const [aggReady, setAggReady] = useState<boolean>(false)
  
  // Automated inventory data fetching for DSR
  const [inventoryData, setInventoryData] = useState<Record<string, { availableFull: number; availableEmpty: number; currentStock: number }>>({})
  
  // Fetch real-time inventory data for automated DSR
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
      
      // Set only cylinder products for DSR display, but keep all data for other purposes
      const cylinderProducts = products.filter((product: any) => product.category === 'cylinder')
      setDsrProducts(cylinderProducts.map((p: any) => ({ _id: p._id, name: p.name })))
      
      const inventoryMap: Record<string, { availableFull: number; availableEmpty: number; currentStock: number }> = {}
      
      // Map ALL inventory items by product name using consistent normalization
      inventoryItems.forEach((item: any) => {
        if (item.productName) {
          const normalizedName = normalizeName(item.productName)
          inventoryMap[normalizedName] = {
            availableFull: item.availableFull || 0,
            availableEmpty: item.availableEmpty || 0,
            currentStock: item.currentStock || 0
          }
        }
      })
      
      // Also map ALL products by name for fallback using consistent normalization
      products.forEach((product: any) => {
        if (product.name) {
          const normalizedName = normalizeName(product.name)
          if (!inventoryMap[normalizedName]) {
            inventoryMap[normalizedName] = {
              availableFull: product.availableFull || 0,
              availableEmpty: product.availableEmpty || 0,
              currentStock: product.currentStock || 0
            }
          }
        }
      })
      
      setInventoryData(inventoryMap)
      
      // Debug: Log inventory mapping for troubleshooting
      console.log('Admin DSR Inventory Mapping:', {
        inventoryMapKeys: Object.keys(inventoryMap),
        inventoryMap: inventoryMap,
        sampleNormalization: {
          'Cylinders amonia 60kg': normalizeName('Cylinders amonia 60kg'),
          'Cylinders PROPANE 44KG': normalizeName('Cylinders PROPANE 44KG')
        }
      })
    } catch (error) {
      console.error('Failed to fetch inventory data:', error)
      setInventoryData({})
      setDsrProducts([])
    }
  }
  
  // Fetch purchase orders for refilling data
  const fetchRefillData = async (date: string) => {
    try {
      const res = await fetch('/api/purchase-orders', { cache: 'no-store' })
      const json = await res.json()
      const purchaseOrders = Array.isArray(json?.data) ? json.data : []
      
      const refillMap: Record<string, number> = {}
      const selectedDate = new Date(date)
      
      purchaseOrders.forEach((order: any) => {
        const orderDate = new Date(order.purchaseDate || order.createdAt)
        if (orderDate.toDateString() === selectedDate.toDateString()) {
          if (Array.isArray(order.items)) {
            order.items.forEach((item: any) => {
              if (item.purchaseType === 'cylinder' && item.cylinderStatus === 'full') {
                const productName = item.product?.name || 'Unknown'
                const key = productName.toLowerCase()
                refillMap[key] = (refillMap[key] || 0) + (item.quantity || 0)
              }
            })
          }
        }
      })
      
      return refillMap
    } catch (error) {
      console.error('Failed to fetch refill data:', error)
      return {}
    }
  }
  
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
        setEmployees([])
      } finally {
        setEmpLoading(false)
      }
    }
    if (showEmployeeDSR) loadEmployees()
  }, [showEmployeeDSR])
  
  // Fetch inventory data when DSR view opens or date changes
  useEffect(() => {
    if (showDSRView) {
      fetchInventoryData()
    }
  }, [showDSRView, dsrViewDate])

  // Fetch per-employee DSR for selected date and build grid rows
  const loadEmployeeDsr = async () => {
    if (!selectedEmployeeId || !employeeDsrDate) return
    try {
      setEmpLoading(true)
      
      // Fetch stored DSR records (for opening/closing values)
      const storedDsrUrl = new URL('/api/employee-daily-stock-reports', window.location.origin)
      storedDsrUrl.searchParams.set('employeeId', selectedEmployeeId)
      storedDsrUrl.searchParams.set('date', employeeDsrDate)
      const storedDsrRes = await fetch(storedDsrUrl.toString(), { cache: 'no-store' })
      const storedDsrJson = await storedDsrRes.json()
      const storedList: any[] = Array.isArray(storedDsrJson)
        ? storedDsrJson
        : Array.isArray(storedDsrJson?.data?.data)
          ? storedDsrJson.data.data
          : Array.isArray(storedDsrJson?.data)
            ? storedDsrJson.data
            : []
      
      // Fetch actual employee transaction data for the date
      const [salesRes, cylinderRes, refillRes] = await Promise.all([
        fetch(`/api/daily-employee-sales?employeeId=${selectedEmployeeId}&date=${employeeDsrDate}`, { cache: 'no-store' }),
        fetch(`/api/daily-employee-cylinder-aggregation?employeeId=${selectedEmployeeId}&date=${employeeDsrDate}`, { cache: 'no-store' }),
        fetch(`/api/daily-refills?employeeId=${selectedEmployeeId}&date=${employeeDsrDate}`, { cache: 'no-store' })
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
      
      // Get all unique product names from both sources
      const allProductNames = new Set<string>()
      storedList.forEach((d: any) => {
        if (d.itemName) allProductNames.add(d.itemName)
      })
      transactionMap.forEach((_, itemName) => {
        allProductNames.add(itemName)
      })
      
      const mapped: DailyStockEntry[] = Array.from(allProductNames).map((itemName) => {
        const stored = storedMap.get(itemName.toLowerCase())
        const transactions = transactionMap.get(itemName) || {
          refilled: 0,
          fullCylinderSales: 0,
          emptyCylinderSales: 0,
          gasSales: 0,
          deposits: 0,
          returns: 0
        }
        
        // Use stored values for opening/closing, but use actual transaction data for "during the day" activities
        return {
          id: String(stored?._id || `${itemName}-${employeeDsrDate}`),
          date: employeeDsrDate,
          itemName: itemName,
          openingFull: Number(stored?.openingFull || 0),
          openingEmpty: Number(stored?.openingEmpty || 0),
          refilled: transactions.refilled || Number(stored?.refilled || 0),
          cylinderSales: transactions.fullCylinderSales || Number(stored?.cylinderSales || 0),
          gasSales: transactions.gasSales || Number(stored?.gasSales || 0),
          depositCylinder: transactions.deposits || Number(stored?.depositCylinder || 0),
          returnCylinder: transactions.returns || Number(stored?.returnCylinder || 0),
          closingFull: typeof stored?.closingFull === 'number' ? stored.closingFull : undefined,
          closingEmpty: typeof stored?.closingEmpty === 'number' ? stored.closingEmpty : undefined,
          createdAt: stored?.createdAt || new Date().toISOString(),
        }
      })
      
      setEmployeeDsrEntries(mapped)

      const rowsSource = (dsrProducts.length > 0 ? dsrProducts : Array.from(allProductNames).map((n, i) => ({ _id: String(i), name: n } as any)))
      const byKey = new Map<string, DailyStockEntry>()
      mapped.forEach(e => byKey.set(e.itemName.toLowerCase(), e))
      const rows = rowsSource.map((p: any) => {
        const e = byKey.get(String(p.name).toLowerCase())
        const key = normalizeName(p.name)
        const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
        
        return {
          itemName: p.name,
          openingFull: e?.openingFull ?? inventoryInfo.availableFull,
          openingEmpty: e?.openingEmpty ?? inventoryInfo.availableEmpty,
          refilled: e ? e.refilled : 0,
          cylinderSales: e ? e.cylinderSales : 0,
          gasSales: e ? e.gasSales : 0,
          closingFull: typeof e?.closingFull === 'number' ? e!.closingFull : undefined,
          closingEmpty: typeof e?.closingEmpty === 'number' ? e!.closingEmpty : undefined,
        }
      })
      setEmpGridRows(rows)
    } catch (e) {
      console.error('Error loading employee DSR:', e)
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
        const key = normalizeName(p.name)
        const inventoryInfo = inventoryData[key] || { availableFull: 0, availableEmpty: 0, currentStock: 0 }
        const openingFull = e?.openingFull ?? inventoryInfo.availableFull
        const openingEmpty = e?.openingEmpty ?? inventoryInfo.availableEmpty
        
        return `
          <tr>
            <td>${p.name}</td>
            <td>${openingFull}</td>
            <td>${openingEmpty}</td>
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
          <td>${typeof e.openingEmpty === 'number' ? e.openingEmpty : ''}</td>
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
    } catch (err) {
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
        depositCylinder: Number(d.depositCylinder || 0),
        returnCylinder: Number(d.returnCylinder || 0),
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

  // Load inventory data when DSR view opens
  useEffect(() => {
    if (showDSRView) {
      fetchInventoryData()
    }
  }, [showDSRView])

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
        // Fetch ADMIN-ONLY data sources: Admin sales, Cylinders, Admin refills, Products, Daily Sales, Daily Cylinder Transactions
        const [salesRes, cylTxRes, adminRefillsRes, productsRes, dailySalesRes, dailyCylinderRes] = await Promise.all([
          fetch('/api/sales', { cache: 'no-store' }),
          fetch('/api/cylinders', { cache: 'no-store' }),
          fetch(`/api/daily-refills?date=${dsrViewDate}`, { cache: 'no-store' }), // Admin refills only (employeeId: null)
          fetch('/api/products', { cache: 'no-store' }),
          fetch(`/api/daily-sales?date=${dsrViewDate}`, { cache: 'no-store' }), // Admin daily sales tracking
          fetch(`/api/daily-cylinder-transactions?date=${dsrViewDate}&isEmployeeTransaction=false`, { cache: 'no-store' }) // Admin cylinder transactions only
        ])
        const salesJson = await salesRes.json()
        const cylTxJson = await cylTxRes.json()
        const adminRefillsJson = await adminRefillsRes.json()
        const productsJson = await productsRes.json()
        const dailySalesJson = await dailySalesRes.json()
        const dailyCylinderJson = await dailyCylinderRes.json()
        
        // Parse products data
        const products = Array.isArray(productsJson?.data?.data) ? productsJson.data.data : 
                        Array.isArray(productsJson?.data) ? productsJson.data : 
                        Array.isArray(productsJson) ? productsJson : []

        const gas: Record<string, number> = {}
        const gasById: Record<string, number> = {}
        const cyl: Record<string, number> = {}
        const cylById: Record<string, number> = {}
        const ref: Record<string, number> = {}
        const refById: Record<string, number> = {}
        const dep: Record<string, number> = {}
        const depById: Record<string, number> = {}
        const ret: Record<string, number> = {}
        const retById: Record<string, number> = {}

        // Admin sales only (employee sales handled separately in "View Employee Daily Stock Report")
        const salesList: any[] = Array.isArray(salesJson?.data) ? salesJson.data : (Array.isArray(salesJson) ? salesJson : [])
        for (const s of salesList) {
          if (!inSelectedDay(s?.createdAt)) continue
          const items: any[] = Array.isArray(s?.items) ? s.items : []
          for (const it of items) {
            const product = it?.product
            const name = product?.name || ''
            const pid = product?._id
            const qty = Number(it?.quantity) || 0
            const category = product?.category || ''
            
            if (category === 'gas') { 
              // For gas sales, attribute to the cylinder that contains the gas
              const cylinderProductId = it?.cylinderProductId
              if (cylinderProductId) {
                // Find the cylinder product name from the sales item
                const cylinderName = it?.cylinderName || 'Unknown Cylinder'
                inc(gas, cylinderName, qty)
                incId(gasById, cylinderProductId, qty)
              } else {
                // Fallback: use gas product name if no cylinder info
                inc(gas, name, qty)
                incId(gasById, pid, qty)
              }
            }
            else if (category === 'cylinder') { 
              // Cylinder sales are now tracked via daily tracking system (see dailyCylinderList processing below)
              // This section is kept for backward compatibility but daily tracking takes precedence
              console.log(`Admin DSR: Cylinder sale found in sales data: ${name} - ${qty} (status: ${it?.cylinderStatus || 'unknown'})`)
              console.log(`Note: Cylinder sales are now tracked via daily tracking system for better accuracy`)
            }
          }
        }

        // Admin DSR only includes admin sales, not employee sales

        // Admin refills only (employee refills tracked separately in Employee DSR)
        const adminRefills: any[] = Array.isArray(adminRefillsJson?.data) ? adminRefillsJson.data : []
        
        console.log(`Admin DSR: Processing ${adminRefills.length} admin refill entries for ${dsrViewDate}`)
        
        for (const refillEntry of adminRefills) {
          const cylinderName = refillEntry.cylinderName || ''
          const cylinderProductId = refillEntry.cylinderProductId || ''
          const quantity = Number(refillEntry.todayRefill) || 0
          
          if (quantity > 0) {
            inc(ref, cylinderName, quantity)
            incId(refById, cylinderProductId, quantity)
            console.log(`Admin DSR Refill: ${cylinderName} - ${quantity} cylinders refilled today`)
          }
        }

        // Legacy cylinder transaction processing as fallback (with multi-item support)
        const cylTxList: any[] = Array.isArray(cylTxJson?.data) ? cylTxJson.data : (Array.isArray(cylTxJson) ? cylTxJson : [])
        console.log(`Admin DSR: Processing ${cylTxList.length} legacy cylinder transactions for ${dsrViewDate}`)
        
        for (const t of cylTxList) {
          if (!inSelectedDay(t?.createdAt)) continue
          const type = String(t?.type || '').toLowerCase()
          
          // Process multi-item transactions properly
          if (Array.isArray(t?.items) && t.items.length > 0) {
            // Multi-item: process each item individually
            for (const item of t.items) {
              const name = item?.productName || ''
              const pid = item?.productId
              const qty = Number(item?.quantity) || 0
              if (type === 'deposit') {
                inc(dep, name, qty)
                incId(depById, pid, qty)
              } else if (type === 'return') {
                inc(ret, name, qty)
                incId(retById, pid, qty)
              }
            }
          } else {
            // Single item: use main transaction fields
            const name = t?.product?.name || ''
            const pid = t?.product?._id
            const qty = Number(t?.quantity) || 0
            if (type === 'deposit') {
              inc(dep, name, qty)
              incId(depById, pid, qty)
            } else if (type === 'return') {
              inc(ret, name, qty)
              incId(retById, pid, qty)
            }
          }
        }

        // Enhanced Daily Sales - More accurate tracking from new system
        const dailySalesList: any[] = Array.isArray(dailySalesJson?.data) ? dailySalesJson.data : []
        
        console.log(`Admin DSR: Processing ${dailySalesList.length} ADMIN daily sales entries for ${dsrViewDate}`)
        console.log('Admin DSR: Daily sales data sample:', dailySalesList.slice(0, 3))
        console.log('Admin DSR: Full daily sales response:', dailySalesJson)
        
        // Process daily sales for all types
        for (const dailyEntry of dailySalesList) {
          const productName = dailyEntry.productName || ''
          const productId = dailyEntry.productId || ''
          const category = dailyEntry.category || ''
          
          if (category === 'cylinder') {
            // Full cylinder sales (direct cylinder sales)
            const fullCylinderSalesQty = Number(dailyEntry.fullCylinderSalesQuantity) || 0
            if (fullCylinderSalesQty > 0) {
              inc(cyl, productName, fullCylinderSalesQty)
              incId(cylById, productId, fullCylinderSalesQty)
              console.log(`Admin DSR Daily Full Cylinder Sales: ${productName} - ${fullCylinderSalesQty} full cylinders sold`)
            }
            
            // Gas sales (gas sold from cylinders) - tracked by cylinder
            const gasSalesQty = Number(dailyEntry.gasSalesQuantity) || 0
            if (gasSalesQty > 0) {
              inc(gas, productName, gasSalesQty)
              incId(gasById, productId, gasSalesQty)
              console.log(`Admin DSR Daily Gas Sales: ${productName} - ${gasSalesQty} gas units sold`)
            }
          }
        }

        // Process daily cylinder transactions for deposits and returns
        const dailyCylinderList: any[] = Array.isArray(dailyCylinderJson?.data) ? dailyCylinderJson.data : []
        
        console.log(`Admin DSR: Processing ${dailyCylinderList.length} ADMIN daily cylinder transactions for ${dsrViewDate}`)
        
        for (const dailyEntry of dailyCylinderList) {
          const cylinderName = dailyEntry.cylinderName || ''
          const cylinderProductId = dailyEntry.cylinderProductId || ''
          const depositQty = Number(dailyEntry.depositQuantity) || 0
          const returnQty = Number(dailyEntry.returnQuantity) || 0
          
          if (depositQty > 0) {
            inc(dep, cylinderName, depositQty)
            incId(depById, cylinderProductId, depositQty)
            console.log(`Admin DSR Daily Deposit: ${cylinderName} - ${depositQty} cylinders deposited today`)
          }
          
          if (returnQty > 0) {
            inc(ret, cylinderName, returnQty)
            incId(retById, cylinderProductId, returnQty)
            console.log(`Admin DSR Daily Return: ${cylinderName} - ${returnQty} cylinders returned today`)
          }
          
          // Full cylinder sales from daily tracking
          const fullCylinderSalesQty = Number(dailyEntry.fullCylinderSalesQuantity) || 0
          if (fullCylinderSalesQty > 0) {
            inc(cyl, cylinderName, fullCylinderSalesQty)
            incId(cylById, cylinderProductId, fullCylinderSalesQty)
            console.log(`Admin DSR Daily Full Cylinder Sales (ADMIN-ONLY): ${cylinderName} - ${fullCylinderSalesQty} full cylinders sold today`)
          }
        }

        // Debug: Log final aggregation results
        console.log('Admin DSR Final Aggregations:', {
          deposits: dep,
          returns: ret,
          refills: ref,
          cylinderSales: cyl,
          gasSales: gas
        })
        
        // Debug: Log individual data sources
        console.log('Admin DSR Data Sources:', {
          adminRefillsCount: adminRefills.length,
          dailyCylinderCount: dailyCylinderList.length,
          dailySalesCount: dailySalesList.length,
          salesCount: salesList.length,
          cylTxCount: cylTxList.length
        })

        setDailyAggGasSales(gas)
        setDailyAggCylinderSales(cyl)
        setDailyAggRefills(ref)
        setDailyAggDeposits(dep)
        setDailyAggReturns(ret)
        setDailyAggGasSalesById(gasById)
        setDailyAggCylinderSalesById(cylById)
        setDailyAggRefillsById(refById)
        setDailyAggDepositsById(depById)
        setDailyAggReturnsById(retById)
        setAggReady(true)
      } catch (err) {
        setDailyAggGasSales({})
        setDailyAggCylinderSales({})
        setDailyAggRefills({})
        setDailyAggDeposits({})
        setDailyAggReturns({})
        setDailyAggGasSalesById({})
        setDailyAggCylinderSalesById({})
        setDailyAggRefillsById({})
        setDailyAggDepositsById({})
        setDailyAggReturnsById({})
        setAggReady(false)
      }
    })()
  }, [dsrViewDate])

  const parseNum = (v: string) => {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }


  const clearDsr = () => {
    if (!confirm("Clear all Daily Stock Reports?")) return
    setDsrEntries([])
    saveDsrLocal([])
  }


  // Signature dialog handlers
  const handleSignatureCancel = () => {
    setShowSignatureDialog(false)
    setPendingCustomer(null)
    setCustomerSignature("")
  }

  const handleSignatureComplete = (signature: string) => {
    // Save signature and close dialog
    setCustomerSignature(signature)
    setShowSignatureDialog(false)

    // If invoked from Receive Amount flow, fetch record and open receipt with signature
    if (pendingReceiptData) {
      const { kind, targetId } = pendingReceiptData
      // Route to correct API to fetch updated record with populated customer
      const getUrl = kind === 'cylinder'
        ? `/api/cylinders/${targetId}`
        : (kind === 'employee_sale'
            ? `/api/employee-sales/${targetId}`
            : `/api/sales/${targetId}`)

      const buildReceiptFromSource = (srcRaw: any) => {
        const isCylinder = kind === 'cylinder'
        // Unwrap axios/fetch JSON shape: many APIs return { data: record }
        const src = srcRaw?.data ?? srcRaw
        // Attempt to resolve customer fields from API record, falling back to ledger customers
        const srcCustomer = src?.customer
        const custId = typeof srcCustomer === 'string' ? srcCustomer : (srcCustomer?._id || src?.customerId || '')
        const ledgerCust = customers.find((c) => c._id === custId) ||
                           customers.find((c) => (c.name || '').toLowerCase() === (src?.customerName || '').toLowerCase())
        const customerName = (srcCustomer?.name) || src?.customerName || ledgerCust?.name || '-'
        const customerPhone = (srcCustomer?.phone) || src?.customerPhone || ledgerCust?.phone || '-'
        const customerAddress = (srcCustomer?.address) || src?.customerAddress || ledgerCust?.address || '-'
        const createdAt = src?.createdAt || new Date().toISOString()
        const invoiceNumber = src?.invoiceNumber || src?._id || String(targetId)
        // Prefer explicit totals, fallback to amount, then to the dialog's totalAmount snapshot
        const amountTotal = Number(src?.totalAmount ?? src?.amount ?? receiveDialog.totalAmount ?? 0)
        const paymentMethod = (src?.paymentMethod || src?.method || '-').toString()
        const paymentStatus = (src?.paymentStatus || src?.status || '').toString()
        const type = (src?.type || '').toString()

        let items: any[] = []
        if (Array.isArray(src?.items) && src.items.length > 0) {
          items = src.items.map((it: any) => {
            const qty = Number(it?.quantity || 1)
            // Compute unit price robustly (avoid mixing ?? with || without parens)
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
          // Cylinder transactions typically don't have items; build a single line with proper qty and unit
          const qty = Number(src?.quantity || 1)
          const unit = (qty > 0) ? (amountTotal / qty) : amountTotal
          const label = isCylinder
            ? `${type || 'Cylinder'} – ${src?.cylinderSize || ''}`
            : 'Gas Sale'
          items = [{
            product: { name: label, price: unit },
            quantity: qty,
            price: unit,
            total: amountTotal,
          }]
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

    // Otherwise, this is the customer statement flow
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
      const totalAmount = items.reduce((sum, x) => sum + Number(x.total || 0), 0)

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
  }, [])

  const fetchReportsData = async (loadCustomers = false) => {
    try {
      setLoading(true);
      // Always fetch stats
      const statsResponse = await reportsAPI.getStats();

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

      // Only fetch customer data if requested
      if (loadCustomers) {
        const ledgerResponse = await reportsAPI.getLedger();
        if (ledgerResponse.data?.success && Array.isArray(ledgerResponse.data.data)) {
          setCustomers(ledgerResponse.data.data);
        } else {
          setCustomers([]);
        }
      }

    } catch (error) {
      setStats({
        totalRevenue: 0, totalEmployees: 0, gasSales: 0, cylinderRefills: 0,
        totalCustomers: 0, totalCombinedRevenue: 0, pendingCustomers: 0, 
        overdueCustomers: 0, clearedCustomers: 0
      });
      if (loadCustomers) {
        setCustomers([]);
      }
    } finally {
      setLoading(false);
    }
  };

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
    <div className="pt-6 lg:pt-0 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8 text-white">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 flex items-center gap-3">
          <FileText className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />
          Reports & Analytics
        </h1>
        <p className="text-white/80 text-sm sm:text-base lg:text-lg">Comprehensive business insights and customer ledger</p>
      </div>





      {/* Cash Paper (Admin) */}
      <CashPaperSection title="Cash Paper (Admin)" />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {reportCards.map((card, index) => (
          <Card key={index}>
            <CardContent className="flex items-center p-4 sm:p-6">
              <card.icon className="h-6 w-6 sm:h-8 sm:w-8 mr-3 sm:mr-4 flex-shrink-0" style={{ color: card.color }} />
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">{card.title}</p>
                <div className="text-lg sm:text-xl lg:text-2xl font-bold truncate" style={{ color: card.color }}>
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

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex space-x-2">
              <Button onClick={handleFilter} style={{ backgroundColor: "#2B3068" }} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Apply Filters
              </Button>
              <Button onClick={resetFilters} variant="outline">
                Reset
              </Button>
            </div>
            {filters.status === 'pending' && (
              <Button onClick={downloadPendingTransactionsPdf} variant="outline" className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200 w-full sm:w-auto">
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
                          {formatCurrency(Number(customer.balance || 0))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{(customer.totalSales || 0) + (customer.totalDeposits || 0) + (customer.totalRefills || 0) + (customer.totalReturns || 0)} transactions</div>
                          <div className="text-gray-500">{formatCurrency((customer.totalSalesAmount || 0) + (customer.totalCylinderAmount || 0))}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{(customer.totalDeposits || 0) + (customer.totalRefills || 0) + (customer.totalReturns || 0)} transactions</div>
                          <div className="text-gray-500">{formatCurrency(customer.totalCylinderAmount || 0)}</div>
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
                                  // Gas sales flattened to one row per item
                                  ...(customer.recentSales || [])
                                    .filter(entry => {
                                      if (filters.status === 'all') return true;
                                      return entry.paymentStatus === filters.status;
                                    })
                                    .flatMap(entry =>
                                      (entry.items || []).map((item: any, idx: number) => ({
                                        ...entry,
                                        _id: `ledger-${entry._id}-${item?._id || item?.product?._id || idx}`,
                                        srcId: entry._id,
                                        createdAt: entry.createdAt,
                                        type: 'gas_sale',
                                        displayType: 'Gas Sale',
                                        description: `${item.product?.name || 'Unknown Product'} (${item.quantity}x)`,
                                        amount: Number(item?.total ?? ((Number(item?.price || 0)) * Number(item?.quantity || 1))) || 0,
                                        paidAmount: entry.receivedAmount ?? entry.amountPaid ?? 0,
                                        status: entry.paymentStatus,
                                        saleSource: (entry as any).saleSource || 'admin',
                                        invoiceNumber: entry.invoiceNumber,
                                      }))
                                    ),
                                  // Add cylinder transactions (filter by status if needed)
                                  ...(customer.recentCylinderTransactions || [])
                                    .filter(transaction => {
                                      if (filters.status === 'all') return true;
                                      return transaction.status === filters.status;
                                    })
                                    .map(transaction => ({
                                      ...transaction,
                                      _id: `cylinder-${transaction._id}`,
                                      srcId: transaction._id,
                                      createdAt: transaction.createdAt,
                                      type: transaction.type,
                                      displayType: `Cylinder ${transaction.type}`,
                                      description: `${transaction.cylinderSize} (${transaction.quantity}x)`,
                                      amount: transaction.amount,
                                      paidAmount: transaction.cashAmount || 0,
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
                                        <TableHead>Action</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {allTransactions.map((transaction: any, index) => (
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
                                          <TableCell>
                                            {(() => {
                                              // Determine kind/id
                                              const isGas = transaction.type === 'gas_sale'
                                              const kind = isGas
                                                ? ((transaction.saleSource === 'employee') ? 'employee_sale' : 'sale')
                                                : 'cylinder'
                                              const id = String(transaction.srcId)
                                              const key = paymentKey(kind as any, id)
                                              const rec = paymentRecords[key]
                                              const minimalRec: PaymentRecord = {
                                                kind: kind as any,
                                                id,
                                                amount: 0,
                                                method: 'cash',
                                                bankName: '',
                                                chequeNumber: '',
                                                newTotalReceived: Number(transaction.paidAmount || 0),
                                                at: String(transaction.createdAt || new Date().toISOString()),
                                              }
                                              const isPending = String(transaction.status).toLowerCase() === 'pending'
                                              const canReceive = isPending && (!isGas || (isGas))
                                              if (isPending && (isGas || (!isGas && String(transaction.type).toLowerCase() !== 'refill'))) {
                                                return (
                                                  <div className="flex items-center gap-2">
                                                    <Button size="sm" variant="outline" onClick={() => openReceiveDialog({ id, kind: kind as any, totalAmount: Number(isGas ? (transaction.totalAmount || transaction.amount) : (transaction.amount || 0)), currentReceived: Number(transaction.paidAmount || 0) })}>
                                                      Receive Amount
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => setShowPaymentDetail(rec || minimalRec)} className="text-blue-600 hover:bg-blue-50">
                                                      See Details
                                                    </Button>
                                                  </div>
                                                )
                                              }
                                              return (
                                                <Button size="sm" variant="ghost" onClick={() => setShowPaymentDetail(rec || minimalRec)} className="text-blue-600 hover:bg-blue-50">
                                                  See Details
                                                </Button>
                                              )
                                            })()}
                                          </TableCell>
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
                                
                                // Flatten to one row per item (invoice items as separate rows)
                                const itemRows = filteredSales.flatMap((sale: any) =>
                                  (sale.items || []).map((item: any, idx: number) => ({ sale, item, idx }))
                                )

                                return itemRows.length > 0 ? (
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Invoice #</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Total</TableHead>
                                        <TableHead>Paid Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Action</TableHead>
                                        <TableHead>Item</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {itemRows.map(({ sale, item, idx }) => (
                                        <TableRow key={`${sale._id}-${item?._id || item?.product?._id || idx}`}>
                                          <TableCell className="font-mono">{sale.invoiceNumber}</TableCell>
                                          <TableCell>{formatDate(sale.createdAt)}</TableCell>
                                          <TableCell>{formatCurrency(sale.totalAmount)}</TableCell>
                                          <TableCell>{formatCurrency(sale.receivedAmount ?? sale.amountPaid ?? 0)}</TableCell>
                                          <TableCell key={`${sale._id}-${sale.paymentStatus}`}>{getStatusBadge(sale.paymentStatus)}</TableCell>
                                          <TableCell>
                                            {(() => {
                                              const sourceKind = (sale as any).saleSource === 'employee' ? 'employee_sale' : 'sale'
                                              const key = paymentKey(sourceKind as any, String(sale._id))
                                              const rec = paymentRecords[key]
                                              // Helper to build a minimal record if needed
                                              const minimalRec: PaymentRecord = {
                                                kind: sourceKind as any,
                                                id: String(sale._id),
                                                amount: 0,
                                                method: 'cash',
                                                bankName: '',
                                                chequeNumber: '',
                                                newTotalReceived: Number(sale.receivedAmount ?? sale.amountPaid ?? 0),
                                                at: String(sale.createdAt || new Date().toISOString()),
                                              }
                                              const canReceive = String(sale.paymentStatus).toLowerCase() === 'pending'
                                              // When pending, show both Receive and See Details (details uses either rec or minimal)
                                              if (canReceive) {
                                                return (
                                                  <div className="flex items-center gap-2">
                                                    <Button size="sm" variant="outline" onClick={() => openReceiveDialog({ id: String(sale._id), kind: sourceKind as any, totalAmount: Number(sale.totalAmount || 0), currentReceived: Number(sale.receivedAmount ?? sale.amountPaid ?? 0) })}>
                                                      Receive Amount
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => setShowPaymentDetail(rec || minimalRec)} className="text-blue-600 hover:bg-blue-50">
                                                      See Details
                                                    </Button>
                                                  </div>
                                                )
                                              }
                                              // Not pending: show See Details (prefer recorded, else minimal)
                                              return (
                                                <Button size="sm" variant="ghost" onClick={() => setShowPaymentDetail(rec || minimalRec)} className="text-blue-600 hover:bg-blue-50">
                                                  See Details
                                                </Button>
                                              )
                                            })()}
                                          </TableCell>
                                          <TableCell>
                                            <div>{item?.product?.name || 'N/A'} (x{item?.quantity})</div>
                                          </TableCell>
                                        </TableRow>
                                      ))}
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
                                              {(() => {
                                                const key = paymentKey('cylinder', String(transaction._id))
                                                const rec = paymentRecords[key]
                                                const minimalRec: PaymentRecord = {
                                                  kind: 'cylinder',
                                                  id: String(transaction._id),
                                                  amount: 0,
                                                  method: 'cash',
                                                  bankName: '',
                                                  chequeNumber: '',
                                                  newTotalReceived: Number(transaction.cashAmount || 0),
                                                  at: String(transaction.createdAt || new Date().toISOString()),
                                                }
                                                const isPending = String(transaction.status).toLowerCase() === 'pending'
                                                const isRefill = String(transaction.type).toLowerCase() === 'refill'
                                                if (isPending && !isRefill) {
                                                  return (
                                                    <div className="flex items-center gap-2">
                                                      <Button size="sm" variant="outline" onClick={() => openReceiveDialog({ id: String(transaction._id), kind: 'cylinder', totalAmount: Number(transaction.amount || 0), currentReceived: Number(transaction.cashAmount || 0) })}>
                                                        Receive Amount
                                                      </Button>
                                                      <Button size="sm" variant="ghost" onClick={() => setShowPaymentDetail(rec || minimalRec)} className="text-blue-600 hover:bg-blue-50">
                                                        See Details
                                                      </Button>
                                                    </div>
                                                  )
                                                }
                                                return (
                                                  <Button size="sm" variant="ghost" onClick={() => setShowPaymentDetail(rec || minimalRec)} className="text-blue-600 hover:bg-blue-50">
                                                    See Details
                                                  </Button>
                                                )
                                              })()}
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
                                        <span className="font-semibold text-blue-600">{formatCurrency(customer.totalSalesAmount || 0)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Amount Paid:</span>
                                        <span className="font-semibold text-green-600">{formatCurrency(customer.totalPaidAmount || 0)}</span>
                                      </div>
                                      <div className="flex justify-between border-t pt-2">
                                        <span>Outstanding:</span>
                                        <span className={`font-semibold ${((Number(customer.totalSalesAmount || 0) - Number(customer.totalPaidAmount || 0)) > 0) ? 'text-red-600' : 'text-green-600'}`}>
                                          {formatCurrency(Number(customer.totalSalesAmount || 0) - Number(customer.totalPaidAmount || 0))}
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
                                        <span className="font-semibold text-blue-600">{formatCurrency(customer.totalSalesAmount || 0)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Cylinder Revenue:</span>
                                        <span className="font-semibold text-green-600">{formatCurrency(customer.totalCylinderAmount || 0)}</span>
                                      </div>
                                      <div className="flex justify-between border-t pt-1">
                                        <span>Total Revenue:</span>
                                        <span className="font-semibold">{formatCurrency((customer.totalSalesAmount || 0) + (customer.totalCylinderAmount || 0))}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Total Debit:</span>
                                        <span className="font-semibold text-red-600">{formatCurrency(customer.totalDebit || 0)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Total Credit:</span>
                                        <span className="font-semibold text-green-600">{formatCurrency(customer.totalCredit || 0)}</span>
                                      </div>
                                      <div className="flex justify-between border-t pt-2">
                                        <span>Current Balance:</span>
                                        <span className={`font-bold ${customer.balance > 0 ? 'text-red-600' : customer.balance < 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                          {formatCurrency(Number(customer.balance || 0))}
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
      <Dialog open={receiveDialog.open} onOpenChange={(v) => (v ? setReceiveDialog(prev => ({ ...prev, open: true })) : closeReceiveDialog())}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Receive Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Total Amount:</span><span className="font-semibold">{formatCurrency(receiveDialog.totalAmount)}</span></div>
            <div className="flex justify-between"><span>Received So Far:</span><span className="font-semibold text-green-600">{formatCurrency(receiveDialog.currentReceived)}</span></div>
            <div className="flex justify-between border-t pt-2"><span>Remaining:</span><span className="font-semibold text-red-600">{formatCurrency(Math.max(0, receiveDialog.totalAmount - receiveDialog.currentReceived))}</span></div>
          </div>
          <div className="space-y-3 mt-3">
            <div className="space-y-1">
              <Label>Payment Method</Label>
              <Select value={receiveDialog.method} onValueChange={(v: any) => setReceiveDialog(prev => ({ ...prev, method: v }))}>
                <SelectTrigger className="bg-white text-black"><SelectValue placeholder="Select method" /></SelectTrigger>
                <SelectContent className="bg-white text-black">
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {receiveDialog.method === 'cheque' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Bank Name</Label>
                  <Input
                    placeholder="Enter bank name"
                    value={receiveDialog.bankName || ''}
                    onChange={(e) => setReceiveDialog(prev => ({ ...prev, bankName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Cheque Number</Label>
                  <Input
                    placeholder="Enter cheque number"
                    value={receiveDialog.chequeNumber || ''}
                    onChange={(e) => setReceiveDialog(prev => ({ ...prev, chequeNumber: e.target.value }))}
                  />
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label>Amount Received Now</Label>
              <Input type="number" min={0} step="0.01" value={receiveDialog.inputAmount} onChange={(e) => setReceiveDialog(prev => ({ ...prev, inputAmount: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeReceiveDialog}>Cancel</Button>
            <Button style={{ backgroundColor: '#2B3068' }} onClick={submitReceiveAmount}>Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Detail Dialog */}
      <Dialog open={!!showPaymentDetail} onOpenChange={(v) => setShowPaymentDetail(v ? showPaymentDetail : null)}>
        <DialogContent className="max-w-[520px] p-0 overflow-hidden">
          {showPaymentDetail && (
            <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/15 rounded-full p-2">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-white text-base sm:text-lg">Payment Received</DialogTitle>
                  <p className="text-white/80 text-xs sm:text-sm">{new Date(showPaymentDetail.at).toLocaleString()}</p>
                </div>
              </div>
              <Badge className="bg-white text-indigo-700 hover:bg-white">{String(showPaymentDetail.kind).replace('_', ' ')}</Badge>
            </div>
          )}
          {showPaymentDetail && (
            <div className="p-5 space-y-4">
              {/* Amounts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border bg-white p-4">
                  <div className="text-xs text-gray-500">Received Now</div>
                  <div className="text-xl font-semibold text-green-600">{formatCurrency(showPaymentDetail.amount)}</div>
                </div>
                <div className="rounded-lg border bg-white p-4">
                  <div className="text-xs text-gray-500">Total Received</div>
                  <div className="text-xl font-semibold text-blue-700">{formatCurrency(showPaymentDetail.newTotalReceived)}</div>
                </div>
              </div>

              {/* Method & Cheque info */}
              <div className="rounded-lg border bg-white p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">Payment Method</div>
                  <Badge className={showPaymentDetail.method === 'cheque' ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-emerald-500 hover:bg-emerald-600'}>
                    {showPaymentDetail.method === 'cheque' ? 'Cheque' : 'Cash'}
                  </Badge>
                </div>
                {showPaymentDetail.method === 'cheque' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <div className="text-xs text-gray-500">Bank Name</div>
                      <div className="font-medium">{showPaymentDetail.bankName || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Cheque #</div>
                      <div className="font-medium">{showPaymentDetail.chequeNumber || '-'}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Meta hidden per request: Reference ID and Timestamp removed */}

              <div className="flex justify-end pt-1">
                <Button variant="outline" onClick={() => setShowPaymentDetail(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Removed old DSR Form Dialog (replaced by Excel-like grid dialog) */}


    </div>
  )
}
