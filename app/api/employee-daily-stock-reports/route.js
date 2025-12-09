import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import EmployeeDailyStockReport from "@/models/EmployeeDailyStockReport";

export async function GET(request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const itemName = searchParams.get("itemName");
    const date = searchParams.get("date");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = parseInt(searchParams.get("limit") || "0", 10);

    if (!employeeId) {
      return NextResponse.json({ success: false, error: "employeeId is required" }, { status: 400 });
    }

    const filter = { employeeId };
    if (itemName) filter.itemName = itemName;
    if (date) filter.date = date;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }

    let query = EmployeeDailyStockReport.find(filter).sort({ date: -1, createdAt: -1 });
    if (limit && Number.isFinite(limit) && limit > 0) query = query.limit(limit);

    const data = await query.exec();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Employee DSR GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch employee daily stock reports" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    const {
      employeeId,
      date,
      itemName,
      openingFull,
      openingEmpty,
      refilled,
      cylinderSales,
      gasSales,
      closingFull,
      closingEmpty,
    } = body || {};

    if (!employeeId || !date || !itemName) {
      return NextResponse.json({ success: false, error: "Missing required fields: employeeId, date, itemName" }, { status: 400 });
    }

    const update = { $set: { employeeId, date, itemName } };
    const setDoc = update.$set;
    if (typeof openingFull === 'number') setDoc.openingFull = openingFull;
    if (typeof openingEmpty === 'number') setDoc.openingEmpty = openingEmpty;
    if (typeof refilled === 'number') setDoc.refilled = refilled;
    if (typeof cylinderSales === 'number') setDoc.cylinderSales = cylinderSales;
    if (typeof gasSales === 'number') setDoc.gasSales = gasSales;
    // Always save closing values if they are numbers (including 0)
    // This ensures closing stock is properly saved for next day's opening stock
    if (typeof closingFull === 'number') {
      setDoc.closingFull = closingFull;
    } else if (closingFull === null || closingFull === undefined) {
      setDoc.closingFull = 0; // Explicitly set to 0 if null/undefined
    }
    if (typeof closingEmpty === 'number') {
      setDoc.closingEmpty = closingEmpty;
    } else if (closingEmpty === null || closingEmpty === undefined) {
      setDoc.closingEmpty = 0; // Explicitly set to 0 if null/undefined
    }

    const query = { employeeId, itemName, date };
    const updated = await EmployeeDailyStockReport.findOneAndUpdate(
      query,
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Employee DSR POST error:", error);
    return NextResponse.json({ success: false, error: "Failed to create/update employee daily stock report" }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId');
    const itemName = searchParams.get('itemName');
    const date = searchParams.get('date');

    if (!employeeId || !itemName || !date) {
      return NextResponse.json({ error: 'employeeId, itemName and date are required' }, { status: 400 });
    }

    const delFilter = { employeeId, itemName, date };
    const deleted = await EmployeeDailyStockReport.findOneAndDelete(delFilter);
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /employee-daily-stock-reports error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
