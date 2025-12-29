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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#2B3068] to-[#1a1f4a]">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginForm onLogin={handleLogin} />
  }

  return <MainLayout user={user} onLogout={handleLogout} />
}
