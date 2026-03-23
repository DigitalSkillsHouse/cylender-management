import mongoose from "mongoose"

const QuotationItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    name: { type: String, required: true },
    productCode: { type: String },
    category: { type: String, enum: ["gas", "cylinder"] },
    price: { type: Number, required: true, default: 0 },
    quantity: { type: Number, required: true, default: 1 },
  },
  { _id: false }
)

const QuotationSchema = new mongoose.Schema(
  {
    quotationNumber: { type: String, required: true, unique: true, index: true }, // e.g. "0000001"
    quotationSeq: { type: Number, required: true, index: true },

    customerName: { type: String, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    customerAddress: { type: String },
    customerTRNumber: { type: String },

    items: { type: [QuotationItemSchema], default: [] },

    subtotal: { type: Number, default: 0 },
    vatAmount: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
  },
  { timestamps: true }
)

const Quotation = mongoose.models.Quotation || mongoose.model("Quotation", QuotationSchema)
export default Quotation

