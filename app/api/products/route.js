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
  
  // Generate new product code with 3-digit sequence
  const newSequence = maxSequence + 1
  const paddedSequence = newSequence.toString().padStart(3, '0')
  const newProductCode = `${initials}-${paddedSequence}`
  
  console.log('Generated product code:', newProductCode)
  
  return newProductCode
}

export async function POST(request) {
  try {
    await dbConnect()
    const data = await request.json()
    
    console.log('Received product data:', data)
    
    // Validate required fields
    if (!data.name || !data.category) {
      console.log('Missing required fields:', { name: data.name, category: data.category })
      return NextResponse.json({ error: "Name and category are required" }, { status: 400 })
    }
    
    // Validate cylinder status for cylinder products
    if (data.category === "cylinder" && !data.cylinderStatus) {
      console.log('Missing cylinder status for cylinder product')
      return NextResponse.json({ error: "Cylinder status is required for cylinder products" }, { status: 400 })
    }
    
    // Generate product code if not provided
    if (!data.productCode) {
      data.productCode = await generateProductCode(data.name)
    }
    
    console.log('🚫🚫🚫 CRITICAL: NEW PRODUCT BEING CREATED!')
    console.log('Creating product with data:', data)
    console.log('🔍 STACK TRACE TO IDENTIFY WHO IS CREATING THIS PRODUCT:')
    console.trace('Product creation stack trace')
    
    // DUPLICATE PREVENTION: Check if product with same name and category already exists
    // For cylinders, check if ANY cylinder with same name exists (regardless of status)
    const existingProduct = await Product.findOne({ 
      name: data.name, 
      category: data.category
    })
    
    if (existingProduct) {
      console.error('🚫🚫🚫 DUPLICATE PRODUCT PREVENTION: Product already exists!')
      console.error('Existing product:', {
        id: existingProduct._id,
        name: existingProduct.name,
        category: existingProduct.category,
        cylinderStatus: existingProduct.cylinderStatus,
        productCode: existingProduct.productCode
      })
      console.error('Attempted new product:', data)
      return NextResponse.json({ 
        error: "Duplicate product", 
        message: `A product with name "${data.name}" and category "${data.category}" already exists. ${data.category === 'cylinder' ? 'For cylinders, use the existing product and update its availability through gas purchases instead of creating separate empty/full products.' : ''}`,
        existingProduct: {
          id: existingProduct._id,
          name: existingProduct.name,
          productCode: existingProduct.productCode,
          category: existingProduct.category,
          cylinderStatus: existingProduct.cylinderStatus
        }
      }, { status: 409 })
    }
    
    const product = await Product.create(data)
    console.log('Product created successfully:', product._id)
    console.log('🚫 Product Code Generated:', product.productCode)
    console.log('🚫 Product Name:', product.name)
    
    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    console.error('Product creation error:', error)
    console.error('Error details:', error.message)
    if (error.name === 'ValidationError') {
      console.error('Validation errors:', error.errors)
      return NextResponse.json({ 
        error: "Validation error", 
        details: Object.keys(error.errors).map(key => error.errors[key].message)
      }, { status: 400 })
    }
    return NextResponse.json({ 
      error: "Failed to create product", 
      details: error.message 
    }, { status: 500 })
  }
}
