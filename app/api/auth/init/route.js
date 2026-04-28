import dbConnect from "@/lib/mongodb"
import User from "@/models/User"
import { NextResponse } from "next/server"

export async function POST() {
  try {
    await dbConnect()

    const targetName = process.env.ADMIN_NAME || "Syed Tayyab Industrial Gases LLC"
    const targetEmail = process.env.ADMIN_EMAIL || "syyedtayyabindustrialgasesllc@gmail.com"
    const targetPassword = process.env.ADMIN_PASSWORD || "Syed@8175"

    // Idempotent behavior: keep existing admin if present.
    let admin = await User.findOne({ role: "admin" })
    if (admin) {
      return NextResponse.json({
        message: "Admin user already initialized",
        email: admin.email,
      })
    }

    // If user exists with admin email (possibly employee), elevate/update safely.
    admin = await User.findOne({ email: targetEmail })
    if (admin) {
      admin.name = admin.name || targetName
      admin.role = "admin"
      if (!admin.password || admin.password.length < 20) {
        admin.password = targetPassword
      }
      await admin.save()
      return NextResponse.json({
        message: "Existing user promoted to admin",
        email: admin.email,
      })
    }

    admin = await User.create({
      name: targetName,
      email: targetEmail,
      password: targetPassword,
      role: "admin",
    })

    return NextResponse.json({
      message: "Admin user created successfully",
      email: admin.email,
    })
  } catch (error) {
    console.error("Init error:", error)
    return NextResponse.json(
      { error: "Failed to initialize admin user", details: error?.message || "unknown" },
      { status: 500 },
    )
  }
}
