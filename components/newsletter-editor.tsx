"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { db, type Newsletter, type Sender, type EmailList } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Plus,
  Pencil,
  Trash2,
  FileEdit,
  Eye,
  Copy,
  Type,
  ImageIcon,
  SeparatorHorizontal,
  RectangleHorizontal,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Code,
  ChevronDown,
} from "lucide-react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu"

// --- Block Types ---
type BlockType = "text" | "image" | "button" | "divider" | "html"

interface EditorBlock {
  id: string
  type: BlockType
  content: string // HTML for text, src for image, label for button, raw for html
  props: Record<string, string>
}

function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

function createBlock(type: BlockType): EditorBlock {
  switch (type) {
    case "text":
      return { id: generateId(), type, content: "<p>Write your text here...</p>", props: {} }
    case "image":
      return { id: generateId(), type, content: "", props: { alt: "", width: "100%", align: "center" } }
    case "button":
      return {
        id: generateId(),
        type,
        content: "Click Here",
        props: { href: "https://", bgColor: "#3b82f6", textColor: "#ffffff", align: "center" },
      }
    case "divider":
      return { id: generateId(), type, content: "", props: { color: "#e5e7eb", thickness: "1" } }
    case "html":
      return { id: generateId(), type, content: "<div>\n  \n</div>", props: {} }
  }
}

// --- Block to HTML ---
function blockToHtml(block: EditorBlock): string {
  switch (block.type) {
    case "text":
      return `<div style="padding: 8px 0;">${block.content}</div>`
    case "image":
      if (!block.content) return `<div style="padding: 16px 0; text-align: ${block.props.align || "center"}; color: #999;">[ Image placeholder ]</div>`
      return `<div style="padding: 8px 0; text-align: ${block.props.align || "center"};"><img src="${block.content}" alt="${block.props.alt || ""}" style="max-width: ${block.props.width || "100%"}; height: auto;" /></div>`
    case "button":
      return `<div style="padding: 16px 0; text-align: ${block.props.align || "center"};"><a href="${block.props.href || "#"}" style="display: inline-block; padding: 12px 28px; background-color: ${block.props.bgColor || "#3b82f6"}; color: ${block.props.textColor || "#ffffff"}; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">${block.content}</a></div>`
    case "divider":
      return `<hr style="border: none; border-top: ${block.props.thickness || "1"}px solid ${block.props.color || "#e5e7eb"}; margin: 16px 0;" />`
    case "html":
      return block.content
  }
}

function blocksToFullHtml(blocks: EditorBlock[], senderSig: string, unsubscribeHref: string): string {
  const body = blocks.map(blockToHtml).join("\n")
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
    <p>You received this email because you subscribed to our newsletter.</p>
    <p>To unsubscribe, <a href="${unsubscribeHref}">click here to send an unsubscribe request</a>.</p>
  </div>
</div>
</body>
</html>`
}

// --- Block Editor Component ---
function BlockEditor({
  blocks,
  setBlocks,
  mergeFields,
}: {
  blocks: EditorBlock[]
  setBlocks: (blocks: EditorBlock[]) => void
  mergeFields: string[]
}) {
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)

  function addBlock(type: BlockType) {
    setBlocks([...blocks, createBlock(type)])
  }

  function updateBlock(id: string, updates: Partial<EditorBlock>) {
    setBlocks(blocks.map((b) => (b.id === id ? { ...b, ...updates } : b)))
  }

  function removeBlock(id: string) {
    setBlocks(blocks.filter((b) => b.id !== id))
    if (activeBlockId === id) setActiveBlockId(null)
  }

  function moveBlock(id: string, dir: -1 | 1) {
    const idx = blocks.findIndex((b) => b.id === id)
    if (idx < 0) return
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= blocks.length) return
    const newBlocks = [...blocks]
    const temp = newBlocks[idx]
    newBlocks[idx] = newBlocks[newIdx]
    newBlocks[newIdx] = temp
    setBlocks(newBlocks)
  }

  function insertMergeField(blockId: string, field: string) {
    const block = blocks.find((b) => b.id === blockId)
    if (!block) return
    const tag = `{{${field}}}`
    if (block.type === "text" || block.type === "html") {
      updateBlock(blockId, { content: block.content + tag })
    } else if (block.type === "button") {
      updateBlock(blockId, { content: block.content + tag })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, idx) => (
        <div
          key={block.id}
          className={`group relative rounded-lg border transition-colors ${
            activeBlockId === block.id ? "border-primary ring-1 ring-primary/20" : "border-border hover:border-muted-foreground/30"
          }`}
          onClick={() => setActiveBlockId(block.id)}
        >
          {/* Block toolbar */}
          <div className="flex items-center gap-1 border-b bg-muted/30 px-2 py-1">
            <GripVertical className="size-3.5 text-muted-foreground" />
            <Badge variant="outline" className="text-xs capitalize">
              {block.type}
            </Badge>
            <div className="flex-1" />
            {/* Merge field button */}
            {(block.type === "text" || block.type === "html" || block.type === "button") && mergeFields.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                    {"{{field}}"}
                    <ChevronDown className="ml-1 size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {mergeFields.map((f) => (
                    <DropdownMenuItem key={f} onClick={() => insertMergeField(block.id, f)}>
                      {`{{${f}}}`}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="ghost" size="icon" className="size-6" onClick={() => moveBlock(block.id, -1)} disabled={idx === 0}>
              <ArrowUp className="size-3" />
            </Button>
            <Button variant="ghost" size="icon" className="size-6" onClick={() => moveBlock(block.id, 1)} disabled={idx === blocks.length - 1}>
              <ArrowDown className="size-3" />
            </Button>
            <Button variant="ghost" size="icon" className="size-6 text-destructive" onClick={() => removeBlock(block.id)}>
              <Trash2 className="size-3" />
            </Button>
          </div>

          {/* Block content editor */}
          <div className="p-3">
            {block.type === "text" && (
              <Textarea
                className="min-h-[80px] font-mono text-xs"
                value={block.content}
                onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                placeholder="Enter HTML content..."
              />
            )}
            {block.type === "image" && (
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <Label className="text-xs">Image URL</Label>
                  <Input
                    value={block.content}
                    onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                    placeholder="https://example.com/image.jpg"
                    className="text-xs"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1">
                    <Label className="text-xs">Alt Text</Label>
                    <Input
                      value={block.props.alt || ""}
                      onChange={(e) => updateBlock(block.id, { props: { ...block.props, alt: e.target.value } })}
                      className="text-xs"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Width</Label>
                    <Input
                      value={block.props.width || "100%"}
                      onChange={(e) => updateBlock(block.id, { props: { ...block.props, width: e.target.value } })}
                      className="text-xs"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Align</Label>
                    <Select value={block.props.align || "center"} onValueChange={(v) => updateBlock(block.id, { props: { ...block.props, align: v } })}>
                      <SelectTrigger className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
            {block.type === "button" && (
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <Label className="text-xs">Button Text</Label>
                    <Input
                      value={block.content}
                      onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                      className="text-xs"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">URL</Label>
                    <Input
                      value={block.props.href || ""}
                      onChange={(e) => updateBlock(block.id, { props: { ...block.props, href: e.target.value } })}
                      className="text-xs"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1">
                    <Label className="text-xs">BG Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={block.props.bgColor || "#3b82f6"}
                        onChange={(e) => updateBlock(block.id, { props: { ...block.props, bgColor: e.target.value } })}
                        className="size-7 cursor-pointer rounded border"
                      />
                      <Input
                        value={block.props.bgColor || "#3b82f6"}
                        onChange={(e) => updateBlock(block.id, { props: { ...block.props, bgColor: e.target.value } })}
                        className="text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Text Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={block.props.textColor || "#ffffff"}
                        onChange={(e) => updateBlock(block.id, { props: { ...block.props, textColor: e.target.value } })}
                        className="size-7 cursor-pointer rounded border"
                      />
                      <Input
                        value={block.props.textColor || "#ffffff"}
                        onChange={(e) => updateBlock(block.id, { props: { ...block.props, textColor: e.target.value } })}
                        className="text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Align</Label>
                    <Select value={block.props.align || "center"} onValueChange={(v) => updateBlock(block.id, { props: { ...block.props, align: v } })}>
                      <SelectTrigger className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
            {block.type === "divider" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label className="text-xs">Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={block.props.color || "#e5e7eb"}
                      onChange={(e) => updateBlock(block.id, { props: { ...block.props, color: e.target.value } })}
                      className="size-7 cursor-pointer rounded border"
                    />
                    <Input
                      value={block.props.color || "#e5e7eb"}
                      onChange={(e) => updateBlock(block.id, { props: { ...block.props, color: e.target.value } })}
                      className="text-xs"
                    />
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Thickness (px)</Label>
                  <Input
                    type="number"
                    value={block.props.thickness || "1"}
                    onChange={(e) => updateBlock(block.id, { props: { ...block.props, thickness: e.target.value } })}
                    className="text-xs"
                  />
                </div>
              </div>
            )}
            {block.type === "html" && (
              <Textarea
                className="min-h-[100px] font-mono text-xs"
                value={block.content}
                onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                placeholder="<div>Your raw HTML...</div>"
              />
            )}
          </div>
        </div>
      ))}

      {/* Add block buttons */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-dashed border-border p-4">
        <span className="text-sm text-muted-foreground">Add block:</span>
        <Button variant="outline" size="sm" onClick={() => addBlock("text")}>
          <Type className="mr-1 size-3.5" />
          Text
        </Button>
        <Button variant="outline" size="sm" onClick={() => addBlock("image")}>
          <ImageIcon className="mr-1 size-3.5" />
          Image
        </Button>
        <Button variant="outline" size="sm" onClick={() => addBlock("button")}>
          <RectangleHorizontal className="mr-1 size-3.5" />
          Button
        </Button>
        <Button variant="outline" size="sm" onClick={() => addBlock("divider")}>
          <SeparatorHorizontal className="mr-1 size-3.5" />
          Divider
        </Button>
        <Button variant="outline" size="sm" onClick={() => addBlock("html")}>
          <Code className="mr-1 size-3.5" />
          Raw HTML
        </Button>
      </div>
    </div>
  )
}

// --- Newsletter Section ---
export function NewsletterSection() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([])
  const [senders, setSenders] = useState<Sender[]>([])
  const [lists, setLists] = useState<EmailList[]>([])
  const [editing, setEditing] = useState<Newsletter | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  // Editor state
  const [name, setName] = useState("")
  const [subject, setSubject] = useState("")
  const [senderId, setSenderId] = useState<number | null>(null)
  const [selectedListIds, setSelectedListIds] = useState<number[]>([])
  const [blocks, setBlocks] = useState<EditorBlock[]>([])
  const [previewHtml, setPreviewHtml] = useState("")
  const previewRef = useRef<HTMLIFrameElement>(null)

  const load = useCallback(async () => {
    const [allNl, allSenders, allLists] = await Promise.all([
      db.newsletters.orderBy("createdAt").reverse().toArray(),
      db.senders.toArray(),
      db.emailLists.toArray(),
    ])
    setNewsletters(allNl)
    setSenders(allSenders)
    setLists(allLists)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Compute merge fields from selected lists
  const mergeFields = (() => {
    const base = ["email", "firstName", "lastName"]
    const custom = new Set<string>()
    for (const lid of selectedListIds) {
      const list = lists.find((l) => l.id === lid)
      if (list) list.customFields.forEach((f) => custom.add(f.name))
    }
    return [...base, ...Array.from(custom)]
  })()

  function openCreate() {
    setEditing(null)
    setName("")
    setSubject("")
    setSenderId(senders[0]?.id ?? null)
    setSelectedListIds([])
    setBlocks([createBlock("text")])
    setDialogOpen(true)
  }

  function openEdit(nl: Newsletter) {
    setEditing(nl)
    setName(nl.name)
    setSubject(nl.subject)
    setSenderId(nl.senderId)
    setSelectedListIds(nl.listIds)
    try {
      const parsed = JSON.parse(nl.htmlContent)
      setBlocks(parsed)
    } catch {
      setBlocks([{ id: generateId(), type: "html", content: nl.htmlContent, props: {} }])
    }
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!name || !subject) {
      toast.error("Name and subject are required")
      return
    }
    const htmlContent = JSON.stringify(blocks)
    if (editing) {
      await db.newsletters.update(editing.id!, {
        name,
        subject,
        htmlContent,
        senderId,
        listIds: selectedListIds,
      })
      toast.success("Newsletter updated")
    } else {
      await db.newsletters.add({
        name,
        subject,
        htmlContent,
        senderId,
        listIds: selectedListIds,
        status: "draft",
        sentAt: null,
        createdAt: new Date(),
      })
      toast.success("Newsletter created")
    }
    setDialogOpen(false)
    load()
  }

  async function handleDelete(id: number) {
    await db.newsletters.delete(id)
    toast.success("Newsletter deleted")
    load()
  }

  async function handleDuplicate(nl: Newsletter) {
    await db.newsletters.add({
      ...nl,
      id: undefined,
      name: `${nl.name} (copy)`,
      status: "draft",
      sentAt: null,
      createdAt: new Date(),
    })
    toast.success("Newsletter duplicated")
    load()
  }

  function showPreview() {
    const sender = senders.find((s) => s.id === senderId)
    const unsubEmail = sender?.unsubscribeEmail || sender?.email || "unsubscribe@example.com"
    const mailtoHref = `mailto:${unsubEmail}?subject=UNSUBSCRIBE&body=Please%20unsubscribe%20me%20from%20this%20newsletter.`
    const html = blocksToFullHtml(blocks, sender?.signature || "", mailtoHref)
    setPreviewHtml(html)
    setPreviewOpen(true)
  }

  function toggleListSelection(listId: number) {
    setSelectedListIds((prev) =>
      prev.includes(listId) ? prev.filter((id) => id !== listId) : [...prev, listId]
    )
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "draft":
        return <Badge variant="secondary">Draft</Badge>
      case "sending":
        return <Badge className="bg-warning text-warning-foreground">Sending</Badge>
      case "sent":
        return <Badge className="bg-success text-success-foreground">Sent</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  // --- Main list view ---
  if (!dialogOpen) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Newsletters</h2>
            <p className="text-sm text-muted-foreground">
              Create and manage your email campaigns
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            New Newsletter
          </Button>
        </div>

        {newsletters.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileEdit className="mb-4 size-12 text-muted-foreground/40" />
              <CardTitle className="mb-2 text-base">No newsletters yet</CardTitle>
              <CardDescription>Create your first newsletter to start building campaigns</CardDescription>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Lists</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {newsletters.map((nl) => (
                    <TableRow key={nl.id}>
                      <TableCell className="font-medium">{nl.name}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{nl.subject}</TableCell>
                      <TableCell>{getStatusBadge(nl.status)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {nl.listIds.map((lid) => {
                            const list = lists.find((l) => l.id === lid)
                            return list ? (
                              <Badge key={lid} variant="outline" className="text-xs">
                                {list.name}
                              </Badge>
                            ) : null
                          })}
                          {nl.listIds.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {nl.createdAt ? new Date(nl.createdAt).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {nl.status === "draft" && (
                            <Button variant="ghost" size="icon" onClick={() => openEdit(nl)}>
                              <Pencil className="size-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => handleDuplicate(nl)}>
                            <Copy className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(nl.id!)}>
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-h-[90vh] sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Email Preview</DialogTitle>
            </DialogHeader>
            <div className="overflow-auto rounded border bg-muted/30" style={{ height: "60vh" }}>
              <iframe
                ref={previewRef}
                srcDoc={previewHtml}
                className="size-full"
                title="Email preview"
                sandbox="allow-same-origin"
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // --- Editor view ---
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            {editing ? "Edit" : "New"} Newsletter
          </h2>
          <p className="text-sm text-muted-foreground">
            Build your email with drag-and-drop blocks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant="outline" onClick={showPreview}>
            <Eye className="mr-2 size-4" />
            Preview
          </Button>
          <Button onClick={handleSave}>
            Save Newsletter
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Editor */}
        <div className="flex flex-col gap-4">
          <BlockEditor blocks={blocks} setBlocks={setBlocks} mergeFields={mergeFields} />
        </div>

        {/* Settings sidebar */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="nl-name">Newsletter Name *</Label>
                  <Input
                    id="nl-name"
                    placeholder="e.g. January Update"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="nl-subject">Subject Line *</Label>
                  <Input
                    id="nl-subject"
                    placeholder="e.g. Our latest news for you"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {'Supports merge fields: {{firstName}}, {{email}}, etc.'}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label>Sender</Label>
                  <Select
                    value={senderId ? String(senderId) : ""}
                    onValueChange={(v) => setSenderId(parseInt(v))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select sender" />
                    </SelectTrigger>
                    <SelectContent>
                      {senders.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name} ({s.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Target Lists</Label>
                  <div className="flex flex-col gap-2">
                    {lists.map((list) => (
                      <label
                        key={list.id}
                        className="flex items-center gap-2 rounded-lg border p-2 text-sm hover:bg-muted/50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedListIds.includes(list.id!)}
                          onChange={() => toggleListSelection(list.id!)}
                          className="size-4 rounded border-input accent-primary"
                        />
                        <span className="flex-1">{list.name}</span>
                      </label>
                    ))}
                    {lists.length === 0 && (
                      <p className="text-xs text-muted-foreground">No lists available</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Merge fields reference */}
          <Card>
            <CardContent className="p-4">
              <Label className="mb-3 block">Available Merge Fields</Label>
              <div className="flex flex-wrap gap-1.5">
                {mergeFields.map((f) => (
                  <Badge key={f} variant="outline" className="font-mono text-xs">
                    {`{{${f}}}`}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Use these in text blocks and subject lines. They will be replaced with contact data when sending.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto rounded border bg-muted/30" style={{ height: "60vh" }}>
            <iframe
              ref={previewRef}
              srcDoc={previewHtml}
              className="size-full"
              title="Email preview"
              sandbox="allow-same-origin"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
