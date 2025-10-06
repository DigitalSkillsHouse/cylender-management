import mongoose from "mongoose"

const purchaseOrderSchema = new mongoose.Schema({
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  purchaseDate: {
    type: Date,
    required: true
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    purchaseType: {
      type: String,
      enum: ['gas', 'cylinder'],
      required: true
    },
    cylinderStatus: {
      type: String,
      enum: ['empty', 'full'],
      required: function () {
        return this.purchaseType === 'cylinder'
      },
    },
    gasType: {
      type: String,
      required: function () {
        return this.purchaseType === 'cylinder' && this.cylinderStatus === 'full'
      },
    },
    emptyCylinderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: function () {
        return this.purchaseType === 'gas'
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
    itemTotal: {
      type: Number,
      required: true,
      min: 0
    },
    inventoryStatus: {
      type: String,
      enum: ['pending', 'received'],
      default: 'pending'
    }
  }],
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
    required: true,
    unique: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
})

// Add index for efficient queries
purchaseOrderSchema.index({ supplier: 1 })
purchaseOrderSchema.index({ product: 1 })
purchaseOrderSchema.index({ purchaseDate: -1 })
purchaseOrderSchema.index({ status: 1 })
purchaseOrderSchema.index({ poNumber: 1 })

const PurchaseOrder = mongoose.models.PurchaseOrder || mongoose.model("PurchaseOrder", purchaseOrderSchema)

export default PurchaseOrder
