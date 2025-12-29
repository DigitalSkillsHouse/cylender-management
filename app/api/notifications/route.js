import dbConnect from "@/lib/mongodb";
import Notification from "@/models/Notification";
import ReturnTransaction from "@/models/ReturnTransaction";
import { NextResponse } from "next/server";

export async function GET(request) {
  try {
    await dbConnect();
  } catch (error) {
    console.error("Database connection error:", error);
    return NextResponse.json(
      { error: "Database connection failed", details: error.message },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const type = searchParams.get("type");
    const unread = searchParams.get("unread");

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    // Build query object - Mongoose will auto-convert string userId to ObjectId
    const query = { recipient: userId };
    if (type) {
      query.type = type;
    }
    if (unread === "true") {
      query.isRead = false;
    }

    console.log('📋 [NOTIFICATIONS API] Fetching notifications with query:', JSON.stringify(query, null, 2))
    
    const notifications = await Notification.find(query)
      .populate("sender", "name")
      .sort({ createdAt: -1 })
      .limit(50);

    // For stock_returned notifications, also fetch the related return transaction status
    const notificationsWithStatus = await Promise.all(
      notifications.map(async (notification) => {
        if (notification.type === 'stock_returned' && notification.relatedId) {
          try {
            const returnTx = await ReturnTransaction.findById(notification.relatedId)
            const notificationObj = notification.toObject()
            notificationObj.returnStatus = returnTx?.status || 'unknown' // 'pending' or 'received'
            return notificationObj
          } catch (error) {
            console.error('Failed to fetch return transaction status:', error)
            const notificationObj = notification.toObject()
            notificationObj.returnStatus = 'unknown'
            return notificationObj
          }
        }
        return notification.toObject()
      })
    )

    console.log(`✅ [NOTIFICATIONS API] Found ${notifications.length} notifications for user ${userId}`)
    
    return NextResponse.json(notificationsWithStatus);
  } catch (error) {
    console.error("Notifications GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await dbConnect();
  } catch (error) {
    console.error("Database connection error:", error);
    return NextResponse.json(
      { error: "Database connection failed", details: error.message },
      { status: 500 }
    );
  }

  try {
    const data = await request.json();

    // Validate required fields
    if (!data.userId || !data.message) {
      return NextResponse.json(
        { error: "userId and message are required" },
        { status: 400 }
      );
    }

    // Create notification
    const notification = await Notification.create({
      recipient: data.userId,
      sender: data.senderId || null,
      type: data.type || 'general',
      title: data.title || 'Notification',
      message: data.message,
      isRead: data.read || false,
    });

    const populatedNotification = await Notification.findById(notification._id)
      .populate("sender", "name")
      .populate("recipient", "name");

    return NextResponse.json(populatedNotification, { status: 201 });
  } catch (error) {
    console.error("Notifications POST error:", error);
    return NextResponse.json(
      { error: "Failed to create notification", details: error.message },
      { status: 500 }
    );
  }
}
