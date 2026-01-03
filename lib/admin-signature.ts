/**
 * Utility functions for managing admin signature
 * Fetches from database first, falls back to localStorage
 */

/**
 * Fetch admin signature from database, with localStorage fallback
 * @returns Promise<string | null> - Base64 signature data or null
 */
export async function fetchAdminSignature(): Promise<string | null> {
  try {
    // Try to fetch from database first
    const response = await fetch("/api/admin-signature", {
      cache: "no-store",
    })

    if (response.ok) {
      const data = await response.json()
      if (data.success && data.data?.signature) {
        // Save to localStorage as cache/fallback
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("adminSignature", data.data.signature)
          } catch (e) {
            console.warn("Failed to cache admin signature in localStorage", e)
          }
        }
        return data.data.signature
      }
    }
  } catch (error) {
    console.warn("Failed to fetch admin signature from database:", error)
  }

  // Fallback to localStorage
  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem("adminSignature")
      if (cached) {
        return cached
      }
    } catch (e) {
      console.warn("Failed to read admin signature from localStorage", e)
    }
  }

  return null
}

/**
 * Get admin signature synchronously from localStorage (for immediate use)
 * Use fetchAdminSignature() for database-first approach
 * @returns string | null
 */
export const getAdminSignatureSync = (): string | null => {
  if (typeof window === "undefined") return null
  try {
    return localStorage.getItem("adminSignature")
  } catch (e) {
    console.warn("Failed to read admin signature from localStorage", e)
    return null
  }
}

