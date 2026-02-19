import { NextResponse } from "next/server"
import nodemailer from "nodemailer"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { host, port, secure, username, password } = body

    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Boolean(secure),
      auth: {
        user: username,
        pass: password,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    })

    await transporter.verify()
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
