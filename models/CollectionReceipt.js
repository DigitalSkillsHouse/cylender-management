import mongoose from "mongoose"

const CollectionReceiptLineSchema = new mongoose.Schema(
  {
    model: {
      type: String,
      enum: ["Sale", "EmployeeSale"],
      required: true,
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    source: {
      type: String,
      enum: ["admin", "employee"],
      required: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
    },
    invoiceDate: {
      type: Date,
      default: null,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    previousReceived: {
      type: Number,
      default: 0,
      min: 0,
    },
    appliedAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    newReceived: {
      type: Number,
      required: true,
      min: 0,
    },
    remainingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["cleared", "pending", "overdue"],
      default: "pending",
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    employeeName: {
      type: String,
      default: "",
    },
    employeeEmail: {
      type: String,
      default: "",
    },
    itemSummary: {
      type: String,
      default: "",
    },
  },
  { _id: false }
)

const CollectionReceiptSchema = new mongoose.Schema(
  {
    rcNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    customerSnapshot: {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customer",
        default: null,
      },
      name: {
        type: String,
        default: "",
      },
      phone: {
        type: String,
        default: "",
      },
      address: {
        type: String,
        default: "",
      },
      trNumber: {
        type: String,
        default: "",
      },
    },
    signature: {
      type: String,
      default: "",
    },
    paymentMethod: {
      type: String,
      default: "Cash",
    },
    bankName: {
      type: String,
      default: "",
    },
    chequeNumber: {
      type: String,
      default: "",
    },
    receiptCreatedAt: {
      type: Date,
      default: Date.now,
    },
    lines: {
      type: [CollectionReceiptLineSchema],
      default: [],
    },
    totalAppliedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
)

CollectionReceiptSchema.index({ customer: 1, receiptCreatedAt: -1 })
CollectionReceiptSchema.index({ "lines.invoiceId": 1, "lines.model": 1 })

if (mongoose.models.CollectionReceipt) {
  delete mongoose.models.CollectionReceipt
}

export default mongoose.model("CollectionReceipt", CollectionReceiptSchema)
