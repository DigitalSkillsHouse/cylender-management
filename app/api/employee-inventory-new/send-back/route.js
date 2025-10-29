import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeeInventoryItem from "@/models/EmployeeInventoryItem"
import Product from "@/models/Product"
import ReturnTransaction from "@/models/ReturnTransaction"
import { getNextInvoiceNumberWithRetry } from "@/lib/invoice-generator"

export async function POST(request) {
  try {
    console.log('🔍 Employee send back API called')
    await dbConnect()
    
    const { itemId, stockType, quantity, employeeId } = await request.json()
    
    if (!itemId || !stockType || !quantity || !employeeId) {
      return NextResponse.json({ 
        error: "Item ID, stock type, quantity, and employee ID are required" 
      }, { status: 400 })
    }

    console.log('📋 Processing send back:', { itemId, stockType, quantity, employeeId })
    
    // Find the employee inventory item
    const inventoryItem = await EmployeeInventoryItem.findById(itemId)
      .populate('product', 'name productCode category cylinderSize')
    
    if (!inventoryItem) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 })
    }

    if (inventoryItem.employee.toString() !== employeeId) {
      return NextResponse.json({ error: "Unauthorized access to this inventory item" }, { status: 403 })
    }

    // Validate quantity based on stock type
    let availableQuantity = 0
    if (stockType === 'gas') {
      availableQuantity = inventoryItem.currentStock
    } else if (stockType === 'empty') {
      availableQuantity = inventoryItem.availableEmpty
    } else {
      return NextResponse.json({ error: "Invalid stock type. Must be 'gas' or 'empty'" }, { status: 400 })
    }

    if (quantity > availableQuantity) {
      return NextResponse.json({ 
        error: `Insufficient stock. Available: ${availableQuantity}, Requested: ${quantity}` 
      }, { status: 400 })
    }

    console.log('✅ Inventory item found and validated:', {
      productName: inventoryItem.product?.name,
      stockType: stockType,
      availableQuantity: availableQuantity,
      quantityToSend: quantity
    })

    // Generate invoice number for the return transaction
    const invoiceNumber = await getNextInvoiceNumberWithRetry()
    
    // Create a return transaction record
    const returnTransaction = await ReturnTransaction.create({
      invoiceNumber: invoiceNumber,
      employee: employeeId,
      product: inventoryItem.product._id,
      stockType: stockType,
      quantity: quantity,
      returnDate: new Date(),
      status: 'pending', // Admin needs to accept this return
      notes: `Employee returned ${quantity} ${stockType} ${inventoryItem.product.name} to admin`
    })

    console.log('📝 Return transaction created:', returnTransaction)

    // Update employee inventory - reduce the quantity
    if (stockType === 'gas') {
      // Reduce gas stock
      inventoryItem.currentStock = Math.max(0, inventoryItem.currentStock - quantity)
      
      // Also convert full cylinders to empty cylinders (gas being returned means cylinders become empty)
      if (inventoryItem.availableFull >= quantity) {
        inventoryItem.availableFull = Math.max(0, inventoryItem.availableFull - quantity)
        inventoryItem.availableEmpty = (inventoryItem.availableEmpty || 0) + quantity
        console.log('🔄 Converting full cylinders to empty:', {
          fullCylindersReduced: quantity,
          emptyCylindersIncreased: quantity,
          newAvailableFull: inventoryItem.availableFull,
          newAvailableEmpty: inventoryItem.availableEmpty
        })
      } else {
        console.warn('⚠️ Not enough full cylinders to convert. Available full:', inventoryItem.availableFull, 'Required:', quantity)
      }
    } else if (stockType === 'empty') {
      inventoryItem.availableEmpty = Math.max(0, inventoryItem.availableEmpty - quantity)
    }

    inventoryItem.lastUpdatedAt = new Date()
    await inventoryItem.save()

    console.log('✅ Employee inventory updated:', {
      itemId: inventoryItem._id,
      newCurrentStock: inventoryItem.currentStock,
      newAvailableFull: inventoryItem.availableFull,
      newAvailableEmpty: inventoryItem.availableEmpty,
      stockType: stockType,
      quantityReduced: quantity
    })

    // TODO: You might want to:
    // 1. Add the returned items back to admin inventory
    // 2. Create a proper ReturnTransaction model to track these transactions
    // 3. Send notifications to admin about returned items
    // 4. Create audit logs for inventory movements

    return NextResponse.json({ 
      success: true, 
      message: `Successfully sent back ${quantity} ${stockType} ${inventoryItem.product.name} to admin. Awaiting admin approval.`,
      data: {
        invoiceNumber: invoiceNumber,
        returnTransactionId: returnTransaction._id,
        status: 'pending',
        updatedInventory: {
          itemId: inventoryItem._id,
          currentStock: inventoryItem.currentStock,
          availableEmpty: inventoryItem.availableEmpty
        }
      }
    })
    
  } catch (error) {
    console.error("❌ Error processing send back:", error)
    return NextResponse.json({ 
      error: `Failed to send back to admin: ${error.message}` 
    }, { status: 500 })
  }
}
