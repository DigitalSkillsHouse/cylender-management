import mongoose from 'mongoose'

const DailyEmployeeSalesAggregationSchema = new mongoose.Schema({
  // Employee and date identification
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: String, // Format: YYYY-MM-DD
    required: true
  },
  
  // Product identification
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
    enum: ['gas', 'cylinder'],
    required: true
  },
  
  // Daily aggregated sales data
  totalGasSales: {
    type: Number,
    default: 0,
    min: 0
  },
  totalGasRevenue: {
    type: Number,
    default: 0,
    min: 0
  },
  
  totalFullCylinderSales: {
    type: Number,
    default: 0,
    min: 0
  },
  totalFullCylinderRevenue: {
    type: Number,
    default: 0,
    min: 0
  },
  
  totalEmptyCylinderSales: {
    type: Number,
    default: 0,
    min: 0
  },
  totalEmptyCylinderRevenue: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Combined cylinder sales (full + empty)
  totalCylinderSales: {
    type: Number,
    default: 0,
    min: 0
  },
  totalCylinderRevenue: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Deposit and return tracking
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
  
  // Metadata
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  salesCount: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
})

// Compound index for efficient queries
DailyEmployeeSalesAggregationSchema.index({ 
  employeeId: 1, 
  date: 1, 
  productId: 1 
}, { unique: true })

// Index for date-based queries
DailyEmployeeSalesAggregationSchema.index({ date: 1 })

// Index for employee-based queries
DailyEmployeeSalesAggregationSchema.index({ employeeId: 1, date: 1 })

// Virtual for total sales (gas + cylinder)
DailyEmployeeSalesAggregationSchema.virtual('totalSales').get(function() {
  return this.totalGasSales + this.totalCylinderSales
})

// Virtual for total revenue (gas + cylinder)
DailyEmployeeSalesAggregationSchema.virtual('totalRevenue').get(function() {
  return this.totalGasRevenue + this.totalCylinderRevenue
})

// Static method to update daily aggregation
DailyEmployeeSalesAggregationSchema.statics.updateDailyAggregation = async function(
  employeeId, 
  date, 
  productId, 
  productName, 
  productCategory,
  salesData
) {
  const {
    gasSales = 0,
    gasRevenue = 0,
    fullCylinderSales = 0,
    fullCylinderRevenue = 0,
    emptyCylinderSales = 0,
    emptyCylinderRevenue = 0,
    deposits = 0,
    depositAmount = 0,
    returns = 0,
    returnAmount = 0
  } = salesData

  const totalCylinderSales = fullCylinderSales + emptyCylinderSales
  const totalCylinderRevenue = fullCylinderRevenue + emptyCylinderRevenue

  return await this.findOneAndUpdate(
    {
      employeeId,
      date,
      productId
    },
    {
      $set: {
        productName,
        productCategory,
        lastUpdated: new Date()
      },
      $inc: {
        totalGasSales: gasSales,
        totalGasRevenue: gasRevenue,
        totalFullCylinderSales: fullCylinderSales,
        totalFullCylinderRevenue: fullCylinderRevenue,
        totalEmptyCylinderSales: emptyCylinderSales,
        totalEmptyCylinderRevenue: emptyCylinderRevenue,
        totalCylinderSales: totalCylinderSales,
        totalCylinderRevenue: totalCylinderRevenue,
        totalDeposits: deposits,
        totalDepositAmount: depositAmount,
        totalReturns: returns,
        totalReturnAmount: returnAmount,
        salesCount: 1
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  )
}

// Static method to get daily aggregation for employee and date
DailyEmployeeSalesAggregationSchema.statics.getDailyAggregation = async function(employeeId, date) {
  return await this.find({
    employeeId,
    date
  }).populate('productId', 'name category').populate('employeeId', 'name email')
}

// Static method to get aggregation for specific product
DailyEmployeeSalesAggregationSchema.statics.getProductAggregation = async function(employeeId, date, productId) {
  return await this.findOne({
    employeeId,
    date,
    productId
  }).populate('productId', 'name category').populate('employeeId', 'name email')
}

export default mongoose.models.DailyEmployeeSalesAggregation || 
  mongoose.model('DailyEmployeeSalesAggregation', DailyEmployeeSalesAggregationSchema)
