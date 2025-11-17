import dbConnect from "../../../lib/mongodb"
import Expense from "../../../models/Expense"
import { NextResponse } from "next/server"

export async function GET() {
  await dbConnect()

  try {
    const expenses = await Expense.find({}).sort({ createdAt: -1 })
    
    return NextResponse.json({
      success: true,
      data: expenses
    })
  } catch (error) {
    console.error("Error fetching expenses:", error)
    return NextResponse.json({
      success: false,
      error: "Failed to fetch expenses"
    }, { status: 500 })
  }
}

export async function POST(request) {
  await dbConnect()

  try {
    const body = await request.json()
    const { invoiceNumber, expense, description, vatAmount, totalAmount } = body

    if (!invoiceNumber || !expense || !description) {
      return NextResponse.json({
        success: false,
        error: "Invoice number, expense amount and description are required"
      }, { status: 400 })
    }

    if (expense <= 0) {
      return NextResponse.json({
        success: false,
        error: "Expense amount must be greater than 0"
      }, { status: 400 })
    }

    const newExpense = new Expense({
      invoiceNumber: invoiceNumber.trim(),
      expense: Number(expense),
      description: description.trim(),
      vatAmount: Number(vatAmount),
      totalAmount: Number(totalAmount)
    })

    await newExpense.save()

    return NextResponse.json({
      success: true,
      data: newExpense
    })
  } catch (error) {
    console.error("Error creating expense:", error)
    return NextResponse.json({
      success: false,
      error: "Failed to create expense"
    }, { status: 500 })
  }
}

export async function DELETE(request) {
  await dbConnect()

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({
        success: false,
        error: "Expense ID is required"
      }, { status: 400 })
    }

    const deletedExpense = await Expense.findByIdAndDelete(id)

    if (!deletedExpense) {
      return NextResponse.json({
        success: false,
        error: "Expense not found"
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: deletedExpense
    })
  } catch (error) {
    console.error("Error deleting expense:", error)
    return NextResponse.json({
      success: false,
      error: "Failed to delete expense"
    }, { status: 500 })
  }
}
