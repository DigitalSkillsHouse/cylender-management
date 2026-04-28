import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmployeeSale from "@/models/EmployeeSale"
import Product from "@/models/Product"
import Customer from "@/models/Customer"
import User from "@/models/User"
import Counter from "@/models/Counter"
import Sale from "@/models/Sale"
import DailyEmployeeSalesAggregation from "@/models/DailyEmployeeSalesAggregation"
import { recalculateEmployeeDailyStockReportsFrom } from "@/lib/employee-dsr-sync"
import { updateEmpGasSalesTracking } from "@/lib/emp-gas-sales-tracker"
import { getLocalDateString, getLocalDateStringFromDate } from "@/lib/date-utils"

// Disable caching for this route - force dynamic rendering
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(request) {
  const startedAt = Date.now()
  const shouldLogTiming = process.env.NODE_ENV === "development" || process.env.LOG_ROUTE_TIMING === "true"
  try {
    await dbConnect()
    
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    const totalsOnly = searchParams.get('totals') === 'true'
    const mode = searchParams.get("mode")
    const limitParam = Number(searchParams.get("limit") || 0)
    const isListMode = mode === "list"
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 0
    
    let query = {}
    if (employeeId) {
      query = { employee: employeeId }
    }
    // If no employeeId provided, fetch all employee sales (for admin panel)

    if (totalsOnly) {
      const [totals] = await EmployeeSale.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalDebit: { $sum: { $ifNull: ["$totalAmount", 0] } },
            totalCredit: { $sum: { $ifNull: ["$receivedAmount", 0] } },
            totalSales: { $sum: 1 },
          },
        },
      ])

      return NextResponse.json({
        data: {
          totalDebit: Number(totals?.totalDebit || 0),
          totalCredit: Number(totals?.totalCredit || 0),
          totalSales: Number(totals?.totalSales || 0),
        },
      })
    }

    let salesQuery = EmployeeSale.find(query)
      .sort({ createdAt: -1 })
      .lean()

    if (isListMode) {
      salesQuery = salesQuery
        .select("invoiceNumber employee customer items totalAmount paymentMethod paymentStatus receivedAmount notes lpoNo customerSignature createdAt updatedAt")
        .populate("customer", "name phone address trNumber")
        .populate("items.product", "name category cylinderSize")
        .populate("employee", "name email")
    } else {
      salesQuery = salesQuery
        .populate("customer", "name email phone address trNumber")
        .populate("items.product", "name category cylinderSize")
        .populate("employee", "name email")
    }

    if (limit > 0) {
      salesQuery = salesQuery.limit(limit)
    }

    const sales = await salesQuery

    if (shouldLogTiming) {
      const scope = employeeId ? "employee" : "all"
      console.info(`[route-timing] GET /api/employee-sales mode=${isListMode ? "list" : "full"} scope=${scope} durationMs=${Date.now() - startedAt}`)
    }

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
    const { employeeId, customer, items, totalAmount, deliveryCharges, paymentMethod, paymentStatus, notes, customerSignature, receivedAmount, lpoNo } = body

    // Validate required fields
    if (!employeeId || !customer || !items || items.length === 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Generate sequential invoice number using centralized generator
    const { getNextInvoiceNumberWithRetry } = await import('@/lib/invoice-generator')
    const invoiceNumber = await getNextInvoiceNumberWithRetry()

    // Validate stock availability and calculate totals
    let calculatedTotal = 0
    const validatedItems = []

    // Get employee's inventory using new system
    const EmployeeInventoryItem = (await import("@/models/EmployeeInventoryItem")).default
    // Fetch employee's available inventory from new system
    const employeeInventoryItems = await EmployeeInventoryItem.find({
      employee: employeeId
    }).populate('product', 'name productCode category costPrice leastPrice cylinderSize')
    // Build employee inventory map using new system
    const employeeStockMap = new Map()
    
    employeeInventoryItems.forEach(item => {
      if (item.product) {
        const key = `${item.product._id}-${item.category}`
        employeeStockMap.set(key, {
          product: item.product,
          currentStock: item.currentStock || 0,
          availableEmpty: item.availableEmpty || 0,
          availableFull: item.availableFull || 0,
          leastPrice: item.product.leastPrice || 0
        })
      }
    })
    for (const item of items) {
      const product = await Product.findById(item.product)
      if (!product) {
        return NextResponse.json({ error: `Product not found: ${item.product}` }, { status: 400 })
      }

      // Find employee's inventory for this product
      const itemCategory = item.category || product.category
      const key = `${item.product}-${itemCategory}`
      if (!employeeStockMap.get(key)) {
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
          if (availableStock < item.quantity) {
            return NextResponse.json({ 
              error: `Insufficient full cylinder stock for ${product.name}. Available: ${availableStock}, Requested: ${item.quantity}` 
            }, { status: 400 })
          }
        } else {
          // Empty cylinder sales - check availableEmpty stock
          availableStock = employeeStockMap.get(key).availableEmpty
          if (availableStock < item.quantity) {
            return NextResponse.json({ 
              error: `Insufficient empty cylinder stock for ${product.name}. Available: ${availableStock}, Requested: ${item.quantity}` 
            }, { status: 400 })
          }
        }
      } else {
        // Gas sales - check currentStock
        availableStock = employeeStockMap.get(key).currentStock
        if (availableStock < item.quantity) {
          return NextResponse.json({ 
            error: `Insufficient stock for ${product.name}. Available: ${availableStock}, Requested: ${item.quantity}` 
          }, { status: 400 })
        }
      }

      // Use price from item if provided, otherwise use least price from employee inventory
      const employeeStock = employeeStockMap.get(key)
      const leastPrice = employeeStock.leastPrice
      // Use the price sent from frontend if provided and valid, otherwise fall back to leastPrice
      const itemPrice = (item.price && Number(item.price) > 0) ? Number(item.price) : leastPrice
      const itemTotal = itemPrice * item.quantity
      calculatedTotal += itemTotal
      // Note: VAT will be added in frontend before sending totalAmount, or we add it here

      // Derive category and cylinder size from product (trust server data)
      const productCategory = product.category || (item.category || 'gas')
      const cylinderSize = productCategory === 'cylinder' ? (product.cylinderSize || 'large') : undefined

      const validatedItem = {
        product: item.product,
        quantity: item.quantity,
        price: itemPrice, // Use the price from frontend (or leastPrice as fallback)
        total: itemTotal,
        category: productCategory,
        cylinderSize: cylinderSize,
        cylinderStatus: item.cylinderStatus || (productCategory === 'cylinder' ? 'empty' : undefined),
        cylinderProductId: item.cylinderProductId,
        gasProductId: item.gasProductId,
      }

      // Add cylinder information for gas sales (for DSR tracking)
      if (productCategory === 'gas' && !item.cylinderProductId) {
        // Auto-determine cylinder based on gas name
        const gasName = product?.name || ''
        // Get all products to find matching cylinder
        const allProducts = await Product.find({ category: 'cylinder' })
        
        // Find matching cylinder product based on gas name
        const matchingCylinder = allProducts.find(p => 
          gasName.toLowerCase().includes(p.name.toLowerCase().replace('cylinder', '').replace('cylinders', '').trim())
        )
        
        if (matchingCylinder) {
          validatedItem.cylinderProductId = matchingCylinder._id
          validatedItem.cylinderName = matchingCylinder.name
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
              break
            }
          }
        }
      }

      validatedItems.push(validatedItem)
    }

    // Create the sale
    // Use totalAmount from frontend if provided (includes VAT), otherwise add VAT to calculatedTotal
    // Truncate to 2 decimal places (exact calculation, no rounding)
    const finalTotalAmount = (totalAmount && Number(totalAmount) > 0) 
      ? Math.trunc(Number(totalAmount) * 100) / 100
      : Math.trunc((calculatedTotal * 1.05) * 100) / 100 // Add 5% VAT if frontend didn't send totalAmount
    const roundedReceivedAmount = Math.trunc((parseFloat(receivedAmount) || 0) * 100) / 100
    const roundedDeliveryCharges = Math.trunc((Number(deliveryCharges) || 0) * 100) / 100
    
    const newSale = new EmployeeSale({
      invoiceNumber,
      employee: employeeId,
      customer,
      items: validatedItems,
      totalAmount: finalTotalAmount, // Store with VAT included (matching admin sales)
      deliveryCharges: roundedDeliveryCharges,
      paymentMethod: paymentMethod || "cash",
      paymentStatus: paymentStatus || "cleared",
      receivedAmount: roundedReceivedAmount,
      notes: notes || "",
      lpoNo: String(lpoNo || "").trim(),
      customerSignature: customerSignature || ""
    })

    const savedSale = await newSale.save()

    // Update Employee DSR tracking (EmpGasSales model) - same as admin DSR
    try {
      await updateEmpGasSalesTracking(savedSale, employeeId)
    } catch (dsrError) {
      console.error(`❌ [EMPLOYEE SALES] Failed to update employee DSR tracking:`, dsrError.message)
      // Don't fail the entire sale if DSR tracking fails
    }

    // Update daily sales aggregation for DSR
    try {
      await updateDailySalesAggregation(savedSale, employeeId)
    } catch (trackingError) {
      console.error(`❌ [EMPLOYEE SALES] Failed to update daily sales aggregation:`, trackingError.message)
      // Don't fail the entire sale if tracking fails
    }

    // Update employee inventory using new system
    for (const item of validatedItems) {
      const product = await Product.findById(item.product)
      if (product) {
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
              // Record employee full cylinder sale in daily tracking system
              try {
                // Use local date instead of UTC to ensure correct date assignment
                const today = getLocalDateString() // YYYY-MM-DD format
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
                const dailyTrackingResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/daily-cylinder-transactions`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(dailyTrackingData)
                })
                
                if (dailyTrackingResponse.ok) {
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
                }
              }
            } else {
              // Selling empty cylinders - decrease availableEmpty
              cylinderInventory.availableEmpty = Math.max(0, (cylinderInventory.availableEmpty || 0) - item.quantity)
              cylinderInventory.lastUpdatedAt = new Date()
              await cylinderInventory.save()
            }
          }
        }
      }
    }
    // Add daily sales tracking for employee DSR (same logic as admin sales)
    try {
      await updateEmployeeDailySalesTracking(savedSale, employeeId)
    } catch (trackingError) {
      console.error(`❌ [EMPLOYEE SALES] Failed to update daily sales tracking:`, trackingError.message)
      // Don't fail the entire sale if tracking fails
    }

    try {
      const affectedDate = getLocalDateStringFromDate(savedSale.createdAt)
      await recalculateEmployeeDailyStockReportsFrom(employeeId, affectedDate)
    } catch (syncError) {
      console.error(`âŒ [EMPLOYEE SALES] Failed to rebuild employee DSR snapshots:`, syncError.message)
    }

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
  // Use local date instead of UTC to ensure correct date assignment
  const saleDate = getLocalDateStringFromDate(sale.createdAt) // YYYY-MM-DD format
  // Process each item in the sale
  for (const item of sale.items) {
    const product = await Product.findById(item.product)
    if (!product) {
      console.warn(`⚠️ [DAILY AGGREGATION] Product not found: ${item.product}`)
      continue
    }
    
    const quantity = Number(item.quantity) || 0
    const revenue = Number(item.price) * quantity || 0
    // Prepare sales data based on category and cylinder status
    let salesData = {}
    
    if (product.category === 'gas') {
      // Gas sales
      salesData = {
        gasSales: quantity,
        gasRevenue: revenue
      }
    } else if (product.category === 'cylinder') {
      // Cylinder sales
      if (item.cylinderStatus === 'full') {
        salesData = {
          fullCylinderSales: quantity,
          fullCylinderRevenue: revenue
        }
      } else {
        salesData = {
          emptyCylinderSales: quantity,
          emptyCylinderRevenue: revenue
        }
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
    } catch (aggregationError) {
      console.error(`❌ [DAILY AGGREGATION] Failed to update aggregation for ${product.name}:`, aggregationError.message)
    }
  }
}

// Helper function to update employee daily sales tracking (same logic as admin sales)
async function updateEmployeeDailySalesTracking(sale, employeeId) {
  // Use local date instead of UTC to ensure correct date assignment
  const saleDate = getLocalDateStringFromDate(sale.createdAt) // YYYY-MM-DD format
  const DailyEmployeeSales = (await import('@/models/DailyEmployeeSales')).default
  // Process each item in the sale
  for (const item of sale.items) {
    const product = await Product.findById(item.product)
    if (!product) {
      console.warn(`⚠️ [EMPLOYEE DAILY SALES] Product not found: ${item.product}`)
      continue
    }
    
    const quantity = Number(item.quantity) || 0
    const amount = Number(item.price) * quantity || 0
    
    if (quantity <= 0) continue
    // Determine the type of sale and update accordingly
    if (product.category === 'gas' || item.category === 'gas') {
      // Gas Sales - record gas sales and handle cylinder conversion
      // Only create gas product record if there's NO cylinderProductId
      // If cylinderProductId exists, gas sales will be recorded under the cylinder product instead
      // This prevents double counting in DSR
      if (!item.cylinderProductId) {
        await DailyEmployeeSales.findOneAndUpdate(
          {
            date: saleDate,
            employeeId: employeeId,
            productId: product._id
          },
          {
            $set: {
              productName: product.name,
              category: 'gas'
            },
            $inc: {
              gasSalesQuantity: quantity,
              gasSalesAmount: amount
            }
          },
          { upsert: true, new: true }
        )
      } else {
      }
      
      // Also record gas sales under cylinder product if cylinderProductId is provided
      // When gas is sold, it should ONLY record gasSalesQuantity, NOT fullCylinderSalesQuantity
      // Full cylinder sales should only be recorded when a full cylinder is sold directly
      if (item.cylinderProductId) {
        const cylinderProduct = await Product.findById(item.cylinderProductId)
        if (cylinderProduct) {
          await DailyEmployeeSales.findOneAndUpdate(
            {
              date: saleDate,
              employeeId: employeeId,
              productId: item.cylinderProductId
            },
            {
              $set: {
                productName: cylinderProduct.name,
                category: 'cylinder',
                cylinderStatus: null
              },
              $inc: {
                // Record ONLY gas sales (gas was sold using this cylinder)
                // Do NOT record fullCylinderSalesQuantity here - that's only for direct full cylinder sales
                gasSalesQuantity: quantity,
                gasSalesAmount: amount
              }
            },
            { upsert: true, new: true }
          )
        }
      }
      
    } else if (product.category === 'cylinder' || item.category === 'cylinder') {
      // Cylinder Sales - distinguish between Full and Empty
      // Check if cylinderStatus is explicitly set, or infer from other indicators
      let isFullCylinder = item.cylinderStatus === 'full'
      
      // If cylinderStatus is not explicitly set to 'full', try to infer it:
      // 1. If gasProductId is present, it's definitely a full cylinder (full cylinders contain gas)
      // 2. Otherwise, default to empty
      if (!isFullCylinder) {
        if (item.gasProductId) {
          // gasProductId presence indicates a full cylinder sale (full cylinders have gas inside)
          isFullCylinder = true
        } else if (!item.cylinderStatus || item.cylinderStatus === '') {
          // No cylinderStatus and no gasProductId - default to empty
          isFullCylinder = false
        } else {
          // cylinderStatus is explicitly set to something other than 'full' (likely 'empty')
          isFullCylinder = false
        }
      }
      
      if (isFullCylinder) {
        // Full Cylinder Sales
        await DailyEmployeeSales.findOneAndUpdate(
          {
            date: saleDate,
            employeeId: employeeId,
            productId: product._id
          },
          {
            $set: {
              productName: product.name,
              category: 'cylinder',
              cylinderStatus: 'full'
            },
            $inc: {
              fullCylinderSalesQuantity: quantity,
              fullCylinderSalesAmount: amount,
              cylinderSalesQuantity: quantity,
              cylinderSalesAmount: amount
            }
          },
          { upsert: true, new: true }
        )
        // NOTE: Do NOT record gas sales for direct full cylinder sales
        // Full cylinder sales should only show in "Full Cyl Sales" column, not "Gas Sales"
        // Gas sales are only recorded when:
        // 1. Gas is sold separately (category === 'gas')
        // 2. Gas is sold with cylinder refill (customer brings empty, takes full)
        // When a full cylinder is sold directly, it's just a cylinder sale, not a gas sale
        
      } else {
        // Empty Cylinder Sales
        await DailyEmployeeSales.findOneAndUpdate(
          {
            date: saleDate,
            employeeId: employeeId,
            productId: product._id
          },
          {
            $set: {
              productName: product.name,
              category: 'cylinder',
              cylinderStatus: 'empty'
            },
            $inc: {
              emptyCylinderSalesQuantity: quantity,
              emptyCylinderSalesAmount: amount,
              cylinderSalesQuantity: quantity,
              cylinderSalesAmount: amount
            }
          },
          { upsert: true, new: true }
        )
      }
    }
  }
}
