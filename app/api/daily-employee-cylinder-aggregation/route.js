import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import DailyEmployeeCylinderAggregation from "@/models/DailyEmployeeCylinderAggregation"

export async function GET(request) {
  try {
    await dbConnect()
    
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const employeeId = searchParams.get('employeeId')

    const filter = {}
    if (date) filter.date = date
    if (employeeId) filter.employeeId = employeeId

    console.log(`📊 [API] Fetching daily employee cylinder aggregation with filter:`, filter)

    const aggregationData = await DailyEmployeeCylinderAggregation.find(filter)
      .populate('productId', 'name category cylinderSize')
      .populate('employeeId', 'name email')
      .sort({ date: -1, productName: 1 })

    console.log(`📊 [API] Found ${aggregationData.length} cylinder aggregation records`)

    return NextResponse.json({ success: true, data: aggregationData })
  } catch (error) {
    console.error('Failed to fetch daily employee cylinder aggregation:', error)
    return NextResponse.json({ error: 'Failed to fetch daily employee cylinder aggregation' }, { status: 500 })
  }
}