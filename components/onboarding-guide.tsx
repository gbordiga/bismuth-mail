"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { liveQuery } from "dexie"
import { db } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, Circle, X } from "lucide-react"

const STORAGE_KEY = "bismuth-onboarding-dismissed"
const VISIBILITY_EVENT = "bismuth-onboarding-visibility"

export function reopenOnboarding() {
  window.localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new Event(VISIBILITY_EVENT))
}

function subscribeVisibility(onChange: () => void) {
  window.addEventListener(VISIBILITY_EVENT, onChange)
  return () => window.removeEventListener(VISIBILITY_EVENT, onChange)
}

function getDismissed() {
  return window.localStorage.getItem(STORAGE_KEY) === "1"
}

interface SetupProgress {
  smtp: boolean
  sender: boolean
  list: boolean
  campaign: boolean
  send: boolean
}

async function loadSetupProgress(): Promise<SetupProgress> {
  const [smtpCount, senderCount, listCount, contactCount, campaignCount, sentCount] = await Promise.all([
    db.smtpConfigs.count(),
    db.senders.count(),
    db.emailLists.count(),
    db.contacts.count(),
    db.newsletters.count(),
    db.newsletters.where("status").anyOf("sent", "sent_with_errors").count(),
  ])
  return {
    smtp: smtpCount > 0,
    sender: senderCount > 0,
    list: listCount > 0 && contactCount > 0,
    campaign: campaignCount > 0,
    send: sentCount > 0,
  }
}

export function OnboardingGuide() {
  const dismissed = useSyncExternalStore(subscribeVisibility, getDismissed, () => true)
  const [progress, setProgress] = useState<SetupProgress | null>(null)
  const [forced, setForced] = useState(false)

  useEffect(() => {
    const subscription = liveQuery(loadSetupProgress).subscribe({
      next: setProgress,
    })
    const onVisibility = () => {
      setForced(!getDismissed())
    }
    window.addEventListener(VISIBILITY_EVENT, onVisibility)
    return () => {
      subscription.unsubscribe()
      window.removeEventListener(VISIBILITY_EVENT, onVisibility)
    }
  }, [])

  if (dismissed || !progress) return null

  const steps = [
    { key: "smtp", done: progress.smtp, href: "/smtp", label: "Add an SMTP server" },
    { key: "sender", done: progress.sender, href: "/senders", label: "Create a sender profile" },
    { key: "list", done: progress.list, href: "/lists", label: "Add a list with contacts" },
    { key: "campaign", done: progress.campaign, href: "/campaigns/new", label: "Compose a campaign" },
    { key: "send", done: progress.send, href: "/campaigns", label: "Send your first campaign" },
  ] as const

  const allDone = steps.every((step) => step.done)
  if (allDone && !forced) return null

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{allDone ? "Setup complete" : "Get started"}</p>
            <p className="text-xs text-muted-foreground">
              {allDone
                ? "All setup steps are done. Dismiss this guide anytime — it stays in this browser."
                : "Everything stays in this browser. Complete these steps to send your first campaign."}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss setup guide"
            onClick={() => {
              window.localStorage.setItem(STORAGE_KEY, "1")
              window.dispatchEvent(new Event(VISIBILITY_EVENT))
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
