import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

/**
 * Format number to exactly 2 decimal places without rounding (truncates instead)
 * Shows exact figure with 2 decimal places (e.g., 15.714999 becomes 15.71, not 15.72)
 */
export const formatCurrencyExact = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return "0.00"
  }
  // Truncate to 2 decimal places without rounding
  // Multiply by 100, truncate, then divide by 100 to preserve exact decimals
  const truncated = Math.trunc(Number(amount) * 100) / 100
  // Use toFixed to ensure exactly 2 decimal places (this won't round since we already truncated)
  const formatted = truncated.toFixed(2)
  return formatted
}

/**
 * Format number as currency with AED prefix, exactly 2 decimal places
 */
export const formatCurrencyAED = (amount: number | null | undefined): string => {
  const formatted = formatCurrencyExact(amount)
  return `AED ${formatted}`
}

/**
 * Format number with thousand separators and exactly 2 decimal places
 */
export const formatNumberWithSeparators = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return "0.00"
  }
  const formatted = Number(amount).toFixed(2)
  // Add thousand separators
  return formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/**
 * Round number to exactly 2 decimal places to avoid floating-point precision errors
 * Use this for all financial calculations to ensure 15+15 = 30.00, not 30.01
 */
export const roundToTwoDecimals = (value: number | null | undefined): number => {
  if (value === null || value === undefined || isNaN(value)) {
    return 0
  }
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}