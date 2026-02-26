import { readFileSync } from "node:fs"
import { join } from "node:path"
import { NextResponse } from "next/server"
import YAML from "yaml"
import type { ChangelogData } from "@/lib/changelog-parser"

export async function GET() {
  try {
    const content = readFileSync(join(process.cwd(), "changelog.yaml"), "utf-8")
    const data = YAML.parse(content) as ChangelogData

    return NextResponse.json(data)
  } catch (error) {
    console.error("Failed to read changelog.yaml:", error)
    return NextResponse.json(
      { error: "Failed to load changelog" },
      { status: 500 },
    )
  }
}
