import mongoose from "mongoose"

const EmployeeSignatureSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    signature: {
      type: String, // Base64 encoded image data (data:image/png;base64,...)
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
)

// Ensure only one active signature per employee exists
EmployeeSignatureSchema.index({ employeeId: 1, isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } })

const EmployeeSignature = mongoose.models.EmployeeSignature || mongoose.model("EmployeeSignature", EmployeeSignatureSchema)

export default EmployeeSignature

