import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import ReturnTransaction from "@/models/ReturnTransaction"
import InventoryItem from "@/models/InventoryItem"
import EmpStockEmp from "@/models/EmpStockEmp"
import Product from "@/models/Product"
import User from "@/models/User"
import mongoose from "mongoose"

export async function POST(request) {
  try {
    console.log('🔍 Admin accept return API called')
    await dbConnect()
    
    const { returnTransactionId, adminId, emptyCylinderId } = await request.json()
    
    if (!returnTransactionId || !adminId) {
      return NextResponse.json({ 
        error: "Return transaction ID and admin ID are required" 
      }, { status: 400 })
    }

    console.log('📋 Processing return acceptance:', { returnTransactionId, adminId, emptyCylinderId })
    
    // Find the return transaction
    const returnTransaction = await ReturnTransaction.findById(returnTransactionId)
      .populate('employee', 'name email')
      .populate('product', 'name productCode category cylinderSize')
    
    if (!returnTransaction) {
      return NextResponse.json({ error: "Return transaction not found" }, { status: 404 })
    }

    if (returnTransaction.status !== 'pending') {
      return NextResponse.json({ error: "Return transaction is not pending" }, { status: 400 })
    }

    // For gas returns, empty cylinder ID is required
    if (returnTransaction.stockType === 'gas' && !emptyCylinderId) {
      return NextResponse.json({ 
        error: "Empty cylinder selection is required for gas returns" 
      }, { status: 400 })
    }

    console.log('✅ Return transaction found and validated:', {
      invoiceNumber: returnTransaction.invoiceNumber,
      employeeName: returnTransaction.employee?.name,
      productName: returnTransaction.product?.name,
      stockType: returnTransaction.stockType,
      quantity: returnTransaction.quantity
    })

    // Get or create admin user for DSR record
    let actualAdminId = adminId
    let actualAdminName = 'Admin'
    
    try {
      // Try to find admin user if adminId is a valid ObjectId
      if (mongoose.Types.ObjectId.isValid(adminId)) {
        const adminUser = await User.findById(adminId)
        if (adminUser) {
          actualAdminId = adminUser._id
          actualAdminName = adminUser.name
        }
      } else {
        // If adminId is not valid ObjectId (like "admin"), find first admin user
        const adminUser = await User.findOne({ role: 'admin' })
        if (adminUser) {
          actualAdminId = adminUser._id
          actualAdminName = adminUser.name
        } else {
          // Fallback: create a temporary ObjectId for admin
          actualAdminId = new mongoose.Types.ObjectId()
          actualAdminName = 'System Admin'
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not resolve admin user, using fallback:', error.message)
      // Fallback: create a temporary ObjectId for admin
      actualAdminId = new mongoose.Types.ObjectId()
      actualAdminName = 'System Admin'
    }

    console.log('👤 Admin resolved for DSR:', { actualAdminId, actualAdminName })

    // Handle gas return with empty cylinder
    if (returnTransaction.stockType === 'gas' && emptyCylinderId) {
      console.log('🔄 Processing gas return with empty cylinder selection')
      
      // Get the empty cylinder inventory
      const emptyCylinderInventory = await InventoryItem.findById(emptyCylinderId)
      if (!emptyCylinderInventory) {
        return NextResponse.json({ error: "Empty cylinder not found" }, { status: 404 })
      }

      // Validate that admin has enough empty cylinders
      if (emptyCylinderInventory.availableEmpty < returnTransaction.quantity) {
        return NextResponse.json({ 
          error: `Insufficient empty cylinders. Available: ${emptyCylinderInventory.availableEmpty}, Required: ${returnTransaction.quantity}` 
        }, { status: 400 })
      }

      // 1. Create/update GAS inventory (returned gas product)
      let gasInventoryItem = await InventoryItem.findOne({
        product: returnTransaction.product._id
      })

      if (gasInventoryItem) {
        console.log('📦 Updating existing admin gas inventory')
        gasInventoryItem.currentStock += returnTransaction.quantity
        gasInventoryItem.lastUpdatedAt = new Date()
        await gasInventoryItem.save()
      } else {
        console.log('📦 Creating new admin gas inventory')
        gasInventoryItem = await InventoryItem.create({
          product: returnTransaction.product._id,
          category: 'gas',
          currentStock: returnTransaction.quantity,
          availableEmpty: 0,
          availableFull: 0,
          cylinderSize: returnTransaction.product.cylinderSize,
          lastUpdatedAt: new Date()
        })
      }

      // 2. Create/update FULL CYLINDER inventory (cylinder product)
      let cylinderInventoryItem = await InventoryItem.findOne({
        product: emptyCylinderInventory.product
      })

      if (cylinderInventoryItem) {
        console.log('📦 Updating existing admin cylinder inventory - adding full cylinders')
        cylinderInventoryItem.availableFull += returnTransaction.quantity
        cylinderInventoryItem.lastUpdatedAt = new Date()
        await cylinderInventoryItem.save()
      } else {
        console.log('📦 Creating new admin cylinder inventory with full cylinders')
        const targetProduct = await Product.findById(emptyCylinderInventory.product)
        cylinderInventoryItem = await InventoryItem.create({
          product: emptyCylinderInventory.product,
          category: 'cylinder',
          currentStock: 0,
          availableEmpty: 0,
          availableFull: returnTransaction.quantity,
          cylinderSize: targetProduct?.cylinderSize,
          lastUpdatedAt: new Date()
        })
      }

      // 3. Reduce empty cylinder stock
      emptyCylinderInventory.availableEmpty = Math.max(0, emptyCylinderInventory.availableEmpty - returnTransaction.quantity)
      emptyCylinderInventory.lastUpdatedAt = new Date()
      await emptyCylinderInventory.save()

      // Update return transaction with selected empty cylinder
      returnTransaction.selectedEmptyCylinderId = emptyCylinderId

      console.log('✅ Gas + Cylinder inventory updated for admin:', {
        gasInventory: {
          id: gasInventoryItem._id,
          currentStock: gasInventoryItem.currentStock
        },
        cylinderInventory: {
          id: cylinderInventoryItem._id,
          availableFull: cylinderInventoryItem.availableFull
        },
        emptyReduced: returnTransaction.quantity
      })
    } else {
      // Handle empty cylinder return (no gas conversion needed)
      console.log('🔄 Processing empty cylinder return')
      
      let inventoryItem = await InventoryItem.findOne({
        product: returnTransaction.product._id
      })

      if (inventoryItem) {
        console.log('📦 Updating existing admin inventory')
        inventoryItem.availableEmpty += returnTransaction.quantity
        inventoryItem.lastUpdatedAt = new Date()
        await inventoryItem.save()
      } else {
        console.log('📦 Creating new admin inventory')
        inventoryItem = await InventoryItem.create({
          product: returnTransaction.product._id,
          category: 'cylinder',
          currentStock: 0,
          availableEmpty: returnTransaction.quantity,
          availableFull: 0,
          cylinderSize: returnTransaction.product.cylinderSize,
          lastUpdatedAt: new Date()
        })
      }

      console.log('✅ Empty cylinder inventory updated for admin:', {
        inventoryId: inventoryItem._id,
        availableEmpty: inventoryItem.availableEmpty
      })
    }

    // Create DSR record for received return
    const dsrRecord = await EmpStockEmp.create({
      // Admin details (who is receiving the return)
      adminId: actualAdminId,
      adminName: actualAdminName,
      
      // Employee details (who sent the return)
      employeeId: returnTransaction.employee._id,
      employeeName: returnTransaction.employee.name,
      
      // Product details
      productId: returnTransaction.product._id,
      productName: returnTransaction.product.name,
      productCode: returnTransaction.product.productCode || '',
      category: returnTransaction.product.category,
      cylinderStatus: returnTransaction.stockType === 'gas' ? undefined : 'empty',
      cylinderSize: returnTransaction.product.cylinderSize,
      
      // Assignment quantities and amounts
      assignedQuantity: returnTransaction.quantity,
      unitPrice: 0, // Return transactions don't have unit price
      totalAmount: 0, // Return transactions don't have total amount
      
      // Status - use 'accepted' since admin is accepting the return
      status: 'accepted',
      
      // Tracking flags
      inventoryDeducted: true,
      dailySalesUpdated: false,
      
      // Notes
      notes: `Admin received back ${returnTransaction.quantity} ${returnTransaction.stockType} ${returnTransaction.product.name} from ${returnTransaction.employee.name}`,
      assignmentMethod: 'return_transaction',
      
      // Assignment date
      assignmentDate: new Date()
    })

    console.log('✅ DSR record created for return:', dsrRecord._id)

    // Update return transaction status
    returnTransaction.status = 'received'
    returnTransaction.processedBy = actualAdminId  // Use resolved admin ID instead of original adminId
    returnTransaction.processedAt = new Date()
    returnTransaction.dsrRecordId = dsrRecord._id
    await returnTransaction.save()

    console.log('✅ Return transaction updated to received status')

    return NextResponse.json({ 
      success: true, 
      message: `Successfully received back ${returnTransaction.quantity} ${returnTransaction.stockType} ${returnTransaction.product.name} from ${returnTransaction.employee.name}`,
      data: {
        returnTransactionId: returnTransaction._id,
        dsrRecordId: dsrRecord._id,
        status: 'received'
      }
    })
    
  } catch (error) {
    console.error("❌ Error accepting return:", error)
    return NextResponse.json({ 
      error: `Failed to accept return: ${error.message}` 
    }, { status: 500 })
  }
}
