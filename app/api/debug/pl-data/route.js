import dbConnect from "../../../../lib/mongodb"
import Sale from "../../../../models/Sale"
import EmployeeSale from "../../../../models/EmployeeSale"
import Product from "../../../../models/Product"
import Expense from "../../../../models/Expense"
import { NextResponse } from "next/server"

export async function GET() {
  await dbConnect()

  try {
    // Get counts
    const [salesCount, empSalesCount, productsCount, expensesCount] = await Promise.all([
      Sale.countDocuments(),
      EmployeeSale.countDocuments(),
      Product.countDocuments(),
      Expense.countDocuments()
    ])

    // Get sample data
    const [sampleSale, sampleEmpSale, sampleProduct, sampleExpense] = await Promise.all([
      Sale.findOne().populate('items.product', 'name costPrice leastPrice').lean(),
      EmployeeSale.findOne().populate('items.product', 'name costPrice leastPrice').lean(),
      Product.findOne().lean(),
      Expense.findOne().lean()
    ])

    return NextResponse.json({
      success: true,
      counts: {
        sales: salesCount,
        employeeSales: empSalesCount,
        products: productsCount,
        expenses: expensesCount
      },
      samples: {
        sale: sampleSale,
        employeeSale: sampleEmpSale,
        product: sampleProduct,
        expense: sampleExpense
      }
    })
  } catch (error) {
    console.error("Debug API error:", error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}
