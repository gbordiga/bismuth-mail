import type { SendLog } from "@/lib/db"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function parseErrorDetail(value?: string): unknown {
  if (!value?.trim()) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function serializeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    const record: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    }
    const extra = error as Error & Record<string, unknown>
    for (const key of ["code", "command", "response", "responseCode", "errno"]) {
      if (extra[key] !== undefined) record[key] = extra[key]
    }
    if (error.stack) record.stack = error.stack
    return JSON.stringify(record, null, 2)
  }
  if (typeof error === "string") {
    return JSON.stringify({ message: error }, null, 2)
  }
  try {
    return JSON.stringify(error, null, 2)
  } catch {
    return JSON.stringify({ message: String(error) }, null, 2)
  }
}

function summarizeValidationIssues(message: string, details: unknown): string {
  if (!Array.isArray(details) || details.length === 0) return message
  const issues = details
    .filter(isRecord)
    .map((issue) => {
      const path = Array.isArray(issue.path) ? issue.path.map(String).join(".") : ""
      const issueMessage = typeof issue.message === "string" ? issue.message : ""
      if (!issueMessage) return ""
      return path ? `${path}: ${issueMessage}` : issueMessage
    })
    .filter(Boolean)
  if (issues.length === 0) return message
  const extra = issues.length > 1 ? ` (+${issues.length - 1} more)` : ""
  return `${message}: ${issues[0]}${extra}`
}

export function formatBatchRequestError(
  data: unknown,
  httpStatus?: number,
): { error: string; errorDetail: string } {
  const record = isRecord(data) ? data : {}
  const message =
    typeof record.message === "string" && record.message.trim()
      ? record.message
      : typeof record.error === "string" && record.error.trim()
        ? record.error
        : "Batch request failed"

  const payload = {
    httpStatus,
    success: record.success,
    code: record.code,
    message,
    retryable: record.retryable,
    details: record.details,
  }

  return {
    error: summarizeValidationIssues(message, record.details),
    errorDetail: JSON.stringify(payload, null, 2),
  }
}

export function sendLogErrorReport(log: Pick<
  SendLog,
  "contactEmail" | "contactName" | "status" | "attempt" | "error" | "errorDetail" | "sentAt"
>) {
  return {
    email: log.contactEmail,
    name: log.contactName,
    status: log.status,
    attempt: log.attempt,
    sentAt: log.sentAt ? new Date(log.sentAt).toISOString() : null,
    error: log.error ?? "",
    detail: parseErrorDetail(log.errorDetail),
  }
}

export function serializeSendLogError(
  log: Pick<SendLog, "contactEmail" | "contactName" | "status" | "attempt" | "error" | "errorDetail" | "sentAt">,
): string {
  return JSON.stringify(sendLogErrorReport(log), null, 2)
}

export function serializeSendLogErrors(logs: SendLog[]): string {
  const failed = logs.filter((log) => log.status === "failed")
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      failedCount: failed.length,
      errors: failed.map((log) => sendLogErrorReport(log)),
    },
    null,
    2,
  )
}

export function sendLogHasError(log: Pick<SendLog, "status" | "error" | "errorDetail">): boolean {
  return log.status === "failed" && Boolean(log.error?.trim() || log.errorDetail?.trim())
}

export function listValidationIssues(errorDetail?: string): Array<{ path: string; message: string }> {
  const parsed = parseErrorDetail(errorDetail)
  if (!isRecord(parsed) || !Array.isArray(parsed.details)) return []
  return parsed.details
    .filter(isRecord)
    .map((issue) => {
      const path = Array.isArray(issue.path) ? issue.path.map(String).join(".") : ""
      const message = typeof issue.message === "string" ? issue.message : ""
      return { path, message }
    })
    .filter((issue) => issue.message.length > 0)
}

export function sendLogErrorFilename(email: string): string {
  const safe = email
    .replace(/[^\w.@+-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
  return `${safe || "send"}-error.json`
}
