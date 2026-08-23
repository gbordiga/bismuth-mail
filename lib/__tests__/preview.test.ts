import { describe, expect, it } from "vitest"
import { buildCampaignPreviewSubject } from "@/lib/preview"

describe("buildCampaignPreviewSubject", () => {
  it("resolves merge fields with the sample contact", () => {
    expect(buildCampaignPreviewSubject("Hello {{firstName}}")).toBe("Hello John")
  })

  it("resolves merge fields with a real contact", () => {
    expect(
      buildCampaignPreviewSubject("Hi {{firstName}}", {
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        customData: {},
      }),
    ).toBe("Hi Ada")
  })
})
