/**
 * Utility functions for managing employee signature
 * Fetches from database first, falls back to localStorage
 */

/**
 * Fetch employee signature from database, with localStorage fallback
 * @param employeeId - The employee's user ID
 * @returns Promise<string | null> - Base64 signature data or null
 */
export async function fetchEmployeeSignature(employeeId: string): Promise<string | null> {
  if (!employeeId) return null

  try {
    // Try to fetch from database first
    const response = await fetch(`/api/employee-signature?employeeId=${employeeId}`, {
      cache: "no-store",
    })

    if (response.ok) {
      const data = await response.json()
      if (data.success && data.data?.signature) {
        // Save to localStorage as cache/fallback
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(`employeeSignature_${employeeId}`, data.data.signature)
          } catch (e) {
            console.warn("Failed to cache employee signature in localStorage", e)
          }
        }
        return data.data.signature
      }
    }
  } catch (error) {
    console.warn("Failed to fetch employee signature from database:", error)
  }

  // Fallback to localStorage
  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(`employeeSignature_${employeeId}`)
      if (cached) {
        return cached
      }
    } catch (e) {
      console.warn("Failed to read employee signature from localStorage", e)
    }
  }

  return null
}

/**
 * Get employee signature synchronously from localStorage (for immediate use)
 * Use fetchEmployeeSignature() for database-first approach
 * @param employeeId - The employee's user ID
 * @returns string | null
 */
export function getEmployeeSignatureSync(employeeId: string): string | null {
  if (typeof window === "undefined" || !employeeId) return null
  try {
    return localStorage.getItem(`employeeSignature_${employeeId}`)
  } catch (e) {
    console.warn("Failed to read employee signature from localStorage", e)
    return null
  }
}

