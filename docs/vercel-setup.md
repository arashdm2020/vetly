# Vercel + Turso deployment

Repository: https://github.com/arashdm2020/vetly

1. Import the repository into Vercel as a Next.js project. Use Node 24.x, repository root, npm ci, npm run build and default output settings.
2. Connect Turso Cloud through Vercel Marketplace. Use separate preview and production databases. Select the provider plan and region yourself.
3. Configure server-only environment variables before admitting clinic data:

| Variable | Requirement |
| --- | --- |
| TURSO_DATABASE_URL | Remote libsql:// or https:// URL supplied by Turso |
| TURSO_AUTH_TOKEN | Database credential supplied by Turso |
| CLINIC_PASSWORD | Strong shared clinic password, at least 16 characters |
| SESSION_SECRET | Independent random session signing secret, at least 32 characters |
| SETTINGS_ENCRYPTION_KEY | Exactly 64 random hexadecimal characters; keep stable and backed up |
| CRON_SECRET | Independent random secret, at least 32 characters |

Keep credentials out of Git, chat and logs. Do not prefix any of these variables with NEXT_PUBLIC_. Never reuse example/test secrets. Changing CLINIC_PASSWORD or SESSION_SECRET invalidates active sessions. Changing the encryption key makes existing saved SMS keys unreadable.

4. Before the first deployment, run the committed migrations against the intended database from a trusted operator environment:

```sh
node node_modules/drizzle-kit/bin.cjs migrate --config=drizzle.migrate.config.ts
```

This command reads environment variables already set in that process. For local development, npm run db:migrate explicitly loads .env.local. Never run migrations in the Vercel build command. Review generated SQL before future migrations; back up an existing production database first.

5. Open the app, log in, and set clinic name/phone in Settings. Select Kavenegar or SMS.ir, enter the API key, and configure approved pattern identifiers and their exact parameter names.
6. Set up a scheduler only after testing the selected provider and approving real delivery. Invoke GET or POST /api/internal/reminders/process with Authorization: Bearer <CRON_SECRET>. Each invocation handles at most five due records. Select frequency for clinic volume and Vercel plan; no cron schedule is automatically enabled by this repository.
7. Verify persistent records, login/logout, permissions, database backups/restore and a user-authorized live SMS test before clinical rollout.

Missing authentication variables show a setup page rather than exposing records. Missing database connectivity shows a safe error state. A successful build does not verify remote credentials or SMS delivery.

## References

- https://vercel.com/marketplace/tursocloud
- https://vercel.com/kb/guide/is-sqlite-supported-in-vercel
- https://vercel.com/docs/cron-jobs/manage-cron-jobs
- https://orm.drizzle.team/docs/tutorials/drizzle-with-turso
