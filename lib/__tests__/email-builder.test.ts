import { describe, it, expect } from "vitest"
import { blockToHtml, buildFullHtml, sanitizeEditorHtml, type EditorBlock } from "@/lib/email-builder"

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

function block(overrides: Partial<EditorBlock> & { type: EditorBlock["type"] }): EditorBlock {
  return { id: "1", content: "", props: {}, ...overrides }
}

describe("blockToHtml", () => {
  it("renders a text block", () => {
    const html = blockToHtml(block({ type: "text", content: "Hello world" }))
    expect(html).toContain("Hello world")
    expect(html).toMatch(/<div.*>Hello world<\/div>/)
  })

  it("omits empty and placeholder text blocks", () => {
    expect(blockToHtml(block({ type: "text", content: "" }))).toBe("")
    expect(blockToHtml(block({ type: "text", content: "<p>Write your text here...</p>" }))).toBe("")
    expect(blockToHtml(block({ type: "text", content: "<p><br></p>" }))).toBe("")
  })

  it("keeps tables and inline images in text blocks", () => {
    const html = blockToHtml(
      block({
        type: "text",
        content: `<table border="1" style="width:100%"><tr><td><img src="${TINY_PNG}" alt="dot" width="1" /></td></tr></table>`,
      }),
    )
    expect(html).toContain("<table")
    expect(html).toContain("data:image/png;base64")
    expect(html).toContain('alt="dot"')
    expect(html).toContain("width:100%")
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

  it("escapes quotes in image and button attributes", () => {
    const image = blockToHtml(
      block({
        type: "image",
        content: 'https://example.com/a.png" onerror="alert(1)',
        props: { alt: 'Logo "mark"' },
      }),
    )
    expect(image).toContain("https://example.com/a.png&quot; onerror=&quot;alert(1)")
    expect(image).toContain("Logo &quot;mark&quot;")
    expect(image).not.toContain('onerror="alert')

    const button = blockToHtml(
      block({
        type: "button",
        content: "Go",
        props: { href: 'https://example.com/" onclick="alert(1)' },
      }),
    )
    expect(button).toContain("https://example.com/&quot; onclick=&quot;alert(1)")
  })

  it("returns empty string for image without src in non-preview mode", () => {
    expect(blockToHtml(block({ type: "image" }), false)).toBe("")
  })

  it("returns placeholder for image without src in preview mode", () => {
    const html = blockToHtml(block({ type: "image" }), true)
    expect(html).toContain("Image placeholder")
  })

  it("keeps uploaded images as data URLs in preview and uses CID when sending", () => {
    const uploaded = block({ id: "hero", type: "image", content: TINY_PNG, props: { alt: "Logo" } })
    expect(blockToHtml(uploaded, true)).toContain(TINY_PNG)
    expect(blockToHtml(uploaded, false)).toContain('src="cid:img-hero"')
    expect(blockToHtml(uploaded, false)).not.toContain("data:image/png")
  })

  it("does not render attachment files in the email body", () => {
    const file = block({
      type: "attachment",
      content: "data:application/pdf;base64,JVBERi0=",
      props: { filename: "brief.pdf", size: "1024" },
    })
    expect(blockToHtml(file, true)).toBe("")
    expect(blockToHtml(file, false)).toBe("")
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

  it("renders a sanitized html block", () => {
    const raw = "<table><tr><td>Custom</td></tr></table>"
    expect(blockToHtml(block({ type: "html", content: raw }))).toContain("Custom")
    expect(blockToHtml(block({ type: "html", content: raw }))).toContain("<table>")
  })

  it("strips script tags from raw html blocks", () => {
    const html = blockToHtml(block({ type: "html", content: '<p>Safe</p><script>alert(1)</script>' }))
    expect(html).toContain("Safe")
    expect(html).not.toContain("<script")
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

describe("sanitizeEditorHtml", () => {
  it("preserves tables, styles, and base64 images", () => {
    const html = sanitizeEditorHtml(
      `<p>Hi</p><table cellpadding="4" style="width:100%"><tr><td>A</td><td><img src="${TINY_PNG}" alt="dot" /></td></tr></table>`,
    )
    expect(html).toContain("<table")
    expect(html).toContain("cellpadding")
    expect(html).toContain("width:100%")
    expect(html).toContain("data:image/png;base64")
    expect(html).toContain('alt="dot"')
    expect(html).toContain(">A</td>")
  })

  it("still strips scripts and event handlers", () => {
    const html = sanitizeEditorHtml(
      `<p onclick="alert(1)">Safe</p><img src="${TINY_PNG}" onerror="alert(1)" alt="dot" /><script>alert(1)</script>`,
    )
    expect(html).toContain("Safe")
    expect(html).toContain("data:image/png;base64")
    expect(html).not.toContain("onclick")
    expect(html).not.toContain("onerror")
    expect(html).not.toContain("<script")
  })
})
