import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import StockAssignment from "@/models/StockAssignment"
import Product from "@/models/Product"

export async function GET(request) {
  try {
    console.log('🔍 Employee pending assignments API called')
    await dbConnect()
    
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    
    if (!employeeId) {
      return NextResponse.json({ error: "Employee ID is required" }, { status: 400 })
    }

    console.log('📋 Fetching pending assignments for employee:', employeeId)
    
    // Fetch employee's pending stock assignments (admin assigned but employee hasn't accepted yet)
    const pendingAssignments = await StockAssignment.find({
      employee: employeeId,
      status: 'assigned' // Admin assigned but employee hasn't accepted yet
    })
    .populate('product', 'name productCode category cylinderSize')
    .populate('assignedBy', 'name')
    .populate('employee', 'name email')
    .sort({ createdAt: -1 })
    .lean()

    console.log('📊 Found pending assignments:', {
      count: pendingAssignments.length,
      assignments: pendingAssignments.map(assignment => ({
        id: assignment._id,
        product: assignment.product?.name,
        status: assignment.status,
        quantity: assignment.quantity,
        remainingQuantity: assignment.remainingQuantity
      }))
    })

    // Transform to match frontend interface
    const transformedAssignments = pendingAssignments.map((assignment, index) => ({
      id: `${assignment._id}-${index}`,
      assignmentId: assignment._id.toString(),
      productName: assignment.product?.name || 'Unknown Product',
      productCode: assignment.product?.productCode || '',
      assignedBy: assignment.assignedBy?.name || 'Admin',
      assignedDate: assignment.createdAt,
      quantity: assignment.quantity || 0,
      remainingQuantity: assignment.remainingQuantity || 0,
      category: assignment.category || assignment.product?.category || 'gas',
      cylinderStatus: assignment.cylinderStatus,
      displayCategory: assignment.displayCategory || assignment.category,
      gasProductId: assignment.gasProductId,
      cylinderProductId: assignment.cylinderProductId,
      gasProductName: assignment.gasProductName,
      cylinderProductName: assignment.cylinderProductName,
      notes: assignment.notes || '',
      employeeId: assignment.employee?._id || employeeId,
      originalAssignmentId: assignment._id.toString(),
      itemIndex: index
    }))

    console.log('📤 Returning pending assignments:', {
      totalAssignments: transformedAssignments.length,
      employeeId: employeeId
    })

    return NextResponse.json({ success: true, data: transformedAssignments })
  } catch (error) {
    console.error("❌ Error fetching employee pending assignments:", error)
    return NextResponse.json({ error: `Failed to fetch pending assignments: ${error.message}` }, { status: 500 })
  }
}
