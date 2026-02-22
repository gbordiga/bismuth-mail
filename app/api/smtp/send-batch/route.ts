import { NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { smtpSendBatchSchema } from "@/lib/validations"
import { buildFullHtml, type EditorBlock } from "@/lib/email-builder"

export const maxDuration = 300

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

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

interface ContactData {
  email: string
  firstName: string
  lastName: string
  customData?: Record<string, string>
}

function replaceMergeFields(html: string, contact: ContactData): string {
  let result = html
  result = result.replace(/\{\{email\}\}/g, escapeHtml(contact.email))
  result = result.replace(/\{\{firstName\}\}/g, escapeHtml(contact.firstName))
  result = result.replace(/\{\{lastName\}\}/g, escapeHtml(contact.lastName))
  if (contact.customData) {
    for (const [key, value] of Object.entries(contact.customData)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), escapeHtml(value || ""))
    }
  }
  return result
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

    const { smtp, from, replyTo, subjectTemplate, blocks, signature, unsubscribeEmail, contacts, delayMs, maxRetries, maxConnections } = parsed.data
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

    const promises = contacts.map(async (contact, i) => {
      if (delayMs > 0 && i > 0) {
        await sleep(delayMs * i)
      }

      const mailtoHref = `mailto:${unsubscribeEmail}?subject=${encodeURIComponent("UNSUBSCRIBE")}&body=${encodeURIComponent(`Please remove ${contact.email} from this mailing list.`)}`
      const fullHtml = buildFullHtml(blocks as EditorBlock[], signature, mailtoHref)
      const subject = replaceMergeFields(subjectTemplate, contact)
      const html = replaceMergeFields(fullHtml, contact)

      return sendWithRetry(
        transporter,
        { from: fromHeader, replyTo: replyToHeader, to: contact.email, subject, html },
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
