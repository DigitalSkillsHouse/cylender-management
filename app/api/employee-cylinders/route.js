import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeeCylinderTransaction from "@/models/EmployeeCylinderTransaction"
import Customer from "@/models/Customer"
import User from "@/models/User"
import Counter from "@/models/Counter"
import Product from "@/models/Product"
import InventoryItem from "@/models/InventoryItem"
import StockAssignment from "@/models/StockAssignment"
import mongoose from "mongoose"

// Helper function to update inventory for deposit transactions
async function updateInventoryForDeposit(cylinderProductId, quantity, employeeId) {
  console.log(`[Employee Deposit] Processing stock deduction - Cylinder: ${cylinderProductId}, Quantity: ${quantity}, Employee: ${employeeId}`)
  
  // 1. Deduct from employee's stock assignment
  const assignment = await StockAssignment.findOne({ 
    employee: employeeId, 
    product: cylinderProductId,
    status: 'received'
  })
  
  if (assignment) {
    assignment.remainingQuantity = Math.max(0, (assignment.remainingQuantity || 0) - quantity)
    await assignment.save()
    console.log(`[Employee Deposit] Updated assignment remaining: ${assignment.remainingQuantity}`)
  }
  
  // 2. Deduct empty cylinders from inventory
  const cylinderInventory = await InventoryItem.findOne({ product: cylinderProductId })
  if (cylinderInventory) {
    cylinderInventory.availableEmpty = Math.max(0, (cylinderInventory.availableEmpty || 0) - quantity)
    cylinderInventory.currentStock = (cylinderInventory.availableFull || 0) + (cylinderInventory.availableEmpty || 0)
    await cylinderInventory.save()
    console.log(`[Employee Deposit] Updated cylinder inventory - Empty: ${cylinderInventory.availableEmpty}, Total: ${cylinderInventory.currentStock}`)
  }
  
  // 3. Sync cylinder product stock with inventory total
  const cylinderProduct = await Product.findById(cylinderProductId)
  if (cylinderProduct && cylinderInventory) {
    cylinderProduct.currentStock = cylinderInventory.currentStock
    await cylinderProduct.save()
    console.log(`[Employee Deposit] Synced cylinder product ${cylinderProduct.name} stock: ${cylinderProduct.currentStock}`)
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
      if (!product || !cylinderSize || !quantity) {
        return NextResponse.json({ error: "Missing required fields for single-item transaction" }, { status: 400 })
      }
      if (!["small", "large"].includes(cylinderSize)) {
        return NextResponse.json({ error: "Invalid cylinder size" }, { status: 400 })
      }
      if (!mongoose.isValidObjectId(product)) {
        return NextResponse.json({ error: "Invalid product id" }, { status: 400 })
      }
    } else {
      // basic validation on items
      for (const [idx, it] of items.entries()) {
        if (!it.productId || !it.cylinderSize || !it.quantity) {
          return NextResponse.json({ error: `Invalid item at index ${idx}` }, { status: 400 })
        }
        if (!["small", "large"].includes(it.cylinderSize)) {
          return NextResponse.json({ error: `Invalid cylinder size for item at index ${idx}` }, { status: 400 })
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
      cylinderSize: hasItems ? items[0].cylinderSize : cylinderSize,
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
        cylinderSize: it.cylinderSize,
        quantity: Number(it.quantity) || 0,
        amount: Number(it.amount) || 0,
      })) : undefined,
    }

    transactionData.customer = customer

    console.log("[POST /api/employee-cylinders] creating with itemsLen=", Array.isArray(transactionData.items) ? transactionData.items.length : 0,
      'totalQty=', transactionData.quantity, 'totalAmt=', transactionData.amount)

    // Generate short sequential invoice number (shared with admin cylinder counter)
    async function getNextCylinderInvoice() {
      const now = new Date()
      const year = now.getFullYear()
      const key = 'cylinder_invoice'
      const updated = await Counter.findOneAndUpdate(
        { key, year },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      )
      return `INV-${year}-CM-${updated.seq}`
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

    // Update inventory for deposit transactions
    if (type === 'deposit') {
      try {
        if (hasItems) {
          // Multi-item: update inventory for each item
          for (const item of items) {
            await updateInventoryForDeposit(item.productId, Number(item.quantity) || 0, employeeId)
          }
        } else {
          // Single item: update inventory
          await updateInventoryForDeposit(product, totalQuantity, employeeId)
        }
      } catch (error) {
        console.error('[Employee Deposit] Inventory update failed:', error)
        // Continue without failing the transaction
      }
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
