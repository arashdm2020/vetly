# Vetly

A small Persian veterinary clinic application built with the official Next.js and shadcn CLIs.

## Stack

Next.js App Router, React, TypeScript, Tailwind, Drizzle, SQLite/libSQL, Turso on Vercel. Node 24.x and npm. Persian RTL UI with Vazirmatn.

## Local development

```sh
npm ci
```

Copy .env.example to .env.local. The default file database is local development only.

```sh
npm run db:migrate
npm run dev
```

Local development without CLINIC_PASSWORD bypasses clinic login. Never expose the development server publicly. Deployed environments require the authentication variables below and a remote database.

## Implemented

- Transactional owner/pet creation, search, persistent profiles and medical history.
- Server-assigned visit dates, vaccines and scheduled task reminders.
- Editable clinic settings, SMS provider/key changes and separate vaccine/task patterns with parameter mappings.
- Kavenegar and SMS.ir pattern adapters, encrypted API keys, secret-protected reminder processing.
- Shared clinic password login with signed eight-hour HttpOnly sessions and a database-backed attempt limit.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run test:config
npm run build
```

Tests use disposable local databases and stub SMS requests. No test sends a real SMS.

See [Vercel setup](docs/vercel-setup.md), [release status](docs/production-readiness.md), and [SMS behavior](docs/sms.md) before deployment.
