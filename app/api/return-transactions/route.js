import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import ReturnTransaction from "@/models/ReturnTransaction"
import { getEndOfDate, getStartOfDate } from "@/lib/date-utils"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function GET(request) {
  try {
    await dbConnect()

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get("employeeId")
    const date = searchParams.get("date")
    const statusesParam = searchParams.get("statuses") || ""
    const statuses = statusesParam
      .split(",")
      .map((status) => status.trim())
      .filter(Boolean)

    const query = {}
    if (employeeId) query.employee = employeeId
    if (statuses.length > 0) {
      query.status = { $in: statuses }
    }
    if (date) {
      query.returnDate = {
        $gte: getStartOfDate(date),
        $lte: getEndOfDate(date),
      }
    }

    const transactions = await ReturnTransaction.find(query)
      .populate("product", "name category cylinderSize")
      .populate("cylinderProductId", "name category cylinderSize")
      .sort({ returnDate: -1, createdAt: -1 })

    return NextResponse.json({ success: true, data: transactions })
  } catch (error) {
    console.error("[return-transactions][GET] Error:", error)
    return NextResponse.json({ error: "Failed to fetch return transactions" }, { status: 500 })
  }
}
