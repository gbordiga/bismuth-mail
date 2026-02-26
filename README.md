# Bismuth Mail

A self-hosted email campaign platform built with Next.js. Configure SMTP servers, manage subscriber lists, compose emails with a block-based editor, and send campaigns — all from a single interface. Data is stored locally in the browser via IndexedDB, so no external database is required.

**Live:** [bismuth-mail.vercel.app](https://bismuth-mail.vercel.app)

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06b6d4?logo=tailwindcss)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **SMTP Configuration** — Add and manage multiple SMTP servers with connection testing, tunable batch size, delay, and max connections
- **Sender Profiles** — Create sender identities with custom signatures and reply-to addresses
- **Email Lists** — Organize contacts into lists with custom fields, CSV import/export
- **Block Editor** — Compose emails using text, image, button, divider, and raw HTML blocks
- **Merge Fields** — Use `{{field}}` placeholders in subject and body, resolved per-contact from list custom fields
- **Campaign Sending** — Send campaigns to selected lists with real-time progress tracking, automatic retries, and test emails
- **Backup & Restore** — Export and import all data as JSON for portability
- **Dark Mode** — System-aware theme toggle with light and dark modes
- **Fully Local Storage** — All data persisted in IndexedDB via Dexie; no server-side database needed

## Tech Stack

| Layer      | Technology                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| Framework  | [Next.js 16](https://nextjs.org/) (App Router)                                                                    |
| UI         | [React 19](https://react.dev/), [Radix UI](https://www.radix-ui.com/), [Tailwind CSS 4](https://tailwindcss.com/) |
| Components | [shadcn/ui](https://ui.shadcn.com/) pattern                                                                       |
| Database   | [Dexie](https://dexie.org/) (IndexedDB)                                                                           |
| Email      | [Nodemailer](https://nodemailer.com/) via API routes                                                              |
| Validation | [Zod](https://zod.dev/)                                                                                           |
| Language   | TypeScript 5.9                                                                                                    |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18.18 or later
- [pnpm](https://pnpm.io/) 10+

### Installation

```bash
git clone https://github.com/gbordiga/bismuth-mail.git
cd bismuth-mail
pnpm install
```

### Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
pnpm build
pnpm start
```

## Quality and CI

- A GitHub Actions CI workflow runs on pushes and pull requests to `main`.
- The workflow runs `pnpm lint`, `tsc --noEmit`, `pnpm test`, and `pnpm build`.
- The repository currently includes CI checks only; deployment (CD) is not defined in this repository.

## Security Notes (Self-Hosted)

- SMTP credentials are configured in the client UI and sent to `/api/smtp/*` routes to perform test/send operations.
- This tradeoff is acceptable for private self-hosted environments, but you should treat the app as an internal tool unless you add authentication and additional hardening.
- Recommended baseline:
  - Serve only over HTTPS.
  - Restrict access to trusted users/networks.
  - Avoid exposing the app publicly without authentication, rate limiting, and monitoring.

## Project Structure

```
bismuth-mail/
├── app/
│   ├── api/smtp/          # API routes for sending and testing emails
│   ├── layout.tsx         # Root layout with theme provider
│   ├── page.tsx           # Main entry point
│   └── globals.css        # Global styles and Tailwind imports
├── components/
│   ├── app-shell.tsx      # Navigation shell with sidebar
│   ├── smtp-config.tsx    # SMTP server management
│   ├── sender-section.tsx # Sender profile management
│   ├── email-list-section.tsx # Contact list management
│   ├── newsletter-editor.tsx  # Block-based email editor
│   ├── send-campaign.tsx  # Campaign sending interface
│   ├── backup-section.tsx # Data backup and restore
│   └── ui/                # Reusable UI primitives (shadcn/ui)
└── lib/
    ├── db.ts              # Dexie database schema and types
    ├── email-builder.ts   # HTML email template builder
    ├── validations.ts     # Zod schemas for API validation
    └── utils.ts           # Utility functions
```

## How It Works

1. **Configure** an SMTP server (host, port, credentials) and test the connection
2. **Create** a sender profile linked to an SMTP configuration
3. **Build** email lists and add contacts manually or via CSV import
4. **Compose** an email campaign using the block editor with live preview
5. **Send** the campaign to one or more lists, with real-time delivery tracking

All data stays in your browser's IndexedDB. Use the Backup section to export/import your data as JSON.

## Changelog

See [changelog.yaml](changelog.yaml) for a detailed list of changes between versions.

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'feat: add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

This project is licensed under the [MIT License](LICENSE).
