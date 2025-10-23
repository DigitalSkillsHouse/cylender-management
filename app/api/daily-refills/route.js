import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import DailyRefill from "@/models/DailyRefill"
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

    let query = {}
    
    if (date) {
      query.date = date
    }
    
    if (employeeId) {
      if (employeeId === 'all') {
        // Get all employee refills (exclude admin refills)
        query.employeeId = { $ne: null }
      } else {
        query.employeeId = employeeId
      }
    } else {
      // For admin DSR, get admin refills (employeeId: null)
      query.employeeId = null
    }

    const refills = await DailyRefill.find(query)
      .populate('cylinderProductId', 'name category')
      .populate('employeeId', 'name email')
      .sort({ date: -1, cylinderName: 1 })

    return NextResponse.json({ data: refills })
  } catch (error) {
    console.error("Daily refills GET error:", error)
    return NextResponse.json({ error: "Failed to fetch daily refills" }, { status: 500 })
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
    const { date, cylinderProductId, cylinderName, quantity, employeeId } = body

    // Validate required fields
    if (!date || !cylinderProductId || !cylinderName || !quantity) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Create or update daily refill entry
    const refill = await DailyRefill.findOneAndUpdate(
      {
        date: date,
        cylinderProductId: cylinderProductId,
        employeeId: employeeId || null
      },
      {
        $inc: { todayRefill: Number(quantity) },
        $set: { cylinderName: cylinderName }
      },
      {
        upsert: true,
        new: true
      }
    )

    return NextResponse.json({ data: refill })
  } catch (error) {
    console.error("Daily refills POST error:", error)
    return NextResponse.json({ error: "Failed to create/update daily refill" }, { status: 500 })
  }
}
