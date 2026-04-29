"use client"

import { useEffect, useState } from "react"
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

interface HomePageClientProps {
  initialUser: User | null
}

export function HomePageClient({ initialUser }: HomePageClientProps) {
  const [user, setUser] = useState<User | null>(initialUser)

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await fetch("/api/auth/validate", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        })

        const data = await response.json().catch(() => ({}))
        if (response.ok && data?.authenticated && data?.user) {
          setUser(data.user)
          try {
            localStorage.setItem("user_snapshot", JSON.stringify(data.user))
          } catch {}
        } else {
          setUser(null)
          try {
            localStorage.removeItem("user_snapshot")
          } catch {}
        }
      } catch {
        // Keep existing UI state on transient network errors.
      }
    }

    checkAuthStatus()

    const onAuthExpired = () => {
      setUser(null)
      try {
        localStorage.removeItem("user_snapshot")
      } catch {}
    }

    window.addEventListener("auth-expired", onAuthExpired)
    return () => window.removeEventListener("auth-expired", onAuthExpired)
  }, [])

  const handleLogin = async (email: string, password: string, userType: string) => {
    try {
      const response = await authAPI.login(email, password, userType)
      const userData = response.data.user
      setUser(userData)
      try {
        localStorage.setItem("user_snapshot", JSON.stringify(userData))
      } catch {}
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
      try {
        localStorage.removeItem("user_snapshot")
      } catch {}
    }
  }

  if (!user) {
    return <LoginForm onLogin={handleLogin} />
  }

  return <MainLayout user={user} onLogout={handleLogout} />
}
