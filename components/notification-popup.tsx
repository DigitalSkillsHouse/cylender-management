"use client"

import { useState, useEffect } from "react"
import { Bell, CheckCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface NotificationPopupProps {
  user: {
    id: string
    name: string
    role: "admin" | "employee"
  }
}

interface Notification {
  _id: string
  title: string
  message: string
  type: string
  isRead: boolean
  createdAt: string
  sender?: {
    name: string
  }
}

export const NotificationPopup = ({ user }: NotificationPopupProps) => {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [visibleNotification, setVisibleNotification] = useState<Notification | null>(null)
  const [lastChecked, setLastChecked] = useState<Date>(new Date())

  useEffect(() => {
    // Only show popups for employees
    if (user.role !== "employee") return

    // Initial check on mount only - no continuous polling
    // Notifications will be checked when user navigates or after actions
    checkForNewNotifications()

    // Listen for custom events to refresh notifications (event-driven)
    const handleNotificationEvent = () => {
      checkForNewNotifications()
    }
    window.addEventListener('notification-refresh', handleNotificationEvent)

    return () => {
      window.removeEventListener('notification-refresh', handleNotificationEvent)
    }
  }, [user.id, user.role])

  const checkForNewNotifications = async () => {
    try {
      const response = await fetch(`/api/notifications?userId=${user.id}&unread=true`)
      if (response.ok) {
        const data = await response.json()
        
        // Filter notifications that are newer than last check
        const newNotifications = data.filter((notification: Notification) => 
          new Date(notification.createdAt) > lastChecked && !notification.isRead
        )

        if (newNotifications.length > 0) {
          // Show the most recent notification as popup
          const latestNotification = newNotifications[0]
          setVisibleNotification(latestNotification)
          
          // Auto-hide after 8 seconds
          setTimeout(() => {
            setVisibleNotification(null)
          }, 8000)

          // Mark notification as read after showing
          setTimeout(() => {
            markAsRead(latestNotification._id)
          }, 2000)
        }

        setNotifications(data)
        setLastChecked(new Date())
      }
    } catch (error) {
      console.error('Failed to check notifications:', error)
    }
  }

  const markAsRead = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isRead: true }),
      })
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  const handleDismiss = () => {
    if (visibleNotification) {
      markAsRead(visibleNotification._id)
      setVisibleNotification(null)
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'stock_assignment':
        return <Bell className="w-5 h-5" />
      default:
        return <CheckCircle className="w-5 h-5" />
    }
  }

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'stock_assignment':
        return 'bg-blue-500'
      default:
        return 'bg-green-500'
    }
  }

  // Only render for employees and when there's a visible notification
  if (user.role !== "employee" || !visibleNotification) {
    return null
  }

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm w-full">
      <div className={`${getNotificationColor(visibleNotification.type)} text-white px-6 py-4 rounded-lg shadow-lg animate-in slide-in-from-right duration-300`}>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {getNotificationIcon(visibleNotification.type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-sm">{visibleNotification.title}</h4>
              <Badge variant="secondary" className="bg-white/20 text-white text-xs">
                New
              </Badge>
            </div>
            <p className="text-sm text-white/90 mb-2 line-clamp-2">
              {visibleNotification.message}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/70">
                From: {visibleNotification.sender?.name || 'System'}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                className="text-white hover:bg-white/20 h-6 w-6 p-0"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
