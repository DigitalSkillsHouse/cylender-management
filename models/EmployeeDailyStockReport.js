import mongoose from 'mongoose';

const EmployeeDailyStockReportSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    itemName: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD

    openingFull: { type: Number, default: 0 },
    openingEmpty: { type: Number, default: 0 },
    refilled: { type: Number, default: 0 },
    cylinderSales: { type: Number, default: 0 },
    gasSales: { type: Number, default: 0 },
    closingFull: { type: Number },
    closingEmpty: { type: Number },
  },
  { timestamps: true }
);

// Uniqueness per employee per item per date
EmployeeDailyStockReportSchema.index({ employeeId: 1, itemName: 1, date: 1 }, { unique: true });

export default mongoose.models.EmployeeDailyStockReport || mongoose.model('EmployeeDailyStockReport', EmployeeDailyStockReportSchema);
