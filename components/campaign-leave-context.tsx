"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"

export type CampaignLeaveGuard = () => Promise<boolean>

interface CampaignLeaveContextValue {
  hasLeaveGuard: boolean
  registerLeaveGuard: (guard: CampaignLeaveGuard | null) => void
  tryLeave: () => Promise<boolean>
}

const CampaignLeaveContext = createContext<CampaignLeaveContextValue | null>(null)

export function CampaignLeaveProvider({ children }: { children: ReactNode }) {
  const guardRef = useRef<CampaignLeaveGuard | null>(null)
  const [hasLeaveGuard, setHasLeaveGuard] = useState(false)

  const registerLeaveGuard = useCallback((guard: CampaignLeaveGuard | null) => {
    guardRef.current = guard
    setHasLeaveGuard(guard != null)
  }, [])

  const tryLeave = useCallback(async () => {
    if (!guardRef.current) return true
    return guardRef.current()
  }, [])

  return (
    <CampaignLeaveContext.Provider value={{ hasLeaveGuard, registerLeaveGuard, tryLeave }}>
      {children}
    </CampaignLeaveContext.Provider>
  )
}

export function useCampaignLeave() {
  const ctx = useContext(CampaignLeaveContext)
  if (!ctx) {
    return {
      hasLeaveGuard: false,
      registerLeaveGuard: () => {},
      tryLeave: async () => true,
    }
  }
  return ctx
}

export function useCampaignLeaveGuard(guard: CampaignLeaveGuard) {
  const { registerLeaveGuard } = useCampaignLeave()
  const guardRef = useRef(guard)

  useEffect(() => {
    guardRef.current = guard
  })

  useEffect(() => {
    registerLeaveGuard(() => guardRef.current())
    return () => registerLeaveGuard(null)
  }, [registerLeaveGuard])
}
