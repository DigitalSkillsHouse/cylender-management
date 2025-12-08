import dbConnect from "@/lib/mongodb"
import { NextResponse } from "next/server"
import AdminSignature from "@/models/AdminSignature"
import { verifyToken } from "@/lib/auth"
import jwt from "jsonwebtoken"

// GET: Retrieve the active admin signature
export async function GET(request) {
  try {
    await dbConnect()

    // Find the active admin signature
    const signature = await AdminSignature.findOne({ isActive: true }).sort({ createdAt: -1 })

    if (!signature) {
      return NextResponse.json({
        success: false,
        message: "No admin signature found",
      }, { status: 404 })
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
    console.error("Error fetching admin signature:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch admin signature",
      },
      { status: 500 }
    )
  }
}

// POST: Save or update admin signature
export async function POST(request) {
  try {
    await dbConnect()

    // Check if user is authenticated and is admin
    // Try to verify token - if user not found in DB but token is valid with admin role, allow it
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
            // If token is valid and has admin role, allow it
            if (decoded && decoded.role === "admin") {
              user = {
                id: decoded.userId,
                role: decoded.role,
                email: decoded.email || "",
                name: decoded.name || "",
              }
            }
          }
        }
      } catch (tokenError) {
        console.error("Error extracting user from token:", tokenError)
      }
    }
    
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized. Only admins can save signatures.",
        },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { signature } = body

    if (!signature || typeof signature !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Signature data is required",
        },
        { status: 400 }
      )
    }

    // Deactivate all existing signatures
    await AdminSignature.updateMany(
      { isActive: true },
      { isActive: false }
    )

    // Create new active signature
    const newSignature = await AdminSignature.create({
      signature,
      createdBy: user.id,
      isActive: true,
    })

    return NextResponse.json({
      success: true,
      data: {
        _id: newSignature._id,
        createdAt: newSignature.createdAt,
        updatedAt: newSignature.updatedAt,
      },
      message: "Admin signature saved successfully",
    })
  } catch (error) {
    console.error("Error saving admin signature:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to save admin signature",
      },
      { status: 500 }
    )
  }
}

