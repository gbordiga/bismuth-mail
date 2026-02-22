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

type SendResult = { email: string; status: "sent" | "failed"; attempts: number; error?: string }

async function sendWithRetry(
  transporter: nodemailer.Transporter,
  mail: { from: string; replyTo: string; to: string; subject: string; html: string },
  maxRetries: number,
): Promise<SendResult> {
  let lastError = ""
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await transporter.sendMail(mail)
      return { email: mail.to, status: "sent", attempts: attempt + 1 }
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
  return { email: mail.to, status: "failed", attempts: maxRetries + 1, error: lastError }
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

    const { smtp, from, replyTo, recipients, delayMs, maxRetries, maxConnections } = parsed.data
    const safeName = from.name.replace(/["\\\r\n]/g, "")
    const fromHeader = `"${safeName}" <${from.email}>`
    const replyToHeader = replyTo || from.email

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.auth,
      pool: true,
      maxConnections,
      maxMessages: Infinity,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    })

    const promises = recipients.map(async (r, i) => {
      // Stagger starts when throttling is configured
      if (delayMs > 0 && i > 0) {
        await sleep(delayMs * i)
      }
      return sendWithRetry(
        transporter,
        { from: fromHeader, replyTo: replyToHeader, to: r.to, subject: r.subject, html: r.html },
        maxRetries,
      )
    })

    const results = await Promise.all(promises)
    transporter.close()
    return NextResponse.json({ success: true, results })
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : "Unknown error"
    const safe = raw.length > 200 ? raw.slice(0, 200) + "..." : raw
    return NextResponse.json({ success: false, error: safe, results: [] }, { status: 500 })
  }
}
