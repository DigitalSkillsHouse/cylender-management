import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeeDailyStockReport from "@/models/EmployeeDailyStockReport"
import { recalculateEmployeeDailyStockReportsFrom } from "@/lib/employee-dsr-sync"
import { verifyToken } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"
export const maxDuration = 600

const isAdminRequestAllowed = async (request) => {
  const user = await verifyToken(request).catch(() => null)
  if (user && String(user.role || "").toLowerCase() === "admin") {
    return true
  }

  return process.env.NODE_ENV !== "production"
}

export async function GET(request) {
  try {
    const allowed = await isAdminRequestAllowed(request)
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get("employeeId")
    const date = searchParams.get("date")

    if (!employeeId || !date) {
      return NextResponse.json(
        { success: false, error: "employeeId and date are required" },
        { status: 400 }
      )
    }

    const rebuild = await recalculateEmployeeDailyStockReportsFrom(String(employeeId), String(date))

    const rows = await EmployeeDailyStockReport.find({
      employeeId: String(employeeId),
      date: String(date),
    })
      .sort({ itemName: 1, createdAt: 1 })
      .lean()

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        employeeId: String(employeeId),
        date: String(date),
        rebuild,
      },
    })
  } catch (error) {
    console.error("[admin][employee-dsr-preview] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch employee DSR preview",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    )
  }
}
