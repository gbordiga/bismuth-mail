"use client"

import { useCallback, useEffect, useState } from "react"

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return "Unknown database error"
}

export function useDbTable<T>(loader: () => Promise<T[]>) {
  const [data, setData] = useState<T[]>([])
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
    void reload()
  }, [reload])

  return {
    data,
    setData,
    loading,
    error,
    reload,
  }
}
