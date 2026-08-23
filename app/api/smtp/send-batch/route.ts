import nodemailer from "nodemailer"
import { smtpSendBatchSchema } from "@/lib/validations"
import { collectMailAttachments } from "@/lib/attachments"
import { buildFullHtml, type EditorBlock } from "@/lib/email-builder"
import { htmlToPlainText } from "@/lib/html-text"
import { replaceMergeFields, type MergeContact } from "@/lib/merge-fields"
import { buildUnsubscribeMailto } from "@/lib/preview"
import {
  classifySmtpError,
  smtpErrorResponse,
  smtpSuccessResponse,
  smtpValidationError,
  trimErrorMessage,
} from "@/lib/api/smtp-response"
import { serializeUnknownError } from "@/lib/send-error"

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

type ContactData = MergeContact

type SendResult = {
  email: string
  status: "sent" | "failed"
  attempts: number
  error?: string
  errorDetail?: string
}

async function sendWithRetry(
  transporter: nodemailer.Transporter,
  mail: {
    from: string
    replyTo: string
    to: string
    subject: string
    html: string
    text: string
    headers?: Record<string, string>
    attachments?: ReturnType<typeof collectMailAttachments>
  },
  maxRetries: number,
): Promise<SendResult> {
  let lastError = ""
  let lastErrorDetail = ""
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await transporter.sendMail(mail)
      return { email: mail.to, status: "sent", attempts: attempt + 1 }
    } catch (err: unknown) {
      lastError = trimErrorMessage(err, "Unknown error")
      lastErrorDetail = serializeUnknownError(err)
      if (attempt < maxRetries && isTransientError(err)) {
        await sleep(Math.pow(2, attempt) * 1000)
      } else {
        break
      }
    }
  }
  return {
    email: mail.to,
    status: "failed",
    attempts: maxRetries + 1,
    error: lastError,
    errorDetail: lastErrorDetail,
  }
}

async function processBatchWithWorkerPool(args: {
  contacts: ContactData[]
  delayMs: number
  maxConnections: number
  subjectTemplate: string
  blocks: EditorBlock[]
  signature: string
  unsubscribeEmail: string
  transporter: nodemailer.Transporter
  maxRetries: number
  fromHeader: string
  replyToHeader: string
  attachments: ReturnType<typeof collectMailAttachments>
}): Promise<SendResult[]> {
  const {
    contacts,
    delayMs,
    maxConnections,
    subjectTemplate,
    blocks,
    signature,
    unsubscribeEmail,
    transporter,
    maxRetries,
    fromHeader,
    replyToHeader,
    attachments,
  } = args

  const results: SendResult[] = new Array(contacts.length)
  let nextIndex = 0

  const workerCount = Math.max(1, Math.min(maxConnections, contacts.length))

  async function worker() {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= contacts.length) {
        return
      }

      const contact = contacts[index]

      if (delayMs > 0 && index > 0) {
        await sleep(delayMs)
      }

      const mailtoHref = buildUnsubscribeMailto(unsubscribeEmail, contact.email)
      const fullHtml = buildFullHtml(blocks, signature, mailtoHref)
      const subject = replaceMergeFields(subjectTemplate, contact)
      const html = replaceMergeFields(fullHtml, contact)

      results[index] = await sendWithRetry(
        transporter,
        {
          from: fromHeader,
          replyTo: replyToHeader,
          to: contact.email,
          subject,
          html,
          text: htmlToPlainText(html),
          headers: {
            "List-Unsubscribe": `<${mailtoHref}>`,
          },
          attachments,
        },
        maxRetries,
      )
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

export async function POST(req: Request) {
  let transporter: nodemailer.Transporter | null = null

  try {
    const body = await req.json()
    const parsed = smtpSendBatchSchema.safeParse(body)
    if (!parsed.success) {
      return smtpValidationError(parsed.error.issues)
    }

    const { smtp, from, replyTo, subjectTemplate, blocks, signature, unsubscribeEmail, contacts, delayMs, maxRetries, maxConnections } = parsed.data
    const safeName = from.name.replace(/["\\\r\n]/g, "")
    const fromHeader = `"${safeName}" <${from.email}>`
    const replyToHeader = replyTo || from.email

    transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.auth,
      pool: true,
      maxConnections,
      maxMessages: Infinity,
      disableFileAccess: true,
      disableUrlAccess: true,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    })

    const results = await processBatchWithWorkerPool({
      contacts,
      delayMs,
      maxConnections,
      subjectTemplate,
      blocks: blocks as EditorBlock[],
      signature,
      unsubscribeEmail,
      transporter,
      maxRetries,
      fromHeader,
      replyToHeader,
      attachments: collectMailAttachments(blocks as EditorBlock[]),
    })

    return smtpSuccessResponse({ results })
  } catch (error: unknown) {
    const classified = classifySmtpError(error)
    return smtpErrorResponse({ ...classified, details: { results: [] } })
  } finally {
    transporter?.close()
  }
}
