import dbConnect from "@/lib/mongodb"
import User from "@/models/User"
import jwt from "jsonwebtoken"
import { NextResponse } from "next/server"

export async function POST(request) {
  try {
    await dbConnect()

    const { email, password, userType } = await request.json()

    if (!email || !password || !userType) {
      return NextResponse.json({ error: "Email, password and user type are required" }, { status: 400 })
    }

    // Check if user exists
    const user = await User.findOne({ email }).select("+password")
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password)
    if (!isPasswordValid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    // Validate user type selection against actual user role
    if (userType === "admin") {
      // Only allow admin credentials for admin login
      const adminEmail = process.env.ADMIN_EMAIL || "syyedtayyabindustrialgasesllc@gmail.com"
      if (user.role !== "admin" || user.email !== adminEmail) {
        return NextResponse.json({ 
          error: "Access denied. Please select 'Employee' user type or contact administrator." 
        }, { status: 403 })
      }
    } else if (userType === "employee") {
      // Only allow employee accounts for employee login
      if (user.role !== "employee") {
        return NextResponse.json({ 
          error: "Access denied. Please select 'Administrator' user type." 
        }, { status: 403 })
      }
    }

    // Check if user is active
    if (!user.isActive) {
      return NextResponse.json({ error: "Account is deactivated" }, { status: 401 })
    }

    // Create JWT token
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" },
    )

    const response = NextResponse.json({
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        debitAmount: user.debitAmount || 0,
        creditAmount: user.creditAmount || 0,
      },
    })

    // Set HTTP-only cookie
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60, // 24 hours
      path: "/",
    })

    return response
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
