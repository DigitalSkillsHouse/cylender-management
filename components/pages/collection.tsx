"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { Printer, RefreshCcw } from "lucide-react"
import { SignatureDialog } from "@/components/signature-dialog"

interface User {
  id: string
  email: string
  role: "admin" | "employee"
  name: string
}

interface PendingInvoice {
  _id: string
  model: "Sale" | "EmployeeSale"
  source: "admin" | "employee"
  invoiceNumber: string
  customer: { _id: string; name: string; phone?: string } | null
  employee?: { _id: string; name: string; email?: string } | null
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
  // Customer selection state
  const [customers, setCustomers] = useState<any[]>([])
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false)
  const [filteredCustomers, setFilteredCustomers] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<{ _id: string; name: string; phone?: string } | null>(null)

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
    const payments = filtered
      .filter((i) => selected[i._id])
      .map((i) => {
        const raw = amounts[i._id]
        const amt = Number(raw)
        return { model: i.model, id: i._id, amount: isFinite(amt) && amt > 0 ? Math.min(amt, i.balance) : 0 }
      })
      .filter((p) => p.amount > 0)

    if (!payments.length) {
      toast({ title: "No valid payments selected", variant: "destructive" })
      return
    }
    // Cache the payments and ask for signature
    setPendingPaymentsCache(payments)
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
      await fetchData()
      // Print collection receipt including signature
      openPrintWindow(payments, signature || undefined)
    } catch (e: any) {
      toast({ title: "Collection failed", description: e?.message || "", variant: "destructive" })
    } finally {
      setLoading(false)
      setPendingPaymentsCache([])
    }
  }

  const openPrintWindow = (payments: Array<{ model: string; id: string; amount: number }>, signature?: string) => {
    try {
      const total = payments.reduce((s, p) => s + (p.amount || 0), 0)
      const html = `<!DOCTYPE html>
<html><head><title>Collection Receipt</title>
<style>
  body { font-family: Arial, sans-serif; padding: 16px; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  .muted { color: #666; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
  th { background: #2B3068; color: #fff; text-align: left; }
  .right { text-align: right; }
  .sig { margin-top: 24px; display: flex; justify-content: space-between; align-items: center; }
  .sig img { max-height: 60px; }
</style>
</head><body>
  <h1>Collection Receipt</h1>
  <div class="muted">Collector: ${user.name} (${user.role}) • Date: ${format(new Date(), "yyyy-MM-dd HH:mm")}</div>
  <table>
    <thead><tr><th>#</th><th>Model</th><th>Invoice/ID</th><th class="right">Amount (AED)</th></tr></thead>
    <tbody>
      ${payments
        .map(
          (p, idx) => `<tr><td>${idx + 1}</td><td>${p.model}</td><td>${p.id}</td><td class="right">${p.amount.toFixed(
            2,
          )}</td></tr>`,
        )
        .join("")}
      <tr><td colspan="3" class="right"><strong>Total Collected</strong></td><td class="right"><strong>${total.toFixed(
        2,
      )}</strong></td></tr>
    </tbody>
  </table>
  ${signature ? `<div class="sig"><div>Customer Signature:</div><img src="${signature}" alt="Customer Signature" /></div>` : ''}
  <p class="muted">This receipt summarizes collection against multiple invoices.</p>
  <script>window.onload = () => { window.print(); };</script>
</body></html>`
      const win = window.open("", "_blank")
      if (win) {
        win.document.write(html)
        win.document.close()
      }
    } catch {}
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
                          // Limit pendingPaymentsCache to this group's selected invoices
                          const payments = group.invoices
                            .filter((i) => selected[i._id])
                            .map((i) => {
                              const raw = amounts[i._id]
                              const amt = Number(raw)
                              return { model: i.model, id: i._id, amount: isFinite(amt) && amt > 0 ? Math.min(amt, i.balance) : 0 }
                            })
                            .filter((p) => p.amount > 0)
                          if (!payments.length) {
                            toast({ title: 'No valid payments selected in this customer group', variant: 'destructive' })
                            return
                          }
                          setPendingPaymentsCache(payments)
                          setSignatureOpen(true)
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
    </div>
  )
}
