import { z } from "zod"

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function isValidEmail(value: string): boolean {
  return z.email().safeParse(normalizeEmail(value)).success
}
