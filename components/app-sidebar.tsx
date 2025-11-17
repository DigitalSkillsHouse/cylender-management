"use client"

import {
  Package,
  Truck,
  ShoppingCart,
  Warehouse,
  Users,
  Fuel,
  UserCheck,
  Cylinder,
  FileText,
  LogOut,
  Home,
  Bell,
  Menu,
  TrendingUp,
  Receipt,
  BarChart3,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { useState, useEffect } from "react"
import { notificationsAPI } from "@/lib/api"

interface AppSidebarProps {
  currentPage: string
  onPageChange: (page: string) => void
  user: { id: string; email: string; role: "admin" | "employee"; name: string }
  onLogout: () => void
  unreadCount?: number
  setUnreadCount?: (count: number) => void
  creditAmount?: number
  debitAmount?: number
}

const adminMenuItems = [
  {
    title: "Dashboard",
    url: "dashboard",
    icon: Home,
  },
  {
    title: "Product Management",
    url: "products",
    icon: Package,
  },
  {
    title: "Supplier Management",
    url: "suppliers",
    icon: Truck,
  },
  {
    title: "Purchase Management",
    url: "purchases",
    icon: ShoppingCart,
  },
  {
    title: "Inventory",
    url: "inventory",
    icon: Warehouse,
  },
  {
    title: "Gas Sales",
    url: "sales",
    icon: Fuel,
  },
  {
    title: "Cylinder Management",
    url: "cylinders",
    icon: Cylinder,
  },
  {
    title: "Customer Management",
    url: "customers",
    icon: Users,
  },
  {
    title: "Employee Management",
    url: "employees",
    icon: UserCheck,
  },
  {
    title: "Daily Stock Report",
    url: "daily-stock-report",
    icon: BarChart3,
  },
  {
    title: "Reports",
    url: "reports",
    icon: FileText,
  },
  {
    title: "Collection",
    url: "collection",
    icon: Receipt,
  },
  {
    title: "Rental Collection",
    url: "rental-collection",
    icon: FileText,
  },
  {
    title: "P&L",
    url: "profit-loss",
    icon: TrendingUp,
  },
]

const employeeMenuItems = [
  {
    title: "Dashboard",
    url: "dashboard",
    icon: Home,
  },
  {
    title: "Gas Sales",
    url: "employee-gas-sales",
    icon: Fuel,
  },
  {
    title: "Cylinder Sales",
    url: "employee-cylinder-sales",
    icon: Cylinder,
  },
  {
    title: "My Inventory",
    url: "employee-inventory",
    icon: Warehouse,
  },
  {
    title: "Purchase Management",
    url: "employee-purchases",
    icon: ShoppingCart,
  },
  {
    title: "Reports",
    url: "employee-reports",
    icon: FileText,
  },
  {
    title: "Daily Stock Report",
    url: "employee-daily-stock-report",
    icon: BarChart3,
  },
  {
    title: "Notifications",
    url: "notifications",
    icon: Bell,
  },
  {
    title: "Collection",
    url: "collection",
    icon: Receipt,
  },
]

export function AppSidebar({ currentPage, onPageChange, user, onLogout, unreadCount: externalUnreadCount, setUnreadCount, creditAmount = 0, debitAmount = 0 }: AppSidebarProps) {
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setLocalUnreadCount] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (user?.id) {
      fetchNotifications()
    }
  }, [user?.id])

  const fetchNotifications = async () => {
    try {
      const response = await notificationsAPI.getAll(user.id)
      setNotifications(response.data || [])
      const count = (response.data || []).filter((n: any) => !n.isRead).length
      setLocalUnreadCount(count)
      if (setUnreadCount) setUnreadCount(count)
    } catch (error) {
      console.error("Failed to fetch notifications:", error)
      setNotifications([])
      setLocalUnreadCount(0)
      if (setUnreadCount) setUnreadCount(0)
    }
  }

  const handlePageChange = (page: string) => {
    onPageChange(page)
    setMobileOpen(false)
  }

  const menuItems = user?.role === "admin" ? adminMenuItems : employeeMenuItems

  const effectiveUnreadCount = externalUnreadCount !== undefined ? externalUnreadCount : unreadCount

  const SidebarContentComponent = () => (
    <>
      <SidebarHeader className="p-4 sm:p-6 border-b border-white/10" style={{ backgroundColor: "#2B3068" }}>
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shadow-lg"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          >
            <Fuel className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-sm sm:text-lg text-white truncate">SYED TAYYAB INDUSTRIAL</h2>
            <p className="text-xs text-white/70">{user?.role === "admin" ? "Admin Panel" : "Employee Panel"}</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="flex-1 px-3 py-4 overflow-y-auto" style={{ backgroundColor: "#2B3068" }}>
        <SidebarGroup>
          <SidebarGroupLabel className="text-white/80 font-semibold mb-4 text-xs uppercase tracking-wider px-2">
            {user?.role === "admin" ? "Management" : "My Dashboard"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    isActive={currentPage === item.url}
                    onClick={() => handlePageChange(item.url)}
                    className="text-white hover:bg-white/10 hover:text-white data-[active=true]:bg-white/20 data-[active=true]:text-white rounded-lg transition-all duration-200 py-2 text-sm"
                  >
                    <item.icon className="w-4 h-4" />
                    <span className="font-medium truncate">{item.title}</span>
                    {item.url === "notifications" && effectiveUnreadCount > 0 && (
                      <Badge variant="secondary" className="ml-auto bg-red-500 text-white text-xs px-2 py-1">
                        {effectiveUnreadCount}
                      </Badge>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-white/10" style={{ backgroundColor: "#2B3068" }}>
        <div className="space-y-3">
          <div className="bg-white/10 rounded-lg p-3">
            <div className="text-sm text-white/90 font-medium truncate">{user?.name || "User"}</div>
            <div className="text-xs text-white/70 mb-2 truncate">{user?.email || ""}</div>
            {user?.role === "employee" && (
              <div className="flex justify-between text-xs">
                <span className="text-green-300">Credit: AED {creditAmount.toFixed(2)}</span>
                <span className="text-red-300">Debit: AED {debitAmount.toFixed(2)}</span>
              </div>
            )}
          </div>
          <Button
            onClick={onLogout}
            variant="outline"
            className="w-full justify-start bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white transition-all duration-200 text-sm"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </SidebarFooter>
    </>
  )

  return (
    <>
      {/* Mobile Header - Only visible on mobile */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#2B3068] border-b border-white/10 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          >
            <Fuel className="w-4 h-4 text-white" />
          </div>
          <h2 className="font-bold text-white text-sm">SYED TAYYAB INDUSTRIAL</h2>
        </div>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-80" style={{ backgroundColor: "#2B3068" }}>
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            <SheetDescription className="sr-only">
              Navigation menu for SYED TAYYAB INDUSTRIAL management system
            </SheetDescription>
            <div className="flex flex-col h-full">
              <SidebarContentComponent />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Spacer for mobile header */}
      <div className="h-16 lg:hidden" />

      {/* Desktop Sidebar */}
      <Sidebar
        className="border-r-0 shadow-lg hidden lg:flex"
        style={{
          backgroundColor: "#2B3068",
          borderRight: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <SidebarContentComponent />
      </Sidebar>
    </>
  )
}
