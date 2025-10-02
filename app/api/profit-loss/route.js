import dbConnect from "../../../lib/mongodb"
import Sale from "../../../models/Sale"
import EmployeeSale from "../../../models/EmployeeSale"
import Cylinder from "../../../models/Cylinder"
import EmployeeCylinderTransaction from "../../../models/EmployeeCylinderTransaction"
import Product from "../../../models/Product"
import Expense from "../../../models/Expense"
import { NextResponse } from "next/server"

export async function GET() {
  await dbConnect()

  try {
    // Get all sales data
    const [adminSales, employeeSales, adminCylinders, employeeCylinders, products, expenses] = await Promise.all([
      Sale.find({}).populate('items.product', 'name category costPrice leastPrice'),
      EmployeeSale.find({}).populate('items.product', 'name category costPrice leastPrice'),
      Cylinder.find({}),
      EmployeeCylinderTransaction.find({}),
      Product.find({}),
      Expense.find({})
    ])


    // Calculate revenue and costs from admin gas sales
    let adminGasRevenue = 0
    let adminGasCost = 0
    
    adminSales.forEach(sale => {
      sale.items.forEach(item => {
        const revenue = item.price * item.quantity
        adminGasRevenue += revenue
        
        // Calculate cost using product's costPrice
        if (item.product && item.product.costPrice) {
          const itemCost = item.product.costPrice * item.quantity
          adminGasCost += itemCost
        } else {
          // If product is not populated or missing costPrice, try to find it manually
          const productId = item.product?._id || item.product
          const product = products.find(p => p._id.toString() === productId.toString())
          if (product && product.costPrice) {
            const itemCost = product.costPrice * item.quantity
            adminGasCost += itemCost
          }
        }
      })
    })

    // Calculate revenue and costs from employee gas sales
    let employeeGasRevenue = 0
    let employeeGasCost = 0
    
    employeeSales.forEach(sale => {
      sale.items.forEach(item => {
        const revenue = item.price * item.quantity
        employeeGasRevenue += revenue
        
        // Calculate cost using product's costPrice
        if (item.product && item.product.costPrice) {
          const itemCost = item.product.costPrice * item.quantity
          employeeGasCost += itemCost
        } else {
          // If product is not populated or missing costPrice, try to find it manually
          const productId = item.product?._id || item.product
          const product = products.find(p => p._id.toString() === productId.toString())
          if (product && product.costPrice) {
            const itemCost = product.costPrice * item.quantity
            employeeGasCost += itemCost
          }
        }
      })
    })

    // Calculate revenue from admin cylinder transactions
    let adminCylinderRevenue = 0
    adminCylinders.forEach(transaction => {
      if (transaction.type === 'deposit') {
        adminCylinderRevenue += transaction.depositAmount || transaction.amount
      } else if (transaction.type === 'refill') {
        adminCylinderRevenue += transaction.refillAmount || transaction.amount
      }
      // Returns are typically refunds, so we don't count them as revenue
    })

    // Calculate revenue from employee cylinder transactions
    let employeeCylinderRevenue = 0
    employeeCylinders.forEach(transaction => {
      if (transaction.type === 'deposit') {
        employeeCylinderRevenue += transaction.depositAmount || transaction.amount
      } else if (transaction.type === 'refill') {
        employeeCylinderRevenue += transaction.refillAmount || transaction.amount
      }
    })

    // Calculate total expenses
    const totalExpenses = expenses.reduce((sum, expense) => sum + expense.expense, 0)

    // Calculate totals
    const totalRevenue = adminGasRevenue + employeeGasRevenue + adminCylinderRevenue + employeeCylinderRevenue
    const totalCosts = adminGasCost + employeeGasCost + totalExpenses
    const netProfit = totalRevenue - totalCosts



    // Prepare detailed breakdown
    const breakdown = {
      revenue: {
        adminGasSales: adminGasRevenue,
        employeeGasSales: employeeGasRevenue,
        adminCylinderSales: adminCylinderRevenue,
        employeeCylinderSales: employeeCylinderRevenue,
        total: totalRevenue
      },
      costs: {
        adminGasCosts: adminGasCost,
        employeeGasCosts: employeeGasCost,
        expenses: totalExpenses,
        total: totalCosts
      },
      profit: {
        gross: totalRevenue - (adminGasCost + employeeGasCost), // Revenue minus product costs only
        net: netProfit, // Revenue minus all costs including expenses
        margin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) : 0
      },
      transactions: {
        adminSalesCount: adminSales.length,
        employeeSalesCount: employeeSales.length,
        adminCylinderCount: adminCylinders.length,
        employeeCylinderCount: employeeCylinders.length,
        expenseCount: expenses.length
      },
      allCylinderTransactions: [...adminCylinders, ...employeeCylinders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    }

    return NextResponse.json({ 
      success: true, 
      data: breakdown 
    })

  } catch (error) {
    console.error("Error calculating profit and loss:", error)
    return NextResponse.json({ 
      success: false, 
      error: "Failed to calculate profit and loss" 
    }, { status: 500 })
  }
}
