import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import DailyStockReport from "@/models/DailyStockReport";
import Product from "@/models/Product";
import { getLocalDateString } from "@/lib/date-utils";

export async function GET(request) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const itemName = searchParams.get("itemName");
    const date = searchParams.get("date");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const employeeId = searchParams.get("employeeId");
    const limit = parseInt(searchParams.get("limit") || "0", 10);
    const autoGenerate = searchParams.get("autoGenerate") === "true";

    // If autoGenerate is requested, create reports from cylinder products only (for DSR display)
    if (autoGenerate) {
      // Use local date instead of UTC to ensure correct date assignment
      const currentDate = date || getLocalDateString();
      
      // Get only cylinder products for DSR display (gas data still available for other purposes)
      const cylinderProducts = await Product.find({ 
        category: "cylinder"
      });

      const generatedReports = [];

      for (const product of cylinderProducts) {
        // Check if report already exists for this product and date
        const existingReport = await DailyStockReport.findOne({
          itemName: product.name,
          date: currentDate,
          ...(employeeId && { employeeId })
        });

        if (!existingReport) {
          // Create new report with current stock for cylinders
          const reportData = {
            date: currentDate,
            itemName: product.name,
            openingFull: product.availableFull || 0,
            openingEmpty: product.availableEmpty || 0,
            refilled: 0,
            cylinderSales: 0,
            gasSales: 0,
            ...(employeeId && { employeeId })
          };

          const newReport = await DailyStockReport.create(reportData);
          generatedReports.push(newReport);
        }
      }

      return NextResponse.json({ 
        success: true, 
        data: generatedReports,
        message: `Generated ${generatedReports.length} daily stock reports from cylinder products`
      });
    }

    // Regular GET logic
    const filter = {};
    if (itemName) filter.itemName = itemName;
    if (date) filter.date = date;
    if (employeeId) filter.employeeId = employeeId;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }

    let query = DailyStockReport.find(filter).sort({ date: -1, createdAt: -1 });
    if (limit && Number.isFinite(limit) && limit > 0) query = query.limit(limit);

    const data = await query.exec();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("DSR GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch daily stock reports" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await dbConnect();

    const body = await request.json();
    const {
      date,
      itemName,
      employeeId,
      openingFull,
      openingEmpty,
      emptyPurchase,
      fullPurchase,
      refilled,
      fullCylinderSales,
      emptyCylinderSales,
      cylinderSales,
      gasSales,
      deposits,
      returns,
      transferGas,
      transferEmpty,
      receivedGas,
      receivedEmpty,
      closingFull,
      closingEmpty,
    } = body || {};

    if (!date || !itemName) {
      return NextResponse.json({ success: false, error: "Missing required fields: date, itemName" }, { status: 400 });
    }

    // Build update doc dynamically to avoid overwriting with undefined
    const update = { $set: { date, itemName } };
    const setDoc = update.$set;
    if (typeof openingFull === 'number') setDoc.openingFull = openingFull;
    if (typeof openingEmpty === 'number') setDoc.openingEmpty = openingEmpty;
    if (typeof emptyPurchase === 'number') setDoc.emptyPurchase = emptyPurchase;
    if (typeof fullPurchase === 'number') setDoc.fullPurchase = fullPurchase;
    if (typeof refilled === 'number') setDoc.refilled = refilled;
    if (typeof fullCylinderSales === 'number') setDoc.fullCylinderSales = fullCylinderSales;
    if (typeof emptyCylinderSales === 'number') setDoc.emptyCylinderSales = emptyCylinderSales;
    if (typeof cylinderSales === 'number') setDoc.cylinderSales = cylinderSales;
    if (typeof gasSales === 'number') setDoc.gasSales = gasSales;
    if (typeof deposits === 'number') setDoc.deposits = deposits;
    if (typeof returns === 'number') setDoc.returns = returns;
    if (typeof transferGas === 'number') setDoc.transferGas = transferGas;
    if (typeof transferEmpty === 'number') setDoc.transferEmpty = transferEmpty;
    if (typeof receivedGas === 'number') setDoc.receivedGas = receivedGas;
    if (typeof receivedEmpty === 'number') setDoc.receivedEmpty = receivedEmpty;
    // Always save closing values if they are numbers (including 0)
    // This ensures closing stock is properly saved for next day's opening stock
    if (typeof closingFull === 'number') {
      setDoc.closingFull = closingFull;
      console.log(`💾 [API] Saving closingFull=${closingFull} for ${itemName} on ${date}`);
    }
    if (typeof closingEmpty === 'number') {
      setDoc.closingEmpty = closingEmpty;
      console.log(`💾 [API] Saving closingEmpty=${closingEmpty} for ${itemName} on ${date}`);
    }

    // Upsert to ensure uniqueness on (itemName, date)
    const query = { itemName, date };
    if (employeeId) {
      query.employeeId = employeeId;
      // Store employeeId when provided
      update.$set.employeeId = employeeId;
    }
    const updated = await DailyStockReport.findOneAndUpdate(
      query,
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("DSR POST error:", error);
    return NextResponse.json({ success: false, error: "Failed to create/update daily stock report" }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const itemName = searchParams.get('itemName');
    const date = searchParams.get('date');
    const employeeId = searchParams.get('employeeId');
    if (!itemName || !date) {
      return NextResponse.json({ error: 'itemName and date are required' }, { status: 400 });
    }
    const delFilter = { itemName, date };
    if (employeeId) delFilter.employeeId = employeeId;
    const deleted = await DailyStockReport.findOneAndDelete(delFilter);
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /daily-stock-reports error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
