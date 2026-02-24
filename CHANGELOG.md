# Changelog

All notable changes to Bismuth Mail are documented here.

## [0.2.4] — 2026-02-24

### Added

- Added global App Router error boundaries via `app/error.tsx` and `app/global-error.tsx` with recovery actions
- Added `send-batch` API route tests covering invalid payloads, merge field/HTML escaping behavior, and transient retry handling
- Added reusable `useDbTable` hook for consistent Dexie table loading state (`data`, `loading`, `error`, `reload`)

### Changed

- Refactored `smtp-config` to use the shared `useDbTable` loading pattern
- Updated README with explicit CI scope (CI checks in repo, no CD workflow defined)
- Added README security guidance for self-hosted SMTP credential handling
- Aligned README TypeScript references to 5.9

## [0.2.3] — 2026-02-24

### Changed

- Performed a structured dependency refresh across runtime and tooling packages, including `zod` v4, `sonner` v2, `tailwindcss` v4.2, `typescript` v5.9, and related type packages
- Updated `nodemailer` to `8.0.1` explicitly in dependencies and removed now-redundant `nodemailer` overrides
- Kept `eslint` on v9 intentionally due to current `eslint-config-next` plugin incompatibility with v10 in this project

## [0.2.2] — 2026-02-23

### Changed

- Simplified email footer to show only the unsubscribe link, removing the redundant "subscribed to our mailing list" message

## [0.2.1] — 2026-02-23

### Changed

- Added dependency overrides for minimatch, nodemailer, and ajv to enforce secure minimum versions
- Updated nodemailer to 8.0.1 and ajv to 8.18.0
- Added explicit `permissions: { contents: read }` to CI workflow to follow the principle of least privilege

## [0.2.0] — 2025-02-22

### Added

- **Sending context** — new `SendingProvider` that tracks sending state (phase, progress, errors) across the entire app
- **Live progress indicator** — sidebar shows real-time sending progress with phase labels, progress bar, and failure count
- **Retry mechanism** — automatic retries with detailed error diagnostics when individual emails fail
- **Custom merge fields** — support `{{field}}` placeholders in subject and body, resolved per-contact from list custom fields
- **SMTP tuning options** — configurable `delayMs`, `batchSize`, and `maxConnections` per SMTP server
- **Test email** — send a single test email before launching a full campaign

### Changed

- Refactored send-batch API to accept structured contacts with custom fields instead of plain recipient strings
- Reduced default batch size cap from 100 to 50 for more reliable delivery
- Set default inter-batch delay to 200 ms to avoid SMTP throttling
- Batch size is now computed automatically based on SMTP config; removed manual input from the UI
- Updated database schema with backward-compatible migrations for new SMTP fields

### Fixed

- Select component items now truncate long text instead of overflowing

## [0.1.0] — 2025-02-15

Initial release.

### Features

- SMTP server configuration with connection testing
- Sender profiles with custom signatures and reply-to addresses
- Email list management with custom fields, CSV import/export
- Block-based email editor (text, image, button, divider, raw HTML)
- Campaign sending with per-recipient delivery logging
- Full data backup and restore as JSON
- Dark mode with system-aware theme toggle
- Fully local storage via IndexedDB (Dexie) — no server-side database
