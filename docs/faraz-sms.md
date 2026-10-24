# Faraz SMS

Implementation follows the current Faraz documentation, not the legacy IPPanel API:

- https://docs.farazsms.com/
- https://docs.farazsms.com/service/post-ws-v1-sms-pattern
- https://docs.farazsms.com/download/openapi.json

Endpoint: `POST https://api.iranpayamak.com/ws/v1/sms/pattern`.
Authentication: `Api-Key` header. Body: `code`, `recipient`, `line_number`, `number_format`, and `attributes`.
The OpenAPI request example uses an attributes object although its schema describes an array; the adapter follows the explicit request example (name/value mapping).
Successful responses contain `status: "success"` and a numeric `data` message ID. This means provider acceptance, not confirmed delivery.

Select Faraz in clinic settings. Enter the new API key, permitted sender line, approved pattern codes, and exact case-sensitive parameter names. Keys are encrypted separately under `sms-key:faraz`. Do not use legacy IPPanel credentials with this endpoint.

Registration, vaccination and task notifications all use this adapter. Changing provider disables sending until explicitly re-enabled. No messages are sent by saving settings. Existing settings load with an empty sender default; enabling Faraz requires a sender. No schema migration or additional dependency is required by this integration.

Tests use fake HTTP responses only. Network failures, non-2xx responses, and malformed responses remain unknown and are not automatically retried. Verify real delivery to a clinic-controlled number after template approval, before enabling patient sends.

## Optional sender and controlled live test (2026-10-24)

Sender is now optional. A nonempty sender still requires 1–20 digits and is sent as
`line_number`; an empty sender omits the property entirely. No fallback line is supplied.
This supersedes the sender requirement above.

Official documentation checked before implementation:
- https://docs.iranpayamak.com/send-pattern-based-sms-13925177e0
- https://docs.iranpayamak.com/patternsendrequestdto-5191122d0

Both show `line_number`, but the accessible documentation does not explicitly establish
whether omission is accepted. The legacy docs.farazsms.com OpenAPI download could not
be retrieved. Shared/default sender support remains experimental, not guaranteed.
A provider rejection must be respected; configure a permitted dedicated sender if required.

Save settings and the encrypted API key first. The Faraz-only “ارسال پیامک آزمایشی”
section sends one real paid SMS to the entered mobile, using one saved pattern and
explicit sample variable values. A configured pattern is not proof of provider approval.
Only a button click invokes POST /api/settings/sms-test; saving, CI and deployment do not.
Acceptance means provider acceptance, never confirmed delivery. Unknown results require
checking the provider panel before a new manual attempt. There are no automatic retries.

Authorization uses the existing single clinic administrator password/session (there are
no separate user roles in this app). The development authentication bypass cannot send
live tests. Requests require a same-origin Origin header. A durable clinic-wide rolling
60-second cooldown and permanent request UUID claims use existing settings/sms_deliveries
tables, including across Vercel instances. Test delivery rows have no patient/reminder IDs.
No schema migration, new dependency or environment variable is required. Existing keys
and provider integrations are preserved. Provider response bodies are not returned raw:
only status, message ID, HTTP status and safe numeric error codes / mapped descriptions.

Merge through the existing GitHub-to-Vercel workflow after review. Use the existing Node
24 and Turso/encryption/session configuration. After deployment, save the desired Faraz
settings, manually test to a clinic-controlled number and inspect the result/provider panel.
Saving enabled settings enables ordinary patient/reminder SMS as before; perform initial
testing when no patient registrations or due reminder jobs are expected.
