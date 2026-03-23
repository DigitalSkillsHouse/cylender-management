import dbConnect from "@/lib/mongodb"
import Quotation from "@/models/Quotation"
import { NextResponse } from "next/server"

// Disable caching for this route - force dynamic rendering
export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

export async function GET(_request, { params }) {
  try {
    await dbConnect()
    const quotation = await Quotation.findById(params.id).lean()
    if (!quotation) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: quotation })
  } catch (error) {
    console.error("Quotation GET error:", error)
    return NextResponse.json({ error: "Failed to fetch quotation" }, { status: 500 })
  }
}

export async function PUT(request, { params }) {
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

    const updated = await Quotation.findByIdAndUpdate(
      params.id,
      {
        $set: {
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
        },
      },
      { new: true }
    ).lean()

    if (!updated) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error("Quotation PUT error:", error)
    return NextResponse.json({ error: "Failed to update quotation" }, { status: 500 })
  }
}

export async function DELETE(_request, { params }) {
  try {
    await dbConnect()
    const deleted = await Quotation.findByIdAndDelete(params.id).lean()
    if (!deleted) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Quotation DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete quotation" }, { status: 500 })
  }
}

