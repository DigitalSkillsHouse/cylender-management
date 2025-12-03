import { NextResponse } from "next/server"

export function middleware(request) {
  // Only protect API routes (except auth routes and admin routes that handle their own auth)
  const pathname = request.nextUrl.pathname
  
  // Skip middleware for auth routes and admin accept-return route (handles its own validation)
  if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/admin/accept-return")) {
    return NextResponse.next()
  }
  
  if (pathname.startsWith("/api")) {
    const token = request.cookies.get("token")?.value

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
      // Simple token validation - in production, use proper JWT verification
      if (token && token.length > 10) {
        return NextResponse.next()
      } else {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 })
      }
    } catch (error) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/api/:path*"],
}
