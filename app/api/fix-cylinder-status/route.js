import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import StockAssignment from "@/models/StockAssignment"

export async function POST(request) {
  try {
    await dbConnect()
    console.log('Connected to database')
    
    // Find all cylinder assignments without cylinderStatus
    const assignments = await StockAssignment.find({
      category: 'cylinder',
      $or: [
        { cylinderStatus: { $exists: false } },
        { cylinderStatus: null },
        { cylinderStatus: undefined }
      ]
    }).populate('product', 'name category')
    
    console.log(`Found ${assignments.length} assignments to fix`)
    
    let updated = 0
    for (const assignment of assignments) {
      let cylinderStatus = 'empty' // Default
      let displayCategory = 'Empty Cylinder'
      
      // Check if it has a gas product (indicates full cylinder)
      if (assignment.gasProductId) {
        cylinderStatus = 'full'
        displayCategory = 'Full Cylinder'
      }
      
      // Update the assignment
      await StockAssignment.findByIdAndUpdate(assignment._id, {
        cylinderStatus: cylinderStatus,
        displayCategory: displayCategory
      })
      
      console.log(`Updated assignment ${assignment._id}: ${assignment.product?.name} -> ${displayCategory}`)
      updated++
    }
    
    console.log(`✅ Updated ${updated} assignments successfully`)
    return NextResponse.json({ 
      success: true, 
      message: `Updated ${updated} assignments successfully`,
      updated: updated
    })
  } catch (error) {
    console.error('❌ Error fixing cylinder status:', error)
    return NextResponse.json({ 
      error: `Failed to fix cylinder status: ${error.message}` 
    }, { status: 500 })
  }
}