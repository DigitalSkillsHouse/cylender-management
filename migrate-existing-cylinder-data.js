// Migration script to process existing employee cylinder transactions
// Run this with: node migrate-existing-cylinder-data.js

const mongoose = require('mongoose')

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/cylinder-management', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    console.log('✅ Connected to MongoDB')
  } catch (error) {
    console.error('❌ MongoDB connection error:', error)
    process.exit(1)
  }
}

// Define schemas (simplified versions)
const DailyEmployeeCylinderAggregationSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  productCategory: { type: String, default: 'cylinder' },
  totalDeposits: { type: Number, default: 0, min: 0 },
  totalDepositAmount: { type: Number, default: 0, min: 0 },
  totalReturns: { type: Number, default: 0, min: 0 },
  totalReturnAmount: { type: Number, default: 0, min: 0 },
  totalRefills: { type: Number, default: 0, min: 0 },
  totalRefillAmount: { type: Number, default: 0, min: 0 },
  depositTransactionCount: { type: Number, default: 0, min: 0 },
  returnTransactionCount: { type: Number, default: 0, min: 0 },
  refillTransactionCount: { type: Number, default: 0, min: 0 },
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true })

DailyEmployeeCylinderAggregationSchema.index({ 
  employeeId: 1, 
  date: 1, 
  productId: 1 
}, { unique: true })

// Static method to update daily cylinder aggregation
DailyEmployeeCylinderAggregationSchema.statics.updateDailyCylinderAggregation = async function(
  employeeId, 
  date, 
  productId, 
  productName, 
  transactionType,
  transactionData
) {
  const { quantity = 0, amount = 0 } = transactionData

  console.log(`📊 [MIGRATION] Updating ${transactionType} for employee ${employeeId}, product ${productName}, qty: ${quantity}, amount: ${amount}`)

  let incrementData = { lastUpdated: new Date() }

  if (transactionType === 'deposit') {
    incrementData = {
      ...incrementData,
      totalDeposits: quantity,
      totalDepositAmount: amount,
      depositTransactionCount: 1
    }
  } else if (transactionType === 'return') {
    incrementData = {
      ...incrementData,
      totalReturns: quantity,
      totalReturnAmount: amount,
      returnTransactionCount: 1
    }
  } else if (transactionType === 'refill') {
    incrementData = {
      ...incrementData,
      totalRefills: quantity,
      totalRefillAmount: amount,
      refillTransactionCount: 1
    }
  }

  const result = await this.findOneAndUpdate(
    { employeeId, date, productId },
    {
      $set: {
        productName,
        productCategory: 'cylinder',
        lastUpdated: new Date()
      },
      $inc: incrementData
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  return result
}

const EmployeeCylinderTransactionSchema = new mongoose.Schema({
  invoiceNumber: String,
  type: String,
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  quantity: Number,
  amount: Number,
  totalAmount: Number,
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: Number,
    amount: Number
  }]
}, { timestamps: true })

const ProductSchema = new mongoose.Schema({
  name: String,
  category: String
})

// Create models
const DailyEmployeeCylinderAggregation = mongoose.models.DailyEmployeeCylinderAggregation || 
  mongoose.model('DailyEmployeeCylinderAggregation', DailyEmployeeCylinderAggregationSchema)

const EmployeeCylinderTransaction = mongoose.models.EmployeeCylinderTransaction || 
  mongoose.model('EmployeeCylinderTransaction', EmployeeCylinderTransactionSchema)

const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema)

// Migration function
const migrateExistingTransactions = async () => {
  try {
    console.log('🔄 Starting migration of existing employee cylinder transactions...')
    
    // Get all employee cylinder transactions
    const transactions = await EmployeeCylinderTransaction.find({
      type: { $in: ['deposit', 'return', 'refill'] }
    }).populate('product', 'name category')
    
    console.log(`📊 Found ${transactions.length} employee cylinder transactions to process`)
    
    let processedCount = 0
    let errorCount = 0
    
    for (const transaction of transactions) {
      try {
        const transactionDate = new Date(transaction.createdAt).toISOString().slice(0, 10)
        
        // Handle both single item and multi-item transactions
        const items = transaction.items && transaction.items.length > 0 
          ? transaction.items 
          : [{
              productId: transaction.product,
              quantity: transaction.quantity || 0
            }]
        
        // Process each item in the transaction
        for (const item of items) {
          const product = await Product.findById(item.productId)
          if (!product) {
            console.warn(`⚠️ Product not found: ${item.productId}`)
            continue
          }
          
          const quantity = Number(item.quantity) || 0
          const amount = Number(transaction.totalAmount) || Number(transaction.amount) || 0
          
          if (quantity <= 0) continue
          
          await DailyEmployeeCylinderAggregation.updateDailyCylinderAggregation(
            transaction.employee,
            transactionDate,
            product._id,
            product.name,
            transaction.type,
            { quantity, amount }
          )
          
          console.log(`✅ Processed ${transaction.type}: ${product.name}, Qty: ${quantity}, Date: ${transactionDate}`)
          processedCount++
        }
        
      } catch (error) {
        console.error(`❌ Error processing transaction ${transaction._id}:`, error.message)
        errorCount++
      }
    }
    
    console.log(`\n📊 Migration Summary:`)
    console.log(`✅ Successfully processed: ${processedCount} items`)
    console.log(`❌ Errors: ${errorCount} items`)
    
    // Show aggregation results
    const aggregations = await DailyEmployeeCylinderAggregation.find({})
      .populate('employeeId', 'name')
      .populate('productId', 'name')
      .sort({ date: -1, productName: 1 })
    
    console.log(`\n📈 Created ${aggregations.length} aggregation records:`)
    aggregations.slice(0, 10).forEach(agg => {
      console.log(`📅 ${agg.date} - ${agg.productName} - Deposits: ${agg.totalDeposits}, Returns: ${agg.totalReturns}`)
    })
    
  } catch (error) {
    console.error('❌ Migration error:', error)
  }
}

// Run migration
const runMigration = async () => {
  await connectDB()
  await migrateExistingTransactions()
  
  console.log('\n🎉 Migration completed! You can now test the aggregation API:')
  console.log('GET http://localhost:3000/api/daily-employee-cylinder-aggregation?date=2025-10-24&employeeId=68fa3766b7e314b58b7e7e19')
  
  process.exit(0)
}

runMigration()
