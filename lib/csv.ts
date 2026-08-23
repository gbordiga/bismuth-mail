export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let current = ""
  let inQuotes = false
  let row: string[] = []

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (c === '"' && next === '"') {
        current += '"'
        i++
      } else if (c === '"') {
        inQuotes = false
      } else {
        current += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === "," || c === ";") {
      row.push(current.trim())
      current = ""
    } else if (c === "\n" || (c === "\r" && next === "\n")) {
      row.push(current.trim())
      if (row.some((cell) => cell.length > 0)) rows.push(row)
      row = []
      current = ""
      if (c === "\r") i++
    } else {
      current += c
    }
  }

  row.push(current.trim())
  if (row.some((cell) => cell.length > 0)) rows.push(row)

  return rows
}

export function escapeCsvCell(value: string): string {
  if (/[",\n\r;]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}

export function serializeCSV(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => escapeCsvCell(cell ?? "")).join(",")).join("\n")
}

export function downloadText(filename: string, content: string, mimeType = "text/plain;charset=utf-8"): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadJson(filename: string, content: string): void {
  downloadText(filename, content, "application/json;charset=utf-8")
}

export function downloadCsv(filename: string, rows: string[][]): void {
  downloadText(filename, serializeCSV(rows), "text/csv;charset=utf-8")
}
