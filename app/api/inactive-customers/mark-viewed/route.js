import dbConnect from "@/lib/mongodb"
import InactiveCustomerView from "@/models/InactiveCustomerView"
import { NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"

export async function POST(request) {
  try {
    await dbConnect()

    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { customerIds } = await request.json()

    if (!customerIds || !Array.isArray(customerIds)) {
      return NextResponse.json({ error: "Customer IDs array is required" }, { status: 400 })
    }

    // Create view records for each customer
    const viewRecords = customerIds.map(customerId => ({
      customerId,
      viewedBy: user.id,
      viewedAt: new Date(),
    }))

    // Insert all view records
    await InactiveCustomerView.insertMany(viewRecords)

    return NextResponse.json({ 
      success: true, 
      message: `Marked ${customerIds.length} customers as viewed`,
      viewedCount: customerIds.length 
    })

  } catch (error) {
    console.error("Mark customers as viewed error:", error)
    return NextResponse.json(
      { error: "Failed to mark customers as viewed" },
      { status: 500 }
    )
  }
}
