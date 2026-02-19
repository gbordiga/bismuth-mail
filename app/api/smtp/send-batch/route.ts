import { NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { smtpSendBatchSchema } from "@/lib/validations"

const TRANSIENT_CODES = new Set(["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EENVELOPE"])

function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message || ""
  const code = (err as NodeJS.ErrnoException).code || ""
  if (TRANSIENT_CODES.has(code)) return true
  if (/^(421|450|451)\b/.test(msg)) return true
  if (/timeout|ECONNRESET|EPIPE/i.test(msg)) return true
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = smtpSendBatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request: " + parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      )
    }

    const { smtp, from, replyTo, recipients, delayMs, maxRetries } = parsed.data
    const safeName = from.name.replace(/["\\\r\n]/g, "")
    const fromHeader = `"${safeName}" <${from.email}>`
    const replyToHeader = replyTo || from.email

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.auth,
      pool: true,
      maxConnections: 3,
      maxMessages: Infinity,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    })

    const results: { email: string; status: "sent" | "failed"; attempts: number; error?: string }[] = []

    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i]
      let lastError = ""
      let sent = false
      let attempts = 0

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        attempts = attempt + 1
        try {
          await transporter.sendMail({
            from: fromHeader,
            replyTo: replyToHeader,
            to: r.to,
            subject: r.subject,
            html: r.html,
          })
          sent = true
          break
        } catch (err: unknown) {
          lastError = err instanceof Error ? err.message : "Unknown error"
          if (lastError.length > 200) lastError = lastError.slice(0, 200) + "..."

          if (attempt < maxRetries && isTransientError(err)) {
            await sleep(Math.pow(2, attempt) * 1000)
          } else {
            break
          }
        }
      }

      results.push(
        sent
          ? { email: r.to, status: "sent", attempts }
          : { email: r.to, status: "failed", attempts, error: lastError },
      )

      if (i < recipients.length - 1 && delayMs > 0) {
        await sleep(delayMs)
      }
    }

    transporter.close()
    return NextResponse.json({ success: true, results })
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : "Unknown error"
    const safe = raw.length > 200 ? raw.slice(0, 200) + "..." : raw
    return NextResponse.json({ success: false, error: safe, results: [] }, { status: 500 })
  }
}
