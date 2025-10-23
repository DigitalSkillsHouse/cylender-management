import mongoose from "mongoose"

const DailyRefillSchema = new mongoose.Schema(
  {
    date: {
      type: String, // YYYY-MM-DD format
      required: true,
    },
    cylinderProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    cylinderName: {
      type: String,
      required: true,
    },
    todayRefill: {
      type: Number,
      default: 0,
      min: 0,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // Optional for admin refills
    },
  },
  {
    timestamps: true,
  }
)

// Compound index to ensure one record per cylinder per date (per employee if specified)
DailyRefillSchema.index({ date: 1, cylinderProductId: 1, employeeId: 1 }, { unique: true })

// Index for efficient queries
DailyRefillSchema.index({ date: 1 })
DailyRefillSchema.index({ cylinderProductId: 1 })

// Clear the existing model if it exists to force schema update
if (mongoose.models.DailyRefill) {
  delete mongoose.models.DailyRefill
}

export default mongoose.model("DailyRefill", DailyRefillSchema)
