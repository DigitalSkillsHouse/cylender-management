import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeeInventoryItem from "@/models/EmployeeInventoryItem"
import Product from "@/models/Product"
import ReturnTransaction from "@/models/ReturnTransaction"
import DailyCylinderTransaction from "@/models/DailyCylinderTransaction"
import DailyEmployeeCylinderAggregation from "@/models/DailyEmployeeCylinderAggregation"
import Notification from "@/models/Notification"
import User from "@/models/User"
// Disable caching for this route - force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function POST(request) {
  try {
    console.log('🔍 Employee send back API called')
    await dbConnect()
    
    const { itemId, stockType, quantity, employeeId, cylinderProductId } = await request.json()
    
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

    console.log('📝 [SEND BACK] Creating return transaction with:', {
      employee: employeeId,
      product: inventoryItem.product._id.toString(),
      productName: inventoryItem.product.name,
      stockType: stockType,
      quantity: quantity,
      status: 'pending'
    })
    
    // Create a return transaction record (no invoice number needed for returns)
    const returnTransaction = await ReturnTransaction.create({
      employee: employeeId,
      product: inventoryItem.product._id,
      stockType: stockType,
      quantity: quantity,
      returnDate: new Date(),
      status: 'pending', // Admin needs to accept this return
      notes: `Employee returned ${quantity} ${stockType} ${inventoryItem.product.name} to admin`
    })
    
    console.log('✅ [SEND BACK] Return transaction created successfully:', {
      id: returnTransaction._id.toString(),
      employee: returnTransaction.employee.toString(),
      product: returnTransaction.product.toString(),
      stockType: returnTransaction.stockType,
      quantity: returnTransaction.quantity,
      returnDate: returnTransaction.returnDate,
      status: returnTransaction.status,
      createdAt: returnTransaction.createdAt
    })

    // For gas transfers, require explicit cylinder selection and validate before applying updates
    let targetProductId = inventoryItem.product._id
    let targetProductName = inventoryItem.product.name
    let cylinderInventory = null

    if (stockType === 'gas') {
      if (!cylinderProductId) {
        return NextResponse.json({ error: "Please select the full cylinder used for this gas return" }, { status: 400 })
      }

      cylinderInventory = await EmployeeInventoryItem.findOne({
        employee: employeeId,
        product: cylinderProductId,
        category: 'cylinder'
      }).populate('product', 'name')

      if (!cylinderInventory) {
        return NextResponse.json({ error: "Selected cylinder not found in employee inventory" }, { status: 404 })
      }

      if ((cylinderInventory.availableFull || 0) < quantity) {
        return NextResponse.json({ error: `Not enough full cylinders available. Available: ${cylinderInventory.availableFull || 0}` }, { status: 400 })
      }

      targetProductId = cylinderInventory.product._id
      targetProductName = cylinderInventory.product.name
    }

    // Update employee inventory - reduce the quantity
    if (stockType === 'gas') {
      inventoryItem.currentStock = Math.max(0, inventoryItem.currentStock - quantity)
    } else if (stockType === 'empty') {
      inventoryItem.availableEmpty = Math.max(0, inventoryItem.availableEmpty - quantity)
    }

    inventoryItem.lastUpdatedAt = new Date()

    // If gas, also convert full cylinder -> empty on the selected cylinder inventory
    if (stockType === 'gas' && cylinderInventory) {
      cylinderInventory.availableFull = Math.max(0, (cylinderInventory.availableFull || 0) - quantity)
      cylinderInventory.availableEmpty = (cylinderInventory.availableEmpty || 0) + quantity
      cylinderInventory.lastUpdatedAt = new Date()
    }

    await Promise.all([
      inventoryItem.save(),
      stockType === 'gas' && cylinderInventory ? cylinderInventory.save() : Promise.resolve()
    ])

    console.log('✅ Employee inventory updated:', {
      itemId: inventoryItem._id,
      newCurrentStock: inventoryItem.currentStock,
      newAvailableFull: inventoryItem.availableFull,
      newAvailableEmpty: inventoryItem.availableEmpty,
      stockType: stockType,
      quantityReduced: quantity
    })

    if (stockType === 'gas' && cylinderInventory) {
      console.log('🔄 Converted full cylinders to empty for return:', {
        cylinder: targetProductName,
        reducedFull: quantity,
        newFull: cylinderInventory.availableFull,
        newEmpty: cylinderInventory.availableEmpty
      })
    }

    // Update DSR tracking for transfers (use cylinder product for gas transfers)
    await updateDSRForTransfer(employeeId, targetProductId, targetProductName, stockType, quantity)

    // Send notification to admin about the stock return
    try {
      // Find admin user to send notification
      const adminUser = await User.findOne({ role: 'admin' })
      if (adminUser) {
        // Get employee name for notification
        const employeeUser = await User.findById(employeeId)
        const employeeName = employeeUser?.name || 'Employee'
        
        await Notification.create({
          recipient: adminUser._id,
          sender: employeeId,
          type: "stock_returned",
          title: "Stock Return Request",
          message: `${employeeName} has sent back ${quantity} ${stockType} of ${inventoryItem.product?.name || 'product'}. Please review and accept in Pending Returns.`,
          relatedId: returnTransaction._id,
          isRead: false
        })
        
        console.log('✅ Notification created for admin about stock return:', {
          adminId: adminUser._id.toString(),
          employeeId: employeeId,
          productName: inventoryItem.product?.name,
          quantity: quantity,
          stockType: stockType
        })
      } else {
        console.warn('⚠️ No admin user found to send notification to')
      }
    } catch (notificationError) {
      console.error('❌ Failed to create notification for admin:', notificationError)
      console.error('❌ Notification error details:', notificationError.message)
      console.error('❌ Notification error stack:', notificationError.stack)
      // Don't fail the whole request if notification fails
    }

    return NextResponse.json({ 
      success: true, 
      message: `Successfully sent back ${quantity} ${stockType} ${inventoryItem.product.name} to admin. Awaiting admin approval.`,
      data: {
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

// Helper function to update DSR tracking for transfers
async function updateDSRForTransfer(employeeId, productId, productName, stockType, quantity) {
  try {
    const { getLocalDateString } = await import('@/lib/date-utils')
    const today = getLocalDateString() // YYYY-MM-DD format (Dubai timezone)
    
    console.log(`📊 [DSR TRANSFER] Recording transfer: ${stockType} ${productName} x${quantity} for employee ${employeeId} on ${today}`)
    
    // Update DailyCylinderTransaction for transfer tracking
    const filter = {
      date: today,
      cylinderProductId: productId,
      employeeId: employeeId
    }
    
    const updateData = {
      cylinderName: productName,
      cylinderSize: 'Unknown Size', // We'll get this from product if needed
      isEmployeeTransaction: true
    }
    
    // Add transfer quantities based on stock type
    if (stockType === 'gas') {
      updateData.$inc = {
        transferGasQuantity: quantity
      }
    } else if (stockType === 'empty') {
      updateData.$inc = {
        transferEmptyQuantity: quantity
      }
    }
    
    // Only update if we have increments to apply
    if (updateData.$inc) {
      await DailyCylinderTransaction.findOneAndUpdate(
        filter,
        {
          $set: {
            cylinderName: productName,
            cylinderSize: 'Unknown Size',
            isEmployeeTransaction: true
          },
          ...updateData
        },
        { 
          upsert: true, 
          new: true,
          setDefaultsOnInsert: true
        }
      )
      
      console.log(`✅ [DSR TRANSFER] Updated daily cylinder transaction for ${stockType} transfer: ${productName} x${quantity}`)
    }
    
    // Also update DailyEmployeeCylinderAggregation for comprehensive tracking
    try {
      const aggregationType = stockType === 'gas' ? 'transferGas' : 'transferEmpty'
      
      await DailyEmployeeCylinderAggregation.findOneAndUpdate(
        {
          employeeId: employeeId,
          date: today,
          productId: productId
        },
        {
          $set: {
            productName: productName,
            productCategory: 'cylinder',
            lastUpdated: new Date()
          },
          $inc: {
            [`total${stockType === 'gas' ? 'TransferGas' : 'TransferEmpty'}`]: quantity,
            [`${stockType === 'gas' ? 'transferGas' : 'transferEmpty'}TransactionCount`]: 1
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      )
      
      console.log(`✅ [DSR TRANSFER] Updated daily employee cylinder aggregation for ${stockType} transfer`)
    } catch (aggError) {
      console.error(`❌ [DSR TRANSFER] Failed to update aggregation:`, aggError.message)
    }
    
  } catch (error) {
    console.error('[DSR TRANSFER] Failed to update DSR tracking:', error)
    // Don't throw error to avoid breaking the main transaction flow
  }
}
