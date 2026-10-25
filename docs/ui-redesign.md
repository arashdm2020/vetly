# Vetly workspace redesign

## Scope and review

This branch changes presentation and client interaction only. It does not modify the database schema/migrations, auth or session implementation, server actions, API routes, provider adapters, SMS mappings on the server, dispatch/scheduling, or settings persistence. It must be reviewed on `feature/ui-redesign`; do not merge or deploy production until review is complete.

The previous settings screen stacked unrelated controls into a single long form. The new screen provides five explicit categories: clinic identity, animal types, SMS service and manual test, approved pattern templates, and read-only reminder policy. General and administrative descriptions explain the controls without inventing new permissions. The desktop shell has an edge-aligned RTL sidebar; mobile retains five primary bottom navigation links. Dashboard, patient history and care cards use the same spacing, colors, labels and Lucide icon system. Appointment scheduling remains explicitly unavailable.

## Settings save contract

The server saves the entire settings object, not a patch. All categories therefore share one draft and one explicit **save all changes** action. Switching categories preserves edits and local field state. Failed saves retain the draft. An incoming context snapshot cannot silently replace dirty edits: saving is blocked and an explicit reload confirmation discards the local draft. Successful saves adopt the server's normalized snapshot. Leaving by app links or logout prompts before discarding edits; browser unload uses the native browser warning.

This client guard only detects snapshots observed by the current page. It does not implement server-side compare-and-swap or detect unobserved changes from a separate browser/session. Browser back/forward remains subject to the framework and browser lifecycle. No backend concurrency guarantees were added.

Template edits preserve parameter names and case exactly as entered. Deletion requires confirmation. Preview values are explicitly samples, and the displayed reference text does not replace the provider's approved template. The live SMS test uses only saved settings and the existing authenticated endpoint. It requires a valid recipient, complete sample values and explicit confirmation; unsaved settings block the test. No key is read into the browser, no request runs when saving or switching categories, and transport uncertainty never causes automatic retries.

## Validation

- `npm ci`: passed (450 packages).
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: 21 backend/integration tests passed, mocked HTTP only.
- `npm run test:config`: passed.
- `npm run test:ui`: 6 DOM interaction tests passed.
- `npm run build`: passed.

The UI tests cover draft preservation, whole-object payloads, failed/successful save feedback, incoming-snapshot conflicts, navigation/logout confirmations, confirmed-only SMS requests without secrets or retries, exact-case mappings, confirmed deletion, RTL keyboard tabs and invalid-form blocking. `jsdom` is a development-only dependency. Native dialog modal/focus behavior is polyfilled in these tests and still requires a real-browser check.

CSS includes layouts for 320, 375, 390, 768, 1024 and 1440px widths; minimum 44px primary controls, focus-visible outlines, RTL labels/bidi-safe numbers, reduced motion and safe-area mobile navigation. **Visual/real-browser verification at these widths is not complete:** the connected browser could not reach the local development server, and browser operations later timed out. Do not treat the DOM tests or successful build as visual, screen-reader, focus-trap, or full end-to-end certification.

## Safe local review

Use a disposable local database and test-only credentials. `scripts/prepare-ui-preview.mjs` refuses remote URLs and Vercel and only seeds an empty `/tmp/vetly-ui-*` database with clearly named sample records. SMS is disabled and it never calls an adapter. Example after installing dependencies:

```sh
TURSO_DATABASE_URL=file:/tmp/vetly-ui-review.db node --conditions=react-server --import ./scripts/register-tests.mjs scripts/prepare-ui-preview.mjs
```

Run the existing dev server against that database with local-only clinic/session/encryption values; do not reuse production secrets. Manually review all five settings categories, template variants, unsaved guards, failed save, search/empty states, patient registration and all three record forms, completion confirmation, calendar, login and keyboard navigation at every requested viewport. Do not confirm any real SMS test during UI review.

## Vercel considerations

The existing GitHub integration may create a Preview deployment for this branch/PR. No production deployment or merge is part of this change. No new required environment variables are introduced. Preview runtime needs a dedicated nonproduction database and the existing required auth/encryption configuration; a successful build alone does not demonstrate runtime DB availability. Production-only Turso configuration is not automatically available in Preview. Do not copy production database credentials into Preview for UI testing. This branch does not run the production reminder worker or create new cron jobs.
