import { NextResponse } from "next/server"

export type SmtpErrorCode =
  | "VALIDATION_ERROR"
  | "SMTP_AUTH_ERROR"
  | "SMTP_CONNECTION_ERROR"
  | "SMTP_RATE_LIMIT"
  | "SMTP_SEND_ERROR"
  | "INTERNAL_ERROR"

export interface SmtpErrorBody {
  success: false
  code: SmtpErrorCode
  message: string
  retryable: boolean
  details?: unknown
}

interface ErrorResponseArgs {
  status: number
  code: SmtpErrorCode
  message: string
  retryable?: boolean
  details?: unknown
}

export function smtpValidationError(details: unknown) {
  return smtpErrorResponse({
    status: 400,
    code: "VALIDATION_ERROR",
    message: "Invalid request payload",
    retryable: false,
    details,
  })
}

export function smtpErrorResponse({ status, code, message, retryable = false, details }: ErrorResponseArgs) {
  const body: SmtpErrorBody = {
    success: false,
    code,
    message,
    retryable,
  }
  if (details !== undefined) {
    body.details = details
  }

  return NextResponse.json(body, { status })
}

export function smtpSuccessResponse<T extends Record<string, unknown>>(payload?: T) {
  return NextResponse.json({
    success: true,
    ...payload,
  })
}

export function trimErrorMessage(error: unknown, fallback = "Unexpected SMTP error", max = 240): string {
  const raw = error instanceof Error ? error.message : fallback
  const safe = raw.trim() || fallback
  return safe.length > max ? `${safe.slice(0, max)}...` : safe
}

export function classifySmtpError(error: unknown): {
  status: number
  code: SmtpErrorCode
  message: string
  retryable: boolean
} {
  const message = trimErrorMessage(error)
  const lowered = message.toLowerCase()

  if (/auth|535|534|login|credential/.test(lowered)) {
    return { status: 400, code: "SMTP_AUTH_ERROR", message, retryable: false }
  }
  if (/421|450|451|too many|rate|throttl/.test(lowered)) {
    return { status: 429, code: "SMTP_RATE_LIMIT", message, retryable: true }
  }
  if (/econnection|econnrefused|econnreset|etimedout|timeout|socket|tls|ssl/.test(lowered)) {
    return { status: 502, code: "SMTP_CONNECTION_ERROR", message, retryable: true }
  }

  return { status: 500, code: "SMTP_SEND_ERROR", message, retryable: false }
}
