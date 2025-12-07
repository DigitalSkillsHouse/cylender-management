/**
 * Date utility functions to handle Dubai timezone (Asia/Dubai, UTC+4)
 * This ensures dates are calculated based on Dubai time, not UTC or server local time
 * Since the software is primarily used in Dubai, all dates should be in Dubai timezone
 */

/**
 * Convert a Date to Dubai timezone and get date components
 * @param {Date} date - Date object
 * @returns {Object} Object with year, month, day in Dubai timezone
 */
function getDubaiDateComponents(date) {
  // Convert to Dubai timezone (UTC+4)
  // Format: Asia/Dubai
  const dubaiTimeString = date.toLocaleString('en-US', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  
  // Parse the formatted string (format: MM/DD/YYYY)
  const [month, day, year] = dubaiTimeString.split('/')
  return { year, month, day }
}

/**
 * Get the current Dubai date in YYYY-MM-DD format
 * @returns {string} Date string in YYYY-MM-DD format (Dubai timezone)
 */
export function getLocalDateString() {
  const now = new Date()
  const { year, month, day } = getDubaiDateComponents(now)
  return `${year}-${month}-${day}`
}

/**
 * Get the Dubai date string from a Date object in YYYY-MM-DD format
 * @param {Date|string} date - Date object or ISO string
 * @returns {string} Date string in YYYY-MM-DD format (Dubai timezone)
 */
export function getLocalDateStringFromDate(date) {
  if (!date) {
    return getLocalDateString()
  }
  
  const dateObj = date instanceof Date ? date : new Date(date)
  const { year, month, day } = getDubaiDateComponents(dateObj)
  
  return `${year}-${month}-${day}`
}

/**
 * Get the start of the current day in Dubai timezone
 * @returns {Date} Date object at start of current day (00:00:00 Dubai time)
 */
export function getStartOfToday() {
  const now = new Date()
  const { year, month, day } = getDubaiDateComponents(now)
  // Create date in Dubai timezone - convert to UTC for Date object
  // Dubai is UTC+4, so we need to subtract 4 hours to get midnight Dubai time in UTC
  const dubaiMidnight = new Date(`${year}-${month}-${day}T00:00:00+04:00`)
  return dubaiMidnight
}

/**
 * Get the end of the current day in Dubai timezone
 * @returns {Date} Date object at end of current day (23:59:59.999 Dubai time)
 */
export function getEndOfToday() {
  const now = new Date()
  const { year, month, day } = getDubaiDateComponents(now)
  // Create date in Dubai timezone - convert to UTC for Date object
  // Dubai is UTC+4, so we need to subtract 4 hours to get end of day Dubai time in UTC
  const dubaiEndOfDay = new Date(`${year}-${month}-${day}T23:59:59.999+04:00`)
  return dubaiEndOfDay
}

