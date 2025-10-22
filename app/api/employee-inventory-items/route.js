import dbConnect from "@/lib/mongodb"
import { NextResponse } from "next/server"
import Product from "@/models/Product"
import EmployeeInventory from "@/models/EmployeeInventory"

// GET /api/employee-inventory-items?employeeId=xxx
// Returns employee inventory items joined with product info (similar to admin inventory-items)
export async function GET(request) {
  try {
    await dbConnect()
    
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    
    if (!employeeId) {
      return NextResponse.json({ success: false, error: "Employee ID is required" }, { status: 400 })
    }

    // Get both EmployeeInventory records AND StockAssignment records for this employee
    const employeeInventoryItems = await EmployeeInventory.find({ employee: employeeId })
      .populate("product", "name productCode category costPrice leastPrice cylinderSize")
      .sort({ lastUpdated: -1 })
      .lean()

    // Also get StockAssignments for this employee (only pending assignments, not converted ones)
    const StockAssignment = (await import("@/models/StockAssignment")).default
    
    // First, let's see ALL StockAssignments for this employee for debugging
    const allStockAssignments = await StockAssignment.find({ employee: employeeId })
      .populate("product", "name productCode category costPrice leastPrice cylinderSize")
      .sort({ createdAt: -1 })
      .lean()
    
    console.log('🔍 All StockAssignments for employee:', {
      employeeId,
      totalAssignments: allStockAssignments.length,
      assignments: allStockAssignments.map(sa => ({
        id: sa._id,
        product: sa.product?.name,
        status: sa.status,
        quantity: sa.quantity,
        remainingQuantity: sa.remainingQuantity,
        createdAt: sa.createdAt
      }))
    })
    
    const stockAssignments = await StockAssignment.find({ 
      employee: employeeId,
      status: 'assigned' // Only show assignments that haven't been accepted yet
    })
      .populate("product", "name productCode category costPrice leastPrice cylinderSize")
      .populate("cylinderProductId", "name productCode category cylinderSize")
      .populate("gasProductId", "name productCode category")
      .sort({ createdAt: -1 })
      .lean()

    console.log('📊 Employee inventory data:', {
      employeeId,
      employeeInventoryCount: employeeInventoryItems.length,
      stockAssignmentsCount: stockAssignments.length,
      employeeInventoryItems: employeeInventoryItems.map(item => ({
        id: item._id,
        product: item.product?.name,
        category: item.category,
        currentStock: item.currentStock,
        status: item.status
      })),
      stockAssignments: stockAssignments.map(assignment => ({
        id: assignment._id,
        product: assignment.product?.name,
        category: assignment.category,
        quantity: assignment.quantity,
        remainingQuantity: assignment.remainingQuantity,
        status: assignment.status
      }))
    })

    // Convert EmployeeInventory records
    const employeeInventoryData = employeeInventoryItems.map((it) => ({
      _id: it._id.toString(),
      productId: it.product?._id?.toString() || null,
      productName: it.product?.name || "Unknown",
      productCode: it.product?.productCode || null,
      category: it.category,
      currentStock: it.currentStock ?? 0,
      availableEmpty: it.availableEmpty ?? 0,
      availableFull: it.availableFull ?? 0,
      cylinderSize: it.cylinderSize || it.product?.cylinderSize || null,
      cylinderStatus: it.cylinderStatus || null,
      assignedQuantity: it.assignedQuantity ?? 0,
      leastPrice: it.leastPrice ?? 0,
      status: it.status || 'received',
      updatedAt: it.lastUpdated || it.updatedAt,
      source: 'EmployeeInventory'
    }))

    // Convert StockAssignment records to inventory format
    const stockAssignmentData = stockAssignments.map((assignment) => {
      const category = assignment.category || (assignment.product?.category === 'gas' ? 'gas' : 'cylinder')
      const cylinderStatus = assignment.cylinderStatus || (assignment.product?.category === 'cylinder' ? 'empty' : undefined)
      
      return {
        _id: assignment._id.toString(),
        productId: assignment.product?._id?.toString() || null,
        productName: assignment.product?.name || "Unknown",
        productCode: assignment.product?.productCode || null,
        category: category,
        currentStock: assignment.remainingQuantity ?? assignment.quantity ?? 0,
        availableEmpty: (category === 'cylinder' && cylinderStatus === 'empty') ? (assignment.remainingQuantity ?? assignment.quantity ?? 0) : 0,
        availableFull: (category === 'cylinder' && cylinderStatus === 'full') ? (assignment.remainingQuantity ?? assignment.quantity ?? 0) : 0,
        cylinderSize: assignment.product?.cylinderSize || null,
        cylinderStatus: cylinderStatus,
        assignedQuantity: assignment.quantity ?? 0,
        leastPrice: assignment.leastPrice ?? assignment.product?.leastPrice ?? 0,
        status: assignment.status || 'assigned',
        updatedAt: assignment.updatedAt || assignment.createdAt,
        source: 'StockAssignment'
      }
    })

    // Remove duplicates by filtering out StockAssignments that have corresponding EmployeeInventory records
    const employeeInventoryProductIds = new Set(
      employeeInventoryData.map(item => `${item.productId}-${item.cylinderStatus || 'none'}`)
    )
    
    const filteredStockAssignmentData = stockAssignmentData.filter(assignment => {
      const key = `${assignment.productId}-${assignment.cylinderStatus || 'none'}`
      return !employeeInventoryProductIds.has(key)
    })
    
    console.log('🔍 Duplicate filtering:', {
      employeeInventoryCount: employeeInventoryData.length,
      originalStockAssignments: stockAssignmentData.length,
      filteredStockAssignments: filteredStockAssignmentData.length,
      removedDuplicates: stockAssignmentData.length - filteredStockAssignmentData.length
    })

    // Combine both sources, prioritizing EmployeeInventory records (no duplicates)
    const data = [...employeeInventoryData, ...filteredStockAssignmentData]

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Employee inventory items error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// POST /api/employee-inventory-items
// Creates employee inventory record for a product if not present
export async function POST(request) {
  try {
    await dbConnect()
    const body = await request.json()
    const { 
      employeeId, 
      productId, 
      category, 
      currentStock = 0, 
      availableEmpty = 0, 
      availableFull = 0, 
      cylinderSize, 
      cylinderStatus,
      assignedQuantity = 0,
      leastPrice = 0
    } = body || {}

    if (!employeeId || !productId || !category) {
      return NextResponse.json({ 
        success: false, 
        error: "employeeId, productId and category are required" 
      }, { status: 400 })
    }

    const product = await Product.findById(productId)
    if (!product) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 })
    }

    // Check if employee inventory item already exists
    const existing = await EmployeeInventory.findOne({ 
      employee: employeeId, 
      product: productId,
      ...(cylinderStatus && { cylinderStatus })
    })
    
    if (existing) {
      return NextResponse.json({ 
        success: true, 
        data: existing,
        message: "Employee inventory item already exists"
      })
    }

    const newItem = new EmployeeInventory({
      employee: employeeId,
      product: productId,
      category,
      currentStock,
      availableEmpty,
      availableFull,
      cylinderSize: cylinderSize || product.cylinderSize,
      cylinderStatus,
      assignedQuantity,
      leastPrice: leastPrice || product.leastPrice || 0,
      status: 'received'
    })

    await newItem.save()

    return NextResponse.json({ success: true, data: newItem })
  } catch (error) {
    console.error("Create employee inventory item error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
