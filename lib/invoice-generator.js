import Counter from '@/models/Counter'
import Sale from '@/models/Sale'
import EmployeeSale from '@/models/EmployeeSale'
import CylinderTransaction from '@/models/Cylinder'

/**
 * Centralized invoice number generator to prevent duplicate invoice numbers
 * across all sales and transaction types (admin/employee gas sales, cylinder transactions)
 */
export async function getNextInvoiceNumber() {
  try {
    // Get starting number from settings (fallback to 10000)
    let startingNumber = 10000
    try {
      const settings = await Counter.findOne({ key: 'invoice_start' })
      if (settings?.seq) {
        startingNumber = settings.seq
        console.log(`[INVOICE] Using configured starting number: ${startingNumber}`)
      }
    } catch (settingsError) {
      console.warn('[INVOICE] Could not fetch invoice start setting, using default 10000')
    }
    
    // Use current year for counter (required by Counter model)
    const currentYear = new Date().getFullYear()
    
    // Check if counter exists and if it's lower than the configured starting number
    const existingCounter = await Counter.findOne({
      key: 'unified_invoice_counter',
      year: currentYear
    })
    
    // If counter exists but is lower than starting number, reset it
    if (existingCounter && existingCounter.seq < startingNumber) {
      console.log(`[INVOICE] Counter (${existingCounter.seq}) is lower than starting number (${startingNumber}), resetting...`)
      await Counter.findOneAndUpdate(
        { key: 'unified_invoice_counter', year: currentYear },
        { seq: startingNumber },
        { upsert: true }
      )
    }
    
    // Use MongoDB's atomic findOneAndUpdate to prevent race conditions
    const counter = await Counter.findOneAndUpdate(
      { 
        key: 'unified_invoice_counter',
        year: currentYear 
      },
      { $inc: { seq: 1 } },
      { 
        new: true, 
        upsert: true,
        // Set default starting value if counter doesn't exist
        setDefaultsOnInsert: { seq: startingNumber }
      }
    )
    
    // Use the counter value directly (initialization ensures it starts correctly)
    const invoiceNumber = counter.seq
    
    // Format as 4-digit padded string
    const formattedNumber = invoiceNumber.toString().padStart(4, '0')
    
    console.log(`[INVOICE] Generated invoice number: ${formattedNumber} (counter: ${counter.seq}, year: ${currentYear}, starting: ${startingNumber})`)
    
    return formattedNumber
    
  } catch (error) {
    console.error('[INVOICE] Error generating invoice number:', error)
    
    // Fallback: use timestamp-based number to avoid duplicates
    const timestamp = Date.now()
    const fallbackNumber = (timestamp % 100000).toString().padStart(4, '0')
    console.warn(`[INVOICE] Using fallback invoice number: ${fallbackNumber}`)
    
    return fallbackNumber
  }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use getNextInvoiceNumber() instead
 */
export async function getNextCylinderInvoice() {
  console.warn('[INVOICE] getNextCylinderInvoice() is deprecated, use getNextInvoiceNumber()')
  return await getNextInvoiceNumber()
}

/**
 * Verify invoice number uniqueness across all collections
 * Used for additional safety checks
 */
export async function verifyInvoiceUniqueness(invoiceNumber) {
  try {
    const [saleExists, empSaleExists, cylinderExists] = await Promise.all([
      Sale.findOne({ invoiceNumber }),
      EmployeeSale.findOne({ invoiceNumber }),
      CylinderTransaction.findOne({ invoiceNumber })
    ])
    
    const isDuplicate = !!(saleExists || empSaleExists || cylinderExists)
    
    if (isDuplicate) {
      console.error(`[INVOICE] Duplicate invoice number detected: ${invoiceNumber}`)
      console.error('Found in:', {
        sale: !!saleExists,
        employeeSale: !!empSaleExists,
        cylinder: !!cylinderExists
      })
    }
    
    return !isDuplicate
    
  } catch (error) {
    console.error('[INVOICE] Error verifying invoice uniqueness:', error)
    return false
  }
}

/**
 * Initialize the invoice counter with the next number after the highest existing invoice
 * OR use the configured starting number if set
 */
export async function initializeInvoiceCounter() {
  try {
    const currentYear = new Date().getFullYear()
    
    // First, check if user has configured a starting number
    let configuredStartingNumber = null
    try {
      const startSetting = await Counter.findOne({ key: 'invoice_start' })
      if (startSetting?.seq) {
        configuredStartingNumber = startSetting.seq
        console.log(`[INVOICE] Found configured starting number: ${configuredStartingNumber}`)
      }
    } catch (error) {
      console.warn('[INVOICE] Could not fetch invoice_start setting')
    }
    
    // Check if counter already exists for this year
    const existingCounter = await Counter.findOne({ 
      key: 'unified_invoice_counter',
      year: currentYear 
    })
    
    // If counter exists and is valid, use it (unless configured starting number is higher)
    if (existingCounter) {
      if (configuredStartingNumber && existingCounter.seq < configuredStartingNumber) {
        // Reset counter to configured starting number if it's lower
        console.log(`[INVOICE] Counter exists (${existingCounter.seq}) but is lower than configured starting (${configuredStartingNumber}), resetting...`)
        const updatedCounter = await Counter.findOneAndUpdate(
          { key: 'unified_invoice_counter', year: currentYear },
          { seq: configuredStartingNumber },
          { new: true }
        )
        return updatedCounter.seq
      }
      console.log(`[INVOICE] Counter already initialized for ${currentYear}: ${existingCounter.seq}`)
      return existingCounter.seq
    }
    
    // Counter doesn't exist - determine starting sequence
    let startingSeq = 10000 // Default fallback
    
    // If user configured a starting number, use it
    if (configuredStartingNumber) {
      startingSeq = configuredStartingNumber
      console.log(`[INVOICE] Using configured starting number: ${startingSeq}`)
    } else {
      // Otherwise, find the highest existing invoice number across all collections
      const [latestSale, latestEmpSale, latestCylinder] = await Promise.all([
        Sale.findOne({ invoiceNumber: { $regex: /^\d{4}$/ } }).sort({ invoiceNumber: -1 }),
        EmployeeSale.findOne({ invoiceNumber: { $regex: /^\d{4}$/ } }).sort({ invoiceNumber: -1 }),
        CylinderTransaction.findOne({ invoiceNumber: { $regex: /^\d{4}$/ } }).sort({ invoiceNumber: -1 })
      ])
      
      // Get the highest number
      let highestNumber = 9999 // Start from 9999 so next will be 10000
      
      if (latestSale?.invoiceNumber) {
        highestNumber = Math.max(highestNumber, parseInt(latestSale.invoiceNumber) || 0)
      }
      if (latestEmpSale?.invoiceNumber) {
        highestNumber = Math.max(highestNumber, parseInt(latestEmpSale.invoiceNumber) || 0)
      }
      if (latestCylinder?.invoiceNumber) {
        highestNumber = Math.max(highestNumber, parseInt(latestCylinder.invoiceNumber) || 0)
      }
      
      // Create counter starting from the next number
      startingSeq = highestNumber + 1
      console.log(`[INVOICE] No configured starting number, using highest existing invoice + 1: ${startingSeq}`)
    }
    
    const counter = await Counter.findOneAndUpdate(
      { 
        key: 'unified_invoice_counter',
        year: currentYear 
      },
      { seq: startingSeq },
      { 
        new: true, 
        upsert: true
      }
    )
    
    console.log(`[INVOICE] Initialized counter for ${currentYear} starting from: ${startingSeq}`)
    return startingSeq
    
  } catch (error) {
    console.error('[INVOICE] Error initializing counter:', error)
    return 10000 // Fallback starting number
  }
}

/**
 * Generate next RC-NO (Receipt Collection Number) starting from 0001
 * RC-NO is used for collection receipts and increments sequentially
 */
export async function getNextRcNo() {
  try {
    // Use current year for counter (required by Counter model)
    const currentYear = new Date().getFullYear()
    
    // Use MongoDB's atomic findOneAndUpdate to prevent race conditions
    const counter = await Counter.findOneAndUpdate(
      { 
        key: 'rc_no_counter',
        year: currentYear 
      },
      { $inc: { seq: 1 } },
      { 
        new: true, 
        upsert: true,
        // Set default starting value to 1 if counter doesn't exist
        setDefaultsOnInsert: { seq: 1 }
      }
    )
    
    // Use the counter value directly
    const rcNo = counter.seq
    
    // Format as 4-digit padded string
    const formattedNumber = rcNo.toString().padStart(4, '0')
    
    console.log(`[RC-NO] Generated RC-NO: ${formattedNumber} (counter: ${counter.seq}, year: ${currentYear})`)
    
    return formattedNumber
    
  } catch (error) {
    console.error('[RC-NO] Error generating RC-NO:', error)
    
    // Fallback: use timestamp-based number to avoid duplicates
    const timestamp = Date.now()
    const fallbackNumber = (timestamp % 10000).toString().padStart(4, '0')
    console.warn(`[RC-NO] Using fallback RC-NO: ${fallbackNumber}`)
    
    return fallbackNumber
  }
}

/**
 * Get next invoice with retry logic for extra safety
 */
export async function getNextInvoiceNumberWithRetry(maxRetries = 3) {
  // Initialize counter if needed
  await initializeInvoiceCounter()
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const invoiceNumber = await getNextInvoiceNumber()
      
      // Verify uniqueness
      const isUnique = await verifyInvoiceUniqueness(invoiceNumber)
      
      if (isUnique) {
        return invoiceNumber
      } else {
        console.warn(`[INVOICE] Attempt ${attempt}: Invoice ${invoiceNumber} already exists, retrying...`)
        
        if (attempt === maxRetries) {
          // Last attempt: use timestamp fallback
          const timestamp = Date.now()
          const fallbackNumber = (timestamp % 100000).toString().padStart(4, '0')
          console.error(`[INVOICE] All attempts failed, using timestamp fallback: ${fallbackNumber}`)
          return fallbackNumber
        }
      }
    } catch (error) {
      console.error(`[INVOICE] Attempt ${attempt} failed:`, error)
      
      if (attempt === maxRetries) {
        // Last attempt: use timestamp fallback
        const timestamp = Date.now()
        const fallbackNumber = (timestamp % 100000).toString().padStart(4, '0')
        console.error(`[INVOICE] All attempts failed, using timestamp fallback: ${fallbackNumber}`)
        return fallbackNumber
      }
    }
  }
}
