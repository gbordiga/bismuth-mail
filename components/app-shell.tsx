"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { Mail, Server, Users, FileEdit, Send, Menu, X, DatabaseBackup, Sun, Moon, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useSending } from "@/lib/sending-context"
import { ChangelogModal } from "@/components/changelog-modal"

const navItems = [
  { id: "smtp", label: "SMTP Config", href: "/smtp", icon: Server },
  { id: "senders", label: "Senders", href: "/senders", icon: Mail },
  { id: "lists", label: "Email Lists", href: "/lists", icon: Users },
  { id: "editor", label: "Campaigns", href: "/editor", icon: FileEdit },
  { id: "send", label: "Send Campaign", href: "/send", icon: Send },
  { id: "backup", label: "Backup", href: "/backup", icon: DatabaseBackup },
] as const

export type NavSection = (typeof navItems)[number]["id"]
type NavGroup = {
  label: string
  items: ReadonlyArray<(typeof navItems)[number]>
}

const navGroups: NavGroup[] = [
  { label: "Setup", items: [navItems[0], navItems[1]] },
  { label: "Content", items: [navItems[2], navItems[3]] },
  { label: "Deliver", items: [navItems[4]] },
  { label: "System", items: [navItems[5]] },
]

function getActiveSection(pathname: string): NavSection {
  const item = navItems.find((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`))
  return item?.id ?? "smtp"
}

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const activeSection = getActiveSection(pathname)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const { sending, phase, sendProgress } = useSending()

  const progressPct = sendProgress.total > 0
    ? ((sendProgress.sent + sendProgress.failed) / sendProgress.total) * 100
    : 0

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/20 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card transition-transform duration-200 lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center gap-3 border-b px-5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
            <Mail className="size-4 text-primary-foreground" />
          </div>
          <span className="text-base font-semibold text-foreground">Bismuth Mail</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto lg:hidden"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close sidebar"
                >
                  <X className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close sidebar</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-1.5">
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{group.label}</p>
              <ul className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = activeSection === item.id
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        {item.label}
                        {item.id === "send" && sending && (
                          <span className="ml-auto size-2 shrink-0 animate-pulse rounded-full bg-primary" />
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}

          {sending && (
            <Link
              href="/send"
              onClick={() => setMobileOpen(false)}
              className="mt-3 w-full rounded-lg border bg-muted/30 p-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center gap-2 text-xs mb-1.5">
                <Loader2 className="size-3 animate-spin text-primary" />
                <span className="font-medium text-foreground">
                  {phase === "preparing" && "Preparing..."}
                  {phase === "checking-smtp" && "Checking SMTP..."}
                  {phase === "sending" && "Sending..."}
                  {phase === "finishing" && "Finishing..."}
                </span>
              </div>
              {(phase === "sending" || phase === "finishing") && (
                <>
                  <Progress value={progressPct} className="h-1.5 mb-1" />
                  <div className="text-[11px] text-muted-foreground">
                    {sendProgress.sent} / {sendProgress.total} sent
                    {sendProgress.failed > 0 && (
                      <span className="text-destructive"> · {sendProgress.failed} failed</span>
                    )}
                  </div>
                </>
              )}
              {phase === "checking-smtp" && (
                <div className="text-[11px] text-muted-foreground">
                  Verifying SMTP connection...
                </div>
              )}
            </Link>
          )}
        </nav>
        <div className="border-t bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setChangelogOpen(true)}
              className="text-left transition-opacity hover:opacity-80"
            >
              <p className="text-xs font-medium text-foreground/90">Local-first storage</p>
              <p className="text-[11px] text-muted-foreground">Data is stored in IndexedDB on this device</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground/70 transition-colors hover:text-primary">
                v{process.env.NEXT_PUBLIC_APP_VERSION} · View changelog
              </p>
            </button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    aria-label="Toggle theme"
                  >
                    <Sun className="size-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle theme</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-3 border-b bg-card px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="size-5" />
          </Button>
          <h1 className="text-lg font-semibold text-foreground">
            {navItems.find((n) => n.id === activeSection)?.label}
          </h1>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>

      {/* Changelog Modal */}
      <ChangelogModal open={changelogOpen} onOpenChange={setChangelogOpen} />
    </div>
  )
}
