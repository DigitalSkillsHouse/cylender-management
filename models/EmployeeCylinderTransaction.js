import mongoose from "mongoose";

const EmployeeCylinderTransactionSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: false,
      index: true,
      unique: false,
      sparse: true,
    },
    type: {
      type: String,
      enum: ["deposit", "refill", "return"],
      required: true,
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: false,
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: false,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: false, // Optional when using multi-item transactions
    },
    // Support multiple items per transaction (mirrors admin CylinderTransaction.items)
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        productName: { type: String },
        quantity: { type: Number, min: 1 },
        amount: { type: Number, min: 0 }, // Row amount in AED
      },
    ],

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    depositAmount: {
      type: Number,
      default: 0,
    },
    refillAmount: {
      type: Number,
      default: 0,
    },
    returnAmount: {
      type: Number,
      default: 0,
    },
    // Payment method fields for all transaction types
    paymentMethod: {
      type: String,
      enum: ["cash", "cheque"],
      default: "cash",
    },
    cashAmount: {
      type: Number,
      default: 0,
    },
    bankName: {
      type: String,
      default: "",
    },
    checkNumber: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "cleared", "overdue"],
      default: "pending",
    },
    notes: {
      type: String,
      default: "",
    },
    // Optional link for return transactions to reference the deposit they clear
    linkedDeposit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmployeeCylinderTransaction",
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
// Ensure invoiceNumber can be searched quickly; not enforcing uniqueness to avoid migration issues
EmployeeCylinderTransactionSchema.index({ invoiceNumber: 1 }, { unique: false, sparse: true })
EmployeeCylinderTransactionSchema.index({ employee: 1, createdAt: -1 })
EmployeeCylinderTransactionSchema.index({ customer: 1, createdAt: -1 })
EmployeeCylinderTransactionSchema.index({ supplier: 1, createdAt: -1 })
EmployeeCylinderTransactionSchema.index({ type: 1 })
EmployeeCylinderTransactionSchema.index({ status: 1 })
// Index to quickly find returns linked to a deposit
EmployeeCylinderTransactionSchema.index({ linkedDeposit: 1 })

export default mongoose.models.EmployeeCylinderTransaction || 
  mongoose.model("EmployeeCylinderTransaction", EmployeeCylinderTransactionSchema);
