"use client"

import { useCallback, useEffect, useState } from "react"
import { APP_VERSION } from "@/lib/app-version"
import type { ChangelogData, ChangelogVersion } from "@/lib/changelog-parser"

export function useChangelog() {
  const [versions, setVersions] = useState<ChangelogVersion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasFetched, setHasFetched] = useState(false)

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/changelog", { cache: "no-store" })
      if (!res.ok) throw new Error("Failed to load changelog")
      const data = (await res.json()) as ChangelogData
      setVersions(data.versions)
      setError(null)
    } catch (err) {
      console.error("Error loading changelog:", err)
      setError("Failed to load changelog")
    } finally {
      setHasFetched(true)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return {
    versions,
    latestVersion: versions[0]?.version ?? APP_VERSION,
    error,
    hasFetched,
    reload,
  }
}
