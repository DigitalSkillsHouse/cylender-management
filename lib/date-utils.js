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

/**
 * Get the start of a specific date in Dubai timezone
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {Date} Date object at start of the day (00:00:00 Dubai time)
 */
export function getStartOfDate(dateString) {
  if (!dateString) {
    return getStartOfToday()
  }
  // Parse YYYY-MM-DD format
  const [year, month, day] = dateString.split('-').map(Number)
  if (!year || !month || !day) {
    return getStartOfToday()
  }
  // Create date in Dubai timezone (UTC+4)
  return new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+04:00`)
}

/**
 * Get the end of a specific date in Dubai timezone
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {Date} Date object at end of the day (23:59:59.999 Dubai time)
 */
export function getEndOfDate(dateString) {
  if (!dateString) {
    return getEndOfToday()
  }
  // Parse YYYY-MM-DD format
  const [year, month, day] = dateString.split('-').map(Number)
  if (!year || !month || !day) {
    return getEndOfToday()
  }
  // Create date in Dubai timezone (UTC+4)
  return new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T23:59:59.999+04:00`)
}

/**
 * Get date range for a date string in Dubai timezone
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {Object} Object with start and end Date objects for the day in Dubai timezone
 */
export function getDateRange(dateString) {
  return {
    start: getStartOfDate(dateString),
    end: getEndOfDate(dateString)
  }
}

/**
 * Get date range for a date range in Dubai timezone
 * @param {string} fromDate - Start date string in YYYY-MM-DD format
 * @param {string} toDate - End date string in YYYY-MM-DD format
 * @returns {Object} Object with start and end Date objects for the range in Dubai timezone
 */
export function getDateRangeForPeriod(fromDate, toDate) {
  return {
    start: getStartOfDate(fromDate),
    end: getEndOfDate(toDate)
  }
}

/**
 * Convert a date string (YYYY-MM-DD) to a Date object representing that date in Dubai timezone
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {Date} Date object at start of the day in Dubai timezone
 */
export function getDateFromString(dateString) {
  return getStartOfDate(dateString)
}

/**
 * Get current Dubai time as ISO string
 * @returns {string} ISO string of current time in Dubai timezone
 */
export function getDubaiNowISOString() {
  const now = new Date()
  // Convert to Dubai timezone
  const dubaiTimeString = now.toLocaleString('en-US', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  
  // Parse MM/DD/YYYY, HH:MM:SS format
  const [datePart, timePart] = dubaiTimeString.split(', ')
  const [month, day, year] = datePart.split('/')
  const [hour, minute, second] = timePart.split(':')
  
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+04:00`
}

/**
 * Format a date for display in Dubai timezone
 * @param {Date|string} date - Date object or ISO string
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export function formatDubaiDate(date, options = {}) {
  const dateObj = date instanceof Date ? date : new Date(date)
  return dateObj.toLocaleString('en-US', {
    timeZone: 'Asia/Dubai',
    ...options
  })
}

/**
 * Get Dubai date and time string for display
 * @param {Date|string} date - Optional date, defaults to now
 * @returns {string} Formatted date and time string
 */
export function getDubaiDateTimeString(date = null) {
  const dateObj = date ? (date instanceof Date ? date : new Date(date)) : new Date()
  return formatDubaiDate(dateObj, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

/**
 * Get Dubai date string for display (localized format)
 * @param {Date|string} date - Optional date, defaults to now
 * @returns {string} Formatted date string
 */
export function getDubaiDateDisplayString(date = null) {
  const dateObj = date ? (date instanceof Date ? date : new Date(date)) : new Date()
  return formatDubaiDate(dateObj, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

/**
 * Add days to a date string in Dubai timezone
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @param {number} days - Number of days to add (can be negative to subtract)
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function addDaysToDate(dateString, days) {
  if (!dateString) {
    dateString = getLocalDateString()
  }
  const date = getStartOfDate(dateString)
  // Add days in milliseconds
  const newDate = new Date(date.getTime() + (days * 24 * 60 * 60 * 1000))
  return getLocalDateStringFromDate(newDate)
}

/**
 * Get previous day's date string in Dubai timezone
 * @param {string} dateString - Date string in YYYY-MM-DD format (optional, defaults to today)
 * @returns {string} Previous day's date string in YYYY-MM-DD format
 */
export function getPreviousDate(dateString = null) {
  return addDaysToDate(dateString || getLocalDateString(), -1)
}

/**
 * Get next day's date string in Dubai timezone
 * @param {string} dateString - Date string in YYYY-MM-DD format (optional, defaults to today)
 * @returns {string} Next day's date string in YYYY-MM-DD format
 */
export function getNextDate(dateString = null) {
  return addDaysToDate(dateString || getLocalDateString(), 1)
}

/**
 * Check if a date string matches today in Dubai timezone
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {boolean} True if the date is today
 */
export function isToday(dateString) {
  return dateString === getLocalDateString()
}

/**
 * Compare two date strings (YYYY-MM-DD format) in Dubai timezone
 * @param {string} date1 - First date string
 * @param {string} date2 - Second date string
 * @returns {number} Negative if date1 < date2, 0 if equal, positive if date1 > date2
 */
export function compareDates(date1, date2) {
  const d1 = getStartOfDate(date1)
  const d2 = getStartOfDate(date2)
  return d1.getTime() - d2.getTime()
}

