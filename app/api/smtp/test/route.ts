import nodemailer from "nodemailer"
import { smtpTestSchema } from "@/lib/validations"
import {
  classifySmtpError,
  smtpSuccessResponse,
  smtpValidationError,
  smtpErrorResponse,
} from "@/lib/api/smtp-response"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = smtpTestSchema.safeParse(body)
    if (!parsed.success) {
      return smtpValidationError(parsed.error.issues)
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
    return smtpSuccessResponse()
  } catch (error: unknown) {
    const classified = classifySmtpError(error)
    return smtpErrorResponse(classified)
  }
}
