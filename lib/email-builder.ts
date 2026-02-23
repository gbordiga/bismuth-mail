export type BlockType = "text" | "image" | "button" | "divider" | "html"

export interface EditorBlock {
  id: string
  type: BlockType
  content: string
  props: Record<string, string>
}

export function blockToHtml(block: EditorBlock, preview = false): string {
  switch (block.type) {
    case "text":
      return `<div style="padding: 8px 0;">${block.content}</div>`
    case "image":
      if (!block.content)
        return preview
          ? `<div style="padding: 16px 0; text-align: ${block.props.align || "center"}; color: #999;">[ Image placeholder ]</div>`
          : ""
      return `<div style="padding: 8px 0; text-align: ${block.props.align || "center"};"><img src="${block.content}" alt="${block.props.alt || ""}" style="max-width: ${block.props.width || "100%"}; height: auto;" /></div>`
    case "button":
      return `<div style="padding: 16px 0; text-align: ${block.props.align || "center"};"><a href="${block.props.href || "#"}" style="display: inline-block; padding: 12px 28px; background-color: ${block.props.bgColor || "#3b82f6"}; color: ${block.props.textColor || "#ffffff"}; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">${block.content}</a></div>`
    case "divider":
      return `<hr style="border: none; border-top: ${block.props.thickness || "1"}px solid ${block.props.color || "#e5e7eb"}; margin: 16px 0;" />`
    case "html":
      return block.content
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
  ${senderSig ? `<div style="padding: 16px 24px; border-top: 1px solid #e5e7eb;">${senderSig}</div>` : ""}
  <div class="email-footer">
    <p>To unsubscribe, <a href="${unsubscribeHref}">click here to send an unsubscribe request</a>.</p>
  </div>
</div>
</body>
</html>`
}
