import mongoose from 'mongoose'

const DailySalesSchema = new mongoose.Schema({
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
  category: {
    type: String,
    enum: ['gas', 'cylinder'],
    required: true
  },
  cylinderStatus: {
    type: String,
    enum: ['empty', 'full'],
    required: false // Only for cylinder sales
  },
  // Gas sales tracking
  gasSalesQuantity: {
    type: Number,
    default: 0
  },
  gasSalesAmount: {
    type: Number,
    default: 0
  },
  // Cylinder sales tracking
  cylinderSalesQuantity: {
    type: Number,
    default: 0
  },
  cylinderSalesAmount: {
    type: Number,
    default: 0
  },
  // Full cylinder sales specifically
  fullCylinderSalesQuantity: {
    type: Number,
    default: 0
  },
  fullCylinderSalesAmount: {
    type: Number,
    default: 0
  },
  // Empty cylinder sales specifically
  emptyCylinderSalesQuantity: {
    type: Number,
    default: 0
  },
  emptyCylinderSalesAmount: {
    type: Number,
    default: 0
  },
  // Cylinder refills (empty cylinders filled with gas)
  cylinderRefillsQuantity: {
    type: Number,
    default: 0
  },
  // Transfer tracking (admin assigns stock to employees)
  transferQuantity: {
    type: Number,
    default: 0
  },
  transferAmount: {
    type: Number,
    default: 0
  },
  // Received back tracking (employees return stock to admin)
  receivedBackQuantity: {
    type: Number,
    default: 0
  },
  receivedBackAmount: {
    type: Number,
    default: 0
  },
  // Cylinder product info for gas sales (to link gas to cylinder)
  cylinderProductId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: false
  },
  cylinderName: {
    type: String,
    required: false
  }
}, {
  timestamps: true
})

// Compound index for efficient queries
DailySalesSchema.index({ date: 1, productId: 1 }, { unique: true })
DailySalesSchema.index({ date: 1 })
DailySalesSchema.index({ productId: 1, date: -1 })

export default mongoose.models.DailySales || mongoose.model('DailySales', DailySalesSchema)