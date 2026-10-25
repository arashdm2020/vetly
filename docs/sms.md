# SMS configuration and delivery

The settings screen supports separate vaccine and task patterns, provider selection (Kavenegar, SMS.ir, disabled mock), key rotation, clinic details and the two-stage notification policy.

Pattern text is a local reference/preview. Both real adapters send the approved provider pattern identifier and mapped parameters; the provider's approved template controls the actual text. Available variables are pet, date, clinic, phone and action. Medical diagnosis/treatment is never used in message variables.

Kavenegar parameter names are token, token2, token3, token10 and token20; token is required. Follow the provider's token length and whitespace rules, using token10/token20 for values that require spaces. SMS.ir parameter names must exactly match the approved panel template; its pattern identifier is numeric.

## Scheduling rules (new records)

All calculations use Asia/Tehran. Future vaccine dates, tasks and optional visit
follow-ups have a persisted event deadline (`due_at`), separate from notification
execution time (`scheduled_at`). An optional HH:mm input chooses the deadline's
clock; if omitted, it inherits the registration clock on the chosen calendar date.
Same-day deadlines must still be in the future.

1. After the medical record and its queue row commit, send one initial notification.
2. Create exactly one future notification: more than 24 hours away → 24 hours before;
   more than 3 but at most 24 hours → 3 hours before; at most 3 hours → at the deadline.

Example: register Sunday 14:00 for Monday with no explicit time → initial send
Sunday 14:00 and second send Monday 11:00. Boundary decisions use server registration
time, not the time the scheduler eventually executes. A visit without a future
follow-up deadline has only the initial message; no second deadline is invented.
Vaccine records use vaccinePattern, visits/tasks use taskPattern, with the event's
actual date and clock in the date variable. No diagnosis/treatment is included.

- Settings saves and deployments never initiate a send.
- Old offsets remain readable for compatibility, but the old 7/1/0-day UI is replaced
  by the fixed policy for new records. Existing queue rows are not rewritten or replayed.
- Disabling SMS stops worker sends. Records created while disabled retain cancelled
  future notifications and do not acquire sends retroactively when enabled later.
- Completing a task or visit follow-up cancels its pending second notification.
- If a new event is over 10 minutes past its deadline when a worker claims it, cancel
  the late notification instead of sending obsolete reminders. This gives imminent
  appointments a small scheduler tolerance. Legacy rows (no due_at) keep prior behavior.
- This models two send attempts, not guaranteed delivery. Provider rejection/uncertainty
  must never be represented as delivery success or retried blindly.

## Scheduler and safe rollout

Apply migration `0004_foamy_kingpin.sql` **before deploying this code**. It only adds
nullable `due_at` and `visit_id` columns; legacy data and statuses remain intact.
Do not run schema pushes or migrations automatically during the Vercel build.

The existing authenticated endpoint remains `/api/internal/reminders/process`.
For Vercel Hobby, a once-daily Vercel Cron cannot meet clock-based notifications.
The provided Actions workflow schedules best-effort polling every five minutes;
GitHub may delay or suspend scheduled jobs, so this is **not a precise timing SLA**.
For strict timing/availability, use a monitored external scheduler or Vercel Pro Cron.
The persisted queue is the source of truth; provider timeouts are never retried.

The Actions workflow now uses GitHub OIDC, not a copied long-lived secret. The worker
verifies GitHub's RS256 signature against its fixed JWKS URL and requires the exact
audience, repository name and immutable repository/owner IDs, main ref, scheduler
workflow path, GitHub-hosted runner, and schedule/workflow_dispatch event. Token
expiry, not-before and maximum age are checked using jose. The existing CRON_SECRET
path is preserved for other schedulers and no production credential is changed.

Deployment order:
1. Apply migration 0004, then merge/deploy.
2. The workflow on the default branch polls automatically every five minutes. No
   repository secret, repository variable or new runtime environment variable is needed.
3. Review pending legacy reminders: polling can send already-due legacy rows. No
   failed/unknown/cancelled row is automatically reset or initial message backfilled.
4. Manual workflow dispatch defaults to dry_run=true. The authenticated dry-run route
   checks access without reading or processing the SMS queue. Schedule events process
   the queue normally. Workflow execution logs contain only aggregate counts.
5. Verify WORKER_URL matches the production primary domain and does not redirect to
   Vercel protection. Inspect the first scheduled run for runtime verification.

The workflow runs on schedule or explicit manual dispatch, never on push, PR, CI or
build. No third-party action or checkout is used. Short-lived tokens are held only
in a private temporary header file, not logged or put in command arguments. HTTP
requests never follow redirects or retry automatically. Disable the workflow to
pause this polling source; disabling SMS in clinic settings also prevents sends.

## Reliability and status semantics

Each worker invocation processes at most five records. Atomic pending-to-processing updates allow only one competing worker to claim a reminder. A unique second-stage delivery idempotency key equals the reminder ID. Initial messages use record:{kind}:{recordId}:created; a duplicate claim cannot send again. This is an internal deduplication guard, not a claim that vendors provide exactly-once delivery.

The database sent status means the provider accepted the request and returned a message ID; it does not mean the handset received it. Mock results are never marked sent.

There is no automatic retry after rejected, unknown or interrupted sends. Unknown results, provider timeouts, and workers interrupted after claiming require operator investigation in the vendor panel and database before any manual recovery. Never blindly reset processing/failed reminders to pending. Reconcile pending delivery rows and stale processing claims before release operation.

Real requests use fixed HTTPS vendor endpoints, redirect rejection and an eight-second timeout. Provider response bodies, keys and recipients are not logged. Error descriptions returned to the app are safe fixed messages.

## Sources

- https://kavenegar.com/rest.html
- https://sms.ir/rest-api/
