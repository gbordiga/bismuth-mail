import { describe, expect, it } from "vitest"
import type { SendLog } from "@/lib/db"
import {
  formatBatchRequestError,
  listValidationIssues,
  sendLogErrorFilename,
  sendLogHasError,
  serializeSendLogError,
  serializeUnknownError,
} from "@/lib/send-error"

function failedLog(overrides: Partial<SendLog> = {}): SendLog {
  return {
    newsletterId: 1,
    contactEmail: "gbordiga@gmail.com",
    contactName: "Giacomo Bordiga",
    status: "failed",
    attempt: 1,
    error: "Invalid request payload",
    sentAt: new Date("2026-08-23T19:13:38.000Z"),
    ...overrides,
  }
}

describe("formatBatchRequestError", () => {
  it("keeps the short message when there are no validation details", () => {
    expect(formatBatchRequestError({ message: "Invalid request payload" }, 400)).toEqual({
      error: "Invalid request payload",
      errorDetail: JSON.stringify(
        {
          httpStatus: 400,
          success: undefined,
          code: undefined,
          message: "Invalid request payload",
          retryable: undefined,
          details: undefined,
        },
        null,
        2,
      ),
    })
  })

  it("summarizes Zod issues and stores the full payload", () => {
    const formatted = formatBatchRequestError(
      {
        success: false,
        code: "VALIDATION_ERROR",
        message: "Invalid request payload",
        retryable: false,
        details: [
          { path: ["blocks", 0, "content"], message: "Too big: expected string to have <=8000000 characters" },
          { path: ["subjectTemplate"], message: "Too big: expected string to have <=998 characters" },
        ],
      },
      400,
    )

    expect(formatted.error).toBe(
      "Invalid request payload: blocks.0.content: Too big: expected string to have <=8000000 characters (+1 more)",
    )
    expect(JSON.parse(formatted.errorDetail)).toMatchObject({
      httpStatus: 400,
      code: "VALIDATION_ERROR",
      details: [{ path: ["blocks", 0, "content"] }, { path: ["subjectTemplate"] }],
    })
  })
})

describe("serializeSendLogError", () => {
  it("includes parsed errorDetail when present", () => {
    const report = JSON.parse(
      serializeSendLogError(
        failedLog({
          errorDetail: JSON.stringify({ code: "VALIDATION_ERROR", details: [{ path: ["blocks"] }] }),
        }),
      ),
    )
    expect(report.email).toBe("gbordiga@gmail.com")
    expect(report.detail).toEqual({ code: "VALIDATION_ERROR", details: [{ path: ["blocks"] }] })
  })

  it("falls back to the short error when no detail was stored", () => {
    const report = JSON.parse(serializeSendLogError(failedLog()))
    expect(report.error).toBe("Invalid request payload")
    expect(report.detail).toBeNull()
  })
})

describe("serializeUnknownError", () => {
  it("keeps nodemailer fields for analysis", () => {
    const error = Object.assign(new Error("550 mailbox unavailable"), {
      code: "EENVELOPE",
      response: "550 mailbox unavailable",
      responseCode: 550,
      command: "RCPT TO",
    })
    expect(JSON.parse(serializeUnknownError(error))).toMatchObject({
      name: "Error",
      message: "550 mailbox unavailable",
      code: "EENVELOPE",
      responseCode: 550,
      command: "RCPT TO",
    })
  })
})

describe("listValidationIssues", () => {
  it("returns every Zod issue without truncating the list", () => {
    expect(
      listValidationIssues(
        JSON.stringify({
          details: [
            { path: ["blocks", 0, "content"], message: "Too big" },
            { path: ["subjectTemplate"], message: "Required" },
          ],
        }),
      ),
    ).toEqual([
      { path: "blocks.0.content", message: "Too big" },
      { path: "subjectTemplate", message: "Required" },
    ])
  })
})

describe("sendLog helpers", () => {
  it("builds a safe filename and detects failed rows with an error", () => {
    expect(sendLogErrorFilename("Ada Lovelace <ada@example.com>")).toBe("Ada-Lovelace-ada@example.com-error.json")
    expect(sendLogHasError(failedLog())).toBe(true)
    expect(sendLogHasError({ status: "sent", error: "", errorDetail: "" })).toBe(false)
  })
})
