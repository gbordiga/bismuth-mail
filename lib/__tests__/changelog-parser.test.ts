import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseChangelog } from "@/lib/changelog-parser"

describe("parseChangelog", () => {
  it("parses changelog.yaml", () => {
    const content = readFileSync(join(process.cwd(), "changelog.yaml"), "utf-8")
    const data = parseChangelog(content)

    expect(data.versions.length).toBeGreaterThan(0)
    expect(data.versions[0]?.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(data.versions[0]?.changes[0]?.items.length).toBeGreaterThan(0)
  })

  it("rejects YAML whose list items start with a reserved character", () => {
    expect(() =>
      parseChangelog(`
versions:
  - version: 0.0.0
    date: 2026-01-01
    changes:
      - type: added
        items:
          - \`List-Unsubscribe\` header
`),
    ).toThrow(/reserved character/)
  })
})
