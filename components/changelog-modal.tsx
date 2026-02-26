"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import type { ChangelogVersion, ChangelogData } from "@/lib/changelog-parser"
import { History, Package, Calendar, Plus, Edit3, Bug, Trash2, AlertTriangle, Shield, Loader2 } from "lucide-react"

const changeTypeConfig = {
  added: {
    icon: Plus,
    label: "Added",
    color: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  },
  changed: {
    icon: Edit3,
    label: "Changed",
    color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  },
  fixed: {
    icon: Bug,
    label: "Fixed",
    color: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  },
  removed: {
    icon: Trash2,
    label: "Removed",
    color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  },
  deprecated: {
    icon: AlertTriangle,
    label: "Deprecated",
    color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  },
  security: {
    icon: Shield,
    label: "Security",
    color: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  },
} as const

interface ChangelogModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangelogModal({ open, onOpenChange }: ChangelogModalProps) {
  const [versions, setVersions] = useState<ChangelogVersion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasFetched, setHasFetched] = useState(false)

  useEffect(() => {
    if (!open || hasFetched) return

    fetch("/api/changelog", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load changelog")
        return res.json() as Promise<ChangelogData>
      })
      .then((data) => {
        setVersions(data.versions)
        setHasFetched(true)
      })
      .catch((err) => {
        console.error("Error loading changelog:", err)
        setError("Failed to load changelog")
        setHasFetched(true)
      })
  }, [open, hasFetched])

  const loading = open && !hasFetched

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] p-0">
        <DialogHeader className="p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <History className="size-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-2xl">Changelog</DialogTitle>
              <DialogDescription>Complete version history and release notes</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="px-6 pb-6">
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="p-6 text-center">
                <p className="text-sm text-destructive">{error}</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <ScrollArea className="h-[calc(85vh-120px)] px-6 pb-6">
            <div className="space-y-6">
              {versions.map((version, versionIndex) => (
                <Card
                  key={version.version}
                  className={versionIndex === 0 ? "border-primary/50 bg-primary/5" : ""}
                >
                  <CardContent className="p-5">
                    <div className="mb-4 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Package className="size-5 text-muted-foreground" />
                          <h3 className="text-xl font-semibold text-foreground">v{version.version}</h3>
                        </div>
                        {versionIndex === 0 && (
                          <Badge variant="default" className="text-xs">
                            Latest
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="size-4" />
                        {version.date}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {version.changes.map((change, changeIndex) => {
                        const config = changeTypeConfig[change.type]
                        const Icon = config.icon

                        return (
                          <div key={`${version.version}-${change.type}-${changeIndex}`}>
                            {changeIndex > 0 && <Separator className="my-4" />}
                            <div className="space-y-2">
                              <Badge variant="outline" className={`${config.color} gap-1.5 text-xs font-medium`}>
                                <Icon className="size-3" />
                                {config.label}
                              </Badge>
                              <ul className="ml-4 space-y-1.5">
                                {change.items.map((item, itemIndex) => (
                                  <li
                                    key={itemIndex}
                                    className="text-sm text-muted-foreground leading-relaxed list-disc ml-4"
                                  >
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
