import { NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { smtpSendSchema } from "@/lib/validations"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = smtpSendSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request: " + parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      )
    }
    const { smtp, from, replyTo, to, subject, html } = parsed.data

    const safeName = from.name.replace(/["\\\r\n]/g, "")

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.auth,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    })

    await transporter.sendMail({
      from: `"${safeName}" <${from.email}>`,
      replyTo: replyTo || from.email,
      to,
      subject,
      html,
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : "Unknown error"
    const safe = raw.length > 200 ? raw.slice(0, 200) + "..." : raw
    return NextResponse.json({ success: false, error: safe }, { status: 500 })
  }
}
