import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import Sale from "@/models/Sale"
import Customer from "@/models/Customer"
import Product from "@/models/Product"

export async function GET() {
  try {
    await dbConnect()

    const sales = await Sale.find()
      .populate("customer", "name phone address email trNumber")
      .populate("items.product", "name price category cylinderSize")
      .sort({ createdAt: -1 })

    return NextResponse.json({ data: sales })
  } catch (error) {
    console.error("Sales GET error:", error)
    return NextResponse.json({ error: "Failed to fetch sales" }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    await dbConnect()

    const body = await request.json()
    const { customer, items, totalAmount, paymentMethod, paymentStatus, receivedAmount, notes } = body

    // Validate required fields
    if (!customer || !items || items.length === 0 || !totalAmount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Verify customer exists
    const customerDoc = await Customer.findById(customer)
    if (!customerDoc) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }

    // Verify all products exist and get their details
    const productIds = items.map((item) => item.product)
    const products = await Product.find({ _id: { $in: productIds } })

    if (products.length !== productIds.length) {
      return NextResponse.json({ error: "One or more products not found" }, { status: 404 })
    }

    // Check if there's enough stock for all items
    for (const item of items) {
      const product = products.find(p => p._id.toString() === item.product)
      if (product && product.currentStock < item.quantity) {
        return NextResponse.json({ 
          error: `Insufficient stock for ${product.name}. Available: ${product.currentStock}, Required: ${item.quantity}` 
        }, { status: 400 })
      }
    }

    // Generate sequential invoice number like INV-2025-01
    const currentYear = new Date().getFullYear()
    const yearPrefix = `INV-${currentYear}-`
    
    // Find the latest invoice number for this year
    const latestSale = await Sale.findOne({
      invoiceNumber: { $regex: `^${yearPrefix}` }
    }).sort({ invoiceNumber: -1 })
    
    let nextNumber = 1
    if (latestSale) {
      const lastNumber = parseInt(latestSale.invoiceNumber.split('-')[2]) || 0
      nextNumber = lastNumber + 1
    }
    
    const invoiceNumber = `${yearPrefix}${nextNumber.toString().padStart(2, '0')}`

    // Enrich items with category and cylinderSize from Product model
    const enrichedItems = (items || []).map((item) => {
      const prod = products.find(p => p._id.toString() === String(item.product))
      const category = prod?.category || item.category || 'gas'
      const cylinderSize = category === 'cylinder' ? (prod?.cylinderSize || item.cylinderSize) : undefined
      return {
        product: item.product,
        category,
        cylinderSize,
        quantity: Number(item.quantity) || 0,
        price: Number(item.price) || 0,
        total: Number(item.total) || ((Number(item.price)||0) * (Number(item.quantity)||0)),
      }
    })

    // Create the sale
    const sale = new Sale({
      invoiceNumber,
      customer,
      items: enrichedItems,
      totalAmount,
      paymentMethod: paymentMethod || "cash",
      paymentStatus: paymentStatus || "cleared",
      receivedAmount: receivedAmount || 0,
      notes: notes || "",
    })

    // Try to save with retry logic for duplicate key errors
    let savedSale = null
    let attempts = 0
    const maxAttempts = 5
    
    while (!savedSale && attempts < maxAttempts) {
      try {
        await sale.save()
        savedSale = sale
        break
      } catch (saveError) {
        attempts++
        
        // Handle duplicate key error by generating a new invoice number
        if (saveError.code === 11000) {
          console.log(`Duplicate invoice number ${invoiceNumber}, generating new one (attempt ${attempts})...`)
          
          // Generate a new invoice number with timestamp to ensure uniqueness
          const timestamp = Date.now().toString().slice(-4)
          const newInvoiceNumber = `${yearPrefix}${nextNumber.toString().padStart(2, '0')}-${timestamp}`
          sale.invoiceNumber = newInvoiceNumber
          nextNumber++
        } else {
          throw saveError
        }
      }
    }
    
    if (!savedSale) {
      throw new Error(`Failed to save sale after ${maxAttempts} attempts`)
    }

    // Deduct stock quantities from products after successful sale creation
    try {
      for (const item of items) {
        const product = products.find(p => p._id.toString() === item.product)
        if (product) {
          const newStock = product.currentStock - item.quantity
          await Product.findByIdAndUpdate(item.product, {
            currentStock: Math.max(0, newStock) // Ensure stock doesn't go negative
          })
          console.log(`✅ Updated ${product.name} stock from ${product.currentStock} to ${newStock} (sold ${item.quantity} units)`)
        }
      }
    } catch (stockError) {
      console.error("❌ Failed to update product stock after sale:", stockError)
      // Note: Sale is already created, but stock update failed
      // In a production system, you might want to implement compensation logic
    }

    // Populate the created sale for response
    const populatedSale = await Sale.findById(savedSale._id)
      .populate("customer", "name phone address email trNumber")
      .populate("items.product", "name price category cylinderSize")

    return NextResponse.json({
      data: populatedSale,
      message: "Sale created successfully",
    })
  } catch (error) {
    console.error("Sales POST error:", error)
    return NextResponse.json({ error: "Failed to create sale" }, { status: 500 })
  }
}
