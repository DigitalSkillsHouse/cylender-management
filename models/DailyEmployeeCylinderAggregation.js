import mongoose from 'mongoose'

const DailyEmployeeCylinderAggregationSchema = new mongoose.Schema({
  // Core identifiers
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: String, // YYYY-MM-DD format
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productName: {
    type: String,
    required: true
  },
  productCategory: {
    type: String,
    default: 'cylinder'
  },
  
  // Deposit transactions (customers giving security deposits)
  totalDeposits: {
    type: Number,
    default: 0,
    min: 0
  },
  totalDepositAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Return transactions (customers returning cylinders)
  totalReturns: {
    type: Number,
    default: 0,
    min: 0
  },
  totalReturnAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Refill transactions (supplier refilling cylinders)
  totalRefills: {
    type: Number,
    default: 0,
    min: 0
  },
  totalRefillAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Transaction counts
  depositTransactionCount: {
    type: Number,
    default: 0,
    min: 0
  },
  returnTransactionCount: {
    type: Number,
    default: 0,
    min: 0
  },
  refillTransactionCount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Metadata
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
})

// Compound index for efficient queries
DailyEmployeeCylinderAggregationSchema.index({ 
  employeeId: 1, 
  date: 1, 
  productId: 1 
}, { unique: true })

// Index for date-based queries
DailyEmployeeCylinderAggregationSchema.index({ date: 1 })

// Index for employee-based queries
DailyEmployeeCylinderAggregationSchema.index({ employeeId: 1, date: 1 })

// Virtual for total transactions
DailyEmployeeCylinderAggregationSchema.virtual('totalTransactions').get(function() {
  return this.depositTransactionCount + this.returnTransactionCount + this.refillTransactionCount
})

// Virtual for total amount
DailyEmployeeCylinderAggregationSchema.virtual('totalAmount').get(function() {
  return this.totalDepositAmount + this.totalReturnAmount + this.totalRefillAmount
})

// Static method to update daily cylinder aggregation
DailyEmployeeCylinderAggregationSchema.statics.updateDailyCylinderAggregation = async function(
  employeeId, 
  date, 
  productId, 
  productName, 
  transactionType,
  transactionData
) {
  const {
    quantity = 0,
    amount = 0
  } = transactionData

  console.log(`📊 [CYLINDER AGGREGATION] Updating ${transactionType} for employee ${employeeId}, product ${productName}, qty: ${quantity}, amount: ${amount}`)

  // Prepare increment data based on transaction type - use $inc for proper aggregation
  let incrementData = {}

  if (transactionType === 'deposit') {
    incrementData = {
      totalDeposits: quantity,
      totalDepositAmount: amount,
      depositTransactionCount: 1
    }
  } else if (transactionType === 'return') {
    incrementData = {
      totalReturns: quantity,
      totalReturnAmount: amount,
      returnTransactionCount: 1
    }
  } else if (transactionType === 'refill') {
    incrementData = {
      totalRefills: quantity,
      totalRefillAmount: amount,
      refillTransactionCount: 1
    }
  }

  const result = await this.findOneAndUpdate(
    {
      employeeId,
      date,
      productId
    },
    {
      $set: {
        productName,
        productCategory: 'cylinder',
        lastUpdated: new Date()
      },
      $inc: incrementData
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  )

  console.log(`✅ [CYLINDER AGGREGATION] Updated ${transactionType} aggregation for ${productName}:`, {
    totalDeposits: result.totalDeposits,
    totalReturns: result.totalReturns,
    totalRefills: result.totalRefills,
    totalTransactions: result.depositTransactionCount + result.returnTransactionCount + result.refillTransactionCount
  })

  return result
}

// Static method to get daily cylinder aggregation for employee and date
DailyEmployeeCylinderAggregationSchema.statics.getDailyCylinderAggregation = async function(employeeId, date) {
  return await this.find({
    employeeId,
    date
  }).populate('productId', 'name category cylinderSize').populate('employeeId', 'name email')
}

// Static method to get aggregation for specific product
DailyEmployeeCylinderAggregationSchema.statics.getProductCylinderAggregation = async function(employeeId, date, productId) {
  return await this.findOne({
    employeeId,
    date,
    productId
  }).populate('productId', 'name category cylinderSize').populate('employeeId', 'name email')
}

export default mongoose.models.DailyEmployeeCylinderAggregation || 
  mongoose.model('DailyEmployeeCylinderAggregation', DailyEmployeeCylinderAggregationSchema)
