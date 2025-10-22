import mongoose from "mongoose"

const EmployeeInventoryItemSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: ["gas", "cylinder"],
      required: true,
      index: true,
    },
    // General stock (for gas products)
    currentStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Cylinder-specific availability
    availableEmpty: {
      type: Number,
      default: 0,
      min: 0,
    },
    availableFull: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Optional metadata
    cylinderSize: { type: String }, // e.g., large, small
    gasType: { type: String },

    // Auditing
    lastUpdatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
)

// Compound index to ensure one inventory record per employee-product combination
EmployeeInventoryItemSchema.index({ employee: 1, product: 1 }, { unique: true })

export default mongoose.models.EmployeeInventoryItem || mongoose.model("EmployeeInventoryItem", EmployeeInventoryItemSchema)
