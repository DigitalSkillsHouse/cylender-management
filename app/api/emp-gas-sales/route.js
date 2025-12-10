import { NextResponse } from "next/server"
import dbConnect from "@/lib/mongodb"
import EmpGasSales from "@/models/EmpGasSales"
import { verifyToken } from "@/lib/auth"
import { getEmpDSRData, updateEmpOpeningStock, updateEmpClosingStock } from "@/lib/emp-gas-sales-tracker"
import { getLocalDateString } from "@/lib/date-utils"

// GET - Fetch employee DSR data
export async function GET(request) {
  try {
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()
    
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || getLocalDateString()
    const employeeId = searchParams.get('employeeId') || user.id
    
    console.log(`📊 [EMP DSR API] Fetching DSR data for employee ${employeeId} on ${date}`)

    // For employees, only allow fetching their own data
    // For admins, allow fetching any employee's data
    if (user.role === 'employee' && employeeId !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const dsrData = await getEmpDSRData(employeeId, date)
    
    console.log(`📊 [EMP DSR API] Found ${dsrData.length} DSR records`)

    return NextResponse.json({ 
      success: true, 
      data: dsrData,
      date: date,
      employeeId: employeeId
    })
  } catch (error) {
    console.error('📊 [EMP DSR API] Failed to fetch employee DSR data:', error)
    return NextResponse.json({ error: 'Failed to fetch employee DSR data' }, { status: 500 })
  }
}

// POST - Update opening/closing stock for employee DSR
export async function POST(request) {
  try {
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()
    
    const body = await request.json()
    const { action, date, employeeId, stockData } = body
    
    console.log(`📊 [EMP DSR API] ${action} stock update for employee ${employeeId} on ${date}`)

    // For employees, only allow updating their own data
    // For admins, allow updating any employee's data
    if (user.role === 'employee' && employeeId !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    if (!action || !date || !employeeId || !stockData) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (action === 'opening') {
      await updateEmpOpeningStock(employeeId, date, stockData)
      console.log(`📊 [EMP DSR API] Opening stock updated successfully`)
    } else if (action === 'closing') {
      await updateEmpClosingStock(employeeId, date, stockData)
      console.log(`📊 [EMP DSR API] Closing stock updated successfully`)
    } else {
      return NextResponse.json({ error: "Invalid action. Use 'opening' or 'closing'" }, { status: 400 })
    }

    // Fetch updated data
    const updatedData = await getEmpDSRData(employeeId, date)

    return NextResponse.json({ 
      success: true, 
      message: `${action} stock updated successfully`,
      data: updatedData
    })
  } catch (error) {
    console.error('📊 [EMP DSR API] Failed to update employee DSR stock:', error)
    return NextResponse.json({ error: 'Failed to update employee DSR stock' }, { status: 500 })
  }
}

// PUT - Manual DSR record creation/update
export async function PUT(request) {
  try {
    // Verify authentication
    const user = await verifyToken(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await dbConnect()
    
    const body = await request.json()
    const { 
      employeeId, 
      productId, 
      productName, 
      category, 
      date,
      openingStock,
      openingFull,
      openingEmpty,
      closingStock,
      closingFull,
      closingEmpty,
      notes
    } = body
    
    console.log(`📊 [EMP DSR API] Manual DSR update for ${productName} on ${date}`)

    // For employees, only allow updating their own data
    if (user.role === 'employee' && employeeId !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    if (!employeeId || !productId || !productName || !category || !date) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const filter = {
      employeeId: employeeId,
      productId: productId,
      date: date
    }

    const updateData = {
      $set: {
        productName: productName,
        category: category,
        lastUpdated: new Date()
      }
    }

    // Add opening stock if provided
    if (openingStock !== undefined) updateData.$set.openingStock = openingStock
    if (openingFull !== undefined) updateData.$set.openingFull = openingFull
    if (openingEmpty !== undefined) updateData.$set.openingEmpty = openingEmpty

    // Add closing stock if provided
    if (closingStock !== undefined) updateData.$set.closingStock = closingStock
    if (closingFull !== undefined) updateData.$set.closingFull = closingFull
    if (closingEmpty !== undefined) updateData.$set.closingEmpty = closingEmpty

    // Add notes if provided
    if (notes !== undefined) updateData.$set.notes = notes

    const updatedRecord = await EmpGasSales.findOneAndUpdate(
      filter,
      updateData,
      { upsert: true, new: true }
    )

    console.log(`📊 [EMP DSR API] DSR record updated:`, updatedRecord._id)

    return NextResponse.json({ 
      success: true, 
      message: "DSR record updated successfully",
      data: updatedRecord
    })
  } catch (error) {
    console.error('📊 [EMP DSR API] Failed to update DSR record:', error)
    return NextResponse.json({ error: 'Failed to update DSR record' }, { status: 500 })
  }
}
