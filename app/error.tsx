"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Unhandled application error:", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-xl rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-destructive">
          <AlertTriangle className="size-5" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Something went wrong</h2>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          You can try again now. If the problem persists, reload the page or check your SMTP configuration.
        </p>
        <div className="flex gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </div>
    </div>
  )
}
