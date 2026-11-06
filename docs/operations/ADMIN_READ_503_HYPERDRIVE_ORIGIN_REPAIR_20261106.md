# Admin Console 503 — Reader Hyperdrive origin correction (2026-11-06)

## Evidence, not inference
- At 2026-11-06 16:10 KST, the authenticated Owner users page showed `HTTP 503 / ADMIN_READ_UNAVAILABLE`.
- The production Admin audit table recorded `session:verify / allowed` and `read:overview`, `read:users`, `read:audit / failed`. Therefore the failing path was **post-authentication, DB-backed read**; no evidence of a Member/Owner sign-in failure on these specific requests.
- Reader and Audit Writer still had distinct `LOGIN`, `NOINHERIT`, `NOBYPASSRLS` roles and scoped column grants; live audit writes succeeded.
- Both Cloudflare Admin Hyperdrives pointed at Supabase **Supavisor transaction-mode pooler, port 6543**, while Hyperdrive itself performs transaction pooling. Official Cloudflare Supabase instructions prescribe direct origins instead: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/
- Supabase PostgreSQL logs for the Reader included `there is already a transaction in progress` and a later `unexpected EOF on client connection with an open transaction`. These are connection evidence, **not definitive proof** that double pooling caused every HTTP 503. The app currently suppresses detailed database errors.

## Applied production repair (Cloudflare API, 2026-11-06)
1. The dedicated `ADMIN_READ_HYPERDRIVE` origin was changed from the Supavisor transaction pooler to the project's direct PostgreSQL hostname on **port 5432**, with database user `myeongha_admin_reader`.
2. The dedicated `ADMIN_AUDIT_HYPERDRIVE` origin was likewise changed to direct PostgreSQL with user `myeongha_admin_audit_writer`.
3. Both updates were accepted by Cloudflare's Hyperdrive configuration API. Subsequent settings reads confirmed host, port, isolated roles, **TLS verify-full**, configured CA, and SQL caching disabled.
4. Cloudflare Worker production settings continue to show `MYEONGHA_ADMIN_PRIVATE_ENABLED=true` with all command/retention/analytics-retention flags false; command binding remains absent. Customer-facing `myeongha` Worker, DB roles/grants and payment state were not altered.
5. The GitHub Admin Hyperdrive origin preflight now rejects Supavisor/port 6543, preventing release checks from approving the double-pooling topology again.

## Outstanding acceptance (do not declare ROADMAP_COMPLETE)
- Validate a **fresh authenticated** `GET /api/admin/users` from the Owner UI and compare a resulting `read:users / allowed` production audit event. The current displayed 503 predates the origin correction and is not proof of post-repair behavior.
- If reads still fail, obtain request-correlated **safe categorical** diagnostics for DB connection / principal / SQL / projection phases; don't log URLs, credentials, JWTs, PII or SQL parameters.
- Re-run dedicated Admin readonly deployment verification only if the release implementation changes. The Hyperdrive origin was updated in place without redeploying the public Worker.
- No customer operations, refund/credit/account commands, or analytics retention changes are authorized.
