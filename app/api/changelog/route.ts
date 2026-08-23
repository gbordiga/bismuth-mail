import { readFileSync } from "node:fs"
import { join } from "node:path"
import { NextResponse } from "next/server"
import { parseChangelog } from "@/lib/changelog-parser"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const content = readFileSync(join(process.cwd(), "changelog.yaml"), "utf-8")
    const data = parseChangelog(content)

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    console.error("Failed to read changelog.yaml:", error)
    return NextResponse.json(
      { error: "Failed to load changelog" },
      { status: 500 },
    )
  }
}
