# Release status

## Implemented and locally verified

- Official Next.js and shadcn scaffolds.
- Persistent libSQL-backed owner/pet registration, profiles, medical visits, vaccinations and tasks.
- Drizzle CLI-generated eight-table migration, applied to the local development database and isolated test databases.
- Server-side validation and transactional owner/pet rollback.
- Editable clinic settings and separate vaccine/task SMS templates with provider parameter mapping.
- API keys encrypted with AES-256-GCM and excluded from client snapshots.
- Secret-protected worker, atomic reminder claims, persistent attempts and SMS outcome records.
- Login protection for deployed clinic pages and all mutation actions. Production setup fails closed if authentication configuration is missing.
- Dark RTL UI, Vazirmatn and Jalali date selection. Root-only hydration warning suppression tolerates injected browser-extension attributes.

## Deployment-dependent or remaining

- No Vercel deployment or remote Turso connection has been performed by the agent.
- No real SMS has been sent or its delivery confirmed. Provider request/response behavior was tested with stubs.
- No automatic cron schedule is enabled; it must be selected for the deployed plan and clinic volume.
- Appointment scheduling remains an explicit unavailable screen.
- Shared-password clinic access is intentionally minimal; no per-staff roles or owner accounts.
- Ambiguous or interrupted SMS attempts require operator reconciliation. They are not automatically retried.
- Backup retention and restore validation must be completed on the selected Turso service before using real clinical data.
- The initial small-clinic UI loads its patient/history snapshot on the server; pagination is a future scalability task.

## Quality gates

Run npm run lint, npm run typecheck, npm test, npm run test:config, and npm run build.
Integration tests cover transaction rollback, persistence, visit date enforcement, encryption, provider payloads, atomic concurrent claims and uncertainty handling. Temporary fixtures contain only test data and remain outside the repository for inspection.
