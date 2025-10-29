import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { initializeInvoiceCounter } from "@/lib/invoice-generator";

/**
 * Admin endpoint to initialize/reset the invoice counter
 * This will set the counter to the next number after the highest existing invoice
 */
export async function POST(request) {
  try {
    await dbConnect();
    
    const startingSeq = await initializeInvoiceCounter();
    
    return NextResponse.json({
      success: true,
      message: `Invoice counter initialized successfully`,
      startingSequence: startingSeq,
      nextInvoice: startingSeq.toString().padStart(4, '0')
    });
    
  } catch (error) {
    console.error("Error initializing invoice counter:", error);
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to initialize invoice counter", 
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * Get current counter status
 */
export async function GET(request) {
  try {
    await dbConnect();
    
    const Counter = (await import("@/models/Counter")).default;
    const currentYear = new Date().getFullYear();
    
    const counter = await Counter.findOne({ 
      key: 'unified_invoice_counter',
      year: currentYear 
    });
    
    if (!counter) {
      return NextResponse.json({
        exists: false,
        message: "Counter not initialized for current year",
        year: currentYear
      });
    }
    
    return NextResponse.json({
      exists: true,
      year: currentYear,
      currentSequence: counter.seq,
      nextInvoice: counter.seq.toString().padStart(4, '0'),
      lastUpdated: counter.updatedAt
    });
    
  } catch (error) {
    console.error("Error getting counter status:", error);
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to get counter status", 
        details: error.message 
      },
      { status: 500 }
    );
  }
}
