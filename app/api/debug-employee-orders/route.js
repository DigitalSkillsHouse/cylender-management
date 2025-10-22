import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeePurchaseOrder from "@/models/EmployeePurchaseOrder"

export async function GET(request) {
  try {
    await dbConnect()
    
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    
    if (!employeeId) {
      return NextResponse.json({ error: "Employee ID is required" }, { status: 400 })
    }

    console.log('🔍 [DEBUG] Checking all orders for employee:', employeeId)
    
    // Get ALL orders for this employee
    const allOrders = await EmployeePurchaseOrder.find({
      employee: employeeId
    })
    .populate('product', 'name productCode category cylinderSize')
    .populate('supplier', 'name')
    .populate('employee', 'name email')
    .sort({ createdAt: -1 })
    .lean()

    console.log('📊 [DEBUG] Total orders found:', allOrders.length)
    
    const orderDetails = allOrders.map(order => ({
      id: order._id.toString(),
      poNumber: order.poNumber,
      product: order.product?.name || 'Unknown',
      status: order.status,
      inventoryStatus: order.inventoryStatus,
      quantity: order.quantity,
      createdAt: order.createdAt,
      notes: order.notes
    }))

    console.log('📊 [DEBUG] Order details:', orderDetails)

    return NextResponse.json({ 
      success: true, 
      employeeId,
      totalOrders: allOrders.length,
      orders: orderDetails
    })
  } catch (error) {
    console.error("❌ [DEBUG] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
