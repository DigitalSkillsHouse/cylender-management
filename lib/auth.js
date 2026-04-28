import jwt from "jsonwebtoken"
import dbConnect from "@/lib/mongodb"
import User from "@/models/User"

/**
 * Verify JWT token from request cookies and return user data
 * @param {Request} request - Next.js request object
 * @returns {Object|null} User data if token is valid, null otherwise
 */
export async function verifyToken(request) {
  try {
    // Resolve token from Next.js cookies API first, then robustly parse cookie header,
    // then optional Bearer token fallback.
    let token = null
    try {
      token = request?.cookies?.get?.("token")?.value || null
    } catch {}

    if (!token) {
      const cookieHeader = request.headers.get("cookie") || ""
      if (cookieHeader) {
        const parsedCookies = Object.fromEntries(
          cookieHeader
            .split(/;\s*/)
            .map((cookie) => {
              const [key, ...valueParts] = cookie.split("=")
              return [key, valueParts.join("=")]
            })
            .filter(([key]) => Boolean(key))
        )
        token = parsedCookies.token ? decodeURIComponent(parsedCookies.token) : null
      }
    }

    if (!token) {
      const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || ""
      if (authHeader.toLowerCase().startsWith("bearer ")) {
        token = authHeader.slice(7).trim()
      }
    }

    if (!token) {
      console.log("No token found in request")
      return null
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key")
    console.log("Token decoded successfully:", { userId: decoded.userId, role: decoded.role })
    
    // Connect to database
    await dbConnect()
    
    // Get user from database to ensure they still exist and are active
    const user = await User.findById(decoded.userId)
    if (!user) {
      console.log("User not found in database:", decoded.userId)
      return null
    }
    
    if (!user.isActive) {
      console.log("User is not active:", user.email)
      return null
    }

    console.log("User authenticated successfully:", user.email)
    
    // Return user data
    return {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
      debitAmount: user.debitAmount || 0,
      creditAmount: user.creditAmount || 0,
    }
  } catch (error) {
    console.error("Token verification error:", error.message)
    if (error.name === 'JsonWebTokenError') {
      console.error("Invalid JWT token")
    } else if (error.name === 'TokenExpiredError') {
      console.error("JWT token expired")
    }
    return null
  }
}

/**
 * Create a JWT token for user
 * @param {Object} user - User object
 * @returns {String} JWT token
 */
export const createToken = (user) => jwt.sign(
  {
    userId: user._id,
    email: user.email,
    role: user.role,
    name: user.name,
  },
  process.env.JWT_SECRET || "your-secret-key",
  { expiresIn: "24h" }
)
