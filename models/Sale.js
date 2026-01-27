import mongoose from "mongoose"

const SaleSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    items: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      category: {
        type: String,
        enum: ["gas", "cylinder"],
        default: "gas",
      },
      cylinderSize: {
        type: String,
        enum: ["large", "small"],
        required: function () {
          return this.category === "cylinder"
        },
      },
      cylinderStatus: {
        type: String,
        enum: ["empty", "full", "full_to_empty"],
        required: function () {
          return this.category === "cylinder"
        },
      },
      quantity: {
        type: Number,
        required: true,
        min: 1,
      },
      price: {
        type: Number,
        required: true,
        min: 0,
      },
      total: {
        type: Number,
        required: true,
        min: 0,
      },
      // For gas sales: track which cylinder contains the gas
      cylinderProductId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: false,
      },
      cylinderName: {
        type: String,
        required: false,
      },
      // For cylinder sales: track which gas is in the cylinder
      gasProductId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product", 
        required: false,
      },
    }],
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "bank_transfer", "credit", "debit", "delivery_note"],
      default: "cash",
    },
    paymentStatus: {
      type: String,
      enum: ["cleared", "pending", "overdue"],
      default: "cleared",
    },
    receivedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    notes: {
      type: String,
      default: "",
    },
    customerSignature: {
      type: String,
      default: "",
    },
    rcNo: {
      type: String,
      default: "",
    },
    deliveryCharges: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
)

// Index for faster queries
SaleSchema.index({ customer: 1, createdAt: -1 })
SaleSchema.index({ invoiceNumber: 1 })
SaleSchema.index({ paymentStatus: 1 })

// Clear the existing model if it exists to force schema update
if (mongoose.models.Sale) {
  delete mongoose.models.Sale
}

export default mongoose.model("Sale", SaleSchema)
