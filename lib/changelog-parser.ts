import YAML from "yaml"

export interface ChangelogChange {
  type: "added" | "changed" | "fixed" | "removed" | "deprecated" | "security"
  items: string[]
}

export interface ChangelogVersion {
  version: string
  date: string
  changes: ChangelogChange[]
}

export interface ChangelogData {
  versions: ChangelogVersion[]
}

export function parseChangelog(content: string): ChangelogData {
  const data = YAML.parse(content) as ChangelogData | null

  if (!data || typeof data !== "object" || !Array.isArray(data.versions)) {
    throw new Error("Changelog must contain a versions array")
  }

  return data
}
