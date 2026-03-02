"use client"

import { useState, useEffect, useRef } from "react"
import DOMPurify from "isomorphic-dompurify"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Link2,
  List as ListIcon,
  Pilcrow,
  RemoveFormatting,
  Code,
  FileCode2,
  Eye,
} from "lucide-react"

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export function markdownToHtml(markdown: string): string {
  let html = escapeHtml(markdown)

  html = html.replace(/\r\n/g, "\n")

  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>")
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>")
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>")

  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/__(.+?)__/g, "<strong>$1</strong>")
  html = html.replace(/(^|[^\*])\*(?!\*)(.+?)\*(?!\*)/g, "$1<em>$2</em>")
  html = html.replace(/(^|[^_])_(.+?)_/g, "$1<em>$2</em>")
  html = html.replace(/~~(.+?)~~/g, "<s>$1</s>")
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')

  const lines = html.split("\n")
  const output: string[] = []
  let inList = false

  for (const line of lines) {
    const listMatch = line.match(/^\s*[-*]\s+(.+)$/)
    if (listMatch) {
      if (!inList) {
        output.push("<ul>")
        inList = true
      }
      output.push(`<li>${listMatch[1]}</li>`)
      continue
    }
    if (inList) {
      output.push("</ul>")
      inList = false
    }
    if (!line.trim()) {
      output.push("")
      continue
    }
    if (/^<h[1-3]>.*<\/h[1-3]>$/.test(line) || /^<ul>$/.test(line) || /^<\/ul>$/.test(line)) {
      output.push(line)
    } else {
      output.push(`<p>${line}</p>`)
    }
  }
  if (inList) output.push("</ul>")

  return output.join("\n").replace(/\n{3,}/g, "\n\n")
}

export function htmlToMarkdown(html: string): string {
  let md = html.replace(/\r\n/g, "\n")

  md = md.replace(/<(strong|b)>([\s\S]*?)<\/(strong|b)>/gi, "**$2**")
  md = md.replace(/<(em|i)>([\s\S]*?)<\/(em|i)>/gi, "*$2*")
  md = md.replace(/<(s|del|strike)>([\s\S]*?)<\/(s|del|strike)>/gi, "~~$2~~")
  md = md.replace(/<u>([\s\S]*?)<\/u>/gi, "$1")
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")

  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "# $1\n")
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "## $1\n")
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "### $1\n")
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
  md = md.replace(/<br\s*\/?>/gi, "\n")
  md = md.replace(/<\/(p|div)>/gi, "\n")
  md = md.replace(/<\/(ul|ol)>/gi, "\n")

  const parser = new DOMParser()
  const doc = parser.parseFromString(md, "text/html")
  md = (doc.body.textContent || "").replace(/\u00a0/g, " ")

  return md.replace(/\n{3,}/g, "\n\n").trim()
}

function sanitizeLinkHref(rawUrl: string): string | null {
  const trimmed = rawUrl.trim()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed, window.location.origin)
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:" || url.protocol === "tel:") {
      return url.href
    }
  } catch {
    return null
  }

  return null
}

const EDITOR_ALLOWED_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "del",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strike",
  "strong",
  "u",
  "ul",
]

function sanitizeEditorHtml(rawHtml: string): string {
  const purified = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: EDITOR_ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "title", "target", "rel"],
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ["style"],
  })

  const parser = new DOMParser()
  const doc = parser.parseFromString(purified, "text/html")
  for (const anchor of Array.from(doc.querySelectorAll("a[href]"))) {
    const safeHref = sanitizeLinkHref(anchor.getAttribute("href") || "")
    if (!safeHref) {
      anchor.removeAttribute("href")
      continue
    }
    anchor.setAttribute("href", safeHref)

    if (anchor.getAttribute("target") === "_blank") {
      const rel = new Set((anchor.getAttribute("rel") || "").split(/\s+/).filter(Boolean))
      rel.add("noopener")
      rel.add("noreferrer")
      anchor.setAttribute("rel", Array.from(rel).join(" "))
    }
  }
  return doc.body.innerHTML
}

function setEditorHtml(target: HTMLDivElement, html: string) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")
  target.replaceChildren(...Array.from(doc.body.childNodes))
}

export function RichTextEditor({
  value,
  onChange,
  minHeight = "160px",
}: {
  value: string
  onChange: (html: string) => void
  minHeight?: string
}) {
  const editableRef = useRef<HTMLDivElement>(null)
  const savedSelectionRef = useRef<Range | null>(null)
  const [mode, setMode] = useState<"visual" | "source" | "html">("visual")
  const [mdSource, setMdSource] = useState(() => htmlToMarkdown(value))
  const [htmlSource, setHtmlSource] = useState(value)
  const [hasLocalDraft, setHasLocalDraft] = useState(false)

  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState("https://")
  const [linkText, setLinkText] = useState("")

  const currentMdSource = hasLocalDraft ? mdSource : htmlToMarkdown(value)
  const currentHtmlSource = hasLocalDraft ? htmlSource : value

  useEffect(() => {
    if (mode !== "visual" || !editableRef.current) return
    const safeHtml = sanitizeEditorHtml(value)
    if (editableRef.current.innerHTML !== safeHtml) {
      setEditorHtml(editableRef.current, safeHtml)
    }
  }, [mode, value])

  function saveSelection() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange()
    }
  }

  function restoreSelection() {
    const sel = window.getSelection()
    if (sel && savedSelectionRef.current) {
      sel.removeAllRanges()
      sel.addRange(savedSelectionRef.current)
    }
  }

  function exec(command: string, commandValue?: string) {
    restoreSelection()
    editableRef.current?.focus()
    document.execCommand(command, false, commandValue)
    saveSelection()
    emitChange()
  }

  function emitChange() {
    const rawHtml = editableRef.current?.innerHTML || ""
    const html = sanitizeEditorHtml(rawHtml)
    onChange(html)
    setMdSource(htmlToMarkdown(html))
    setHtmlSource(html)
    setHasLocalDraft(false)
  }

  function openLinkDialog(e: React.MouseEvent) {
    e.preventDefault()
    saveSelection()
    const sel = window.getSelection()
    const selected = sel?.toString() || ""
    setLinkText(selected)
    setLinkUrl("https://")
    setLinkDialogOpen(true)
  }

  function confirmLink() {
    setLinkDialogOpen(false)
    const safeHref = sanitizeLinkHref(linkUrl)
    if (!safeHref) return
    restoreSelection()
    editableRef.current?.focus()

    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      const anchor = document.createElement("a")
      anchor.href = safeHref
      anchor.textContent = linkText || safeHref
      range.insertNode(anchor)
      range.setStartAfter(anchor)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    }

    saveSelection()
    emitChange()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key === "b") { e.preventDefault(); exec("bold") }
    if (mod && e.key === "i") { e.preventDefault(); exec("italic") }
    if (mod && e.key === "u") { e.preventDefault(); exec("underline") }
    if (mod && e.key === "k") {
      e.preventDefault()
      saveSelection()
      const sel = window.getSelection()
      setLinkText(sel?.toString() || "")
      setLinkUrl("https://")
      setLinkDialogOpen(true)
    }
  }

  function switchToSource() {
    const currentHtml =
      mode === "visual"
        ? editableRef.current?.innerHTML || value
        : mode === "html"
          ? currentHtmlSource
          : markdownToHtml(currentMdSource)
    setMdSource(htmlToMarkdown(currentHtml))
    setHtmlSource(currentHtml)
    setHasLocalDraft(true)
    setMode("source")
  }

  function switchToVisual() {
    const rawHtml = mode === "html" ? currentHtmlSource : markdownToHtml(currentMdSource)
    const html = sanitizeEditorHtml(rawHtml)
    onChange(html)
    setHtmlSource(html)
    setMdSource(htmlToMarkdown(html))
    setHasLocalDraft(false)
    setMode("visual")
  }

  function switchToHtml() {
    const currentHtml =
      mode === "visual"
        ? editableRef.current?.innerHTML || value
        : mode === "source"
          ? markdownToHtml(currentMdSource)
          : currentHtmlSource
    setHtmlSource(currentHtml)
    setMdSource(htmlToMarkdown(currentHtml))
    setHasLocalDraft(true)
    setMode("html")
  }

  function handleSourceChange(nextMd: string) {
    setMdSource(nextMd)
    const html = sanitizeEditorHtml(markdownToHtml(nextMd))
    setHtmlSource(html)
    setHasLocalDraft(true)
    onChange(html)
  }

  function handleHtmlChange(nextHtml: string) {
    const safeHtml = sanitizeEditorHtml(nextHtml)
    setHtmlSource(nextHtml)
    setMdSource(htmlToMarkdown(safeHtml))
    setHasLocalDraft(true)
    onChange(safeHtml)
  }

  const tb = "h-7 w-7 p-0"
  const sep = <div className="mx-0.5 h-5 w-px bg-border" />

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1">
        {mode === "visual" && (
          <div className="flex flex-wrap items-center gap-0.5 rounded-md border bg-muted/30 p-0.5">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className={tb} onMouseDown={(e) => { e.preventDefault(); exec("bold") }}>
                    <Bold className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Bold (Ctrl+B)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className={tb} onMouseDown={(e) => { e.preventDefault(); exec("italic") }}>
                    <Italic className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Italic (Ctrl+I)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className={tb} onMouseDown={(e) => { e.preventDefault(); exec("underline") }}>
                    <Underline className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Underline (Ctrl+U)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className={tb} onMouseDown={(e) => { e.preventDefault(); exec("strikeThrough") }}>
                    <Strikethrough className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Strikethrough</TooltipContent>
              </Tooltip>

              {sep}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className={tb} onMouseDown={openLinkDialog}>
                    <Link2 className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Insert link (Ctrl+K)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className={tb} onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList") }}>
                    <ListIcon className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Bullet list</TooltipContent>
              </Tooltip>

              {sep}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-xs font-bold" onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "h1") }}>
                    H1
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Heading 1</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-xs font-bold" onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "h2") }}>
                    H2
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Heading 2</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-xs font-bold" onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "h3") }}>
                    H3
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Heading 3</TooltipContent>
              </Tooltip>

              {sep}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className={tb} onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "p") }}>
                    <Pilcrow className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Normal text</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className={tb} onMouseDown={(e) => { e.preventDefault(); exec("removeFormat") }}>
                    <RemoveFormatting className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear formatting</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
        <div className="flex-1" />
        <TooltipProvider delayDuration={300}>
          <div className="flex items-center gap-0.5 rounded-md border bg-muted/30 p-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "visual" ? "secondary" : "ghost"}
                  className="h-7 w-7 p-0"
                  onClick={switchToVisual}
                >
                  <Eye className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Visual mode</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "source" ? "secondary" : "ghost"}
                  className="h-7 w-7 p-0"
                  onClick={switchToSource}
                >
                  <Code className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Markdown mode</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "html" ? "secondary" : "ghost"}
                  className="h-7 w-7 p-0"
                  onClick={switchToHtml}
                >
                  <FileCode2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Raw HTML mode</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {mode === "visual" ? (
        <div
          ref={editableRef}
          contentEditable
          suppressContentEditableWarning
          className="rounded-md border bg-white p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-1 [&_a]:text-blue-600 [&_a]:underline [&_p]:mb-1"
          style={{ minHeight }}
          onInput={() => { saveSelection(); emitChange() }}
          onKeyDown={handleKeyDown}
          onMouseUp={saveSelection}
          onKeyUp={saveSelection}
        />
      ) : mode === "source" ? (
        <Textarea
          className="bg-white font-mono text-xs"
          style={{ minHeight }}
          value={currentMdSource}
          onChange={(e) => handleSourceChange(e.target.value)}
          placeholder={"# Heading\n\nWrite **bold**, *italic*, and [links](https://...) in markdown."}
        />
      ) : (
        <Textarea
          className="bg-white font-mono text-xs"
          style={{ minHeight }}
          value={currentHtmlSource}
          onChange={(e) => handleHtmlChange(e.target.value)}
          placeholder={"<p>Write raw HTML here...</p>"}
        />
      )}

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Insert Link</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="link-url" className="text-xs">URL</Label>
              <Input
                id="link-url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmLink() } }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="link-text" className="text-xs">Text (optional)</Label>
              <Input
                id="link-text"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="Link text"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmLink() } }}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={confirmLink} disabled={!linkUrl || linkUrl === "https://"}>
              Insert
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
