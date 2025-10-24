import mongoose from 'mongoose'

const DailyEmployeeSalesSchema = new mongoose.Schema({
  date: {
    type: String, // YYYY-MM-DD format
    required: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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
  }
}, {
  timestamps: true
})

// Compound index for efficient queries
DailyEmployeeSalesSchema.index({ date: 1, employeeId: 1, productId: 1 }, { unique: true })
DailyEmployeeSalesSchema.index({ date: 1, employeeId: 1 })
DailyEmployeeSalesSchema.index({ employeeId: 1, date: -1 })

export default mongoose.models.DailyEmployeeSales || mongoose.model('DailyEmployeeSales', DailyEmployeeSalesSchema)
