import dbConnect from "@/lib/mongodb"
import Counter from "@/models/Counter"
import Quotation from "@/models/Quotation"
import { NextResponse } from "next/server"

const COUNTER_KEY = "quotation_counter"
const COUNTER_YEAR = 0 // Keep a single global sequence (no yearly reset)

const formatQuotationNumber = (seq) => String(seq).padStart(7, "0")

export async function GET() {
  try {
    await dbConnect()

    const quotations = await Quotation.find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .lean()

    return NextResponse.json({ success: true, data: quotations })
  } catch (error) {
    console.error("Quotations GET error:", error)
    return NextResponse.json({ error: "Failed to fetch quotations" }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    await dbConnect()

    const body = await request.json().catch(() => ({}))
    const customerName = (body?.customerName || "").toString().trim()
    const items = Array.isArray(body?.items) ? body.items : []

    if (!customerName) {
      return NextResponse.json({ error: "Customer name is required" }, { status: 400 })
    }

    if (items.length === 0) {
      return NextResponse.json({ error: "At least one item is required" }, { status: 400 })
    }

    const counter = await Counter.findOneAndUpdate(
      { key: COUNTER_KEY, year: COUNTER_YEAR },
      { $inc: { seq: 1 }, $setOnInsert: { key: COUNTER_KEY, year: COUNTER_YEAR } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )

    const quotationSeq = Number(counter?.seq || 0)
    const quotationNumber = formatQuotationNumber(quotationSeq)

    const quotation = await Quotation.create({
      quotationNumber,
      quotationSeq,
      customerName,
      customerId: body?.customerId || undefined,
      customerAddress: body?.customerAddress || "",
      customerTRNumber: body?.customerTRNumber || "",
      items: items.map((it) => ({
        productId: it?.productId || it?._id || undefined,
        name: (it?.name || "").toString(),
        productCode: it?.productCode || "",
        category: it?.category,
        price: Number(it?.price || 0),
        quantity: Number(it?.quantity || 1),
      })),
      subtotal: Number(body?.subtotal || 0),
      vatAmount: Number(body?.vatAmount || 0),
      grandTotal: Number(body?.grandTotal || 0),
    })

    return NextResponse.json({ success: true, data: quotation })
  } catch (error) {
    console.error("Quotations POST error:", error)
    return NextResponse.json({ error: "Failed to save quotation" }, { status: 500 })
  }
}

