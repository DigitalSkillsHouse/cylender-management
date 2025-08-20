import mongoose from "mongoose";

const CounterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // e.g., 'cylinder_invoice'
    year: { type: Number, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
)

// Ensure unique counter per key-year pair
CounterSchema.index({ key: 1, year: 1 }, { unique: true })

const Counter = mongoose.models.Counter || mongoose.model("Counter", CounterSchema)
export default Counter
