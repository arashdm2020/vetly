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

## Manual diagnostic test and shared line

An empty sender uses `line_number: "90008361"` as confirmed by Faraz support;
a configured dedicated sender overrides it. The sender requirement described above
is superseded by this behavior. The property is never omitted.

The settings page includes a Faraz-only manual test section using saved settings
and encrypted credentials. Select a saved pattern, enter a clinic-controlled mobile
and sample values, and explicitly click the send button. Save does not send SMS.
Results distinguish provider acceptance (not confirmed handset delivery), rejection
with safe HTTP/field diagnostics, and uncertainty. Raw responses/keys are never exposed.

The endpoint requires the existing clinic administrator session and same-origin
request; development auth bypass cannot send. Persistent settings cooldown and unique
sms_deliveries claims prevent concurrent sends/replays across Vercel instances. There
are no automatic retries. Test rows have no patient/reminder links. No migrations or
new environment variables are required. All automated requests are mocked.

Operational triggers: registration SMS applies to newly created patients when enabled
and registrationPattern.code is configured; saving settings does not backfill old
patients. Reminders require an external scheduler calling the protected process route.
The repository does not currently declare a Vercel Cron schedule; an externally
configured scheduler cannot be inferred from source alone.
