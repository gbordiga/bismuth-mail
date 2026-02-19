"use client"

import { useState, useEffect, useCallback } from "react"
import { db, type Sender, type SmtpConfig } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
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
import { Plus, Pencil, Trash2, Mail } from "lucide-react"
import { toast } from "sonner"

const emptySender: Omit<Sender, "id" | "createdAt"> = {
  name: "",
  email: "",
  replyTo: "",
  unsubscribeEmail: "",
  smtpConfigId: 0,
  signature: "",
}

export function SenderSection() {
  const [senders, setSenders] = useState<Sender[]>([])
  const [smtpConfigs, setSmtpConfigs] = useState<SmtpConfig[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptySender)
  const [previewSig, setPreviewSig] = useState(false)

  const load = useCallback(async () => {
    const [allSenders, allSmtp] = await Promise.all([
      db.senders.orderBy("createdAt").reverse().toArray(),
      db.smtpConfigs.toArray(),
    ])
    setSenders(allSenders)
    setSmtpConfigs(allSmtp)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function openCreate() {
    setEditingId(null)
    setForm({ ...emptySender, smtpConfigId: smtpConfigs[0]?.id ?? 0 })
    setDialogOpen(true)
  }

  function openEdit(sender: Sender) {
    setEditingId(sender.id!)
    setForm({
      name: sender.name,
      email: sender.email,
      replyTo: sender.replyTo,
      unsubscribeEmail: sender.unsubscribeEmail || "",
      smtpConfigId: sender.smtpConfigId,
      signature: sender.signature,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name || !form.email || !form.smtpConfigId || !form.unsubscribeEmail) {
      toast.error("Please fill in name, email, unsubscribe email, and select an SMTP server")
      return
    }
    if (editingId) {
      await db.senders.update(editingId, { ...form })
      toast.success("Sender updated")
    } else {
      await db.senders.add({ ...form, createdAt: new Date() })
      toast.success("Sender created")
    }
    setDialogOpen(false)
    load()
  }

  async function handleDelete(id: number) {
    await db.senders.delete(id)
    toast.success("Sender deleted")
    load()
  }

  function getSmtpName(id: number) {
    return smtpConfigs.find((s) => s.id === id)?.name ?? "Unknown"
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Senders</h2>
          <p className="text-sm text-muted-foreground">
            Create sender identities with custom signatures
          </p>
        </div>
        <Button onClick={openCreate} disabled={smtpConfigs.length === 0}>
          <Plus className="mr-2 size-4" />
          Add Sender
        </Button>
      </div>

      {smtpConfigs.length === 0 && (
        <Card>
          <CardContent className="py-6">
            <p className="text-center text-sm text-muted-foreground">
              Configure at least one SMTP server before creating senders.
            </p>
          </CardContent>
        </Card>
      )}

      {senders.length === 0 && smtpConfigs.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Mail className="mb-4 size-12 text-muted-foreground/40" />
            <CardTitle className="mb-2 text-base">No senders configured</CardTitle>
            <CardDescription>
              Add a sender identity with name, email, and signature
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        senders.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Reply-To</TableHead>
                    <TableHead>SMTP Server</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {senders.map((sender) => (
                    <TableRow key={sender.id}>
                      <TableCell className="font-medium">{sender.name}</TableCell>
                      <TableCell className="font-mono text-xs">{sender.email}</TableCell>
                      <TableCell className="font-mono text-xs">{sender.replyTo || "Same"}</TableCell>
                      <TableCell>{getSmtpName(sender.smtpConfigId)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(sender)}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(sender.id!)}>
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
        )
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "New"} Sender</DialogTitle>
            <DialogDescription>
              Configure the sender identity that recipients will see
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sender-name">Sender Name *</Label>
                <Input
                  id="sender-name"
                  placeholder="e.g. John from Company"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sender-email">Sender Email *</Label>
                <Input
                  id="sender-email"
                  type="email"
                  placeholder="john@company.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sender-reply">Reply-To (optional)</Label>
                <Input
                  id="sender-reply"
                  type="email"
                  placeholder="support@company.com"
                  value={form.replyTo}
                  onChange={(e) => setForm({ ...form, replyTo: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sender-unsub">Unsubscribe Email *</Label>
                <Input
                  id="sender-unsub"
                  type="email"
                  placeholder="unsubscribe@company.com"
                  value={form.unsubscribeEmail}
                  onChange={(e) => setForm({ ...form, unsubscribeEmail: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Recipients will be prompted to send an email here to unsubscribe.
                </p>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sender-smtp">SMTP Server *</Label>
              <Select
                value={String(form.smtpConfigId)}
                onValueChange={(v) => setForm({ ...form, smtpConfigId: parseInt(v) })}
              >
                <SelectTrigger id="sender-smtp" className="w-full">
                  <SelectValue placeholder="Select server" />
                </SelectTrigger>
                <SelectContent>
                  {smtpConfigs.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="sender-sig">Signature (HTML)</Label>
                <Button variant="ghost" size="sm" onClick={() => setPreviewSig(!previewSig)}>
                  {previewSig ? "Edit" : "Preview"}
                </Button>
              </div>
              {previewSig ? (
                <div
                  className="min-h-[120px] rounded-lg border bg-card p-4"
                  dangerouslySetInnerHTML={{ __html: form.signature }}
                />
              ) : (
                <Textarea
                  id="sender-sig"
                  placeholder={'<p>Best regards,<br/><strong>John</strong></p>'}
                  rows={5}
                  className="font-mono text-xs"
                  value={form.signature}
                  onChange={(e) => setForm({ ...form, signature: e.target.value })}
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
