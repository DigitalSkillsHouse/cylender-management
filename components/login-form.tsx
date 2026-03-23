"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Fuel, AlertCircle } from "lucide-react"
import { authAPI } from "@/lib/api"

interface LoginFormProps {
  onLogin: (email: string, password: string, userType: string) => Promise<void>
}

export const LoginForm = ({ onLogin }: LoginFormProps) => {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [userType, setUserType] = useState("admin")
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const [error, setError] = useState("")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    initializeAdmin()
  }, [])

  const initializeAdmin = async () => {
    try {
      setInitializing(true)
      await authAPI.initAdmin()
    } catch (error) {
      console.log("Admin initialization:", error)
    } finally {
      setInitializing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      await onLogin(email, password, userType)
    } catch (error: any) {
      setError(error.response?.data?.error || "Login failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleUserTypeChange = (type: string) => {
    setUserType(type)
    setError("")
    if (type === "admin") {
      setEmail("")
      setPassword("")
    } else {
      setEmail("")
      setPassword("")
    }
  }

  // Don't render until mounted
  if (!mounted) {
    return null
  }

  if (initializing) {
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
          <Card className="w-full max-w-md overflow-hidden border-white/10 bg-white/[0.06] shadow-[0_30px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
            <CardContent className="p-8 text-center">
              <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </div>
              <p className="text-sm font-medium text-white/90">Initializing system...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

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
        <Card className="w-full max-w-4xl overflow-hidden border-white/10 bg-white/[0.06] shadow-[0_30px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
          <div className="grid md:grid-cols-2">
            <div className="relative p-8 sm:p-10 text-white">
              <div className="absolute inset-0 bg-[url('/login-industrial.svg')] bg-cover bg-center opacity-[0.55]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.28),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(236,72,153,0.20),transparent_55%)]" />
              <div className="absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)] bg-[linear-gradient(to_right,rgba(255,255,255,0.10)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.10)_1px,transparent_1px)] bg-[size:52px_52px]" />

              <div className="relative">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
                  <Fuel className="h-6 w-6 text-white" />
                </div>

                <div className="mt-10">
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    SYED TAYYAB INDUSTRIAL GASES L.L.C
                  </h1>
                  <p className="mt-2 text-sm text-white/70">Gas Management System</p>
                </div>
              </div>
            </div>

            <div className="bg-white/95 p-8 sm:p-10 md:rounded-l-none">
              {error && (
                <div className="mt-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800">
                  <div className="mt-0.5 rounded-md bg-rose-100 p-1">
                    <AlertCircle className="h-4 w-4" />
                  </div>
                  <div className="text-sm leading-snug">{error}</div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="userType" className="text-sm font-medium text-slate-700">
                    User Type
                  </Label>
                  <Select value={userType} onValueChange={handleUserTypeChange}>
                    <SelectTrigger className="h-12 border-slate-200 bg-white shadow-sm focus:ring-indigo-500/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-slate-200">
                      <SelectItem value="admin">Administrator</SelectItem>
                      <SelectItem value="employee">Employee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 border-slate-200 bg-white shadow-sm placeholder:text-slate-400 focus-visible:ring-indigo-500/20"
                    placeholder="Enter your email"
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 border-slate-200 bg-white shadow-sm placeholder:text-slate-400 focus-visible:ring-indigo-500/20"
                    placeholder="Enter your password"
                    required
                    disabled={loading}
                  />
                </div>

                <Button
                  type="submit"
                  className="h-12 w-full rounded-xl bg-slate-900 text-base font-semibold text-white shadow-[0_12px_30px_rgba(15,23,42,0.25)] hover:bg-slate-800 active:scale-[0.99]"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Signing In...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>

              <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-xs text-slate-600">
                Employee accounts can be created by admin.
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
