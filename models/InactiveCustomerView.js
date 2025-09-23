import mongoose from "mongoose"

const InactiveCustomerViewSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Customer",
    required: true,
  },
  viewedAt: {
    type: Date,
    default: Date.now,
  },
  viewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
}, {
  timestamps: true,
})

// Index for efficient queries
InactiveCustomerViewSchema.index({ customerId: 1, viewedAt: 1 })
InactiveCustomerViewSchema.index({ viewedBy: 1 })

export default mongoose.models.InactiveCustomerView || mongoose.model("InactiveCustomerView", InactiveCustomerViewSchema)
