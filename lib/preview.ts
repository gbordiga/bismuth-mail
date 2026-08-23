import { buildFullHtml, type EditorBlock } from "@/lib/email-builder"
import { SAMPLE_MERGE_CONTACT, replaceMergeFields, type MergeContact } from "@/lib/merge-fields"

export function parseCampaignBlocks(htmlContent: string): EditorBlock[] {
  try {
    return JSON.parse(htmlContent) as EditorBlock[]
  } catch {
    return [{ id: "raw", type: "html", content: htmlContent, props: {} }]
  }
}

export function buildUnsubscribeMailto(unsubscribeEmail: string, recipientEmail: string): string {
  return `mailto:${unsubscribeEmail}?subject=${encodeURIComponent("UNSUBSCRIBE")}&body=${encodeURIComponent(`Please remove ${recipientEmail} from this mailing list.`)}`
}

export function buildCampaignPreviewHtml(args: {
  blocks: EditorBlock[]
  signature: string
  unsubscribeEmail: string
  contact?: MergeContact
}): string {
  const contact = args.contact ?? SAMPLE_MERGE_CONTACT
  const mailtoHref = buildUnsubscribeMailto(args.unsubscribeEmail, contact.email)
  const html = buildFullHtml(args.blocks, args.signature, mailtoHref, true)
  return replaceMergeFields(html, contact)
}
