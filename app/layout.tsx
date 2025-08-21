import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Toaster } from "@/components/ui/sonner"
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister"
import InstallAppPrompt from "@/components/pwa/InstallAppPrompt"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "SYED TAYYAB INDUSTRIAL - Gas Management System",
  description: "Professional gas and cylinder management system",
    generator: 'v0.dev',
    manifest: "/manifest.json",
    themeColor: "#2B3068",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        {children}
        <Toaster />
        <ServiceWorkerRegister />
        <InstallAppPrompt />
      </body>
    </html>
  )
}
