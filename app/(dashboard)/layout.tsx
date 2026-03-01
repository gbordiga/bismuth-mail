"use client"

import type { ReactNode } from "react"
import { AppShell } from "@/components/app-shell"
import { SendingProvider } from "@/lib/sending-context"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SendingProvider>
      <AppShell>{children}</AppShell>
    </SendingProvider>
  )
}
