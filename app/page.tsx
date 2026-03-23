"use client"

import { useState, useEffect } from "react"
import { LoginForm } from "@/components/login-form"
import { MainLayout } from "@/components/main-layout"
import { authAPI } from "@/lib/api"

interface User {
  id: string
  email: string
  role: "admin" | "employee"
  name: string
  debitAmount?: number
  creditAmount?: number
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
    try {
      // Always validate with server first using HTTP-only cookie
      // This ensures we get the correct user data and prevents data leakage between admin/employee sessions
      const response = await fetch('/api/auth/validate', {
        method: 'GET',
        credentials: 'include', // Include cookies
        cache: 'no-store', // Prevent browser caching
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.user) {
          setUser(data.user)
          // User data is now managed by server cookie only, not client-side storage
        }
      } else {
        // No valid session, clear any stale state
        setUser(null)
      }
    } catch (error) {
      console.log("No valid user session")
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (email: string, password: string, userType: string) => {
    try {
      const response = await authAPI.login(email, password, userType)
      const userData = response.data.user
      setUser(userData)
      // User data is managed by HTTP-only cookie set by server, not client-side storage
      // This prevents data leakage between admin and employee sessions
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || "Login failed. Please check your credentials."
      alert(errorMessage)
      throw error
    }
  }

  const handleLogout = async () => {
    try {
      await authAPI.logout()
      // Server clears the HTTP-only cookie, so no need to clear client-side storage
    } catch (error) {
      console.error("Logout error:", error)
    } finally {
      setUser(null)
      // No sessionStorage to clear - authentication is cookie-based only
    }
  }

  // Don't render anything until mounted (prevents hydration errors)
  if (!mounted) {
    return null
  }

  if (loading) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#070A1A]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-indigo-500/25 blur-3xl" />
          <div className="absolute -bottom-48 -left-48 h-[36rem] w-[36rem] rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="absolute -bottom-48 -right-48 h-[36rem] w-[36rem] rounded-full bg-cyan-500/15 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_45%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.08),transparent_40%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:64px_64px] opacity-[0.35]" />
        </div>

        <div className="relative flex min-h-screen items-center justify-center p-4 sm:p-8">
          <div className="text-center text-white">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-white/15 border-t-white/90" />
            <p className="text-sm font-medium text-white/90">Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginForm onLogin={handleLogin} />
  }

  return <MainLayout user={user} onLogout={handleLogout} />
}
