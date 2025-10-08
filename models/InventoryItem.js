import mongoose from "mongoose"

const InventoryItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
      unique: true, // one inventory record per product
    },
    category: {
      type: String,
      enum: ["gas", "cylinder"],
      required: true,
      index: true,
    },
    // General stock (for non-cylinder items like gas SKUs)
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
    // Optional metadata for finer granularity if needed later
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

export default mongoose.models.InventoryItem || mongoose.model("InventoryItem", InventoryItemSchema)
