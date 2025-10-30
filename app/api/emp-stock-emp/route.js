import { NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import EmpStockEmp from '@/models/EmpStockEmp'
import User from '@/models/User'
import Product from '@/models/Product'

// GET - Fetch stock assignments
export async function GET(request) {
  try {
    await connectDB()
    
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    const adminId = searchParams.get('adminId')
    const date = searchParams.get('date')
    const status = searchParams.get('status')
    const adminOnly = searchParams.get('adminOnly')
    
    let query = {}
    
    // Admin only filter - only show admin assignments (not employee-specific)
    if (adminOnly === 'true') {
      // For admin DSR, we want to see all admin assignments regardless of employee
      // This shows transfers from admin to employees
    } else if (employeeId) {
      // Filter by specific employee
      query.employeeId = employeeId
    }
    
    // Filter by admin
    if (adminId) {
      query.adminId = adminId
    }
    
    // Filter by date
    if (date) {
      const startDate = new Date(date)
      const endDate = new Date(date)
      endDate.setDate(endDate.getDate() + 1)
      query.assignmentDate = {
        $gte: startDate,
        $lt: endDate
      }
    }
    
    // Filter by status
    if (status) {
      query.status = status
    }
    
    console.log('[emp-stock-emp][GET] Query:', query)
    
    const assignments = await EmpStockEmp.find(query)
      .populate('adminId', 'name email')
      .populate('employeeId', 'name email')
      .populate('productId', 'name productCode category')
      .sort({ assignmentDate: -1 })
    
    console.log(`[emp-stock-emp][GET] Found ${assignments.length} assignments`)
    
    return NextResponse.json({
      success: true,
      data: assignments
    })
    
  } catch (error) {
    console.error('[emp-stock-emp][GET] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stock assignments' },
      { status: 500 }
    )
  }
}

// POST - Create new stock assignment
export async function POST(request) {
  try {
    await connectDB()
    
    const data = await request.json()
    console.log('[emp-stock-emp][POST] Creating assignment:', data)
    
    // Log cylinder linking information for gas assignments
    if (data.relatedCylinderProductId && data.relatedCylinderName) {
      console.log(`[emp-stock-emp][POST] Gas-Cylinder linking: ${data.productId} → ${data.relatedCylinderProductId} (${data.relatedCylinderName})`)
    }
    
    // Validate required fields
    const requiredFields = ['adminId', 'employeeId', 'productId', 'assignedQuantity', 'unitPrice']
    for (const field of requiredFields) {
      if (!data[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        )
      }
    }
    
    // Fetch admin, employee, and product details
    const [admin, employee, product] = await Promise.all([
      User.findById(data.adminId),
      User.findById(data.employeeId),
      Product.findById(data.productId)
    ])
    
    if (!admin) {
      return NextResponse.json(
        { error: 'Admin not found' },
        { status: 404 }
      )
    }
    
    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      )
    }
    
    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }
    
    // Calculate total amount
    const totalAmount = data.assignedQuantity * data.unitPrice
    
    // Create assignment record
    const assignment = new EmpStockEmp({
      assignmentDate: data.assignmentDate || new Date(),
      adminId: admin._id,
      adminName: admin.name,
      employeeId: employee._id,
      employeeName: employee.name,
      productId: product._id,
      productName: product.name,
      productCode: product.productCode,
      category: product.category,
      cylinderStatus: data.cylinderStatus,
      cylinderSize: product.cylinderSize,
      assignedQuantity: data.assignedQuantity,
      unitPrice: data.unitPrice,
      totalAmount: totalAmount,
      status: 'assigned',
      notes: data.notes || `Stock assigned by ${admin.name} via Employee Management`,
      assignmentMethod: 'employee_management_page',
      inventoryDeducted: false,
      dailySalesUpdated: false,
      // Add cylinder linking for gas assignments
      ...(data.relatedCylinderProductId ? {
        relatedCylinderProductId: data.relatedCylinderProductId,
        relatedCylinderName: data.relatedCylinderName
      } : {})
    })
    
    const savedAssignment = await assignment.save()
    console.log('[emp-stock-emp][POST] Assignment created:', savedAssignment._id)
    
    return NextResponse.json({
      success: true,
      data: savedAssignment,
      message: 'Stock assignment recorded successfully'
    })
    
  } catch (error) {
    console.error('[emp-stock-emp][POST] Error:', error)
    return NextResponse.json(
      { error: 'Failed to create stock assignment' },
      { status: 500 }
    )
  }
}

// PUT - Update stock assignment status
export async function PUT(request) {
  try {
    await connectDB()
    
    const data = await request.json()
    const { assignmentId, status, inventoryDeducted, dailySalesUpdated } = data
    
    console.log('[emp-stock-emp][PUT] Updating assignment:', assignmentId, data)
    
    if (!assignmentId) {
      return NextResponse.json(
        { error: 'Assignment ID is required' },
        { status: 400 }
      )
    }
    
    const updateData = {}
    
    if (status) updateData.status = status
    if (typeof inventoryDeducted === 'boolean') updateData.inventoryDeducted = inventoryDeducted
    if (typeof dailySalesUpdated === 'boolean') updateData.dailySalesUpdated = dailySalesUpdated
    
    const updatedAssignment = await EmpStockEmp.findByIdAndUpdate(
      assignmentId,
      updateData,
      { new: true }
    )
    
    if (!updatedAssignment) {
      return NextResponse.json(
        { error: 'Assignment not found' },
        { status: 404 }
      )
    }
    
    console.log('[emp-stock-emp][PUT] Assignment updated:', updatedAssignment._id)
    
    return NextResponse.json({
      success: true,
      data: updatedAssignment,
      message: 'Assignment updated successfully'
    })
    
  } catch (error) {
    console.error('[emp-stock-emp][PUT] Error:', error)
    return NextResponse.json(
      { error: 'Failed to update assignment' },
      { status: 500 }
    )
  }
}
