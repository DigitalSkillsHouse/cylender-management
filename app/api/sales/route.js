import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import Sale from "@/models/Sale"
import Customer from "@/models/Customer"
import Product from "@/models/Product"
import Counter from "@/models/Counter"

export async function GET() {
  try {
    await dbConnect()

    const sales = await Sale.find()
      .populate("customer", "name phone address email trNumber")
      .populate("items.product", "name price category cylinderSize costPrice leastPrice")
      .sort({ createdAt: -1 })

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
    const { customer, items, totalAmount, paymentMethod, paymentStatus, receivedAmount, notes } = body

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

    console.log(`Product validation:`, {
      totalItems: items.length,
      productIds: productIds,
      uniqueProductIds: uniqueProductIds,
      foundProducts: products.length,
      expectedProducts: uniqueProductIds.length
    })

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
      console.log(`Checking stock for item:`, {
        productId: item.product,
        productName: product?.name,
        category: product?.category,
        cylinderStatus: item.cylinderStatus,
        quantity: item.quantity
      })
      
      if (product) {
        let availableStock = 0
        let stockType = ''
        
        if (product.category === 'cylinder') {
          // For cylinders, check inventory availability based on status
          const inventoryItem = await InventoryItem.findOne({ product: item.product })
          console.log(`Inventory item found:`, {
            inventoryItem: inventoryItem ? {
              availableEmpty: inventoryItem.availableEmpty,
              availableFull: inventoryItem.availableFull,
              currentStock: inventoryItem.currentStock
            } : null
          })
          
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
            console.log(`No inventory item found for gas product ${product.name}, creating one...`)
            try {
              inventoryItem = await InventoryItem.create({
                product: item.product,
                category: 'gas',
                currentStock: product.currentStock || 0,
                availableEmpty: 0,
                availableFull: 0,
              })
              console.log(`Created inventory item for ${product.name} with stock: ${inventoryItem.currentStock}`)
            } catch (createError) {
              console.error(`Failed to create inventory item for ${product.name}:`, createError)
              // Fallback to product stock
              availableStock = product.currentStock || 0
              stockType = 'Gas (fallback)'
            }
          }
          
          if (inventoryItem) {
            console.log(`Gas inventory item found for ${product.name}:`, {
              currentStock: inventoryItem.currentStock,
              productId: inventoryItem.product,
              productName: product.name
            })
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
        
        console.log(`Stock check result:`, {
          availableStock,
          requiredStock: item.quantity,
          stockType,
          sufficient: availableStock >= item.quantity
        })
        
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
          console.log(`Auto-determining cylinder for gas: ${gasName}`)
          
          // Find matching cylinder product based on gas name
          const matchingCylinder = products.find(p => 
            p.category === 'cylinder' && 
            gasName.toLowerCase().includes(p.name.toLowerCase().replace('cylinder', '').replace('cylinders', '').trim())
          )
          
          if (matchingCylinder) {
            enrichedItem.cylinderProductId = matchingCylinder._id
            enrichedItem.cylinderName = matchingCylinder.name
            console.log(`Found matching cylinder: ${matchingCylinder.name} for gas: ${gasName}`)
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
                console.log(`Found cylinder by word match: ${cylinder.name} for gas: ${gasName} (word: ${word})`)
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
    const sale = new Sale({
      invoiceNumber,
      customer,
      items: enrichedItems,
      totalAmount,
      paymentMethod: paymentMethod || "cash",
      paymentStatus: paymentStatus || "cleared",
      receivedAmount: receivedAmount || 0,
      notes: notes || "",
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
          console.log(`Duplicate invoice number ${invoiceNumber}, generating new one (attempt ${attempts})...`)
          
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
      const saleDate = savedSale.createdAt ? new Date(savedSale.createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
      
      console.log(`[Daily Sales Tracking] Processing ${items.length} items for date: ${saleDate}`)
      
      for (const item of items) {
        const product = products.find(p => p._id.toString() === item.product)
        if (!product) continue
        
        const quantity = Number(item.quantity) || 0
        const amount = Number(item.price) * quantity
        
        if (quantity <= 0) continue
        
        console.log(`[Daily Sales Tracking] Processing: ${product.name}, Category: ${item.category || product.category}, Status: ${item.cylinderStatus}, Qty: ${quantity}`)
        
        // Determine the type of sale and update accordingly
        if (product.category === 'gas' || item.category === 'gas') {
          // Gas Sales
          await DailySales.findOneAndUpdate(
            {
              date: saleDate,
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
          console.log(`✅ Gas sale tracked: ${product.name} - ${quantity} units`)
          
        } else if (product.category === 'cylinder' || item.category === 'cylinder') {
          // Cylinder Sales - distinguish between Full and Empty
          if (item.cylinderStatus === 'full') {
            // Full Cylinder Sales
            await DailySales.findOneAndUpdate(
              {
                date: saleDate,
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
            console.log(`✅ Full cylinder sale tracked: ${product.name} - ${quantity} units`)
            
          } else if (item.cylinderStatus === 'empty') {
            // Empty Cylinder Sales
            await DailySales.findOneAndUpdate(
              {
                date: saleDate,
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
            console.log(`✅ Empty cylinder sale tracked: ${product.name} - ${quantity} units`)
            
          } else {
            // Default cylinder sales (assume full if not specified)
            await DailySales.findOneAndUpdate(
              {
                date: saleDate,
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
            console.log(`✅ Default cylinder sale tracked as full: ${product.name} - ${quantity} units`)
          }
        }
      }
      
      console.log(`✅ Daily sales tracking completed for ${items.length} items`)
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
            console.log(`🔄 GAS SALE: Processing ${item.quantity} units of ${product.name}`)
            
            // Update gas inventory - decrease gas stock
            const gasInventory = await InventoryItem.findOne({ product: item.product })
            if (gasInventory) {
              await InventoryItem.findByIdAndUpdate(gasInventory._id, {
                $inc: { currentStock: -item.quantity },
                lastUpdatedAt: new Date()
              })
              console.log(`✅ Gas inventory updated: ${product.name} decreased by ${item.quantity}`)
            }
            
            // Find related cylinder from cylinderProductId (set by frontend)
            console.log(`🔍 Gas sale - checking for cylinder: cylinderProductId = ${item.cylinderProductId}`)
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
                console.log(`✅ Cylinder conversion: ${cylinderProduct?.name || 'Cylinder'} - ${item.quantity} moved from Full to Empty`)
                
                // Record BOTH gas sale AND cylinder usage in daily sales tracking for DSR
                try {
                  const saleDate = savedSale.createdAt ? new Date(savedSale.createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
                  const DailySales = (await import('@/models/DailySales')).default
                  
                  await DailySales.findOneAndUpdate(
                    {
                      date: saleDate,
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
                        // Record gas sales (gas was sold to customer)
                        gasSalesQuantity: item.quantity,
                        gasSalesAmount: Number(item.price) * Number(item.quantity),
                        // Record cylinder transactions (customer brought empty, took full)
                        fullCylinderSalesQuantity: item.quantity,  // Customer took full cylinder
                        // Note: Don't increment emptyCylinderSalesQuantity here as customer returned empty (not sold empty)
                        // The DSR should show this as cylinder usage, not cylinder sales
                      }
                    },
                    { upsert: true, new: true }
                  )
                  
                  console.log(`✅ Gas sale + cylinder usage recorded in daily sales tracking for ${cylinderProduct?.name}: ${item.quantity} units gas, ${item.quantity} cylinders used`)
                  console.log(`🔧 Daily sales record updated:`, {
                    date: saleDate,
                    productId: item.cylinderProductId,
                    productName: cylinderProduct?.name,
                    gasSalesQuantity: item.quantity,
                    fullCylinderSalesQuantity: item.quantity
                  })
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
                console.log(`✅ Empty cylinder sale: ${product.name} decreased by ${item.quantity}`)
              } else if (item.cylinderStatus === 'full') {
                // Selling full cylinders - only decrease availableFull (customer takes cylinder away)
                await InventoryItem.findByIdAndUpdate(cylinderInventory._id, {
                  $inc: { 
                    availableFull: -item.quantity
                    // Don't add to availableEmpty - customer takes the cylinder
                  },
                  lastUpdatedAt: new Date()
                })
                console.log(`✅ Full cylinder sale: ${product.name} - ${item.quantity} full cylinders sold (customer takes cylinder)`)
                
                // Note: Full cylinder sale already recorded in daily sales tracking loop above
                // No need to record again here to avoid double increment
                
                // Also deduct gas stock since full cylinder contains gas
                // Try multiple ways to find the gas product ID
                let gasProductId = item.gasProductId || item.gasProduct
                
                console.log(`🔍 Full cylinder sale - finding gas for: "${product.name}"`)
                console.log(`🔍 Available products:`, products.map(p => ({
                  id: p._id.toString(),
                  name: p.name,
                  category: p.category,
                  cylinderSize: p.cylinderSize,
                  currentStock: p.currentStock
                })))
                
                // If no explicit gas product ID, try to find a matching gas product by name similarity
                if (!gasProductId) {
                  console.log(`🔍 No gasProductId found, searching for gas by name similarity`)
                  
                  // Extract key words from cylinder name for matching
                  const cylinderName = product.name.toLowerCase()
                  const keyWords = cylinderName
                    .replace(/cylinder|cylinders/g, '') // Remove "cylinder" words
                    .replace(/\d+/g, '') // Remove numbers
                    .split(/\s+/) // Split by spaces
                    .filter(word => word.length > 2) // Keep words longer than 2 chars
                  
                  console.log(`🔍 Cylinder name: "${product.name}", Key words: [${keyWords.join(', ')}]`)
                  
                  // Find gas products that contain any of these key words
                  const matchingGasProducts = products.filter(p => {
                    if (p.category !== 'gas' || (p.currentStock || 0) <= 0) return false
                    
                    const gasName = p.name.toLowerCase()
                    return keyWords.some(word => gasName.includes(word))
                  })
                  
                  console.log(`🔍 Found ${matchingGasProducts.length} matching gas products:`, 
                    matchingGasProducts.map(p => ({ name: p.name, stock: p.currentStock })))
                  
                  if (matchingGasProducts.length > 0) {
                    // Prefer gas with same cylinder size, or pick the first one
                    let selectedGas = matchingGasProducts.find(p => p.cylinderSize === product.cylinderSize) || matchingGasProducts[0]
                    gasProductId = selectedGas._id.toString()
                    console.log(`🎯 Auto-selected gas product: ${selectedGas.name} (${gasProductId})`)
                  }
                }
                
                // If still no match, try by cylinder size
                if (!gasProductId && product.cylinderSize) {
                  console.log(`🔍 Still no match, trying by cylinder size: ${product.cylinderSize}`)
                  const matchingGasProducts = products.filter(p => 
                    p.category === 'gas' && 
                    p.cylinderSize === product.cylinderSize &&
                    (p.currentStock || 0) > 0
                  )
                  if (matchingGasProducts.length > 0) {
                    gasProductId = matchingGasProducts[0]._id.toString()
                    console.log(`🎯 Auto-selected gas product by size: ${matchingGasProducts[0].name} (${gasProductId})`)
                  }
                }
                
                // If still no gas product found, try to find ANY gas product with stock
                if (!gasProductId) {
                  console.log(`🔍 Still no gasProductId, searching for any gas product with stock`)
                  const anyGasProducts = products.filter(p => 
                    p.category === 'gas' && 
                    (p.currentStock || 0) > 0
                  )
                  if (anyGasProducts.length > 0) {
                    // Sort by stock descending and pick the one with most stock
                    anyGasProducts.sort((a, b) => (b.currentStock || 0) - (a.currentStock || 0))
                    gasProductId = anyGasProducts[0]._id.toString()
                    console.log(`🎯 Auto-selected gas product (any): ${anyGasProducts[0].name} (${gasProductId})`)
                  }
                }
                
                console.log(`🔍 Gas deduction check:`, {
                  itemGasProductId: item.gasProductId,
                  itemGasProduct: item.gasProduct,
                  finalGasProductId: gasProductId,
                  cylinderSize: product.cylinderSize,
                  availableGasProducts: products.filter(p => p.category === 'gas').map(p => ({
                    id: p._id.toString(),
                    name: p.name,
                    cylinderSize: p.cylinderSize,
                    currentStock: p.currentStock
                  }))
                })
                
                if (gasProductId) {
                  const gasInventory = await InventoryItem.findOne({ product: gasProductId })
                  console.log(`🔍 Gas inventory found:`, gasInventory ? {
                    productId: gasInventory.product,
                    currentStock: gasInventory.currentStock
                  } : 'Not found')
                  
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
                      console.log(`✅ Gas stock deducted: ${gasProduct.name} decreased by ${item.quantity} (from full cylinder sale)`)
                      
                      // NOTE: Do NOT record gas sales for direct full cylinder sales
                      // Full cylinder sales should only show in "Full Cyl Sales" column, not "Gas Sales"
                      // Gas sales are only recorded when:
                      // 1. Gas is sold separately (category === 'gas')
                      // 2. Gas is sold with cylinder refill (customer brings empty, takes full)
                      // When a full cylinder is sold directly, it's just a cylinder sale, not a gas sale
                    }
                  } else {
                    console.log(`❌ Gas inventory not found for product ID: ${gasProductId}`)
                  }
                } else {
                  console.log(`❌ No gas product found to deduct for full cylinder: ${product.name}`)
                  console.log(`❌ Available gas products:`, products.filter(p => p.category === 'gas').map(p => ({
                    id: p._id.toString(),
                    name: p.name,
                    currentStock: p.currentStock,
                    cylinderSize: p.cylinderSize
                  })))
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
            console.log(`✅ Updated ${product.name} stock from ${product.currentStock} to ${newStock}`)
          }
        }
      }
    } catch (stockError) {
      console.error("❌ Failed to update inventory after sale:", stockError)
      // Note: Sale is already created, but inventory update failed
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