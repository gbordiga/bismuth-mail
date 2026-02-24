import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "@/app/api/smtp/send-batch/route"

const { sendMailMock, closeMock, createTransportMock } = vi.hoisted(() => {
  const sendMail = vi.fn()
  const close = vi.fn()
  const createTransport = vi.fn(() => ({
    sendMail,
    close,
  }))
  return {
    sendMailMock: sendMail,
    closeMock: close,
    createTransportMock: createTransport,
  }
})

vi.mock("nodemailer", () => ({
  default: {
    createTransport: createTransportMock,
  },
}))

function buildValidBody() {
  return {
    smtp: {
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: {
        user: "user",
        pass: "pass",
      },
    },
    from: {
      name: 'Team "News"',
      email: "news@example.com",
    },
    replyTo: "",
    subjectTemplate: "Hi {{firstName}} from {{company}}",
    blocks: [
      {
        id: "b1",
        type: "text",
        content: "<p>Hello {{firstName}} {{lastName}} from {{company}}</p>",
        props: {},
      },
    ],
    signature: "",
    unsubscribeEmail: "unsubscribe@example.com",
    contacts: [
      {
        email: "alice@example.com",
        firstName: "<Alice>",
        lastName: "A&B",
        customData: {
          company: 'Acme "Inc"',
        },
      },
    ],
    delayMs: 0,
    maxRetries: 1,
    maxConnections: 3,
  }
}

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/smtp/send-batch", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  })
}

describe("POST /api/smtp/send-batch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 400 for invalid payload", async () => {
    const req = buildRequest({ invalid: true })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.success).toBe(false)
    expect(typeof data.error).toBe("string")
    expect(createTransportMock).not.toHaveBeenCalled()
  })

  it("sends batch and replaces merge fields with escaped values", async () => {
    sendMailMock.mockResolvedValue({ accepted: ["alice@example.com"] })
    const req = buildRequest(buildValidBody())
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(createTransportMock).toHaveBeenCalledTimes(1)
    expect(sendMailMock).toHaveBeenCalledTimes(1)
    expect(closeMock).toHaveBeenCalledTimes(1)

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Team News" <news@example.com>',
        replyTo: "news@example.com",
        to: "alice@example.com",
        subject: "Hi &lt;Alice&gt; from Acme &quot;Inc&quot;",
        html: expect.stringContaining("Hello &lt;Alice&gt; A&amp;B from Acme &quot;Inc&quot;"),
      }),
    )
    expect(data.results).toEqual([{ email: "alice@example.com", status: "sent", attempts: 1 }])
  })

  it("retries transient SMTP errors and succeeds on second attempt", async () => {
    const transientError = Object.assign(new Error("SMTP timeout"), { code: "ETIMEDOUT" })
    sendMailMock.mockRejectedValueOnce(transientError).mockResolvedValueOnce({ accepted: ["alice@example.com"] })

    vi.useFakeTimers()
    try {
      const req = buildRequest(buildValidBody())
      const responsePromise = POST(req)
      await vi.runAllTimersAsync()
      const res = await responsePromise
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(sendMailMock).toHaveBeenCalledTimes(2)
      expect(data.results).toEqual([{ email: "alice@example.com", status: "sent", attempts: 2 }])
    } finally {
      vi.useRealTimers()
    }
  })
})

