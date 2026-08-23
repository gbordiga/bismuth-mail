import { describe, expect, it } from "vitest"
import { replaceMergeFields } from "@/lib/merge-fields"

describe("replaceMergeFields", () => {
  it("escapes HTML in merge values", () => {
    const result = replaceMergeFields("Hi {{firstName}} at {{company}}", {
      email: "a@b.com",
      firstName: "<Ada>",
      lastName: "Lovelace",
      customData: { company: 'A&B "Labs"' },
    })
    expect(result).toBe("Hi &lt;Ada&gt; at A&amp;B &quot;Labs&quot;")
  })
})
