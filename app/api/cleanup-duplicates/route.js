import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeeInventory from "@/models/EmployeeInventory"

export async function POST(request) {
  try {
    await dbConnect()
    console.log('Starting duplicate cleanup...')
    
    // Get all employee inventory records
    const allInventory = await EmployeeInventory.find({})
      .populate('product', 'name productCode')
      .sort({ createdAt: 1 }) // Oldest first
    
    console.log(`Found ${allInventory.length} total inventory records`)
    
    // Group by employee + product name + product code
    const groups = new Map()
    
    for (const item of allInventory) {
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
        let totalAssigned = keepRecord.assignedQuantity || 0
        let totalCurrent = keepRecord.currentStock || 0
        let allTransactions = [...(keepRecord.transactions || [])]
        
        for (const dup of duplicates) {
          totalAssigned += (dup.assignedQuantity || 0)
          totalCurrent += (dup.currentStock || 0)
          allTransactions.push(...(dup.transactions || []))
        }
        
        // Update the keep record with merged data
        await EmployeeInventory.findByIdAndUpdate(keepRecord._id, {
          assignedQuantity: totalAssigned,
          currentStock: totalCurrent,
          transactions: allTransactions,
          lastUpdated: new Date()
        })
        
        // Delete the duplicates
        for (const dup of duplicates) {
          await EmployeeInventory.findByIdAndDelete(dup._id)
          deletedCount++
        }
        
        mergedCount++
        console.log(`Merged ${duplicates.length} duplicates into record ${keepRecord._id}`)
      }
    }
    
    console.log(`✅ Cleanup complete: ${mergedCount} groups merged, ${deletedCount} duplicates removed`)
    
    return NextResponse.json({ 
      success: true, 
      message: `Cleanup complete: ${mergedCount} groups merged, ${deletedCount} duplicates removed`,
      mergedGroups: mergedCount,
      deletedRecords: deletedCount
    })
  } catch (error) {
    console.error('❌ Error during cleanup:', error)
    return NextResponse.json({ 
      error: `Failed to cleanup duplicates: ${error.message}` 
    }, { status: 500 })
  }
}