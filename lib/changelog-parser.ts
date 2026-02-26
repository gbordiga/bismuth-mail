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
