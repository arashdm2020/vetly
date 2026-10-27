# Independent announcements module

## Official research (27 October 2026)

Support confirmed account-level free-text access using permitted public lines, with moderation of each text. The matching official API is **IranPayamak**, not a substituted IPPanel API:

- https://docs.farazsms.com/service/post-ws-v1-sms-simple
- https://docs.farazsms.com/service/get-ws-v1-send_request-send_request_id
- https://docs.farazsms.com/service/get-ws-v1-send_request-send_request_id-items
- https://docs.farazsms.com/service/get-ws-v1-lines-accessible
- https://docs.farazsms.com/download/openapi.json

`POST https://api.iranpayamak.com/ws/v1/sms/simple` uses `Api-Key`, `text`, `line_number`, `recipients`, and `number_format`. The documented 201 success envelope has `status: success` and numeric `data` (send request ID). This is acceptance into a moderated queue, not delivery or approval. No approval workaround or direct OTP/pattern fallback is used. Sender lines are retrieved server-side from `GET /ws/v1/lines/accessible` using the saved API key. Announcements displays a dropdown, auto-selects a sole line, requires explicit selection among multiple lines and handles empty/error responses with a refresh control. Queue creation revalidates the selected line against the current account listing. No pattern sender is silently reused.

The official report OpenAPI currently references the unrelated phonebook response schema. The report adapter conservatively recognizes `data.status` from a fixed allowlist, and paged `data.items` with a normalized `recipient` and documented delivery `status`. Unknown shapes remain unconfirmed and show a panel-check notice. These field shapes must be verified on a real authorized send before claiming full account-specific report compatibility. No live campaign was sent during development. Blacklist eligibility depends on the selected authorized line and provider policy; it is not inferred from a number prefix.

## User flow

The separate `/announcements` menu item appears immediately **before Settings**, including mobile navigation. The operator writes an internal title and free text, selects an account-permitted sender, selects all owners/cat owners/dog owners/selected patient owners, and/or adds manual phone lines (`name, phone` or just phone). Normalized numbers are deduplicated across all sources. Names and recipient phones are frozen with the campaign. A consent checkbox and native confirmation dialog show the exact text and final numbers before any queued send.

Initial application limit: 200 unique recipients and 1600 text characters per campaign; these are application bounds, not claims about provider quotas. History is paginated 20 rows per page. Reports show provider request ID, last known request status, each recipient's status, known delivered count and last report-attempt time. Refreshing is an authenticated GET-only provider operation, not a resend. Unsupported report data never counts as delivered. A queued campaign can be cancelled before the worker claims it. Manual numbers are retained in each campaign report, not turned into patient/owner records or a separate reusable contacts address book.

## Durable execution and safety

Two additive tables keep campaigns and their recipient snapshots separate from clinical data. Queue creation is one libSQL write batch; per-request UUID, payload fingerprint and a 60-second persistent cooldown prevent duplicate submits. A recipient hash binds confirmation to the resolved audience; changed audiences require a fresh preview. Server endpoints enforce clinic authentication, exact Origin for POST, strict input/body bounds and no caching. Keys are read/decrypted only server-side from the existing Faraz configuration.

The existing authenticated reminder scheduler processes **at most one announcement after each reminder batch**, with a separate compare-and-set claim. This shares the established worker invocation but does not insert reminders or change reminder timing/provider logic. Provider calls are bounded to eight seconds and never retried automatically. A timeout or crash after claim is unknown, not queued again. Claims older than ten minutes become unknown; no automatic recovery send is attempted. The scheduler normally runs approximately every five minutes but platform delays are possible. SMS disabled or a different active provider blocks campaign sending. Report refresh is limited to once per campaign per 30 seconds and fetches at most two pages of 100 recipients.

## Rollout

1. Review branch changes and run `npm ci`, lint, typecheck, tests, configuration guards and production build.
2. **Apply migration `0005_sparkling_wiccan.sql` using the existing credentialed migration procedure before making the feature available.** No production migration is automatically run by build, page load or this task.
3. Deploy through the existing GitHub-to-Vercel workflow when authorized. No new required environment variables, third-party services or secrets are introduced. The existing scheduler must be active on main.
4. Confirm an allowed sender in the Faraz account. Only after explicit operator confirmation, run one small real campaign and verify returned report shapes against the panel. No paid test or campaign is sent by CI/deployment.

Build success and mocked tests do not establish provider account permissions, real moderation/delivery, or real-device visual verification. Preview still needs a separate nonproduction database and the existing auth/encryption configuration. Never connect Preview to the production database for UI testing.

## Account sender discovery

The authenticated `/api/announcements/lines` endpoint returns only normalized sender numbers and a dedicated/public boolean when the provider supplies one. It does not expose keys, raw provider fields or error descriptions. No paid send is performed by listing or refreshing lines. Recognized response containers are `data`, `data.items` or `data.lines`; line fields are `line_number` or `number` (or explicit string entries). Unrecognized/partially malformed lists fail closed instead of interpreting IDs as lines. Public-line labeling is not a claim of blacklist bypass or account-specific free-text authorization. No database migration is needed for this follow-up.
