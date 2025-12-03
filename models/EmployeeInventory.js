import mongoose from "mongoose"

const EmployeeInventorySchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: ["gas", "cylinder"],
      required: true,
      index: true,
    },
    // Stock quantities
    assignedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
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
    // Cylinder size for cylinder products
    cylinderSize: {
      type: String,
      enum: ["small", "large"],
    },
    // Cylinder status for cylinder products
    cylinderStatus: {
      type: String,
      enum: ["empty", "full"],
    },
    // Pricing information
    leastPrice: {
      type: Number,
      required: true,
    },
    // Status tracking
    status: {
      type: String,
      enum: ["assigned", "received", "active", "returned"],
      default: "assigned",
    },
    // Transaction history
    transactions: [{
      type: {
        type: String,
        enum: ["assignment", "sale", "return", "adjustment"],
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
      },
      date: {
        type: Date,
        default: Date.now,
      },
      reference: {
        type: String, // Reference to sale ID, assignment ID, etc.
      },
      notes: String,
    }],
    // Dates
    assignedDate: {
      type: Date,
      default: Date.now,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
)

// Compound index for employee + product + cylinderStatus uniqueness
// This allows the same product to have separate empty and full cylinder records
EmployeeInventorySchema.index({ employee: 1, product: 1, cylinderStatus: 1 }, { unique: true })

// Update lastUpdated on save
EmployeeInventorySchema.pre('save', function() {
  this.lastUpdated = new Date()
})

export default mongoose.models.EmployeeInventory || mongoose.model("EmployeeInventory", EmployeeInventorySchema)