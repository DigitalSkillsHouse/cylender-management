import mongoose from "mongoose";

const DailyStockReportSchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // YYYY-MM-DD
    itemName: { type: String, required: true, trim: true },
    // Optional: link DSR to a specific employee for per-employee reports
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", index: true },
    openingFull: { type: Number, default: 0, min: 0 },
    openingEmpty: { type: Number, default: 0, min: 0 },
    emptyPurchase: { type: Number, default: 0, min: 0 },
    fullPurchase: { type: Number, default: 0, min: 0 },
    refilled: { type: Number, default: 0, min: 0 },
    fullCylinderSales: { type: Number, default: 0, min: 0 },
    emptyCylinderSales: { type: Number, default: 0, min: 0 },
    cylinderSales: { type: Number, default: 0, min: 0 },
    gasSales: { type: Number, default: 0, min: 0 },
    deposits: { type: Number, default: 0, min: 0 },
    returns: { type: Number, default: 0, min: 0 },
    transferGas: { type: Number, default: 0, min: 0 },
    transferEmpty: { type: Number, default: 0, min: 0 },
    receivedGas: { type: Number, default: 0, min: 0 },
    receivedEmpty: { type: Number, default: 0, min: 0 },
    // Closing values are optional; when undefined, UI will show "Add Closing Stock" button
    closingFull: { type: Number, min: 0 },
    closingEmpty: { type: Number, min: 0 },
  },
  { timestamps: true }
);

// Ensure one report per item per date per employee (or global when employeeId is null)
DailyStockReportSchema.index({ employeeId: 1, itemName: 1, date: 1 }, { unique: true });

export default mongoose.models.DailyStockReport || mongoose.model("DailyStockReport", DailyStockReportSchema);
