"use client"

import { useState, useRef } from "react"
import { DB_SCHEMA_VERSION, db } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Download, Upload, AlertTriangle, Info, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"

interface BackupPayload {
  smtpConfigs: unknown[]
  senders: unknown[]
  emailLists: unknown[]
  contacts: unknown[]
  newsletters: unknown[]
  sendLogs: unknown[]
}

interface BackupDataV2 {
  version: 2
  exportedAt: string
  appVersion: string
  dbSchemaVersion: number
  payload: BackupPayload
}

interface LegacyBackupDataV1 extends BackupPayload {
  version: 1
  exportedAt: string
}

type BackupData = BackupDataV2

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function normalizeBackup(input: unknown): BackupData | null {
  if (!isRecord(input) || typeof input.version !== "number" || typeof input.exportedAt !== "string") {
    return null
  }

  if (input.version === 2 && isRecord(input.payload)) {
    const payload = input.payload as Partial<BackupPayload>
    if (
      Array.isArray(payload.smtpConfigs) &&
      Array.isArray(payload.senders) &&
      Array.isArray(payload.emailLists) &&
      Array.isArray(payload.contacts) &&
      Array.isArray(payload.newsletters) &&
      Array.isArray(payload.sendLogs)
    ) {
      return {
        version: 2,
        exportedAt: input.exportedAt,
        appVersion: typeof input.appVersion === "string" ? input.appVersion : "unknown",
        dbSchemaVersion: typeof input.dbSchemaVersion === "number" ? input.dbSchemaVersion : 0,
        payload: payload as BackupPayload,
      }
    }
  }

  if (input.version === 1) {
    const legacy = input as Partial<LegacyBackupDataV1>
    if (
      Array.isArray(legacy.smtpConfigs) &&
      Array.isArray(legacy.senders) &&
      Array.isArray(legacy.emailLists) &&
      Array.isArray(legacy.contacts) &&
      Array.isArray(legacy.newsletters) &&
      Array.isArray(legacy.sendLogs)
    ) {
      return {
        version: 2,
        exportedAt: legacy.exportedAt ?? new Date(0).toISOString(),
        appVersion: "legacy-v1",
        dbSchemaVersion: 0,
        payload: {
          smtpConfigs: legacy.smtpConfigs,
          senders: legacy.senders,
          emailLists: legacy.emailLists,
          contacts: legacy.contacts,
          newsletters: legacy.newsletters,
          sendLogs: legacy.sendLogs,
        },
      }
    }
  }

  return null
}

export function BackupSection() {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [importSummary, setImportSummary] = useState<BackupData | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    setExporting(true)
    try {
      const [smtpConfigs, senders, emailLists, contacts, newsletters, sendLogs] = await Promise.all([
        db.smtpConfigs.toArray(),
        db.senders.toArray(),
        db.emailLists.toArray(),
        db.contacts.toArray(),
        db.newsletters.toArray(),
        db.sendLogs.toArray(),
      ])

      const backup: BackupData = {
        version: 2,
        exportedAt: new Date().toISOString(),
        appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
        dbSchemaVersion: DB_SCHEMA_VERSION,
        payload: {
          smtpConfigs,
          senders,
          emailLists,
          contacts,
          newsletters,
          sendLogs,
        },
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `bismuth-mail-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("Backup exported successfully")
    } catch (err) {
      toast.error("Export failed: " + String(err))
    } finally {
      setExporting(false)
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith(".json")) {
      toast.error("Please select a valid JSON backup file")
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string) as unknown
        const data = normalizeBackup(raw)
        if (!data) {
          toast.error("Invalid backup file format")
          return
        }
        setImportSummary(data)
        setConfirmOpen(true)
      } catch {
        toast.error("Failed to parse backup file")
      }
    }
    reader.readAsText(file)
    // Reset input so same file can be re-selected
    e.target.value = ""
  }

  async function handleImport() {
    if (!importSummary) return
    setConfirmOpen(false)
    setImporting(true)

    try {
      await db.transaction(
        "rw",
        [db.smtpConfigs, db.senders, db.emailLists, db.contacts, db.newsletters, db.sendLogs],
        async () => {
          await Promise.all([
            db.smtpConfigs.clear(),
            db.senders.clear(),
            db.emailLists.clear(),
            db.contacts.clear(),
            db.newsletters.clear(),
            db.sendLogs.clear(),
          ])

          // Preserve original IDs so foreign key references remain valid
          await db.smtpConfigs.bulkAdd(importSummary.payload.smtpConfigs as Parameters<typeof db.smtpConfigs.bulkAdd>[0])
          await db.senders.bulkAdd(importSummary.payload.senders as Parameters<typeof db.senders.bulkAdd>[0])
          await db.emailLists.bulkAdd(importSummary.payload.emailLists as Parameters<typeof db.emailLists.bulkAdd>[0])
          await db.contacts.bulkAdd(importSummary.payload.contacts as Parameters<typeof db.contacts.bulkAdd>[0])
          await db.newsletters.bulkAdd(importSummary.payload.newsletters as Parameters<typeof db.newsletters.bulkAdd>[0])
          await db.sendLogs.bulkAdd(importSummary.payload.sendLogs as Parameters<typeof db.sendLogs.bulkAdd>[0])
        },
      )

      toast.success("Backup imported successfully! Reload the page to see all data.")
      setImportSummary(null)
    } catch (err) {
      toast.error("Import failed: " + String(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="content-area">
      <div className="section-header">
        <div>
          <h2 className="section-title">Backup & Restore</h2>
          <p className="section-description">
            Export or import all your data including SMTP configs, senders, lists, contacts, campaigns, and send logs
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Export Card */}
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-6">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
              <Download className="size-7 text-primary" />
            </div>
            <div className="text-center">
              <CardTitle className="mb-1 text-base">Export Backup</CardTitle>
              <CardDescription>
                Download a JSON file with all your data. This file can be used to restore your setup on any browser.
              </CardDescription>
            </div>
            <Button onClick={handleExport} disabled={exporting} className="w-full">
              {exporting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="mr-2 size-4" />
                  Export All Data
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Import Card */}
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-6">
            <div className="flex size-14 items-center justify-center rounded-full bg-warning/10">
              <Upload className="size-7 text-warning-foreground" />
            </div>
            <div className="text-center">
              <CardTitle className="mb-1 text-base">Import Backup</CardTitle>
              <CardDescription>
                Restore all data from a previously exported JSON file. This will replace all current data.
              </CardDescription>
            </div>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileSelect} />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing} className="w-full">
              {importing ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 size-4" />
                  Select Backup File
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Alert className="bg-muted/20">
        <Info />
        <AlertTitle>About data storage</AlertTitle>
        <AlertDescription>
          <p>
            All your data is stored locally in your browser using IndexedDB. Data does not leave your device unless you
            explicitly send emails.
          </p>
          <p>Use the export feature to create backups before clearing browser data or switching devices.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline">SMTP Configs</Badge>
            <Badge variant="outline">Senders</Badge>
            <Badge variant="outline">Email Lists</Badge>
            <Badge variant="outline">Contacts</Badge>
            <Badge variant="outline">Campaigns</Badge>
            <Badge variant="outline">Send Logs</Badge>
          </div>
        </AlertDescription>
      </Alert>

      {/* Confirm Import Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-warning-foreground" />
              Confirm Import
            </DialogTitle>
            <DialogDescription>
              This will <strong>replace all existing data</strong> with the backup contents. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>

          {importSummary && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="mb-2 text-sm font-medium text-foreground">Backup contents:</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center justify-between rounded bg-card px-3 py-1.5">
                  <span className="text-muted-foreground">SMTP Configs</span>
                  <Badge variant="secondary">{importSummary.payload.smtpConfigs.length}</Badge>
                </div>
                <div className="flex items-center justify-between rounded bg-card px-3 py-1.5">
                  <span className="text-muted-foreground">Senders</span>
                  <Badge variant="secondary">{importSummary.payload.senders.length}</Badge>
                </div>
                <div className="flex items-center justify-between rounded bg-card px-3 py-1.5">
                  <span className="text-muted-foreground">Email Lists</span>
                  <Badge variant="secondary">{importSummary.payload.emailLists.length}</Badge>
                </div>
                <div className="flex items-center justify-between rounded bg-card px-3 py-1.5">
                  <span className="text-muted-foreground">Contacts</span>
                  <Badge variant="secondary">{importSummary.payload.contacts.length}</Badge>
                </div>
                <div className="flex items-center justify-between rounded bg-card px-3 py-1.5">
                  <span className="text-muted-foreground">Campaigns</span>
                  <Badge variant="secondary">{importSummary.payload.newsletters.length}</Badge>
                </div>
                <div className="flex items-center justify-between rounded bg-card px-3 py-1.5">
                  <span className="text-muted-foreground">Send Logs</span>
                  <Badge variant="secondary">{importSummary.payload.sendLogs.length}</Badge>
                </div>
              </div>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <p>Exported: {new Date(importSummary.exportedAt).toLocaleString()}</p>
                <p>
                  Backup format v{importSummary.version} · App {importSummary.appVersion} · DB schema{" "}
                  {importSummary.dbSchemaVersion}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleImport}>
              <Upload className="mr-2 size-4" />
              Replace All Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
