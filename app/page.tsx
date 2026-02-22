"use client"

import { useState } from "react"
import { AppShell, type NavSection } from "@/components/app-shell"
import { SmtpConfigSection } from "@/components/smtp-config"
import { SenderSection } from "@/components/sender-section"
import { EmailListSection } from "@/components/email-list-section"
import { NewsletterSection } from "@/components/newsletter-editor"
import { SendCampaignSection } from "@/components/send-campaign"
import { BackupSection } from "@/components/backup-section"
import { SendingProvider } from "@/lib/sending-context"

export default function Home() {
  const [section, setSection] = useState<NavSection>("smtp")

  return (
    <SendingProvider>
      <AppShell activeSection={section} onSectionChange={setSection}>
        {section === "smtp" && <SmtpConfigSection />}
        {section === "senders" && <SenderSection />}
        {section === "lists" && <EmailListSection />}
        {section === "editor" && <NewsletterSection />}
        {section === "send" && <SendCampaignSection />}
        {section === "backup" && <BackupSection />}
      </AppShell>
    </SendingProvider>
  )
}
