# M1-07 — Read-only private recovery preflight; D2 runtime writer remains blocked

> 2026-10-16 · Track `commerce` · Draft-only / no runtime issuer, DB grants or public Reader disclosure

## Security constraint discovered in CI

The existing DB Authority Core has a **hard repository policy**: the TypeScript `apps/api/src` tree must not reference or invoke dormant private Official Reader Writer SQL functions. The initial M1-07 implementation attempted to invoke D2 issue/bind directly inside an API TypeScript module. The `Reader Writer inventory` security test correctly FAILED. We did **not** weaken, bypass or allowlist the guard.

The corrected implementation keeps the app-side boundary strictly **read-only**. Its only result is HOLD, regardless of whether previous private purchase authority is complete. It never returns purchased output, grants access, or executes D2.

## Executable source validation

`apps/api/src/official-reader-private-replay-recovery-v1.ts` exposes `preflightAlreadyBoundOfficialReaderReceiptV1`. It receives only a verified Receipt UUID and an injected DB transaction port, without resolving any Credential/Worker/Role.

Inside one read-only query the module checks for:

- exact `1050` verified production Receipt and verified matching Purchase Intent;
- pinned Capability Set definition/snapshot;
- **exactly one** supported Capability Item in this isolated Standard Reader slice;
- an active purchased Grant under that Receipt, plus its committed original `granted` Event;
- the original event's effect time, validity interval and reason;
- purchase-backed Reader Access tied to the same Grant and the same Official Reading;
- the original canonical binder request hash and expected contract version.

An absent/ambiguous/revoked/unbound/unissued item returns `{status:'held',reason:'UNFULFILLED_OR_UNAUTHORIZED',publicDisclosureAuthorized:false}`.

A fully valid already-bound result returns `{status:'held',reason:'PRIVATE_WRITER_NOT_AUTHORIZED',publicDisclosureAuthorized:false}`.

The `transaction` parameter is an **interface**, not a privileged identity, executable credential, login, authority to grant rights, or proof of production API reachability. Its implementation must eventually be owned by the reviewed private issuer/DB team. This module does not wire it to an endpoint or to `commerce-provider-payment-completion-orchestration.ts`.

## Validation

- `apps/api/src/official-reader-private-replay-recovery-v1.test.ts`: verifies that only one read query is executed, all paths HOLD, unknown/unbound/duplicate/incomplete lineage is refused, invalid input never opens a transaction, and source-read failures require rollback.
- `test/db/official_reader_m1_07_private_replay_source_sql.sh`: extracts the **literal query in the TypeScript module** and executes it against the PostgreSQL 15 fixture containing an actual `1050` verified Receipt, original D2 Grant/Event and bound Reader. An unknown Receipt returns zero authority.
- Prior M1-03 and M1-06 **isolated DB-only** tests (not runtime TypeScript calls) prove atomic private owner issue/bind and original-event semantic replay. Their evidence must not be construed as a runtime issuer.
- The `Reader Writer inventory` db-authority-core guard must stay PASS, specifically by seeing **zero** private runtime writer references. No rules changes or exceptions are permitted.

## Remaining source of authority

The real first-issue implementation still requires Owner review of a private credential/caller and transitive `SECURITY INVOKER` dependencies; one transaction for D2 issue/bind; the `1090` first validity anchor and provider-expiry policy; pinned Product/Reader selection and Charge Terms; operation/rollback readiness. Saju production T8 relationship interpretation remains NO_BUILD. Actual purchase, entitlement issuance, Data API/role cutover, webhook activation, paid T2 and PR merge stay HOLD.

No migrations, SQL ACL mutations, credentials, live provider calls, deployment or production activation are included.