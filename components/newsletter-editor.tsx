"use client"

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useDbQuery } from "@/hooks/use-db-table"
import { db, type Newsletter, type Sender, type EmailList, type Contact } from "@/lib/db"
import { useCampaignLeaveGuard } from "@/components/campaign-leave-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  Eye,
  Type,
  ImageIcon,
  SeparatorHorizontal,
  RectangleHorizontal,
  ArrowUp,
  ArrowDown,
  Code,
  ChevronDown,
  Braces,
  Upload,
  Paperclip,
  Plus,
  Send,
  Trash2,
  X,
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

import { cn } from "@/lib/utils"
import { type BlockType, type EditorBlock, isEmptyEditorHtml } from "@/lib/email-builder"
import {
  ATTACHMENT_MAX_BYTES,
  IMAGE_MAX_BYTES,
  MAX_CAMPAIGN_ATTACHMENTS,
  formatFileSize,
  isAllowedImageMime,
  listCampaignAttachments,
  mergeCampaignBlocks,
  parseDataUrl,
  splitCampaignBlocks,
} from "@/lib/attachments"
import { buildCampaignPreviewHtml, buildCampaignPreviewSubject } from "@/lib/preview"
import {
  countUniqueActiveRecipients,
  getUniqueActiveContacts,
  saveCampaignDraft,
} from "@/lib/repositories/campaign-repository"
import {
  campaignDraftSnapshot,
  campaignLeaveAction,
  campaignPhasePath,
  canPersistCampaignDraft,
  isCampaignDraftDirty,
  type CampaignDraftFields,
} from "@/lib/operator"

function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

function normalizeBlocks(blocks: EditorBlock[]): EditorBlock[] {
  return blocks.map((block) =>
    block.type === "text" && isEmptyEditorHtml(block.content) ? { ...block, content: "" } : block,
  )
}

function blocksFromNewsletter(newsletter: Newsletter | null): EditorBlock[] {
  if (!newsletter) return [createBlock("text")]
  try {
    return normalizeBlocks(JSON.parse(newsletter.htmlContent))
  } catch {
    return [{ id: generateId(), type: "html", content: newsletter.htmlContent, props: {} }]
  }
}

function createBlock(type: BlockType): EditorBlock {
  switch (type) {
    case "text":
      return { id: generateId(), type, content: "", props: {} }
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
    case "attachment":
      return { id: generateId(), type, content: "", props: { filename: "", mimeType: "", size: "0" } }
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"))
    reader.readAsDataURL(file)
  })
}

function FilePickerButton({
  id,
  accept,
  label,
  onFile,
  iconOnly = false,
  icon: Icon = Upload,
}: {
  id: string
  accept: string
  label: string
  onFile: (file: File) => void
  iconOnly?: boolean
  icon?: typeof Upload
}) {
  return (
    <>
      <label htmlFor={id} className="cursor-pointer">
        <Button
          variant={iconOnly ? "ghost" : "outline"}
          size={iconOnly ? "icon" : "sm"}
          className={iconOnly ? "size-8" : undefined}
          asChild
        >
          <span className={iconOnly ? "flex items-center justify-center" : undefined}>
            <Icon className={iconOnly ? "size-3.5" : "mr-1 size-3.5"} />
            {iconOnly ? <span className="sr-only">{label}</span> : label}
          </span>
        </Button>
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        aria-label={label}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) onFile(file)
        }}
      />
    </>
  )
}

type ContentBlockType = Exclude<BlockType, "attachment">

function ComposeRow({
  label,
  htmlFor,
  align = "center",
  children,
}: {
  label: string
  htmlFor?: string
  align?: "center" | "start"
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[3.75rem_minmax(0,1fr)] gap-3 border-b px-4 py-1.5",
        align === "start" ? "items-start" : "items-center",
      )}
    >
      <label htmlFor={htmlFor} className={cn("text-sm text-muted-foreground", align === "start" && "pt-1.5")}>
        {label}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function ComposeToField({
  lists,
  selectedListIds,
  onToggle,
  listCounts,
  recipientCount,
}: {
  lists: EmailList[]
  selectedListIds: number[]
  onToggle: (id: number) => void
  listCounts: Record<number, number>
  recipientCount: number
}) {
  const selected = selectedListIds.map((id) => {
    const list = lists.find((item) => item.id === id)
    return { id, name: list?.name ?? "Removed list", missing: !list }
  })
  const available = lists.filter((list) => list.id != null && !selectedListIds.includes(list.id))

  if (lists.length === 0 && selectedListIds.length === 0) {
    return <p className="py-1 text-sm text-muted-foreground">Create a list before choosing recipients</p>
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5 py-1">
      {selected.length === 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">No recipients selected</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {selected.map((item) => (
            <span
              key={item.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-2.5 pr-0.5 text-xs text-primary"
            >
              <span className="truncate">{item.name}</span>
              {!item.missing && listCounts[item.id] != null && (
                <span className="shrink-0 text-primary/70">{listCounts[item.id]}</span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 text-primary/70 hover:text-destructive"
                aria-label={`Remove ${item.name}`}
                onClick={() => onToggle(item.id)}
              >
                <X className="size-3" />
              </Button>
            </span>
          ))}
          <span className={cn("text-xs", recipientCount === 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
            {recipientCount === 1 ? "1 recipient" : `${recipientCount} recipients`}
          </span>
        </div>
      )}
      {available.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-fit px-2 text-xs">
              <Plus className="mr-1 size-3.5" />
              Add list
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2">
            <p className="px-2 pb-1.5 text-xs text-muted-foreground">Choose who receives this email</p>
            <div className="grid max-h-56 gap-0.5 overflow-y-auto">
              {available.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => onToggle(list.id!)}
                >
                  <span className="min-w-0 truncate">{list.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {listCounts[list.id!] ?? 0} contacts
                  </span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

function BlockChrome({
  canInsertField,
  mergeFields,
  onInsertField,
  onMoveUp,
  onMoveDown,
  onRemove,
  disableUp,
  disableDown,
}: {
  canInsertField: boolean
  mergeFields: string[]
  onInsertField: (field: string) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  disableUp: boolean
  disableDown: boolean
}) {
  return (
    <div className="flex shrink-0 items-center rounded-md border bg-muted/30 p-0.5">
      {canInsertField && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              <Braces className="mr-1 size-3.5" />
              Field
              <ChevronDown className="ml-0.5 size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {mergeFields.map((field) => (
              <DropdownMenuItem key={field} onClick={() => onInsertField(field)}>
                {`{{${field}}}`}
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
              className="size-7"
              aria-label="Move block up"
              onClick={onMoveUp}
              disabled={disableUp}
            >
              <ArrowUp className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Move up</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Move block down"
              onClick={onMoveDown}
              disabled={disableDown}
            >
              <ArrowDown className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Move down</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-destructive"
              aria-label="Remove block"
              onClick={onRemove}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

function BlockEditor({
  blocks,
  setBlocks,
  mergeFields,
  footer,
}: {
  blocks: EditorBlock[]
  setBlocks: (blocks: EditorBlock[]) => void
  mergeFields: string[]
  footer?: ReactNode
}) {
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)

  function addBlock(type: ContentBlockType) {
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

  function blockChrome(block: EditorBlock, idx: number) {
    return (
      <BlockChrome
        canInsertField={
          (block.type === "text" || block.type === "html" || block.type === "button") &&
          mergeFields.length > 0
        }
        mergeFields={mergeFields}
        onInsertField={(field) => insertMergeField(block.id, field)}
        onMoveUp={() => moveBlock(block.id, -1)}
        onMoveDown={() => moveBlock(block.id, 1)}
        onRemove={() => removeBlock(block.id)}
        disableUp={idx === 0}
        disableDown={idx === blocks.length - 1}
      />
    )
  }

  function insertMergeField(blockId: string, field: string) {
    const block = blocks.find((b) => b.id === blockId)
    if (!block) return
    const tag = `{{${field}}}`
    if (block.type === "text" || block.type === "html" || block.type === "button") {
      updateBlock(blockId, { content: block.content + tag })
    }
  }

  async function handleImageUpload(block: EditorBlock, file: File) {
    if (!isAllowedImageMime(file.type)) {
      toast.error("Use a JPEG, PNG, GIF, or WebP image")
      return
    }
    if (file.size > IMAGE_MAX_BYTES) {
      toast.error(`Images must be ${formatFileSize(IMAGE_MAX_BYTES)} or smaller`)
      return
    }
    try {
      const content = await readFileAsDataUrl(file)
      updateBlock(block.id, {
        content,
        props: {
          ...block.props,
          filename: file.name,
          mimeType: file.type,
          size: String(file.size),
        },
      })
    } catch {
      toast.error("Could not read that image")
    }
  }

  return (
    <div className="flex min-h-[320px] flex-col">
        {blocks.length === 0 && (
          <p className="px-4 py-12 text-sm text-muted-foreground">Start writing, or add an image or button.</p>
        )}
        {blocks.map((block, idx) => (
        <div
          key={block.id}
          className={cn(
            "group px-3 py-2",
            activeBlockId === block.id ? "bg-muted/15" : "hover:bg-muted/10",
          )}
          onClick={() => setActiveBlockId(block.id)}
        >
          <div>
            {block.type !== "text" && <div className="mb-1 flex justify-end">{blockChrome(block, idx)}</div>}
            {block.type === "text" && (
              <RichTextEditor
                value={block.content}
                onChange={(html) => updateBlock(block.id, { content: html })}
                toolbarEnd={blockChrome(block, idx)}
              />
            )}
            {block.type === "image" && (
              <div className="grid gap-3">
                {parseDataUrl(block.content) ? (
                  <div className="grid gap-2">
                    <div className="overflow-hidden rounded-md border bg-muted/30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={block.content}
                        alt={block.props.alt || block.props.filename || "Uploaded image"}
                        className="mx-auto max-h-48 object-contain"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {block.props.filename || "Uploaded image"}
                        {Number(block.props.size) > 0 ? ` · ${formatFileSize(Number(block.props.size))}` : ""}
                      </p>
                      <FilePickerButton
                        id={`image-upload-${block.id}`}
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        label="Replace"
                        onFile={(file) => void handleImageUpload(block, file)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          updateBlock(block.id, {
                            content: "",
                            props: { ...block.props, filename: "", mimeType: "", size: "0" },
                          })
                        }
                      >
                        <X className="mr-1 size-3.5" />
                        Remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <div className="grid gap-1">
                      <Label className="text-xs">Image URL</Label>
                      <Input
                        value={block.content}
                        onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                        placeholder="https://example.com/image.jpg"
                        className="text-xs"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <FilePickerButton
                        id={`image-upload-${block.id}`}
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        label="Upload image"
                        onFile={(file) => void handleImageUpload(block, file)}
                      />
                      <p className="text-xs text-muted-foreground">
                        JPEG, PNG, GIF, or WebP · max {formatFileSize(IMAGE_MAX_BYTES)}
                      </p>
                    </div>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-3">
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
                <div className="grid gap-3 sm:grid-cols-2">
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
                <div className="grid gap-3 sm:grid-cols-3">
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
              <div className="grid gap-3 sm:grid-cols-2">
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

      <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <Plus className="mr-1 size-3.5" />
              Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => addBlock("text")}>
              <Type className="size-3.5" />
              Text
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addBlock("image")}>
              <ImageIcon className="size-3.5" />
              Image
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addBlock("button")}>
              <RectangleHorizontal className="size-3.5" />
              Button
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addBlock("divider")}>
              <SeparatorHorizontal className="size-3.5" />
              Divider
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addBlock("html")}>
              <Code className="size-3.5" />
              HTML
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {footer}
      </div>
    </div>
  )
}

function CampaignAttachments({
  attachments,
  setAttachments,
}: {
  attachments: EditorBlock[]
  setAttachments: (attachments: EditorBlock[]) => void
}) {
  async function addFile(file: File) {
    if (attachments.length >= MAX_CAMPAIGN_ATTACHMENTS) {
      toast.error(`You can attach up to ${MAX_CAMPAIGN_ATTACHMENTS} files`)
      return
    }
    if (file.size === 0) {
      toast.error("That file is empty")
      return
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      toast.error(`Attachments must be ${formatFileSize(ATTACHMENT_MAX_BYTES)} or smaller`)
      return
    }
    try {
      const content = await readFileAsDataUrl(file)
      setAttachments([
        ...attachments,
        {
          id: generateId(),
          type: "attachment",
          content,
          props: {
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            size: String(file.size),
          },
        },
      ])
    } catch {
      toast.error("Could not read that file")
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <FilePickerButton
        id="campaign-attachment-add"
        accept="*/*"
        label="Attach file"
        iconOnly
        icon={Paperclip}
        onFile={(file) => void addFile(file)}
      />
      {attachments.map((item) => (
        <span
          key={item.id}
          className="inline-flex max-w-[14rem] items-center gap-1 rounded-full border bg-muted/40 py-0.5 pl-2 pr-0.5 text-xs"
          title={item.props.filename || "Untitled file"}
        >
          <Paperclip className="size-3 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{item.props.filename || "Untitled file"}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${item.props.filename || "attachment"}`}
            onClick={() => setAttachments(attachments.filter((current) => current.id !== item.id))}
          >
            <X className="size-3" />
          </Button>
        </span>
      ))}
    </div>
  )
}

export function CampaignCompose({ campaignId }: { campaignId: number | null }) {
  const router = useRouter()
  const loadComposeData = useCallback(async () => {
    const [senders, lists, newsletter] = await Promise.all([
      db.senders.toArray(),
      db.emailLists.toArray(),
      campaignId != null ? db.newsletters.get(campaignId) : Promise.resolve(undefined),
    ])
    return { senders, lists, newsletter: newsletter ?? null }
  }, [campaignId])

  const { data, error, loading } = useDbQuery(loadComposeData, {
    senders: [] as Sender[],
    lists: [] as EmailList[],
    newsletter: null as Newsletter | null,
  })

  useEffect(() => {
    if (error) toast.error(`Could not load campaign: ${error}`)
  }, [error])

  useEffect(() => {
    if (!loading && campaignId != null && !data.newsletter) {
      toast.error("Campaign not found")
      router.replace("/campaigns")
    }
  }, [loading, campaignId, data.newsletter, router])

  if (loading || (campaignId != null && !data.newsletter)) {
    return <p className="text-sm text-muted-foreground">Loading campaign…</p>
  }

  return (
    <CampaignComposeForm
      key={campaignId ?? "new"}
      campaignId={campaignId}
      newsletter={data.newsletter}
      senders={data.senders}
      lists={data.lists}
    />
  )
}

function CampaignComposeForm({
  campaignId,
  newsletter,
  senders,
  lists,
}: {
  campaignId: number | null
  newsletter: Newsletter | null
  senders: Sender[]
  lists: EmailList[]
}) {
  const router = useRouter()
  const initialBlocks = blocksFromNewsletter(newsletter)
  const initialName = newsletter?.name ?? ""
  const initialSubject = newsletter?.subject ?? ""
  const initialSenderId = newsletter?.senderId ?? senders[0]?.id ?? null
  const initialListIds = newsletter?.listIds ?? []
  const initialDraft: CampaignDraftFields = {
    name: initialName,
    subject: initialSubject,
    senderId: initialSenderId,
    listIds: initialListIds,
    htmlContent: JSON.stringify(initialBlocks),
  }
  const initialBaseline = campaignDraftSnapshot(initialDraft)

  const [editing, setEditing] = useState<Newsletter | null>(newsletter)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [name, setName] = useState(initialName)
  const [subject, setSubject] = useState(initialSubject)
  const [senderId, setSenderId] = useState<number | null>(initialSenderId)
  const [selectedListIds, setSelectedListIds] = useState<number[]>(initialListIds)
  const [blocks, setBlocks] = useState<EditorBlock[]>(initialBlocks)
  const [previewHtml, setPreviewHtml] = useState("")
  const [previewSubject, setPreviewSubject] = useState("")
  const [previewContacts, setPreviewContacts] = useState<Contact[]>([])
  const [previewContactEmail, setPreviewContactEmail] = useState("")
  const [saveStatus, setSaveStatus] = useState<"clean" | "dirty" | "saving" | "saved">("clean")
  const [baseline, setBaseline] = useState(initialBaseline)
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false)
  const [listCounts, setListCounts] = useState<Record<number, number>>({})
  const [recipientCount, setRecipientCount] = useState(0)
  const previewRef = useRef<HTMLIFrameElement>(null)
  const baselineRef = useRef(initialBaseline)
  const editingIdRef = useRef<number | null>(newsletter?.id ?? null)
  const persistLockRef = useRef(Promise.resolve())
  const leaveResolveRef = useRef<((value: boolean) => void) | null>(null)
  const persistDraftRef = useRef<(options?: { silent?: boolean }) => Promise<boolean>>(async () => false)
  const draftRef = useRef({
    active: newsletter == null || newsletter.status === "draft",
    persistInFlight: false,
    editingId: newsletter?.id ?? null,
    baseline: initialBaseline,
    ...initialDraft,
  })
  const readOnly = editing != null && editing.status !== "draft"

  useEffect(() => {
    let cancelled = false
    void Promise.all(
      lists.map(async (list) => {
        if (list.id == null) return [0, 0] as const
        const count = await db.contacts
          .where("listId")
          .equals(list.id)
          .filter((contact) => !contact.unsubscribed)
          .count()
        return [list.id, count] as const
      }),
    ).then((entries) => {
      if (!cancelled) setListCounts(Object.fromEntries(entries.filter(([id]) => id > 0)))
    })
    return () => {
      cancelled = true
    }
  }, [lists])

  useEffect(() => {
    if (selectedListIds.length === 0) return
    let cancelled = false
    void countUniqueActiveRecipients(selectedListIds).then((count) => {
      if (!cancelled) setRecipientCount(count)
    })
    return () => {
      cancelled = true
    }
  }, [selectedListIds])

  const visibleRecipientCount = selectedListIds.length === 0 ? 0 : recipientCount

  const mergeFields = (() => {
    const base = ["email", "firstName", "lastName"]
    const custom = new Set<string>()
    for (const lid of selectedListIds) {
      const list = lists.find((l) => l.id === lid)
      if (list) list.customFields.forEach((f) => custom.add(f.name))
    }
    return [...base, ...Array.from(custom)]
  })()

  function currentDraft(nextBlocks = blocks): CampaignDraftFields {
    return {
      name,
      subject,
      senderId,
      listIds: selectedListIds,
      htmlContent: JSON.stringify(nextBlocks),
    }
  }

  async function persistDraft(options?: { silent?: boolean }): Promise<boolean> {
    const previous = persistLockRef.current
    let release = () => {}
    persistLockRef.current = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous

    try {
      const draft: CampaignDraftFields = {
        name: draftRef.current.name,
        subject: draftRef.current.subject,
        senderId: draftRef.current.senderId,
        listIds: draftRef.current.listIds,
        htmlContent: draftRef.current.htmlContent,
      }
      if (!canPersistCampaignDraft(draft)) {
        if (!options?.silent) toast.error("Name and subject are required")
        return false
      }
      if (!isCampaignDraftDirty(draft, baselineRef.current)) {
        return true
      }

      const wasNew = editingIdRef.current == null
      draftRef.current.persistInFlight = true
      setSaveStatus("saving")
      const id = await saveCampaignDraft({
        id: editingIdRef.current ?? undefined,
        ...draft,
      })
      editingIdRef.current = id
      if (wasNew) {
        setEditing({
          id,
          name: draft.name,
          subject: draft.subject,
          htmlContent: draft.htmlContent,
          senderId: draft.senderId,
          listIds: draft.listIds,
          status: "draft",
          sentAt: null,
          createdAt: new Date(),
        })
        router.replace(campaignPhasePath(id, "compose"))
      }
      const snapshot = campaignDraftSnapshot(draft)
      baselineRef.current = snapshot
      setBaseline(snapshot)
      draftRef.current = { ...draftRef.current, editingId: id, baseline: snapshot }
      setSaveStatus("saved")
      if (!options?.silent) toast.success(wasNew ? "Campaign created" : "Campaign updated")
      return true
    } catch {
      setSaveStatus("dirty")
      if (!options?.silent) toast.error("Could not save campaign")
      return false
    } finally {
      draftRef.current.persistInFlight = false
      release()
    }
  }

  useEffect(() => {
    draftRef.current = {
      active: !readOnly,
      persistInFlight: draftRef.current.persistInFlight,
      editingId: editingIdRef.current,
      baseline: baselineRef.current,
      ...currentDraft(),
    }
    persistDraftRef.current = persistDraft
  })

  useCampaignLeaveGuard(async () => {
    if (readOnly) return true
    const draft = currentDraft()
    const action = campaignLeaveAction(
      isCampaignDraftDirty(draft, baselineRef.current),
      canPersistCampaignDraft(draft),
    )
    if (action === "confirm") {
      return new Promise<boolean>((resolve) => {
        leaveResolveRef.current = resolve
        setLeaveConfirmOpen(true)
      })
    }
    return true
  })

  useEffect(() => {
    if (readOnly) return
    const draft: CampaignDraftFields = {
      name,
      subject,
      senderId,
      listIds: selectedListIds,
      htmlContent: JSON.stringify(blocks),
    }
    if (!isCampaignDraftDirty(draft, baseline)) return
    if (!canPersistCampaignDraft(draft)) return
    const timer = window.setTimeout(() => {
      void persistDraftRef.current({ silent: true })
    }, 700)
    return () => window.clearTimeout(timer)
  }, [readOnly, name, subject, senderId, selectedListIds, blocks, baseline])

  useEffect(() => {
    return () => {
      const draft = draftRef.current
      if (!draft.active || draft.persistInFlight) return
      if (!canPersistCampaignDraft(draft) || !isCampaignDraftDirty(draft, draft.baseline)) return
      void saveCampaignDraft({
        id: draft.editingId ?? undefined,
        name: draft.name,
        subject: draft.subject,
        htmlContent: draft.htmlContent,
        senderId: draft.senderId,
        listIds: draft.listIds,
      })
    }
  }, [])

  useEffect(() => {
    if (readOnly) return
    function onBeforeUnload(event: BeforeUnloadEvent) {
      const draft = draftRef.current
      if (!isCampaignDraftDirty(draft, draft.baseline)) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [readOnly, name, subject, senderId, selectedListIds, blocks])

  async function handleReviewAndSend() {
    const ok = await persistDraft()
    if (ok && editingIdRef.current != null) {
      router.push(campaignPhasePath(editingIdRef.current, "send"))
    }
  }

  function resolveLeave(shouldLeave: boolean) {
    leaveResolveRef.current?.(shouldLeave)
    leaveResolveRef.current = null
    setLeaveConfirmOpen(false)
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

  const { content: contentBlocks, attachments: attachmentBlocks } = splitCampaignBlocks(blocks)
  const previewAttachments = listCampaignAttachments(blocks)

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
        {previewAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {previewAttachments.map((item, index) => (
              <Badge key={`${item.filename}-${index}`} variant="outline" className="gap-1 font-normal">
                <Paperclip className="size-3" />
                {item.filename}
                {item.sizeLabel ? ` · ${item.sizeLabel}` : ""}
                {item.inline ? " · inline" : ""}
              </Badge>
            ))}
          </div>
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

  const isDirty = isCampaignDraftDirty(currentDraft(), baseline)
  const saveStatusLabel =
    saveStatus === "saving" ? "Saving…" : isDirty ? "Unsaved changes" : saveStatus === "saved" ? "Saved" : null

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {readOnly && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          {editing?.status === "sending"
            ? "Sending is in progress. Compose is read-only."
            : "This campaign was already sent. Reset to draft from Send to edit."}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            id="nl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled campaign"
            aria-label="Campaign name"
            disabled={readOnly}
            className="h-9 border-0 bg-transparent px-0 text-xl font-semibold shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="action-cluster">
          {saveStatusLabel && !readOnly && <span className="text-sm text-muted-foreground">{saveStatusLabel}</span>}
          <Button variant="outline" onClick={() => void showPreview()}>
            <Eye className="mr-2 size-4" />
            Preview
          </Button>
          {!readOnly && (
            <>
              <Button variant="outline" onClick={() => void persistDraft()}>
                Save
              </Button>
              <Button onClick={() => void handleReviewAndSend()}>
                <Send className="mr-2 size-4" />
                Review & Send
              </Button>
            </>
          )}
        </div>
      </div>

      <div className={cn("overflow-hidden rounded-xl border bg-card", readOnly && "pointer-events-none opacity-80")}>
        <ComposeRow label="From">
          <Select value={senderId ? String(senderId) : ""} onValueChange={(v) => setSenderId(parseInt(v))}>
            <SelectTrigger className="h-8 w-full border-0 px-0 shadow-none focus-visible:ring-0">
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
        </ComposeRow>
        <ComposeRow label="To" align="start">
          <ComposeToField
            lists={lists}
            selectedListIds={selectedListIds}
            onToggle={toggleListSelection}
            listCounts={listCounts}
            recipientCount={visibleRecipientCount}
          />
        </ComposeRow>
        <ComposeRow label="Subject" htmlFor="nl-subject">
          <Input
            id="nl-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </ComposeRow>

        <BlockEditor
          blocks={contentBlocks}
          setBlocks={(content) =>
            setBlocks((prev) => mergeCampaignBlocks(content, splitCampaignBlocks(prev).attachments))
          }
          mergeFields={mergeFields}
          footer={
            <CampaignAttachments
              attachments={attachmentBlocks}
              setAttachments={(attachments) =>
                setBlocks((prev) => mergeCampaignBlocks(splitCampaignBlocks(prev).content, attachments))
              }
            />
          }
        />
      </div>

      {previewDialog}

      <AlertDialog
        open={leaveConfirmOpen}
        onOpenChange={(open) => {
          if (!open) resolveLeave(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              This campaign needs a name and subject before it can be saved. Going back now discards your changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolveLeave(false)}>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => resolveLeave(true)}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export { CampaignCompose as NewsletterSection }
