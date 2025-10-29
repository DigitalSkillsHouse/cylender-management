import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import ReturnTransaction from "@/models/ReturnTransaction"

export async function GET(request) {
  try {
    console.log('🔍 Admin pending returns API called')
    await dbConnect()
    
    // Get pending return transactions
    const pendingReturns = await ReturnTransaction.find({ status: 'pending' })
      .populate('employee', 'name email')
      .populate('product', 'name productCode category cylinderSize')
      .sort({ returnDate: -1 })
    
    console.log('✅ Found pending returns:', pendingReturns.length)
    
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

    return NextResponse.json({ 
      success: true,
      pendingReturns: formattedReturns
    })
    
  } catch (error) {
    console.error("❌ Error fetching pending returns:", error)
    return NextResponse.json({ 
      error: `Failed to fetch pending returns: ${error.message}` 
    }, { status: 500 })
  }
}
