import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeeCylinderTransaction from "@/models/EmployeeCylinderTransaction"
import Customer from "@/models/Customer"
import User from "@/models/User"
import Counter from "@/models/Counter"
import Product from "@/models/Product"
import InventoryItem from "@/models/InventoryItem"
import EmployeeInventoryItem from "@/models/EmployeeInventoryItem"
import DailyCylinderTransaction from "@/models/DailyCylinderTransaction"
import DailyEmployeeCylinderAggregation from "@/models/DailyEmployeeCylinderAggregation"
import Sale from "@/models/Sale"
import EmployeeSale from "@/models/EmployeeSale"
import CylinderTransaction from "@/models/Cylinder"
import mongoose from "mongoose"
import { getLocalDateStringFromDate } from "@/lib/date-utils"

// Helper function to update daily cylinder transaction tracking for employees
async function updateEmployeeDailyCylinderTracking(transaction, employeeId) {
  try {
    // Use local date instead of UTC to ensure correct date assignment
    const dateStr = getLocalDateStringFromDate(transaction.createdAt) // YYYY-MM-DD format
    
    // Handle both single item and multi-item transactions
    const items = transaction.items && transaction.items.length > 0 
      ? transaction.items 
      : [{
          productId: transaction.product,
          productName: 'Unknown Product',
          quantity: transaction.quantity || 0,
          amount: transaction.amount || 0
        }]

    for (const item of items) {
      const productId = typeof item.productId === 'object' ? item.productId._id : item.productId
      const quantity = Number(item.quantity) || 0
      const amount = Number(item.amount) || 0

      if (!productId || quantity <= 0) continue

      // Get product details for name and size
      let productName = item.productName || 'Unknown Product'
      let cylinderSize = 'Unknown Size'
      
      try {
        const product = await Product.findById(productId).select('name cylinderSize')
        if (product) {
          productName = product.name
          cylinderSize = product.cylinderSize || 'Unknown Size'
        }
      } catch (e) {
        console.warn('[EmployeeDailyCylinderTracking] Failed to fetch product details:', e.message)
      }

      // Find or create daily tracking record
      const filter = {
        date: dateStr,
        cylinderProductId: productId,
        employeeId: employeeId
      }

      const updateData = {
        cylinderName: productName,
        cylinderSize: cylinderSize,
        isEmployeeTransaction: true
      }

      // Update based on transaction type
      if (transaction.type === 'deposit') {
        updateData.$inc = {
          depositQuantity: quantity,
          depositAmount: amount
        }
      } else if (transaction.type === 'return') {
        updateData.$inc = {
          returnQuantity: quantity,
          returnAmount: amount
        }
      }

      // Only update if we have increments to apply
      if (updateData.$inc) {
        await DailyCylinderTransaction.findOneAndUpdate(
          filter,
          {
            $set: {
              cylinderName: productName,
              cylinderSize: cylinderSize,
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

        console.log(`[EmployeeDailyCylinderTracking] Updated ${transaction.type} tracking for ${productName} on ${dateStr}: ${quantity} units, AED ${amount} (Employee: ${employeeId})`)
      }
    }
  } catch (error) {
    console.error('[EmployeeDailyCylinderTracking] Failed to update daily tracking:', error)
    // Don't throw error to avoid breaking the main transaction flow
  }
}

// Helper function to update inventory for deposit transactions (NEW SYSTEM)
async function updateInventoryForDeposit(cylinderProductId, quantity, employeeId) {
  console.log(`[Employee Deposit] Processing stock deduction - Cylinder: ${cylinderProductId}, Quantity: ${quantity}, Employee: ${employeeId}`)
  
  try {
    // Find employee's inventory item for this product
    const inventoryItem = await EmployeeInventoryItem.findOne({
      employee: employeeId,
      product: cylinderProductId
    })
    
    if (inventoryItem) {
      const oldEmpty = inventoryItem.availableEmpty || 0
      // For deposits, decrease availableEmpty (employee is giving empty cylinders to customer)
      inventoryItem.availableEmpty = Math.max(0, oldEmpty - quantity)
      inventoryItem.lastUpdatedAt = new Date()
      await inventoryItem.save()
      
      console.log(`[Employee Deposit] Updated inventory ${inventoryItem._id} availableEmpty: ${oldEmpty} -> ${inventoryItem.availableEmpty} (deducted ${quantity})`)
    } else {
      console.log(`[Employee Deposit] No inventory item found for employee ${employeeId} and product ${cylinderProductId}`)
    }
  } catch (error) {
    console.error(`[Employee Deposit] Error updating inventory:`, error)
    throw error
  }
}

// Helper function to update inventory for return transactions (NEW SYSTEM)
async function updateInventoryForReturn(cylinderProductId, quantity, employeeId) {
  console.log(`[Employee Return] Processing stock addition - Cylinder: ${cylinderProductId}, Quantity: ${quantity}, Employee: ${employeeId}`)
  
  try {
    // Find employee's inventory item for this product
    const inventoryItem = await EmployeeInventoryItem.findOne({
      employee: employeeId,
      product: cylinderProductId
    })
    
    if (inventoryItem) {
      const oldEmpty = inventoryItem.availableEmpty || 0
      // For returns, increase availableEmpty (customer is returning empty cylinders to employee)
      inventoryItem.availableEmpty = oldEmpty + quantity
      inventoryItem.lastUpdatedAt = new Date()
      await inventoryItem.save()
      
      console.log(`[Employee Return] Updated inventory ${inventoryItem._id} availableEmpty: ${oldEmpty} -> ${inventoryItem.availableEmpty} (added ${quantity})`)
    } else {
      console.log(`[Employee Return] No inventory item found for employee ${employeeId} and product ${cylinderProductId}`)
    }
  } catch (error) {
    console.error(`[Employee Return] Error updating inventory:`, error)
    throw error
  }
}

export async function GET(request) {
  try {
    await dbConnect()

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    const fetchAll = searchParams.get('all') === 'true'
    const customerId = searchParams.get('customerId')
    const type = searchParams.get('type')

    let query = {}

    if (fetchAll) {
      // No additional filter, fetch all transactions for admin view
    } else if (employeeId) {
      query = { employee: employeeId }
    } else {
      return NextResponse.json(
        { error: "Employee ID is required, or specify 'all=true' for admin access." },
        { status: 400 }
      )
    }

    // Optional filters to narrow down results (used by security selection prompt)
    if (customerId) {
      query.customer = customerId
    }
    if (type) {
      query.type = type
    }

    let transactions
    try {
      transactions = await EmployeeCylinderTransaction.find(query)
        .populate('customer', 'name phone address')
        .populate('supplier', 'companyName contactPerson phone email')
        .populate('employee', 'name')
        .populate('product', 'name')
        .populate({ path: 'items.productId', model: 'Product', select: 'name', strictPopulate: false })
        .sort({ createdAt: -1 })
      console.log('[GET /api/employee-cylinders] fetched:', Array.isArray(transactions) ? transactions.length : 0,
        'sample items lens:', (transactions || []).slice(0,3).map(t => ({ id: t._id, itemsLen: Array.isArray(t.items) ? t.items.length : 0 })))
    } catch (e) {
      console.error('employee-cylinders GET populate error (items.productId). Falling back without nested populate:', e?.message)
      transactions = await EmployeeCylinderTransaction.find(query)
        .populate('customer', 'name phone address')
        .populate('supplier', 'companyName contactPerson phone email')
        .populate('employee', 'name')
        .populate('product', 'name')
        .sort({ createdAt: -1 })
    }

    return NextResponse.json({ success: true, data: transactions })
  } catch (error) {
    console.error('Error fetching employee cylinder transactions:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch employee cylinder transactions' },
      { status: 500 }
    )
  }
}

export async function POST(request) {
  try {
    await dbConnect()
    
    const body = await request.json()
    console.log("[POST /api/employee-cylinders] received body type=", body?.type, 
      'itemsLen=', Array.isArray(body?.items) ? body.items.length : 0)

    const {
      employeeId,
      type,
      customer,
      supplier,
      product, // Single item fallback
      cylinderSize,
      quantity,
      amount,
      depositAmount,
      refillAmount,
      returnAmount,
      paymentMethod,
      cashAmount,
      bankName,
      checkNumber,
      status,
      notes,
      items, // optional multi-item array
      linkedDeposit,
    } = body

    // Validate required fields: either items[] exists with at least 1 entry, or single product fields provided
    if (!employeeId || !type) {
      return NextResponse.json({ error: "Missing required fields: employeeId and type are required" }, { status: 400 })
    }

    const hasItems = Array.isArray(items) && items.length > 0
    if (!hasItems) {
      if (!product || !quantity) {
        return NextResponse.json({ error: "Missing required fields for single-item transaction" }, { status: 400 })
      }
      if (!mongoose.isValidObjectId(product)) {
        return NextResponse.json({ error: "Invalid product id" }, { status: 400 })
      }
    } else {
      // basic validation on items
      for (const [idx, it] of items.entries()) {
        if (!it.productId || !it.quantity) {
          return NextResponse.json({ error: `Invalid item at index ${idx}` }, { status: 400 })
        }
        if (!mongoose.isValidObjectId(it.productId)) {
          return NextResponse.json({ error: `Invalid product id for item at index ${idx}` }, { status: 400 })
        }
        if ((Number(it.quantity) || 0) <= 0) {
          return NextResponse.json({ error: `Quantity must be > 0 for item at index ${idx}` }, { status: 400 })
        }
        if ((Number(it.amount) || 0) < 0) {
          return NextResponse.json({ error: `Amount must be >= 0 for item at index ${idx}` }, { status: 400 })
        }
      }
    }

    if (!customer) {
      return NextResponse.json({ error: "Customer is required for this transaction" }, { status: 400 })
    }

    // Compute totals
    let totalQuantity = 0
    let totalAmount = 0
    if (hasItems) {
      totalQuantity = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)
      totalAmount = items.reduce((s, it) => s + (Number(it.amount) || 0), 0)
    } else {
      totalQuantity = parseInt(quantity)
      totalAmount = parseFloat(amount)
    }

    // Create transaction data
    const transactionData = {
      type,
      employee: employeeId,
      // Backward-compat single fields: when items present, copy from first item for quick views
      product: hasItems ? items[0].productId : product,
      quantity: totalQuantity,
      amount: totalAmount,
      depositAmount: depositAmount ? parseFloat(depositAmount) : 0,
      refillAmount: refillAmount ? parseFloat(refillAmount) : 0,
      returnAmount: returnAmount ? parseFloat(returnAmount) : 0,
      paymentMethod: paymentMethod || "cash",
      cashAmount: cashAmount ? parseFloat(cashAmount) : 0,
      bankName: bankName || "",
      checkNumber: checkNumber || "",
      status: status || "pending",
      notes: notes || "",
      items: hasItems ? items.map(it => ({
        productId: it.productId,
        productName: it.productName || '',
        quantity: Number(it.quantity) || 0,
        amount: Number(it.amount) || 0,
      })) : undefined,
    }

    transactionData.customer = customer

    console.log("[POST /api/employee-cylinders] creating with itemsLen=", Array.isArray(transactionData.items) ? transactionData.items.length : 0,
      'totalQty=', transactionData.quantity, 'totalAmt=', transactionData.amount)

    // Generate unified sequential invoice number using centralized generator
    async function getNextCylinderInvoice() {
      const { getNextInvoiceNumberWithRetry } = await import('@/lib/invoice-generator')
      return await getNextInvoiceNumberWithRetry()
    }

    // Assign invoice number if not provided
    if (!transactionData.invoiceNumber) {
      transactionData.invoiceNumber = await getNextCylinderInvoice()
    }

    // Enforce: deposit transactions are always pending (they clear only via linked returns)
    if (type === 'deposit') {
      transactionData.status = 'pending'
    }

    // Attach linkedDeposit only for return transactions if provided and valid
    if (type === 'return' && linkedDeposit && mongoose.isValidObjectId(linkedDeposit)) {
      transactionData.linkedDeposit = new mongoose.Types.ObjectId(linkedDeposit)
      // For return transactions, default status should be 'cleared' as per UI logic
      if (!transactionData.status) transactionData.status = 'cleared'
    }

    let savedTransaction
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const newTransaction = new EmployeeCylinderTransaction(transactionData)
        savedTransaction = await newTransaction.save()
        break
      } catch (err) {
        // If duplicate key arises in future when index added unique, retry
        if (err && err.code === 11000 && /invoiceNumber/.test(err.message)) {
          transactionData.invoiceNumber = await getNextCylinderInvoice()
          continue
        }
        throw err
      }
    }
    console.log('[POST /api/employee-cylinders] saved _id=', savedTransaction._id, 'itemsLen=', Array.isArray(savedTransaction.items) ? savedTransaction.items.length : 0)

    // Update inventory for deposit and return transactions
    if (type === 'deposit') {
      console.log(`[POST /api/employee-cylinders] Starting inventory update for deposit - hasItems: ${hasItems}, employeeId: ${employeeId}`)
      try {
        if (hasItems) {
          // Multi-item: update inventory for each item
          console.log(`[POST /api/employee-cylinders] Processing ${items.length} items for inventory update`)
          for (const item of items) {
            console.log(`[POST /api/employee-cylinders] Updating inventory for item: ${item.productId}, quantity: ${item.quantity}`)
            await updateInventoryForDeposit(item.productId, Number(item.quantity) || 0, employeeId)
          }
        } else {
          // Single item: update inventory
          console.log(`[POST /api/employee-cylinders] Updating inventory for single product: ${product}, quantity: ${totalQuantity}`)
          await updateInventoryForDeposit(product, totalQuantity, employeeId)
        }
        console.log(`[POST /api/employee-cylinders] Inventory update completed successfully`)
      } catch (error) {
        console.error('[Employee Deposit] Inventory update failed:', error)
        // Continue without failing the transaction
      }
    } else if (type === 'return') {
      try {
        console.log(`[Employee Return] Processing stock addition - Employee: ${employeeId}`)
        
        if (hasItems) {
          // Multi-item: update inventory for each item
          for (const item of items) {
            await updateInventoryForReturn(item.productId, Number(item.quantity) || 0, employeeId)
          }
        } else {
          // Single item: update inventory
          await updateInventoryForReturn(product, totalQuantity, employeeId)
        }
      } catch (error) {
        console.error('[Employee Return] Inventory update failed:', error)
        // Continue without failing the transaction
      }
    }

    // Update daily cylinder tracking for deposits and returns
    if (type === 'deposit' || type === 'return') {
      await updateEmployeeDailyCylinderTracking(savedTransaction, employeeId)
    }

    // Update new daily employee cylinder aggregation
    try {
      await updateDailyEmployeeCylinderAggregation(savedTransaction, employeeId, type)
      console.log(`✅ [EMPLOYEE CYLINDERS] Daily cylinder aggregation updated successfully for ${type}`)
    } catch (aggregationError) {
      console.error(`❌ [EMPLOYEE CYLINDERS] Failed to update daily cylinder aggregation:`, aggregationError.message)
      // Don't fail the entire transaction if aggregation fails
    }

    // Populate the response
    const populatedTransaction = await EmployeeCylinderTransaction.findById(savedTransaction._id)
      .populate("customer", "name email phone")
      .populate("supplier", "companyName contactPerson phone email")
      .populate("employee", "name email")
      .populate("product", "name")
      .populate({ path: 'items.productId', model: 'Product', select: 'name', strictPopulate: false })
    console.log('[POST /api/employee-cylinders] populated itemsLen=', Array.isArray(populatedTransaction?.items) ? populatedTransaction.items.length : 0)

    // If this is a return linked to a deposit, update the deposit's status based on total returned quantity
    if (type === 'return' && transactionData.linkedDeposit) {
      try {
        const depositId = transactionData.linkedDeposit
        const depositTx = await EmployeeCylinderTransaction.findById(depositId)
        if (depositTx && depositTx.type === 'deposit') {
          const agg = await EmployeeCylinderTransaction.aggregate([
            { $match: { linkedDeposit: depositId, type: 'return' } },
            { $group: { _id: '$linkedDeposit', totalReturned: { $sum: '$quantity' } } },
          ])
          const returnedQty = (agg && agg[0] && agg[0].totalReturned) ? agg[0].totalReturned : 0
          const newStatus = returnedQty >= (depositTx.quantity || 0) ? 'cleared' : 'pending'
          await EmployeeCylinderTransaction.findByIdAndUpdate(depositId, { status: newStatus })
          console.log('[employee-cylinders] Updated deposit', String(depositId), 'status ->', newStatus, 'returned/required=', returnedQty, '/', depositTx.quantity)
        }
      } catch (e) {
        console.error('[employee-cylinders] Failed to update linked deposit status:', e?.message)
      }
    }

    console.log("Employee cylinder transaction created successfully:", populatedTransaction._id)
    return NextResponse.json(populatedTransaction, { status: 201 })
  } catch (error) {
    console.error("Error creating employee cylinder transaction:", error?.message, error?.stack)
    return NextResponse.json({ error: error?.message || "Failed to create employee cylinder transaction" }, { status: 500 })
  }
}

// Helper function to update daily employee cylinder aggregation
async function updateDailyEmployeeCylinderAggregation(transaction, employeeId, transactionType) {
  // Use local date instead of UTC to ensure correct date assignment
  const transactionDate = getLocalDateStringFromDate(transaction.createdAt) // YYYY-MM-DD format
  
  console.log(`📊 [CYLINDER AGGREGATION] Processing ${transactionType} transaction for date: ${transactionDate}, employee: ${employeeId}`)
  
  // Handle both single item and multi-item transactions
  const items = transaction.items && transaction.items.length > 0 
    ? transaction.items 
    : [{
        productId: transaction.product,
        quantity: transaction.quantity || 0
      }]
  
  // Process each item in the transaction
  for (const item of items) {
    const product = await Product.findById(item.productId)
    if (!product) {
      console.warn(`⚠️ [CYLINDER AGGREGATION] Product not found: ${item.productId}`)
      continue
    }
    
    const quantity = Number(item.quantity) || 0
    // Use individual item amount, not transaction total
    const amount = Number(item.amount) || 0
    
    console.log(`📊 [CYLINDER AGGREGATION] Processing ${transactionType}: ${product.name}, Qty: ${quantity}, Amount: ${amount}`)
    
    // Validate that we have proper individual amounts for multi-item transactions
    if (items.length > 1 && amount === 0) {
      console.warn(`⚠️ [CYLINDER AGGREGATION] Multi-item transaction missing individual amount for ${product.name}`)
    }
    
    // Map transaction types to aggregation types
    let aggregationType = transactionType
    if (transactionType === 'deposit') {
      aggregationType = 'deposit'
    } else if (transactionType === 'return') {
      aggregationType = 'return'
    } else if (transactionType === 'refill') {
      aggregationType = 'refill'
    }
    
    // Update or create daily aggregation record
    try {
      const aggregation = await DailyEmployeeCylinderAggregation.updateDailyCylinderAggregation(
        employeeId,
        transactionDate,
        product._id,
        product.name,
        aggregationType,
        {
          quantity: quantity,
          amount: amount
        }
      )
      
      console.log(`✅ [CYLINDER AGGREGATION] Updated ${aggregationType} aggregation for ${product.name}:`, {
        totalDeposits: aggregation.totalDeposits,
        totalReturns: aggregation.totalReturns,
        totalRefills: aggregation.totalRefills,
        totalTransactions: aggregation.depositTransactionCount + aggregation.returnTransactionCount + aggregation.refillTransactionCount
      })
      
    } catch (aggregationError) {
      console.error(`❌ [CYLINDER AGGREGATION] Failed to update aggregation for ${product.name}:`, aggregationError.message)
    }
  }
  
  console.log(`✅ [CYLINDER AGGREGATION] Completed processing ${transactionType} transaction`)
}
