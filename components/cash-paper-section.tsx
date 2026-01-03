"use client"
import React, { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, FileText } from "lucide-react"
import { getLocalDateString } from "@/lib/date-utils"

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

const CashPaperSection = ({
  title = "Cash Paper",
  employeeId,
}: {
  title?: string
  employeeId?: string
}) => {
  const [fromDate, setFromDate] = useState<string>(getLocalDateString())
  const [toDate, setToDate] = useState<string>(getLocalDateString())
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
    totals: { totalCredit: number; totalDebit: number; totalOther: number; totalDepositCylinder: number; totalReturnCylinder: number; totalRental: number; totalVat?: number; grandTotal: number }
    fromDate?: string
    toDate?: string
  } | null>(null)

  const fetchData = async () => {
    if (!fromDate || !toDate) return
    if (fromDate > toDate) {
      alert('From Date cannot be greater than To Date')
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("fromDate", fromDate)
      params.set("toDate", toDate)
      if (employeeId) params.set("employeeId", employeeId)
      const url = `/api/reports/cash-paper?${params.toString()}`
      const res = await fetch(url, { cache: "no-store" })
      const json = await res.json()
      if (json?.success) {
        setData(json.data)
      } else {
        console.error('Cash paper API error:', json.error)
        alert(json.error || 'Failed to fetch cash paper data')
        setData(null)
      }
    } catch (error) {
      console.error('Cash paper fetch error:', error)
      alert('Failed to fetch cash paper data. Please check your connection and try again.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, employeeId])

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

      const dateRange = fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`
      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Cash Paper - ${dateRange}</title>
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
  <h1>${title} – ${dateRange}${employeeId ? ` (Employee: ${data.creditSales?.[0]?.employeeName || ''})` : ''}</h1>

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
      <tr><td>Total VAT (5%)</td><td class='right'>${currency(data.totals.totalVat || 0)}</td></tr>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-2">
            <Label htmlFor="cashPaperFromDate">From Date</Label>
            <Input id="cashPaperFromDate" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cashPaperToDate">To Date</Label>
            <Input id="cashPaperToDate" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={fetchData} disabled={loading} style={{ backgroundColor: "#2B3068" }}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Refresh
            </Button>
          </div>
          <div className="flex items-end">
            <Button onClick={downloadPdf} variant="outline" disabled={!data}>
              <FileText className="h-4 w-4 mr-2" /> Download PDF
            </Button>
          </div>
        </div>

        {/* Date Range Info */}
        {data && (
          <div className="text-sm text-gray-600 mb-2">
            Showing data from <strong>{data.fromDate || fromDate}</strong> to <strong>{data.toDate || toDate}</strong>
            {data.counts && (
              <span className="ml-2">({data.counts.total} transactions)</span>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-4 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
            Loading cash paper data...
          </div>
        )}

        {/* No Data State */}
        {!loading && !data && (
          <div className="text-center py-4 text-gray-500">
            No data found for the selected date range. Please try a different date range.
          </div>
        )}

        {/* Quick totals */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="border rounded p-3">
              <div className="text-gray-600">Credit</div>
              <div className="font-semibold">{currency(data.totals.totalCredit)}</div>
              {data.counts && <div className="text-xs text-gray-500 mt-1">{data.counts.credit} transactions</div>}
            </div>
            <div className="border rounded p-3">
              <div className="text-gray-600">Debit</div>
              <div className="font-semibold">{currency(data.totals.totalDebit)}</div>
              {data.counts && <div className="text-xs text-gray-500 mt-1">{data.counts.debit} transactions</div>}
            </div>
            <div className="border rounded p-3">
              <div className="text-gray-600">Other</div>
              <div className="font-semibold">{currency(data.totals.totalOther)}</div>
              {data.counts && <div className="text-xs text-gray-500 mt-1">{data.counts.other} transactions</div>}
            </div>
            <div className="border rounded p-3">
              <div className="text-gray-600">Grand Total</div>
              <div className="font-semibold">{currency(data.totals.grandTotal)}</div>
              {data.counts && <div className="text-xs text-gray-500 mt-1">{data.counts.total} total</div>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default CashPaperSection
