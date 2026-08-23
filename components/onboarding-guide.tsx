"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { db } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, Circle, X } from "lucide-react"

const STORAGE_KEY = "bismuth-onboarding-dismissed"

interface SetupProgress {
  smtp: boolean
  sender: boolean
  list: boolean
  campaign: boolean
}

export function OnboardingGuide() {
  const [progress, setProgress] = useState<SetupProgress | null>(null)
  const [dismissed, setDismissed] = useState(true)

  const load = useCallback(async () => {
    if (typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "1") {
      setDismissed(true)
      return
    }
    setDismissed(false)
    const [smtpCount, senderCount, listCount, contactCount, campaignCount] = await Promise.all([
      db.smtpConfigs.count(),
      db.senders.count(),
      db.emailLists.count(),
      db.contacts.count(),
      db.newsletters.count(),
    ])
    setProgress({
      smtp: smtpCount > 0,
      sender: senderCount > 0,
      list: listCount > 0 && contactCount > 0,
      campaign: campaignCount > 0,
    })
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial IndexedDB + localStorage read
    void load()
  }, [load])

  if (dismissed || !progress) return null

  const steps = [
    { key: "smtp", done: progress.smtp, href: "/smtp", label: "Add an SMTP server" },
    { key: "sender", done: progress.sender, href: "/senders", label: "Create a sender profile" },
    { key: "list", done: progress.list, href: "/lists", label: "Add a list with contacts" },
    { key: "campaign", done: progress.campaign, href: "/editor", label: "Compose a campaign" },
  ] as const

  if (steps.every((step) => step.done)) return null

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Get started</p>
            <p className="text-xs text-muted-foreground">
              Everything stays in this browser. Complete these steps to send your first campaign.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss setup guide"
            onClick={() => {
              window.localStorage.setItem(STORAGE_KEY, "1")
              setDismissed(true)
            }}
          >
            <X className="size-4" />
          </Button>
        </div>
        <ol className="grid gap-2 sm:grid-cols-2">
          {steps.map((step) => (
            <li key={step.key}>
              <Link
                href={step.href}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              >
                {step.done ? (
                  <CheckCircle2 className="size-4 text-success" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" />
                )}
                <span className={step.done ? "text-muted-foreground line-through" : "text-foreground"}>
                  {step.label}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
