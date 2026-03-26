import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import {
  findAdminDsrRebuildStartDate,
  normalizeAdminEntryDate,
  recalculateAdminDailyStockReportsFrom,
} from "@/lib/admin-backdated-sync"
import {
  findEmployeeDsrRebuildStartDate,
  findEmployeeIdsForDsrRebuild,
  normalizeEmployeeEntryDate,
  recalculateEmployeeDailyStockReportsFrom,
} from "@/lib/employee-dsr-sync"
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

export async function POST(request) {
  try {
    const allowed = await isAdminRequestAllowed(request)
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()

    const body = await request.json().catch(() => ({}))
    const scope = String(body?.scope || "all").toLowerCase()
    const employeeId = body?.employeeId ? String(body.employeeId) : ""
    const fromDate = body?.fromDate ? String(body.fromDate) : ""

    if (!["admin", "employee", "all"].includes(scope)) {
      return NextResponse.json({ success: false, error: "Invalid scope" }, { status: 400 })
    }

    const summary = {
      scope,
      requestedFromDate: fromDate || null,
      admin: null,
      employees: [],
    }

    if (scope === "admin" || scope === "all") {
      const adminStartDate = fromDate
        ? normalizeAdminEntryDate(fromDate)
        : await findAdminDsrRebuildStartDate()

      summary.admin = await recalculateAdminDailyStockReportsFrom(adminStartDate)
    }

    if (scope === "employee" || scope === "all") {
      const employeeIds = employeeId ? [employeeId] : await findEmployeeIdsForDsrRebuild()

      for (const currentEmployeeId of employeeIds) {
        const employeeStartDate = fromDate
          ? normalizeEmployeeEntryDate(fromDate)
          : await findEmployeeDsrRebuildStartDate(currentEmployeeId)

        const result = await recalculateEmployeeDailyStockReportsFrom(currentEmployeeId, employeeStartDate)
        summary.employees.push(result)
      }
    }

    return NextResponse.json({
      success: true,
      data: summary,
    })
  } catch (error) {
    console.error("[dsr-rebuild] Error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to rebuild DSR history", details: error?.message || "Unknown error" },
      { status: 500 }
    )
  }
}
