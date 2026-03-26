import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import DailyStockReport from "@/models/DailyStockReport";

export async function GET(request) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const itemName = searchParams.get("itemName");
    const date = searchParams.get("date"); // YYYY-MM-DD

    if (!itemName || !date) {
      return NextResponse.json({ success: false, error: "Missing itemName or date" }, { status: 400 });
    }

    // Find the latest admin report before the given date for this item.
    // Admin DSR rows do not have employeeId set.
    const prev = await DailyStockReport.findOne({
      itemName,
      date: { $lt: date },
      $or: [{ employeeId: { $exists: false } }, { employeeId: null }],
    })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    if (!prev) {
      return NextResponse.json({ success: true, data: null });
    }

    return NextResponse.json({
      success: true,
      data: prev,
    });
  } catch (error) {
    console.error("DSR previous GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch previous daily stock report" }, { status: 500 });
  }
}
