import { useState, useEffect, useCallback } from 'react'

interface Notification {
  _id: string
  userId: string
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
  sender?: {
    name: string
    email: string
  }
}

interface UseNotificationsOptions {
  userId: string
  types?: string[]
  unreadOnly?: boolean
  pollInterval?: number // in milliseconds, default 30000 (30 seconds)
}

interface UseNotificationsReturn {
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  error: string | null
  markAsRead: (notificationId: string) => Promise<void>
  refresh: () => Promise<void>
}

// Global cache to prevent duplicate requests
const notificationCache = new Map<string, {
  data: Notification[]
  timestamp: number
  promise?: Promise<Notification[]>
}>()

const CACHE_DURATION = 10000 // 10 seconds cache

export function useNotifications(options: UseNotificationsOptions): UseNotificationsReturn {
  const { userId, types, unreadOnly = false, pollInterval = 30000 } = options
  
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create cache key based on options
  const cacheKey = `${userId}-${types?.join(',') || 'all'}-${unreadOnly}`

  const fetchNotifications = useCallback(async (): Promise<Notification[]> => {
    // Check cache first
    const cached = notificationCache.get(cacheKey)
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      return cached.data
    }

    // If there's already a pending request, return that promise
    if (cached?.promise) {
      return cached.promise
    }

    // Build query parameters
    const params = new URLSearchParams({
      userId,
      ...(unreadOnly && { unread: 'true' }),
      ...(types && { type: types.join(',') })
    })

    const fetchPromise = fetch(`/api/notifications?${params}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const data = await response.json()
        return Array.isArray(data) ? data : []
      })
      .catch((err) => {
        console.error('Failed to fetch notifications:', err)
        throw err
      })

    // Cache the promise
    notificationCache.set(cacheKey, {
      data: [],
      timestamp: Date.now(),
      promise: fetchPromise
    })

    try {
      const data = await fetchPromise
      
      // Update cache with actual data
      notificationCache.set(cacheKey, {
        data,
        timestamp: Date.now()
      })
      
      return data
    } catch (err) {
      // Remove failed promise from cache
      notificationCache.delete(cacheKey)
      throw err
    }
  }, [userId, types, unreadOnly, cacheKey])

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Clear cache to force fresh data
      notificationCache.delete(cacheKey)
      
      const data = await fetchNotifications()
      setNotifications(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch notifications')
    } finally {
      setLoading(false)
    }
  }, [fetchNotifications, cacheKey])

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to mark notification as read: ${response.status}`)
      }

      // Update local state
      setNotifications(prev => 
        prev.map(notification => 
          notification._id === notificationId 
            ? { ...notification, isRead: true }
            : notification
        )
      )

      // Clear cache to ensure fresh data on next fetch
      notificationCache.delete(cacheKey)
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
      throw err
    }
  }, [cacheKey])

  // Initial fetch and polling setup
  useEffect(() => {
    let isMounted = true
    let intervalId: NodeJS.Timeout

    const poll = async () => {
      if (!isMounted) return
      
      try {
        const data = await fetchNotifications()
        if (isMounted) {
          setNotifications(data)
          setError(null)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch notifications')
        }
      }
    }

    // Initial fetch
    poll()

    // Set up polling with longer interval to reduce database load
    if (pollInterval > 0) {
      intervalId = setInterval(poll, pollInterval)
    }

    return () => {
      isMounted = false
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [fetchNotifications, pollInterval])

  const unreadCount = notifications.filter(n => !n.isRead).length

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    refresh
  }
}
