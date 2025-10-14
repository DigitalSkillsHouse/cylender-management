import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import StockAssignment from "@/models/StockAssignment"

export async function POST(request) {
  try {
    await dbConnect()
    console.log('Starting StockAssignment duplicate cleanup...')
    
    // Get all stock assignments with same employee + product + status
    const allAssignments = await StockAssignment.find({ status: 'received' })
      .populate('product', 'name productCode')
      .sort({ createdAt: 1 })
    
    console.log(`Found ${allAssignments.length} received assignments`)
    
    // Group by employee + product name + product code
    const groups = new Map()
    
    for (const item of allAssignments) {
      const key = `${item.employee}_${item.product?.name}_${item.product?.productCode}`
      
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key).push(item)
    }
    
    let mergedCount = 0
    let deletedCount = 0
    
    // Process each group
    for (const [key, items] of groups) {
      if (items.length > 1) {
        console.log(`Processing duplicates for key: ${key} (${items.length} items)`)
        
        // Keep the first (oldest) record and merge others into it
        const keepRecord = items[0]
        const duplicates = items.slice(1)
        
        // Calculate totals from all duplicates
        let totalQuantity = keepRecord.quantity || 0
        let totalRemaining = keepRecord.remainingQuantity || 0
        
        for (const dup of duplicates) {
          totalQuantity += (dup.quantity || 0)
          totalRemaining += (dup.remainingQuantity || 0)
        }
        
        // Update the keep record with merged data
        await StockAssignment.findByIdAndUpdate(keepRecord._id, {
          quantity: totalQuantity,
          remainingQuantity: totalRemaining,
          updatedAt: new Date()
        })
        
        // Delete the duplicates
        for (const dup of duplicates) {
          await StockAssignment.findByIdAndDelete(dup._id)
          deletedCount++
        }
        
        mergedCount++
        console.log(`Merged ${duplicates.length} duplicates into assignment ${keepRecord._id}`)
      }
    }
    
    console.log(`✅ StockAssignment cleanup complete: ${mergedCount} groups merged, ${deletedCount} duplicates removed`)
    
    return NextResponse.json({ 
      success: true, 
      message: `StockAssignment cleanup complete: ${mergedCount} groups merged, ${deletedCount} duplicates removed`,
      mergedGroups: mergedCount,
      deletedRecords: deletedCount
    })
  } catch (error) {
    console.error('❌ Error during StockAssignment cleanup:', error)
    return NextResponse.json({ 
      error: `Failed to cleanup StockAssignment duplicates: ${error.message}` 
    }, { status: 500 })
  }
}