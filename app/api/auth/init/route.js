import dbConnect from "@/lib/mongodb"
import User from "@/models/User"
import { NextResponse } from "next/server"

export async function POST() {
  try {
    await dbConnect()

    // Remove any existing admin users (including old admin@gmail.com)
    await User.deleteMany({ role: "admin" })
    console.log("Removed all existing admin users")

    // Create the new admin user with specified credentials
    const admin = await User.create({
      name: "Syed Tayyab Industrial Gases LLC",
      email: "syyedtayyabindustrialgasesllc@gmail.com",
      password: "(Huraira@jutt$9292)",
      role: "admin",
    })

    console.log("Created new admin user:", admin.email)
    return NextResponse.json({ message: "Admin user created successfully" })
  } catch (error) {
    console.error("Init error:", error)
    return NextResponse.json({ error: "Failed to initialize admin user" }, { status: 500 })
  }
}
