import mongoose from "mongoose"

const ExpenseSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
    },
    expense: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    vatAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
)

// Index for faster queries
ExpenseSchema.index({ createdAt: -1 })

export default mongoose.models.Expense || mongoose.model("Expense", ExpenseSchema)
