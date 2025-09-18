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
    customer: { name: string; phone: string; address: string }
    items: Array<{ product: { name: string; price: number }; quantity: number; price: number; total: number }>
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
    selectedInvoices: [] as PendingInvoice[]
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

  const fetchData = async (customerId?: string) => {
    setLoading(true)
    try {
      if (!customerId) {
        // No customer selected: clear invoices
        setInvoices([])
      } else {
        // Load pending invoices only for the selected customer
        const res = await fetch(`/api/collections?customerId=${customerId}`)
        const data = await res.json().catch(() => ({}))
        const arr: PendingInvoice[] = Array.isArray(data?.data) ? data.data : []
        setInvoices(arr)
      }
    } catch (e: any) {
      toast({ title: "Failed to load pending invoices", description: e?.message || "", variant: "destructive" })
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCustomers()
  }, [])

  // When customer is selected, load their pending invoices
  useEffect(() => {
    if (selectedCustomer?._id) {
      fetchData(selectedCustomer._id)
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
      return name.includes(q) || email.includes(q) || phone.includes(q)
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

  const totalSelected = useMemo(() => filtered.filter((i) => selected[i._id]).length, [filtered, selected])

  const totalToCollect = useMemo(() =>
    filtered.reduce((sum, inv) => {
      if (!selected[inv._id]) return sum
      const raw = amounts[inv._id]
      const val = Number(raw)
      if (!isFinite(val) || val <= 0) return sum
      return sum + Math.min(val, inv.balance)
    }, 0),
  [filtered, selected, amounts])

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
      const inv = invoices.find((i) => i._id === id)
      if (inv) setAmounts((prev) => ({ ...prev, [id]: inv.balance.toString() }))
    }
  }

  const handleReceiveAmountClick = () => {
    const selectedInvoices = filtered.filter((i) => selected[i._id])
    
    if (!selectedInvoices.length) {
      toast({ title: "No invoices selected", variant: "destructive" })
      return
    }
    
    const totalAmount = selectedInvoices.reduce((sum, inv) => sum + inv.balance, 0)
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
      selectedInvoices
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
      selectedInvoices: []
    })
  }
  
  const submitPaymentCollection = async () => {
    const add = Number.parseFloat(paymentDialog.inputAmount || '0')
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
    
    // Create payments array for API
    const payments = paymentDialog.selectedInvoices.map((inv) => {
      const invoiceAmount = Number(amounts[inv._id]) || inv.balance
      const proportionalAmount = (invoiceAmount / paymentDialog.totalAmount) * add
      return {
        model: inv.model,
        id: inv._id,
        amount: proportionalAmount
      }
    }).filter(p => p.amount > 0)
    
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
      await fetchData(selectedCustomer?._id)
      // Format receipt data for the ReceiptDialog
      const receiptItems = payments.flatMap(p => {
        const invoice = invoices.find(inv => inv._id === p.id)
        if (!invoice) return []
        
        // If invoice has items, use them, otherwise create a single item for the payment
        if (invoice.items?.length > 0) {
          return invoice.items.map(item => ({
            product: {
              name: item.product.name,
              price: item.price
            },
            quantity: item.quantity,
            price: item.price,
            total: item.total
          }))
        }
        
        // Fallback for invoices without items
        return [{
          product: { 
            name: `Payment for Invoice #${invoice.invoiceNumber} (${invoice.source.toUpperCase()})`,
            price: p.amount
          },
          quantity: 1,
          price: p.amount,
          total: p.amount
        }]
      })

setReceiptData({
        _id: `collection-${Date.now()}`,
        invoiceNumber: `COL-${Date.now().toString().slice(-6)}`,
        customer: {
          name: selectedCustomer?.name || 'Customer',
          phone: selectedCustomer?.phone || '',
          address: ''
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
    // Format receipt data for the ReceiptDialog
    const receiptItems = payments.map(p => ({
      product: { name: `${p.model} - ${p.id}`, price: p.amount },
      quantity: 1,
      price: p.amount,
      total: p.amount
    }))

    setReceiptData({
      _id: `preview-${Date.now()}`,
      invoiceNumber: `PREV-${Date.now().toString().slice(-6)}`,
      customer: {
        name: selectedCustomer?.name || 'Customer',
        phone: selectedCustomer?.phone || '',
        address: ''
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
            <Button variant="secondary" onClick={() => fetchData(selectedCustomer?._id)} disabled={loading}>
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
              placeholder="Search customer by name, phone, or email"
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
                    <div className="text-xs text-gray-600">{c.phone || '-'} {c.email ? `• ${c.email}` : ''}</div>
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
          <div className="overflow-x-auto space-y-6">
            {groupedByCustomer.length === 0 && (
              <div className="p-4 text-center text-gray-500">No pending invoices</div>
            )}
            {groupedByCustomer.map((group) => {
              const allSelected = group.invoices.every((i) => selected[i._id]) && group.invoices.length > 0
              const groupTotalBalance = group.invoices.reduce((s, inv) => s + (inv.balance || 0), 0)
              return (
                <div key={group.key} className="border rounded-lg">
                  <div className="flex items-center justify-between p-3 bg-gray-50 border-b rounded-t-lg">
                    <div className="flex items-center gap-3">
                      <Checkbox checked={allSelected} onCheckedChange={(v) => {
                        const checked = Boolean(v)
                        group.invoices.forEach((inv) => {
                          handleSelect(inv._id, checked)
                          if (checked && !amounts[inv._id]) {
                            setAmounts((prev) => ({ ...prev, [inv._id]: inv.balance.toString() }))
                          }
                        })
                      }} />
                      <div>
                        <div className="font-semibold">{group.name}</div>
                        {group.phone && (
                          <div className="text-xs text-gray-600">{group.phone}</div>
                        )}
                        <div className="text-xs text-gray-600">Pending invoices: {group.invoices.length} • Total balance: AED {groupTotalBalance.toFixed(2)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
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
                          const selectedInvoices = group.invoices.filter((i) => selected[i._id])
                          
                          if (!selectedInvoices.length) {
                            toast({ title: 'No invoices selected in this customer group', variant: 'destructive' })
                            return
                          }
                          
                          const totalAmount = selectedInvoices.reduce((sum, inv) => sum + inv.balance, 0)
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
                            selectedInvoices
                          })
                        }}
                        disabled={group.invoices.every((i) => !selected[i._id])}
                      >
                        Receive Amount
                      </Button>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="p-2"></th>
                        <th className="text-left p-2">Invoice</th>
                        <th className="text-left p-2">Source</th>
                        <th className="text-left p-2">Items</th>
                        <th className="text-right p-2">Total (AED)</th>
                        <th className="text-right p-2">Received (AED)</th>
                        <th className="text-right p-2">Balance (AED)</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Date</th>
                        <th className="text-right p-2">Collect</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.invoices.map((inv) => (
                        <tr key={inv._id} className="border-b">
                          <td className="p-2 align-middle">
                            <Checkbox checked={!!selected[inv._id]} onCheckedChange={(v) => handleSelect(inv._id, Boolean(v))} />
                          </td>
                          <td className="p-2 align-middle font-medium">{inv.invoiceNumber}</td>
                          <td className="p-2 align-middle">
                            <Badge variant="secondary" className={inv.source === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}>
                              {inv.source}
                            </Badge>
                          </td>
                          <td className="p-2 align-middle">
                            <div className="flex flex-col gap-1">
                              {inv.items?.slice(0, 2).map((item, idx) => (
                                <div key={idx} className="text-sm">
                                  {item.quantity} × {item.product.name} @ AED {item.price.toFixed(2)}
                                </div>
                              ))}
                              {inv.items?.length > 2 && (
                                <div className="text-xs text-gray-500">+{inv.items.length - 2} more items</div>
                              )}
                              {!inv.items?.length && (
                                <div className="text-xs text-gray-400">No items</div>
                              )}
                            </div>
                          </td>
                          <td className="p-2 align-middle text-right">{inv.totalAmount.toFixed(2)}</td>
                          <td className="p-2 align-middle text-right">{inv.receivedAmount.toFixed(2)}</td>
                          <td className="p-2 align-middle text-right font-semibold">{inv.balance.toFixed(2)}</td>
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
                              step="0.01"
                              className="w-32 ml-auto"
                              placeholder={inv.balance.toFixed(2)}
                              value={amounts[inv._id] || ''}
                              onChange={(e) => setAmounts((prev) => ({ ...prev, [inv._id]: e.target.value }))}
                              disabled={!selected[inv._id]}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>

          <Separator className="my-4" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm text-gray-600">
              Selected: <strong>{totalSelected}</strong> • Total to Collect: <strong>AED {totalToCollect.toFixed(2)}</strong>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={loading || totalSelected === 0} onClick={() => openPrintWindow(
                filtered.filter((i) => selected[i._id]).map((i) => ({ model: i.model, id: i._id, amount: Math.min(Number(amounts[i._id] || 0), i.balance) }))
              )}>
                <Printer className="w-4 h-4 mr-2" /> Preview Receipt
              </Button>
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
