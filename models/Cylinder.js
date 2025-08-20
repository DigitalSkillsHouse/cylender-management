import mongoose from "mongoose";

const CylinderTransactionSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      default: undefined, // will be set by API routes; keep undefined for existing docs
    },
    type: {
      type: String,
      enum: ["deposit", "refill", "return"],
      required: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: function () { return this.type !== "refill" },
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: function () { return this.type === "refill" },
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: false,
    },
    cylinderSize: {
      type: String,
      required: true,
      enum: ["small", "large"],
    },
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
    // Optional: list of items for multi-item transactions
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
        productName: {
          type: String,
          default: "",
        },
        cylinderSize: {
          type: String,
          enum: ["small", "large"],
        },
        quantity: {
          type: Number,
          min: 1,
        },
        amount: {
          type: Number,
          min: 0,
        },
      },
    ],
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
    // Payment method fields for deposit transactions
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
  },
  {
    timestamps: true,
  }
);

// Ensure invoiceNumber is unique only when present to avoid migration issues on existing docs
try {
  CylinderTransactionSchema.index(
    { invoiceNumber: 1 },
    { unique: true, partialFilterExpression: { invoiceNumber: { $exists: true } } }
  );
} catch (e) {
  // no-op: index creation errors will be logged by Mongo
}

export default mongoose.models.CylinderTransaction || 
  mongoose.model("CylinderTransaction", CylinderTransactionSchema);
