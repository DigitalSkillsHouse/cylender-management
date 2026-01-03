import dbConnect from "@/lib/mongodb"
import { NextResponse } from "next/server"
import Customer from "@/models/Customer"
import * as XLSX from "xlsx"

// Disable caching for this route
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function POST(request) {
  try {
    await dbConnect()
  } catch (error) {
    console.error("Database connection error:", error)
    return NextResponse.json(
      { success: false, error: "Database connection failed", details: error.message },
      { status: 500 }
    )
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file")

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      )
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Parse Excel file
    const workbook = XLSX.read(buffer, { type: "buffer" })
    const firstSheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[firstSheetName]

    // Convert to JSON array
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" })

    if (jsonData.length < 2) {
      return NextResponse.json(
        { success: false, error: "Excel file must have at least a header row and one data row" },
        { status: 400 }
      )
    }

    // Find header row and column indices
    let headerRowIndex = 0
    let nameColIndex = -1
    let trNumberColIndex = -1

    // Try to find header row (check first 5 rows)
    for (let i = 0; i < Math.min(5, jsonData.length); i++) {
      const row = jsonData[i].map((cell) => String(cell || "").toLowerCase().trim())
      const nameIdx = row.findIndex((cell) =>
        cell.includes("name") && !cell.includes("tr") && !cell.includes("number")
      )
      const trIdx = row.findIndex((cell) =>
        cell.includes("tr") || (cell.includes("tr-") && cell.includes("number"))
      )

      if (nameIdx !== -1 && trIdx !== -1) {
        headerRowIndex = i
        nameColIndex = nameIdx
        trNumberColIndex = trIdx
        break
      }
    }

    // If not found, try first row with common variations
    if (nameColIndex === -1 || trNumberColIndex === -1) {
      const firstRow = jsonData[0].map((cell) => String(cell || "").toLowerCase().trim())
      nameColIndex = firstRow.findIndex((cell) => cell === "name" || cell.includes("name"))
      trNumberColIndex = firstRow.findIndex(
        (cell) =>
          cell === "tr-number" ||
          cell === "trnumber" ||
          cell === "tr number" ||
          (cell.includes("tr") && cell.includes("number"))
      )

      if (nameColIndex === -1) nameColIndex = 0
      if (trNumberColIndex === -1) trNumberColIndex = 1
      headerRowIndex = 0
    }

    // Get all existing customers to determine next serial number
    const existingCustomers = await Customer.find({}).sort({ createdAt: -1 })
    
    // Find highest serial number
    const serialNumbers = existingCustomers
      .map((customer) => customer.serialNumber)
      .filter((serial) => serial && serial.startsWith("CU-"))
      .map((serial) => {
        const num = parseInt(serial.replace("CU-", ""))
        return isNaN(num) ? 0 : num
      })

    const maxNumber = serialNumbers.length > 0 ? Math.max(0, ...serialNumbers) : 0

    // STEP 1: Parse all rows from Excel file (in order) WITHOUT assigning serial numbers yet
    const rawCustomers = []
    const errors = []
    let rowNumber = headerRowIndex + 1

    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
      const row = jsonData[i]
      if (!row || row.length === 0) continue

      const name = String(row[nameColIndex] || "").trim()
      const trNumber = String(row[trNumberColIndex] || "").trim()

      // Skip empty rows
      if (!name && !trNumber) continue

      // Validate required fields
      if (!name) {
        errors.push({
          row: rowNumber,
          name: trNumber || "Unknown",
          error: "Customer name is required",
        })
        rowNumber++
        continue
      }

      // Store customer data with Excel row number for reference
      rawCustomers.push({
        name,
        trNumber: trNumber || "",
        phone: "",
        email: "",
        address: "",
        excelRowNumber: rowNumber, // Keep track of original Excel row
      })

      rowNumber++
    }

    if (rawCustomers.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid customer data found in Excel file" },
        { status: 400 }
      )
    }

    // STEP 2: Check for duplicates and filter out invalid customers
    // This maintains the Excel file order
    const validCustomers = []
    const failed = []

    for (let idx = 0; idx < rawCustomers.length; idx++) {
      const customerData = rawCustomers[idx]
      
      // Check if customer with same name already exists
      const existingByName = await Customer.findOne({ name: customerData.name })
      if (existingByName) {
        failed.push({
          row: customerData.excelRowNumber,
          name: customerData.name,
          error: `Customer with this name already exists (Serial: ${existingByName.serialNumber})`,
        })
        continue
      }

      // Check if customer with same TR number already exists (if TR number is provided)
      if (customerData.trNumber && customerData.trNumber.trim() !== "") {
        const existingByTR = await Customer.findOne({ trNumber: customerData.trNumber })
        if (existingByTR) {
          failed.push({
            row: customerData.excelRowNumber,
            name: customerData.name,
            error: `Customer with TR Number "${customerData.trNumber}" already exists (Serial: ${existingByTR.serialNumber})`,
          })
          continue
        }
      }

      // Customer is valid, add to valid list (maintains Excel order)
      validCustomers.push(customerData)
    }

    if (validCustomers.length === 0) {
      return NextResponse.json({
        success: true,
        result: {
          success: 0,
          failed: failed.length,
          errors: failed,
          imported: [],
        },
        message: `No valid customers to import. ${failed.length} customer(s) failed validation.`,
      })
    }

    // STEP 3: Assign serial numbers sequentially to valid customers only
    // This ensures first customer in Excel gets first serial number, second gets second, etc.
    let nextSerialNumber = maxNumber + 1
    const imported = []

    for (let idx = 0; idx < validCustomers.length; idx++) {
      const customerData = validCustomers[idx]
      
      try {
        // Assign serial number sequentially based on Excel file order
        const serialNumber = `CU-${nextSerialNumber.toString().padStart(4, "0")}`
        nextSerialNumber++

        // Double-check serial number doesn't exist (shouldn't happen, but safety check)
        const existingSerial = await Customer.findOne({ serialNumber })
        if (existingSerial) {
          // If conflict, find next available
          const maxCustomer = await Customer.findOne({})
            .sort({ serialNumber: -1 })
            .limit(1)
          
          if (maxCustomer && maxCustomer.serialNumber) {
            const lastSerial = maxCustomer.serialNumber
            const lastNum = parseInt(lastSerial.replace("CU-", "")) || 0
            nextSerialNumber = Math.max(nextSerialNumber, lastNum + 1)
            customerData.serialNumber = `CU-${nextSerialNumber.toString().padStart(4, "0")}`
            nextSerialNumber++
          } else {
            customerData.serialNumber = serialNumber
          }
        } else {
          customerData.serialNumber = serialNumber
        }

        // Create customer with assigned serial number
        const customer = await Customer.create({
          name: customerData.name,
          trNumber: customerData.trNumber,
          serialNumber: customerData.serialNumber,
          phone: customerData.phone,
          email: customerData.email,
          address: customerData.address,
        })

        imported.push({
          name: customer.name,
          trNumber: customer.trNumber,
          serialNumber: customer.serialNumber,
        })
      } catch (error) {
        failed.push({
          row: customerData.excelRowNumber,
          name: customerData.name,
          error: error.message || "Failed to create customer",
        })
      }
    }

    return NextResponse.json({
      success: true,
      result: {
        success: imported.length,
        failed: failed.length,
        errors: failed,
        imported: imported,
      },
      message: `Successfully imported ${imported.length} customer(s), ${failed.length} failed`,
    })
  } catch (error) {
    console.error("Customer import error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to import customers",
        details: error.stack,
      },
      { status: 500 }
    )
  }
}

