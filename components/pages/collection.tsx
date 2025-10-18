"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { Printer, RefreshCcw } from "lucide-react"
import { SignatureDialog } from "@/components/signature-dialog"
import { ReceiptDialog } from "@/components/receipt-dialog"

interface User {
  id: string
  email: string
  role: "admin" | "employee"
  name: string
}

interface PendingInvoiceItem {
  product: { name: string }
  quantity: number
  price: number
  total: number
}

interface PendingInvoice {
  _id: string
  model: "Sale" | "EmployeeSale"
  source: "admin" | "employee"
  invoiceNumber: string
  customer: { _id: string; name: string; phone?: string } | null
  employee?: { _id: string; name: string; email?: string } | null
  items: PendingInvoiceItem[]
  totalAmount: number
  receivedAmount: number
  balance: number
  paymentStatus: string
  createdAt: string
}

interface CollectionPageProps {
  user: User
}

export function CollectionPage({ user }: CollectionPageProps) {
  const [loading, setLoading] = useState(false)
  const [invoices, setInvoices] = useState<PendingInvoice[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [signatureOpen, setSignatureOpen] = useState(false)
  const [pendingPaymentsCache, setPendingPaymentsCache] = useState<Array<{ model: string; id: string; amount: number }>>([])
  // Receipt dialog state
  const [showReceiptDialog, setShowReceiptDialog] = useState(false)
  const [receiptData, setReceiptData] = useState<{
    _id: string
    invoiceNumber: string
    customer: { name: string; phone: string; address: string; trNumber?: string }
    items: Array<{ product: { name: string; price: number }; quantity: number; price: number; total: number; invoiceNumber?: string; invoiceDate?: string; paymentStatus?: string }>
    totalAmount: number
    paymentMethod: string
    paymentStatus: string
    type: string
    createdAt: string
    customerSignature?: string  // Changed from signature to customerSignature to match ReceiptDialogProps
  } | null>(null)
  // Customer selection state
  const [customers, setCustomers] = useState<any[]>([])
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false)
  const [filteredCustomers, setFilteredCustomers] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<{ _id: string; name: string; phone?: string } | null>(null)
  
  // Payment collection dialog state
  const [paymentDialog, setPaymentDialog] = useState({
    open: false,
    totalAmount: 0,
    currentReceived: 0,
    method: 'cash' as 'cash' | 'cheque',
    bankName: '',
    chequeNumber: '',
    inputAmount: '',
    selectedInvoices: [] as PendingInvoice[],
    selectedItems: [] as Array<{
      invoice: PendingInvoice,
      item: PendingInvoiceItem,
      itemId: string,
      amount: number
    }>
  })

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers')
      const json = await res.json().catch(() => ({}))
      const arr = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []
      setCustomers(arr)
    } catch {
      setCustomers([])
    }
  }

  const fetchData = async (customerId?: string, forceRefresh = false) => {
    setLoading(true)
    try {
      if (!customerId) {
        // No customer selected: clear invoices
        setInvoices([])
      } else {
        // Load pending invoices only for the selected customer with cache busting
        const timestamp = forceRefresh ? `&_t=${Date.now()}` : ''
        const res = await fetch(`/api/collections?customerId=${customerId}${timestamp}`, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        })
        
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        }
        
        const data = await res.json()
        console.log('Collections API Response:', data) // Debug logging
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch pending invoices')
        }
        
        const arr: PendingInvoice[] = Array.isArray(data?.data) ? data.data : []
        console.log(`Found ${arr.length} pending invoices for customer ${customerId}`) // Debug logging
        setInvoices(arr)
      }
    } catch (e: any) {
      console.error('fetchData error:', e) // Debug logging
      toast({ title: "Failed to load pending invoices", description: e?.message || "", variant: "destructive" })
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCustomers()
  }, [])

  // Add window focus listener to refresh data when user returns from other pages
  useEffect(() => {
    const handleFocus = () => {
      console.log("Collection page focused, refreshing data...")
      if (selectedCustomer?._id) {
        fetchData(selectedCustomer._id, true) // Force refresh on focus
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [selectedCustomer?._id])

  // When customer is selected, load their pending invoices
  useEffect(() => {
    if (selectedCustomer?._id) {
      fetchData(selectedCustomer._id, true) // Force refresh when customer changes
    } else {
      setInvoices([])
    }
    // reset selections and amounts when changing customer
    setSelected({})
    setAmounts({})
  }, [selectedCustomer?._id])

  // Customer autocomplete handlers
  const handleCustomerSearchChange = (value: string) => {
    setCustomerSearch(value)
    if (!value) {
      setFilteredCustomers([])
      return
    }
    const q = value.toLowerCase()
    const filtered = (customers || []).filter((c: any) => {
      const name = String(c?.name || '').toLowerCase()
      const email = String(c?.email || '').toLowerCase()
      const phone = String(c?.phone || '').toLowerCase()
      const serialNumber = String(c?.serialNumber || '').toLowerCase()
      return name.includes(q) || email.includes(q) || phone.includes(q) || serialNumber.includes(q)
    }).slice(0, 6)
    setFilteredCustomers(filtered)
  }

  const handleCustomerSuggestionClick = (c: any) => {
    setSelectedCustomer({ _id: c._id, name: c.name, phone: c.phone })
    setCustomerSearch(c.name)
    setShowCustomerSuggestions(false)
  }

  // Currently, we don't need extra filtering; we show the selected customer's invoices directly
  const filtered = invoices

  // Group by customer for list-wise display
  const groupedByCustomer = useMemo(() => {
    const groups: Record<string, { key: string; name: string; phone?: string; invoices: PendingInvoice[] }> = {}
    for (const inv of filtered) {
      const key = inv.customer?._id || `no-customer-${inv._id}`
      const name = inv.customer?.name || "Unknown Customer"
      const phone = inv.customer?.phone
      if (!groups[key]) groups[key] = { key, name, phone, invoices: [] }
      // If phone not set yet and this invoice has it, set it
      if (!groups[key].phone && phone) groups[key].phone = phone
      groups[key].invoices.push(inv)
    }
    // Sort groups by name for stable display
    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name))
  }, [filtered])

  const totalSelected = useMemo(() => {
    let count = 0
    filtered.forEach((inv) => {
      if (selected[inv._id]) count++
    })
    return count
  }, [filtered, selected])

  const totalToCollect = useMemo(() => {
    let total = 0
    filtered.forEach((inv) => {
      if (selected[inv._id]) {
        const raw = amounts[inv._id]
        const val = Number(raw)
        if (isFinite(val) && val > 0) {
          total += Math.min(val, inv.balance)
        }
      }
    })
    return total
  }, [filtered, selected, amounts])

  const setSelectAll = (checked: boolean) => {
    const copy: Record<string, boolean> = { ...selected }
    filtered.forEach((inv) => {
      copy[inv._id] = checked
      if (checked && !amounts[inv._id]) {
        // prefill with full balance for convenience
        setAmounts((prev) => ({ ...prev, [inv._id]: inv.balance.toString() }))
      }
    })
    setSelected(copy)
  }

  const handleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => ({ ...prev, [id]: checked }))
    if (checked && !amounts[id]) {
      // This is an invoice ID - prefill with full balance
      const inv = invoices.find((i) => i._id === id)
      if (inv) {
        setAmounts((prev) => ({ ...prev, [id]: inv.balance.toString() }))
      }
    }
  }

  const handleReceiveAmountClick = () => {
    console.log('handleReceiveAmountClick called')
    console.log('Current selected state:', selected)
    console.log('Current amounts state:', amounts)
    
    // Collect all selected invoices
    const selectedInvoices: PendingInvoice[] = []
    const selectedItems: Array<{
      invoice: PendingInvoice,
      item: PendingInvoiceItem,
      itemId: string,
      amount: number
    }> = []
    
    filtered.forEach((inv) => {
      if (selected[inv._id]) {
        const amount = parseFloat(amounts[inv._id] || '0')
        if (amount > 0) {
          selectedInvoices.push(inv)
          // Create a single item representing the entire invoice payment
          selectedItems.push({ 
            invoice: inv, 
            item: { product: { name: `Invoice ${inv.invoiceNumber}` }, quantity: 1, price: amount, total: amount }, 
            itemId: inv._id, 
            amount 
          })
        }
      }
    })
    
    console.log('Collected selectedInvoices:', selectedInvoices)
    
    if (!selectedInvoices.length) {
      toast({ title: "No invoices selected", variant: "destructive" })
      return
    }
    
    const totalAmount = selectedInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0)
    const currentReceived = selectedInvoices.reduce((sum, inv) => sum + inv.receivedAmount, 0)
    
    // Open payment collection dialog
    setPaymentDialog({
      open: true,
      totalAmount,
      currentReceived,
      method: 'cash',
      bankName: '',
      chequeNumber: '',
      inputAmount: '',
      selectedInvoices,
      selectedItems
    })
  }
  
  const closePaymentDialog = () => {
    setPaymentDialog({
      open: false,
      totalAmount: 0,
      currentReceived: 0,
      method: 'cash',
      bankName: '',
      chequeNumber: '',
      inputAmount: '',
      selectedInvoices: [],
      selectedItems: []
    })
  }
  
  const submitPaymentCollection = async () => {
    const add = Number.parseFloat(paymentDialog.inputAmount || '0')
    console.log('submitPaymentCollection called with amount:', add)
    console.log('paymentDialog.selectedItems:', paymentDialog.selectedItems)
    
    if (!Number.isFinite(add) || add <= 0) {
      toast({ title: 'Enter a valid amount > 0', variant: 'destructive' })
      return
    }
    
    // If cheque is selected, require bank name and cheque number
    if (paymentDialog.method === 'cheque') {
      const bank = String(paymentDialog.bankName || '').trim()
      const chq = String(paymentDialog.chequeNumber || '').trim()
      if (!bank || !chq) {
        toast({ title: 'Please enter Bank Name and Cheque Number', variant: 'destructive' })
        return
      }
    }
    
    const remaining = Math.max(0, paymentDialog.totalAmount - paymentDialog.currentReceived)
    if (add > remaining) {
      toast({ title: `Amount exceeds remaining balance. Remaining: ${remaining.toFixed(2)}`, variant: 'destructive' })
      return
    }
    
    // Create payments array for API using selected invoices
    const payments: Array<{ model: string; id: string; amount: number }> = []
    
    // For single invoice collection, apply the full amount directly
    if (paymentDialog.selectedInvoices.length === 1) {
      const invoice = paymentDialog.selectedInvoices[0]
      payments.push({
        model: invoice.model,
        id: invoice._id,
        amount: add  // Apply the full amount entered in the dialog
      })
    } else {
      // For multiple invoices, calculate proportional payment based on remaining balance
      paymentDialog.selectedInvoices.forEach(invoice => {
        const invoiceRemaining = invoice.totalAmount - invoice.receivedAmount
        const totalRemaining = paymentDialog.selectedInvoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.receivedAmount), 0)
        const proportionalAmount = (invoiceRemaining / totalRemaining) * add
        
        if (proportionalAmount > 0) {
          payments.push({
            model: invoice.model,
            id: invoice._id,
            amount: proportionalAmount
          })
        }
      })
    }
    
    console.log('Generated payments array:', payments)
    
    if (payments.length === 0) {
      toast({ title: 'No valid payments to process', variant: 'destructive' })
      return
    }
    
    // Cache the payments and payment details for signature
    setPendingPaymentsCache(payments)
    
    // Close payment dialog and open signature dialog
    closePaymentDialog()
    setSignatureOpen(true)
  }

  const applyCollectionsWithSignature = async (signature: string | null) => {
    const payments = pendingPaymentsCache
    if (!payments.length) return
    setLoading(true)
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments }),
      })
      const data = await res.json()
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to apply collections")
      toast({ title: "Payments collected", description: `${payments.length} invoice(s) updated.` })
      setSelected({})
      setAmounts({})
      await fetchData(selectedCustomer?._id, true) // Force refresh after collection
      // Format receipt data to show invoice numbers instead of individual items
      const receiptItems = payments.map(p => {
        const invoice = invoices.find(inv => inv._id === p.id)
        if (!invoice) return null
        
        // Create a single line item for each invoice payment with additional invoice details
        return {
          product: {
            name: `Payment for Invoice #${invoice.invoiceNumber}`,
            price: p.amount
          },
          quantity: 1,
          price: p.amount,
          total: p.amount,
          // Add invoice-specific data for collection receipts
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.createdAt,
          paymentStatus: invoice.paymentStatus
        }
      }).filter((item): item is NonNullable<typeof item> => item !== null)

      // Use collection receipt number instead of individual invoice number
      const invoiceNumber = `COL-${Date.now().toString().slice(-6)}`
      
      // Fetch full customer details including TR number and address
      const customerDetails = customers.find(c => c._id === selectedCustomer?._id)
      
      setReceiptData({
        _id: `collection-${Date.now()}`,
        invoiceNumber: invoiceNumber,
        customer: {
          name: selectedCustomer?.name || 'Customer',
          phone: selectedCustomer?.phone || '',
          address: customerDetails?.address || '',
          trNumber: customerDetails?.trNumber || ''
        },
        items: receiptItems,
        totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
        paymentMethod: paymentDialog.method === 'cheque' ? 'Cheque' : 'Cash',
        paymentStatus: 'cleared',
        type: 'collection',
        createdAt: new Date().toISOString(),
        customerSignature: signature || undefined
      })
      setShowReceiptDialog(true)
    } catch (e: any) {
      toast({ title: "Collection failed", description: e?.message || "", variant: "destructive" })
    } finally {
      setLoading(false)
      setPendingPaymentsCache([])
    }
  }

  const openPrintWindow = (payments: Array<{ model: string; id: string; amount: number }>, signature?: string) => {
    // Use collection preview receipt number instead of individual invoice number
    const invoiceNumber = `PREV-${Date.now().toString().slice(-6)}`
    
    // Fetch full customer details including TR number and address
    const customerDetails = customers.find(c => c._id === selectedCustomer?._id)
    
    // Format receipt data to show invoice numbers instead of individual items
    const receiptItems = payments.map(p => {
      const invoice = invoices.find(inv => inv._id === p.id)
      if (!invoice) return null
      
      // Create a single line item for each invoice payment with additional invoice details
      return {
        product: {
          name: `Payment for Invoice #${invoice.invoiceNumber}`,
          price: p.amount
        },
        quantity: 1,
        price: p.amount,
        total: p.amount,
        // Add invoice-specific data for collection receipts
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.createdAt,
        paymentStatus: invoice.paymentStatus
      }
    }).filter((item): item is NonNullable<typeof item> => item !== null)

    setReceiptData({
      _id: `preview-${Date.now()}`,
      invoiceNumber: invoiceNumber,
      customer: {
        name: selectedCustomer?.name || 'Customer',
        phone: selectedCustomer?.phone || '',
        address: customerDetails?.address || '',
        trNumber: customerDetails?.trNumber || ''
      },
      items: receiptItems,
      totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
      paymentMethod: 'Cash',
      paymentStatus: 'cleared',
      type: 'collection',
      createdAt: new Date().toISOString(),
      customerSignature: signature
    })
    setShowReceiptDialog(true)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4 sm:p-6 text-white" style={{ background: "linear-gradient(135deg,#2B3068,#3f468f)" }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Collection</h1>
            <p className="text-white/80 text-sm">Search a customer to view and collect their pending invoices</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => fetchData(selectedCustomer?._id, true)} disabled={loading}>
              <RefreshCcw className="w-4 h-4 mr-2" /> Refresh
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <CardTitle className="text-base sm:text-lg">Select Customer</CardTitle>
          <div className="relative w-full">
            <Input
              placeholder="Search customer by name, phone, email, or serial number"
              value={customerSearch}
              onChange={(e) => handleCustomerSearchChange(e.target.value)}
              onFocus={() => setShowCustomerSuggestions(true)}
              onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 180)}
            />
            {showCustomerSuggestions && filteredCustomers.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-64 overflow-auto">
                {filteredCustomers.map((c: any) => (
                  <div
                    key={c._id}
                    className="px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleCustomerSuggestionClick(c)}
                  >
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-gray-600">
                      {c.serialNumber && <span className="text-blue-600 font-medium">{c.serialNumber}</span>}
                      {c.serialNumber && (c.phone || c.email) && ' • '}
                      {c.phone || '-'} 
                      {c.email ? ` • ${c.email}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!selectedCustomer && (
            <div className="p-6 text-center text-gray-600">Search and select a customer to view their pending invoices.</div>
          )}
          {selectedCustomer && (
          <>
          <div className="space-y-6">
            {groupedByCustomer.length === 0 && (
              <div className="p-4 text-center text-gray-500">No pending invoices</div>
            )}
            {groupedByCustomer.map((group) => {
              const allSelected = group.invoices.every((inv) => selected[inv._id]) && group.invoices.length > 0
              const groupTotalBalance = group.invoices.reduce((s, inv) => s + (inv.balance || 0), 0)
              return (
                <div key={group.key} className="border rounded-lg">
                  {/* Fixed Customer Header - Does not scroll */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 border-b rounded-t-lg gap-3">
                    <div className="flex items-center gap-3 flex-1">
                      <Checkbox checked={allSelected} onCheckedChange={(v) => {
                        const checked = Boolean(v)
                        group.invoices.forEach((inv) => {
                          handleSelect(inv._id, checked)
                          if (checked && !amounts[inv._id]) {
                            setAmounts((prev) => ({ ...prev, [inv._id]: inv.balance.toString() }))
                          }
                        })
                      }} />
                      <div className="flex-1">
                        <div className="font-semibold text-sm sm:text-base">{group.name}</div>
                        {group.phone && (
                          <div className="text-xs sm:text-sm text-gray-600">{group.phone}</div>
                        )}
                        <div className="text-xs sm:text-sm text-gray-600">Pending invoices: {group.invoices.length} • Total balance: AED {groupTotalBalance.toFixed(2)}</div>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const setAll = !allSelected
                          group.invoices.forEach((inv) => {
                            handleSelect(inv._id, setAll)
                            if (setAll && !amounts[inv._id]) {
                              setAmounts((prev) => ({ ...prev, [inv._id]: inv.balance.toString() }))
                            }
                          })
                        }}
                      >
                        {allSelected ? 'Unselect All' : 'Select All'}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          // Collect all selected invoices from this customer group
                          const selectedInvoices: PendingInvoice[] = []
                          const selectedItems: Array<{
                            invoice: PendingInvoice,
                            item: PendingInvoiceItem,
                            itemId: string,
                            amount: number
                          }> = []
                          
                          group.invoices.forEach((inv) => {
                            if (selected[inv._id]) {
                              const amount = parseFloat(amounts[inv._id] || '0')
                              if (amount > 0) {
                                selectedInvoices.push(inv)
                                selectedItems.push({ 
                                  invoice: inv, 
                                  item: { product: { name: `Invoice ${inv.invoiceNumber}` }, quantity: 1, price: amount, total: amount }, 
                                  itemId: inv._id, 
                                  amount 
                                })
                              }
                            }
                          })
                          
                          if (!selectedInvoices.length) {
                            toast({ title: 'No invoices selected in this customer group', variant: 'destructive' })
                            return
                          }
                          
                          const totalAmount = selectedInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0)
                          const currentReceived = selectedInvoices.reduce((sum, inv) => sum + inv.receivedAmount, 0)
                          
                          // Open payment collection dialog with selected invoices
                          setPaymentDialog({
                            open: true,
                            totalAmount,
                            currentReceived,
                            method: 'cash',
                            bankName: '',
                            chequeNumber: '',
                            inputAmount: '',
                            selectedInvoices,
                            selectedItems
                          })
                        }}
                        disabled={(() => {
                          // Check if any invoices are selected in this group
                          return group.invoices.every((inv) => !selected[inv._id])
                        })()}
                      >
                        Receive Amount
                      </Button>
                    </div>
                  </div>
                  {/* Scrollable Table Section - Only this part scrolls */}
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="p-2"></th>
                        <th className="text-left p-2">Invoice Number</th>
                        <th className="text-left p-2">Source</th>
                        <th className="text-left p-2">Items Summary</th>
                        <th className="text-right p-2">Total Amount (AED)</th>
                        <th className="text-right p-2">Received (AED)</th>
                        <th className="text-right p-2">Balance (AED)</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Date</th>
                        <th className="text-right p-2">Collect Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.invoices.map((inv) => {
                        // Create items summary
                        const itemsSummary = inv.items && inv.items.length > 0 
                          ? inv.items.map(item => `${item.product.name} (${item.quantity})`).join(', ')
                          : 'No items'
                        
                        return (
                          <tr key={inv._id} className="border-b hover:bg-gray-50">
                            <td className="p-2 align-middle">
                              <Checkbox 
                                checked={!!selected[inv._id]} 
                                onCheckedChange={(v) => handleSelect(inv._id, Boolean(v))} 
                              />
                            </td>
                            <td className="p-2 align-middle font-medium">{inv.invoiceNumber}</td>
                            <td className="p-2 align-middle">
                              <Badge variant="secondary" className={inv.source === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}>
                                {inv.source}
                              </Badge>
                            </td>
                            <td className="p-2 align-middle">
                              <div className="text-sm max-w-xs truncate" title={itemsSummary}>
                                {itemsSummary}
                              </div>
                            </td>
                            <td className="p-2 align-middle text-right font-semibold">{inv.totalAmount.toFixed(2)}</td>
                            <td className="p-2 align-middle text-right text-green-600">{inv.receivedAmount.toFixed(2)}</td>
                            <td className="p-2 align-middle text-right font-semibold text-red-600">{inv.balance.toFixed(2)}</td>
                            <td className="p-2 align-middle">
                              <Badge className={inv.paymentStatus === 'pending' ? 'bg-yellow-500' : 'bg-green-600'}>
                                {inv.paymentStatus}
                              </Badge>
                            </td>
                            <td className="p-2 align-middle">{inv.createdAt ? format(new Date(inv.createdAt), 'yyyy-MM-dd') : '-'}</td>
                            <td className="p-2 align-middle text-right">
                              <Input
                                type="number"
                                min={0}
                                max={inv.balance}
                                step="0.01"
                                className="w-32 ml-auto"
                                placeholder={inv.balance.toFixed(2)}
                                value={amounts[inv._id] || ''}
                                onChange={(e) => setAmounts((prev) => ({ ...prev, [inv._id]: e.target.value }))}
                                disabled={!selected[inv._id]}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>

          <Separator className="my-4" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm text-gray-600">
              Selected Invoices: <strong>{totalSelected}</strong> • Total to Collect: <strong>AED {totalToCollect.toFixed(2)}</strong>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleReceiveAmountClick} disabled={loading || totalSelected === 0}>
                Receive Amount
              </Button>
            </div>
          </div>
          </>
          )}
        </CardContent>
      </Card>

      {/* Payment Collection Dialog */}
      <Dialog open={paymentDialog.open} onOpenChange={(v) => v ? setPaymentDialog(prev => ({ ...prev, open: true })) : closePaymentDialog()}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Receive Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Total Amount:</span>
              <span className="font-semibold">AED {paymentDialog.totalAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Received So Far:</span>
              <span className="font-semibold text-green-600">AED {paymentDialog.currentReceived.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span>Remaining:</span>
              <span className="font-semibold text-red-600">AED {Math.max(0, paymentDialog.totalAmount - paymentDialog.currentReceived).toFixed(2)}</span>
            </div>
          </div>
          <div className="space-y-3 mt-3">
            <div className="space-y-1">
              <Label>Payment Method</Label>
              <Select value={paymentDialog.method} onValueChange={(v: any) => setPaymentDialog(prev => ({ ...prev, method: v }))}>
                <SelectTrigger className="bg-white text-black">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent className="bg-white text-black">
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {paymentDialog.method === 'cheque' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Bank Name</Label>
                  <Input
                    placeholder="Enter bank name"
                    value={paymentDialog.bankName || ''}
                    onChange={(e) => setPaymentDialog(prev => ({ ...prev, bankName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Cheque Number</Label>
                  <Input
                    placeholder="Enter cheque number"
                    value={paymentDialog.chequeNumber || ''}
                    onChange={(e) => setPaymentDialog(prev => ({ ...prev, chequeNumber: e.target.value }))}
                  />
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label>Amount Received Now</Label>
              <Input 
                type="number" 
                min={0} 
                step="0.01" 
                value={paymentDialog.inputAmount} 
                onChange={(e) => setPaymentDialog(prev => ({ ...prev, inputAmount: e.target.value }))} 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closePaymentDialog}>Cancel</Button>
            <Button style={{ backgroundColor: '#2B3068' }} onClick={submitPaymentCollection}>Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signature capture dialog shown before applying collections */}
      <SignatureDialog
        isOpen={signatureOpen}
        onClose={() => setSignatureOpen(false)}
        onSignatureComplete={(sig) => {
          setSignatureOpen(false)
          applyCollectionsWithSignature(sig)
        }}
        customerName={(() => {
          // If single customer selected, show their name in the dialog
          const selectedInvoices = filtered.filter((i) => selected[i._id])
          const uniqueCustomers = Array.from(new Set(selectedInvoices.map((i) => i.customer?.name || 'Customer')))
          return uniqueCustomers.length === 1 ? uniqueCustomers[0] : undefined
        })()}
      />

      {/* Use the standard ReceiptDialog for consistency */}
      {receiptData && (
        <ReceiptDialog
          sale={{
            ...receiptData,
            customerSignature: receiptData.customerSignature || undefined
          }}
          signature={receiptData.customerSignature}
          open={showReceiptDialog}
          onClose={() => {
            setShowReceiptDialog(false)
            setReceiptData(null)
          }}
        />
      )}
    </div>
  )
}
