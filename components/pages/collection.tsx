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
import { Download, Printer, RefreshCcw } from "lucide-react"

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
  const [search, setSearch] = useState("")

  const fetchData = async () => {
    setLoading(true)
    try {
      // For both admin and employee show the same unified pending list
      const res = await fetch(`/api/collections`)
      const data = await res.json().catch(() => ({}))
      const arr: PendingInvoice[] = Array.isArray(data?.data) ? data.data : []
      setInvoices(arr)
    } catch (e: any) {
      toast({ title: "Failed to load pending invoices", description: e?.message || "", variant: "destructive" })
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return invoices
    return invoices.filter((inv) =>
      [
        inv.invoiceNumber,
        inv.customer?.name || "",
        inv.employee?.name || "",
        inv.paymentStatus || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    )
  }, [invoices, search])

  const totalSelected = useMemo(() =>
    filtered.filter((i) => selected[i._id]).length,
  [filtered, selected])

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

  const handleCollect = async () => {
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
      // Optional: open a simple print window summarizing collection
      openPrintWindow(payments)
    } catch (e: any) {
      toast({ title: "Collection failed", description: e?.message || "", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const openPrintWindow = (payments: Array<{ model: string; id: string; amount: number }>) => {
    try {
      const summary = payments.map((p) => `• ${p.model} #${p.id} — AED ${p.amount.toFixed(2)}`).join("\n")
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
            <p className="text-white/80 text-sm">View and collect pending amounts from all customers</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fetchData} disabled={loading}>
              <RefreshCcw className="w-4 h-4 mr-2" /> Refresh
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base sm:text-lg">Pending Invoices</CardTitle>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Input
              placeholder="Search by invoice, customer, employee, status..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-2"><Checkbox checked={filtered.every((i) => selected[i._id]) && filtered.length > 0} onCheckedChange={(v) => setSelectAll(Boolean(v))} /></th>
                  <th className="text-left p-2">Invoice</th>
                  <th className="text-left p-2">Customer</th>
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
                {filtered.length === 0 && (
                  <tr>
                    <td className="p-4 text-center text-gray-500" colSpan={10}>No pending invoices</td>
                  </tr>
                )}
                {filtered.map((inv) => (
                  <tr key={inv._id} className="border-b">
                    <td className="p-2 align-middle">
                      <Checkbox checked={!!selected[inv._id]} onCheckedChange={(v) => handleSelect(inv._id, Boolean(v))} />
                    </td>
                    <td className="p-2 align-middle font-medium">{inv.invoiceNumber}</td>
                    <td className="p-2 align-middle">{inv.customer?.name || '-'}</td>
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
              <Button onClick={handleCollect} disabled={loading || totalSelected === 0}>
                Collect Payments
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
