import { z } from "zod"

export const smtpTestSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.coerce.boolean(),
  username: z.string().min(1),
  password: z.string(),
})

export const smtpSendSchema = z.object({
  smtp: z.object({
    host: z.string().min(1),
    port: z.coerce.number().int().min(1).max(65535),
    secure: z.coerce.boolean(),
    auth: z.object({
      user: z.string().min(1),
      pass: z.string(),
    }),
  }),
  from: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  replyTo: z.string().email().optional().or(z.literal("")),
  to: z.string().email(),
  subject: z.string().min(1).max(998),
  html: z.string().min(1).max(5_000_000),
})
