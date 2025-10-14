import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeeInventory from "@/models/EmployeeInventory"
import Product from "@/models/Product"

export async function GET(request) {
  try {
    console.log('Employee inventory API called')
    await dbConnect()
    console.log('Database connected')
    
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    const status = searchParams.get('status')
    
    console.log('Employee ID:', employeeId)
    
    if (!employeeId) {
      return NextResponse.json({ error: "Employee ID is required" }, { status: 400 })
    }

    // Fetch from both EmployeeInventory and StockAssignment collections
    const StockAssignment = (await import("@/models/StockAssignment")).default
    
    let employeeInventoryQuery = { employee: employeeId }
    let stockAssignmentQuery = { employee: employeeId }
    
    if (status) {
      employeeInventoryQuery.status = status
      stockAssignmentQuery.status = status
    }

    console.log('Queries:', { employeeInventoryQuery, stockAssignmentQuery })
    
    // Get EmployeeInventory records (from approved purchases)
    const employeeInventory = await EmployeeInventory.find(employeeInventoryQuery)
      .populate('product', 'name productCode category cylinderSize')
      .populate('employee', 'name email')
      .sort({ lastUpdated: -1 })

    // Get StockAssignment records (from admin assignments)
    const stockAssignments = await StockAssignment.find(stockAssignmentQuery)
      .populate('product', 'name productCode category cylinderSize')
      .populate('employee', 'name email')
      .sort({ createdAt: -1 })

    // Convert StockAssignment to EmployeeInventory format
    const convertedAssignments = stockAssignments.map(assignment => {
      // Use displayCategory if available, otherwise construct from category and cylinderStatus
      let displayCategory = assignment.displayCategory;
      if (!displayCategory) {
        if (assignment.category === 'cylinder') {
          // Handle missing cylinderStatus - default to 'Empty Cylinder' for existing records
          if (assignment.cylinderStatus === 'full') {
            displayCategory = 'Full Cylinder';
          } else if (assignment.cylinderStatus === 'empty') {
            displayCategory = 'Empty Cylinder';
          } else {
            // For existing records without cylinderStatus, check product name for clues
            const productName = assignment.product?.name?.toLowerCase() || '';
            if (productName.includes('full') || assignment.gasProductId) {
              displayCategory = 'Full Cylinder';
            } else {
              displayCategory = 'Empty Cylinder'; // Default for cylinders
            }
          }
        } else if (assignment.category === 'gas') {
          displayCategory = 'Gas';
        } else {
          displayCategory = assignment.category || assignment.product?.category || 'Unknown';
        }
      }
      
      console.log('🏷️ Assignment conversion debug:', {
        assignmentId: assignment._id,
        category: assignment.category,
        cylinderStatus: assignment.cylinderStatus,
        displayCategory: displayCategory,
        productName: assignment.product?.name,
        hasGasProduct: !!assignment.gasProductId
      });
      
      return {
        _id: assignment._id,
        product: assignment.product,
        employee: assignment.employee,
        assignedQuantity: assignment.quantity,
        currentStock: assignment.remainingQuantity || assignment.quantity,
        leastPrice: assignment.leastPrice || assignment.product?.leastPrice || 0,
        status: assignment.status, // 'assigned', 'received', 'returned'
        assignedDate: assignment.createdAt,
        lastUpdated: assignment.updatedAt || assignment.createdAt,
        category: displayCategory,
        displayCategory: displayCategory, // Add displayCategory field
        cylinderStatus: assignment.cylinderStatus,
        gasProductId: assignment.gasProductId,
        cylinderProductId: assignment.cylinderProductId
      }
    })

    // Combine both sources
    const combinedInventory = [...employeeInventory, ...convertedAssignments]

    console.log('Found inventory items:', combinedInventory?.length || 0)
    return NextResponse.json({ success: true, data: combinedInventory || [] })
  } catch (error) {
    console.error("Error fetching employee inventory:", error)
    return NextResponse.json({ error: `Failed to fetch inventory: ${error.message}` }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    await dbConnect()
    
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
    await dbConnect()
    
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