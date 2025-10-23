import mongoose from "mongoose"

const EmployeeSaleSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
        required: true,
      },
      cylinderSize: {
        type: String,
        enum: ["large", "small"],
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
  },
  {
    timestamps: true,
  },
)

// Index for faster queries
EmployeeSaleSchema.index({ employee: 1, createdAt: -1 })
EmployeeSaleSchema.index({ customer: 1, createdAt: -1 })
EmployeeSaleSchema.index({ invoiceNumber: 1 })
EmployeeSaleSchema.index({ paymentStatus: 1 })

// Clear the existing model if it exists to force schema update
if (mongoose.models.EmployeeSale) {
  delete mongoose.models.EmployeeSale
}

export default mongoose.model("EmployeeSale", EmployeeSaleSchema)
