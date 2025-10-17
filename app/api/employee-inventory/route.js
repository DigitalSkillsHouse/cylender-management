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

    console.log('📊 Raw data fetched:', {
      employeeId: employeeId,
      employeeInventoryCount: employeeInventory.length,
      stockAssignmentsCount: stockAssignments.length,
      stockAssignments: stockAssignments.map(sa => ({
        id: sa._id,
        status: sa.status,
        product: sa.product?.name,
        quantity: sa.quantity,
        remainingQuantity: sa.remainingQuantity,
        category: sa.category,
        cylinderStatus: sa.cylinderStatus,
        displayCategory: sa.displayCategory
      }))
    })

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
        leastPrice: Number(assignment.leastPrice || assignment.product?.leastPrice || 0),
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

    // Combine both sources with deduplication
    const combinedInventory = [...employeeInventory, ...convertedAssignments]
    
    // Deduplicate by product ID, name, and category
    const deduplicatedInventory = []
    const seenProducts = new Map()
    
    for (const item of combinedInventory) {
      const productId = item.product?._id?.toString()
      const productName = item.product?.name
      const category = item.category
      const cylinderStatus = item.cylinderStatus
      
      // Create a unique key for deduplication
      const uniqueKey = `${productId}-${productName}-${category}-${cylinderStatus || 'none'}`
      
      console.log('🔍 Processing item:', {
        productName: productName,
        productId: productId,
        category: category,
        cylinderStatus: cylinderStatus,
        uniqueKey: uniqueKey,
        currentStock: item.currentStock,
        assignedQuantity: item.assignedQuantity
      })
      
      if (seenProducts.has(uniqueKey)) {
        // Merge with existing item (combine quantities)
        const existingItemIndex = seenProducts.get(uniqueKey)
        const existingItem = deduplicatedInventory[existingItemIndex]
        
        const oldCurrentStock = existingItem.currentStock || 0
        const oldAssignedQuantity = existingItem.assignedQuantity || 0
        
        existingItem.assignedQuantity = oldAssignedQuantity + (item.assignedQuantity || 0)
        existingItem.currentStock = oldCurrentStock + (item.currentStock || 0)
        
        // Merge transactions
        if (item.transactions && Array.isArray(item.transactions)) {
          existingItem.transactions = [...(existingItem.transactions || []), ...item.transactions]
        }
        
        // Use the most recent date
        if (new Date(item.lastUpdated) > new Date(existingItem.lastUpdated)) {
          existingItem.lastUpdated = item.lastUpdated
        }
        
        console.log('🔄 Merged duplicate inventory item:', {
          productName: productName,
          category: category,
          cylinderStatus: cylinderStatus,
          oldCurrentStock: oldCurrentStock,
          addedCurrentStock: item.currentStock || 0,
          newCurrentStock: existingItem.currentStock,
          oldAssignedQuantity: oldAssignedQuantity,
          addedAssignedQuantity: item.assignedQuantity || 0,
          newAssignedQuantity: existingItem.assignedQuantity
        })
      } else {
        // Add new item
        const newIndex = deduplicatedInventory.length
        seenProducts.set(uniqueKey, newIndex)
        deduplicatedInventory.push({ ...item })
        
        console.log('✅ Added new inventory item:', {
          productName: productName,
          category: category,
          cylinderStatus: cylinderStatus,
          currentStock: item.currentStock,
          assignedQuantity: item.assignedQuantity,
          index: newIndex
        })
      }
    }

    console.log('📊 Inventory deduplication summary:', {
      originalItems: combinedInventory.length,
      deduplicatedItems: deduplicatedInventory.length,
      duplicatesRemoved: combinedInventory.length - deduplicatedInventory.length
    })

    return NextResponse.json({ success: true, data: deduplicatedInventory || [] })
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

    // Enhanced duplicate check - look for existing inventory by multiple criteria
    let inventory = await EmployeeInventory.findOne({
      employee: employeeId,
      product: productId,
      ...(cylinderSize && { cylinderSize })
    })
    
    // If not found by product ID, try by product name and code (for legacy data)
    if (!inventory) {
      const allEmployeeInventory = await EmployeeInventory.find({
        employee: employeeId
      }).populate('product', 'name productCode')
      
      inventory = allEmployeeInventory.find(inv => {
        return inv.product?.name === product.name && 
               inv.product?.productCode === product.productCode
      })
      
      if (inventory) {
        console.log('🔍 Found existing inventory by name/code match:', {
          inventoryId: inventory._id,
          productName: inventory.product?.name,
          productCode: inventory.product?.productCode
        })
      }
    }

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