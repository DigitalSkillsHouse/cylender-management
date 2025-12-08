import mongoose from "mongoose"

const AdminSignatureSchema = new mongoose.Schema(
  {
    signature: {
      type: String, // Base64 encoded image data (data:image/png;base64,...)
      required: true,
    },
    // Store which admin user created this signature (optional, for tracking)
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    // Only one admin signature should exist at a time
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
)

// Ensure only one active signature exists
AdminSignatureSchema.index({ isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } })

const AdminSignature = mongoose.models.AdminSignature || mongoose.model("AdminSignature", AdminSignatureSchema)

export default AdminSignature

