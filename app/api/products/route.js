import dbConnect from "@/lib/mongodb"
import Product from "@/models/Product"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    await dbConnect()
    const products = await Product.find({}).sort({ createdAt: -1 })
    return NextResponse.json(products)
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 })
  }
}

// Helper function to generate product code
async function generateProductCode(productName) {
  // Get abbreviation for each word based on specific rules
  const words = productName.trim().split(/\s+/)
  const abbreviations = words.map((word, index) => {
    const upperWord = word.toUpperCase()
    if (index === 0) {
      // First word: apply special abbreviations
      if (upperWord.startsWith('CYL')) return 'CY'
      if (upperWord.startsWith('GAS')) return 'GA'
      if (upperWord.startsWith('OXY')) return 'OX'
    }
    // All other words (or first word without special pattern): just first letter
    return word.charAt(0).toUpperCase()
  })
  const initials = abbreviations.join('')
  
  console.log('Generating product code for:', productName)
  console.log('Initials:', initials)
  
  // Find existing products with similar initials to get the next sequence number
  // Use case-insensitive regex and ensure proper escaping
  const regexPattern = `^${initials}-\\d+$`
  const existingProducts = await Product.find({ 
    productCode: { 
      $regex: regexPattern,
      $options: 'i' // Case-insensitive matching
    } 
  })
  
  console.log('Existing products with similar initials:', existingProducts)
  console.log('Number of existing products:', existingProducts.length)
  
  // Get the highest sequence number
  let maxSequence = 0
  existingProducts.forEach(product => {
    console.log('Checking product:', product.productCode)
    const match = product.productCode.match(/-(\d+)$/)
    if (match) {
      const sequence = parseInt(match[1])
      console.log(`Found sequence: ${sequence} for product: ${product.productCode}`)
      if (sequence > maxSequence) {
        maxSequence = sequence
        console.log(`Updated maxSequence to: ${maxSequence}`)
      }
    } else {
      console.log(`No sequence match found for product: ${product.productCode}`)
    }
  })
  
  console.log('Max sequence found:', maxSequence)
  
  // Generate new product code
  const newSequence = maxSequence + 1
  const newProductCode = `${initials}-${newSequence}`
  
  console.log('Generated product code:', newProductCode)
  
  return newProductCode
}

export async function POST(request) {
  try {
    await dbConnect()
    const data = await request.json()
    
    // Generate product code if not provided
    if (!data.productCode) {
      data.productCode = await generateProductCode(data.name)
    }
    
    const product = await Product.create(data)
    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 })
  }
}
