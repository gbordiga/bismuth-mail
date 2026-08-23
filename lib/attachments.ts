export interface CampaignBlock {
  id: string
  type: string
  content: string
  props: Record<string, string>
}

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
export const MAX_CAMPAIGN_ATTACHMENTS = 20

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const

export interface MailAttachment {
  filename: string
  content: string
  encoding: "base64"
  contentType: string
  cid?: string
}

export interface AttachmentSummary {
  filename: string
  sizeLabel: string
  inline: boolean
}

export function parseDataUrl(value: string): { mime: string; base64: string } | null {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(value.trim())
  if (!match) return null
  return { mime: match[1], base64: match[2] }
}

export function sanitizeFilename(name: string): string {
  const trimmed = name.trim().split(/[/\\]/).pop() ?? ""
  const cleaned = trimmed.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 180)
  return cleaned || "attachment"
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B"
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function isAllowedImageMime(mime: string): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime)
}

export function imageContentId(blockId: string): string {
  const safe = blockId.replace(/[^a-zA-Z0-9_-]/g, "")
  return `img-${safe || "image"}`
}

export function collectMailAttachments(blocks: CampaignBlock[]): MailAttachment[] {
  const attachments: MailAttachment[] = []

  for (const block of blocks) {
    if (attachments.length >= MAX_CAMPAIGN_ATTACHMENTS) break
    const parsed = parseDataUrl(block.content)
    if (!parsed) continue

    if (block.type === "image") {
      const ext = parsed.mime.split("/")[1] || "png"
      attachments.push({
        filename: sanitizeFilename(block.props.filename || `image.${ext}`),
        content: parsed.base64,
        encoding: "base64",
        contentType: parsed.mime,
        cid: imageContentId(block.id),
      })
      continue
    }

    if (block.type === "attachment") {
      attachments.push({
        filename: sanitizeFilename(block.props.filename || "attachment"),
        content: parsed.base64,
        encoding: "base64",
        contentType: parsed.mime || block.props.mimeType || "application/octet-stream",
      })
    }
  }

  return attachments
}

export function splitCampaignBlocks<T extends CampaignBlock>(blocks: T[]): {
  content: T[]
  attachments: T[]
} {
  return {
    content: blocks.filter((block) => block.type !== "attachment"),
    attachments: blocks.filter((block) => block.type === "attachment"),
  }
}

export function mergeCampaignBlocks<T extends CampaignBlock>(content: T[], attachments: T[]): T[] {
  return [...content, ...attachments]
}

export function listCampaignAttachments(blocks: CampaignBlock[]): AttachmentSummary[] {
  const items: AttachmentSummary[] = []

  for (const block of blocks) {
    if (block.type === "image" && parseDataUrl(block.content)) {
      const size = Number(block.props.size)
      items.push({
        filename: sanitizeFilename(block.props.filename || "image"),
        sizeLabel: size > 0 ? formatFileSize(size) : "",
        inline: true,
      })
    }
    if (block.type === "attachment" && block.content) {
      const size = Number(block.props.size)
      items.push({
        filename: sanitizeFilename(block.props.filename || "attachment"),
        sizeLabel: size > 0 ? formatFileSize(size) : "",
        inline: false,
      })
    }
  }

  return items
}
