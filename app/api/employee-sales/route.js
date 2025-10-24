import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeeSale from "@/models/EmployeeSale"
import Product from "@/models/Product"
import Customer from "@/models/Customer"
import User from "@/models/User"
import Counter from "@/models/Counter"
import Sale from "@/models/Sale"
import DailyEmployeeSalesAggregation from "@/models/DailyEmployeeSalesAggregation"

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

      const validatedItem = {
        product: item.product,
        quantity: item.quantity,
        price: leastPrice,
        total: itemTotal,
        category: productCategory,
        cylinderSize: cylinderSize,
        cylinderStatus: item.cylinderStatus,
        cylinderProductId: item.cylinderProductId,
        gasProductId: item.gasProductId,
      }

      // Add cylinder information for gas sales (for DSR tracking)
      if (productCategory === 'gas' && !item.cylinderProductId) {
        // Auto-determine cylinder based on gas name
        const gasName = product?.name || ''
        console.log(`Auto-determining cylinder for employee gas sale: ${gasName}`)
        
        // Get all products to find matching cylinder
        const allProducts = await Product.find({ category: 'cylinder' })
        
        // Find matching cylinder product based on gas name
        const matchingCylinder = allProducts.find(p => 
          gasName.toLowerCase().includes(p.name.toLowerCase().replace('cylinder', '').replace('cylinders', '').trim())
        )
        
        if (matchingCylinder) {
          validatedItem.cylinderProductId = matchingCylinder._id
          validatedItem.cylinderName = matchingCylinder.name
          console.log(`Found matching cylinder: ${matchingCylinder.name} for gas: ${gasName}`)
        } else {
          // Try reverse matching - check if any cylinder name contains the gas name parts
          const gasWords = gasName.toLowerCase().split(' ').filter(word => 
            word.length > 2 && !['gas', 'kg', 'lb'].includes(word)
          )
          
          for (const word of gasWords) {
            const cylinder = allProducts.find(p => 
              p.name.toLowerCase().includes(word)
            )
            if (cylinder) {
              validatedItem.cylinderProductId = cylinder._id
              validatedItem.cylinderName = cylinder.name
              console.log(`Found cylinder by word match: ${cylinder.name} for gas: ${gasName} (word: ${word})`)
              break
            }
          }
        }
      }

      validatedItems.push(validatedItem)
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

    // Update daily sales aggregation for DSR
    try {
      await updateDailySalesAggregation(savedSale, employeeId)
      console.log(`✅ [EMPLOYEE SALES] Daily sales aggregation updated successfully`)
    } catch (trackingError) {
      console.error(`❌ [EMPLOYEE SALES] Failed to update daily sales aggregation:`, trackingError.message)
      // Don't fail the entire sale if tracking fails
    }

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
              
              // Record employee full cylinder sale in daily tracking system
              try {
                const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD format
                const dailyTrackingData = {
                  date: today,
                  cylinderProductId: product._id.toString(),
                  cylinderName: product.name,
                  cylinderSize: product.cylinderSize || 'Unknown Size',
                  fullCylinderSalesQuantity: item.quantity,
                  fullCylinderSalesAmount: Number(item.price) * Number(item.quantity),
                  employeeId: employeeId,
                  isEmployeeTransaction: true // This is employee sale
                }
                
                console.log(`📊 [EMPLOYEE SALES] Recording daily full cylinder sale:`, dailyTrackingData)
                
                const dailyTrackingResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/daily-cylinder-transactions`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(dailyTrackingData)
                })
                
                if (dailyTrackingResponse.ok) {
                  console.log(`✅ [EMPLOYEE SALES] Daily full cylinder sale recorded successfully`)
                } else {
                  console.error(`❌ [EMPLOYEE SALES] Failed to record daily full cylinder sale:`, await dailyTrackingResponse.text())
                }
              } catch (dailyTrackingError) {
                console.error(`❌ [EMPLOYEE SALES] Error recording daily full cylinder sale:`, dailyTrackingError)
              }
              
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

// Helper function to update daily sales aggregation
async function updateDailySalesAggregation(sale, employeeId) {
  const saleDate = new Date(sale.createdAt).toISOString().slice(0, 10) // YYYY-MM-DD format
  
  console.log(`📊 [DAILY AGGREGATION] Processing sale for date: ${saleDate}, employee: ${employeeId}`)
  
  // Process each item in the sale
  for (const item of sale.items) {
    const product = await Product.findById(item.product)
    if (!product) {
      console.warn(`⚠️ [DAILY AGGREGATION] Product not found: ${item.product}`)
      continue
    }
    
    const quantity = Number(item.quantity) || 0
    const revenue = Number(item.price) * quantity || 0
    
    console.log(`📊 [DAILY AGGREGATION] Processing item: ${product.name}, Category: ${product.category}, Qty: ${quantity}, Revenue: ${revenue}`)
    
    // Prepare sales data based on category and cylinder status
    let salesData = {}
    
    if (product.category === 'gas') {
      // Gas sales
      salesData = {
        gasSales: quantity,
        gasRevenue: revenue
      }
      console.log(`📊 [DAILY AGGREGATION] Gas sale recorded: ${quantity} units, ${revenue} revenue`)
      
    } else if (product.category === 'cylinder') {
      // Cylinder sales
      if (item.cylinderStatus === 'full') {
        salesData = {
          fullCylinderSales: quantity,
          fullCylinderRevenue: revenue
        }
        console.log(`📊 [DAILY AGGREGATION] Full cylinder sale recorded: ${quantity} units, ${revenue} revenue`)
      } else {
        salesData = {
          emptyCylinderSales: quantity,
          emptyCylinderRevenue: revenue
        }
        console.log(`📊 [DAILY AGGREGATION] Empty cylinder sale recorded: ${quantity} units, ${revenue} revenue`)
      }
    }
    
    // Update or create daily aggregation record
    try {
      const aggregation = await DailyEmployeeSalesAggregation.updateDailyAggregation(
        employeeId,
        saleDate,
        product._id,
        product.name,
        product.category,
        salesData
      )
      
      console.log(`✅ [DAILY AGGREGATION] Updated aggregation for ${product.name}:`, {
        totalGasSales: aggregation.totalGasSales,
        totalFullCylinderSales: aggregation.totalFullCylinderSales,
        totalEmptyCylinderSales: aggregation.totalEmptyCylinderSales,
        salesCount: aggregation.salesCount
      })
      
    } catch (aggregationError) {
      console.error(`❌ [DAILY AGGREGATION] Failed to update aggregation for ${product.name}:`, aggregationError.message)
    }
  }
  
  console.log(`✅ [DAILY AGGREGATION] Completed processing sale ${sale.invoiceNumber}`)
}