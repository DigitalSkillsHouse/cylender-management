import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeePurchaseOrder from "@/models/EmployeePurchaseOrder"
import EmployeeInventoryItem from "@/models/EmployeeInventoryItem"
import Product from "@/models/Product"

export async function POST(request) {
  try {
    console.log('🔍 Employee accept order API called')
    await dbConnect()
    
    const { orderId, employeeId } = await request.json()
    
    if (!orderId || !employeeId) {
      return NextResponse.json({ error: "Order ID and Employee ID are required" }, { status: 400 })
    }

    console.log('📋 Processing order acceptance:', { orderId, employeeId })
    
    // Find the purchase order
    const purchaseOrder = await EmployeePurchaseOrder.findById(orderId)
      .populate('product', 'name productCode category cylinderSize')
    
    if (!purchaseOrder) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 })
    }

    if (purchaseOrder.employee.toString() !== employeeId) {
      return NextResponse.json({ error: "Unauthorized access to this order" }, { status: 403 })
    }

    if (purchaseOrder.inventoryStatus !== 'approved') {
      return NextResponse.json({ error: "Order is not approved for acceptance" }, { status: 400 })
    }

    console.log('✅ Purchase order found and validated:', {
      poNumber: purchaseOrder.poNumber,
      product: purchaseOrder.product?.name,
      quantity: purchaseOrder.quantity,
      purchaseType: purchaseOrder.purchaseType,
      cylinderStatus: purchaseOrder.cylinderStatus,
      productCategory: purchaseOrder.product?.category,
      emptyCylinderId: purchaseOrder.emptyCylinderId
    })

    // Update purchase order status to 'received'
    purchaseOrder.inventoryStatus = 'received'
    await purchaseOrder.save()

    // Handle gas purchase with empty cylinder - create BOTH gas and cylinder inventory
    if (purchaseOrder.purchaseType === 'gas' && purchaseOrder.emptyCylinderId) {
      console.log('🔄 Gas purchase with empty cylinder - creating BOTH gas and full cylinder inventory')
      
      // Get the empty cylinder inventory to find the cylinder product
      const emptyCylinderInventory = await EmployeeInventoryItem.findById(purchaseOrder.emptyCylinderId)
      if (!emptyCylinderInventory) {
        return NextResponse.json({ error: "Empty cylinder not found" }, { status: 404 })
      }

      // 1. Create/update GAS inventory (original gas product)
      let gasInventoryItem = await EmployeeInventoryItem.findOne({
        employee: employeeId,
        product: purchaseOrder.product._id
      })

      if (gasInventoryItem) {
        console.log('📦 Updating existing gas inventory')
        gasInventoryItem.currentStock += purchaseOrder.quantity
        gasInventoryItem.lastUpdatedAt = new Date()
        await gasInventoryItem.save()
      } else {
        console.log('📦 Creating new gas inventory')
        gasInventoryItem = await EmployeeInventoryItem.create({
          employee: employeeId,
          product: purchaseOrder.product._id,
          category: 'gas',
          currentStock: purchaseOrder.quantity,
          availableEmpty: 0,
          availableFull: 0,
          cylinderSize: purchaseOrder.product.cylinderSize,
          gasType: purchaseOrder.gasType,
          lastUpdatedAt: new Date()
        })
      }

      // 2. Create/update FULL CYLINDER inventory (cylinder product)
      let cylinderInventoryItem = await EmployeeInventoryItem.findOne({
        employee: employeeId,
        product: emptyCylinderInventory.product
      })

      if (cylinderInventoryItem) {
        console.log('📦 Updating existing cylinder inventory - adding full cylinders')
        cylinderInventoryItem.availableFull += purchaseOrder.quantity
        cylinderInventoryItem.lastUpdatedAt = new Date()
        await cylinderInventoryItem.save()
      } else {
        console.log('📦 Creating new cylinder inventory with full cylinders')
        const targetProduct = await Product.findById(emptyCylinderInventory.product)
        cylinderInventoryItem = await EmployeeInventoryItem.create({
          employee: employeeId,
          product: emptyCylinderInventory.product,
          category: 'cylinder',
          currentStock: 0,
          availableEmpty: 0,
          availableFull: purchaseOrder.quantity,
          cylinderSize: targetProduct?.cylinderSize,
          gasType: purchaseOrder.gasType,
          lastUpdatedAt: new Date()
        })
      }

      // 3. Reduce empty cylinder stock
      emptyCylinderInventory.availableEmpty = Math.max(0, emptyCylinderInventory.availableEmpty - purchaseOrder.quantity)
      emptyCylinderInventory.lastUpdatedAt = new Date()
      await emptyCylinderInventory.save()

      console.log('✅ Gas + Cylinder inventory created/updated:', {
        gasInventory: {
          id: gasInventoryItem._id,
          currentStock: gasInventoryItem.currentStock
        },
        cylinderInventory: {
          id: cylinderInventoryItem._id,
          availableFull: cylinderInventoryItem.availableFull
        },
        emptyReduced: purchaseOrder.quantity
      })

      return NextResponse.json({ 
        success: true, 
        message: "Order accepted and added to inventory (gas + full cylinder)",
        data: {
          orderId: orderId,
          gasInventoryItem: gasInventoryItem,
          cylinderInventoryItem: cylinderInventoryItem
        }
      })
    }

    // Handle regular purchases (gas only or cylinder only)
    let inventoryItem = await EmployeeInventoryItem.findOne({
      employee: employeeId,
      product: purchaseOrder.product._id
    })

    if (inventoryItem) {
      console.log('📦 Updating existing inventory item')
      
      // Update existing inventory based on purchase type
      console.log('📦 [UPDATE] Before update:', {
        currentStock: inventoryItem.currentStock,
        availableFull: inventoryItem.availableFull,
        availableEmpty: inventoryItem.availableEmpty,
        purchaseType: purchaseOrder.purchaseType,
        cylinderStatus: purchaseOrder.cylinderStatus,
        quantity: purchaseOrder.quantity
      })
      
      if (purchaseOrder.purchaseType === 'gas') {
        inventoryItem.currentStock += purchaseOrder.quantity
      } else if (purchaseOrder.purchaseType === 'cylinder') {
        if (purchaseOrder.cylinderStatus === 'full') {
          inventoryItem.availableFull += purchaseOrder.quantity
        } else if (purchaseOrder.cylinderStatus === 'empty') {
          inventoryItem.availableEmpty += purchaseOrder.quantity
        }
      }
      
      console.log('📦 [UPDATE] After update:', {
        currentStock: inventoryItem.currentStock,
        availableFull: inventoryItem.availableFull,
        availableEmpty: inventoryItem.availableEmpty
      })
      
      inventoryItem.lastUpdatedAt = new Date()
      await inventoryItem.save()
      
    } else {
      console.log('📦 Creating new inventory item')
      
      // Create new inventory item
      const newInventoryData = {
        employee: employeeId,
        product: purchaseOrder.product._id,
        category: purchaseOrder.product.category,
        currentStock: 0,
        availableEmpty: 0,
        availableFull: 0,
        cylinderSize: purchaseOrder.product.cylinderSize,
        gasType: purchaseOrder.gasType,
        lastUpdatedAt: new Date()
      }

      // Set stock based on purchase type
      console.log('📦 [CREATE] Setting stock for new item:', {
        purchaseType: purchaseOrder.purchaseType,
        cylinderStatus: purchaseOrder.cylinderStatus,
        quantity: purchaseOrder.quantity
      })
      
      if (purchaseOrder.purchaseType === 'gas') {
        newInventoryData.currentStock = purchaseOrder.quantity
      } else if (purchaseOrder.purchaseType === 'cylinder') {
        if (purchaseOrder.cylinderStatus === 'full') {
          newInventoryData.availableFull = purchaseOrder.quantity
        } else if (purchaseOrder.cylinderStatus === 'empty') {
          newInventoryData.availableEmpty = purchaseOrder.quantity
        }
      }
      
      console.log('📦 [CREATE] New inventory data:', newInventoryData)

      inventoryItem = await EmployeeInventoryItem.create(newInventoryData)
    }

    console.log('✅ Order accepted and inventory updated:', {
      orderId: orderId,
      inventoryItemId: inventoryItem._id,
      currentStock: inventoryItem.currentStock,
      availableFull: inventoryItem.availableFull,
      availableEmpty: inventoryItem.availableEmpty
    })

    return NextResponse.json({ 
      success: true, 
      message: "Order accepted and added to inventory",
      data: {
        orderId: orderId,
        inventoryItem: inventoryItem
      }
    })
    
  } catch (error) {
    console.error("❌ Error accepting employee order:", error)
    return NextResponse.json({ error: `Failed to accept order: ${error.message}` }, { status: 500 })
  }
}
