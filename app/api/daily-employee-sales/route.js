import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import DailyEmployeeSales from "@/models/DailyEmployeeSales"
import { getLocalDateStringFromDate } from "@/lib/date-utils"
import { verifyToken } from "@/lib/auth"

export async function GET(request) {
  try {
    await dbConnect()
    
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const employeeId = searchParams.get('employeeId')

    const filter = {}
    if (date) filter.date = date
    if (employeeId) filter.employeeId = employeeId

    const salesData = await DailyEmployeeSales.find(filter)
      .populate('productId', 'name category cylinderSize')
      .populate('employeeId', 'name email')
      .sort({ date: -1, productName: 1 })

    return NextResponse.json({ success: true, data: salesData })
  } catch (error) {
    console.error('Failed to fetch daily employee sales:', error)
    return NextResponse.json({ error: 'Failed to fetch daily employee sales' }, { status: 500 })
  }
}

// Helper function to update daily employee sales tracking
export async function updateDailyEmployeeSalesTracking(sale, employeeId) {
  try {
    await dbConnect()
    
    // Use local date instead of UTC to ensure correct date assignment
    const dateStr = getLocalDateStringFromDate(sale.createdAt)
    
    const items = Array.isArray(sale.items) ? sale.items : []

    for (const item of items) {
      const productId = typeof item.product === 'object' ? item.product._id : item.product
      const productName = typeof item.product === 'object' ? item.product.name : (item.productName || 'Unknown Product')
      const category = typeof item.product === 'object' ? item.product.category : (item.category || 'unknown')
      const quantity = Number(item.quantity) || 0
      const amount = Number(item.total) || (Number(item.price) * quantity) || 0
      const cylinderStatus = item.cylinderStatus

      if (!productId || quantity <= 0) continue

      const filter = {
        date: dateStr,
        employeeId: employeeId,
        productId: productId
      }

      const updateData = {
        $set: {
          productName: productName,
          category: category
        }
      }

      // Update based on category and cylinder status
      if (category === 'gas') {
        updateData.$inc = { 
          gasSalesQuantity: quantity, 
          gasSalesAmount: amount 
        }
        console.log(`📊 Employee Daily Sales: Gas sale tracked - ${productName}: ${quantity} units, ${amount} AED`)
      } else if (category === 'cylinder') {
        if (cylinderStatus === 'full') {
          updateData.$inc = { 
            fullCylinderSalesQuantity: quantity, 
            fullCylinderSalesAmount: amount,
            cylinderSalesQuantity: quantity,
            cylinderSalesAmount: amount
          }
          updateData.$set.cylinderStatus = 'full'
          console.log(`📊 Employee Daily Sales: Full cylinder sale tracked - ${productName}: ${quantity} units, ${amount} AED`)
        } else {
          // Empty cylinder sales or when cylinderStatus is not specified (default to empty)
          updateData.$inc = { 
            emptyCylinderSalesQuantity: quantity, 
            emptyCylinderSalesAmount: amount,
            cylinderSalesQuantity: quantity,
            cylinderSalesAmount: amount
          }
          updateData.$set.cylinderStatus = cylinderStatus || 'empty'
          console.log(`📊 Employee Daily Sales: Empty cylinder sale tracked - ${productName}: ${quantity} units, ${amount} AED`)
        }
      }

      await DailyEmployeeSales.findOneAndUpdate(filter, updateData, { upsert: true })
    }
  } catch (error) {
    console.error('Failed to update daily employee sales tracking:', error)
    throw error
  }
}
