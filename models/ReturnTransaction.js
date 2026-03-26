import mongoose from 'mongoose'

const returnTransactionSchema = new mongoose.Schema({
  batchId: {
    type: String,
    index: true,
    default: null
  },
  // invoiceNumber removed - return transactions don't need invoice numbers
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
  // For gas returns: which cylinder product was used (needed for reversal on reject/expiry)
  cylinderProductId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    default: null
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
  inventoryDeducted: {
    // Current system deducts employee stock immediately on send-back; reject/expiry must restore.
    type: Boolean,
    default: true
  },
  expiresAt: {
    type: Date,
    default: null,
    index: true
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
returnTransactionSchema.index({ employee: 1, status: 1 })
returnTransactionSchema.index({ status: 1, returnDate: -1 })
// No invoiceNumber index - returns don't use invoice numbers

const ReturnTransaction = mongoose.models.ReturnTransaction || mongoose.model('ReturnTransaction', returnTransactionSchema)

export default ReturnTransaction
