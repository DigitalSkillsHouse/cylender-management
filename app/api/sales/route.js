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

    // Generate sequential invoice number starting from saved setting
    const settings = await Counter.findOne({ key: 'invoice_start' })
    const startingNumber = settings?.seq || 0

    const latestSale = await Sale.findOne({
      invoiceNumber: { $regex: /^\d{4}$/ }
    }).sort({ invoiceNumber: -1 })

    let nextNumber = startingNumber
    if (latestSale) {
      const lastNumber = parseInt(latestSale.invoiceNumber) || (startingNumber - 1)
      nextNumber = Math.max(lastNumber + 1, startingNumber)
    }

    const invoiceNumber = nextNumber.toString().padStart(4, '0')

    // Enrich items with category, cylinderSize, and cylinderStatus from Product model
    const enrichedItems = (items || []).map((item) => {
      const prod = products.find(p => p._id.toString() === String(item.product))
      const category = prod?.category || item.category || 'gas'
      const cylinderSize = category === 'cylinder' ? (prod?.cylinderSize || item.cylinderSize) : undefined
      return {
        product: item.product,
        category,
        cylinderSize,
        cylinderStatus: item.cylinderStatus, // Include cylinderStatus for conversion tracking
        quantity: Number(item.quantity) || 0,
        price: Number(item.price) || 0,
        total: Number(item.total) || ((Number(item.price)||0) * (Number(item.quantity)||0)),
      }
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
                
                const cylinderProduct = products.find(p => p._id.toString() === item.cylinderProductId)
                console.log(`✅ Cylinder conversion: ${cylinderProduct?.name || 'Cylinder'} - ${item.quantity} moved from Full to Empty`)
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
                
                // Also deduct gas stock since full cylinder contains gas
                // Try multiple ways to find the gas product ID
                let gasProductId = item.gasProductId || item.gasProduct
                
                // If no explicit gas product ID, try to find a matching gas product by cylinder size
                if (!gasProductId && product.cylinderSize) {
                  console.log(`🔍 No gasProductId found, searching for gas by cylinder size: ${product.cylinderSize}`)
                  const matchingGasProducts = products.filter(p => 
                    p.category === 'gas' && 
                    p.cylinderSize === product.cylinderSize &&
                    (p.currentStock || 0) > 0
                  )
                  if (matchingGasProducts.length > 0) {
                    gasProductId = matchingGasProducts[0]._id.toString()
                    console.log(`🎯 Auto-selected gas product: ${matchingGasProducts[0].name} (${gasProductId})`)
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
                    
                    // Also update gas Product model
                    const gasProduct = products.find(p => p._id.toString() === gasProductId)
                    if (gasProduct) {
                      await Product.findByIdAndUpdate(gasProductId, {
                        currentStock: Math.max(0, gasProduct.currentStock - item.quantity)
                      })
                      console.log(`✅ Gas stock deducted: ${gasProduct.name} decreased by ${item.quantity} (from full cylinder sale)`)
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