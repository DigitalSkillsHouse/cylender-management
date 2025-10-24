import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import DailyEmployeeCylinderAggregation from "@/models/DailyEmployeeCylinderAggregation"

export async function GET(request) {
  try {
    await dbConnect()
    
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    const date = searchParams.get('date')
    const productId = searchParams.get('productId')
    
    console.log(`📊 [CYLINDER AGGREGATION API] GET request - Employee: ${employeeId}, Date: ${date}, Product: ${productId}`)
    
    let query = {}
    
    if (employeeId) {
      query.employeeId = employeeId
    }
    
    if (date) {
      query.date = date
    }
    
    if (productId) {
      query.productId = productId
    }
    
    const aggregations = await DailyEmployeeCylinderAggregation.find(query)
      .populate('productId', 'name category cylinderSize')
      .populate('employeeId', 'name email')
      .sort({ date: -1, productName: 1 })
    
    console.log(`📊 [CYLINDER AGGREGATION API] Found ${aggregations.length} cylinder aggregation records`)
    
    return NextResponse.json({
      data: aggregations,
      count: aggregations.length,
      message: "Daily employee cylinder aggregations retrieved successfully"
    })
    
  } catch (error) {
    console.error("Daily Employee Cylinder Aggregation GET error:", error)
    return NextResponse.json({ 
      error: "Failed to fetch daily employee cylinder aggregations", 
      details: error.message 
    }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    await dbConnect()
    
    const body = await request.json()
    const { 
      employeeId, 
      date, 
      productId, 
      productName, 
      transactionType, // 'deposit', 'return', or 'refill'
      quantity,
      amount 
    } = body
    
    console.log(`📊 [CYLINDER AGGREGATION API] POST request - ${transactionType}:`, {
      employeeId,
      date,
      productId,
      productName,
      quantity,
      amount
    })
    
    // Validate required fields
    if (!employeeId || !date || !productId || !productName || !transactionType) {
      return NextResponse.json({ 
        error: "Missing required fields: employeeId, date, productId, productName, transactionType" 
      }, { status: 400 })
    }
    
    // Validate transaction type
    if (!['deposit', 'return', 'refill'].includes(transactionType)) {
      return NextResponse.json({ 
        error: "Invalid transaction type. Must be 'deposit', 'return', or 'refill'" 
      }, { status: 400 })
    }
    
    const transactionData = {
      quantity: Number(quantity) || 0,
      amount: Number(amount) || 0
    }
    
    const aggregation = await DailyEmployeeCylinderAggregation.updateDailyCylinderAggregation(
      employeeId,
      date,
      productId,
      productName,
      transactionType,
      transactionData
    )
    
    return NextResponse.json({
      data: aggregation,
      message: `Daily cylinder ${transactionType} aggregation updated successfully`
    })
    
  } catch (error) {
    console.error("Daily Employee Cylinder Aggregation POST error:", error)
    return NextResponse.json({ 
      error: "Failed to update daily employee cylinder aggregation", 
      details: error.message 
    }, { status: 500 })
  }
}

export async function PUT(request) {
  try {
    await dbConnect()
    
    const body = await request.json()
    const { id, ...updateData } = body
    
    if (!id) {
      return NextResponse.json({ error: "Aggregation ID is required" }, { status: 400 })
    }
    
    const updatedAggregation = await DailyEmployeeCylinderAggregation.findByIdAndUpdate(
      id,
      { 
        ...updateData,
        lastUpdated: new Date()
      },
      { new: true }
    ).populate('productId', 'name category cylinderSize').populate('employeeId', 'name email')
    
    if (!updatedAggregation) {
      return NextResponse.json({ error: "Cylinder aggregation not found" }, { status: 404 })
    }
    
    return NextResponse.json({
      data: updatedAggregation,
      message: "Daily employee cylinder aggregation updated successfully"
    })
    
  } catch (error) {
    console.error("Daily Employee Cylinder Aggregation PUT error:", error)
    return NextResponse.json({ 
      error: "Failed to update daily employee cylinder aggregation", 
      details: error.message 
    }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    await dbConnect()
    
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: "Aggregation ID is required" }, { status: 400 })
    }
    
    const deletedAggregation = await DailyEmployeeCylinderAggregation.findByIdAndDelete(id)
    
    if (!deletedAggregation) {
      return NextResponse.json({ error: "Cylinder aggregation not found" }, { status: 404 })
    }
    
    return NextResponse.json({
      data: deletedAggregation,
      message: "Daily employee cylinder aggregation deleted successfully"
    })
    
  } catch (error) {
    console.error("Daily Employee Cylinder Aggregation DELETE error:", error)
    return NextResponse.json({ 
      error: "Failed to delete daily employee cylinder aggregation", 
      details: error.message 
    }, { status: 500 })
  }
}
