import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST as sendPost } from "@/app/api/smtp/send/route"
import { POST as testPost } from "@/app/api/smtp/test/route"

const { sendMailMock, verifyMock, createTransportMock } = vi.hoisted(() => {
  const sendMail = vi.fn()
  const verify = vi.fn()
  const createTransport = vi.fn(() => ({
    sendMail,
    verify,
  }))
  return {
    sendMailMock: sendMail,
    verifyMock: verify,
    createTransportMock: createTransport,
  }
})

vi.mock("nodemailer", () => ({
  default: {
    createTransport: createTransportMock,
  },
}))

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("SMTP route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns validation envelope for send endpoint", async () => {
    const res = await sendPost(jsonRequest("http://localhost/api/smtp/send", { invalid: true }))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.code).toBe("VALIDATION_ERROR")
    expect(data.retryable).toBe(false)
  })

  it("returns success envelope for send endpoint", async () => {
    sendMailMock.mockResolvedValueOnce({ accepted: ["to@example.com"] })

    const res = await sendPost(
      jsonRequest("http://localhost/api/smtp/send", {
        smtp: {
          host: "smtp.example.com",
          port: 587,
          secure: false,
          auth: { user: "user", pass: "pass" },
        },
        from: { name: "Team", email: "team@example.com" },
        replyTo: "reply@example.com",
        to: "to@example.com",
        subject: "Subject",
        html: "<p>hello</p>",
      }),
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual({ success: true })
  })

  it("returns categorized SMTP errors for test endpoint", async () => {
    verifyMock.mockRejectedValueOnce(new Error("535 Authentication failed"))
    const res = await testPost(
      jsonRequest("http://localhost/api/smtp/test", {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        username: "user",
        password: "pass",
      }),
    )
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.code).toBe("SMTP_AUTH_ERROR")
    expect(data.retryable).toBe(false)
  })
})
