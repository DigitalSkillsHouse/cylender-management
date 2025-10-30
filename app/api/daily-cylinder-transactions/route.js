import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import DailyCylinderTransaction from "@/models/DailyCylinderTransaction"

export async function GET(request) {
  try {
    await dbConnect()

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const employeeId = searchParams.get('employeeId')
    const isEmployeeTransaction = searchParams.get('isEmployeeTransaction')
    const adminOnly = searchParams.get('adminOnly')

    // Build query filter
    const filter = {}
    if (date) {
      filter.date = date
    }
    
    // Admin only filter - exclude employee transactions
    if (adminOnly === 'true') {
      filter.isEmployeeTransaction = false
      filter.employeeId = null
    } else if (employeeId) {
      filter.employeeId = employeeId
    }
    
    // Filter by transaction type (admin vs employee)
    if (isEmployeeTransaction !== null && adminOnly !== 'true') {
      if (isEmployeeTransaction === 'false') {
        // Admin transactions only (employeeId is null and isEmployeeTransaction is false)
        filter.employeeId = null
        filter.isEmployeeTransaction = false
      } else if (isEmployeeTransaction === 'true') {
        // Employee transactions only
        filter.isEmployeeTransaction = true
      }
    }

    console.log('[daily-cylinder-transactions] Fetching with filter:', filter)

    // Fetch daily cylinder transactions
    const transactions = await DailyCylinderTransaction.find(filter)
      .populate('cylinderProductId', 'name category cylinderSize')
      .populate('employeeId', 'name email')
      .sort({ date: -1, cylinderName: 1 })

    console.log(`[daily-cylinder-transactions] Found ${transactions.length} records`)

    return NextResponse.json({ 
      success: true, 
      data: transactions 
    })

  } catch (error) {
    console.error('[daily-cylinder-transactions] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to fetch daily cylinder transactions", 
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
    console.log('[daily-cylinder-transactions] Creating record:', data)

    // Validate required fields
    if (!data.date || !data.cylinderProductId || !data.cylinderName) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Missing required fields: date, cylinderProductId, cylinderName" 
        },
        { status: 400 }
      )
    }

    // Create or update daily cylinder transaction record
    const filter = {
      date: data.date,
      cylinderProductId: data.cylinderProductId,
      employeeId: data.employeeId || null
    }

    const updateData = {
      cylinderName: data.cylinderName,
      cylinderSize: data.cylinderSize || 'Unknown Size',
      isEmployeeTransaction: data.isEmployeeTransaction || false
    }

    // Add increments based on transaction type
    if (data.depositQuantity || data.depositAmount) {
      updateData.$inc = {
        ...(updateData.$inc || {}),
        depositQuantity: Number(data.depositQuantity) || 0,
        depositAmount: Number(data.depositAmount) || 0
      }
    }

    if (data.returnQuantity || data.returnAmount) {
      updateData.$inc = {
        ...(updateData.$inc || {}),
        returnQuantity: Number(data.returnQuantity) || 0,
        returnAmount: Number(data.returnAmount) || 0
      }
    }

    if (data.fullCylinderSalesQuantity || data.fullCylinderSalesAmount) {
      updateData.$inc = {
        ...(updateData.$inc || {}),
        fullCylinderSalesQuantity: Number(data.fullCylinderSalesQuantity) || 0,
        fullCylinderSalesAmount: Number(data.fullCylinderSalesAmount) || 0
      }
    }

    const transaction = await DailyCylinderTransaction.findOneAndUpdate(
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

    console.log('[daily-cylinder-transactions] Created/Updated record:', transaction._id)

    return NextResponse.json({ 
      success: true, 
      data: transaction 
    }, { status: 201 })

  } catch (error) {
    console.error('[daily-cylinder-transactions] Error creating record:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to create daily cylinder transaction", 
        details: error.message 
      },
      { status: 500 }
    )
  }
}
