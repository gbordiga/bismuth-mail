import { describe, expect, it } from "vitest"
import {
  collectMailAttachments,
  formatFileSize,
  imageContentId,
  listCampaignAttachments,
  MAX_CAMPAIGN_ATTACHMENTS,
  mergeCampaignBlocks,
  parseDataUrl,
  sanitizeFilename,
  splitCampaignBlocks,
} from "@/lib/attachments"
import type { EditorBlock } from "@/lib/email-builder"

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

function block(overrides: Partial<EditorBlock> & { type: EditorBlock["type"] }): EditorBlock {
  return { id: "1", content: "", props: {}, ...overrides }
}

describe("parseDataUrl", () => {
  it("parses a base64 data URL", () => {
    expect(parseDataUrl(TINY_PNG)).toEqual({
      mime: "image/png",
      base64: TINY_PNG.slice("data:image/png;base64,".length),
    })
  })

  it("rejects remote URLs", () => {
    expect(parseDataUrl("https://example.com/a.png")).toBeNull()
  })
})

describe("sanitizeFilename", () => {
  it("strips path segments and unsafe characters", () => {
    expect(sanitizeFilename("../../invoice/Q2*.pdf")).toBe("Q2_.pdf")
  })

  it("falls back when the name is empty", () => {
    expect(sanitizeFilename("   ")).toBe("attachment")
  })
})

describe("formatFileSize", () => {
  it("formats bytes, kilobytes, and megabytes", () => {
    expect(formatFileSize(512)).toBe("512 B")
    expect(formatFileSize(1536)).toBe("1.5 KB")
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0 MB")
  })
})

describe("collectMailAttachments", () => {
  it("turns uploaded images into CID parts and files into regular attachments", () => {
    const attachments = collectMailAttachments([
      block({
        id: "hero",
        type: "image",
        content: TINY_PNG,
        props: { filename: "logo.png" },
      }),
      block({
        id: "doc",
        type: "attachment",
        content: "data:application/pdf;base64,JVBERi0=",
        props: { filename: "brief.pdf", mimeType: "application/pdf" },
      }),
      block({ type: "image", content: "https://example.com/remote.png" }),
    ])

    expect(attachments).toEqual([
      {
        filename: "logo.png",
        content: TINY_PNG.slice("data:image/png;base64,".length),
        encoding: "base64",
        contentType: "image/png",
        cid: imageContentId("hero"),
      },
      {
        filename: "brief.pdf",
        content: "JVBERi0=",
        encoding: "base64",
        contentType: "application/pdf",
      },
    ])
  })

  it("does not count inline images toward the file attachment cap", () => {
    const images = Array.from({ length: MAX_CAMPAIGN_ATTACHMENTS }, (_, index) =>
      block({
        id: `img-${index}`,
        type: "image",
        content: TINY_PNG,
        props: { filename: `image-${index}.png` },
      }),
    )
    const files = [
      block({
        id: "doc",
        type: "attachment",
        content: "data:application/pdf;base64,JVBERi0=",
        props: { filename: "brief.pdf", mimeType: "application/pdf" },
      }),
      block({
        id: "notes",
        type: "attachment",
        content: "data:text/plain;base64,YQ==",
        props: { filename: "notes.txt", mimeType: "text/plain" },
      }),
    ]

    const attachments = collectMailAttachments([...images, ...files])

    expect(attachments.filter((item) => item.cid).length).toBe(MAX_CAMPAIGN_ATTACHMENTS)
    expect(attachments.filter((item) => !item.cid).map((item) => item.filename)).toEqual([
      "brief.pdf",
      "notes.txt",
    ])
  })

  it("still caps file attachments independently of images", () => {
    const files = Array.from({ length: MAX_CAMPAIGN_ATTACHMENTS + 1 }, (_, index) =>
      block({
        id: `file-${index}`,
        type: "attachment",
        content: "data:text/plain;base64,YQ==",
        props: { filename: `file-${index}.txt`, mimeType: "text/plain" },
      }),
    )

    const attachments = collectMailAttachments([
      block({ id: "hero", type: "image", content: TINY_PNG, props: { filename: "logo.png" } }),
      ...files,
    ])

    expect(attachments.filter((item) => item.cid)).toHaveLength(1)
    expect(attachments.filter((item) => !item.cid)).toHaveLength(MAX_CAMPAIGN_ATTACHMENTS)
  })
})

describe("splitCampaignBlocks", () => {
  it("keeps body blocks separate from file attachments", () => {
    const text = block({ id: "t", type: "text", content: "<p>Hi</p>" })
    const file = block({ id: "a", type: "attachment", content: "data:text/plain;base64,YQ==" })
    const image = block({ id: "i", type: "image", content: TINY_PNG })
    const mixed = [text, file, image]

    expect(splitCampaignBlocks(mixed)).toEqual({
      content: [text, image],
      attachments: [file],
    })
    expect(mergeCampaignBlocks([text, image], [file])).toEqual([text, image, file])
  })
})

describe("listCampaignAttachments", () => {
  it("summarizes uploaded images and file attachments", () => {
    expect(
      listCampaignAttachments([
        block({ type: "image", content: TINY_PNG, props: { filename: "logo.png", size: "2048" } }),
        block({ type: "attachment", content: "data:text/plain;base64,YQ==", props: { filename: "notes.txt", size: "1" } }),
        block({ type: "image", content: "https://example.com/a.png" }),
      ]),
    ).toEqual([
      { filename: "logo.png", sizeLabel: "2.0 KB", inline: true },
      { filename: "notes.txt", sizeLabel: "1 B", inline: false },
    ])
  })
})
