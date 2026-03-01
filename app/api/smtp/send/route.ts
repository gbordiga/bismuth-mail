import nodemailer from "nodemailer"
import { smtpSendSchema } from "@/lib/validations"
import {
  classifySmtpError,
  smtpSuccessResponse,
  smtpValidationError,
  smtpErrorResponse,
} from "@/lib/api/smtp-response"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = smtpSendSchema.safeParse(body)
    if (!parsed.success) {
      return smtpValidationError(parsed.error.issues)
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

    return smtpSuccessResponse()
  } catch (error: unknown) {
    const classified = classifySmtpError(error)
    return smtpErrorResponse(classified)
  }
}
