import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import Sale from "@/models/Sale"
import Customer from "@/models/Customer"
import Product from "@/models/Product"
import Counter from "@/models/Counter"
import { normalizeAdminEntryDate, recalculateAdminDailyStockReportsFrom } from "@/lib/admin-backdated-sync"

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
    const mode = searchParams.get("mode")
    const limitParam = Number(searchParams.get("limit") || 0)
    const isListMode = mode === "list"
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 0

    let salesQuery = Sale.find()
      .sort({ createdAt: -1 })
      .lean()

    if (isListMode) {
      salesQuery = salesQuery
        .select("invoiceNumber customer items totalAmount paymentMethod paymentStatus receivedAmount notes lpoNo customerSignature saleDate createdAt updatedAt")
        .populate("customer", "name phone address trNumber")
        .populate("items.product", "name category cylinderSize")
    } else {
      salesQuery = salesQuery
        .populate("customer", "name phone address email trNumber")
        .populate("items.product", "name price category cylinderSize")
    }

    if (limit > 0) {
      salesQuery = salesQuery.limit(limit)
    }

    const sales = await salesQuery

    if (shouldLogTiming) {
      console.info(`[route-timing] GET /api/sales mode=${isListMode ? "list" : "full"} durationMs=${Date.now() - startedAt}`)
    }

    return NextResponse.json({ data: sales })
  } catch (error) {
    console.error("Sales GET error:", error)
    return NextResponse.json({ error: "Failed to fetch sales" }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    await dbConnect()

    const body = await request.json()
    const { customer, items, totalAmount, deliveryCharges, paymentMethod, paymentStatus, receivedAmount, notes, saleDate, lpoNo, customerSignature } = body
    const selectedSaleDate = normalizeAdminEntryDate(saleDate)

    // Validate required fields
    if (!customer || !items || items.length === 0 || !totalAmount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Verify customer exists
    const customerDoc = await Customer.findById(customer)
    if (!customerDoc) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }

    // Verify all products exist and get their details
    const productIds = items.map((item) => item.product)
    const uniqueProductIds = [...new Set(productIds)] // Remove duplicates for validation
    const products = await Product.find({ _id: { $in: uniqueProductIds } })
    if (products.length !== uniqueProductIds.length) {
      console.error(`Product validation failed:`, {
        foundProducts: products.map(p => ({ id: p._id.toString(), name: p.name })),
        requestedProductIds: uniqueProductIds,
        missingProductIds: uniqueProductIds.filter(id => !products.find(p => p._id.toString() === id))
      })
      return NextResponse.json({ error: "One or more products not found" }, { status: 404 })
    }

    // Check if there's enough stock for all items
    const InventoryItem = (await import('@/models/InventoryItem')).default
    
    for (const item of items) {
      const product = products.find(p => p._id.toString() === item.product)
      if (product) {
        let availableStock = 0
        let stockType = ''
        
        if (product.category === 'cylinder') {
          // For cylinders, check inventory availability based on status
          const inventoryItem = await InventoryItem.findOne({ product: item.product })
          if (item.cylinderStatus === 'empty') {
            availableStock = inventoryItem?.availableEmpty || 0
            stockType = 'Empty Cylinders'
          } else if (item.cylinderStatus === 'full') {
            availableStock = inventoryItem?.availableFull || 0
            stockType = 'Full Cylinders'
          } else {
            // Default to currentStock for other statuses
            availableStock = product.currentStock || 0
            stockType = 'Cylinders'
          }
        } else if (product.category === 'gas') {
          // For gas products, check inventory availability from InventoryItem
          let inventoryItem = await InventoryItem.findOne({ product: item.product })
          
          // If no inventory item exists, create one with current stock from Product model
          if (!inventoryItem) {
            try {
              inventoryItem = await InventoryItem.create({
                product: item.product,
                category: 'gas',
                currentStock: product.currentStock || 0,
                availableEmpty: 0,
                availableFull: 0,
              })
            } catch (createError) {
              console.error(`Failed to create inventory item for ${product.name}:`, createError)
              // Fallback to product stock
              availableStock = product.currentStock || 0
              stockType = 'Gas (fallback)'
            }
          }
          
          if (inventoryItem) {
            availableStock = inventoryItem.currentStock || 0
          } else {
            availableStock = product.currentStock || 0
          }
          stockType = 'Gas'
        } else {
          // For other products, use currentStock from Product model
          availableStock = product.currentStock || 0
          stockType = 'Stock'
        }
        if (availableStock < item.quantity) {
          return NextResponse.json({ 
            error: `Insufficient ${stockType} for ${product.name}. Available: ${availableStock}, Required: ${item.quantity}` 
          }, { status: 400 })
        }
      }
    }

    // Generate sequential invoice number using centralized generator
    const { getNextInvoiceNumberWithRetry } = await import('@/lib/invoice-generator')
    const invoiceNumber = await getNextInvoiceNumberWithRetry()

    // Enrich items with category, cylinderSize, cylinderStatus, and cylinder/gas linking
    const enrichedItems = (items || []).map((item) => {
      const prod = products.find(p => p._id.toString() === String(item.product))
      const category = prod?.category || item.category || 'gas'
      const cylinderSize = category === 'cylinder' ? (prod?.cylinderSize || item.cylinderSize) : undefined
      
      const enrichedItem = {
        product: item.product,
        category,
        cylinderSize,
        cylinderStatus: item.cylinderStatus, // Include cylinderStatus for conversion tracking
        quantity: Number(item.quantity) || 0,
        price: Number(item.price) || 0,
        total: Number(item.total) || ((Number(item.price)||0) * (Number(item.quantity)||0)),
      }
      
      // Add cylinder information for gas sales (for DSR tracking)
      if (category === 'gas') {
        if (item.cylinderProductId) {
          // Use provided cylinder info
          enrichedItem.cylinderProductId = item.cylinderProductId
          enrichedItem.cylinderName = item.cylinderName || 'Unknown Cylinder'
        } else {
          // Auto-determine cylinder based on gas name
          const gasName = prod?.name || ''
          // Find matching cylinder product based on gas name
          const matchingCylinder = products.find(p => 
            p.category === 'cylinder' && 
            gasName.toLowerCase().includes(p.name.toLowerCase().replace('cylinder', '').replace('cylinders', '').trim())
          )
          
          if (matchingCylinder) {
            enrichedItem.cylinderProductId = matchingCylinder._id
            enrichedItem.cylinderName = matchingCylinder.name
          } else {
            // Try reverse matching - check if any cylinder name contains the gas name parts
            const gasWords = gasName.toLowerCase().split(' ').filter(word => 
              word.length > 2 && !['gas', 'kg', 'lb'].includes(word)
            )
            
            for (const word of gasWords) {
              const cylinder = products.find(p => 
                p.category === 'cylinder' && 
                p.name.toLowerCase().includes(word)
              )
              if (cylinder) {
                enrichedItem.cylinderProductId = cylinder._id
                enrichedItem.cylinderName = cylinder.name
                break
              }
            }
          }
        }
      }
      
      // Add gas information for cylinder sales (for DSR tracking)
      if (category === 'cylinder' && item.gasProductId) {
        enrichedItem.gasProductId = item.gasProductId
      }
      
      return enrichedItem
    })

    // Create the sale
    // Truncate to 2 decimal places (exact calculation, no rounding)
    const roundedTotalAmount = Math.trunc((Number(totalAmount) || 0) * 100) / 100
    const roundedReceivedAmount = Math.trunc((Number(receivedAmount) || 0) * 100) / 100
    const roundedDeliveryCharges = Math.trunc((Number(deliveryCharges) || 0) * 100) / 100
    
    const sale = new Sale({
      invoiceNumber,
      customer,
      items: enrichedItems,
      totalAmount: roundedTotalAmount,
      saleDate: selectedSaleDate,
      deliveryCharges: roundedDeliveryCharges,
      paymentMethod: paymentMethod || "cash",
      paymentStatus: paymentStatus || "cleared",
      receivedAmount: roundedReceivedAmount,
      notes: notes || "",
      lpoNo: String(lpoNo || "").trim(),
      customerSignature: customerSignature || "",
    })

    // Try to save with retry logic for duplicate key errors
    let savedSale = null
    let attempts = 0
    const maxAttempts = 5
    
    while (!savedSale && attempts < maxAttempts) {
      try {
        await sale.save()
        savedSale = sale
        break
      } catch (saveError) {
        attempts++
        
        // Handle duplicate key error by generating a new invoice number
        if (saveError.code === 11000) {
          // Generate a new invoice number with timestamp to ensure uniqueness
          const timestamp = Date.now().toString().slice(-4)
          const newInvoiceNumber = `${nextNumber.toString().padStart(4, '0')}-${timestamp}`
          sale.invoiceNumber = newInvoiceNumber
          nextNumber++
        } else {
          throw saveError
        }
      }
    }
    
    if (!savedSale) {
      throw new Error(`Failed to save sale after ${maxAttempts} attempts`)
    }

    // Create comprehensive daily sales tracking records for DSR
    try {
      const DailySales = (await import('@/models/DailySales')).default
      // Use local date instead of UTC to ensure correct date assignment
      const trackedSaleDate = normalizeAdminEntryDate(savedSale.saleDate || selectedSaleDate)
      for (const item of items) {
        const product = products.find(p => p._id.toString() === item.product)
        if (!product) continue
        
        const quantity = Number(item.quantity) || 0
        const amount = Number(item.price) * quantity
        
        if (quantity <= 0) continue
        // Determine the type of sale and update accordingly
        if (product.category === 'gas' || item.category === 'gas') {
          // Gas Sales
          // Only create gas product record if there's NO cylinderProductId
          // If cylinderProductId exists, gas sales will be recorded under the cylinder product instead
          // This prevents double counting in DSR
          if (!item.cylinderProductId) {
          await DailySales.findOneAndUpdate(
            {
              date: trackedSaleDate,
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
          
        } else if (product.category === 'cylinder' || item.category === 'cylinder') {
          // Cylinder Sales - distinguish between Full and Empty
          if (item.cylinderStatus === 'full') {
            // Full Cylinder Sales
            await DailySales.findOneAndUpdate(
              {
                date: trackedSaleDate,
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
          } else if (item.cylinderStatus === 'empty') {
            // Empty Cylinder Sales
            await DailySales.findOneAndUpdate(
              {
                date: trackedSaleDate,
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
          } else {
            // Default cylinder sales (assume full if not specified)
            await DailySales.findOneAndUpdate(
              {
                date: trackedSaleDate,
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
          }
        }
      }
    } catch (dailyTrackingError) {
      console.error(`❌ Error in daily sales tracking:`, dailyTrackingError)
      // Don't fail the sale if daily tracking fails
    }

    // Handle inventory updates for gas sales with cylinder conversion logic
    try {
      const InventoryItem = (await import('@/models/InventoryItem')).default
      
      for (const item of items) {
        const product = products.find(p => p._id.toString() === item.product)
        if (product) {
          
          if (product.category === 'gas') {
            // Update gas inventory - decrease gas stock
            const gasInventory = await InventoryItem.findOne({ product: item.product })
            if (gasInventory) {
              await InventoryItem.findByIdAndUpdate(gasInventory._id, {
                $inc: { currentStock: -item.quantity },
                lastUpdatedAt: new Date()
              })
            }
            
            // Find related cylinder from cylinderProductId (set by frontend)
            if (item.cylinderProductId) {
              const cylinderInventory = await InventoryItem.findOne({ product: item.cylinderProductId })
              if (cylinderInventory) {
                // Move cylinders from Full to Empty
                await InventoryItem.findByIdAndUpdate(cylinderInventory._id, {
                  $inc: { 
                    availableFull: -item.quantity,
                    availableEmpty: item.quantity 
                  },
                  lastUpdatedAt: new Date()
                })
                
                // Load cylinder product separately since it might not be in the sale items
                const cylinderProduct = await Product.findById(item.cylinderProductId)
                // Record ONLY gas sale in daily sales tracking for DSR
                // When gas is sold, it should NOT increment fullCylinderSalesQuantity
                // Full cylinder sales should only be recorded when a full cylinder is sold directly
                try {
                  // Use local date instead of UTC to ensure correct date assignment
                  const trackedSaleDate = normalizeAdminEntryDate(savedSale.saleDate || selectedSaleDate)
                  const DailySales = (await import('@/models/DailySales')).default
                  
                  await DailySales.findOneAndUpdate(
                    {
                      date: trackedSaleDate,
                      productId: item.cylinderProductId
                    },
                    {
                      $set: {
                        productName: cylinderProduct?.name || 'Unknown Cylinder',
                        category: 'cylinder',
                        cylinderProductId: item.cylinderProductId,
                        cylinderName: cylinderProduct?.name || 'Unknown Cylinder'
                      },
                      $inc: {
                        // Record ONLY gas sales (gas was sold to customer)
                        // Do NOT record fullCylinderSalesQuantity here - that's only for direct full cylinder sales
                        gasSalesQuantity: item.quantity,
                        gasSalesAmount: Number(item.price) * Number(item.quantity)
                      }
                    },
                    { upsert: true, new: true }
                  )
                } catch (error) {
                  console.error(`❌ Error recording gas sale + cylinder usage in daily sales tracking:`, error)
                  console.error(`❌ Error details:`, {
                    message: error.message,
                    cylinderProductId: item.cylinderProductId,
                    cylinderProductName: cylinderProduct?.name
                  })
                }
              }
            }
            
            // Also update Product model for backward compatibility
            await Product.findByIdAndUpdate(item.product, {
              currentStock: Math.max(0, product.currentStock - item.quantity)
            })
            
          } else if (product.category === 'cylinder') {
            // Handle cylinder sales - update inventory based on status
            const cylinderInventory = await InventoryItem.findOne({ product: item.product })
            if (cylinderInventory) {
              if (item.cylinderStatus === 'empty') {
                // Selling empty cylinders - decrease availableEmpty
                await InventoryItem.findByIdAndUpdate(cylinderInventory._id, {
                  $inc: { availableEmpty: -item.quantity },
                  lastUpdatedAt: new Date()
                })
              } else if (item.cylinderStatus === 'full') {
                // Selling full cylinders - only decrease availableFull (customer takes cylinder away)
                await InventoryItem.findByIdAndUpdate(cylinderInventory._id, {
                  $inc: { 
                    availableFull: -item.quantity
                    // Don't add to availableEmpty - customer takes the cylinder
                  },
                  lastUpdatedAt: new Date()
                })
                // Note: Full cylinder sale already recorded in daily sales tracking loop above
                // No need to record again here to avoid double increment
                
                // Also deduct gas stock since full cylinder contains gas
                // Try multiple ways to find the gas product ID
                let gasProductId = item.gasProductId || item.gasProduct
                // If no explicit gas product ID, try to find a matching gas product by name similarity
                if (!gasProductId) {
                  // Extract key words from cylinder name for matching
                  const cylinderName = product.name.toLowerCase()
                  const keyWords = cylinderName
                    .replace(/cylinder|cylinders/g, '') // Remove "cylinder" words
                    .replace(/\d+/g, '') // Remove numbers
                    .split(/\s+/) // Split by spaces
                    .filter(word => word.length > 2) // Keep words longer than 2 chars
                  // Find gas products that contain any of these key words
                  const matchingGasProducts = products.filter(p => {
                    if (p.category !== 'gas' || (p.currentStock || 0) <= 0) return false
                    
                    const gasName = p.name.toLowerCase()
                    return keyWords.some(word => gasName.includes(word))
                  })
                  if (matchingGasProducts.length > 0) {
                    // Prefer gas with same cylinder size, or pick the first one
                    let selectedGas = matchingGasProducts.find(p => p.cylinderSize === product.cylinderSize) || matchingGasProducts[0]
                    gasProductId = selectedGas._id.toString()
                  }
                }
                
                // If still no match, try by cylinder size
                if (!gasProductId && product.cylinderSize) {
                  const matchingGasProducts = products.filter(p => 
                    p.category === 'gas' && 
                    p.cylinderSize === product.cylinderSize &&
                    (p.currentStock || 0) > 0
                  )
                  if (matchingGasProducts.length > 0) {
                    gasProductId = matchingGasProducts[0]._id.toString()
                  }
                }
                
                // If still no gas product found, try to find ANY gas product with stock
                if (!gasProductId) {
                  const anyGasProducts = products.filter(p => 
                    p.category === 'gas' && 
                    (p.currentStock || 0) > 0
                  )
                  if (anyGasProducts.length > 0) {
                    // Sort by stock descending and pick the one with most stock
                    anyGasProducts.sort((a, b) => (b.currentStock || 0) - (a.currentStock || 0))
                    gasProductId = anyGasProducts[0]._id.toString()
                  }
                }
                if (gasProductId) {
                  const gasInventory = await InventoryItem.findOne({ product: gasProductId })
                  if (gasInventory) {
                    await InventoryItem.findByIdAndUpdate(gasInventory._id, {
                      $inc: { currentStock: -item.quantity },
                      lastUpdatedAt: new Date()
                    })
                    
                    // Also update gas Product model - load the gas product separately since it's not in the sale items
                    const gasProduct = await Product.findById(gasProductId)
                    if (gasProduct) {
                      await Product.findByIdAndUpdate(gasProductId, {
                        currentStock: Math.max(0, gasProduct.currentStock - item.quantity)
                      })
                      // NOTE: Do NOT record gas sales for direct full cylinder sales
                      // Full cylinder sales should only show in "Full Cyl Sales" column, not "Gas Sales"
                      // Gas sales are only recorded when:
                      // 1. Gas is sold separately (category === 'gas')
                      // 2. Gas is sold with cylinder refill (customer brings empty, takes full)
                      // When a full cylinder is sold directly, it's just a cylinder sale, not a gas sale
                    }
                  } else {
                  }
                } else {
                }
              }
            }
            
            // Also update Product model currentStock for backward compatibility
            const newStock = product.currentStock - item.quantity
            await Product.findByIdAndUpdate(item.product, {
              currentStock: Math.max(0, newStock)
            })
          } else {
            // Handle other products (regular stock deduction)
            const newStock = product.currentStock - item.quantity
            await Product.findByIdAndUpdate(item.product, {
              currentStock: Math.max(0, newStock)
            })
          }
        }
      }
    } catch (stockError) {
      console.error("❌ Failed to update inventory after sale:", stockError)
      // Note: Sale is already created, but inventory update failed
    }

    try {
      const impactedProductNames = Array.from(
        new Set(
          enrichedItems
            .map((item) => {
              if (item.category === "gas") {
                return item.cylinderName || ""
              }
              return products.find((product) => product._id.toString() === String(item.product))?.name || ""
            })
            .filter(Boolean)
        )
      )

      await recalculateAdminDailyStockReportsFrom(selectedSaleDate, {
        productNames: impactedProductNames,
      })
    } catch (syncError) {
      console.error("Failed to recalculate admin DSR after sale:", syncError)
    }

    // Populate the created sale for response
    const populatedSale = await Sale.findById(savedSale._id)
      .populate("customer", "name phone address email trNumber")
      .populate("items.product", "name price category cylinderSize costPrice leastPrice")

    return NextResponse.json({
      data: populatedSale,
      message: "Sale created successfully",
    })
  } catch (error) {
    console.error("Sales POST error:", error)
    console.error("Error stack:", error.stack)
    console.error("Error message:", error.message)
    return NextResponse.json({ 
      error: "Failed to create sale", 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}
