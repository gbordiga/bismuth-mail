import { NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { smtpTestSchema } from "@/lib/validations"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = smtpTestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request: " + parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      )
    }
    const { host, port, secure, username, password } = parsed.data

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user: username,
        pass: password,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    })

    await transporter.verify()
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : "Unknown error"
    const safe = raw.length > 200 ? raw.slice(0, 200) + "..." : raw
    return NextResponse.json({ success: false, error: safe }, { status: 400 })
  }
}
