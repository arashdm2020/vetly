# Implementation status

The earlier in-memory preview has been replaced with database-backed server operations.
See production-readiness.md for current verification and remaining deployment work.
The app no longer displays preview badges or claims refresh destroys saved data.

The default local .env.local created during development points to an ignored local SQLite file. No remote database credentials or SMS API keys have been committed. Clinic UI and API access in a deployed environment require authentication configuration.
