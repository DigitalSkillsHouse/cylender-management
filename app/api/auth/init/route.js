import dbConnect from "@/lib/mongodb"
import User from "@/models/User"
import { NextResponse } from "next/server"

export async function POST() {
  try {
    await dbConnect()

    // Remove any existing admin users (including old admin@gmail.com)
    await User.deleteMany({ role: "admin" })
    console.log("Removed all existing admin users")

    // Create the new admin user with credentials from environment variables
    const admin = await User.create({
      name: process.env.ADMIN_NAME || "Syed Tayyab Industrial Gases LLC",
      email: process.env.ADMIN_EMAIL || "syyedtayyabindustrialgasesllc@gmail.com",
      password: process.env.ADMIN_PASSWORD || "Syed@8175",
      role: "admin",
    })

    console.log("Created new admin user:", admin.email)
    return NextResponse.json({ message: "Admin user created successfully" })
  } catch (error) {
    console.error("Init error:", error)
    return NextResponse.json({ error: "Failed to initialize admin user" }, { status: 500 })
  }
}
