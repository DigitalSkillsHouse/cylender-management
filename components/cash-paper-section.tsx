"use client"
import React, { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, FileText } from "lucide-react"

type CashPaperRecord = {
  _id: string
  invoiceNumber: string
  employeeName: string
  customerName: string
  totalAmount: number
  receivedAmount: number
  paymentMethod: string
  paymentStatus: string
  createdAt: string
  type?: string // For cylinder transactions: 'deposit', 'return', 'refill'
}

export default function CashPaperSection({
  title = "Cash Paper",
  employeeId,
}: {
  title?: string
  employeeId?: string
}) {
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState<boolean>(false)
  const [data, setData] = useState<{
    counts: { credit: number; debit: number; other: number; depositCylinder: number; returnCylinder: number; rental: number; total: number }
    creditSales: CashPaperRecord[]
    debitSales: CashPaperRecord[]
    otherSales: CashPaperRecord[]
    depositCylinderSales: CashPaperRecord[]
    returnCylinderSales: CashPaperRecord[]
    rentalSales: CashPaperRecord[]
    otherByMethod: Record<string, number>
    totals: { totalCredit: number; totalDebit: number; totalOther: number; totalDepositCylinder: number; totalReturnCylinder: number; totalRental: number; grandTotal: number }
  } | null>(null)

  const fetchData = async () => {
    if (!date) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("date", date)
      if (employeeId) params.set("employeeId", employeeId)
      const res = await fetch(`/api/reports/cash-paper?${params.toString()}`, { cache: "no-store" })
      const json = await res.json()
      if (json?.success) {
        setData(json.data)
      } else {
        setData(null)
      }
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, employeeId])

  const currency = (n: number) => new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED" }).format(n || 0)

  const downloadPdf = () => {
    if (!data) return
    try {
      const vat = (n: number) => (Number(n || 0) * 0.05)
      
      const creditRows = (data.creditSales || [])
        .map(r => `<tr><td>${r.invoiceNumber}</td><td>${r.customerName || "-"}</td><td class='right'>${currency(vat(r.totalAmount))}</td><td class='right'>${currency(r.totalAmount)}</td></tr>`) 
        .join("")
      const debitRows = (data.debitSales || [])
        .map(r => `<tr><td>${r.invoiceNumber}</td><td>${r.customerName || "-"}</td><td class='right'>${currency(vat(r.totalAmount))}</td><td class='right'>${currency(r.totalAmount)}</td></tr>`) 
        .join("")
      const otherRows = (data.otherSales || [])
        .map((r: any) => `<tr><td>${r.invoiceNumber || '-'}</td><td>${r.customerName || '-'}</td><td class='right'>${currency(vat(Number(r.totalAmount || 0)))}</td><td class='right'>${currency(r.totalAmount)}</td></tr>`) 
        .join("")
      const depositCylinderRows = (data.depositCylinderSales || [])
        .map((r: any) => `<tr><td>${r.invoiceNumber || '-'}</td><td>${r.customerName || '-'}</td><td class='right'>${currency(r.totalAmount)}</td></tr>`) 
        .join("")
      const returnCylinderRows = (data.returnCylinderSales || [])
        .map((r: any) => `<tr><td>${r.invoiceNumber || '-'}</td><td>${r.customerName || '-'}</td><td class='right'>${currency(r.totalAmount)}</td></tr>`) 
        .join("")
      const rentalRows = (data.rentalSales || [])
        .map((r: any) => `<tr><td>${r.invoiceNumber || '-'}</td><td>${r.customerName || '-'}</td><td class='right'>${currency(Number(r.totalVat || 0))}</td><td class='right'>${currency(r.totalAmount)}</td></tr>`) 
        .join("")

      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Cash Paper - ${date}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 16px; }
    h1 { font-size: 18px; margin: 0 0 12px; }
    h2 { font-size: 14px; margin: 16px 0 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
    th { background: #f7f7f7; text-align: left; }
    tfoot td { font-weight: bold; }
    .right { text-align: right; }
  </style>
</head>
<body>
  <h1>${title} – ${date}${employeeId ? ` (Employee: ${data.creditSales?.[0]?.employeeName || ''})` : ''}</h1>

  <h2>Credit Sale Invoices List</h2>
  <table>
    <thead>
      <tr><th>Inv Id</th><th>Customer</th><th class='right'>VAT 5%</th><th class='right'>Amount</th></tr>
    </thead>
    <tbody>
      ${creditRows || `<tr><td colspan='4' style='text-align:center'>No credit sales</td></tr>`}
    </tbody>
    <tfoot>
      <tr><td colspan='3'><b>Total Credit</b></td><td class='right'><b>${currency(data.totals.totalCredit)}</b></td></tr>
    </tfoot>
  </table>

  <h2>Cash Sale Invoices List</h2>
  <table>
    <thead>
      <tr><th>Inv Id</th><th>Customer</th><th class='right'>VAT 5%</th><th class='right'>Amount</th></tr>
    </thead>
    <tbody>
      ${debitRows || `<tr><td colspan='4' style='text-align:center'>No debit sales</td></tr>`}
    </tbody>
    <tfoot>
      <tr><td colspan='3'><b>Total Debit</b></td><td class='right'><b>${currency(data.totals.totalDebit)}</b></td></tr>
    </tfoot>
  </table>

  <h2>Deposit Cylinder Invoice</h2>
  <table>
    <thead>
      <tr><th>Inv Id</th><th>Customer</th><th class='right'>Amount</th></tr>
    </thead>
    <tbody>
      ${depositCylinderRows || `<tr><td colspan='3' style='text-align:center'>No deposit cylinder transactions</td></tr>`}
    </tbody>
    <tfoot>
      <tr><td colspan='2'><b>Total Deposit Cylinder</b></td><td class='right'><b>${currency(data.totals.totalDepositCylinder || 0)}</b></td></tr>
    </tfoot>
  </table>

  <h2>Return Cylinder Invoice</h2>
  <table>
    <thead>
      <tr><th>Inv Id</th><th>Customer</th><th class='right'>Amount</th></tr>
    </thead>
    <tbody>
      ${returnCylinderRows || `<tr><td colspan='3' style='text-align:center'>No return cylinder transactions</td></tr>`}
    </tbody>
    <tfoot>
      <tr><td colspan='2'><b>Total Return Cylinder</b></td><td class='right'><b>${currency(data.totals.totalReturnCylinder || 0)}</b></td></tr>
    </tfoot>
  </table>

  <h2>Rental Collection Invoice</h2>
  <table>
    <thead>
      <tr><th>Inv Id</th><th>Customer</th><th class='right'>VAT 5%</th><th class='right'>Amount</th></tr>
    </thead>
    <tbody>
      ${rentalRows || `<tr><td colspan='4' style='text-align:center'>No rental invoices</td></tr>`}
    </tbody>
    <tfoot>
      <tr><td colspan='3'><b>Total Rental Collection</b></td><td class='right'><b>${currency(data.totals.totalRental || 0)}</b></td></tr>
    </tfoot>
  </table>

  <h2>Summary</h2>
  <table>
    <tbody>
      <tr><td>Total Credit</td><td class='right'>${currency(data.totals.totalCredit)}</td></tr>
      <tr><td>Total Debit</td><td class='right'>${currency(data.totals.totalDebit)}</td></tr>
      <tr><td>Other</td><td class='right'>${currency(data.totals.totalOther)}</td></tr>
      <tr><td>Total Rental Collection</td><td class='right'>${currency(data.totals.totalRental || 0)}</td></tr>
      <tr><td><b>Grand Total</b></td><td class='right'><b>${currency(data.totals.grandTotal)}</b></td></tr>
    </tbody>
  </table>
</body>
</html>`

      const w = window.open('', '_blank')
      if (!w) return alert('Please allow popups to download the PDF.')
      w.document.write(html)
      w.document.close()
      w.focus()
      w.print()
    } catch (e) {
      console.error('Cash paper PDF error', e)
      alert('Failed to prepare PDF')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle style={{ color: "#2B3068" }}>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label htmlFor="cashPaperDate">Date</Label>
            <Input id="cashPaperDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={fetchData} disabled={loading} style={{ backgroundColor: "#2B3068" }}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Refresh
            </Button>
          </div>
          <div className="flex items-end">
            <Button onClick={downloadPdf} variant="outline">
              <FileText className="h-4 w-4 mr-2" /> Download PDF
            </Button>
          </div>
        </div>

        {/* Quick totals */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="border rounded p-3">
              <div className="text-gray-600">Credit</div>
              <div className="font-semibold">{currency(data.totals.totalCredit)}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-gray-600">Debit</div>
              <div className="font-semibold">{currency(data.totals.totalDebit)}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-gray-600">Other</div>
              <div className="font-semibold">{currency(data.totals.totalOther)}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-gray-600">Grand Total</div>
              <div className="font-semibold">{currency(data.totals.grandTotal)}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
