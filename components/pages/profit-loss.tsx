"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getLocalDateString, getDubaiDateDisplayString } from "@/lib/date-utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, TrendingUp, TrendingDown, DollarSign, Trash2, Calendar, Download } from "lucide-react"
import { toast } from "sonner"

interface ProfitLossData {
  revenue: {
    adminGasSales: number
    employeeGasSales: number
    adminCylinderSales: number
    employeeCylinderSales: number
    total: number
  }
  costs: {
    adminGasCosts: number
    employeeGasCosts: number
    expenses: number
    total: number
  }
  profit: {
    gross: number
    net: number
    margin: string
  }
  transactions: {
    adminSalesCount: number
    employeeSalesCount: number
    adminCylinderCount: number
    employeeCylinderCount: number
    expenseCount: number
  }
}

interface Expense {
  _id: string
  expense: number
  description: string
  invoiceNumber?: string
  vatAmount?: number
  totalAmount?: number
  createdAt: string
  updatedAt: string
}

export default function ProfitLoss() {
  const [profitLossData, setProfitLossData] = useState<ProfitLossData | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    invoiceNumber: "",
    expense: "",
    description: "",
  })
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false)
  const [dateRange, setDateRange] = useState({
    from: "",
    to: "",
  })

  useEffect(() => {
    fetchProfitLossData()
    fetchExpenses()
  }, [])

  const fetchProfitLossData = async () => {
    try {
      const response = await fetch("/api/profit-loss")
      const result = await response.json()
      
      if (result.success) {
        setProfitLossData(result.data)
      } else {
        toast.error("Failed to fetch profit & loss data")
      }
    } catch (error) {
      console.error("Error fetching P&L data:", error)
      toast.error("Error loading profit & loss data")
    }
  }

  const fetchExpenses = async () => {
    try {
      const response = await fetch("/api/expenses")
      const result = await response.json()
      
      if (result.success) {
        setExpenses(result.data)
      } else {
        toast.error("Failed to fetch expenses")
      }
    } catch (error) {
      console.error("Error fetching expenses:", error)
      toast.error("Error loading expenses")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.expense || !formData.description || !formData.invoiceNumber) {
      toast.error("Please fill in all fields")
      return
    }

    if (Number(formData.expense) <= 0) {
      toast.error("Expense amount must be greater than 0")
      return
    }

    const expenseAmount = Number(formData.expense)
    const vatAmount = Math.trunc((expenseAmount * 0.05) * 100) / 100
    const totalAmount = Math.trunc((expenseAmount + vatAmount) * 100) / 100

    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceNumber: formData.invoiceNumber,
          expense: expenseAmount,
          description: formData.description,
          vatAmount: vatAmount,
          totalAmount: totalAmount,
        }),
      })

      const result = await response.json()

      if (result.success) {
        toast.success("Expense added successfully")
        setFormData({ invoiceNumber: "", expense: "", description: "" })
        setDialogOpen(false)
        fetchExpenses()
        fetchProfitLossData() // Refresh P&L data to include new expense
      } else {
        toast.error(result.error || "Failed to add expense")
      }
    } catch (error) {
      console.error("Error adding expense:", error)
      toast.error("Error adding expense")
    }
  }

  const handleDeleteExpense = async (id: string) => {
    if (!confirm("Are you sure you want to delete this expense?")) {
      return
    }

    try {
      const response = await fetch(`/api/expenses?id=${id}`, {
        method: "DELETE",
      })

      const result = await response.json()

      if (result.success) {
        toast.success("Expense deleted successfully")
        fetchExpenses()
        fetchProfitLossData() // Refresh P&L data
      } else {
        toast.error(result.error || "Failed to delete expense")
      }
    } catch (error) {
      console.error("Error deleting expense:", error)
      toast.error("Error deleting expense")
    }
  }

  // Format currency to exactly 2 decimal places without rounding
  const formatCurrency = (amount: number) => {
    if (amount === null || amount === undefined || isNaN(amount)) {
      return "AED 0.00"
    }
    return `AED ${Number(amount).toFixed(2)}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const handleDownloadExpensesPDF = async (fromDate?: string, toDate?: string) => {
    // Filter expenses by date range if provided
    let filteredExpenses = expenses
    
    if (fromDate && toDate) {
      const from = new Date(fromDate)
      const to = new Date(toDate)
      to.setHours(23, 59, 59, 999) // Include the entire end date
      
      filteredExpenses = expenses.filter(expense => {
        const expenseDate = new Date(expense.createdAt)
        return expenseDate >= from && expenseDate <= to
      })
      
      if (filteredExpenses.length === 0) {
        toast.error("No expenses found in the selected date range")
        return
      }
    } else if (expenses.length === 0) {
      toast.error("No expenses to download")
      return
    }

    try {
      const [{ default: jsPDF }] = await Promise.all([
        import("jspdf"),
      ])

      const pdf = new jsPDF("p", "mm", "a4")
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 15

      // Title
      pdf.setFontSize(20)
      pdf.setTextColor(43, 48, 104) // #2B3068
      pdf.setFont('helvetica', 'bold')
      pdf.text("SYED TAYYAB INDUSTRIAL", pageWidth / 2, margin + 10, { align: "center" })
      
      pdf.setFontSize(16)
      pdf.text("Business Expenses Report", pageWidth / 2, margin + 20, { align: "center" })
      
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(100, 100, 100)
      pdf.text(`Generated on: ${getDubaiDateDisplayString()}`, pageWidth / 2, margin + 28, { align: "center" })
      
      let currentY = margin + 40
      
      // Add date range if filtering is applied
      if (fromDate && toDate) {
        pdf.text(`Date Range: ${formatDate(fromDate)} to ${formatDate(toDate)}`, pageWidth / 2, margin + 34, { align: "center" })
        currentY = margin + 46 // Adjust starting position when date range is shown
      }

      // Summary
      pdf.setFontSize(12)
      pdf.setTextColor(0, 0, 0)
      pdf.setFont('helvetica', 'bold')
      pdf.text("Summary:", margin, currentY)
      currentY += 8

      const totalExpenseAmount = filteredExpenses.reduce((sum, expense) => sum + expense.expense, 0)
      const totalVATAmount = filteredExpenses.reduce((sum, expense) => {
        const vat = expense.vatAmount || Math.trunc((expense.expense * 0.05) * 100) / 100
        return sum + vat
      }, 0)
      const grandTotal = filteredExpenses.reduce((sum, expense) => {
        if (expense.totalAmount) {
          return sum + expense.totalAmount
        }
        const vat = Math.trunc((expense.expense * 0.05) * 100) / 100
        const total = Math.trunc((expense.expense + vat) * 100) / 100
        return sum + total
      }, 0)

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.text(`Total Expenses: ${filteredExpenses.length}`, margin + 5, currentY)
      currentY += 6
      pdf.text(`Total Amount: AED ${totalExpenseAmount.toFixed(2)}`, margin + 5, currentY)
      currentY += 6
      pdf.text(`Total VAT (5%): AED ${totalVATAmount.toFixed(2)}`, margin + 5, currentY)
      currentY += 6
      pdf.setFont('helvetica', 'bold')
      pdf.text(`Grand Total: AED ${grandTotal.toFixed(2)}`, margin + 5, currentY)
      currentY += 15

      // Table header
      const tableStartY = currentY
      const rowHeight = 8
      const colWidths = [25, 30, 50, 25, 20, 25] // Date, Invoice, Description, Amount, VAT, Total
      const tableWidth = colWidths.reduce((sum, width) => sum + width, 0)
      const tableX = (pageWidth - tableWidth) / 2

      // Header background
      pdf.setFillColor(43, 48, 104) // #2B3068
      pdf.rect(tableX, tableStartY, tableWidth, rowHeight, "F")

      // Header text
      pdf.setFontSize(9)
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'bold')
      
      let colX = tableX
      pdf.text("Date", colX + 2, tableStartY + 5.5)
      colX += colWidths[0]
      
      pdf.text("Invoice #", colX + 2, tableStartY + 5.5)
      colX += colWidths[1]
      
      pdf.text("Description", colX + 2, tableStartY + 5.5)
      colX += colWidths[2]
      
      pdf.text("Amount", colX + colWidths[3] - 2, tableStartY + 5.5, { align: "right" })
      colX += colWidths[3]
      
      pdf.text("VAT 5%", colX + colWidths[4] - 2, tableStartY + 5.5, { align: "right" })
      colX += colWidths[4]
      
      pdf.text("Total", colX + colWidths[5] - 2, tableStartY + 5.5, { align: "right" })

      // Table rows
      pdf.setFontSize(8)
      pdf.setTextColor(0, 0, 0)
      pdf.setFont('helvetica', 'normal')
      
      let currentRowY = tableStartY + rowHeight
      const itemsPerPage = Math.floor((pageHeight - currentRowY - 30) / rowHeight)
      
      filteredExpenses.forEach((expense, index) => {
        // Add new page if needed
        if (index > 0 && index % itemsPerPage === 0) {
          pdf.addPage()
          currentRowY = margin + 20
          
          // Repeat header on new page
          pdf.setFillColor(43, 48, 104)
          pdf.rect(tableX, currentRowY - rowHeight, tableWidth, rowHeight, "F")
          
          pdf.setFontSize(9)
          pdf.setTextColor(255, 255, 255)
          pdf.setFont('helvetica', 'bold')
          
          let headerColX = tableX
          pdf.text("Date", headerColX + 2, currentRowY - rowHeight + 5.5)
          headerColX += colWidths[0]
          pdf.text("Invoice #", headerColX + 2, currentRowY - rowHeight + 5.5)
          headerColX += colWidths[1]
          pdf.text("Description", headerColX + 2, currentRowY - rowHeight + 5.5)
          headerColX += colWidths[2]
          pdf.text("Amount", headerColX + colWidths[3] - 2, currentRowY - rowHeight + 5.5, { align: "right" })
          headerColX += colWidths[3]
          pdf.text("VAT 5%", headerColX + colWidths[4] - 2, currentRowY - rowHeight + 5.5, { align: "right" })
          headerColX += colWidths[4]
          pdf.text("Total", headerColX + colWidths[5] - 2, currentRowY - rowHeight + 5.5, { align: "right" })
          
          pdf.setFontSize(8)
          pdf.setTextColor(0, 0, 0)
          pdf.setFont('helvetica', 'normal')
        }

        // Alternate row background
        if (index % 2 === 0) {
          pdf.setFillColor(249, 250, 251)
          pdf.rect(tableX, currentRowY, tableWidth, rowHeight, "F")
        }

        // Row border
        pdf.setDrawColor(229, 231, 235)
        pdf.setLineWidth(0.1)
        pdf.rect(tableX, currentRowY, tableWidth, rowHeight)

        const vatAmount = expense.vatAmount || Math.trunc((expense.expense * 0.05) * 100) / 100
        const totalAmount = expense.totalAmount || Math.trunc((expense.expense + vatAmount) * 100) / 100

        // Cell content
        let cellX = tableX
        
        // Date
        pdf.text(formatDate(expense.createdAt), cellX + 2, currentRowY + 5.5)
        cellX += colWidths[0]
        
        // Invoice Number
        const invoiceText = expense.invoiceNumber || 'N/A'
        pdf.text(invoiceText.length > 12 ? invoiceText.substring(0, 10) + "..." : invoiceText, cellX + 2, currentRowY + 5.5)
        cellX += colWidths[1]
        
        // Description
        const descText = expense.description.length > 25 ? expense.description.substring(0, 22) + "..." : expense.description
        pdf.text(descText, cellX + 2, currentRowY + 5.5)
        cellX += colWidths[2]
        
        // Amount
        pdf.text(`${expense.expense.toFixed(2)}`, cellX + colWidths[3] - 2, currentRowY + 5.5, { align: "right" })
        cellX += colWidths[3]
        
        // VAT
        pdf.text(`${vatAmount.toFixed(2)}`, cellX + colWidths[4] - 2, currentRowY + 5.5, { align: "right" })
        cellX += colWidths[4]
        
        // Total
        pdf.setFont('helvetica', 'bold')
        pdf.text(`${totalAmount.toFixed(2)}`, cellX + colWidths[5] - 2, currentRowY + 5.5, { align: "right" })
        pdf.setFont('helvetica', 'normal')

        currentRowY += rowHeight
      })

      // Footer
      const footerY = pageHeight - 20
      pdf.setFontSize(8)
      pdf.setTextColor(100, 100, 100)
      pdf.text("SYED TAYYAB INDUSTRIAL - Business Expenses Report", pageWidth / 2, footerY, { align: "center" })

      // Save PDF
      const fileName = `Business_Expenses_${getLocalDateString()}.pdf`
      pdf.save(fileName)
      
      toast.success("Expenses PDF downloaded successfully")
    } catch (error) {
      console.error("Error generating PDF:", error)
      toast.error("Failed to generate PDF")
    }
  }

  const handlePdfDownloadClick = () => {
    setPdfDialogOpen(true)
    // Set default date range to current month
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    
    setDateRange({
      from: firstDay.toISOString().split('T')[0],
      to: lastDay.toISOString().split('T')[0]
    })
  }

  const handlePdfDownload = () => {
    if (!dateRange.from || !dateRange.to) {
      toast.error("Please select both from and to dates")
      return
    }

    if (new Date(dateRange.from) > new Date(dateRange.to)) {
      toast.error("From date cannot be later than to date")
      return
    }

    handleDownloadExpensesPDF(dateRange.from, dateRange.to)
    setPdfDialogOpen(false)
  }

  if (loading) {
    return (
      <div className="p-3 sm:p-4 lg:p-6 xl:p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading P&L data...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 xl:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">
            Profit & Loss
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Financial overview and expense management
          </p>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Add Expense
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add New Expense</DialogTitle>
              <DialogDescription>
                Add a new expense to track your business costs
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invoiceNumber">Invoice Number *</Label>
                <Input
                  id="invoiceNumber"
                  type="text"
                  placeholder="Enter invoice number"
                  value={formData.invoiceNumber}
                  onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                  className="h-11 sm:h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expense">Expense Amount (AED) *</Label>
                <Input
                  id="expense"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Enter expense amount"
                  value={formData.expense}
                  onChange={(e) => setFormData({ ...formData, expense: e.target.value })}
                  className="h-11 sm:h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vatAmount">VAT 5%</Label>
                <Input
                  id="vatAmount"
                  type="text"
                  value={`AED ${(Math.trunc(((Number(formData.expense) || 0) * 0.05) * 100) / 100).toFixed(2)}`}
                  readOnly
                  className="h-11 sm:h-12 bg-gray-50 text-gray-700"
                  placeholder="VAT will be calculated"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalAmount">Total Amount (AED)</Label>
                <Input
                  id="totalAmount"
                  type="text"
                  value={`AED ${(Math.trunc(((Number(formData.expense) || 0) + Math.trunc(((Number(formData.expense) || 0) * 0.05) * 100) / 100) * 100) / 100).toFixed(2)}`}
                  readOnly
                  className="h-11 sm:h-12 bg-blue-50 text-blue-700 font-semibold"
                  placeholder="Total will be calculated"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Enter expense description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="min-h-[80px] resize-none"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Add Expense</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* P&L Summary Cards */}
      {profitLossData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(profitLossData.revenue.total)}
              </div>
              <p className="text-xs text-muted-foreground">
                From all sales channels
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Costs</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(profitLossData.costs.total)}
              </div>
              <p className="text-xs text-muted-foreground">
                Product costs + expenses
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${profitLossData.profit.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(profitLossData.profit.net)}
              </div>
              <p className="text-xs text-muted-foreground">
                Revenue - all costs
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${Number(profitLossData.profit.margin) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {profitLossData.profit.margin}%
              </div>
              <p className="text-xs text-muted-foreground">
                Net profit percentage
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Breakdown */}
      {profitLossData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-green-600">Revenue Breakdown</CardTitle>
              <CardDescription>Income from all sales channels</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Admin Gas Sales</span>
                <span className="font-semibold">{formatCurrency(profitLossData.revenue.adminGasSales)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Employee Gas Sales</span>
                <span className="font-semibold">{formatCurrency(profitLossData.revenue.employeeGasSales)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Admin Cylinder Sales</span>
                <span className="font-semibold">{formatCurrency(profitLossData.revenue.adminCylinderSales)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Employee Cylinder Sales</span>
                <span className="font-semibold">{formatCurrency(profitLossData.revenue.employeeCylinderSales)}</span>
              </div>
              <hr />
              <div className="flex justify-between items-center font-bold text-green-600">
                <span>Total Revenue</span>
                <span>{formatCurrency(profitLossData.revenue.total)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Costs Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-red-600">Costs Breakdown</CardTitle>
              <CardDescription>All business expenses and costs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Admin Gas Costs</span>
                <span className="font-semibold">{formatCurrency(profitLossData.costs.adminGasCosts)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Employee Gas Costs</span>
                <span className="font-semibold">{formatCurrency(profitLossData.costs.employeeGasCosts)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Business Expenses</span>
                <span className="font-semibold">{formatCurrency(profitLossData.costs.expenses)}</span>
              </div>
              <hr />
              <div className="flex justify-between items-center font-bold text-red-600">
                <span>Total Costs</span>
                <span>{formatCurrency(profitLossData.costs.total)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Expenses Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-semibold">Business Expenses</CardTitle>
              <CardDescription>All recorded business expenses</CardDescription>
            </div>
            {expenses.length > 0 && (
              <Button
                onClick={handlePdfDownloadClick}
                variant="outline"
                className="w-full sm:w-auto text-[#2B3068] border-[#2B3068] hover:bg-[#2B3068] hover:text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No expenses recorded yet</p>
              <p className="text-sm text-gray-400 mt-1">Click "Add Expense" to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice Number</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount (AED)</TableHead>
                    <TableHead className="text-right">VAT 5%</TableHead>
                    <TableHead className="text-right">Total (AED)</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => {
                    const vatAmount = expense.vatAmount || Math.trunc((expense.expense * 0.05) * 100) / 100
                    const totalAmount = expense.totalAmount || Math.trunc((expense.expense + vatAmount) * 100) / 100
                    return (
                    <TableRow key={expense._id}>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          {formatDate(expense.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {expense.invoiceNumber || 'N/A'}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xs truncate" title={expense.description}>
                          {expense.description}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(expense.expense)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {formatCurrency(vatAmount)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-blue-600">
                        {formatCurrency(totalAmount)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteExpense(expense._id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PDF Date Range Dialog */}
      <Dialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Download Expenses PDF</DialogTitle>
            <DialogDescription>
              Select date range to filter expenses for PDF download
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fromDate">From Date</Label>
              <Input
                id="fromDate"
                type="date"
                value={dateRange.from}
                onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                className="h-11 sm:h-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="toDate">To Date</Label>
              <Input
                id="toDate"
                type="date"
                value={dateRange.to}
                onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                className="h-11 sm:h-12"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPdfDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              type="button" 
              onClick={handlePdfDownload}
              className="bg-[#2B3068] hover:bg-[#1a1f4a]"
            >
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
