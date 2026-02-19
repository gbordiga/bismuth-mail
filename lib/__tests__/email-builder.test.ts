import { describe, it, expect } from "vitest"
import { blockToHtml, buildFullHtml, type EditorBlock } from "@/lib/email-builder"

function block(overrides: Partial<EditorBlock> & { type: EditorBlock["type"] }): EditorBlock {
  return { id: "1", content: "", props: {}, ...overrides }
}

describe("blockToHtml", () => {
  it("renders a text block", () => {
    const html = blockToHtml(block({ type: "text", content: "Hello world" }))
    expect(html).toContain("Hello world")
    expect(html).toMatch(/<div.*>Hello world<\/div>/)
  })

  it("renders an image block with src and alt", () => {
    const html = blockToHtml(
      block({
        type: "image",
        content: "https://example.com/img.png",
        props: { alt: "Logo", align: "left" },
      }),
    )
    expect(html).toContain('src="https://example.com/img.png"')
    expect(html).toContain('alt="Logo"')
    expect(html).toContain("text-align: left")
  })

  it("returns empty string for image without src in non-preview mode", () => {
    expect(blockToHtml(block({ type: "image" }), false)).toBe("")
  })

  it("returns placeholder for image without src in preview mode", () => {
    const html = blockToHtml(block({ type: "image" }), true)
    expect(html).toContain("Image placeholder")
  })

  it("renders a button block with href and colors", () => {
    const html = blockToHtml(
      block({
        type: "button",
        content: "Click me",
        props: { href: "https://example.com", bgColor: "#ff0000", textColor: "#000000" },
      }),
    )
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain("Click me")
    expect(html).toContain("#ff0000")
    expect(html).toContain("#000000")
  })

  it("renders a button block with defaults when no props given", () => {
    const html = blockToHtml(block({ type: "button", content: "Go" }))
    expect(html).toContain('href="#"')
    expect(html).toContain("#3b82f6")
    expect(html).toContain("#ffffff")
  })

  it("renders a divider with default styling", () => {
    const html = blockToHtml(block({ type: "divider" }))
    expect(html).toContain("<hr")
    expect(html).toContain("#e5e7eb")
  })

  it("renders a divider with custom thickness and color", () => {
    const html = blockToHtml(block({ type: "divider", props: { thickness: "3", color: "#000" } }))
    expect(html).toContain("3px solid #000")
  })

  it("renders raw html block as-is", () => {
    const raw = "<table><tr><td>Custom</td></tr></table>"
    expect(blockToHtml(block({ type: "html", content: raw }))).toBe(raw)
  })
})

describe("buildFullHtml", () => {
  const blocks: EditorBlock[] = [
    { id: "1", type: "text", content: "<p>Hello</p>", props: {} },
    { id: "2", type: "divider", content: "", props: {} },
    { id: "3", type: "text", content: "<p>World</p>", props: {} },
  ]

  it("produces a complete HTML document", () => {
    const html = buildFullHtml(blocks, "", "mailto:unsub@test.com")
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain("<html>")
    expect(html).toContain("</html>")
  })

  it("includes all block contents", () => {
    const html = buildFullHtml(blocks, "", "mailto:unsub@test.com")
    expect(html).toContain("<p>Hello</p>")
    expect(html).toContain("<p>World</p>")
    expect(html).toContain("<hr")
  })

  it("includes sender signature when provided", () => {
    const sig = "<p>Best regards, Team</p>"
    const html = buildFullHtml(blocks, sig, "mailto:unsub@test.com")
    expect(html).toContain(sig)
  })

  it("omits signature wrapper when empty", () => {
    const html = buildFullHtml(blocks, "", "mailto:unsub@test.com")
    expect(html).not.toContain("Best regards")
  })

  it("includes unsubscribe link", () => {
    const html = buildFullHtml(blocks, "", "mailto:unsub@test.com")
    expect(html).toContain('href="mailto:unsub@test.com"')
    expect(html).toContain("unsubscribe")
  })

  it("filters out empty blocks", () => {
    const withEmpty: EditorBlock[] = [
      { id: "1", type: "text", content: "Visible", props: {} },
      { id: "2", type: "image", content: "", props: {} },
    ]
    const html = buildFullHtml(withEmpty, "", "mailto:unsub@test.com", false)
    expect(html).toContain("Visible")
    expect(html).not.toContain("<img ")
  })
})
