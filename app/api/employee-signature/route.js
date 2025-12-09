import dbConnect from "@/lib/mongodb"
import { NextResponse } from "next/server"
import EmployeeSignature from "@/models/EmployeeSignature"
import { verifyToken } from "@/lib/auth"
import jwt from "jsonwebtoken"

// GET: Retrieve the active employee signature for the current user
export async function GET(request) {
  try {
    await dbConnect()

    // Get employee ID from query params or from token
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get("employeeId")

    let userId = employeeId

    // If no employeeId in query, try to get from token
    if (!userId) {
      try {
        const cookieHeader = request.headers.get("cookie")
        if (cookieHeader) {
          const cookies = Object.fromEntries(
            cookieHeader.split("; ").map(cookie => {
              const [key, ...valueParts] = cookie.split("=")
              return [key, valueParts.join("=")]
            })
          )
          const token = cookies.token
          if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key")
            userId = decoded.userId
          }
        }
      } catch (tokenError) {
        console.error("Error extracting user from token:", tokenError)
      }
    }

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: "Employee ID is required",
        },
        { status: 400 }
      )
    }

    // Find the active signature for this employee
    const signature = await EmployeeSignature.findOne({ 
      employeeId: userId, 
      isActive: true 
    }).sort({ createdAt: -1 })

    if (!signature) {
      return NextResponse.json({
        success: true,
        data: null,
        message: "No active employee signature found",
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        signature: signature.signature,
        createdAt: signature.createdAt,
        updatedAt: signature.updatedAt,
      },
    })
  } catch (error) {
    console.error("Error fetching employee signature:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch employee signature",
      },
      { status: 500 }
    )
  }
}

// POST: Save or update employee signature
export async function POST(request) {
  try {
    await dbConnect()

    // Check if user is authenticated
    let user = await verifyToken(request)
    
    // If user not found in DB but token is valid, try to extract from token directly
    if (!user) {
      try {
        const cookieHeader = request.headers.get("cookie")
        if (cookieHeader) {
          const cookies = Object.fromEntries(
            cookieHeader.split("; ").map(cookie => {
              const [key, ...valueParts] = cookie.split("=")
              return [key, valueParts.join("=")]
            })
          )
          const token = cookies.token
          if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key")
            user = {
              id: decoded.userId,
              role: decoded.role,
              email: decoded.email || "",
              name: decoded.name || "",
            }
          }
        }
      } catch (tokenError) {
        console.error("Error extracting user from token:", tokenError)
      }
    }
    
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized. Please log in to save your signature.",
        },
        { status: 401 }
      )
    }

    // Employees can only save their own signature
    // Admins can save signatures for any employee (optional feature)
    const body = await request.json()
    const { signature, employeeId } = body

    if (!signature || typeof signature !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Signature data is required",
        },
        { status: 400 }
      )
    }

    // Determine which employee ID to use
    const targetEmployeeId = employeeId || user.id

    // If user is not admin, they can only save their own signature
    if (user.role !== "admin" && targetEmployeeId !== user.id) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized. You can only save your own signature.",
        },
        { status: 403 }
      )
    }

    // Deactivate all existing signatures for this employee
    await EmployeeSignature.updateMany(
      { employeeId: targetEmployeeId, isActive: true },
      { isActive: false }
    )

    // Create new active signature
    const newSignature = await EmployeeSignature.create({
      employeeId: targetEmployeeId,
      signature,
      isActive: true,
    })

    return NextResponse.json({
      success: true,
      data: {
        _id: newSignature._id,
        createdAt: newSignature.createdAt,
        updatedAt: newSignature.updatedAt,
      },
      message: "Employee signature saved successfully",
    })
  } catch (error) {
    console.error("Error saving employee signature:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to save employee signature",
      },
      { status: 500 }
    )
  }
}

