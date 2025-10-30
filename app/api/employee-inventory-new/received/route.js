import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeeInventoryItem from "@/models/EmployeeInventoryItem"
import Product from "@/models/Product"

export async function GET(request) {
  try {
    console.log('🔍 Employee received inventory API called')
    await dbConnect()
    
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    
    if (!employeeId) {
      return NextResponse.json({ error: "Employee ID is required" }, { status: 400 })
    }

    console.log('📋 Fetching received inventory for employee:', employeeId)
    
    // Fetch employee's inventory items (similar to admin inventory-items but employee-specific)
    const inventoryItems = await EmployeeInventoryItem.find({
      employee: employeeId
    })
    .populate('product', 'name productCode category costPrice leastPrice cylinderSize')
    .sort({ updatedAt: -1 })
    .lean()

    console.log('📊 Found inventory items:', {
      count: inventoryItems.length,
      items: inventoryItems.map(item => ({
        id: item._id,
        product: item.product?.name,
        category: item.category,
        currentStock: item.currentStock,
        availableEmpty: item.availableEmpty,
        availableFull: item.availableFull
      }))
    })

    // Transform to match frontend interface (similar to admin inventory-items API)
    const transformedItems = inventoryItems.map((item) => ({
      _id: item._id.toString(),
      productId: item.product?._id?.toString() || null,
      productName: item.product?.name || "Unknown",
      productCode: item.product?.productCode || null,
      category: item.category,
      currentStock: item.currentStock ?? 0,
      availableEmpty: item.availableEmpty ?? 0,
      availableFull: item.availableFull ?? 0,
      cylinderSize: item.cylinderSize || item.product?.cylinderSize || null,
      gasType: item.gasType || null,
      // Include price fields for employee gas sales
      costPrice: item.product?.costPrice || 0,
      leastPrice: item.product?.leastPrice || 0,
      updatedAt: item.updatedAt,
    }))

    console.log('📤 Returning received inventory:', {
      totalItems: transformedItems.length,
      employeeId: employeeId,
      gasItems: transformedItems.filter(item => item.category === 'gas' && item.currentStock > 0).length,
      fullCylinders: transformedItems.filter(item => item.category === 'cylinder' && item.availableFull > 0).length,
      emptyCylinders: transformedItems.filter(item => item.category === 'cylinder' && item.availableEmpty > 0).length
    })

    return NextResponse.json({ success: true, data: transformedItems })
  } catch (error) {
    console.error("❌ Error fetching employee received inventory:", error)
    return NextResponse.json({ error: `Failed to fetch received inventory: ${error.message}` }, { status: 500 })
  }
}
