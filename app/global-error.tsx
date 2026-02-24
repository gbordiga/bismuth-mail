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
              <h1 className="text-lg font-semibold">Errore critico dell&apos;applicazione</h1>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">
              L&apos;interfaccia non e riuscita a caricarsi correttamente. Prova a ripristinare o ricaricare la pagina.
            </p>
            <div className="flex gap-3">
              <Button onClick={reset}>Riprova</Button>
              <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                Ricarica pagina
              </Button>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
