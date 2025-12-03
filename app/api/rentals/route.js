import { NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Rental from '@/models/Rental'
import Customer from '@/models/Customer'
import Product from '@/models/Product'
import Counter from '@/models/Counter'

export async function GET(request) {
  try {
    await dbConnect()
    
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page')) || 1
    const limit = parseInt(searchParams.get('limit')) || 50
    const skip = (page - 1) * limit
    
    const rentals = await Rental.find()
      .populate('customer', 'name companyName')
      .populate('items.product', 'name category')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
    
    const total = await Rental.countDocuments()
    
    return NextResponse.json({
      success: true,
      data: rentals,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching rentals:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch rentals' },
      { status: 500 }
    )
  }
}

export async function POST(request) {
  try {
    await dbConnect()
    
    const body = await request.json()
    console.log('Rental creation request body:', body)
    const { date, customerId, customerName, items } = body
    
    // Validate required fields
    if (!date || !customerId || !customerName || !items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    // Validate customer exists
    const customer = await Customer.findById(customerId)
    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'Customer not found' },
        { status: 404 }
      )
    }
    
    // Process and validate items
    const processedItems = []
    let subtotal = 0
    let totalVat = 0
    
    for (const item of items) {
      const { productId, productName, quantity, days, amountPerDay } = item
      
      // Validate product exists
      const product = await Product.findById(productId)
      if (!product) {
        return NextResponse.json(
          { success: false, error: `Product ${productName} not found` },
          { status: 404 }
        )
      }
      
      // Calculate amounts: Amount Per Day × Days × Quantity
      const itemSubtotal = parseFloat(amountPerDay) * parseInt(days) * parseInt(quantity)
      const itemVat = itemSubtotal * 0.05 // 5% VAT
      const itemTotal = itemSubtotal + itemVat
      
      processedItems.push({
        product: productId,
        productName,
        quantity: parseInt(quantity),
        days: parseInt(days),
        amountPerDay: parseFloat(amountPerDay),
        subtotal: itemSubtotal,
        vat: itemVat,
        total: itemTotal
      })
      
      subtotal += itemSubtotal
      totalVat += itemVat
    }
    
    const finalTotal = subtotal + totalVat
    
    // Generate rental number using counter system (format: 0001, 0002, etc.)
    const rentalNumber = await getNextRentalInvoiceNumber()
    console.log('Generated rental number:', rentalNumber)
    
    // Create rental record
    const rental = new Rental({
      rentalNumber,
      date: new Date(date),
      customer: customerId,
      customerName,
      items: processedItems,
      subtotal,
      totalVat,
      finalTotal
    })
    
    await rental.save()
    
    // Populate the saved rental for response
    const populatedRental = await Rental.findById(rental._id)
      .populate('customer', 'name companyName')
      .populate('items.product', 'name category')
    
    return NextResponse.json({
      success: true,
      data: populatedRental,
      message: 'Rental created successfully'
    })
    
  } catch (error) {
    console.error('Error creating rental:', error)
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    return NextResponse.json(
      { success: false, error: `Failed to create rental: ${error.message}` },
      { status: 500 }
    )
  }
}

export async function PUT(request) {
  try {
    await dbConnect()
    
    const body = await request.json()
    const { id, status, notes } = body
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Rental ID is required' },
        { status: 400 }
      )
    }
    
    const updateData = {}
    if (status) updateData.status = status
    if (notes !== undefined) updateData.notes = notes
    
    const rental = await Rental.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('customer', 'name companyName')
      .populate('items.product', 'name category')
    
    if (!rental) {
      return NextResponse.json(
        { success: false, error: 'Rental not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data: rental,
      message: 'Rental updated successfully'
    })
    
  } catch (error) {
    console.error('Error updating rental:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update rental' },
      { status: 500 }
    )
  }
}

/**
 * Get next rental invoice number using counter system
 * Format: 0001, 0002, 0003, etc. (4-digit padded)
 */
async function getNextRentalInvoiceNumber() {
  try {
    // Initialize counter if needed
    await initializeRentalCounter()
    
    // Use current year for counter (required by Counter model)
    const currentYear = new Date().getFullYear()
    
    // Use MongoDB's atomic findOneAndUpdate to prevent race conditions
    const counter = await Counter.findOneAndUpdate(
      { 
        key: 'rental_invoice_counter',
        year: currentYear 
      },
      { $inc: { seq: 1 } },
      { 
        new: true, 
        upsert: true,
        setDefaultsOnInsert: { seq: 1 } // Start from 1
      }
    )
    
    // Format as 4-digit padded string
    const invoiceNumber = counter.seq.toString().padStart(4, '0')
    
    console.log(`[RENTAL INVOICE] Generated: ${invoiceNumber} (counter: ${counter.seq})`)
    
    return invoiceNumber
    
  } catch (error) {
    console.error('[RENTAL INVOICE] Error generating invoice number:', error)
    
    // Fallback: use timestamp-based number
    const timestamp = Date.now()
    const fallbackNumber = (timestamp % 10000).toString().padStart(4, '0')
    console.warn(`[RENTAL INVOICE] Using fallback: ${fallbackNumber}`)
    
    return fallbackNumber
  }
}

/**
 * Initialize rental invoice counter by finding the highest existing rental number
 * Handles both old format (RNT-YYYY-XXXX) and new format (XXXX)
 */
async function initializeRentalCounter() {
  try {
    const currentYear = new Date().getFullYear()
    
    // Check if counter already exists
    const existingCounter = await Counter.findOne({ 
      key: 'rental_invoice_counter',
      year: currentYear 
    })
    
    if (existingCounter) {
      console.log(`[RENTAL INVOICE] Counter already initialized: ${existingCounter.seq}`)
      return existingCounter.seq
    }
    
    // Find all rentals and extract numeric parts
    const allRentals = await Rental.find({ rentalNumber: { $exists: true, $ne: null } })
      .select('rentalNumber')
      .lean()
    
    let highestNumber = 0
    
    // Extract numbers from both old format (RNT-YYYY-XXXX) and new format (XXXX)
    for (const rental of allRentals) {
      if (!rental.rentalNumber) continue
      
      let number = 0
      
      // Check if it's old format: RNT-YYYY-XXXX
      const oldFormatMatch = rental.rentalNumber.match(/RNT-\d{4}-(\d+)$/)
      if (oldFormatMatch) {
        number = parseInt(oldFormatMatch[1]) || 0
      } else {
        // Check if it's new format: just numbers (XXXX)
        const newFormatMatch = rental.rentalNumber.match(/^(\d+)$/)
        if (newFormatMatch) {
          number = parseInt(newFormatMatch[1]) || 0
        }
      }
      
      if (number > highestNumber) {
        highestNumber = number
      }
    }
    
    // Start from the next number (or 1 if no rentals exist)
    const startingSeq = highestNumber + 1
    
    // Create counter
    const counter = await Counter.findOneAndUpdate(
      { 
        key: 'rental_invoice_counter',
        year: currentYear 
      },
      { seq: startingSeq },
      { 
        new: true, 
        upsert: true
      }
    )
    
    console.log(`[RENTAL INVOICE] Initialized counter starting from: ${startingSeq}`)
    return startingSeq
    
  } catch (error) {
    console.error('[RENTAL INVOICE] Error initializing counter:', error)
    return 1 // Fallback to start from 1
  }
}

export async function DELETE(request) {
  try {
    await dbConnect()
    
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Rental ID is required' },
        { status: 400 }
      )
    }
    
    const rental = await Rental.findByIdAndDelete(id)
    
    if (!rental) {
      return NextResponse.json(
        { success: false, error: 'Rental not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: 'Rental deleted successfully'
    })
    
  } catch (error) {
    console.error('Error deleting rental:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete rental' },
      { status: 500 }
    )
  }
}
