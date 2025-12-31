import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import ReturnTransaction from "@/models/ReturnTransaction"

export async function GET(request) {
  try {
    console.log('🔍 Admin pending returns API called')
    await dbConnect()
    
    // First, let's check ALL return transactions to see what's in the database
    const allReturns = await ReturnTransaction.find({})
      .select('_id status returnDate employee product')
      .lean()
    
    console.log('📊 [DEBUG] Total return transactions in database:', allReturns.length)
    console.log('📊 [DEBUG] Return transactions by status:', {
      pending: allReturns.filter(r => r.status === 'pending').length,
      received: allReturns.filter(r => r.status === 'received').length,
      rejected: allReturns.filter(r => r.status === 'rejected').length,
      other: allReturns.filter(r => !['pending', 'received', 'rejected'].includes(r.status)).length
    })
    
    // Log recent return transactions for debugging
    if (allReturns.length > 0) {
      const recent = allReturns
        .sort((a, b) => new Date(b.returnDate || b.createdAt || 0) - new Date(a.returnDate || a.createdAt || 0))
        .slice(0, 5)
      console.log('📋 [DEBUG] Recent return transactions (last 5):', recent.map(r => ({
        id: r._id.toString(),
        status: r.status,
        returnDate: r.returnDate,
        employeeId: r.employee?.toString(),
        productId: r.product?.toString()
      })))
    }
    
    // Get pending return transactions - ensure we get fresh data from database
    const pendingReturns = await ReturnTransaction.find({ status: 'pending' })
      .populate('employee', 'name email')
      .populate('product', 'name productCode category cylinderSize')
      .sort({ returnDate: -1 })
      .lean() // Use lean() to get plain JavaScript objects and avoid caching issues
    
    console.log('✅ Found pending returns:', pendingReturns.length)
    
    // Log for debugging - if database was cleared, this should be 0
    if (pendingReturns.length > 0) {
      console.log('📋 Pending returns details:', pendingReturns.map(r => ({
        id: r._id,
        employee: r.employee?.name,
        product: r.product?.name,
        returnDate: r.returnDate,
        status: r.status
      })))
    } else {
      console.log('⚠️ [DEBUG] No pending returns found. Checking if there are any with null/undefined status...')
      const nullStatusReturns = await ReturnTransaction.find({ 
        $or: [
          { status: null },
          { status: { $exists: false } }
        ]
      }).lean()
      if (nullStatusReturns.length > 0) {
        console.log('⚠️ [DEBUG] Found return transactions with null/undefined status:', nullStatusReturns.length)
      }
    }
    
    // Format the data for frontend
    const formattedReturns = pendingReturns.map(returnTx => ({
      id: returnTx._id.toString(),
      invoiceNumber: returnTx.invoiceNumber,
      employeeName: returnTx.employee?.name || 'Unknown Employee',
      employeeEmail: returnTx.employee?.email || '',
      employeeId: returnTx.employee?._id.toString(),
      productName: returnTx.product?.name || 'Unknown Product',
      productCode: returnTx.product?.productCode || '',
      productId: returnTx.product?._id.toString(),
      category: returnTx.product?.category || '',
      cylinderSize: returnTx.product?.cylinderSize || '',
      stockType: returnTx.stockType,
      quantity: returnTx.quantity,
      returnDate: returnTx.returnDate,
      status: returnTx.status,
      notes: returnTx.notes || ''
    }))

    // Return response with no-cache headers to prevent browser caching
    return NextResponse.json({ 
      success: true,
      pendingReturns: formattedReturns
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
    
  } catch (error) {
    console.error("❌ Error fetching pending returns:", error)
    return NextResponse.json({ 
      error: `Failed to fetch pending returns: ${error.message}` 
    }, { status: 500 })
  }
}
