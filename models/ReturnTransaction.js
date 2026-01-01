import mongoose from 'mongoose'

const returnTransactionSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  stockType: {
    type: String,
    enum: ['gas', 'empty'],
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  returnDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending', 'received', 'rejected'],
    default: 'pending'
  },
  // For gas returns - which empty cylinder was selected by admin
  selectedEmptyCylinderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryItem',
    default: null
  },
  // DSR tracking
  dsrRecordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmpStockEmp',
    default: null
  },
  notes: {
    type: String,
    default: ''
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  processedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
})

// Index for efficient queries
// Note: invoiceNumber already has an index from unique: true, so we don't need to add it again
returnTransactionSchema.index({ employee: 1, status: 1 })
returnTransactionSchema.index({ status: 1, returnDate: -1 })

const ReturnTransaction = mongoose.models.ReturnTransaction || mongoose.model('ReturnTransaction', returnTransactionSchema)

export default ReturnTransaction
