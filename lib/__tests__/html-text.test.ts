import { describe, expect, it } from "vitest"
import { htmlToPlainText } from "@/lib/html-text"

describe("htmlToPlainText", () => {
  it("strips tags and decodes common entities", () => {
    expect(htmlToPlainText("<p>Hello &amp; welcome</p><br />there")).toContain("Hello & welcome")
    expect(htmlToPlainText("<p>Hello &amp; welcome</p><br />there")).toContain("there")
  })

  it("drops script and style content", () => {
    const text = htmlToPlainText("<style>body{}</style><p>Hi</p><script>alert(1)</script>")
    expect(text).toBe("Hi")
  })

  it("drops script and style blocks with spaced or mixed-case end tags", () => {
    const text = htmlToPlainText(
      "<STYLE>body{}</STYLE ><p>Hi</p><script>alert(1)</script >",
    )
    expect(text).toBe("Hi")
    expect(text).not.toContain("alert")
    expect(text).not.toContain("body{}")
  })
})
