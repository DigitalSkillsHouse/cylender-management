import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import EmployeeDailyStockReport from "@/models/EmployeeDailyStockReport";

// GET /api/employee-daily-stock-reports/previous?employeeId=...&itemName=...&date=YYYY-MM-DD
export async function GET(request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    const itemName = searchParams.get('itemName');
    const date = searchParams.get('date');

    if (!employeeId || !itemName || !date) {
      return NextResponse.json({ success: false, error: 'employeeId, itemName and date are required' }, { status: 400 });
    }

    const prev = await EmployeeDailyStockReport
      .findOne({ employeeId, itemName, date: { $lt: date } })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    if (!prev) return NextResponse.json({ success: true, data: null });
    return NextResponse.json({ success: true, data: prev });
  } catch (error) {
    console.error('Employee DSR previous GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch previous daily stock report' }, { status: 500 });
  }
}
