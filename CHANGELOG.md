# Changelog

All notable changes to Bismuth Mail are documented here.

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
