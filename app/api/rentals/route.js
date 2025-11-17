import { NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Rental from '@/models/Rental'
import Customer from '@/models/Customer'
import Product from '@/models/Product'

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
    
    // Generate rental number manually
    const year = new Date().getFullYear()
    const count = await Rental.countDocuments({
      rentalNumber: { $regex: `^RNT-${year}-` }
    })
    const rentalNumber = `RNT-${year}-${String(count + 1).padStart(4, '0')}`
    console.log('Generated rental number manually:', rentalNumber)
    
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
