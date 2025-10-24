import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import DailyEmployeeSalesAggregation from "@/models/DailyEmployeeSalesAggregation"
import { verifyToken } from "@/lib/auth"

export async function GET(request) {
  try {
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const date = searchParams.get("date")
    const employeeId = searchParams.get("employeeId")
    const productId = searchParams.get("productId")

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

    const aggregations = await DailyEmployeeSalesAggregation.find(query)
      .populate('productId', 'name category')
      .populate('employeeId', 'name email')
      .sort({ date: -1, productName: 1 })

    return NextResponse.json({ 
      success: true,
      data: aggregations,
      count: aggregations.length
    })
  } catch (error) {
    console.error("Daily employee sales aggregation GET error:", error)
    return NextResponse.json({ 
      error: "Failed to fetch daily employee sales aggregation" 
    }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()

    const body = await request.json()
    const { 
      employeeId, 
      date, 
      productId, 
      productName, 
      productCategory,
      salesData 
    } = body

    // Validate required fields
    if (!employeeId || !date || !productId || !productName || !productCategory) {
      return NextResponse.json({ 
        error: "Missing required fields: employeeId, date, productId, productName, productCategory" 
      }, { status: 400 })
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(date)) {
      return NextResponse.json({ 
        error: "Invalid date format. Use YYYY-MM-DD" 
      }, { status: 400 })
    }

    // Update daily aggregation
    const aggregation = await DailyEmployeeSalesAggregation.updateDailyAggregation(
      employeeId,
      date,
      productId,
      productName,
      productCategory,
      salesData || {}
    )

    return NextResponse.json({ 
      success: true,
      data: aggregation
    })
  } catch (error) {
    console.error("Daily employee sales aggregation POST error:", error)
    return NextResponse.json({ 
      error: "Failed to update daily employee sales aggregation" 
    }, { status: 500 })
  }
}

export async function PUT(request) {
  try {
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()

    const body = await request.json()
    const { 
      employeeId, 
      date, 
      productId, 
      salesData 
    } = body

    // Validate required fields
    if (!employeeId || !date || !productId) {
      return NextResponse.json({ 
        error: "Missing required fields: employeeId, date, productId" 
      }, { status: 400 })
    }

    // Find and update existing aggregation
    const aggregation = await DailyEmployeeSalesAggregation.findOneAndUpdate(
      {
        employeeId,
        date,
        productId
      },
      {
        $set: {
          ...salesData,
          lastUpdated: new Date()
        }
      },
      {
        new: true
      }
    ).populate('productId', 'name category').populate('employeeId', 'name email')

    if (!aggregation) {
      return NextResponse.json({ 
        error: "Daily aggregation not found" 
      }, { status: 404 })
    }

    return NextResponse.json({ 
      success: true,
      data: aggregation
    })
  } catch (error) {
    console.error("Daily employee sales aggregation PUT error:", error)
    return NextResponse.json({ 
      error: "Failed to update daily employee sales aggregation" 
    }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get("employeeId")
    const date = searchParams.get("date")
    const productId = searchParams.get("productId")

    let query = {}
    
    if (employeeId) query.employeeId = employeeId
    if (date) query.date = date
    if (productId) query.productId = productId

    if (Object.keys(query).length === 0) {
      return NextResponse.json({ 
        error: "At least one query parameter required" 
      }, { status: 400 })
    }

    const result = await DailyEmployeeSalesAggregation.deleteMany(query)

    return NextResponse.json({ 
      success: true,
      deletedCount: result.deletedCount
    })
  } catch (error) {
    console.error("Daily employee sales aggregation DELETE error:", error)
    return NextResponse.json({ 
      error: "Failed to delete daily employee sales aggregation" 
    }, { status: 500 })
  }
}
