"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bell, Check, Trash2 } from "lucide-react"
import { notificationsAPI } from "@/lib/api"

interface NotificationsProps {
  user: { id: string; name: string }
  setUnreadCount?: (count: number) => void
}

export function Notifications({ user, setUnreadCount }: NotificationsProps) {
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetchNotifications()
  }, [user.id])

  const fetchNotifications = async () => {
    try {
      const response = await notificationsAPI.getAll(user.id)
      setNotifications(response.data)
      if (setUnreadCount) setUnreadCount((response.data || []).filter((n: any) => !n.isRead).length)
    } catch (error) {
      console.error("Failed to fetch notifications:", error)
      if (setUnreadCount) setUnreadCount(0)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (id: string) => {
    setMarkingId(id);
    try {
      await notificationsAPI.markAsRead(id);
      setNotifications(notifications.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
      if (setUnreadCount) setUnreadCount((notifications.filter((n) => !n.isRead && n._id !== id).length));
    } catch (error) {
      console.error("Failed to mark as read:", error);
    } finally {
      setMarkingId(null);
    }
  };

  const deleteNotification = async (id: string) => {
    setDeletingId(id);
    try {
      await notificationsAPI.delete(id);
      const updatedNotifications = notifications.filter((n) => n._id !== id);
      setNotifications(updatedNotifications);
      if (setUnreadCount) setUnreadCount(updatedNotifications.filter((n) => !n.isRead).length);
    } catch (error) {
      console.error("Failed to delete notification:", error);
    } finally {
      setDeletingId(null);
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] rounded-2xl p-8 text-white">
        <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
          <Bell className="w-8 h-8" />
          Notifications
        </h1>
        <p className="text-white/80 text-lg">
          You have {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
        </p>
      </div>

      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-[#2B3068] to-[#1a1f4a] text-white rounded-t-lg">
          <CardTitle className="flex items-center justify-between">
            <span>All Notifications</span>
            <Badge variant="secondary" className="bg-white/20 text-white">
              {notifications.length} total
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            {notifications.map((notification) => (
              <div
                key={notification._id}
                className={`p-6 rounded-lg border transition-all duration-300 flex items-center gap-3 ${
                  notification.isRead ? "bg-gray-50 border-gray-200 opacity-60" : "bg-blue-50 border-[#2B3068] shadow-md opacity-100"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{notification.title}</h3>
                    {!notification.isRead && <Badge className="bg-[#2B3068] text-white text-xs">New</Badge>}
                    {notification.type === 'stock_returned' && notification.returnStatus && (
                      <Badge 
                        className={`text-xs ${
                          notification.returnStatus === 'pending' 
                            ? 'bg-yellow-500 text-white' 
                            : notification.returnStatus === 'received' 
                            ? 'bg-green-500 text-white' 
                            : 'bg-gray-500 text-white'
                        }`}
                      >
                        {notification.returnStatus === 'pending' ? 'Pending' : notification.returnStatus === 'received' ? 'Received' : 'Unknown'}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs capitalize">
                      {notification.type.replace("_", " ")}
                    </Badge>
                    {notification.isRead && <Check className="w-4 h-4 text-green-500 ml-2" />}
                  </div>
                  <p className="text-gray-700 mb-3">{notification.message}</p>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>From: {notification.sender?.name || "System"}</span>
                    <span>•</span>
                    <span>{new Date(notification.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  {!notification.isRead && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markAsRead(notification._id)}
                      className="border-[#2B3068] text-[#2B3068] hover:bg-[#2B3068] hover:text-white"
                      disabled={markingId === notification._id || deletingId === notification._id}
                      title="Mark as read"
                    >
                      {markingId === notification._id ? (
                        <span className="animate-spin"><Check className="w-4 h-4" /></span>
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteNotification(notification._id)}
                    className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                    disabled={deletingId === notification._id || markingId === notification._id}
                    title="Delete notification"
                  >
                    {deletingId === notification._id ? (
                      <span className="animate-spin"><Trash2 className="w-4 h-4" /></span>
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
            {notifications.length === 0 && (
              <div className="text-center py-12">
                <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No notifications yet</h3>
                <p className="text-gray-500">You'll see notifications here when you receive new messages or updates.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
