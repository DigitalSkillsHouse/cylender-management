import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import DailyCylinderTransaction from "@/models/DailyCylinderTransaction"
import DailyEmployeeCylinderAggregation from "@/models/DailyEmployeeCylinderAggregation"
import EmployeeInventoryItem from "@/models/EmployeeInventoryItem"
import ReturnTransaction from "@/models/ReturnTransaction"
import Product from "@/models/Product"

export async function GET(request) {
  try {
    await dbConnect()
    
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get("employeeId")
    const date = searchParams.get("date")
    
    if (!employeeId) {
      return NextResponse.json({ 
        success: false, 
        error: "employeeId is required" 
      }, { status: 400 })
    }
    
    if (!date) {
      return NextResponse.json({ 
        success: false, 
        error: "date is required" 
      }, { status: 400 })
    }
    
    console.log(`🚀 [Employee DSR API] Fetching DSR data for employee: ${employeeId}, date: ${date}`)
    
    // Step 1: Get cylinder transactions from DailyCylinderTransaction
    const cylinderTransactions = await DailyCylinderTransaction.find({
      date: date,
      employeeId: employeeId,
      isEmployeeTransaction: true
    }).populate('cylinderProductId', 'name category cylinderSize')
    
    console.log(`📊 [Employee DSR API] Found ${cylinderTransactions.length} cylinder transactions`)
    
    // Step 2: Get aggregated data from DailyEmployeeCylinderAggregation
    const aggregatedData = await DailyEmployeeCylinderAggregation.find({
      employeeId: employeeId,
      date: date
    }).populate('productId', 'name category cylinderSize')
    
    console.log(`📈 [Employee DSR API] Found ${aggregatedData.length} aggregated records`)
    
    // Step 3: Get transfer data from ReturnTransaction records
    // Parse the date properly - it comes as YYYY-MM-DD format
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)
    
    const transferData = await ReturnTransaction.find({
      employee: employeeId,
      returnDate: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    }).populate('product', 'name category cylinderSize')
    
    console.log(`🔄 [Employee DSR API] Found ${transferData.length} transfer records`)
    
    // Debug: Log transfer data details
    transferData.forEach((transfer, index) => {
      console.log(`🔍 [Transfer ${index + 1}] Product: ${transfer.product?.name}, Type: ${transfer.stockType}, Quantity: ${transfer.quantity}, Date: ${transfer.returnDate}`)
    })
    
    // Step 4: Get current inventory for opening/closing stock from new inventory system
    let inventoryItems = []
    try {
      const inventoryResponse = await fetch(`http://localhost:3000/api/employee-inventory-new/received?employeeId=${employeeId}`)
      if (inventoryResponse.ok) {
        const inventoryResult = await inventoryResponse.json()
        inventoryItems = inventoryResult.data || []
        console.log(`📦 [Employee DSR API] Found ${inventoryItems.length} inventory items from new system`)
      } else {
        console.warn(`⚠️ [Employee DSR API] Failed to fetch from new inventory system, trying old system`)
        // Fallback to old system
        const oldInventoryItems = await EmployeeInventoryItem.find({
          employee: employeeId
        }).populate('product', 'name category cylinderSize')
        
        // Convert old format to new format
        inventoryItems = oldInventoryItems.map(item => ({
          _id: item._id,
          productId: item.product?._id,
          productName: item.product?.name || 'Unknown Product',
          category: item.product?.category || 'unknown',
          currentStock: item.currentStock || 0,
          availableEmpty: item.availableEmpty || 0,
          availableFull: item.availableFull || 0,
          cylinderSize: item.product?.cylinderSize,
          updatedAt: item.updatedAt || new Date()
        }))
        console.log(`📦 [Employee DSR API] Found ${inventoryItems.length} inventory items from old system`)
      }
    } catch (error) {
      console.error(`❌ [Employee DSR API] Error fetching inventory:`, error)
      inventoryItems = []
    }
    
    // Step 5: Merge data into DSR format
    const dsrMap = new Map()
    
    // Process cylinder transactions
    cylinderTransactions.forEach(transaction => {
      const productId = transaction.cylinderProductId?._id?.toString()
      const productName = transaction.cylinderName || transaction.cylinderProductId?.name || 'Unknown Product'
      
      if (!dsrMap.has(productId)) {
        dsrMap.set(productId, {
          itemName: productName,
          productId: productId,
          category: 'cylinder',
          openingFull: 0,
          openingEmpty: 0,
          refilled: 0,
          fullCylinderSales: 0,
          emptyCylinderSales: 0,
          gasSales: 0,
          deposits: 0,
          returns: 0,
          transferGas: 0,
          transferEmpty: 0,
          receivedGas: 0,
          receivedEmpty: 0,
          closingFull: 0,
          closingEmpty: 0
        })
      }
      
      const item = dsrMap.get(productId)
      item.deposits += transaction.depositQuantity || 0
      item.returns += transaction.returnQuantity || 0
      item.fullCylinderSales += transaction.fullCylinderSalesQuantity || 0
      item.gasSales += transaction.gasSalesQuantity || 0
      item.transferGas += transaction.transferGasQuantity || 0
      item.transferEmpty += transaction.transferEmptyQuantity || 0
    })
    
    // Process aggregated data (more reliable for totals)
    aggregatedData.forEach(agg => {
      const productId = agg.productId?._id?.toString()
      const productName = agg.productName || agg.productId?.name || 'Unknown Product'
      
      if (!dsrMap.has(productId)) {
        dsrMap.set(productId, {
          itemName: productName,
          productId: productId,
          category: 'cylinder',
          openingFull: 0,
          openingEmpty: 0,
          refilled: 0,
          fullCylinderSales: 0,
          emptyCylinderSales: 0,
          gasSales: 0,
          deposits: 0,
          returns: 0,
          transferGas: 0,
          transferEmpty: 0,
          receivedGas: 0,
          receivedEmpty: 0,
          closingFull: 0,
          closingEmpty: 0
        })
      }
      
      const item = dsrMap.get(productId)
      // Use aggregated data as it's more reliable
      item.deposits = agg.totalDeposits || 0
      item.returns = agg.totalReturns || 0
      item.refilled = agg.totalRefills || 0
      item.transferGas = agg.totalTransferGas || 0
      item.transferEmpty = agg.totalTransferEmpty || 0
    })
    
    // Process transfer data from ReturnTransaction records
    transferData.forEach(transfer => {
      const transferProductId = transfer.product?._id?.toString()
      const transferProductName = transfer.product?.name || 'Unknown Product'
      
      if (transfer.product?.category === 'cylinder') {
        if (!dsrMap.has(transferProductId)) {
          dsrMap.set(transferProductId, {
            itemName: transferProductName,
            productId: transferProductId,
            category: 'cylinder',
            openingFull: 0,
            openingEmpty: 0,
            refilled: 0,
            fullCylinderSales: 0,
            emptyCylinderSales: 0,
            gasSales: 0,
            deposits: 0,
            returns: 0,
            transferGas: 0,
            transferEmpty: 0,
            receivedGas: 0,
            receivedEmpty: 0,
            closingFull: 0,
            closingEmpty: 0
          })
        }
        
        const transferItem = dsrMap.get(transferProductId)
        if (transfer.stockType === 'gas') {
          transferItem.transferGas += transfer.quantity || 0
          console.log(`✅ [Transfer Processing] Added ${transfer.quantity} gas transfer for ${transferProductName}. Total: ${transferItem.transferGas}`)
        } else if (transfer.stockType === 'empty') {
          transferItem.transferEmpty += transfer.quantity || 0
          console.log(`✅ [Transfer Processing] Added ${transfer.quantity} empty transfer for ${transferProductName}. Total: ${transferItem.transferEmpty}`)
        }
      }
    })
    
    // Process inventory for opening/closing stock
    inventoryItems.forEach(invItem => {
      const productId = invItem.productId?.toString() || invItem._id?.toString()
      const productName = invItem.productName || 'Unknown Product'
      
      if (invItem.category === 'cylinder') {
        if (!dsrMap.has(productId)) {
          dsrMap.set(productId, {
            itemName: productName,
            productId: productId,
            category: 'cylinder',
            openingFull: 0,
            openingEmpty: 0,
            refilled: 0,
            fullCylinderSales: 0,
            emptyCylinderSales: 0,
            gasSales: 0,
            deposits: 0,
            returns: 0,
            transferGas: 0,
            transferEmpty: 0,
            receivedGas: 0,
            receivedEmpty: 0,
            closingFull: 0,
            closingEmpty: 0
          })
        }
        
        const item = dsrMap.get(productId)
        item.openingFull = invItem.availableFull || 0
        item.openingEmpty = invItem.availableEmpty || 0
      }
    })
    
    // Final processing for all items in the map
    dsrMap.forEach((item, productId) => {
      // Calculate closing stock (opening + received - sales/transfers)
      item.closingFull = Math.max(0, item.openingFull + item.receivedGas - item.fullCylinderSales - item.transferGas)
      item.closingEmpty = Math.max(0, item.openingEmpty + item.gasSales + item.returns + item.receivedEmpty - item.deposits - item.transferEmpty)
    })
    
    const dsrData = Array.from(dsrMap.values())
    
    console.log(`✅ [Employee DSR API] Generated DSR with ${dsrData.length} items:`, {
      totalDeposits: dsrData.reduce((sum, item) => sum + item.deposits, 0),
      totalReturns: dsrData.reduce((sum, item) => sum + item.returns, 0),
      totalGasSales: dsrData.reduce((sum, item) => sum + item.gasSales, 0),
      totalTransferGas: dsrData.reduce((sum, item) => sum + item.transferGas, 0),
      totalTransferEmpty: dsrData.reduce((sum, item) => sum + item.transferEmpty, 0),
      inventoryItemsProcessed: inventoryItems.length,
      cylinderTransactionsProcessed: cylinderTransactions.length,
      aggregatedRecordsProcessed: aggregatedData.length,
      transferRecordsProcessed: transferData.length
    })
    
    return NextResponse.json({
      success: true,
      data: dsrData
    })
    
  } catch (error) {
    console.error("❌ [Employee DSR API] Error:", error)
    return NextResponse.json({
      success: false,
      error: "Failed to fetch employee DSR data",
      details: error.message
    }, { status: 500 })
  }
}