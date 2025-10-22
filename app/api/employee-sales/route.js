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

    // Get employee's inventory first
    const EmployeeInventoryModel = (await import("@/models/EmployeeInventory")).default
    const StockAssignmentModel = (await import("@/models/StockAssignment")).default
    
    // Fetch employee's available inventory (empty cylinders only)
    const employeeInventoryItems = await EmployeeInventoryModel.find({
      employee: employeeId,
      $or: [
        { category: { $ne: 'cylinder' }, currentStock: { $gt: 0 } }, // Non-cylinder items
        { category: 'cylinder', availableEmpty: { $gt: 0 } }, // Only empty cylinders
        { category: 'Gas', currentStock: { $gt: 0 } } // Gas items
      ]
    }).populate('product')
    
    const stockAssignments = await StockAssignmentModel.find({
      employee: employeeId,
      status: { $in: ['assigned', 'received'] },
      remainingQuantity: { $gt: 0 },
      $or: [
        { displayCategory: { $ne: 'Full Cylinder' } }, // Exclude full cylinders
        { displayCategory: 'Empty Cylinder' }, // Only empty cylinders
        { displayCategory: 'Gas' } // Include gas
      ]
    }).populate('product')
    
    // Build employee inventory map
    const employeeStockMap = new Map()
    
    // Add from EmployeeInventory
    employeeInventoryItems.forEach(item => {
      const key = `${item.product._id}-${item.category || item.product.category}`
      if (!employeeStockMap.has(key)) {
        employeeStockMap.set(key, {
          product: item.product,
          currentStock: 0,
          availableEmpty: 0,
          availableFull: 0,
          leastPrice: item.leastPrice
        })
      }
      const existing = employeeStockMap.get(key)
      existing.currentStock += item.currentStock || 0
      existing.availableEmpty += item.availableEmpty || 0
      existing.availableFull += item.availableFull || 0
    })
    
    // Add from StockAssignments
    stockAssignments.forEach(assignment => {
      const assignmentCategory = assignment.displayCategory || assignment.category || assignment.product.category
      const key = `${assignment.product._id}-${assignmentCategory}`
      if (!employeeStockMap.has(key)) {
        employeeStockMap.set(key, {
          product: assignment.product,
          currentStock: 0,
          availableEmpty: 0,
          availableFull: 0,
          leastPrice: assignment.leastPrice
        })
      }
      const existing = employeeStockMap.get(key)
      
      if (assignmentCategory === 'Gas') {
        existing.currentStock += assignment.remainingQuantity || 0
      } else if (assignmentCategory === 'Empty Cylinder') {
        existing.availableEmpty += assignment.remainingQuantity || 0
      } else if (assignmentCategory !== 'Full Cylinder') {
        // Exclude full cylinders, include other categories
        existing.currentStock += assignment.remainingQuantity || 0
      }
      // Skip Full Cylinder assignments - don't add to availableFull
    })

    for (const item of items) {
      const product = await Product.findById(item.product)
      if (!product) {
        return NextResponse.json({ error: `Product not found: ${item.product}` }, { status: 400 })
      }

      // Find employee's inventory for this product
      const itemCategory = item.category || product.category
      const key = `${item.product}-${itemCategory}`
      const employeeStock = employeeStockMap.get(key)
      
      if (!employeeStock) {
        return NextResponse.json({ 
          error: `No inventory found for ${product.name} for this employee` 
        }, { status: 400 })
      }

      // Check specific stock availability (empty cylinders only)
      let availableStock = 0
      if (item.category === 'cylinder') {
        if (item.cylinderStatus === 'full') {
          return NextResponse.json({ 
            error: `Full cylinder sales not allowed. Only empty cylinders can be sold.` 
          }, { status: 400 })
        }
        
        availableStock = employeeStock.availableEmpty
        
        if (availableStock < item.quantity) {
          return NextResponse.json({ 
            error: `Insufficient empty cylinder stock for ${product.name}. Available: ${availableStock}, Requested: ${item.quantity}` 
          }, { status: 400 })
        }
      } else {
        availableStock = employeeStock.currentStock
        if (availableStock < item.quantity) {
          return NextResponse.json({ 
            error: `Insufficient stock for ${product.name}. Available: ${availableStock}, Requested: ${item.quantity}` 
          }, { status: 400 })
        }
      }

      // Use least price from employee inventory
      const leastPrice = employeeStock.leastPrice
      const itemTotal = leastPrice * item.quantity
      calculatedTotal += itemTotal

      // Derive category and cylinder size from product (trust server data)
      const productCategory = product.category || (item.category || 'gas')
      const cylinderSize = productCategory === 'cylinder' ? product.cylinderSize : undefined

      validatedItems.push({
        product: item.product,
        quantity: item.quantity,
        price: leastPrice,
        total: itemTotal,
        category: productCategory,
        cylinderSize,
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

    // Update employee inventory with cylinder conversion logic (matching admin sales logic)
    // Reuse the already imported models
    
    for (const item of validatedItems) {
      const product = await Product.findById(item.product)
      if (product) {
        console.log(`🔄 EMPLOYEE SALE: Processing ${item.quantity} units of ${product.name} (${product.category})`)
        console.log(`📋 Sale Details: PaymentMethod=${paymentMethod}, PaymentStatus=${paymentStatus}, Notes="${notes || ''}"`)
        console.log(`📦 Item Details:`, {
          category: item.category,
          cylinderStatus: item.cylinderStatus,
          saleType: item.saleType,
          gasProductId: item.gasProductId,
          cylinderProductId: item.cylinderProductId
        })
        
        if (product.category === 'gas') {
          // Update gas inventory - decrease gas stock from employee inventory
          const gasInventory = await EmployeeInventoryModel.findOne({
            employee: employeeId,
            product: item.product
          })
          
          if (gasInventory) {
            await EmployeeInventoryModel.findByIdAndUpdate(gasInventory._id, {
              $inc: { currentStock: -item.quantity },
              $push: {
                transactions: {
                  type: 'sale',
                  quantity: -item.quantity,
                  date: new Date(),
                  notes: `Gas Sale - Invoice: ${invoiceNumber}`
                }
              }
            })
            console.log(`✅ Employee gas inventory updated: ${product.name} decreased by ${item.quantity}`)
          }
          
          // Also update StockAssignment for employee (find by Gas category)
          const stockAssignment = await StockAssignmentModel.findOne({
            employee: employeeId,
            product: item.product,
            status: { $in: ['assigned', 'received'] },
            displayCategory: 'Gas',
            remainingQuantity: { $gte: item.quantity }
          })
          
          if (stockAssignment) {
            stockAssignment.remainingQuantity = Math.max(0, (stockAssignment.remainingQuantity || 0) - item.quantity)
            await stockAssignment.save()
            console.log(`✅ Employee stock assignment updated: remaining ${stockAssignment.remainingQuantity}`)
          }
          
          // Handle cylinder conversion for gas sales (from cylinderProductId)
          if (item.cylinderProductId) {
            const cylinderInventory = await EmployeeInventoryModel.findOne({
              employee: employeeId,
              product: item.cylinderProductId
            })
            
            if (cylinderInventory) {
              // Move cylinders from Full to Empty in employee inventory
              await EmployeeInventoryModel.findByIdAndUpdate(cylinderInventory._id, {
                $inc: { 
                  availableFull: -item.quantity,
                  availableEmpty: item.quantity 
                },
                $push: {
                  transactions: {
                    type: 'conversion',
                    quantity: 0, // Net quantity change is 0 (Full→Empty)
                    date: new Date(),
                    notes: `Cylinder conversion Full→Empty - Gas Sale Invoice: ${invoiceNumber}`
                  }
                }
              })
            }
            
            // Update Full Cylinder StockAssignment
            const fullCylinderAssignment = await StockAssignmentModel.findOne({
              employee: employeeId,
              product: item.cylinderProductId,
              status: { $in: ['assigned', 'received'] },
              displayCategory: 'Full Cylinder',
              remainingQuantity: { $gte: item.quantity }
            })
            
            if (fullCylinderAssignment) {
              fullCylinderAssignment.remainingQuantity = Math.max(0, (fullCylinderAssignment.remainingQuantity || 0) - item.quantity)
              await fullCylinderAssignment.save()
              console.log(`✅ Full Cylinder assignment updated: remaining ${fullCylinderAssignment.remainingQuantity}`)
            }
            
            // Add to Empty Cylinder StockAssignment or create new one
            let emptyCylinderAssignment = await StockAssignmentModel.findOne({
              employee: employeeId,
              product: item.cylinderProductId,
              status: { $in: ['assigned', 'received'] },
              displayCategory: 'Empty Cylinder'
            })
            
            if (emptyCylinderAssignment) {
              emptyCylinderAssignment.remainingQuantity = (emptyCylinderAssignment.remainingQuantity || 0) + item.quantity
              await emptyCylinderAssignment.save()
            } else {
              // Create new empty cylinder assignment
              emptyCylinderAssignment = new StockAssignmentModel({
                employee: employeeId,
                product: item.cylinderProductId,
                quantity: item.quantity,
                remainingQuantity: item.quantity,
                assignedBy: employeeId,
                status: 'received',
                category: 'cylinder',
                cylinderStatus: 'empty',
                displayCategory: 'Empty Cylinder',
                leastPrice: fullCylinderAssignment?.leastPrice || 0,
                notes: `Created from gas sale conversion - Invoice: ${invoiceNumber}`
              })
              await emptyCylinderAssignment.save()
            }
            
            console.log(`✅ Cylinder conversion: ${product.name} - ${item.quantity} moved from Full to Empty`)
          }
          
        } else if (product.category === 'cylinder') {
          // Handle cylinder sales - update employee inventory based on status and sale type
          const cylinderInventory = await EmployeeInventoryModel.findOne({
            employee: employeeId,
            product: item.product
          })
          
          if (cylinderInventory) {
            const updateData = {
              $inc: { currentStock: -item.quantity },
              $push: {
                transactions: {
                  type: 'sale',
                  quantity: -item.quantity,
                  date: new Date(),
                  notes: `Cylinder Sale - Invoice: ${invoiceNumber}`
                }
              }
            }
            
            // Only handle empty cylinder sales
            if (item.cylinderStatus === 'empty') {
              // Selling empty cylinders - decrease availableEmpty
              updateData.$inc.availableEmpty = -item.quantity
              console.log(`✅ Employee empty cylinder sale: ${product.name} decreased by ${item.quantity}`)
            } else {
              console.error(`❌ ERROR: Full cylinder sales not allowed for ${product.name}`)
              return NextResponse.json({ error: "Full cylinder sales not allowed" }, { status: 400 })
            }
            
            await EmployeeInventoryModel.findByIdAndUpdate(cylinderInventory._id, updateData)
            console.log(`📋 Stock Update Applied:`, {
              productName: product.name,
              updateData: updateData,
              cylinderStatus: item.cylinderStatus,
              isDepositSale: item.cylinderStatus === 'full' ? (item.saleType === 'deposit' || 
                                   (item.notes && item.notes.toLowerCase().includes('deposit')) ||
                                   (savedSale.paymentMethod === 'deposit') ||
                                   (savedSale.paymentMethod === 'credit' && savedSale.paymentStatus === 'pending') ||
                                   (savedSale.notes && savedSale.notes.toLowerCase().includes('deposit')) ||
                                   (notes && notes.toLowerCase().includes('deposit')) ||
                                   (paymentMethod === 'deposit') ||
                                   (paymentMethod === 'credit' && paymentStatus === 'pending')) : false
            })
          } else {
            console.error(`❌ ERROR: No cylinder inventory found for employee ${employeeId} and product ${item.product}`)
            console.error(`Available inventory items:`, await EmployeeInventoryModel.find({ employee: employeeId }).populate('product', 'name'))
            
            // Try to create inventory record from stock assignment if it exists
            const stockAssignment = await StockAssignmentModel.findOne({
              employee: employeeId,
              product: item.product,
              status: { $in: ['assigned', 'received'] },
              remainingQuantity: { $gte: item.quantity }
            })
            
            if (stockAssignment) {
              console.log(`🔄 Creating inventory record from stock assignment for ${product.name}`)
              const newInventory = new EmployeeInventoryModel({
                employee: employeeId,
                product: item.product,
                currentStock: item.quantity, // Will be reduced to 0 after this sale
                availableEmpty: item.cylinderStatus === 'empty' ? item.quantity : 0,
                availableFull: item.cylinderStatus === 'full' ? item.quantity : 0,
                leastPrice: stockAssignment.leastPrice || 0,
                category: stockAssignment.displayCategory || product.category,
                transactions: [{
                  type: 'initial',
                  quantity: item.quantity,
                  date: new Date(),
                  notes: `Created from stock assignment for sale - Invoice: ${invoiceNumber}`
                }]
              })
              
              await newInventory.save()
              
              // Now apply the sale deduction
              const updateData = {
                $inc: { currentStock: -item.quantity },
                $push: {
                  transactions: {
                    type: 'sale',
                    quantity: -item.quantity,
                    date: new Date(),
                    notes: `Cylinder Sale - Invoice: ${invoiceNumber}`
                  }
                }
              }
              
              if (item.cylinderStatus === 'empty') {
                updateData.$inc.availableEmpty = -item.quantity
              } else if (item.cylinderStatus === 'full') {
                updateData.$inc.availableFull = -item.quantity
              }
              
              await EmployeeInventoryModel.findByIdAndUpdate(newInventory._id, updateData)
              console.log(`✅ Created and updated inventory for ${product.name}`)
            }
          }
          
          // Update empty cylinder StockAssignment only
          const cylinderAssignment = await StockAssignmentModel.findOne({
            employee: employeeId,
            product: item.product,
            status: { $in: ['assigned', 'received'] },
            displayCategory: 'Empty Cylinder',
            remainingQuantity: { $gte: item.quantity }
          })
          
          if (cylinderAssignment) {
            cylinderAssignment.remainingQuantity = Math.max(0, (cylinderAssignment.remainingQuantity || 0) - item.quantity)
            await cylinderAssignment.save()
            console.log(`✅ Empty Cylinder assignment updated: remaining ${cylinderAssignment.remainingQuantity}`)
          } else {
            console.error(`❌ ERROR: No Empty Cylinder stock assignment found - Employee: ${employeeId}, Product: ${item.product}`)
            console.error(`Available assignments:`, await StockAssignmentModel.find({ employee: employeeId }).populate('product', 'name'))
          }
          
          // Final validation: Check if stock was actually deducted
          const postSaleInventory = await EmployeeInventoryModel.findOne({
            employee: employeeId,
            product: item.product
          })
          
          if (postSaleInventory) {
            console.log(`📋 POST-SALE INVENTORY CHECK for ${product.name}:`, {
              currentStock: postSaleInventory.currentStock,
              availableEmpty: postSaleInventory.availableEmpty,
              availableFull: postSaleInventory.availableFull,
              lastTransaction: postSaleInventory.transactions[postSaleInventory.transactions.length - 1]
            })
          } else {
            console.error(`❌ CRITICAL: No inventory record found after sale for ${product.name}`)
          }
        } else {
          // Handle other products (regular stock deduction from employee inventory)
          const employeeInventory = await EmployeeInventoryModel.findOne({
            employee: employeeId,
            product: item.product
          })
          
          if (employeeInventory) {
            await EmployeeInventoryModel.findByIdAndUpdate(employeeInventory._id, {
              $inc: { currentStock: -item.quantity },
              $push: {
                transactions: {
                  type: 'sale',
                  quantity: -item.quantity,
                  date: new Date(),
                  notes: `Sale - Invoice: ${invoiceNumber}`
                }
              }
            })
            
            // Update StockAssignment
            const stockAssignment = await StockAssignmentModel.findOne({
              employee: employeeId,
              product: item.product,
              status: { $in: ['assigned', 'received'] },
              remainingQuantity: { $gte: item.quantity }
            })
            
            if (stockAssignment) {
              stockAssignment.remainingQuantity = Math.max(0, (stockAssignment.remainingQuantity || 0) - item.quantity)
              await stockAssignment.save()
            }
            
            console.log(`✅ Updated employee inventory for ${product.name}: reduced by ${item.quantity}`)
          }
        }
      }
    }

    // Populate the response
    const populatedSale = await EmployeeSale.findById(savedSale._id)
      .populate("customer", "name email phone")
      .populate("items.product", "name category cylinderSize costPrice leastPrice")
      .populate("employee", "name email")

    console.log("Employee sale created successfully:", populatedSale.invoiceNumber)
    return NextResponse.json(populatedSale, { status: 201 })
  } catch (error) {
    console.error("Error creating employee sale:", error)
    return NextResponse.json({ error: "Failed to create employee sale" }, { status: 500 })
  }
}