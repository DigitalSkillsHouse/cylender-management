import mongoose from "mongoose"

const DailyCylinderTransactionSchema = new mongoose.Schema(
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
    cylinderSize: {
      type: String,
      required: true,
    },
    // Deposit transactions (customers taking cylinders)
    depositQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    depositAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Return transactions (customers returning cylinders)
    returnQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    returnAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Full cylinder sales (customers buying full cylinders)
    fullCylinderSalesQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    fullCylinderSalesAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Gas sales (gas sold from full cylinders, converting them to empty)
    gasSalesQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    gasSalesAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Transfer tracking (employee sending stock back to admin)
    transferGasQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    transferEmptyQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Purchase tracking (full and empty cylinders purchased from suppliers)
    fullCylinderPurchaseQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    emptyCylinderPurchaseQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Employee tracking (optional for admin transactions)
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    // Transaction source tracking
    isEmployeeTransaction: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
)

// Compound index to ensure one record per cylinder per date (per employee if specified)
DailyCylinderTransactionSchema.index({ date: 1, cylinderProductId: 1, employeeId: 1 }, { unique: true })

// Index for efficient queries
DailyCylinderTransactionSchema.index({ date: 1 })
DailyCylinderTransactionSchema.index({ cylinderProductId: 1 })

// Clear the existing model if it exists to force schema update
if (mongoose.models.DailyCylinderTransaction) {
  delete mongoose.models.DailyCylinderTransaction
}

export default mongoose.model("DailyCylinderTransaction", DailyCylinderTransactionSchema)
