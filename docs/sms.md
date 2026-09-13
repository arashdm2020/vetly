# SMS configuration and delivery

The settings screen supports separate vaccine and task patterns, provider selection (Kavenegar, SMS.ir, disabled mock), key rotation, clinic details and vaccine reminder offsets.

Pattern text is a local reference/preview. Both real adapters send the approved provider pattern identifier and mapped parameters; the provider's approved template controls the actual text. Available variables are pet, date, clinic, phone and action. Medical diagnosis/treatment is never used in message variables.

Kavenegar parameter names are token, token2, token3, token10 and token20; token is required. Follow the provider's token length and whitespace rules, using token10/token20 for values that require spaces. SMS.ir parameter names must exactly match the approved panel template; its pattern identifier is numeric.

## Scheduling rules

- Settings save never sends a message.
- Newly created vaccine records schedule configured future offsets at 09:00 Asia/Tehran.
- Tasks use their selected date at 09:00 Asia/Tehran. A same-day task entered after 09:00 is due on the next worker invocation.
- Disabling SMS stops subsequent worker sends. Records created while disabled remain excluded from SMS sending even if the global switch is enabled later.
- Changing reminder offsets only affects newly created vaccines.
- Pending messages use the provider and pattern configuration read by the worker. Do not rotate templates during active delivery processing.

## Reliability and status semantics

Each worker invocation processes at most five records. Atomic pending-to-processing updates allow only one competing worker to claim a reminder. A unique delivery idempotency key equals the reminder ID. This is an internal deduplication guard, not a claim that vendors provide exactly-once delivery.

The database sent status means the provider accepted the request and returned a message ID; it does not mean the handset received it. Mock results are never marked sent.

There is no automatic retry after rejected, unknown or interrupted sends. Unknown results, provider timeouts, and workers interrupted after claiming require operator investigation in the vendor panel and database before any manual recovery. Never blindly reset processing/failed reminders to pending. Reconcile pending delivery rows and stale processing claims before release operation.

Real requests use fixed HTTPS vendor endpoints, redirect rejection and an eight-second timeout. Provider response bodies, keys and recipients are not logged. Error descriptions returned to the app are safe fixed messages.

## Sources

- https://kavenegar.com/rest.html
- https://sms.ir/rest-api/
