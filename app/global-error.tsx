"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Fatal root error:", error)
  }, [error])

  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <main className="flex min-h-screen items-center justify-center px-6">
          <div className="w-full max-w-xl rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" aria-hidden="true" />
              <h1 className="text-lg font-semibold">The application failed to load</h1>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">
              The interface could not start correctly. Try restoring it or reloading the page.
            </p>
            <div className="flex gap-3">
              <Button onClick={reset}>Try again</Button>
              <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                Reload page
              </Button>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
