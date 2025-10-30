import dbConnect from "@/lib/mongodb"
import EmpGasSales from "@/models/EmpGasSales"

/**
 * Update employee DSR tracking when a sale is made
 * Similar to admin DSR tracking but employee-specific
 */
export async function updateEmpGasSalesTracking(sale, employeeId) {
  try {
    await dbConnect()
    
    const saleDate = sale.createdAt ? new Date(sale.createdAt) : new Date()
    const dateStr = saleDate.toISOString().split('T')[0] // YYYY-MM-DD
    
    console.log(`📊 [EMP DSR] Starting DSR tracking for employee ${employeeId} on ${dateStr}`)
    
    const items = Array.isArray(sale.items) ? sale.items : []

    for (const item of items) {
      const productId = typeof item.product === 'object' ? item.product._id : item.product
      const productName = typeof item.product === 'object' ? item.product.name : (item.productName || 'Unknown Product')
      const category = typeof item.product === 'object' ? item.product.category : (item.category || 'unknown')
      const quantity = Number(item.quantity) || 0
      const amount = Number(item.total) || (Number(item.price) * quantity) || 0
      const cylinderStatus = item.cylinderStatus

      if (!productId || quantity <= 0) {
        console.log(`📊 [EMP DSR] Skipping invalid item: productId=${productId}, quantity=${quantity}`)
        continue
      }

      console.log(`📊 [EMP DSR] Processing item: ${productName} (${category}), Qty: ${quantity}, Amount: ${amount}`)

      // Find or create DSR record for this employee-product-date combination
      const filter = {
        employeeId: employeeId,
        productId: productId,
        date: dateStr
      }

      let dsrRecord = await EmpGasSales.findOne(filter)
      
      if (!dsrRecord) {
        // Create new DSR record
        console.log(`📊 [EMP DSR] Creating new DSR record for ${productName}`)
        dsrRecord = new EmpGasSales({
          employeeId: employeeId,
          productId: productId,
          productName: productName,
          category: category,
          date: dateStr,
          cylinderStatus: cylinderStatus || null
        })
      }

      // Update sales data using the model method
      await dsrRecord.addSale({
        category: category,
        quantity: quantity,
        amount: amount,
        cylinderStatus: cylinderStatus
      })

      console.log(`📊 [EMP DSR] Updated DSR for ${productName}:`, {
        gasSales: dsrRecord.gasSalesQuantity,
        cylinderSales: dsrRecord.cylinderSalesQuantity,
        fullCylinderSales: dsrRecord.fullCylinderSalesQuantity,
        emptyCylinderSales: dsrRecord.emptyCylinderSalesQuantity
      })
    }

    console.log(`📊 [EMP DSR] Completed DSR tracking for employee ${employeeId}`)
  } catch (error) {
    console.error('📊 [EMP DSR] Failed to update employee DSR tracking:', error)
    throw error
  }
}

/**
 * Update employee DSR when stock is received (from purchases/assignments)
 */
export async function updateEmpStockReceived(stockData, employeeId) {
  try {
    await dbConnect()
    
    const today = new Date().toISOString().split('T')[0]
    const { productId, productName, category, quantity, cylinderStatus } = stockData
    
    console.log(`📊 [EMP DSR] Updating stock received for employee ${employeeId}: ${productName} (${quantity})`)

    const filter = {
      employeeId: employeeId,
      productId: productId,
      date: today
    }

    let dsrRecord = await EmpGasSales.findOne(filter)
    
    if (!dsrRecord) {
      // Create new DSR record
      dsrRecord = new EmpGasSales({
        employeeId: employeeId,
        productId: productId,
        productName: productName,
        category: category,
        date: today,
        cylinderStatus: cylinderStatus || null
      })
    }

    // Update stock received using the model method
    await dsrRecord.addStockReceived({
      quantity: quantity,
      category: category,
      cylinderStatus: cylinderStatus
    })

    console.log(`📊 [EMP DSR] Updated stock received for ${productName}:`, {
      stockReceived: dsrRecord.stockReceived,
      fullReceived: dsrRecord.fullReceived,
      emptyReceived: dsrRecord.emptyReceived
    })
  } catch (error) {
    console.error('📊 [EMP DSR] Failed to update stock received:', error)
    throw error
  }
}

/**
 * Get employee DSR data for a specific date
 */
export async function getEmpDSRData(employeeId, date) {
  try {
    await dbConnect()
    
    const dsrData = await EmpGasSales.find({
      employeeId: employeeId,
      date: date
    })
    .populate('productId', 'name category cylinderSize')
    .populate('employeeId', 'name email')
    .sort({ productName: 1 })

    return dsrData
  } catch (error) {
    console.error('📊 [EMP DSR] Failed to fetch DSR data:', error)
    throw error
  }
}

/**
 * Update opening stock for employee DSR
 */
export async function updateEmpOpeningStock(employeeId, date, stockData) {
  try {
    await dbConnect()
    
    for (const item of stockData) {
      const { productId, productName, category, openingStock, openingFull, openingEmpty } = item
      
      const filter = {
        employeeId: employeeId,
        productId: productId,
        date: date
      }

      await EmpGasSales.findOneAndUpdate(
        filter,
        {
          $set: {
            productName: productName,
            category: category,
            openingStock: openingStock || 0,
            openingFull: openingFull || 0,
            openingEmpty: openingEmpty || 0,
            lastUpdated: new Date()
          }
        },
        { upsert: true }
      )
    }

    console.log(`📊 [EMP DSR] Updated opening stock for employee ${employeeId} on ${date}`)
  } catch (error) {
    console.error('📊 [EMP DSR] Failed to update opening stock:', error)
    throw error
  }
}

/**
 * Update closing stock for employee DSR
 */
export async function updateEmpClosingStock(employeeId, date, stockData) {
  try {
    await dbConnect()
    
    for (const item of stockData) {
      const { productId, closingStock, closingFull, closingEmpty } = item
      
      const filter = {
        employeeId: employeeId,
        productId: productId,
        date: date
      }

      await EmpGasSales.findOneAndUpdate(
        filter,
        {
          $set: {
            closingStock: closingStock || 0,
            closingFull: closingFull || 0,
            closingEmpty: closingEmpty || 0,
            lastUpdated: new Date()
          }
        },
        { upsert: true }
      )
    }

    console.log(`📊 [EMP DSR] Updated closing stock for employee ${employeeId} on ${date}`)
  } catch (error) {
    console.error('📊 [EMP DSR] Failed to update closing stock:', error)
    throw error
  }
}
