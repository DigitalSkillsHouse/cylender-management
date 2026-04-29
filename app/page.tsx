import { cookies, headers } from "next/headers"
import { HomePageClient } from "@/components/home-page-client"
import { verifyToken } from "@/lib/auth"

interface User {
  id: string
  email: string
  role: "admin" | "employee"
  name: string
  debitAmount?: number
  creditAmount?: number
}

async function getInitialUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies()
    const headerStore = await headers()

    const user = await verifyToken({
      cookies: cookieStore,
      headers: headerStore,
    })

    if (!user) {
      return null
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      debitAmount: user.debitAmount,
      creditAmount: user.creditAmount,
    }
  } catch {
    return null
  }
}

export default async function Home() {
  const initialUser = await getInitialUser()
  return <HomePageClient initialUser={initialUser} />
}
