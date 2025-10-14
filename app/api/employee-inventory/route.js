import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import EmployeeInventory from "@/models/EmployeeInventory"
import Product from "@/models/Product"

export async function GET(request) {
  try {
    await connectToDatabase()
    
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    const status = searchParams.get('status')
    
    if (!employeeId) {
      return NextResponse.json({ error: "Employee ID is required" }, { status: 400 })
    }

    let query = { employee: employeeId }
    if (status) {
      query.status = status
    }

    const inventory = await EmployeeInventory.find(query)
      .populate('product')
      .populate('employee', 'name email')
      .sort({ lastUpdated: -1 })

    return NextResponse.json({ success: true, data: inventory })
  } catch (error) {
    console.error("Error fetching employee inventory:", error)
    return NextResponse.json({ error: "Failed to fetch inventory" }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    await connectToDatabase()
    
    const data = await request.json()
    const { employeeId, productId, quantity, cylinderSize, leastPrice, type = 'assignment' } = data

    if (!employeeId || !productId || !quantity || !leastPrice) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const product = await Product.findById(productId)
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    let inventory = await EmployeeInventory.findOne({
      employee: employeeId,
      product: productId,
      ...(cylinderSize && { cylinderSize })
    })

    if (inventory) {
      inventory.assignedQuantity += quantity
      inventory.currentStock += quantity
      inventory.leastPrice = leastPrice
      inventory.status = 'received'
      inventory.transactions.push({
        type,
        quantity,
        date: new Date(),
        notes: `Added ${quantity} units`
      })
    } else {
      inventory = new EmployeeInventory({
        employee: employeeId,
        product: productId,
        category: product.category,
        assignedQuantity: quantity,
        currentStock: quantity,
        cylinderSize,
        leastPrice,
        status: 'received',
        transactions: [{
          type,
          quantity,
          date: new Date(),
          notes: `Initial assignment of ${quantity} units`
        }]
      })
    }

    await inventory.save()
    await inventory.populate('product')
    await inventory.populate('employee', 'name email')

    return NextResponse.json({ success: true, data: inventory })
  } catch (error) {
    console.error("Error creating/updating employee inventory:", error)
    return NextResponse.json({ error: "Failed to update inventory" }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    await connectToDatabase()
    
    const data = await request.json()
    const { inventoryId, action, quantity, notes } = data

    if (!inventoryId || !action) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const inventory = await EmployeeInventory.findById(inventoryId)
    if (!inventory) {
      return NextResponse.json({ error: "Inventory record not found" }, { status: 404 })
    }

    switch (action) {
      case 'sale':
        if (quantity > inventory.currentStock) {
          return NextResponse.json({ error: "Insufficient stock" }, { status: 400 })
        }
        inventory.currentStock -= quantity
        inventory.transactions.push({
          type: 'sale',
          quantity: -quantity,
          date: new Date(),
          notes: notes || `Sale of ${quantity} units`
        })
        break

      case 'return':
        inventory.status = 'returned'
        inventory.currentStock = 0
        inventory.transactions.push({
          type: 'return',
          quantity: -inventory.currentStock,
          date: new Date(),
          notes: notes || 'Returned to admin'
        })
        break

      case 'adjust':
        const oldStock = inventory.currentStock
        inventory.currentStock = quantity
        inventory.transactions.push({
          type: 'adjustment',
          quantity: quantity - oldStock,
          date: new Date(),
          notes: notes || `Stock adjusted from ${oldStock} to ${quantity}`
        })
        break

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    await inventory.save()
    await inventory.populate('product')
    await inventory.populate('employee', 'name email')

    return NextResponse.json({ success: true, data: inventory })
  } catch (error) {
    console.error("Error updating employee inventory:", error)
    return NextResponse.json({ error: "Failed to update inventory" }, { status: 500 })
  }
}