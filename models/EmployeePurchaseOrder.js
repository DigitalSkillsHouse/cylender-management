import mongoose from "mongoose"

const employeePurchaseOrderSchema = new mongoose.Schema({
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  purchaseDate: {
    type: Date,
    required: true
  },
  purchaseType: {
    type: String,
    enum: ['gas', 'cylinder'],
    required: true
  },
  cylinderSize: {
    type: String,
    enum: ['5kg', '10kg', '15kg', '20kg', '25kg', '45kg'],
    required: function () {
      return this.purchaseType === 'cylinder'
    },
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  unitPrice: {
    type: Number,
    required: false,
    min: 0,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  notes: {
    type: String,
    default: ""
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'pending'
  },
  inventoryStatus: {
    type: String,
    enum: ['pending', 'received'],
    default: 'pending'
  },
  poNumber: {
    type: String,
    required: true
  }
}, {
  timestamps: true
})

// Add indexes for efficient queries
employeePurchaseOrderSchema.index({ supplier: 1 })
employeePurchaseOrderSchema.index({ product: 1 })
employeePurchaseOrderSchema.index({ employee: 1 })
employeePurchaseOrderSchema.index({ purchaseDate: -1 })
employeePurchaseOrderSchema.index({ status: 1 })
employeePurchaseOrderSchema.index({ poNumber: 1 })

const EmployeePurchaseOrder = mongoose.models.EmployeePurchaseOrder || mongoose.model("EmployeePurchaseOrder", employeePurchaseOrderSchema)

export default EmployeePurchaseOrder
