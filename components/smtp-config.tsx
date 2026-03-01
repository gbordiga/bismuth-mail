"use client"

import { useState, useEffect, useCallback } from "react"
import { db, type SmtpConfig } from "@/lib/db"
import { useDbTable } from "@/hooks/use-db-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
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
import { Plus, Pencil, Trash2, Server, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

const emptyConfig: Omit<SmtpConfig, "id" | "createdAt"> = {
  name: "",
  host: "",
  port: 587,
  secure: false,
  username: "",
  password: "",
  delayMs: 0,
  maxConnections: 5,
}

export function SmtpConfigSection() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyConfig)
  const [testing, setTesting] = useState(false)

  const loadConfigsQuery = useCallback(async () => {
    return db.smtpConfigs.orderBy("createdAt").reverse().toArray()
  }, [])

  const { data: configs, loading, error, reload: loadConfigs } = useDbTable<SmtpConfig>(loadConfigsQuery)

  useEffect(() => {
    if (error) {
      toast.error(`Could not load SMTP configurations: ${error}`)
    }
  }, [error])

  function openCreate() {
    setEditingId(null)
    setForm(emptyConfig)
    setDialogOpen(true)
  }

  function openEdit(config: SmtpConfig) {
    setEditingId(config.id!)
    setForm({
      name: config.name,
      host: config.host,
      port: config.port,
      secure: config.secure,
      username: config.username,
      password: config.password,
      delayMs: config.delayMs ?? 0,
      maxConnections: config.maxConnections ?? 5,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name || !form.host || !form.username) {
      toast.error("Please fill in all required fields")
      return
    }
    if (editingId) {
      await db.smtpConfigs.update(editingId, { ...form })
      toast.success("SMTP configuration updated")
    } else {
      await db.smtpConfigs.add({ ...form, createdAt: new Date() })
      toast.success("SMTP configuration created")
    }
    setDialogOpen(false)
    loadConfigs()
  }

  async function handleDelete(id: number) {
    const senders = await db.senders.where("smtpConfigId").equals(id).count()
    if (senders > 0) {
      toast.error("Cannot delete: this config is used by one or more senders")
      return
    }
    setPendingDeleteId(id)
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return
    await db.smtpConfigs.delete(pendingDeleteId)
    setPendingDeleteId(null)
    toast.success("SMTP configuration deleted")
    loadConfigs()
  }

  async function handleTest() {
    setTesting(true)
    try {
      const res = await fetch("/api/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.success) {
        toast.success("Connection successful!")
      } else {
        toast.error(`Connection failed: ${data.message ?? data.error ?? "Unknown SMTP error"}`)
      }
    } catch {
      toast.error("Could not test connection (server error)")
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="content-area">
      <div className="section-header">
        <div>
          <h2 className="section-title">SMTP Servers</h2>
          <p className="section-description">Configure your email sending servers</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 size-4" />
          Add Server
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CardTitle className="mb-2 text-base">Loading SMTP servers...</CardTitle>
            <CardDescription>Please wait while configurations are loaded from local storage</CardDescription>
          </CardContent>
        </Card>
      ) : configs.length === 0 ? (
        <Card>
          <CardContent className="empty-state">
            <div className="empty-state-icon">
              <Server className="size-7" />
            </div>
            <CardTitle className="empty-state-title">No SMTP servers configured</CardTitle>
            <CardDescription className="empty-state-description">
              Add your first SMTP server to start sending emails
            </CardDescription>
            <Button onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              Add Server
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Port</TableHead>
                  <TableHead>Security</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell className="font-medium">{config.name}</TableCell>
                    <TableCell className="font-mono text-xs">{config.host}</TableCell>
                    <TableCell>{config.port}</TableCell>
                    <TableCell>
                      {config.secure ? (
                        <Badge variant="default" className="bg-success text-success-foreground">
                          <ShieldCheck className="mr-1 size-3" />
                          TLS
                        </Badge>
                      ) : (
                        <Badge variant="secondary">STARTTLS</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{config.username}</TableCell>
                    <TableCell className="text-right">
                      <TooltipProvider>
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Edit SMTP config"
                                onClick={() => openEdit(config)}
                              >
                                <Pencil className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit SMTP config</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Delete SMTP config"
                                onClick={() => handleDelete(config.id!)}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete SMTP config</TooltipContent>
                          </Tooltip>
                        </div>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "New"} SMTP Server</DialogTitle>
            <DialogDescription>
              Enter your SMTP server credentials. Common ports: 587 (STARTTLS), 465 (TLS), 25 (unencrypted).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connection</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="smtp-name">Configuration Name *</Label>
              <Input
                id="smtp-name"
                placeholder="e.g. Production Mail Server"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 grid gap-2">
                <Label htmlFor="smtp-host">Host *</Label>
                <Input
                  id="smtp-host"
                  placeholder="smtp.example.com"
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="smtp-port">Port</Label>
                <Input
                  id="smtp-port"
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 587 })}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="smtp-secure"
                checked={form.secure}
                onCheckedChange={(v) => setForm({ ...form, secure: v, port: v ? 465 : 587 })}
              />
              <Label htmlFor="smtp-secure">Use TLS (port 465)</Label>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="smtp-user">Username *</Label>
              <Input
                id="smtp-user"
                placeholder="user@example.com"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="smtp-pass">Password</Label>
              <Input
                id="smtp-pass"
                type="password"
                placeholder="App password or SMTP password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <h4 className="mb-3 text-sm font-medium text-foreground">Performance Settings</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="smtp-connections">Connections</Label>
                  <Input
                    id="smtp-connections"
                    type="number"
                    min={1}
                    max={20}
                    value={form.maxConnections}
                    onChange={(e) => setForm({ ...form, maxConnections: Math.min(20, Math.max(1, parseInt(e.target.value) || 5)) })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Parallel SMTP connections. Higher = faster. Most providers allow 5-10.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="smtp-delay">Delay (ms)</Label>
                  <Input
                    id="smtp-delay"
                    type="number"
                    min={0}
                    max={10000}
                    value={form.delayMs}
                    onChange={(e) => setForm({ ...form, delayMs: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Stagger between email starts. Set 0 for max speed, increase if you hit rate limits.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={testing || !form.host}>
              {testing ? "Testing..." : "Test Connection"}
            </Button>
            <Button onClick={handleSave}>{editingId ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SMTP server?</AlertDialogTitle>
            <AlertDialogDescription>
              This configuration will be permanently removed. Senders that use this SMTP server must be reassigned first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete server
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
