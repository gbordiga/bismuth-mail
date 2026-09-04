"use client"

import { useCallback, useEffect, useState } from "react"

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return "Unknown database error"
}

export function useDbQuery<T>(loader: () => Promise<T>, initial: T) {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await loader()
      setData(rows)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [loader])

  useEffect(() => {
    let cancelled = false
    void loader()
      .then((rows) => {
        if (cancelled) return
        setData(rows)
        setError(null)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(getErrorMessage(err))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loader])

  return {
    data,
    setData,
    loading,
    error,
    reload,
  }
}

export function useDbTable<T>(loader: () => Promise<T[]>) {
  return useDbQuery(loader, [] as T[])
}
