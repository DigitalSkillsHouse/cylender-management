import dbConnect from "@/lib/mongodb"
import { NextResponse } from "next/server"
import { getNextRcNo } from "@/lib/invoice-generator"

// POST: Generate next RC-NO for collection receipts
export async function POST(request) {
  try {
    await dbConnect()
    
    const rcNo = await getNextRcNo()
    
    return NextResponse.json({ success: true, data: { rcNo } })
  } catch (error) {
    console.error("RC-NO generation error:", error)
    return NextResponse.json({ success: false, error: error?.message || "Failed to generate RC-NO" }, { status: 500 })
  }
}

