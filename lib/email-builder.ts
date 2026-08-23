import DOMPurify from "isomorphic-dompurify"
import { imageContentId, parseDataUrl } from "@/lib/attachments"

export type BlockType = "text" | "image" | "button" | "divider" | "html" | "attachment"

export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

const EDITOR_ALLOWED_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "caption",
  "center",
  "code",
  "col",
  "colgroup",
  "del",
  "div",
  "em",
  "figcaption",
  "figure",
  "font",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "small",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]

const EDITOR_ALLOWED_ATTR = [
  "align",
  "alt",
  "background",
  "bgcolor",
  "border",
  "cellpadding",
  "cellspacing",
  "color",
  "colspan",
  "face",
  "height",
  "href",
  "rel",
  "role",
  "rowspan",
  "scope",
  "size",
  "src",
  "style",
  "target",
  "title",
  "valign",
  "width",
]

export function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["style"],
    ADD_ATTR: ["target", "style"],
  })
}

export function sanitizeEditorHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: EDITOR_ALLOWED_TAGS,
    ALLOWED_ATTR: EDITOR_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  })
}

export interface EditorBlock {
  id: string
  type: BlockType
  content: string
  props: Record<string, string>
}

export function blockToHtml(block: EditorBlock, preview = false): string {
  switch (block.type) {
    case "text": {
      const text = block.content.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim()
      if (text === "Write your text here...") return ""
      if (!text && !/<img|<table/i.test(block.content)) return ""
      return `<div style="padding: 8px 0;">${sanitizeEditorHtml(block.content)}</div>`
    }
    case "image": {
      if (!block.content)
        return preview
          ? `<div style="padding: 16px 0; text-align: ${block.props.align || "center"}; color: #999;">[ Image placeholder ]</div>`
          : ""
      const uploaded = parseDataUrl(block.content)
      const src = !preview && uploaded ? `cid:${imageContentId(block.id)}` : block.content
      return `<div style="padding: 8px 0; text-align: ${escapeHtmlAttribute(block.props.align || "center")};"><img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(block.props.alt || "")}" style="max-width: ${escapeHtmlAttribute(block.props.width || "100%")}; height: auto;" /></div>`
    }
    case "button":
      return `<div style="padding: 16px 0; text-align: ${escapeHtmlAttribute(block.props.align || "center")};"><a href="${escapeHtmlAttribute(block.props.href || "#")}" style="display: inline-block; padding: 12px 28px; background-color: ${escapeHtmlAttribute(block.props.bgColor || "#3b82f6")}; color: ${escapeHtmlAttribute(block.props.textColor || "#ffffff")}; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">${block.content}</a></div>`
    case "divider":
      return `<hr style="border: none; border-top: ${block.props.thickness || "1"}px solid ${block.props.color || "#e5e7eb"}; margin: 16px 0;" />`
    case "html":
      return sanitizeEmailHtml(block.content)
    case "attachment":
      return ""
  }
}

export function buildFullHtml(
  blocks: EditorBlock[],
  senderSig: string,
  unsubscribeHref: string,
  preview = false,
): string {
  const body = blocks
    .map((b) => blockToHtml(b, preview))
    .filter(Boolean)
    .join("\n")
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5; }
  .email-wrapper { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
  .email-body { padding: 32px 24px; }
  .email-footer { padding: 24px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #71717a; }
  .email-footer a { color: #71717a; text-decoration: underline; }
  img { max-width: 100%; height: auto; }
  p { margin: 0 0 12px 0; line-height: 1.6; color: #18181b; }
  h1, h2, h3 { margin: 0 0 12px 0; color: #18181b; }
  a { color: #3b82f6; }
</style>
</head>
<body>
<div class="email-wrapper">
  <div class="email-body">
    ${body}
  </div>
  ${senderSig ? `<div style="padding: 16px 24px; border-top: 1px solid #e5e7eb;">${sanitizeEmailHtml(senderSig)}</div>` : ""}
  <div class="email-footer">
    <p>To unsubscribe, <a href="${escapeHtmlAttribute(unsubscribeHref)}">click here to send an unsubscribe request</a>.</p>
  </div>
</div>
</body>
</html>`
}
