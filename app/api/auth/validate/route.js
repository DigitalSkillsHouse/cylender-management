import { NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"

export async function GET(request) {
  try {
    // Verify the token from the HTTP-only cookie
    const user = await verifyToken(request)
    
    if (!user) {
      return NextResponse.json({
        authenticated: false,
        user: null,
      })
    }

    // Return user data if token is valid
    return NextResponse.json({ 
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        debitAmount: user.debitAmount,
        creditAmount: user.creditAmount
      }
    })
  } catch (error) {
    console.error("Session validation error:", error)
    return NextResponse.json({
      authenticated: false,
      user: null,
    })
  }
}
