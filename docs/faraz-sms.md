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
