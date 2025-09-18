import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import PurchaseOrder from "@/models/PurchaseOrder"
import EmployeePurchaseOrder from "@/models/EmployeePurchaseOrder"
import Product from "@/models/Product"
import StockManager from "@/lib/stock-manager"
import { verifyToken } from "@/lib/auth"

// GET - Fetch single inventory item
export async function GET(request, { params }) {
  try {
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()
    
    // Try to find in both admin and employee purchase orders
    let purchaseOrder = await PurchaseOrder.findById(params.id)
      .populate('product', 'name category')
      .populate('supplier', 'companyName')
    
    let isEmployeePurchase = false
    
    if (!purchaseOrder) {
      // Try employee purchase orders
      purchaseOrder = await EmployeePurchaseOrder.findById(params.id)
        .populate('product', 'name category')
        .populate('supplier', 'companyName')
        .populate('employee', 'name email')
      isEmployeePurchase = true
    }
    
    if (!purchaseOrder) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 })
    }
    
    // Transform to inventory item format
    const inventoryItem = {
      id: purchaseOrder._id?.toString() || '',
      poNumber: purchaseOrder.poNumber || 'N/A',
      productName: purchaseOrder.product?.name || purchaseOrder.productName || "Unknown Product",
      supplierName: purchaseOrder.supplier?.companyName || purchaseOrder.supplierName || "Unknown Supplier",
      purchaseDate: purchaseOrder.purchaseDate,
      quantity: purchaseOrder.quantity || 0,
      unitPrice: purchaseOrder.unitPrice || 0,
      totalAmount: purchaseOrder.totalAmount || 0,
      status: purchaseOrder.inventoryStatus || "pending",
      purchaseType: purchaseOrder.purchaseType || "gas",
      createdAt: purchaseOrder.createdAt,
      updatedAt: purchaseOrder.updatedAt
    }
    
    return NextResponse.json({ data: inventoryItem })
  } catch (error) {
    console.error("Error fetching inventory item:", error)
    return NextResponse.json({ error: "Failed to fetch inventory item" }, { status: 500 })
  }
}

// PATCH - Update inventory item status
export async function PATCH(request, { params }) {
  try {
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()
    console.log("PATCH inventory request received for ID:", params.id)

    const { status, quantity, unitPrice } = await request.json()
    console.log("Update data:", { status, quantity, unitPrice })

    // Build update object
    const updateData = {}
    
    if (status) {
      updateData.inventoryStatus = status
      console.log("Updating inventory status to:", status)
      
      // If inventory status is being set to "received", also update the main purchase order status
      if (status === "received") {
        updateData.status = "completed"
        console.log("Also updating purchase order status to: completed")
      }
    }
    
    if (quantity !== undefined) {
      updateData.quantity = quantity
      // Recalculate total amount if quantity or unit price changes
      if (unitPrice !== undefined) {
        updateData.unitPrice = unitPrice
        updateData.totalAmount = quantity * unitPrice
      } else {
        // Get current unit price to recalculate total - check both models
        let currentOrder = await PurchaseOrder.findById(params.id)
        if (!currentOrder) {
          currentOrder = await EmployeePurchaseOrder.findById(params.id)
        }
        if (currentOrder) {
          updateData.totalAmount = quantity * (currentOrder.unitPrice || 0)
        }
      }
    } else if (unitPrice !== undefined) {
      updateData.unitPrice = unitPrice
      // Get current quantity to recalculate total - check both models
      let currentOrder = await PurchaseOrder.findById(params.id)
      if (!currentOrder) {
        currentOrder = await EmployeePurchaseOrder.findById(params.id)
      }
      if (currentOrder) {
        updateData.totalAmount = (currentOrder.quantity || 0) * unitPrice
      }
    }

    console.log("Update data to apply:", updateData)

    // Try to find and update in both admin and employee purchase orders
    let updatedOrder
    let isEmployeePurchase = false
    
    try {
      // First try admin purchase orders
      updatedOrder = await PurchaseOrder.findByIdAndUpdate(
        params.id,
        updateData,
        { new: true, runValidators: true }
      ).populate('product', 'name category')
       .populate('supplier', 'companyName')
    } catch (populateError) {
      console.warn("Population failed for admin purchase order, trying without populate:", populateError.message)
      // Fallback: update without populate
      updatedOrder = await PurchaseOrder.findByIdAndUpdate(
        params.id,
        updateData,
        { new: true, runValidators: true }
      )
    }

    if (!updatedOrder) {
      // Try employee purchase orders
      try {
        updatedOrder = await EmployeePurchaseOrder.findByIdAndUpdate(
          params.id,
          updateData,
          { new: true, runValidators: true }
        ).populate('product', 'name category')
         .populate('supplier', 'companyName')
         .populate('employee', 'name email')
        isEmployeePurchase = true
      } catch (populateError) {
        console.warn("Population failed for employee purchase order, trying without populate:", populateError.message)
        // Fallback: update without populate
        updatedOrder = await EmployeePurchaseOrder.findByIdAndUpdate(
          params.id,
          updateData,
          { new: true, runValidators: true }
        )
        isEmployeePurchase = true
      }
    }

    if (!updatedOrder) {
      return NextResponse.json(
        { success: false, error: "Purchase order not found in both admin and employee collections" },
        { status: 404 }
      )
    }

    console.log("Successfully updated order:", updatedOrder._id)

    // Transform back to inventory item format with safe property access
    const inventoryItem = {
      id: updatedOrder._id?.toString() || '',
      poNumber: updatedOrder.poNumber || 'N/A',
      productName: updatedOrder.product?.name || updatedOrder.productName || "Unknown Product",
      supplierName: updatedOrder.supplier?.companyName || updatedOrder.supplierName || "Unknown Supplier",
      purchaseDate: updatedOrder.purchaseDate,
      quantity: updatedOrder.quantity || 0,
      unitPrice: updatedOrder.unitPrice || 0,
      totalAmount: updatedOrder.totalAmount || 0,
      status: updatedOrder.inventoryStatus || "pending",
      purchaseType: updatedOrder.purchaseType || "gas",
      createdAt: updatedOrder.createdAt,
      updatedAt: updatedOrder.updatedAt
    }

    // Handle stock synchronization when inventory is received
    if (status === "received" && updatedOrder.productName) {
      try {
        console.log("Updating product stock for received inventory:", updatedOrder.productName)
        
        // Find the product by name and update its stock
        const product = await Product.findOne({ name: updatedOrder.productName })
        if (product) {
          const newStock = (product.currentStock || 0) + (updatedOrder.quantity || 0)
          await Product.findByIdAndUpdate(product._id, { currentStock: newStock })
          console.log(`Updated ${product.name} stock from ${product.currentStock} to ${newStock}`)
        } else {
          console.warn("Product not found for stock update:", updatedOrder.productName)
        }
      } catch (stockError) {
        console.error("Stock update error:", stockError)
        // Don't fail the entire operation if stock update fails
      }
    }

    return NextResponse.json({
      success: true,
      data: inventoryItem,
      message: "Inventory item updated successfully"
    })

  } catch (error) {
    console.error("Inventory update error:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to update inventory item", 
        details: error.message 
      },
      { status: 500 }
    )
  }
}

// DELETE - Delete inventory item
export async function DELETE(request, { params }) {
  try {
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()
    
    // Try to delete from both admin and employee purchase orders
    let purchaseOrder = await PurchaseOrder.findByIdAndDelete(params.id)
    
    if (!purchaseOrder) {
      // Try employee purchase orders
      purchaseOrder = await EmployeePurchaseOrder.findByIdAndDelete(params.id)
    }
    
    if (!purchaseOrder) {
      return NextResponse.json({ error: "Purchase order not found in both admin and employee collections" }, { status: 404 })
    }
    
    // Use centralized StockManager to synchronize product stock after deletion
    if (purchaseOrder.product) {
      await StockManager.syncProductStock(purchaseOrder.product)
    }
    
    return NextResponse.json({ 
      success: true, 
      message: "Inventory item deleted successfully" 
    })
  } catch (error) {
    console.error("Error deleting inventory item:", error)
    return NextResponse.json({ error: "Failed to delete inventory item" }, { status: 500 })
  }
}
