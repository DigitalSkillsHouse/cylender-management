"use client"

import { useEffect, useState, useRef } from "react"
import { UpdatePrompt } from "./UpdatePrompt"

export default function ServiceWorkerRegister() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)
  const [isDismissed, setIsDismissed] = useState(false)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator)) return

    const isLocalhost = Boolean(
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "[::1]"
    )

    // Register only in production or localhost (for your testing)
    const shouldRegister = process.env.NODE_ENV === "production" || isLocalhost
    if (!shouldRegister) return

    const checkForUpdates = async (reg: ServiceWorkerRegistration) => {
      try {
        await reg.update()
        console.log("[PWA] Checked for service worker updates")
      } catch (error) {
        console.warn("[PWA] Error checking for updates:", error)
      }
    }

    const checkWaitingWorker = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        // There's a waiting service worker
        console.log("[PWA] Waiting service worker found")
        setWaitingWorker(reg.waiting)
        setUpdateAvailable(true)
        setIsDismissed(false)
      }
    }

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { 
          scope: "/",
          updateViaCache: "none" // Always check for updates
        })
        registrationRef.current = registration
        console.log("[PWA] Service worker registered")

        // Check if there's already a waiting service worker
        checkWaitingWorker(registration)

        // Check for updates immediately
        await checkForUpdates(registration)

        // Check for updates every 5 minutes
        updateIntervalRef.current = setInterval(async () => {
          if (registrationRef.current) {
            await checkForUpdates(registrationRef.current)
            // Re-check for waiting worker after update check
            if (registrationRef.current) {
              checkWaitingWorker(registrationRef.current)
            }
          }
        }, 5 * 60 * 1000) // 5 minutes

        // Listen for service worker updates
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed") {
                if (navigator.serviceWorker.controller) {
                  // New service worker is installed and waiting
                  console.log("[PWA] New service worker installed and waiting")
                  setWaitingWorker(newWorker)
                  setUpdateAvailable(true)
                  setIsDismissed(false)
                } else {
                  // First time installation
                  console.log("[PWA] Service worker installed for the first time")
                }
              }
            })
          }
        })

        // Listen for controller change (when update is activated)
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          console.log("[PWA] Service worker controller changed - reloading page")
          // Clear the update interval
          if (updateIntervalRef.current) {
            clearInterval(updateIntervalRef.current)
          }
          // Hard reload to get the new version
          window.location.reload()
        })

      } catch (err) {
        console.warn("[PWA] Service worker registration failed:", err)
      }
    }

    register()

    // Cleanup on unmount
    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current)
      }
    }
  }, [])

  const handleUpdate = () => {
    if (waitingWorker) {
      // Tell the waiting service worker to skip waiting and activate
      waitingWorker.postMessage({ type: "SKIP_WAITING" })
      
      // The controllerchange event will trigger a reload
      // But add a fallback reload after a short delay
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } else {
      // Fallback: just reload the page
      window.location.reload()
    }
  }

  const handleDismiss = () => {
    setIsDismissed(true)
    setUpdateAvailable(false)
    // Show again after 1 hour
    setTimeout(() => {
      setIsDismissed(false)
      if (waitingWorker) {
        setUpdateAvailable(true)
      }
    }, 60 * 60 * 1000) // 1 hour
  }

  if (!updateAvailable || isDismissed) {
    return null
  }

  return <UpdatePrompt onUpdate={handleUpdate} onDismiss={handleDismiss} />
}
