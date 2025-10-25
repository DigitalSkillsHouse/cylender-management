import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import DailyEmployeeCylinderAggregation from "@/models/DailyEmployeeCylinderAggregation"
import EmployeeCylinderTransaction from "@/models/EmployeeCylinderTransaction"
import Product from "@/models/Product"

export async function POST(request) {
  try {
    await dbConnect()
    
    const { employeeId, date } = await request.json()
    
    if (!employeeId || !date) {
      return NextResponse.json({ error: "employeeId and date are required" }, { status: 400 })
    }
    
    console.log(`🔧 [DEBUG] Rebuilding cylinder aggregation for employee ${employeeId} on ${date}`)
    
    // Clear existing aggregation for this date
    await DailyEmployeeCylinderAggregation.deleteMany({
      employeeId,
      date
    })
    
    // Get all transactions for this employee and date
    const dayStart = new Date(date + 'T00:00:00')
    const dayEnd = new Date(date + 'T23:59:59.999')
    
    const transactions = await EmployeeCylinderTransaction.find({
      employee: employeeId,
      createdAt: {
        $gte: dayStart,
        $lte: dayEnd
      }
    }).populate('product', 'name')
    
    console.log(`🔧 [DEBUG] Found ${transactions.length} transactions for ${date}`)
    
    // Process each transaction
    for (const transaction of transactions) {
      const transactionType = transaction.type
      
      // Handle both single item and multi-item transactions
      const items = transaction.items && transaction.items.length > 0 
        ? transaction.items 
        : [{
            productId: transaction.product,
            quantity: transaction.quantity || 0,
            amount: transaction.amount || 0
          }]
      
      console.log(`🔧 [DEBUG] Processing ${transactionType} transaction with ${items.length} items`)
      
      for (const item of items) {
        const product = await Product.findById(item.productId)
        if (!product) {
          console.warn(`⚠️ [DEBUG] Product not found: ${item.productId}`)
          continue
        }
        
        const quantity = Number(item.quantity) || 0
        const amount = Number(item.amount) || 0
        
        console.log(`🔧 [DEBUG] Item: ${product.name}, Qty: ${quantity}, Amount: ${amount}`)
        
        if (quantity > 0) {
          await DailyEmployeeCylinderAggregation.updateDailyCylinderAggregation(
            employeeId,
            date,
            product._id,
            product.name,
            transactionType,
            {
              quantity: quantity,
              amount: amount
            }
          )
        }
      }
    }
    
    // Get final aggregation results
    const finalAggregations = await DailyEmployeeCylinderAggregation.find({
      employeeId,
      date
    }).populate('productId', 'name')
    
    console.log(`✅ [DEBUG] Rebuilt aggregation with ${finalAggregations.length} product entries`)
    
    return NextResponse.json({
      success: true,
      message: `Rebuilt cylinder aggregation for ${date}`,
      transactionsProcessed: transactions.length,
      aggregationsCreated: finalAggregations.length,
      aggregations: finalAggregations.map(agg => ({
        productName: agg.productName,
        totalDeposits: agg.totalDeposits,
        totalReturns: agg.totalReturns,
        totalRefills: agg.totalRefills,
        totalDepositAmount: agg.totalDepositAmount,
        totalReturnAmount: agg.totalReturnAmount,
        totalRefillAmount: agg.totalRefillAmount
      }))
    })
    
  } catch (error) {
    console.error("Debug cylinder aggregation error:", error)
    return NextResponse.json({ 
      error: "Failed to rebuild cylinder aggregation", 
      details: error.message 
    }, { status: 500 })
  }
}