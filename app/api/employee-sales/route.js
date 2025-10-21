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

      // Get least price from employee's inventory
      const EmployeeInventory = (await import("@/models/EmployeeInventory")).default
      const employeeInventory = await EmployeeInventory.findOne({
        employee: employeeId,
        product: item.product,
        currentStock: { $gt: 0 }
      })

      if (!employeeInventory) {
        return NextResponse.json({ 
          error: `No inventory found for ${product.name} for this employee` 
        }, { status: 400 })
      }

      // Check specific stock availability for cylinders
      if (item.category === 'cylinder') {
        const availableStock = item.cylinderStatus === 'full' 
          ? (employeeInventory.availableFull || 0)
          : (employeeInventory.availableEmpty || 0)
        
        if (availableStock < item.quantity) {
          const statusLabel = item.cylinderStatus === 'full' ? 'full' : 'empty'
          return NextResponse.json({ 
            error: `Insufficient ${statusLabel} cylinder stock for ${product.name}. Available: ${availableStock}, Requested: ${item.quantity}` 
          }, { status: 400 })
        }
      } else if (employeeInventory.currentStock < item.quantity) {
        return NextResponse.json({ 
          error: `Insufficient stock for ${product.name}. Available: ${employeeInventory.currentStock}, Requested: ${item.quantity}` 
        }, { status: 400 })
      }

      // Use least price from employee inventory
      const leastPrice = employeeInventory.leastPrice
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
    const EmployeeInventory = (await import("@/models/EmployeeInventory")).default
    const StockAssignment = (await import("@/models/StockAssignment")).default
    
    for (const item of validatedItems) {
      const product = await Product.findById(item.product)
      if (product) {
        console.log(`🔄 EMPLOYEE SALE: Processing ${item.quantity} units of ${product.name} (${product.category})`)
        
        if (product.category === 'gas') {
          // Update gas inventory - decrease gas stock from employee inventory
          const gasInventory = await EmployeeInventory.findOne({
            employee: employeeId,
            product: item.product
          })
          
          if (gasInventory) {
            await EmployeeInventory.findByIdAndUpdate(gasInventory._id, {
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
          
          // Also update StockAssignment for employee
          const stockAssignment = await StockAssignment.findOne({
            employee: employeeId,
            product: item.product,
            status: 'received'
          })
          
          if (stockAssignment) {
            stockAssignment.remainingQuantity = Math.max(0, (stockAssignment.remainingQuantity || 0) - item.quantity)
            await stockAssignment.save()
            console.log(`✅ Employee stock assignment updated: remaining ${stockAssignment.remainingQuantity}`)
          }
          
          // Handle cylinder conversion for gas sales (from cylinderProductId)
          if (item.cylinderProductId) {
            const cylinderInventory = await EmployeeInventory.findOne({
              employee: employeeId,
              product: item.cylinderProductId
            })
            
            if (cylinderInventory) {
              // Move cylinders from Full to Empty in employee inventory
              await EmployeeInventory.findByIdAndUpdate(cylinderInventory._id, {
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
              
              // Also update cylinder StockAssignment
              const cylinderAssignment = await StockAssignment.findOne({
                employee: employeeId,
                product: item.cylinderProductId,
                status: 'received'
              })
              
              if (cylinderAssignment) {
                // No change to remainingQuantity for conversions, just log
                console.log(`✅ Cylinder conversion: ${product.name} - ${item.quantity} moved from Full to Empty`)
              }
            }
          }
          
        } else if (product.category === 'cylinder') {
          // Handle cylinder sales - update employee inventory based on status
          const cylinderInventory = await EmployeeInventory.findOne({
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
            
            if (item.cylinderStatus === 'empty') {
              // Selling empty cylinders - decrease availableEmpty
              updateData.$inc.availableEmpty = -item.quantity
              console.log(`✅ Employee empty cylinder sale: ${product.name} decreased by ${item.quantity}`)
            } else if (item.cylinderStatus === 'full') {
              // Selling full cylinders - only decrease availableFull (customer takes cylinder away)
              updateData.$inc.availableFull = -item.quantity
              // Don't add to availableEmpty - customer takes the cylinder
              console.log(`✅ Employee full cylinder sale: ${product.name} - ${item.quantity} full cylinders sold`)
              
              // Also deduct gas stock if gasProductId is provided
              if (item.gasProductId) {
                const gasInventory = await EmployeeInventory.findOne({
                  employee: employeeId,
                  product: item.gasProductId
                })
                
                if (gasInventory) {
                  await EmployeeInventory.findByIdAndUpdate(gasInventory._id, {
                    $inc: { currentStock: -item.quantity },
                    $push: {
                      transactions: {
                        type: 'deduction',
                        quantity: -item.quantity,
                        date: new Date(),
                        notes: `Gas deduction from full cylinder sale - Invoice: ${invoiceNumber}`
                      }
                    }
                  })
                  
                  // Update gas StockAssignment
                  const gasAssignment = await StockAssignment.findOne({
                    employee: employeeId,
                    product: item.gasProductId,
                    status: 'received'
                  })
                  
                  if (gasAssignment) {
                    gasAssignment.remainingQuantity = Math.max(0, (gasAssignment.remainingQuantity || 0) - item.quantity)
                    await gasAssignment.save()
                  }
                  
                  console.log(`✅ Gas stock deducted from employee inventory: ${item.quantity} units`)
                }
              }
            }
            
            await EmployeeInventory.findByIdAndUpdate(cylinderInventory._id, updateData)
            
            // Update cylinder StockAssignment
            const cylinderAssignment = await StockAssignment.findOne({
              employee: employeeId,
              product: item.product,
              status: 'received'
            })
            
            if (cylinderAssignment) {
              cylinderAssignment.remainingQuantity = Math.max(0, (cylinderAssignment.remainingQuantity || 0) - item.quantity)
              await cylinderAssignment.save()
            }
          }
        } else {
          // Handle other products (regular stock deduction from employee inventory)
          const employeeInventory = await EmployeeInventory.findOne({
            employee: employeeId,
            product: item.product
          })
          
          if (employeeInventory) {
            await EmployeeInventory.findByIdAndUpdate(employeeInventory._id, {
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
            const stockAssignment = await StockAssignment.findOne({
              employee: employeeId,
              product: item.product,
              status: 'received'
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