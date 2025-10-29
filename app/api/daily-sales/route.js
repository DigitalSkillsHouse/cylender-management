import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import DailySales from "@/models/DailySales"

export async function GET(request) {
  try {
    await dbConnect()

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')

    const filter = {}
    if (date) {
      filter.date = date
    }

    const sales = await DailySales.find(filter)
      .populate('productId', 'name category cylinderSize')
      .sort({ date: -1, productName: 1 })

    console.log(`[daily-sales] Found ${sales.length} records for date: ${date || 'all'}`)
    if (date && sales.length > 0) {
      console.log('[daily-sales] Sample records:', sales.slice(0, 3).map(s => ({
        productName: s.productName,
        category: s.category,
        gasSalesQuantity: s.gasSalesQuantity,
        fullCylinderSalesQuantity: s.fullCylinderSalesQuantity
      })))
    }

    return NextResponse.json({ 
      success: true, 
      data: sales 
    })

  } catch (error) {
    console.error('[daily-sales] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to fetch daily sales", 
        details: error.message 
      },
      { status: 500 }
    )
  }
}

export async function POST(request) {
  try {
    await dbConnect()

    const data = await request.json()
    console.log('[daily-sales] Creating/updating record:', data)

    // Validate required fields
    if (!data.date || !data.productId || !data.productName) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Missing required fields: date, productId, productName" 
        },
        { status: 400 }
      )
    }

    // Create or update daily sales record
    const filter = {
      date: data.date,
      productId: data.productId
    }

    const updateData = {
      productName: data.productName,
      category: data.category || 'gas',
      cylinderStatus: data.cylinderStatus,
      cylinderProductId: data.cylinderProductId,
      cylinderName: data.cylinderName
    }

    // Add increments based on sale type
    if (data.gasSalesQuantity || data.gasSalesAmount) {
      updateData.$inc = {
        ...(updateData.$inc || {}),
        gasSalesQuantity: Number(data.gasSalesQuantity) || 0,
        gasSalesAmount: Number(data.gasSalesAmount) || 0
      }
    }

    if (data.cylinderSalesQuantity || data.cylinderSalesAmount) {
      updateData.$inc = {
        ...(updateData.$inc || {}),
        cylinderSalesQuantity: Number(data.cylinderSalesQuantity) || 0,
        cylinderSalesAmount: Number(data.cylinderSalesAmount) || 0
      }
    }

    if (data.fullCylinderSalesQuantity || data.fullCylinderSalesAmount) {
      updateData.$inc = {
        ...(updateData.$inc || {}),
        fullCylinderSalesQuantity: Number(data.fullCylinderSalesQuantity) || 0,
        fullCylinderSalesAmount: Number(data.fullCylinderSalesAmount) || 0
      }
    }

    // Transfer tracking (admin assigns stock to employees)
    if (data.transferQuantity || data.transferAmount) {
      updateData.$inc = {
        ...(updateData.$inc || {}),
        transferQuantity: Number(data.transferQuantity) || 0,
        transferAmount: Number(data.transferAmount) || 0
      }
    }

    // Received back tracking (employees return stock to admin)
    if (data.receivedBackQuantity || data.receivedBackAmount) {
      updateData.$inc = {
        ...(updateData.$inc || {}),
        receivedBackQuantity: Number(data.receivedBackQuantity) || 0,
        receivedBackAmount: Number(data.receivedBackAmount) || 0
      }
    }

    const sale = await DailySales.findOneAndUpdate(
      filter,
      {
        $set: updateData,
        ...(updateData.$inc ? { $inc: updateData.$inc } : {})
      },
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true
      }
    )

    console.log('[daily-sales] Created/Updated record:', sale._id)

    return NextResponse.json({ 
      success: true, 
      data: sale 
    }, { status: 201 })

  } catch (error) {
    console.error('[daily-sales] Error creating record:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to create daily sales record", 
        details: error.message 
      },
      { status: 500 }
    )
  }
}