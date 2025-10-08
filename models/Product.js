import mongoose from "mongoose"

const ProductSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    productCode: {
      type: String,
      required: false,
      unique: true,
      sparse: true, // Allows multiple null values
    },
    category: {
      type: String,
      enum: ["gas", "cylinder"],
      required: true,
    },
    costPrice: {
      type: Number,
      required: true,
    },
    leastPrice: {
      type: Number,
      required: true,
    },
    currentStock: {
      type: Number,
      default: 0,
    },
    availableEmpty: {
      type: Number,
      default: 0,
    },
    availableFull: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
)

export default mongoose.models.Product || mongoose.model("Product", ProductSchema)
