"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"

function UnsubscribeContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get("email")
  const listId = searchParams.get("listId")
  const [status, setStatus] = useState<"loading" | "success" | "error" | "already">("loading")

  useEffect(() => {
    async function unsubscribe() {
      if (!email || !listId) {
        setStatus("error")
        return
      }

      try {
        // Dynamic import Dexie to handle client-side only
        const { db } = await import("@/lib/db")
        const contact = await db.contacts
          .where("listId")
          .equals(parseInt(listId))
          .filter((c) => c.email === email)
          .first()

        if (!contact) {
          setStatus("error")
          return
        }

        if (contact.unsubscribed) {
          setStatus("already")
          return
        }

        await db.contacts.update(contact.id!, { unsubscribed: true })
        setStatus("success")
      } catch {
        setStatus("error")
      }
    }

    unsubscribe()
  }, [email, listId])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center py-12 text-center">
          {status === "loading" && (
            <>
              <Loader2 className="mb-4 size-12 animate-spin text-primary" />
              <h1 className="text-lg font-semibold text-foreground">Processing...</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Please wait while we process your request.
              </p>
            </>
          )}
          {status === "success" && (
            <>
              <CheckCircle2 className="mb-4 size-12 text-success" />
              <h1 className="text-lg font-semibold text-foreground">Successfully Unsubscribed</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                <strong>{email}</strong> has been unsubscribed. You will no longer receive emails from this list.
              </p>
            </>
          )}
          {status === "already" && (
            <>
              <CheckCircle2 className="mb-4 size-12 text-muted-foreground" />
              <h1 className="text-lg font-semibold text-foreground">Already Unsubscribed</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                <strong>{email}</strong> was already unsubscribed from this list.
              </p>
            </>
          )}
          {status === "error" && (
            <>
              <XCircle className="mb-4 size-12 text-destructive" />
              <h1 className="text-lg font-semibold text-foreground">Something Went Wrong</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We could not process your unsubscribe request. The link may be invalid or expired.
              </p>
            </>
          )}
          <Button variant="outline" className="mt-6" onClick={() => window.close()}>
            Close
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <Card className="w-full max-w-md">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Loader2 className="mb-4 size-12 animate-spin text-primary" />
              <h1 className="text-lg font-semibold text-foreground">Loading...</h1>
            </CardContent>
          </Card>
        </div>
      }
    >
      <UnsubscribeContent />
    </Suspense>
  )
}
