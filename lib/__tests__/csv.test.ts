import { describe, expect, it } from "vitest"
import { parseCSV, serializeCSV } from "@/lib/csv"

describe("parseCSV", () => {
  it("parses comma-separated rows", () => {
    expect(parseCSV("email,name\na@b.com,Ada")).toEqual([
      ["email", "name"],
      ["a@b.com", "Ada"],
    ])
  })

  it("parses semicolon-separated rows", () => {
    expect(parseCSV("email;name\na@b.com;Ada")).toEqual([
      ["email", "name"],
      ["a@b.com", "Ada"],
    ])
  })

  it("keeps quoted commas and escaped quotes", () => {
    expect(parseCSV('email,name\n"a@b.com","Doe, Ada ""Ada"""')).toEqual([
      ["email", "name"],
      ["a@b.com", 'Doe, Ada "Ada"'],
    ])
  })

  it("skips blank rows", () => {
    expect(parseCSV("email\n\na@b.com\n")).toEqual([["email"], ["a@b.com"]])
  })
})

describe("serializeCSV", () => {
  it("quotes cells that contain commas or quotes", () => {
    expect(serializeCSV([["email", "name"], ["a@b.com", 'Doe, "Ada"']])).toBe(
      'email,name\na@b.com,"Doe, ""Ada"""',
    )
  })
})
