"use client"

import { useState, useEffect, useCallback } from "react"
import { db, type SmtpConfig } from "@/lib/db"
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
import { Plus, Pencil, Trash2, Server, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

const emptyConfig: Omit<SmtpConfig, "id" | "createdAt"> = {
  name: "",
  host: "",
  port: 587,
  secure: false,
  username: "",
  password: "",
  delayMs: 200,
  batchSize: 10,
}

export function SmtpConfigSection() {
  const [configs, setConfigs] = useState<SmtpConfig[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyConfig)
  const [testing, setTesting] = useState(false)

  const loadConfigs = useCallback(async () => {
    const all = await db.smtpConfigs.orderBy("createdAt").reverse().toArray()
    setConfigs(all)
  }, [])

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

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
      delayMs: config.delayMs ?? 200,
      batchSize: config.batchSize ?? 10,
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
    await db.smtpConfigs.delete(id)
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
        toast.error(`Connection failed: ${data.error}`)
      }
    } catch {
      toast.error("Could not test connection (server error)")
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">SMTP Servers</h2>
          <p className="text-sm text-muted-foreground">Configure your email sending servers</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 size-4" />
          Add Server
        </Button>
      </div>

      {configs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Server className="mb-4 size-12 text-muted-foreground/40" />
            <CardTitle className="mb-2 text-base">No SMTP servers configured</CardTitle>
            <CardDescription>Add your first SMTP server to start sending newsletters</CardDescription>
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
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit SMTP config"
                          onClick={() => openEdit(config)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete SMTP config"
                          onClick={() => handleDelete(config.id!)}
                        >
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "New"} SMTP Server</DialogTitle>
            <DialogDescription>
              Enter your SMTP server credentials. Common ports: 587 (STARTTLS), 465 (TLS), 25 (unencrypted).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="smtp-delay">Delay between emails (ms)</Label>
                <Input
                  id="smtp-delay"
                  type="number"
                  min={0}
                  max={10000}
                  value={form.delayMs}
                  onChange={(e) => setForm({ ...form, delayMs: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">
                  Throttle to avoid SMTP rate limits. 200ms is a safe default.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="smtp-batch">Batch size</Label>
                <Input
                  id="smtp-batch"
                  type="number"
                  min={1}
                  max={50}
                  value={form.batchSize}
                  onChange={(e) => setForm({ ...form, batchSize: Math.min(50, Math.max(1, parseInt(e.target.value) || 1)) })}
                />
                <p className="text-xs text-muted-foreground">
                  Emails per API call. Keep low (5-10) on Vercel Hobby, up to 30-50 on Pro.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleTest} disabled={testing || !form.host}>
              {testing ? "Testing..." : "Test Connection"}
            </Button>
            <Button onClick={handleSave}>{editingId ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
