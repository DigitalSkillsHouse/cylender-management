"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, FileText, Receipt, Edit, Trash, Download, Calendar, Loader2 } from "lucide-react"
import { SignatureDialog } from "@/components/signature-dialog"
import { ReceiptDialog } from "@/components/receipt-dialog"
import jsPDF from "jspdf"
import { getLocalDateString, getDubaiDateDisplayString } from "@/lib/date-utils"

interface Customer {
  _id: string
  name: string
  companyName?: string
}

interface Product {
  _id: string
  name: string
  category: string
}

interface RentalItem {
  productId: string
  productName: string
  quantity: number
  days: number
  amountPerDay: number
  subtotal: number
  vat: number
  total: number
}

interface RentalData {
  date: string
  customerId: string
  customerName: string
  items: RentalItem[]
  subtotal: number
  totalVat: number
  finalTotal: number
}

interface RentalCollectionProps {
  user?: {
    id: string
    name: string
    role: "admin" | "employee"
  }
}

export const RentalCollection = ({ user }: RentalCollectionProps = {}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [rentals, setRentals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  
  // Signature and receipt states
  const [showSignatureDialog, setShowSignatureDialog] = useState(false)
  const [pendingRental, setPendingRental] = useState<any>(null)
  const [customerSignature, setCustomerSignature] = useState<string>("")
  const [receiptRental, setReceiptRental] = useState<any>(null)
  
  // Form state
  const [rentalData, setRentalData] = useState<RentalData>({
    date: getLocalDateString(),
    customerId: "",
    customerName: "",
    items: [],
    subtotal: 0,
    totalVat: 0,
    finalTotal: 0
  })
  
  // Current item being added
  const [currentItem, setCurrentItem] = useState({
    productId: "",
    productName: "",
    quantity: "",
    days: "",
    amount: "10" // Default amount is 10
  })
  
  // Search states
  const [customerSearchTerm, setCustomerSearchTerm] = useState("")
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false)
  const [productSearchTerm, setProductSearchTerm] = useState("")
  const [showProductSuggestions, setShowProductSuggestions] = useState(false)
  
  // Date filter states
  const [showDateFilters, setShowDateFilters] = useState(false)
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  
  // PDF generation states
  const [showPDFDatePopup, setShowPDFDatePopup] = useState(false)
  const [pdfFromDate, setPdfFromDate] = useState("")
  const [pdfToDate, setPdfToDate] = useState("")
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [adminSignature, setAdminSignature] = useState<string | null>(null)
  
  // Load admin signature from database first, fallback to localStorage
  useEffect(() => {
    const loadAdminSignature = async () => {
      try {
        // Try database first
        const response = await fetch("/api/admin-signature", {
          cache: "no-store",
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.data?.signature) {
            // Cache in localStorage
            if (typeof window !== "undefined") {
              try {
                localStorage.setItem("adminSignature", data.data.signature)
              } catch (e) {
                console.warn("Failed to cache admin signature", e)
              }
            }
            setAdminSignature(data.data.signature)
            return
          }
        }
      } catch (error) {
        console.warn("Failed to fetch admin signature from database:", error)
      }

      // Fallback to localStorage
      try {
        const sig = typeof window !== "undefined" ? localStorage.getItem("adminSignature") : null
        setAdminSignature(sig)
      } catch (e) {
        setAdminSignature(null)
      }
    }

    loadAdminSignature()
  }, [])

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      
      // Fetch customers with error handling
      let customersData: Customer[] = []
      try {
        const customersRes = await fetch('/api/customers', { cache: 'no-store' })
        if (customersRes.ok) {
          const customersResponse = await customersRes.json()
          customersData = Array.isArray(customersResponse.data?.data) 
            ? customersResponse.data.data 
            : Array.isArray(customersResponse.data) 
              ? customersResponse.data 
              : Array.isArray(customersResponse) 
                ? customersResponse 
                : []
          setCustomers(customersData)
          console.log('Customers fetched:', customersData.length)
        }
      } catch (error) {
        console.error("Failed to fetch customers:", error)
        setCustomers([])
      }
      
      // Fetch products with error handling
      let productsData: Product[] = []
      try {
        const productsRes = await fetch('/api/products', { cache: 'no-store' })
        if (productsRes.ok) {
          const productsResponse = await productsRes.json()
          // Normalize products from Products API (same as cylinder management)
          const rawProducts = Array.isArray(productsResponse.data?.data)
            ? productsResponse.data.data
            : Array.isArray(productsResponse.data)
              ? productsResponse.data
              : Array.isArray(productsResponse)
                ? productsResponse
                : []

          const allProductsData: Product[] = (rawProducts as any[]).map((p: any) => ({
            _id: p._id,
            name: p.name,
            category: p.category,
          }))

          // Filter only cylinder products
          const cylinderProducts = allProductsData.filter((product: Product) => 
            product.category === 'cylinder'
          )
          
          setProducts(cylinderProducts)
          console.log('Cylinder products fetched:', cylinderProducts.length)
        }
      } catch (error) {
        console.error("Failed to fetch products:", error)
        setProducts([])
      }
      
      // Fetch rentals with error handling
      try {
        const rentalsRes = await fetch('/api/rentals', { cache: 'no-store' })
        if (rentalsRes.ok) {
          const rentalsData = await rentalsRes.json()
          setRentals(rentalsData.data || [])
          console.log('Rentals fetched:', (rentalsData.data || []).length)
        }
      } catch (error) {
        console.error("Failed to fetch rentals:", error)
        setRentals([])
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateItemTotal = (quantity: number, days: number, amount: number) => {
    const subtotal = quantity * days * amount
    const vat = subtotal * 0.05
    const total = subtotal + vat
    return { subtotal, vat, total }
  }

  const addItem = () => {
    if (!currentItem.productId || !currentItem.quantity || !currentItem.days) {
      alert("Please fill all item fields")
      return
    }

    const quantity = parseInt(currentItem.quantity)
    const days = parseInt(currentItem.days)
    const amount = parseFloat(currentItem.amount)
    
    const { subtotal, vat, total } = calculateItemTotal(quantity, days, amount)
    
    const newItem: RentalItem = {
      productId: currentItem.productId,
      productName: currentItem.productName,
      quantity,
      days,
      amountPerDay: amount,
      subtotal,
      vat,
      total
    }

    const updatedItems = [...rentalData.items, newItem]
    const newSubtotal = updatedItems.reduce((sum, item) => sum + item.subtotal, 0)
    const newTotalVat = updatedItems.reduce((sum, item) => sum + item.vat, 0)
    const newFinalTotal = newSubtotal + newTotalVat

    setRentalData({
      ...rentalData,
      items: updatedItems,
      subtotal: newSubtotal,
      totalVat: newTotalVat,
      finalTotal: newFinalTotal
    })

    // Reset current item
    setCurrentItem({
      productId: "",
      productName: "",
      quantity: "",
      days: "",
      amount: "10"
    })
    setProductSearchTerm("")
  }

  const removeItem = (index: number) => {
    const updatedItems = rentalData.items.filter((_, i) => i !== index)
    const newSubtotal = updatedItems.reduce((sum, item) => sum + item.subtotal, 0)
    const newTotalVat = updatedItems.reduce((sum, item) => sum + item.vat, 0)
    const newFinalTotal = newSubtotal + newTotalVat

    setRentalData({
      ...rentalData,
      items: updatedItems,
      subtotal: newSubtotal,
      totalVat: newTotalVat,
      finalTotal: newFinalTotal
    })
  }

  const handleSubmit = async () => {
    if (!rentalData.customerId || rentalData.items.length === 0) {
      alert("Please select customer and add at least one item")
      return
    }

    // Show signature dialog first
    setShowSignatureDialog(true)
  }

  const handleSignatureComplete = async (signature: string) => {
    console.log('RentalCollection - Signature received:', signature)
    setCustomerSignature(signature)
    setShowSignatureDialog(false)

    // Check if this is for a new rental or existing rental receipt
    if (pendingRental) {
      // This is for an existing rental receipt
      showReceiptForRental(pendingRental)
      setPendingRental(null)
      return
    }

    // This is for a new rental - save the rental
    setSubmitting(true)
    try {
      // Prepare data for API
      const rentalPayload = {
        date: rentalData.date,
        customerId: rentalData.customerId,
        customerName: rentalData.customerName,
        items: rentalData.items.map(item => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          days: item.days,
          amountPerDay: item.amountPerDay
        }))
      }

      console.log('Sending rental payload:', rentalPayload)

      const response = await fetch('/api/rentals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(rentalPayload)
      })

      const result = await response.json()
      console.log('Rental API response:', result)

      if (result.success) {
        // Convert rental data to receipt format
        const receiptData = {
          _id: result.data._id,
          invoiceNumber: result.data.rentalNumber,
          customer: {
            name: result.data.customerName,
            phone: '',
            address: '',
          },
          items: result.data.items.map((item: any) => ({
            product: {
              name: item.productName,
              price: item.amountPerDay
            },
            quantity: item.quantity,
            days: item.days, // Add days information for receipt
            price: item.amountPerDay,
            total: item.total
          })),
          totalAmount: result.data.finalTotal,
          paymentMethod: 'rental',
          paymentStatus: 'active',
          type: 'rental',
          createdAt: result.data.createdAt || new Date().toISOString(),
          customerSignature: signature
        }

        // Show receipt with signature
        setReceiptRental(receiptData)
        
        // Refresh data to show new rental
        await fetchData()
        
        // Reset form
        setRentalData({
          date: getLocalDateString(),
          customerId: "",
          customerName: "",
          items: [],
          subtotal: 0,
          totalVat: 0,
          finalTotal: 0
        })
        setCustomerSearchTerm("")
        setIsDialogOpen(false)
      } else {
        alert(`Failed to generate rental: ${result.error}`)
      }
    } catch (error) {
      console.error('Error generating rental:', error)
      alert('Failed to generate rental')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSignatureCancel = () => {
    setShowSignatureDialog(false)
    setCustomerSignature("")
    setPendingRental(null)
  }

  // Handle receipt button click for existing rentals - show signature dialog first
  const handleReceiptClick = (rental: any) => {
    if (!customerSignature) {
      // No signature yet - show signature dialog first
      setPendingRental(rental)
      setShowSignatureDialog(true)
    } else {
      // Signature already exists - show receipt directly with existing signature
      showReceiptForRental(rental)
    }
  }

  // Show receipt for rental with signature
  const showReceiptForRental = (rental: any) => {
    const receiptData = {
      _id: rental._id,
      invoiceNumber: rental.rentalNumber,
      customer: {
        name: rental.customerName,
        phone: '',
        address: '',
      },
      items: rental.items.map((item: any) => ({
        product: {
          name: item.productName,
          price: item.amountPerDay
        },
        quantity: item.quantity,
        days: item.days, // Add days information for receipt
        price: item.amountPerDay,
        total: item.total
      })),
      totalAmount: rental.finalTotal,
      paymentMethod: 'rental',
      paymentStatus: rental.status,
      type: 'rental',
      createdAt: rental.createdAt,
      customerSignature: customerSignature // Use existing signature if available
    }

    setReceiptRental(receiptData)
  }

  // Handle edit rental
  const handleEditRental = (rental: any) => {
    // TODO: Implement edit functionality
    alert(`Edit functionality for rental ${rental.rentalNumber} - Coming soon!`)
  }

  // Handle delete rental
  const handleDeleteRental = async (rental: any) => {
    if (confirm(`Are you sure you want to delete rental ${rental.rentalNumber}?`)) {
      try {
        const response = await fetch(`/api/rentals?id=${rental._id}`, {
          method: 'DELETE'
        })
        
        const result = await response.json()
        
        if (result.success) {
          alert('Rental deleted successfully!')
          await fetchData() // Refresh the rental list
        } else {
          alert(`Failed to delete rental: ${result.error}`)
        }
      } catch (error) {
        console.error('Error deleting rental:', error)
        alert('Failed to delete rental')
      }
    }
  }

  const filteredCustomers = customers.filter(customer =>
    customerSearchTerm.trim().length === 0 ? true :
    (customer.name || customer.companyName || '').toLowerCase().includes(customerSearchTerm.toLowerCase())
  )

  const filteredProducts = products.filter(product =>
    productSearchTerm.trim().length === 0 ? true :
    product.name.toLowerCase().includes(productSearchTerm.toLowerCase())
  )

  // Filter rentals by date range
  const filteredRentals = rentals.filter((rental) => {
    if (!fromDate && !toDate) return true
    const rentalDate = new Date(rental.date)
    let matches = true
    if (fromDate) {
      const from = new Date(fromDate)
      matches = matches && rentalDate >= from
    }
    if (toDate) {
      const to = new Date(toDate)
      to.setHours(23, 59, 59, 999)
      matches = matches && rentalDate <= to
    }
    return matches
  })

  // Generate PDF function
  const generateRentalPDF = async () => {
    setGeneratingPDF(true)
    try {
      // Filter rentals based on PDF date range
      const pdfFilteredRentals = rentals.filter((r) => {
        let matchesDateRange = true
        if (pdfFromDate || pdfToDate) {
          const rentalDate = new Date(r.date)
          if (pdfFromDate) {
            const from = new Date(pdfFromDate)
            matchesDateRange = matchesDateRange && rentalDate >= from
          }
          if (pdfToDate) {
            const to = new Date(pdfToDate)
            to.setHours(23, 59, 59, 999)
            matchesDateRange = matchesDateRange && rentalDate <= to
          }
        }
        return matchesDateRange
      })

      const pdf = new jsPDF("p", "mm", "a4")
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 15

      // Load and add header image (rental invoice header)
      const headerImg = new Image()
      headerImg.crossOrigin = "anonymous"
      
      await new Promise<void>((resolve, reject) => {
        headerImg.onload = () => {
          try {
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            
            const aspectRatio = headerImg.width / headerImg.height
            const headerWidth = pageWidth - (margin * 2)
            const headerHeight = headerWidth / aspectRatio
            
            canvas.width = headerImg.width
            canvas.height = headerImg.height
            
            if (ctx) {
              ctx.drawImage(headerImg, 0, 0)
              const headerImgData = canvas.toDataURL("image/png")
              pdf.addImage(headerImgData, "PNG", margin, margin, headerWidth, headerHeight)
            }
            resolve()
          } catch (err) {
            console.warn("Failed to add header image:", err)
            resolve()
          }
        }
        headerImg.onerror = () => {
          console.warn("Failed to load header image")
          resolve()
        }
        headerImg.src = "/images/rental_Invoice_page.jpg"
      })

      let currentY = margin + 65

      // Add generated date below header image
      pdf.setFontSize(10)
      pdf.setTextColor(100, 100, 100)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Generated on: ${getDubaiDateDisplayString()}`, pageWidth / 2, currentY, { align: "center" })
      currentY += 6

      // Add date range if filtering is applied
      if (pdfFromDate && pdfToDate) {
        pdf.setFontSize(10)
        pdf.setTextColor(100, 100, 100)
        pdf.setFont('helvetica', 'normal')
        pdf.text(`Date Range: ${new Date(pdfFromDate).toLocaleDateString()} to ${new Date(pdfToDate).toLocaleDateString()}`, pageWidth / 2, currentY, { align: "center" })
        currentY += 8
      } else {
        currentY += 6
      }

      // Table header - Date, Invoice No, Customer Name, Amount, VAT, Total + VAT
      const tableStartY = currentY
      const rowHeight = 8
      const colWidths = [30, 35, 50, 30, 25, 30] // Date, Invoice No, Customer Name, Amount, VAT, Total + VAT
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
      
      pdf.text("Invoice No", colX + 2, tableStartY + 5.5)
      colX += colWidths[1]
      
      pdf.text("Customer Name", colX + 2, tableStartY + 5.5)
      colX += colWidths[2]
      
      pdf.text("Amount", colX + colWidths[3] - 2, tableStartY + 5.5, { align: "right" })
      colX += colWidths[3]
      
      pdf.text("VAT", colX + colWidths[4] - 2, tableStartY + 5.5, { align: "right" })
      colX += colWidths[4]
      
      pdf.text("Total + VAT", colX + colWidths[5] - 2, tableStartY + 5.5, { align: "right" })

      // Table rows
      pdf.setFontSize(8)
      pdf.setTextColor(0, 0, 0)
      pdf.setFont('helvetica', 'normal')
      
      let currentRowY = tableStartY + rowHeight
      const itemsPerPage = Math.floor((pageHeight - currentRowY - 60) / rowHeight)
      
      pdfFilteredRentals.forEach((rental, index) => {
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
          pdf.text("Invoice No", headerColX + 2, currentRowY - rowHeight + 5.5)
          headerColX += colWidths[1]
          pdf.text("Customer Name", headerColX + 2, currentRowY - rowHeight + 5.5)
          headerColX += colWidths[2]
          pdf.text("Amount", headerColX + colWidths[3] - 2, currentRowY - rowHeight + 5.5, { align: "right" })
          headerColX += colWidths[3]
          pdf.text("VAT", headerColX + colWidths[4] - 2, currentRowY - rowHeight + 5.5, { align: "right" })
          headerColX += colWidths[4]
          pdf.text("Total + VAT", headerColX + colWidths[5] - 2, currentRowY - rowHeight + 5.5, { align: "right" })
          
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
        pdf.rect(tableX, currentRowY, tableWidth, rowHeight)

        // Row data
        let cellX = tableX
        
        // Date
        const rentalDate = rental.date ? new Date(rental.date).toLocaleDateString() : 'N/A'
        pdf.text(rentalDate, cellX + 2, currentRowY + 5.5)
        cellX += colWidths[0]
        
        // Invoice Number
        const invoiceNum = (rental.rentalNumber || 'N/A').substring(0, 18)
        pdf.text(invoiceNum, cellX + 2, currentRowY + 5.5)
        cellX += colWidths[1]
        
        // Customer Name
        const customerName = (rental.customerName || 'Unknown').substring(0, 20)
        pdf.text(customerName, cellX + 2, currentRowY + 5.5)
        cellX += colWidths[2]
        
        // Amount (subtotal without VAT)
        pdf.text(`${rental.subtotal.toFixed(2)}`, cellX + colWidths[3] - 2, currentRowY + 5.5, { align: "right" })
        cellX += colWidths[3]
        
        // VAT 5%
        pdf.setTextColor(0, 128, 0) // Green for VAT
        pdf.text(`${rental.totalVat.toFixed(2)}`, cellX + colWidths[4] - 2, currentRowY + 5.5, { align: "right" })
        cellX += colWidths[4]
        
        // Total + VAT
        pdf.setTextColor(0, 0, 255) // Blue for total
        pdf.setFont('helvetica', 'bold')
        pdf.text(`${rental.finalTotal.toFixed(2)}`, cellX + colWidths[5] - 2, currentRowY + 5.5, { align: "right" })
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(0, 0, 0) // Reset to black

        currentRowY += rowHeight
      })

      // Add footer image and admin signature on the last page
      const totalPages = pdf.getNumberOfPages()
      pdf.setPage(totalPages)
      
      try {
        // Load and add footer image
        const footerImg = new Image()
        footerImg.crossOrigin = "anonymous"
        
        await new Promise<void>((footerResolve, footerReject) => {
          footerImg.onload = async () => {
            try {
              const footerCanvas = document.createElement('canvas')
              const footerCtx = footerCanvas.getContext('2d')
              
              const footerAspectRatio = footerImg.width / footerImg.height
              const footerWidth = pageWidth - (margin * 2)
              const footerHeight = footerWidth / footerAspectRatio
              
              footerCanvas.width = footerImg.width
              footerCanvas.height = footerImg.height
              
              if (footerCtx) {
                footerCtx.drawImage(footerImg, 0, 0)
                const footerImgData = footerCanvas.toDataURL("image/png")
                
                const footerY = pageHeight - margin - footerHeight
                pdf.addImage(footerImgData, "PNG", margin, footerY, footerWidth, footerHeight)
                
                // Add admin signature on bottom right of footer image
                if (adminSignature) {
                  try {
                    await new Promise<void>((sigResolve, sigReject) => {
                      const signatureImg = new Image()
                      signatureImg.crossOrigin = "anonymous"
                      signatureImg.onload = () => {
                        try {
                          const sigCanvas = document.createElement('canvas')
                          const sigCtx = sigCanvas.getContext('2d')
                          
                          const aspectRatio = signatureImg.width / signatureImg.height
                          sigCanvas.width = 120
                          sigCanvas.height = 120 / aspectRatio
                          
                          if (sigCtx) {
                            sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height)
                            sigCtx.drawImage(signatureImg, 0, 0, sigCanvas.width, sigCanvas.height)
                            
                            const imageData = sigCtx.getImageData(0, 0, sigCanvas.width, sigCanvas.height)
                            const data = imageData.data
                            
                            for (let i = 0; i < data.length; i += 4) {
                              const r = data[i]
                              const g = data[i + 1]
                              const b = data[i + 2]
                              const brightness = (r + g + b) / 3
                              
                              if (brightness > 200) {
                                data[i + 3] = 0
                              }
                            }
                            
                            sigCtx.putImageData(imageData, 0, 0)
                            const sigImgData = sigCanvas.toDataURL("image/png")
                            
                            const sigWidth = 30
                            const sigHeight = 30 / aspectRatio
                            const sigX = pageWidth - margin - sigWidth - 8
                            const sigY = footerY + footerHeight - sigHeight - 8
                            
                            pdf.addImage(sigImgData, "PNG", sigX, sigY, sigWidth, sigHeight)
                          }
                          sigResolve()
                        } catch (err) {
                          console.warn("Failed to add signature image:", err)
                          sigReject(err)
                        }
                      }
                      signatureImg.onerror = () => {
                        console.warn("Failed to load admin signature image")
                        sigReject(new Error("Failed to load signature"))
                      }
                      signatureImg.src = adminSignature
                    })
                  } catch (sigError) {
                    console.warn("Signature loading failed:", sigError)
                    pdf.setFontSize(8)
                    pdf.setTextColor(43, 48, 104)
                    pdf.setFont('helvetica', 'bold')
                    pdf.text("Admin Signature", pageWidth - margin - 30, footerY + footerHeight - 8, { align: "center" })
                  }
                } else {
                  pdf.setFontSize(8)
                  pdf.setTextColor(43, 48, 104)
                  pdf.setFont('helvetica', 'bold')
                  pdf.text("Admin Signature", pageWidth - margin - 30, footerY + footerHeight - 8, { align: "center" })
                }
              }
              footerResolve()
            } catch (err) {
              console.warn("Failed to add footer image:", err)
              footerReject(err)
            }
          }
          footerImg.onerror = () => {
            console.warn("Failed to load footer image")
            pdf.setFontSize(10)
            pdf.setTextColor(43, 48, 104)
            pdf.setFont('helvetica', 'bold')
            pdf.text("Admin Signature", pageWidth - margin - 30, pageHeight - 20, { align: "center" })
            footerReject(new Error("Failed to load footer"))
          }
          footerImg.src = "/images/Footer-qoute-paper.jpg"
        })
      } catch (footerError) {
        console.warn("Footer processing failed:", footerError)
        pdf.setFontSize(10)
        pdf.setTextColor(43, 48, 104)
        pdf.setFont('helvetica', 'bold')
        pdf.text("Admin Signature", pageWidth - margin - 30, pageHeight - 20, { align: "center" })
      }

      // Generate filename with date range
      const dateRange = pdfFromDate && pdfToDate ? `_${pdfFromDate}_to_${pdfToDate}` : `_${getLocalDateString()}`
      const filename = `Rental_Collection_Report${dateRange}.pdf`
      
      pdf.save(filename)
      setShowPDFDatePopup(false)
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert('Failed to generate PDF report')
    } finally {
      setGeneratingPDF(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 w-full">
            <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold flex items-center gap-2">
              <span>Rental Collection</span>
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={() => setShowDateFilters(!showDateFilters)}
                variant="outline"
                className="bg-white/10 text-white border-white/20 hover:bg-white/20 font-semibold px-4 py-2 text-sm rounded-lg transition-all duration-300 whitespace-nowrap"
              >
                <Calendar className="w-4 h-4 mr-2" />
                {showDateFilters ? 'Hide Filters' : 'Date Filter'}
              </Button>
              
              <Button
                onClick={() => setShowPDFDatePopup(true)}
                disabled={generatingPDF}
                variant="outline"
                className="bg-white/10 text-white border-white/20 hover:bg-white/20 font-semibold px-4 py-2 text-sm rounded-lg transition-all duration-300 whitespace-nowrap"
              >
                {generatingPDF ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF
                  </>
                )}
              </Button>
              
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-white text-[#2B3068] hover:bg-white/90 font-semibold px-4 py-2 text-sm rounded-lg transition-all duration-300 whitespace-nowrap">
                    <FileText className="w-4 h-4 mr-2" />
                    Generate Rental
                  </Button>
                </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
                <DialogHeader>
                  <DialogTitle className="text-lg sm:text-xl">Generate Rental</DialogTitle>
                </DialogHeader>
                
                {/* Debug info */}
                <div className="text-xs text-gray-500 bg-gray-100 p-2 rounded">
                  Debug: {customers.length} customers, {products.length} cylinder products loaded
                </div>
                
                <div className="space-y-4 sm:space-y-6">
                  {/* Date and Customer */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm">Date</Label>
                      <Input
                        type="date"
                        value={rentalData.date}
                        onChange={(e) => setRentalData({ ...rentalData, date: e.target.value })}
                        className="h-10 text-sm"
                      />
                    </div>
                    
                    <div className="space-y-2 relative">
                      <Label className="text-sm">Customer Name</Label>
                      <Input
                        value={customerSearchTerm}
                        onChange={(e) => {
                          const value = e.target.value
                          setCustomerSearchTerm(value)
                          setShowCustomerSuggestions(value.trim().length > 0)
                        }}
                        onFocus={() => setShowCustomerSuggestions(customerSearchTerm.trim().length > 0)}
                        onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 150)}
                        placeholder="Type to search customers"
                        className="h-10 text-sm"
                      />
                      {showCustomerSuggestions && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-auto">
                          {filteredCustomers.slice(0, 8).map((customer) => (
                            <button
                              type="button"
                              key={customer._id}
                              onClick={() => {
                                setRentalData({
                                  ...rentalData,
                                  customerId: customer._id,
                                  customerName: customer.name || customer.companyName || ''
                                })
                                setCustomerSearchTerm(customer.name || customer.companyName || '')
                                setShowCustomerSuggestions(false)
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                            >
                              <div className="font-medium text-gray-800">
                                {customer.name || customer.companyName}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Add Item Section */}
                  <div className="border rounded-lg p-3 sm:p-4 bg-gray-50">
                    <h3 className="font-medium mb-3 sm:mb-4 text-sm sm:text-base">Add Rental Item</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
                      <div className="space-y-2 relative">
                        <Label className="text-sm">Item (Cylinder)</Label>
                        <Input
                          value={productSearchTerm}
                          onChange={(e) => {
                            const value = e.target.value
                            setProductSearchTerm(value)
                            setShowProductSuggestions(value.trim().length > 0)
                          }}
                          onFocus={() => setShowProductSuggestions(productSearchTerm.trim().length > 0)}
                          onBlur={() => setTimeout(() => setShowProductSuggestions(false), 150)}
                          placeholder="Type to search cylinders"
                          className="h-10 text-sm"
                        />
                        {showProductSuggestions && (
                          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-auto">
                            {filteredProducts.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-gray-500">
                                {products.length === 0 ? 'No cylinder products available' : 'No cylinders match your search'}
                              </div>
                            ) : (
                              filteredProducts.slice(0, 8).map((product) => (
                                <button
                                  type="button"
                                  key={product._id}
                                  onClick={() => {
                                    setCurrentItem({
                                      ...currentItem,
                                      productId: product._id,
                                      productName: product.name
                                    })
                                    setProductSearchTerm(product.name)
                                    setShowProductSuggestions(false)
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                                >
                                  <div className="font-medium text-gray-800">
                                    {product.name}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    Category: {product.category}
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm">Quantity</Label>
                        <Input
                          type="number"
                          value={currentItem.quantity}
                          onChange={(e) => setCurrentItem({ ...currentItem, quantity: e.target.value })}
                          placeholder="Enter quantity"
                          className="h-10 text-sm"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-3 sm:mb-4">
                      <div className="space-y-2">
                        <Label className="text-sm">Days</Label>
                        <Input
                          type="number"
                          value={currentItem.days}
                          onChange={(e) => setCurrentItem({ ...currentItem, days: e.target.value })}
                          placeholder="Enter days"
                          className="h-10 text-sm"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm">Amount (per day)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={currentItem.amount}
                          onChange={(e) => setCurrentItem({ ...currentItem, amount: e.target.value })}
                          placeholder="10.00"
                          className="h-10 text-sm"
                        />
                      </div>
                      
                      <div className="flex items-end">
                        <Button onClick={addItem} className="w-full text-sm h-10 sm:h-auto">
                          <Plus className="w-4 h-4 mr-2" />
                          Add Item
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Items Table */}
                  {rentalData.items.length > 0 && (
                    <div>
                      <h3 className="font-medium mb-2 text-sm sm:text-base">Rental Items</h3>
                      <div className="overflow-x-auto -mx-2 sm:mx-0">
                        <div className="inline-block min-w-full align-middle px-2 sm:px-0">
                          <Table className="min-w-[600px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs sm:text-sm">Item</TableHead>
                            <TableHead className="text-xs sm:text-sm">Quantity</TableHead>
                            <TableHead className="text-xs sm:text-sm">Days</TableHead>
                            <TableHead className="text-xs sm:text-sm">Amount</TableHead>
                            <TableHead className="text-xs sm:text-sm">VAT 5%</TableHead>
                            <TableHead className="text-xs sm:text-sm">Total</TableHead>
                            <TableHead className="text-xs sm:text-sm">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rentalData.items.map((item, index) => (
                            <TableRow key={index}>
                              <TableCell className="text-xs sm:text-sm">{item.productName}</TableCell>
                              <TableCell className="text-xs sm:text-sm">{item.quantity}</TableCell>
                              <TableCell className="text-xs sm:text-sm">{item.days}</TableCell>
                              <TableCell className="text-xs sm:text-sm">AED {item.subtotal.toFixed(2)}</TableCell>
                              <TableCell className="text-green-600 text-xs sm:text-sm">AED {item.vat.toFixed(2)}</TableCell>
                              <TableCell className="font-bold text-blue-600 text-xs sm:text-sm">AED {item.total.toFixed(2)}</TableCell>
                              <TableCell>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => removeItem(index)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Trash className="w-3 h-3 sm:w-4 sm:h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                        </div>
                      </div>
                      
                      {/* Totals */}
                      <div className="mt-4 space-y-2 text-right">
                        <div className="text-sm sm:text-base">Subtotal: AED {rentalData.subtotal.toFixed(2)}</div>
                        <div className="text-green-600 text-sm sm:text-base">VAT 5%: AED {rentalData.totalVat.toFixed(2)}</div>
                        <div className="text-lg sm:text-xl font-bold text-blue-600">Final Total: AED {rentalData.finalTotal.toFixed(2)}</div>
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto h-10 sm:h-auto text-sm">
                      Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={submitting} className="w-full sm:w-auto h-10 sm:h-auto text-sm">
                      {submitting ? "Generating..." : "Generate Rental"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            </div>
          </div>
        </CardHeader>
        
        {/* Date Range Filters */}
        {showDateFilters && (
          <div className="bg-gray-50 border-b border-gray-200 p-4">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1">
                <Label htmlFor="fromDate" className="text-sm font-medium text-gray-700 mb-2 block">
                  From Date
                </Label>
                <Input
                  id="fromDate"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="toDate" className="text-sm font-medium text-gray-700 mb-2 block">
                  To Date
                </Label>
                <Input
                  id="toDate"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setFromDate('')
                    setToDate('')
                  }}
                  variant="outline"
                  size="sm"
                  className="text-gray-600 border-gray-300 hover:bg-gray-100"
                >
                  Clear
                </Button>
              </div>
            </div>
            {(fromDate || toDate) && (
              <div className="mt-3 text-sm text-gray-600">
                <span className="font-medium">Filtered Results:</span> {filteredRentals.length} of {rentals.length} rentals
                {fromDate && toDate && (
                  <span className="ml-2">({new Date(fromDate).toLocaleDateString()} - {new Date(toDate).toLocaleDateString()})</span>
                )}
              </div>
            )}
          </div>
        )}
        
        <CardContent>
          {rentals.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No rentals yet</h3>
              <p className="text-gray-500 mb-4">Click "Generate Rental" to create your first rental record.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sm:text-sm">Rental #</TableHead>
                    <TableHead className="text-xs sm:text-sm">Date</TableHead>
                    <TableHead className="text-xs sm:text-sm">Customer</TableHead>
                    <TableHead className="text-xs sm:text-sm">Items</TableHead>
                    <TableHead className="text-xs sm:text-sm">Subtotal</TableHead>
                    <TableHead className="text-xs sm:text-sm">VAT 5%</TableHead>
                    <TableHead className="text-xs sm:text-sm">Total</TableHead>
                    <TableHead className="text-xs sm:text-sm">Status</TableHead>
                    <TableHead className="text-xs sm:text-sm min-w-[200px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRentals.map((rental) => (
                    <TableRow key={rental._id}>
                      <TableCell className="font-medium text-xs sm:text-sm">{rental.rentalNumber}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{new Date(rental.date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{rental.customerName}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{rental.items.length} item(s)</TableCell>
                      <TableCell className="text-xs sm:text-sm">AED {rental.subtotal.toFixed(2)}</TableCell>
                      <TableCell className="text-green-600 text-xs sm:text-sm">AED {rental.totalVat.toFixed(2)}</TableCell>
                      <TableCell className="font-bold text-blue-600 text-xs sm:text-sm">AED {rental.finalTotal.toFixed(2)}</TableCell>
                      <TableCell className="text-xs sm:text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          rental.status === 'active' ? 'bg-green-100 text-green-800' :
                          rental.status === 'returned' ? 'bg-gray-100 text-gray-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {rental.status.charAt(0).toUpperCase() + rental.status.slice(1)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col sm:flex-row gap-1 sm:gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReceiptClick(rental)}
                            className="w-full sm:w-auto text-xs sm:text-sm"
                          >
                            <Receipt className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                            Receipt
                          </Button>
                          {(!user || user.role === 'admin') && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditRental(rental)}
                                className="w-full sm:w-auto text-xs sm:text-sm"
                              >
                                <Edit className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteRental(rental)}
                                className="text-red-600 hover:text-red-700 w-full sm:w-auto text-xs sm:text-sm"
                              >
                                <Trash className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PDF Date Range Popup */}
      <Dialog open={showPDFDatePopup} onOpenChange={setShowPDFDatePopup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[#2B3068] flex items-center gap-2">
              <Download className="w-5 h-5" />
              Download PDF Report
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pdfFromDate" className="text-sm font-medium text-gray-700">
                From Date (Optional)
              </Label>
              <Input
                id="pdfFromDate"
                type="date"
                value={pdfFromDate}
                onChange={(e) => setPdfFromDate(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pdfToDate" className="text-sm font-medium text-gray-700">
                To Date (Optional)
              </Label>
              <Input
                id="pdfToDate"
                type="date"
                value={pdfToDate}
                onChange={(e) => setPdfToDate(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="text-xs text-gray-500">
              Leave dates empty to include all rentals
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowPDFDatePopup(false)}
              className="text-gray-600 border-gray-300 hover:bg-gray-100"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setPdfFromDate('')
                setPdfToDate('')
              }}
              variant="outline"
              className="text-gray-600 border-gray-300 hover:bg-gray-100"
            >
              Clear Dates
            </Button>
            <Button
              onClick={generateRentalPDF}
              disabled={generatingPDF}
              className="bg-[#2B3068] hover:bg-[#1a1f4a] text-white"
            >
              {generatingPDF ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Generate PDF
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Signature Dialog */}
      <SignatureDialog 
        isOpen={showSignatureDialog}
        onClose={handleSignatureCancel}
        onSignatureComplete={handleSignatureComplete}
        customerName={pendingRental ? pendingRental.customerName : rentalData.customerName}
      />

      {/* Receipt Dialog with signature */}
      {receiptRental && (
        <ReceiptDialog 
          sale={receiptRental} 
          signature={customerSignature}
          onClose={() => {
            setReceiptRental(null)
            // Don't clear signature - keep it for reuse
          }}
          open={!!receiptRental}
          disableVAT={false} // Enable VAT calculation for rentals
        />
      )}
    </div>
  )
}
