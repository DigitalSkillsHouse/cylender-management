import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeeSale from "@/models/EmployeeSale"
import Product from "@/models/Product"
import Customer from "@/models/Customer"
import User from "@/models/User"
import Counter from "@/models/Counter"
import Sale from "@/models/Sale"

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
      .populate("items.product", "name category cylinderSize costPrice leastPrice")
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

    // Generate sequential invoice number using same system as admin sales
    const settings = await Counter.findOne({ key: 'invoice_start' })
    const startingNumber = settings?.seq || 0

    // Check both Sale and EmployeeSale collections for latest invoice number
    const [latestSale, latestEmpSale] = await Promise.all([
      Sale.findOne({ invoiceNumber: { $regex: /^\d{4}$/ } }).sort({ invoiceNumber: -1 }),
      EmployeeSale.findOne({ invoiceNumber: { $regex: /^\d{4}$/ } }).sort({ invoiceNumber: -1 })
    ])

    let nextNumber = startingNumber
    const saleNumber = latestSale ? parseInt(latestSale.invoiceNumber) || -1 : -1
    const empSaleNumber = latestEmpSale ? parseInt(latestEmpSale.invoiceNumber) || -1 : -1
    const lastNumber = Math.max(saleNumber, empSaleNumber)
    
    if (lastNumber >= 0) {
      nextNumber = Math.max(lastNumber + 1, startingNumber)
    }

    const invoiceNumber = nextNumber.toString().padStart(4, '0')

    // Validate stock availability and calculate totals
    let calculatedTotal = 0
    const validatedItems = []

    // Get employee's inventory using new system
    const EmployeeInventoryItem = (await import("@/models/EmployeeInventoryItem")).default
    
    console.log(`🔍 [EMPLOYEE SALES] Fetching inventory for employee: ${employeeId}`)
    
    // Fetch employee's available inventory from new system
    const employeeInventoryItems = await EmployeeInventoryItem.find({
      employee: employeeId
    }).populate('product', 'name productCode category costPrice leastPrice cylinderSize')
    
    console.log(`📊 [EMPLOYEE SALES] Found ${employeeInventoryItems.length} inventory items`)
    
    // Build employee inventory map using new system
    const employeeStockMap = new Map()
    
    employeeInventoryItems.forEach(item => {
      if (item.product) {
        const key = `${item.product._id}-${item.category}`
        console.log(`📦 [EMPLOYEE SALES] Processing item: ${item.product.name}, Category: ${item.category}, Stock: Gas=${item.currentStock}, Full=${item.availableFull}, Empty=${item.availableEmpty}`)
        
        employeeStockMap.set(key, {
          product: item.product,
          currentStock: item.currentStock || 0,
          availableEmpty: item.availableEmpty || 0,
          availableFull: item.availableFull || 0,
          leastPrice: item.product.leastPrice || 0
        })
      }
    })
    
    console.log(`🗺️ [EMPLOYEE SALES] Built inventory map with ${employeeStockMap.size} entries`)
    console.log(`🔍 [EMPLOYEE SALES] Inventory map keys:`, Array.from(employeeStockMap.keys()))

    for (const item of items) {
      const product = await Product.findById(item.product)
      if (!product) {
        return NextResponse.json({ error: `Product not found: ${item.product}` }, { status: 400 })
      }

      // Find employee's inventory for this product
      const itemCategory = item.category || product.category
      const key = `${item.product}-${itemCategory}`
      console.log(`🔍 [EMPLOYEE SALES] Checking inventory for: ${product.name}, Category: ${itemCategory}, Key: ${key}`)
      console.log(`📊 [EMPLOYEE SALES] Employee stock found:`, employeeStockMap.get(key) ? {
        product: employeeStockMap.get(key).product.name,
        currentStock: employeeStockMap.get(key).currentStock,
        availableEmpty: employeeStockMap.get(key).availableEmpty,
        availableFull: employeeStockMap.get(key).availableFull
      } : 'Not found')
      
      if (!employeeStockMap.get(key)) {
        console.log(`❌ [EMPLOYEE SALES] No inventory found for key: ${key}`)
        console.log(`🗺️ [EMPLOYEE SALES] Available keys:`, Array.from(employeeStockMap.keys()))
        return NextResponse.json({ 
          error: `No inventory found for ${product.name} for this employee` 
        }, { status: 400 })
      }

      // Check specific stock availability based on cylinder status
      let availableStock = 0
      if (item.category === 'cylinder') {
        if (item.cylinderStatus === 'full') {
          // Allow full cylinder sales - check availableFull stock
          availableStock = employeeStockMap.get(key).availableFull
          console.log(`🔍 [EMPLOYEE SALES] Full cylinder sale - Available: ${availableStock}, Requested: ${item.quantity}`)
          
          if (availableStock < item.quantity) {
            return NextResponse.json({ 
              error: `Insufficient full cylinder stock for ${product.name}. Available: ${availableStock}, Requested: ${item.quantity}` 
            }, { status: 400 })
          }
        } else {
          // Empty cylinder sales - check availableEmpty stock
          availableStock = employeeStockMap.get(key).availableEmpty
          console.log(`🔍 [EMPLOYEE SALES] Empty cylinder sale - Available: ${availableStock}, Requested: ${item.quantity}`)
          
          if (availableStock < item.quantity) {
            return NextResponse.json({ 
              error: `Insufficient empty cylinder stock for ${product.name}. Available: ${availableStock}, Requested: ${item.quantity}` 
            }, { status: 400 })
          }
        }
      } else {
        // Gas sales - check currentStock
        availableStock = employeeStockMap.get(key).currentStock
        console.log(`🔍 [EMPLOYEE SALES] Gas sale - Available: ${availableStock}, Requested: ${item.quantity}`)
        
        if (availableStock < item.quantity) {
          return NextResponse.json({ 
            error: `Insufficient stock for ${product.name}. Available: ${availableStock}, Requested: ${item.quantity}` 
          }, { status: 400 })
        }
      }

      // Use least price from employee inventory
      const employeeStock = employeeStockMap.get(key)
      const leastPrice = employeeStock.leastPrice
      const itemTotal = leastPrice * item.quantity
      calculatedTotal += itemTotal

      // Derive category and cylinder size from product (trust server data)
      const productCategory = product.category || (item.category || 'gas')
      const cylinderSize = productCategory === 'cylinder' ? (product.cylinderSize || 'large') : undefined

      validatedItems.push({
        product: item.product,
        quantity: item.quantity,
        price: leastPrice,
        total: itemTotal,
        category: productCategory,
        cylinderSize: cylinderSize,
        cylinderStatus: item.cylinderStatus,
        cylinderProductId: item.cylinderProductId,
        gasProductId: item.gasProductId,
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

    // Update employee inventory using new system
    console.log(`🔄 [EMPLOYEE SALES] Starting inventory updates for ${validatedItems.length} items`)
    
    for (const item of validatedItems) {
      const product = await Product.findById(item.product)
      if (product) {
        console.log(`🔄 [EMPLOYEE SALES] Processing ${item.quantity} units of ${product.name} (${product.category})`)
        
        if (product.category === 'gas') {
          // Update gas inventory - decrease gas stock from employee inventory
          const gasInventory = await EmployeeInventoryItem.findOne({
            employee: employeeId,
            product: item.product
          })
          
          if (gasInventory) {
            gasInventory.currentStock = Math.max(0, (gasInventory.currentStock || 0) - item.quantity)
            gasInventory.lastUpdatedAt = new Date()
            await gasInventory.save()
            console.log(`✅ [EMPLOYEE SALES] Gas inventory updated: ${product.name} decreased by ${item.quantity}, remaining: ${gasInventory.currentStock}`)
          }
          
          // Handle cylinder conversion for gas sales (from cylinderProductId)
          if (item.cylinderProductId) {
            const cylinderInventory = await EmployeeInventoryItem.findOne({
              employee: employeeId,
              product: item.cylinderProductId
            })
            
            if (cylinderInventory) {
              // Move cylinders from Full to Empty in employee inventory
              cylinderInventory.availableFull = Math.max(0, (cylinderInventory.availableFull || 0) - item.quantity)
              cylinderInventory.availableEmpty = (cylinderInventory.availableEmpty || 0) + item.quantity
              cylinderInventory.lastUpdatedAt = new Date()
              await cylinderInventory.save()
              console.log(`✅ [EMPLOYEE SALES] Cylinder conversion: ${item.quantity} moved from Full to Empty, Full: ${cylinderInventory.availableFull}, Empty: ${cylinderInventory.availableEmpty}`)
            }
          }
          
        } else if (product.category === 'cylinder') {
          // Handle cylinder sales
          const cylinderInventory = await EmployeeInventoryItem.findOne({
            employee: employeeId,
            product: item.product
          })
          
          if (cylinderInventory) {
            if (item.cylinderStatus === 'full') {
              // Selling full cylinders - decrease availableFull and also deduct gas
              cylinderInventory.availableFull = Math.max(0, (cylinderInventory.availableFull || 0) - item.quantity)
              cylinderInventory.lastUpdatedAt = new Date()
              await cylinderInventory.save()
              console.log(`✅ [EMPLOYEE SALES] Full cylinder sale: ${product.name} decreased by ${item.quantity}, remaining: ${cylinderInventory.availableFull}`)
              
              // Also deduct gas stock if gasProductId is provided
              if (item.gasProductId) {
                const gasInventory = await EmployeeInventoryItem.findOne({
                  employee: employeeId,
                  product: item.gasProductId
                })
                
                if (gasInventory) {
                  gasInventory.currentStock = Math.max(0, (gasInventory.currentStock || 0) - item.quantity)
                  gasInventory.lastUpdatedAt = new Date()
                  await gasInventory.save()
                  console.log(`✅ [EMPLOYEE SALES] Gas deducted for full cylinder: ${item.quantity} units, remaining: ${gasInventory.currentStock}`)
                }
              }
            } else {
              // Selling empty cylinders - decrease availableEmpty
              cylinderInventory.availableEmpty = Math.max(0, (cylinderInventory.availableEmpty || 0) - item.quantity)
              cylinderInventory.lastUpdatedAt = new Date()
              await cylinderInventory.save()
              console.log(`✅ [EMPLOYEE SALES] Empty cylinder sale: ${product.name} decreased by ${item.quantity}, remaining: ${cylinderInventory.availableEmpty}`)
            }
          }
        }
      }
    }

    console.log(`✅ [EMPLOYEE SALES] Inventory updates completed successfully`)

    // Populate the created sale for response
    const populatedSale = await EmployeeSale.findById(savedSale._id)
      .populate("customer", "name phone address email")
      .populate("items.product", "name category cylinderSize costPrice leastPrice")
      .populate("employee", "name email")

    return NextResponse.json({
      data: populatedSale,
      message: "Employee sale created successfully",
    })
  } catch (error) {
    console.error("Employee Sales POST error:", error)
    console.error("Error stack:", error.stack)
    console.error("Error message:", error.message)
    return NextResponse.json({ 
      error: "Failed to create employee sale", 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}