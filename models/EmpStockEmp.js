import mongoose from 'mongoose'

const EmpStockEmpSchema = new mongoose.Schema({
  // Assignment details
  assignmentDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  
  // Admin who assigned the stock
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  adminName: {
    type: String,
    required: true
  },
  
  // Employee who received the stock
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  employeeName: {
    type: String,
    required: true
  },
  
  // Product details
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productName: {
    type: String,
    required: true
  },
  productCode: {
    type: String,
    required: false
  },
  category: {
    type: String,
    enum: ['gas', 'cylinder'],
    required: true
  },
  cylinderStatus: {
    type: String,
    enum: ['empty', 'full'],
    required: false
  },
  cylinderSize: {
    type: String,
    enum: ['large', 'small'],
    required: false
  },
  
  // Cylinder linking for gas assignments (which cylinder this gas is related to)
  relatedCylinderProductId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: false
  },
  relatedCylinderName: {
    type: String,
    required: false
  },
  
  // Assignment quantities and amounts
  assignedQuantity: {
    type: Number,
    required: true,
    min: 0
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Assignment status
  status: {
    type: String,
    enum: ['assigned', 'accepted', 'rejected'],
    default: 'assigned'
  },
  
  // Notes and additional info
  notes: {
    type: String,
    required: false
  },
  assignmentMethod: {
    type: String,
    default: 'employee_management_page'
  },
  
  // Inventory tracking
  inventoryDeducted: {
    type: Boolean,
    default: false
  },
  dailySalesUpdated: {
    type: Boolean,
    default: false
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
})

// Index for efficient queries
EmpStockEmpSchema.index({ assignmentDate: 1 })
EmpStockEmpSchema.index({ adminId: 1 })
EmpStockEmpSchema.index({ employeeId: 1 })
EmpStockEmpSchema.index({ productId: 1 })
EmpStockEmpSchema.index({ status: 1 })

// Update the updatedAt field before saving
EmpStockEmpSchema.pre('save', function(next) {
  this.updatedAt = new Date()
  next()
})

const EmpStockEmp = mongoose.models.EmpStockEmp || mongoose.model('EmpStockEmp', EmpStockEmpSchema)

export default EmpStockEmp
