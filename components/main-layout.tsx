"use client"

import { useState, useEffect } from "react"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Dashboard } from "@/components/pages/dashboard"
import { ProductManagement } from "@/components/pages/product-management"
import { SupplierManagement } from "@/components/pages/supplier-management"
import { PurchaseManagement } from "@/components/pages/purchase-management"
import { Inventory } from "@/components/pages/inventory"
import { CustomerManagement } from "@/components/pages/customer-management"
import { GasSales } from "@/components/pages/gas-sales"
import { EmployeeManagement } from "@/components/pages/employee-management"
import { CylinderManagement } from "@/components/pages/cylinder-management"
import { Reports } from "@/components/pages/reports"
import ProfitLoss from "@/components/pages/profit-loss"
import { EmployeeDashboard } from "@/components/pages/employee-dashboard"
import { EmployeeGasSales } from "@/components/pages/emp-gas-sale"
import { EmployeeCylinderSales } from "@/components/pages/employee-cylinder-sales"
import EmployeeReports from "@/components/pages/employee-reports"
import { EmployeeInventoryNew } from "@/components/pages/employee-inventory-new"
import { PurchaseManagement as EmployeePurchaseManagement } from "@/components/pages/purchase-emp-management"
import { Notifications } from "@/components/pages/notifications"
import { NotificationPopup } from "@/components/notification-popup"
import { LogoutConfirmation } from "@/components/logout-confirmation"
import { authAPI } from "@/lib/api"
import { AdminSignatureDialog } from "@/components/admin-signature-dialog"
import { CollectionPage } from "@/components/pages/collection"
import { RentalCollection } from "@/components/pages/rental-collection"
import { InvoiceSettingsDialog } from "@/components/invoice-settings-dialog"
import { DailyStockReport } from "@/components/pages/daily-stock-report"
import EmployeeDSR from "@/components/pages/employee-dsr"

interface MainLayoutProps {
  user: {
    id: string
    email: string
    role: "admin" | "employee"
    name: string
    debitAmount?: number
    creditAmount?: number
  }
  onLogout: () => void
}

export function MainLayout({ user, onLogout }: MainLayoutProps) {
  const [currentPage, setCurrentPage] = useState("dashboard")
  const [mounted, setMounted] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false)
  const [creditAmount, setCreditAmount] = useState(0)
  const [debitAmount, setDebitAmount] = useState(0)
  const [showAdminSignatureDialog, setShowAdminSignatureDialog] = useState(false)
  const [showInvoiceSettings, setShowInvoiceSettings] = useState(false)

  useEffect(() => {
    // Initialize current page from URL on mount
    const urlParams = new URLSearchParams(window.location.search)
    const pageParam = urlParams.get('page')
    if (pageParam) {
      setCurrentPage(pageParam)
    } else {
      // If no page parameter, default to appropriate dashboard based on user role
      setCurrentPage(user.role === 'admin' ? 'dashboard' : 'employee-dashboard')
    }
    setMounted(true)
  }, [user.role])

  // Update URL when page changes
  useEffect(() => {
    if (mounted) {
      const url = new URL(window.location.href)
      
      // Always set the page parameter to maintain state on refresh
      url.searchParams.set('page', currentPage)
      
      // Use replaceState instead of pushState to avoid creating browser history entries
      window.history.replaceState({}, '', url)
    }
  }, [currentPage, mounted])

  // Check for invoice settings on admin login
  useEffect(() => {
    const checkInvoiceSettings = async () => {
      if (user?.role === 'admin') {
        try {
          const res = await fetch('/api/invoice-settings')
          const data = await res.json()
          if (data.needsStartingNumber) {
            setShowInvoiceSettings(true)
          }
        } catch (error) {
          console.error('Failed to check invoice settings:', error)
        }
      }
    }

    if (mounted) {
      checkInvoiceSettings()
    }
  }, [mounted, user?.role])

  // Fetch employee financial data if user is an employee
  useEffect(() => {
    const fetchEmployeeFinancialData = async () => {
      if (user?.role === "employee" && user?.id) {
        try {
          const response = await fetch(`/api/employee-sales?employeeId=${user.id}`)
          const salesData = await response.json().catch(() => ({}))
          const salesArray = Array.isArray(salesData)
            ? salesData
            : Array.isArray(salesData?.data)
              ? salesData.data
              : []
          
          // Calculate Debit (Total Amount) and Credit (Received Amount)
          const debit = salesArray.reduce((sum: number, sale: any) => sum + (Number(sale.totalAmount) || 0), 0)
          const credit = salesArray.reduce((sum: number, sale: any) => sum + (Number(sale.receivedAmount) || 0), 0)
          
          setDebitAmount(debit)
          setCreditAmount(credit)
        } catch (error) {
          console.error("Failed to fetch employee financial data:", error)
          setDebitAmount(0)
          setCreditAmount(0)
        }
      }
    }

    fetchEmployeeFinancialData()
  }, [user?.id, user?.role])

  // Prompt admin to capture signature post login if not already saved
  useEffect(() => {
    if (!mounted) return
    if (user?.role === "admin") {
      try {
        const sig = typeof window !== 'undefined' ? localStorage.getItem("adminSignature") : null
        if (!sig) {
          setShowAdminSignatureDialog(true)
        }
      } catch (e) {
        // If localStorage is unavailable, still prompt
        setShowAdminSignatureDialog(true)
      }
    } else {
      setShowAdminSignatureDialog(false)
    }
  }, [mounted, user?.role])

  const handleLogoutClick = () => {
    setShowLogoutConfirmation(true)
  }

  const handleLogoutConfirm = async () => {
    setShowLogoutConfirmation(false)
    try {
      await authAPI.logout()
    } catch (error) {
      console.error("Logout error:", error)
    } finally {
      onLogout()
    }
  }

  const handleLogoutCancel = () => {
    setShowLogoutConfirmation(false)
  }

  const renderPage = () => {
    if (user.role === "employee") {
      switch (currentPage) {
        case "employee-gas-sales":
          return <EmployeeGasSales user={user} />
        case "employee-cylinder-sales":
          return <EmployeeCylinderSales user={user} />
        case "employee-inventory":
          return <EmployeeInventoryNew user={user} />
        case "employee-reports":
          return <EmployeeReports user={user} />
        case "employee-daily-stock-report":
          return <EmployeeDSR user={user} />
        case "notifications":
          return <Notifications user={user} setUnreadCount={setUnreadCount} />
        case "collection":
          return <CollectionPage user={user} />
        case "employee-purchases":
          return <EmployeePurchaseManagement />
        case "dashboard":
        default:
          return <EmployeeDashboard user={user} setUnreadCount={setUnreadCount} />
      }
    }

    switch (currentPage) {
      case "dashboard":
        return <Dashboard />
      case "products":
        return <ProductManagement />
      case "suppliers":
        return <SupplierManagement />
      case "purchases":
        return <PurchaseManagement />
      case "inventory":
        return <Inventory />
      case "customers":
        return <CustomerManagement />
      case "sales":
        return <GasSales />
      case "employees":
        return <EmployeeManagement user={user} />
      case "cylinders":
        return <CylinderManagement />
      case "reports":
        return <Reports />
      case "daily-stock-report":
        return <DailyStockReport user={user} />
      case "profit-loss":
        return <ProfitLoss />
      case "collection":
        return <CollectionPage user={user} />
      case "rental-collection":
        return <RentalCollection />
      default:
        return <Dashboard />
    }
  }

  // Don't render until mounted
  if (!mounted) {
    return null
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gray-50">
        {/* Hide sidebar on mobile while logout dialog is open for a clear view */}
        <div className={showLogoutConfirmation ? "hidden lg:block" : undefined}>
          <AppSidebar 
            currentPage={currentPage} 
            onPageChange={setCurrentPage} 
            user={user} 
            onLogout={handleLogoutClick} 
            unreadCount={unreadCount} 
            setUnreadCount={setUnreadCount} 
            creditAmount={creditAmount} 
            debitAmount={debitAmount} 
          />
        </div>
        <main className="flex-1 overflow-auto">
          <div className="pt-16 lg:pt-0 p-3 sm:p-4 lg:p-6 xl:p-8">{renderPage()}</div>
        </main>
        {/* Global notification popup for employees */}
        <NotificationPopup user={user} />
        
        {/* Logout confirmation popup */}
        <LogoutConfirmation 
          isOpen={showLogoutConfirmation}
          onConfirm={handleLogoutConfirm}
          onCancel={handleLogoutCancel}
          userName={user.name}
        />

        {/* Admin signature capture dialog (post-login, once) */}
        <AdminSignatureDialog 
          isOpen={showAdminSignatureDialog}
          onClose={() => setShowAdminSignatureDialog(false)}
          onSave={() => {
            // no-op; saved in component and localStorage
          }}
        />

        {/* Invoice settings dialog (first time setup) */}
        <InvoiceSettingsDialog 
          isOpen={showInvoiceSettings}
          onClose={() => setShowInvoiceSettings(false)}
        />
      </div>
    </SidebarProvider>
  )
}