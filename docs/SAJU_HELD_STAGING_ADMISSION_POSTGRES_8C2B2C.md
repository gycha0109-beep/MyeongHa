# 8C-2B-2C — isolated MyeongHa operator admission PostgreSQL port (code only)

Watchtower-Track: saju-bridge

## Scope

The server-only `createSajuHeldStagingPostgresAdmissionPortV1` is an inert implementation of the existing `StagingOperatorAdmissionPortV1`. It may be explicitly injected into the pre-existing 8C-2B-1A runner **only after** an independently governed staging operator approval, trusted target authority, and all deployment gates are satisfied. No route, worker, deployment, environment fallback, DB schema migration or production entrypoint is changed.

1. Input permit metadata must satisfy the 8C-2B-2A strict contract and bind a distinct, independently reviewed non-production target Manifest (digest, MyeongHa SHA, Saju SHA, environment, operator).
2. A separately trusted Ed25519 **public** key and approval key ID must verify a detached canonical signature over `myeongha/saju/staging-admission/permit/v1\\0` followed by the JSON encoding of permit values in `SAJU_HELD_STAGING_ADMISSION_PERMIT_KEYS_V1` order. No signing or permit issuance API is provided.
3. After signature and local clock checks, the adapter opens **only the dedicated admission pool**, enters `SET LOCAL ROLE myeongha_saju_staging_admission_runtime`, and conditionally updates exactly one persistent permit row. The SQL rechecks target/versions/operator/key/status/issued/expires against the PostgreSQL statement timestamp, atomically marks the permit consumed and returns its ID. Zero/mismatched/multiple rows, SQL/role/connection/commit failure -> `false`; no retry.
4. Once attempted, an adapter instance cannot issue another DB claim. This is defense in depth; actual cross-replica exclusion requires the reviewed persistent table, unique permit key, restricted role and database transaction semantics. A DB commit failure may be ambiguous and **must not** be auto-retried.
5. The only runtime output is a boolean; the rehearsal runner retains `TRANSPORT_HELD_ONLY`/blocked with `sourceAuthority=NOT_EVALUATED`, `releaseAuthorization=NOT_EVALUATED`, `canExecute=false`, `canPublish=false`, `canSell=false`.

## External DB Authority / Operations HOLD

**This change creates NO staging DB schema or roles and applies NO GRANT.** The conditional SQL refers to `public.saju_staging_operator_admission_permits`, which must be independently provisioned in a separately approved isolated staging DB. DB Authority must review exact column types (permit_id uuid; digest/SHA/environment/operator/key text; issued_at_ms, expires_at_ms, consumed_at_ms bigint; status), primary key, RLS FORCE, immutable approved inserts, privilege revocations for `PUBLIC`, `anon`, `authenticated`, `service_role`, `myeongha_api_executor`, and direct application-login roles; admission runtime role must have only narrowly scoped UPDATE/SELECT needed for conditional consumption, with **no INSERT or DELETE**. Separate issuer/approver principal must own permit issuance; a runtime principal must never mint or approve its own row. Deployment DB login role membership, cluster/TLS identity and trust-key custody require independent verification.

The adapter is dormant until the following authorities are independently evidenced: approved staging Auth project (not the production project), verified Member-only disposable current Birth fixture, separate Subject/nonce/admission PostgreSQL credentials and TLS, protected Saju Proof HTTPS issuer deployment, service bearer and HMAC custody, operator signing approval & Ed25519 public-key distribution, shared one-shot table atomicity tests against a real staging DB, approved rollback and change record. **Do not equate synthetic concurrent fakes with a real PostgreSQL isolation proof.**

No real staging proof request has been sent. Neither staging execution nor Source/Release/Product/Character/Commerce authority is granted. Explicit operator and DB approvals are still required for actual provisioning and 8C-2B-2D execution.

```text
stagingAdmission = HOLD
stagingConnection = NOT_VERIFIED
sourceAuthority = NOT_EVALUATED
releaseAuthorization = NOT_EVALUATED
canExecute = false
canPublish = false
canSell = false
```
