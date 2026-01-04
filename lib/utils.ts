import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

/**
 * Format number to exactly 2 decimal places without rounding
 * Shows exact figure with 2 decimal places (e.g., 30 becomes 30.00)
 */
export const formatCurrencyExact = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return "0.00"
  }
  // Use toFixed to ensure exactly 2 decimal places
  const formatted = Number(amount).toFixed(2)
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