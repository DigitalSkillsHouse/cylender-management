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
      // Check if user data exists in sessionStorage first
      const savedUser = sessionStorage.getItem("user")
      if (savedUser) {
        setUser(JSON.parse(savedUser))
        setLoading(false)
        return
      }

      // If no sessionStorage, try to validate with server using cookie
      const response = await fetch('/api/auth/validate', {
        method: 'GET',
        credentials: 'include', // Include cookies
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.user) {
          setUser(data.user)
          // Save to sessionStorage for faster subsequent loads
          sessionStorage.setItem("user", JSON.stringify(data.user))
        }
      }
    } catch (error) {
      console.log("No valid user session")
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (email: string, password: string) => {
    try {
      const response = await authAPI.login(email, password)
      const userData = response.data.user
      setUser(userData)

      // Save user data to sessionStorage to persist across page refreshes
      sessionStorage.setItem("user", JSON.stringify(userData))
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || "Login failed. Please check your credentials."
      alert(errorMessage)
      throw error
    }
  }

  const handleLogout = async () => {
    try {
      await authAPI.logout()
    } catch (error) {
      console.error("Logout error:", error)
    } finally {
      setUser(null)
      sessionStorage.removeItem("user")
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
