import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import ReturnTransaction from "@/models/ReturnTransaction"
import EmployeeInventoryItem from "@/models/EmployeeInventoryItem"
import mongoose from "mongoose"
import { addDaysToDate, getDubaiNowISOString, getLocalDateStringFromDate } from "@/lib/date-utils"

// Disable caching for this route - force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(request) {
  try {
    console.log('🔍 Admin pending returns API called')
    console.log('🌍 [DEBUG] Environment:', process.env.NODE_ENV)
    console.log('🌍 [DEBUG] Database URI exists:', !!process.env.MONGODB_URI)
    
    await dbConnect()

    // Auto-expire pending returns at 23:55 Dubai time (lazy, runs on read)
    try {
      const nowDubai = new Date(getDubaiNowISOString())
      const candidates = await ReturnTransaction.find({
        status: 'pending',
        $or: [
          { expiresAt: { $ne: null, $lte: nowDubai } },
          { expiresAt: null }
        ]
      }).lean()

      for (const r of candidates) {
        const baseDate = getLocalDateStringFromDate(r.returnDate || r.createdAt || nowDubai)
        let expiry = r.expiresAt ? new Date(r.expiresAt) : new Date(`${baseDate}T23:55:00+04:00`)
        if (!r.expiresAt && r.returnDate) {
          const cutoff = new Date(`${baseDate}T23:55:00+04:00`)
          const dubaiReturnTime = new Date(new Date(r.returnDate).toLocaleString('en-US', { timeZone: 'Asia/Dubai' }))
          if (dubaiReturnTime > cutoff) {
            const next = addDaysToDate(baseDate, 1)
            expiry = new Date(`${next}T23:55:00+04:00`)
          }
        }

        if (expiry <= nowDubai) {
          // Restore employee inventory if it was deducted on send-back
          if (r.inventoryDeducted) {
            const qty = Number(r.quantity || 0)
            if (r.stockType === 'empty') {
              await EmployeeInventoryItem.findOneAndUpdate(
                { employee: r.employee, product: r.product },
                { $inc: { availableEmpty: qty }, $set: { lastUpdatedAt: new Date() } }
              )
            } else if (r.stockType === 'gas') {
              await EmployeeInventoryItem.findOneAndUpdate(
                { employee: r.employee, product: r.product },
                { $inc: { currentStock: qty }, $set: { lastUpdatedAt: new Date() } }
              )
              if (r.cylinderProductId) {
                await EmployeeInventoryItem.findOneAndUpdate(
                  { employee: r.employee, product: r.cylinderProductId },
                  { $inc: { availableFull: qty, availableEmpty: -qty }, $set: { lastUpdatedAt: new Date() } }
                )
              }
            }
          }

          await ReturnTransaction.updateOne(
            { _id: r._id, status: 'pending' },
            { $set: { status: 'rejected', processedAt: nowDubai, inventoryDeducted: false, expiresAt: expiry } }
          )
        } else if (!r.expiresAt) {
          await ReturnTransaction.updateOne({ _id: r._id }, { $set: { expiresAt: expiry } })
        }
      }
    } catch (e) {
      console.warn('[pending-returns] expiry check failed:', e?.message || e)
    }
    
    // Verify database connection
    const connectionState = mongoose.connection.readyState
    const connectionStates = ['disconnected', 'connected', 'connecting', 'disconnecting']
    console.log('📡 [DEBUG] MongoDB connection state:', connectionStates[connectionState] || connectionState)
    
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
    // Use strict equality check and explicitly exclude 'received' and 'rejected' statuses
    let pendingReturns
    try {
      pendingReturns = await ReturnTransaction.find({ 
        status: { $eq: 'pending' } // Explicit equality check
      })
        .populate({
          path: 'employee',
          select: 'name email',
          strictPopulate: false // Don't throw error if employee doesn't exist
        })
        .populate({
          path: 'product',
          select: 'name productCode category cylinderSize',
          strictPopulate: false // Don't throw error if product doesn't exist
        })
        .sort({ returnDate: -1 })
        .lean() // Use lean() to get plain JavaScript objects and avoid caching issues
      
      console.log('📊 [DEBUG] Query executed successfully, found:', pendingReturns.length, 'pending returns')
    } catch (queryError) {
      console.error('❌ [DEBUG] Error executing pending returns query:', queryError)
      // Try without populate to see if that's the issue
      try {
        const pendingWithoutPopulate = await ReturnTransaction.find({ 
          status: { $eq: 'pending' }
        }).lean()
        console.log('📊 [DEBUG] Found', pendingWithoutPopulate.length, 'pending returns without populate')
        pendingReturns = pendingWithoutPopulate
      } catch (fallbackError) {
        console.error('❌ [DEBUG] Fallback query also failed:', fallbackError)
        throw queryError
      }
    }
    
    // Double-check: Filter out any items that might have been updated between query and now
    // This is a safety check to ensure we only return truly pending items
    // Also verify status is exactly 'pending' (case-sensitive, strict equality)
    const verifiedPendingReturns = pendingReturns.filter(r => {
      const isPending = r.status === 'pending'
      if (!isPending) {
        console.warn(`⚠️ [PENDING RETURNS] Filtered out non-pending return: ${r._id.toString()}, status: "${r.status}" (expected: "pending")`)
      }
      return isPending
    })
    
    // Log any discrepancies
    if (pendingReturns.length !== verifiedPendingReturns.length) {
      const removed = pendingReturns.length - verifiedPendingReturns.length
      console.warn(`⚠️ [PENDING RETURNS] Filtered out ${removed} return(s) with non-pending status`)
    }
    
    console.log('✅ Found pending returns:', verifiedPendingReturns.length, '(after verification)')
    console.log('📊 [DEBUG] Query returned:', pendingReturns.length, 'items, verified as pending:', verifiedPendingReturns.length)
    
    // Log for debugging - if database was cleared, this should be 0
    if (verifiedPendingReturns.length > 0) {
      console.log('📋 Pending returns details:', verifiedPendingReturns.map(r => ({
        id: r._id.toString(),
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
    
    // Format the data for frontend - only include verified pending returns
    const formattedReturns = verifiedPendingReturns.map(returnTx => {
      // Handle both populated and non-populated cases
      const employee = returnTx.employee
      const product = returnTx.product
      
      // Check if employee/product are ObjectIds (not populated) or objects (populated)
      const employeeId = employee?._id ? employee._id.toString() : (employee?.toString() || '')
      const productId = product?._id ? product._id.toString() : (product?.toString() || '')
      
      // If not populated, we'll need to fetch separately (but for now, just log it)
      if (!employee || typeof employee === 'string' || employee.toString().length === 24) {
        console.warn(`⚠️ [PENDING RETURNS] Employee not populated for return ${returnTx._id.toString()}`)
      }
      if (!product || typeof product === 'string' || product.toString().length === 24) {
        console.warn(`⚠️ [PENDING RETURNS] Product not populated for return ${returnTx._id.toString()}`)
      }
      
      return {
        id: returnTx._id.toString(),
        batchId: returnTx.batchId?.toString() || null,
        employeeName: employee?.name || (employeeId ? 'Employee ID: ' + employeeId : 'Unknown Employee'),
        employeeEmail: employee?.email || '',
        employeeId: employeeId,
        productName: product?.name || (productId ? 'Product ID: ' + productId : 'Unknown Product'),
        productCode: product?.productCode || '',
        productId: productId,
        category: product?.category || '',
        cylinderSize: product?.cylinderSize || '',
        stockType: returnTx.stockType || 'unknown',
        quantity: returnTx.quantity || 0,
        returnDate: returnTx.returnDate || returnTx.createdAt,
        status: returnTx.status,
        notes: returnTx.notes || ''
      }
    })
    
    console.log('📦 [DEBUG] Formatted returns count:', formattedReturns.length)

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
    console.error("❌ Error stack:", error.stack)
    console.error("❌ Error details:", {
      name: error.name,
      message: error.message,
      code: error.code
    })
    
    // Return detailed error in development, generic in production
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? `Failed to fetch pending returns: ${error.message}` 
      : 'Failed to fetch pending returns. Please check server logs.'
    
    return NextResponse.json({ 
      success: false,
      error: errorMessage,
      pendingReturns: [] // Always return empty array on error
    }, { status: 500 })
  }
}
