import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeeCylinderTransaction from "@/models/EmployeeCylinderTransaction"
import { recalculateEmployeeDailyStockReportsFrom } from "@/lib/employee-dsr-sync"
import { verifyToken } from "@/lib/auth"
import { getLocalDateStringFromDate } from "@/lib/date-utils"

// GET a single transaction by ID
export async function GET(request, { params }) {
  try {
    await dbConnect()
    const transaction = await EmployeeCylinderTransaction.findById(params.id)
      .populate('customer', 'name phone address')
      .populate('employee', 'name')
      .populate('product')

    if (!transaction) {
      return NextResponse.json({ success: false, error: "Transaction not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: transaction })
  } catch (error) {
    console.error('Error fetching employee cylinder transaction:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch transaction' }, { status: 500 })
  }
}

export async function PATCH(request, { params }) {
  try {
    await dbConnect()

    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const customerSignature = body?.customerSignature
    if (!customerSignature) {
      return NextResponse.json({ success: false, error: "customerSignature is required" }, { status: 400 })
    }

    const existing = await EmployeeCylinderTransaction.findById(params.id)
    if (!existing) {
      return NextResponse.json({ success: false, error: "Transaction not found" }, { status: 404 })
    }

    if (String(user.role || "").toLowerCase() === "employee" && String(existing.employee) !== String(user.id)) {
      return NextResponse.json({ success: false, error: "Access denied" }, { status: 403 })
    }

    const updated = await EmployeeCylinderTransaction.findByIdAndUpdate(
      params.id,
      { $set: { customerSignature } },
      { new: true }
    )
      .populate('customer', 'name phone address')
      .populate('employee', 'name')
      .populate('product')

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error('Error patching employee cylinder transaction signature:', error)
    return NextResponse.json({ success: false, error: 'Failed to save signature' }, { status: 500 })
  }
}

// UPDATE a transaction by ID
export async function PUT(request, { params }) {
  try {
    await dbConnect()
    
    // Verify user authentication and check if admin
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }
    
    // Only allow admins to edit cylinder transactions
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: "Access denied. Only admins can edit transactions." }, { status: 403 })
    }
    
    const body = await request.json()
    const existingTransaction = await EmployeeCylinderTransaction.findById(params.id)

    const transaction = await EmployeeCylinderTransaction.findByIdAndUpdate(
      params.id,
      body,
      { new: true, runValidators: true }
    )

    if (!transaction) {
      return NextResponse.json({ success: false, error: "Transaction not found" }, { status: 404 })
    }

    try {
      const employeeId = String(transaction.employee || existingTransaction?.employee || "")
      const affectedDate = getLocalDateStringFromDate(existingTransaction?.createdAt || transaction.createdAt || new Date())
      if (employeeId) {
        await recalculateEmployeeDailyStockReportsFrom(employeeId, affectedDate)
      }
    } catch (syncError) {
      console.error("[employee-cylinders][PUT] Failed to rebuild employee DSR snapshots:", syncError)
    }

    return NextResponse.json({ success: true, data: transaction })
  } catch (error) {
    console.error('Error updating employee cylinder transaction:', error)
    return NextResponse.json({ success: false, error: 'Failed to update transaction' }, { status: 500 })
  }
}

// DELETE a transaction by ID
export async function DELETE(request, { params }) {
  try {
    await dbConnect()
    
    // Verify user authentication and check if admin
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }
    
    // Only allow admins to delete cylinder transactions
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: "Access denied. Only admins can delete transactions." }, { status: 403 })
    }
    
    const deletedTransaction = await EmployeeCylinderTransaction.findByIdAndDelete(params.id)

    if (!deletedTransaction) {
      return NextResponse.json({ success: false, error: "Transaction not found" }, { status: 404 })
    }

    try {
      const employeeId = String(deletedTransaction.employee || "")
      const affectedDate = getLocalDateStringFromDate(deletedTransaction.createdAt || new Date())
      if (employeeId) {
        await recalculateEmployeeDailyStockReportsFrom(employeeId, affectedDate)
      }
    } catch (syncError) {
      console.error("[employee-cylinders][DELETE] Failed to rebuild employee DSR snapshots:", syncError)
    }

    return NextResponse.json({ success: true, data: {} })
  } catch (error) {
    console.error('Error deleting employee cylinder transaction:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete transaction' }, { status: 500 })
  }
}
