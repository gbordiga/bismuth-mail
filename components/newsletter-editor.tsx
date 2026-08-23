"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useDbQuery } from "@/hooks/use-db-table"
import { db, type Newsletter, type Sender, type EmailList, type Contact } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
  Braces,
} from "lucide-react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { RichTextEditor } from "@/components/rich-text-editor"

import { type BlockType, type EditorBlock, blockToHtml } from "@/lib/email-builder"
import { buildCampaignPreviewHtml, buildCampaignPreviewSubject } from "@/lib/preview"
import { campaignStatusLabel } from "@/lib/send-engine"
import { getUniqueActiveContacts } from "@/lib/repositories/campaign-repository"
import { copyName, filterCampaigns } from "@/lib/operator"

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
    if (block.type === "text" || block.type === "html" || block.type === "button") {
      updateBlock(blockId, { content: block.content + tag })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, idx) => (
        <div
          key={block.id}
          className={`group relative rounded-lg border transition-colors ${
            activeBlockId === block.id
              ? "border-primary ring-1 ring-primary/20"
              : "border-border hover:border-muted-foreground/30"
          }`}
          onClick={() => setActiveBlockId(block.id)}
        >
          <div className="flex items-center gap-1 border-b bg-muted/30 px-2 py-1">
            <GripVertical className="size-3.5 text-muted-foreground" />
            <Badge variant="outline" className="text-xs capitalize">
              {block.type}
            </Badge>
            <div className="flex-1" />
            {(block.type === "text" || block.type === "html" || block.type === "button") && mergeFields.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                    <Braces className="mr-1 size-3.5" />
                    Insert Field
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label="Move block up"
                    onClick={() => moveBlock(block.id, -1)}
                    disabled={idx === 0}
                  >
                    <ArrowUp className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Move up</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label="Move block down"
                    onClick={() => moveBlock(block.id, 1)}
                    disabled={idx === blocks.length - 1}
                  >
                    <ArrowDown className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Move down</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-destructive"
                    aria-label="Remove block"
                    onClick={() => removeBlock(block.id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove block</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="p-3">
            {block.type === "text" && (
              <RichTextEditor
                value={block.content}
                onChange={(html) => updateBlock(block.id, { content: html })}
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
                    <Select
                      value={block.props.align || "center"}
                      onValueChange={(v) => updateBlock(block.id, { props: { ...block.props, align: v } })}
                    >
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
                        onChange={(e) =>
                          updateBlock(block.id, { props: { ...block.props, textColor: e.target.value } })
                        }
                        className="size-7 cursor-pointer rounded border"
                      />
                      <Input
                        value={block.props.textColor || "#ffffff"}
                        onChange={(e) =>
                          updateBlock(block.id, { props: { ...block.props, textColor: e.target.value } })
                        }
                        className="text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Align</Label>
                    <Select
                      value={block.props.align || "center"}
                      onValueChange={(v) => updateBlock(block.id, { props: { ...block.props, align: v } })}
                    >
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

export function NewsletterSection() {
  const [editing, setEditing] = useState<Newsletter | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [campaignQuery, setCampaignQuery] = useState("")

  const [name, setName] = useState("")
  const [subject, setSubject] = useState("")
  const [senderId, setSenderId] = useState<number | null>(null)
  const [selectedListIds, setSelectedListIds] = useState<number[]>([])
  const [blocks, setBlocks] = useState<EditorBlock[]>([])
  const [previewHtml, setPreviewHtml] = useState("")
  const [previewSubject, setPreviewSubject] = useState("")
  const [previewContacts, setPreviewContacts] = useState<Contact[]>([])
  const [previewContactEmail, setPreviewContactEmail] = useState("")
  const previewRef = useRef<HTMLIFrameElement>(null)

  const loadCampaigns = useCallback(async () => {
    const [allNl, allSenders, allLists] = await Promise.all([
      db.newsletters.orderBy("createdAt").reverse().toArray(),
      db.senders.toArray(),
      db.emailLists.toArray(),
    ])
    return { newsletters: allNl, senders: allSenders, lists: allLists }
  }, [])

  const { data, reload, error } = useDbQuery(loadCampaigns, {
    newsletters: [] as Newsletter[],
    senders: [] as Sender[],
    lists: [] as EmailList[],
  })
  const newsletters = data.newsletters
  const senders = data.senders
  const lists = data.lists
  const visibleNewsletters = filterCampaigns(newsletters, campaignQuery)

  useEffect(() => {
    if (error) toast.error(`Could not load campaigns: ${error}`)
  }, [error])

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
      toast.success("Campaign updated")
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
      toast.success("Campaign created")
    }
    setDialogOpen(false)
    void reload()
  }

  async function handleDelete(id: number) {
    setPendingDeleteId(id)
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return
    const id = pendingDeleteId
    setPendingDeleteId(null)
    await db.sendLogs.where("newsletterId").equals(id).delete()
    await db.newsletters.delete(id)
    toast.success("Campaign deleted")
    void reload()
  }

  async function handleDuplicate(nl: Newsletter) {
    await db.newsletters.add({
      ...nl,
      id: undefined,
      name: copyName(nl.name),
      status: "draft",
      sentAt: null,
      createdAt: new Date(),
    })
    toast.success("Campaign duplicated")
    void reload()
  }

  async function showPreview() {
    const sender = senders.find((s) => s.id === senderId)
    const contacts = selectedListIds.length > 0 ? await getUniqueActiveContacts(selectedListIds) : []
    const selected = contacts.find((contact) => contact.email === previewContactEmail) ?? contacts[0]
    setPreviewContacts(contacts)
    setPreviewContactEmail(selected?.email ?? "")
    setPreviewHtml(
      buildCampaignPreviewHtml({
        blocks,
        signature: sender?.signature || "",
        unsubscribeEmail: sender?.unsubscribeEmail || sender?.email || "unsubscribe@example.com",
        contact: selected,
      }),
    )
    setPreviewSubject(buildCampaignPreviewSubject(subject, selected))
    setPreviewOpen(true)
  }

  function updatePreviewContact(email: string) {
    const sender = senders.find((s) => s.id === senderId)
    const selected = previewContacts.find((contact) => contact.email === email)
    setPreviewContactEmail(email)
    setPreviewHtml(
      buildCampaignPreviewHtml({
        blocks,
        signature: sender?.signature || "",
        unsubscribeEmail: sender?.unsubscribeEmail || sender?.email || "unsubscribe@example.com",
        contact: selected,
      }),
    )
    setPreviewSubject(buildCampaignPreviewSubject(subject, selected))
  }

  function toggleListSelection(listId: number) {
    setSelectedListIds((prev) => (prev.includes(listId) ? prev.filter((id) => id !== listId) : [...prev, listId]))
  }

  function getStatusBadge(status: Newsletter["status"]) {
    switch (status) {
      case "draft":
        return <Badge variant="secondary">{campaignStatusLabel(status)}</Badge>
      case "sending":
        return <Badge className="bg-warning text-warning-foreground">{campaignStatusLabel(status)}</Badge>
      case "sent":
        return <Badge className="bg-success text-success-foreground">{campaignStatusLabel(status)}</Badge>
      case "sent_with_errors":
        return <Badge className="bg-warning text-warning-foreground">{campaignStatusLabel(status)}</Badge>
      default:
        return <Badge variant="outline">{campaignStatusLabel(status)}</Badge>
    }
  }

  const previewDialog = (
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
      <DialogContent className="max-h-[90vh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Email Preview</DialogTitle>
        </DialogHeader>
        {previewSubject && (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Subject: </span>
            {previewSubject}
          </p>
        )}
        {previewContacts.length > 0 && (
          <Select value={previewContactEmail} onValueChange={updatePreviewContact}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Preview as contact" />
            </SelectTrigger>
            <SelectContent>
              {previewContacts.slice(0, 50).map((contact) => (
                <SelectItem key={contact.email} value={contact.email}>
                  {contact.firstName || contact.lastName
                    ? `${contact.firstName} ${contact.lastName}`.trim() + ` <${contact.email}>`
                    : contact.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
  )

  if (!dialogOpen) {
    return (
      <div className="content-area">
        <div className="section-header">
          <div>
            <h2 className="section-title">Campaigns</h2>
            <p className="section-description">Create and manage your email campaigns</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            New Campaign
          </Button>
        </div>

        {newsletters.length === 0 ? (
          <Card>
            <CardContent className="empty-state">
              <div className="empty-state-icon">
                <FileEdit className="size-7" />
              </div>
              <CardTitle className="empty-state-title">No campaigns yet</CardTitle>
              <CardDescription className="empty-state-description">
                Create your first campaign to start sending emails
              </CardDescription>
              <Button onClick={openCreate}>
                <Plus className="mr-2 size-4" />
                New Campaign
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              {newsletters.length > 1 && (
                <div className="border-b p-3">
                  <Input
                    value={campaignQuery}
                    onChange={(e) => setCampaignQuery(e.target.value)}
                    placeholder="Search campaigns by name or subject"
                    aria-label="Search campaigns"
                  />
                </div>
              )}
              {visibleNewsletters.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No campaigns match that search.
                </p>
              ) : (
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
                  {visibleNewsletters.map((nl) => (
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
                        <TooltipProvider>
                          <div className="flex items-center justify-end gap-1">
                            {nl.status === "draft" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Edit campaign"
                                    onClick={() => openEdit(nl)}
                                  >
                                    <Pencil className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit campaign</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Duplicate campaign"
                                  onClick={() => handleDuplicate(nl)}
                                >
                                  <Copy className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Duplicate campaign</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Delete campaign"
                                  onClick={() => handleDelete(nl.id!)}
                                >
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete campaign</TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              )}
            </CardContent>
          </Card>
        )}

        {previewDialog}

        <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
              <AlertDialogDescription>
                This action deletes the campaign and all related send logs. It cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={confirmDelete}
              >
                Delete campaign
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  return (
    <div className="content-area">
      <div className="section-header">
        <div>
          <h2 className="section-title">{editing ? "Edit" : "New"} Campaign</h2>
          <p className="section-description">Build your email with content blocks</p>
        </div>
        <div className="action-cluster">
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant="outline" onClick={showPreview}>
            <Eye className="mr-2 size-4" />
            Preview
          </Button>
          <Button onClick={handleSave}>Save Campaign</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <BlockEditor blocks={blocks} setBlocks={setBlocks} mergeFields={mergeFields} />
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="nl-name">Campaign Name *</Label>
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
                    {"Supports merge fields: {{firstName}}, {{email}}, etc."}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label>Sender</Label>
                  <Select value={senderId ? String(senderId) : ""} onValueChange={(v) => setSenderId(parseInt(v))}>
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
                    {lists.length === 0 && <p className="text-xs text-muted-foreground">No lists available</p>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

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

      {previewDialog}
    </div>
  )
}
