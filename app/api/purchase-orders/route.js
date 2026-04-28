import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import PurchaseOrder from "@/models/PurchaseOrder"
import Supplier from "@/models/Supplier"
import Product from "@/models/Product"
import InventoryItem from "@/models/InventoryItem"
import { verifyToken } from "@/lib/auth"

// GET - Fetch all purchase orders
export async function GET(request) {
  const startedAt = Date.now()
  const shouldLogTiming = process.env.NODE_ENV === "development" || process.env.LOG_ROUTE_TIMING === "true"
  try {
    console.log("GET /api/purchase-orders - Starting request")
    
    // Verify authentication
    console.log("Verifying authentication...")
    const user = await verifyToken(request)
    if (!user) {
      console.log("Authentication failed")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.log("User authenticated:", user.role)

    console.log("Connecting to database...")
    await dbConnect()
    console.log("Database connected")
    
    const url = new URL(request.url)
    const mode = url.searchParams.get("mode")
    const limitParam = Number(url.searchParams.get("limit") || 0)
    const isListMode = mode === "list"
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 0

    console.log("Fetching purchase orders...")
    let query = PurchaseOrder.find({}).sort({ createdAt: -1 })

    if (isListMode) {
      query = query
        .select("supplier items purchaseDate totalAmount notes status poNumber createdAt updatedAt")
        .populate('supplier', 'companyName')
        .populate('items.product', 'name productCode category')
    } else {
      query = query
        .populate('supplier', 'companyName')
        .populate('items.product', 'name productCode category')
    }

    if (limit > 0) {
      query = query.limit(limit)
    }

    const purchaseOrders = await query.lean()
    
    console.log(`Found ${purchaseOrders.length} purchase orders`)
    if (shouldLogTiming) {
      console.info(`[route-timing] GET /api/purchase-orders mode=${isListMode ? "list" : "full"} durationMs=${Date.now() - startedAt}`)
    }
    return NextResponse.json({ data: purchaseOrders })
  } catch (error) {
    console.error("Error fetching purchase orders:", error)
    console.error("Error stack:", error.stack)
    return NextResponse.json({ error: "Failed to fetch purchase orders", details: error.message }, { status: 500 })
  }
}

// POST - Create new purchase order
export async function POST(request) {
  try {
    console.log("POST /api/purchase-orders - Starting request")
    
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      console.log("Authentication failed")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.log("User authenticated:", user.role)

    await dbConnect()
    console.log("Database connected")
    
    const body = await request.json()
    console.log("Request body:", JSON.stringify(body, null, 2))
    
    const {
      supplier,
      purchaseDate,
      items,
      notes,
      status = "pending",
      invoiceNumber,
      purchasePaperImage,
    } = body

    // Validate required fields
    if (!supplier || !purchaseDate || !items || !Array.isArray(items) || items.length === 0 || !invoiceNumber) {
      return NextResponse.json(
        { error: "Missing required fields. Supplier, purchase date, items array, and invoice number are required." },
        { status: 400 }
      )
    }

    // Validate and process items using bulk lookups (faster than per-item queries)
    const supplierExists = await Supplier.exists({ _id: supplier })
    if (!supplierExists) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 400 })
    }

    const productIds = [...new Set(items.map((item) => String(item.productId)).filter(Boolean))]
    const emptyCylinderIds = [...new Set(items.map((item) => String(item.emptyCylinderId || "")).filter(Boolean))]
    const allLookupIds = [...new Set([...productIds, ...emptyCylinderIds])]

    const products = await Product.find({ _id: { $in: allLookupIds } })
      .select("_id name productCode category cylinderStatus")
      .lean()
    const productMap = new Map(products.map((p) => [String(p._id), p]))

    const emptyInventoryDocs = emptyCylinderIds.length
      ? await InventoryItem.find({ product: { $in: emptyCylinderIds } })
          .select("product category availableEmpty")
          .lean()
      : []
    const emptyInventoryMap = new Map(emptyInventoryDocs.map((inv) => [String(inv.product), inv]))

    const processedItems = []
    let totalOrderAmount = 0

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item.productId || !item.purchaseType || !item.quantity) {
        return NextResponse.json(
          { error: `Item ${i + 1}: Missing required fields (productId, purchaseType, quantity)` },
          { status: 400 },
        )
      }

      const existingProduct = productMap.get(String(item.productId))
      if (!existingProduct) {
        return NextResponse.json(
          { error: `Item ${i + 1}: Product not found. Only existing products can be purchased.` },
          { status: 400 },
        )
      }

      if (item.productCode !== undefined) {
        const expected = String(existingProduct.productCode || "")
        const provided = String(item.productCode || "")
        if (expected && provided && expected !== provided) {
          return NextResponse.json(
            { error: `Item ${i + 1}: productCode mismatch for selected product. Expected ${expected}, got ${provided}` },
            { status: 400 },
          )
        }
      }

      let effectiveCylinderStatus = item.cylinderStatus
      if (item.purchaseType === "cylinder" && !effectiveCylinderStatus) {
        if (existingProduct.cylinderStatus) {
          effectiveCylinderStatus = existingProduct.cylinderStatus
        } else {
          return NextResponse.json(
            { error: `Item ${i + 1}: cylinderStatus is required for cylinder purchases` },
            { status: 400 },
          )
        }
      }

      if (item.purchaseType === "cylinder" && effectiveCylinderStatus === "full" && !item.gasType) {
        return NextResponse.json(
          { error: `Item ${i + 1}: gasType is required for full cylinder purchases` },
          { status: 400 },
        )
      }

      if (item.purchaseType === "gas" && !item.emptyCylinderId) {
        return NextResponse.json(
          { error: `Item ${i + 1}: emptyCylinderId is required for gas purchases` },
          { status: 400 },
        )
      }

      if (item.purchaseType === "gas" && item.emptyCylinderId) {
        const emptyCylinderProd = productMap.get(String(item.emptyCylinderId))
        if (!emptyCylinderProd) {
          return NextResponse.json(
            { error: `Item ${i + 1}: Empty cylinder product not found` },
            { status: 400 },
          )
        }
        if (item.emptyCylinderCode !== undefined) {
          const expectedCode = String(emptyCylinderProd.productCode || "")
          const providedCode = String(item.emptyCylinderCode || "")
          if (expectedCode && providedCode && expectedCode !== providedCode) {
            return NextResponse.json(
              { error: `Item ${i + 1}: emptyCylinderCode mismatch. Expected ${expectedCode}, got ${providedCode}` },
              { status: 400 },
            )
          }
        }

        const emptyInv = emptyInventoryMap.get(String(item.emptyCylinderId))
        if (!emptyInv) {
          return NextResponse.json(
            { error: `Item ${i + 1}: Empty cylinder inventory not found` },
            { status: 400 },
          )
        }
        if (emptyInv.category !== "cylinder") {
          return NextResponse.json(
            { error: `Item ${i + 1}: Selected item is not a cylinder` },
            { status: 400 },
          )
        }
        const available = Number(emptyInv.availableEmpty || 0)
        if (available < Number(item.quantity)) {
          return NextResponse.json(
            { error: `Item ${i + 1}: Not enough empty cylinders available. Available: ${available}, Requested: ${item.quantity}` },
            { status: 400 },
          )
        }
      }

      const qtyNum = Number(item.quantity)
      const unitPriceNum = item.unitPrice !== undefined && item.unitPrice !== null && item.unitPrice !== "" ? Number(item.unitPrice) : 0
      const itemTotal = qtyNum * unitPriceNum

      processedItems.push({
        product: item.productId,
        purchaseType: item.purchaseType,
        ...(item.purchaseType === "cylinder"
          ? {
              cylinderStatus: effectiveCylinderStatus,
              ...(effectiveCylinderStatus === "full" ? { gasType: item.gasType } : {}),
            }
          : {}),
        ...(item.purchaseType === "gas" ? { emptyCylinderId: item.emptyCylinderId } : {}),
        quantity: qtyNum,
        unitPrice: unitPriceNum,
        itemTotal,
        inventoryStatus: "pending",
      })

      totalOrderAmount += itemTotal
    }

    // Use provided Invoice Number as the PO reference
    const poNumber = String(invoiceNumber).trim()

    console.log("Creating purchase order with data:", {
      supplier,
      purchaseDate,
      items: processedItems,
      totalAmount: totalOrderAmount,
      notes: notes || "",
      status,
      poNumber,
      ...(String(purchasePaperImage || "").trim() ? { purchasePaperImage: purchasePaperImage.trim() } : {}),
      createdBy: user.id
    })

    const purchaseOrder = new PurchaseOrder({
      supplier,
      purchaseDate,
      items: processedItems,
      totalAmount: totalOrderAmount,
      notes: notes || "",
      status: status || "pending",
      inventoryStatus: "pending",
      poNumber,
      purchasePaperImage: String(purchasePaperImage || "").trim(),
      createdBy: user.id
    })

    console.log("Saving purchase order...")
    await purchaseOrder.save()
    console.log("Purchase order saved successfully:", purchaseOrder._id)
    
    // Populate the saved order before returning
    console.log("Populating purchase order...")
    const populatedOrder = await PurchaseOrder.findById(purchaseOrder._id)
      .populate('supplier', 'companyName')
      .populate('items.product', 'name')
    
    console.log("Purchase order created successfully")
    return NextResponse.json({ data: populatedOrder }, { status: 201 })
  } catch (error) {
    console.error("Error creating purchase order:", error)
    console.error("Error stack:", error.stack)
    
    // Provide more specific error messages
    let errorMessage = "Failed to create purchase order"
    if (error.name === 'ValidationError') {
      errorMessage = `Validation error: ${error.message}`
    } else if (error.code === 11000) {
      errorMessage = "Duplicate invoice number. Please use a unique invoice number."
    }
    
    return NextResponse.json({ 
      error: errorMessage, 
      details: error.message,
      validationErrors: error.errors 
    }, { status: 500 })
  }
}
