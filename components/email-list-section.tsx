"use client"

import { useState, useEffect, useCallback } from "react"
import { db, type EmailList, type Contact, type CustomField } from "@/lib/db"
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
import { Plus, Pencil, Trash2, Users, Upload, ArrowLeft, X, Download, UserPlus, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

// --- CSV Parser (simple, handles quotes) ---
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let current = ""
  let inQuotes = false
  let row: string[] = []

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (c === '"' && next === '"') {
        current += '"'
        i++
      } else if (c === '"') {
        inQuotes = false
      } else {
        current += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === "," || c === ";") {
        row.push(current.trim())
        current = ""
      } else if (c === "\n" || (c === "\r" && next === "\n")) {
        row.push(current.trim())
        if (row.some((cell) => cell.length > 0)) rows.push(row)
        row = []
        current = ""
        if (c === "\r") i++
      } else {
        current += c
      }
    }
  }
  row.push(current.trim())
  if (row.some((cell) => cell.length > 0)) rows.push(row)

  return rows
}

// --- List Management Component ---
export function EmailListSection() {
  const [lists, setLists] = useState<(EmailList & { contactCount: number })[]>([])
  const [selectedList, setSelectedList] = useState<EmailList | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [listDialogOpen, setListDialogOpen] = useState(false)
  const [contactDialogOpen, setContactDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [pendingDeleteListId, setPendingDeleteListId] = useState<number | null>(null)
  const [pendingDeleteContactId, setPendingDeleteContactId] = useState<number | null>(null)
  const [editingListId, setEditingListId] = useState<number | null>(null)
  const [editingContactId, setEditingContactId] = useState<number | null>(null)

  const [listForm, setListForm] = useState({ name: "", description: "" })
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [newFieldName, setNewFieldName] = useState("")
  const [newFieldType, setNewFieldType] = useState<CustomField["type"]>("text")

  const [contactForm, setContactForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    customData: {} as Record<string, string>,
  })

  // CSV Import state
  const [csvData, setCsvData] = useState<string[][]>([])
  const [csvMapping, setCsvMapping] = useState<Record<string, number>>({})
  const [searchQuery, setSearchQuery] = useState("")
  const [lastCleanupResult, setLastCleanupResult] = useState<{
    removed: number
    invalidRemoved: number
    duplicatesRemoved: number
    at: Date
  } | null>(null)
  const [lastImportReport, setLastImportReport] = useState<{
    imported: number
    skipped: number
    invalid: number
    duplicatesInImport: number
    existingSkipped: number
    at: Date
  } | null>(null)

  const loadLists = useCallback(async () => {
    const all = await db.emailLists.orderBy("createdAt").reverse().toArray()
    const withCounts = await Promise.all(
      all.map(async (list) => ({
        ...list,
        contactCount: await db.contacts.where("listId").equals(list.id!).count(),
      })),
    )
    setLists(withCounts)
  }, [])

  const loadContacts = useCallback(async (listId: number) => {
    const all = await db.contacts.where("listId").equals(listId).toArray()
    setContacts(all)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load from IndexedDB
    void loadLists()
  }, [loadLists])

  useEffect(() => {
    if (selectedList) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reload contacts when list changes
      void loadContacts(selectedList.id!)
      setLastCleanupResult(null)
      setLastImportReport(null)
    }
  }, [selectedList, loadContacts])

  // --- List CRUD ---
  function openCreateList() {
    setEditingListId(null)
    setListForm({ name: "", description: "" })
    setCustomFields([])
    setListDialogOpen(true)
  }

  function openEditList(list: EmailList) {
    setEditingListId(list.id!)
    setListForm({ name: list.name, description: list.description })
    setCustomFields([...list.customFields])
    setListDialogOpen(true)
  }

  function addCustomField() {
    if (!newFieldName.trim()) return
    if (customFields.some((f) => f.name === newFieldName.trim())) {
      toast.error("Field already exists")
      return
    }
    setCustomFields([...customFields, { name: newFieldName.trim(), type: newFieldType }])
    setNewFieldName("")
  }

  function removeCustomField(name: string) {
    setCustomFields(customFields.filter((f) => f.name !== name))
  }

  async function handleSaveList() {
    if (!listForm.name) {
      toast.error("List name is required")
      return
    }
    if (editingListId) {
      await db.emailLists.update(editingListId, {
        name: listForm.name,
        description: listForm.description,
        customFields,
      })
      if (selectedList?.id === editingListId) {
        setSelectedList({ ...selectedList!, name: listForm.name, description: listForm.description, customFields })
      }
      toast.success("List updated")
    } else {
      await db.emailLists.add({
        name: listForm.name,
        description: listForm.description,
        customFields,
        createdAt: new Date(),
      })
      toast.success("List created")
    }
    setListDialogOpen(false)
    loadLists()
  }

  async function handleDeleteList(id: number) {
    setPendingDeleteListId(id)
  }

  async function confirmDeleteList() {
    if (!pendingDeleteListId) return
    const id = pendingDeleteListId
    setPendingDeleteListId(null)
    await db.contacts.where("listId").equals(id).delete()
    // Clean up newsletter listIds references
    const referencingNls = await db.newsletters.filter((nl) => nl.listIds.includes(id)).toArray()
    for (const nl of referencingNls) {
      await db.newsletters.update(nl.id!, { listIds: nl.listIds.filter((lid) => lid !== id) })
    }
    await db.emailLists.delete(id)
    if (selectedList?.id === id) setSelectedList(null)
    toast.success("List and all contacts deleted")
    loadLists()
  }

  // --- Contact CRUD ---
  function openCreateContact() {
    setEditingContactId(null)
    setContactForm({ email: "", firstName: "", lastName: "", customData: {} })
    setContactDialogOpen(true)
  }

  function openEditContact(contact: Contact) {
    setEditingContactId(contact.id!)
    setContactForm({
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      customData: { ...contact.customData },
    })
    setContactDialogOpen(true)
  }

  async function handleSaveContact() {
    if (!contactForm.email) {
      toast.error("Email is required")
      return
    }
    if (editingContactId) {
      await db.contacts.update(editingContactId, { ...contactForm })
      toast.success("Contact updated")
    } else {
      const normalizedEmail = contactForm.email.trim().toLowerCase()
      const isValid = z.string().email().safeParse(normalizedEmail).success
      if (!isValid) {
        toast.error("Please enter a valid email address")
        return
      }
      
      const existing = await db.contacts
        .where("listId")
        .equals(selectedList!.id!)
        .filter((c) => c.email.trim().toLowerCase() === normalizedEmail)
        .first()
      if (existing) {
        toast.error("This email already exists in this list")
        return
      }
      await db.contacts.add({
        ...contactForm,
        email: normalizedEmail,
        listId: selectedList!.id!,
        subscribedAt: new Date(),
        unsubscribed: false,
      })
      toast.success("Contact added")
    }
    setContactDialogOpen(false)
    loadContacts(selectedList!.id!)
    loadLists()
  }

  async function handleDeleteContact(id: number) {
    setPendingDeleteContactId(id)
  }

  async function confirmDeleteContact() {
    if (!pendingDeleteContactId || !selectedList) return
    const id = pendingDeleteContactId
    setPendingDeleteContactId(null)
    await db.contacts.delete(id)
    toast.success("Contact removed")
    loadContacts(selectedList!.id!)
    loadLists()
  }

  // --- CSV Import ---
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const rows = parseCSV(text)
      if (rows.length < 2) {
        toast.error("File must have at least a header row and one data row")
        return
      }
      setCsvData(rows)
      // Auto-map common column names
      const headers = rows[0].map((h) => h.toLowerCase())
      const mapping: Record<string, number> = {}
      headers.forEach((h, i) => {
        if (h.includes("email") || h.includes("mail")) mapping.email = i
        if (h.includes("first") || h.includes("nome")) mapping.firstName = i
        if (h.includes("last") || h.includes("cognome") || h.includes("surname")) mapping.lastName = i
      })
      // Map custom fields
      if (selectedList?.customFields) {
        selectedList.customFields.forEach((cf) => {
          const idx = headers.findIndex((h) => h === cf.name.toLowerCase())
          if (idx !== -1) mapping[`custom_${cf.name}`] = idx
        })
      }
      setCsvMapping(mapping)
      setImportDialogOpen(true)
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  async function handleImport() {
    if (csvMapping.email === undefined) {
      toast.error("Please map the email column")
      return
    }
    const dataRows = csvData.slice(1)

    const existingContacts = await db.contacts.where("listId").equals(selectedList!.id!).toArray()
    const existingEmails = new Set(existingContacts.map((c) => c.email.trim().toLowerCase()))

    const importEmails = new Set<string>()
    const toAdd: Omit<Contact, "id">[] = []
    let invalid = 0
    let duplicatesInImport = 0

    for (const row of dataRows) {
      const rawEmail = row[csvMapping.email]?.trim() ?? ""
      const normalizedEmail = rawEmail.toLowerCase()
      
      const isValid = z.string().email().safeParse(normalizedEmail).success
      if (!isValid) {
        invalid++
        continue
      }

      if (importEmails.has(normalizedEmail)) {
        duplicatesInImport++
        continue
      }

      if (existingEmails.has(normalizedEmail)) {
        continue
      }

      importEmails.add(normalizedEmail)

      const customData: Record<string, string> = {}
      if (selectedList?.customFields) {
        selectedList.customFields.forEach((cf) => {
          const idx = csvMapping[`custom_${cf.name}`]
          if (idx !== undefined && row[idx]) {
            customData[cf.name] = row[idx].trim()
          }
        })
      }

      toAdd.push({
        listId: selectedList!.id!,
        email: normalizedEmail,
        firstName: csvMapping.firstName !== undefined ? (row[csvMapping.firstName]?.trim() ?? "") : "",
        lastName: csvMapping.lastName !== undefined ? (row[csvMapping.lastName]?.trim() ?? "") : "",
        customData,
        subscribedAt: new Date(),
        unsubscribed: false,
      })
    }

    const existingSkipped = dataRows.length - invalid - duplicatesInImport - toAdd.length
    const skipped = invalid + duplicatesInImport + existingSkipped

    if (toAdd.length > 0) {
      await db.contacts.bulkAdd(toAdd)
    }

    setLastImportReport({
      imported: toAdd.length,
      skipped,
      invalid,
      duplicatesInImport,
      existingSkipped,
      at: new Date(),
    })

    toast.success(
      `Imported ${toAdd.length}. Skipped ${skipped} (invalid: ${invalid}, duplicates in file: ${duplicatesInImport}, already in list: ${existingSkipped})`
    )
    setImportDialogOpen(false)
    setCsvData([])
    loadContacts(selectedList!.id!)
    loadLists()
  }

  async function handleCleanList() {
    if (!selectedList) return

    const allContacts = await db.contacts.where("listId").equals(selectedList.id!).toArray()
    const seenEmails = new Set<string>()
    const idsToDelete: number[] = []
    let invalidRemoved = 0
    let duplicatesRemoved = 0

    for (const contact of allContacts) {
      const normalizedEmail = contact.email.trim().toLowerCase()
      const isValid = z.string().email().safeParse(normalizedEmail).success

      if (!isValid) {
        idsToDelete.push(contact.id!)
        invalidRemoved++
        continue
      }

      if (seenEmails.has(normalizedEmail)) {
        idsToDelete.push(contact.id!)
        duplicatesRemoved++
        continue
      }

      seenEmails.add(normalizedEmail)
    }

    if (idsToDelete.length > 0) {
      await db.contacts.bulkDelete(idsToDelete)
    }

    setLastCleanupResult({
      removed: idsToDelete.length,
      invalidRemoved,
      duplicatesRemoved,
      at: new Date(),
    })

    if (idsToDelete.length === 0) {
      toast.info("No invalid or duplicate emails found")
    } else {
      toast.success(
        `Cleanup completed: ${idsToDelete.length} removed (${invalidRemoved} invalid, ${duplicatesRemoved} duplicates)`
      )
    }

    loadContacts(selectedList.id!)
    loadLists()
  }

  // Filter contacts
  const filteredContacts = contacts.filter((c) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      c.email.toLowerCase().includes(q) || c.firstName.toLowerCase().includes(q) || c.lastName.toLowerCase().includes(q)
    )
  })

  // --- Render: List View ---
  if (!selectedList) {
    return (
      <div className="flex flex-col gap-6">
        <div className="section-header">
          <div>
            <h2 className="section-title">Email Lists</h2>
            <p className="section-description">Manage your contact lists and custom fields</p>
          </div>
          <Button onClick={openCreateList}>
            <Plus className="mr-2 size-4" />
            Create List
          </Button>
        </div>

        {lists.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="mb-4 size-12 text-muted-foreground/40" />
              <CardTitle className="mb-2 text-base">No email lists yet</CardTitle>
              <CardDescription>Create your first list to start collecting contacts</CardDescription>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {lists.map((list) => (
              <Card
                key={list.id}
                className="cursor-pointer transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-primary/30"
                role="button"
                tabIndex={0}
                aria-label={`Open list ${list.name}`}
                onClick={() => setSelectedList(list)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    setSelectedList(list)
                  }
                }}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{list.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {list.description || "No description"}
                      </p>
                    </div>
                    <div className="ml-3 flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit list ${list.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditList(list)
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete list ${list.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteList(list.id!)
                        }}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <Badge variant="secondary">
                      <Users className="mr-1 size-3" />
                      {list.contactCount} contacts
                    </Badge>
                    {list.customFields.length > 0 && (
                      <Badge variant="outline">
                        {list.customFields.length} custom field{list.customFields.length > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit List Dialog */}
        <Dialog open={listDialogOpen} onOpenChange={setListDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingListId ? "Edit" : "New"} List</DialogTitle>
              <DialogDescription>Define the list name and any custom fields for contacts</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="list-name">List Name *</Label>
                <Input
                  id="list-name"
                  placeholder="e.g. Subscribers"
                  value={listForm.name}
                  onChange={(e) => setListForm({ ...listForm, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="list-desc">Description</Label>
                <Textarea
                  id="list-desc"
                  placeholder="Brief description of this list"
                  rows={2}
                  value={listForm.description}
                  onChange={(e) => setListForm({ ...listForm, description: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Custom Fields</Label>
                <div className="flex flex-wrap gap-2">
                  {customFields.map((f) => (
                    <Badge key={f.name} variant="secondary" className="gap-1 pr-1">
                      {f.name} ({f.type})
                      <button
                        onClick={() => removeCustomField(f.name)}
                        aria-label={`Remove custom field ${f.name}`}
                        className="ml-1 rounded-full p-0.5 hover:bg-muted"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Field name"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCustomField()}
                    className="flex-1"
                  />
                  <Select value={newFieldType} onValueChange={(v) => setNewFieldType(v as CustomField["type"])}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={addCustomField}>
                    Add
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setListDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveList}>{editingListId ? "Update" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={pendingDeleteListId !== null} onOpenChange={(open) => !open && setPendingDeleteListId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete list and contacts?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the selected list and all contacts inside it. Campaign references to this list
                will also be removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={confirmDeleteList}
              >
                Delete list
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // --- Render: Contact Detail View ---
  return (
    <div className="flex flex-col gap-6">
      <div className="section-header">
        <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setSelectedList(null)}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <h2 className="section-title">{selectedList.name}</h2>
          <p className="section-description">
            {selectedList.description || "No description"} &middot; {contacts.length} contacts
          </p>
        </div>
        </div>
        <div className="action-cluster">
          <Button variant="outline" onClick={handleCleanList}>
            <Sparkles className="mr-2 size-4" />
            Clean List
          </Button>
          <label htmlFor="csv-upload" className="cursor-pointer">
            <Button variant="outline" asChild>
              <span>
                <Upload className="mr-2 size-4" />
                Import CSV
              </span>
            </Button>
          </label>
          <input id="csv-upload" type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
          <Button onClick={openCreateContact}>
            <UserPlus className="mr-2 size-4" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Search */}
      <Input
        placeholder="Search contacts by email, first name, or last name..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="max-w-md"
      />

      {/* Validation Summary Cards */}
      {(lastCleanupResult || lastImportReport) && (
        <div className="grid gap-3 md:grid-cols-2">
          {lastCleanupResult && (
            <Card className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/10">
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Last Cleanup Result</CardTitle>
                  <Badge variant="outline">{lastCleanupResult.at.toLocaleTimeString()}</Badge>
                </div>
                <div className="text-2xl font-semibold">{lastCleanupResult.removed} removed</div>
                <p className="text-sm text-muted-foreground">
                  Duplicate emails removed: {lastCleanupResult.duplicatesRemoved}
                </p>
                <p className="text-sm text-muted-foreground">
                  Invalid email format removed: {lastCleanupResult.invalidRemoved}
                </p>
              </CardContent>
            </Card>
          )}
          {lastImportReport && (
            <Card className="border-blue-300/60 bg-blue-50/40 dark:bg-blue-950/10">
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Last Import Validation</CardTitle>
                  <Badge variant="outline">{lastImportReport.at.toLocaleTimeString()}</Badge>
                </div>
                <p className="text-sm">
                  Imported: <span className="font-semibold">{lastImportReport.imported}</span>
                </p>
                <p className="text-sm">
                  Skipped duplicates in file: <span className="font-semibold">{lastImportReport.duplicatesInImport}</span>
                </p>
                <p className="text-sm">
                  Skipped invalid format: <span className="font-semibold">{lastImportReport.invalid}</span>
                </p>
                <p className="text-sm">
                  Skipped already in list: <span className="font-semibold">{lastImportReport.existingSkipped}</span>
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {contacts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Download className="mb-4 size-12 text-muted-foreground/40" />
            <CardTitle className="mb-2 text-base">No contacts yet</CardTitle>
            <CardDescription>Add contacts manually or import from a CSV file</CardDescription>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>First Name</TableHead>
                  <TableHead>Last Name</TableHead>
                  {selectedList.customFields.map((f) => (
                    <TableHead key={f.name}>{f.name}</TableHead>
                  ))}
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-mono text-xs">{contact.email}</TableCell>
                    <TableCell>{contact.firstName}</TableCell>
                    <TableCell>{contact.lastName}</TableCell>
                    {selectedList.customFields.map((f) => (
                      <TableCell key={f.name} className="text-xs">
                        {contact.customData[f.name] || "-"}
                      </TableCell>
                    ))}
                    <TableCell>
                      {contact.unsubscribed ? (
                        <Badge variant="destructive" className="text-xs">
                          Unsubscribed
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-success/10 text-success text-xs">
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit contact"
                          onClick={() => openEditContact(contact)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete contact"
                          onClick={() => handleDeleteContact(contact.id!)}
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

      {/* Add/Edit Contact Dialog */}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingContactId ? "Edit" : "Add"} Contact</DialogTitle>
            <DialogDescription>Enter the contact details</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="contact-email">Email *</Label>
              <Input
                id="contact-email"
                type="email"
                placeholder="user@example.com"
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="contact-first">First Name</Label>
                <Input
                  id="contact-first"
                  value={contactForm.firstName}
                  onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contact-last">Last Name</Label>
                <Input
                  id="contact-last"
                  value={contactForm.lastName}
                  onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })}
                />
              </div>
            </div>
            {selectedList.customFields.map((f) => (
              <div key={f.name} className="grid gap-2">
                <Label>{f.name}</Label>
                <Input
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  value={contactForm.customData[f.name] || ""}
                  onChange={(e) =>
                    setContactForm({
                      ...contactForm,
                      customData: { ...contactForm.customData, [f.name]: e.target.value },
                    })
                  }
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveContact}>{editingContactId ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import CSV</DialogTitle>
            <DialogDescription>
              Map your CSV columns to contact fields. {csvData.length > 0 && `Found ${csvData.length - 1} rows.`}
            </DialogDescription>
          </DialogHeader>
          {csvData.length > 0 && (
            <div className="grid gap-4 py-2">
              <p className="text-xs text-muted-foreground">
                During import, invalid emails and duplicates are automatically skipped. You will get a detailed report.
              </p>
              <p className="text-xs text-muted-foreground">CSV Headers: {csvData[0].join(", ")}</p>
              <div className="grid gap-3">
                <div className="grid grid-cols-2 items-center gap-4">
                  <Label>Email Column *</Label>
                  <Select
                    value={csvMapping.email !== undefined ? String(csvMapping.email) : ""}
                    onValueChange={(v) => setCsvMapping({ ...csvMapping, email: parseInt(v) })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      {csvData[0].map((h, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {h || `Column ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 items-center gap-4">
                  <Label>First Name Column</Label>
                  <Select
                    value={csvMapping.firstName !== undefined ? String(csvMapping.firstName) : "none"}
                    onValueChange={(v) => {
                      if (v === "none") {
                        const m = { ...csvMapping }
                        delete m.firstName
                        setCsvMapping(m)
                      } else {
                        setCsvMapping({ ...csvMapping, firstName: parseInt(v) })
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Skip</SelectItem>
                      {csvData[0].map((h, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {h || `Column ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 items-center gap-4">
                  <Label>Last Name Column</Label>
                  <Select
                    value={csvMapping.lastName !== undefined ? String(csvMapping.lastName) : "none"}
                    onValueChange={(v) => {
                      if (v === "none") {
                        const m = { ...csvMapping }
                        delete m.lastName
                        setCsvMapping(m)
                      } else {
                        setCsvMapping({ ...csvMapping, lastName: parseInt(v) })
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Skip</SelectItem>
                      {csvData[0].map((h, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {h || `Column ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedList.customFields.map((cf) => (
                  <div key={cf.name} className="grid grid-cols-2 items-center gap-4">
                    <Label>{cf.name}</Label>
                    <Select
                      value={
                        csvMapping[`custom_${cf.name}`] !== undefined ? String(csvMapping[`custom_${cf.name}`]) : "none"
                      }
                      onValueChange={(v) => {
                        if (v === "none") {
                          const m = { ...csvMapping }
                          delete m[`custom_${cf.name}`]
                          setCsvMapping(m)
                        } else {
                          setCsvMapping({ ...csvMapping, [`custom_${cf.name}`]: parseInt(v) })
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Skip</SelectItem>
                        {csvData[0].map((h, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {h || `Column ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {/* Preview */}
              {csvData.length > 1 && (
                <div className="rounded-lg border p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Preview (first 3 rows)</p>
                  <div className="overflow-x-auto text-xs">
                    <table className="w-full">
                      <thead>
                        <tr>
                          {csvData[0].map((h, i) => (
                            <th key={i} className="px-2 py-1 text-left font-medium text-muted-foreground">
                              {h || `Col ${i + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvData.slice(1, 4).map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-2 py-1 text-foreground">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleImport}>Import {csvData.length > 1 ? csvData.length - 1 : 0} Contacts</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDeleteContactId !== null}
        onOpenChange={(open) => !open && setPendingDeleteContactId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the contact from the current list and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteContact}
            >
              Remove contact
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
