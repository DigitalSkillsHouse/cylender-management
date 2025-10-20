import dbConnect from "@/lib/mongodb"
import Sale from "@/models/Sale"
import EmployeeSale from "@/models/EmployeeSale"
import CylinderTransaction from "@/models/Cylinder"
import Counter from "@/models/Counter"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    await dbConnect()
    
    // Check if any invoices exist in the system
    const [salesCount, empSalesCount, cylinderCount] = await Promise.all([
      Sale.countDocuments(),
      EmployeeSale.countDocuments(),
      CylinderTransaction.countDocuments()
    ])
    
    const hasInvoices = salesCount > 0 || empSalesCount > 0 || cylinderCount > 0
    const settings = await Counter.findOne({ key: 'invoice_start' })
    
    return NextResponse.json({ 
      needsStartingNumber: !hasInvoices && !settings,
      startingNumber: settings?.seq || 0
    })
  } catch (error) {
    console.error("Invoice settings GET error:", error)
    return NextResponse.json({ error: "Failed to get settings" }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    await dbConnect()
    
    const { startingNumber } = await request.json()
    
    if (!Number.isInteger(startingNumber) || startingNumber < 0) {
      return NextResponse.json({ error: "Invalid starting number" }, { status: 400 })
    }
    
    await Counter.findOneAndUpdate(
      { key: 'invoice_start' },
      { seq: startingNumber, year: new Date().getFullYear() },
      { upsert: true }
    )
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Invoice settings POST error:", error)
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 })
  }
}