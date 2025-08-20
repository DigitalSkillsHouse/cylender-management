import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeeSale from "@/models/EmployeeSale"
import Product from "@/models/Product"
import Customer from "@/models/Customer"
import User from "@/models/User"
import StockAssignment from "@/models/StockAssignment"

export async function GET(request) {
  try {
    await dbConnect()
    
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    
    let query = {}
    if (employeeId) {
      query = { employee: employeeId }
    }
    // If no employeeId provided, fetch all employee sales (for admin panel)

    const sales = await EmployeeSale.find(query)
      .populate("customer", "name email phone")
      .populate("items.product", "name category cylinderSize")
      .populate("employee", "name email")
      .sort({ createdAt: -1 })

    return NextResponse.json(sales)
  } catch (error) {
    console.error("Error fetching employee sales:", error)
    return NextResponse.json({ error: "Failed to fetch employee sales" }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    await dbConnect()
    
    const body = await request.json()
    const { employeeId, customer, items, totalAmount, paymentMethod, paymentStatus, notes, customerSignature, receivedAmount } = body

    // Validate required fields
    if (!employeeId || !customer || !items || items.length === 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Generate invoice number
    const lastSale = await EmployeeSale.findOne().sort({ createdAt: -1 })
    const lastInvoiceNumber = lastSale?.invoiceNumber || "EMP-0000"
    const invoiceNumber = `EMP-${String(parseInt(lastInvoiceNumber.split("-")[1]) + 1).padStart(4, "0")}`

    // Validate stock availability and calculate totals
    let calculatedTotal = 0
    const validatedItems = []

    for (const item of items) {
      const product = await Product.findById(item.product)
      if (!product) {
        return NextResponse.json({ error: `Product not found: ${item.product}` }, { status: 400 })
      }

      // Check stock availability
      if (product.currentStock < item.quantity) {
        return NextResponse.json({ 
          error: `Insufficient stock for ${product.name}. Available: ${product.currentStock}, Requested: ${item.quantity}` 
        }, { status: 400 })
      }

      // Get least price from employee's received inventory (stock assignments)
      const stockAssignment = await StockAssignment.findOne({
        employee: employeeId,
        product: item.product,
        status: "received",
        remainingQuantity: { $gt: 0 }
      }).sort({ createdAt: 1 }) // Get the oldest assignment first (FIFO)

      if (!stockAssignment) {
        return NextResponse.json({ 
          error: `No received inventory found for ${product.name} for this employee` 
        }, { status: 400 })
      }

      // Use least price from stock assignment
      const leastPrice = stockAssignment.leastPrice
      const itemTotal = leastPrice * item.quantity
      calculatedTotal += itemTotal

      // Derive category and cylinder size from product (trust server data)
      const category = product.category || (item.category || 'gas')
      const cylinderSize = category === 'cylinder' ? product.cylinderSize : undefined

      validatedItems.push({
        product: item.product,
        quantity: item.quantity,
        price: leastPrice,
        total: itemTotal,
        category,
        cylinderSize,
      })
    }

    // Create the sale
    const newSale = new EmployeeSale({
      invoiceNumber,
      employee: employeeId,
      customer,
      items: validatedItems,
      totalAmount: calculatedTotal,
      paymentMethod: paymentMethod || "cash",
      paymentStatus: paymentStatus || "cleared",
      receivedAmount: parseFloat(receivedAmount) || 0,
      notes: notes || "",
      customerSignature: customerSignature || ""
    })

    const savedSale = await newSale.save()

    // Update product stock and employee stock assignments
    for (const item of validatedItems) {
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { currentStock: -item.quantity } }
      )
      console.log(`Updated product stock for ${item.product}: reduced by ${item.quantity}`)
      
      // Deduct from employee's assigned stock (remainingQuantity)
      const employeeAssignments = await StockAssignment.find({
        employee: employeeId,
        product: item.product,
        status: "received",
        remainingQuantity: { $gt: 0 }
      }).sort({ createdAt: 1 }) // FIFO - First In, First Out
      
      let remainingToDeduct = item.quantity
      
      for (const assignment of employeeAssignments) {
        if (remainingToDeduct <= 0) break
        
        const deductFromThisAssignment = Math.min(assignment.remainingQuantity, remainingToDeduct)
        
        await StockAssignment.findByIdAndUpdate(
          assignment._id,
          { $inc: { remainingQuantity: -deductFromThisAssignment } }
        )
        
        remainingToDeduct -= deductFromThisAssignment
        console.log(`Deducted ${deductFromThisAssignment} from employee assignment ${assignment._id}, remaining: ${assignment.remainingQuantity - deductFromThisAssignment}`)
      }
      
      if (remainingToDeduct > 0) {
        console.warn(`Warning: Employee ${employeeId} sold ${remainingToDeduct} more than their assigned stock for product ${item.product}`)
      }
    }

    // Populate the response
    const populatedSale = await EmployeeSale.findById(savedSale._id)
      .populate("customer", "name email phone")
      .populate("items.product", "name category cylinderSize")
      .populate("employee", "name email")

    console.log("Employee sale created successfully:", populatedSale.invoiceNumber)
    return NextResponse.json(populatedSale, { status: 201 })
  } catch (error) {
    console.error("Error creating employee sale:", error)
    return NextResponse.json({ error: "Failed to create employee sale" }, { status: 500 })
  }
}
