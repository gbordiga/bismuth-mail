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
    email: z.email(),
  }),
  replyTo: z.email().optional().or(z.literal("")),
  to: z.email(),
  subject: z.string().min(1).max(998),
  html: z.string().min(1).max(5_000_000),
})

const editorBlockSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "image", "button", "divider", "html"]),
  content: z.string().max(50_000),
  props: z.record(z.string(), z.string()),
})

export const smtpSendBatchSchema = z.object({
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
    email: z.email(),
  }),
  replyTo: z.email().optional().or(z.literal("")),
  subjectTemplate: z.string().min(1).max(998),
  blocks: z.array(editorBlockSchema).min(1),
  signature: z.string().max(10_000).prefault(""),
  unsubscribeEmail: z.email(),
  contacts: z.array(
    z.object({
      email: z.email(),
      firstName: z.string(),
      lastName: z.string(),
      customData: z.record(z.string(), z.string()).optional(),
    })
  ).min(1).max(500),
  delayMs: z.coerce.number().int().min(0).max(10_000).prefault(0),
  maxRetries: z.coerce.number().int().min(0).max(5).prefault(2),
  maxConnections: z.coerce.number().int().min(1).max(20).prefault(5),
})
