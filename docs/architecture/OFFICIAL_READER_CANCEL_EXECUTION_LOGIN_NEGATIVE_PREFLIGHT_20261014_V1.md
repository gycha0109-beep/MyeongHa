# D3e9 — Cancellation operations identity: deny-all login boundary & delegation feasibility

> 2026-10-14 · follows [D3e8 Draft #2073](https://github.com/gycha0109-beep/MyeongHa/pull/2073) · **OFFLINE / HOLD**.

## Finding: granting 1950 alone does not isolate signed review execution

The current `1930` `internal_private_cancel_review_v1` (D3e6) and `1950` `internal_private_cancel_commit_review_approval_v1` (D3e8) are both `SECURITY INVOKER`. The second calls the first and needs access to the temporary inbox/review and signed-approval receipt tables.

This creates a structural trade-off:

| Delegation choice | Result |
| --- | --- |
| Grant a non-owner login only D3e8 `EXECUTE` | Not a complete delegated path: the function runs with invoker privileges, and the caller lacks the tables/D3e6 required downstream |
| Also grant the login D3e6 and backing table access | D3e6 can now be called directly **without Ed25519 checks**, bypassing the signed D3e8 preflight |
| Use a non-owner login with **zero** direct payment-review/work/outbox privileges | Verified deny-all login candidate; **not yet an operational worker** |
| Call as a DB owner from isolated tests | Works for the sandbox fixture; the owner can bypass both D3e8 and the TS verifier, so it is not production-grade separation |

**Do not provision the login by granting the D3e8 SQL function under the present architecture.** A trusted, narrowly owned entrypoint with a securely bound identity verifier is required first. A `SECURITY DEFINER` wrapper that merely accepts a caller-supplied digest, key IDs or `approved=true` would **not** solve this problem; it would introduce a public authorization bypass. Production DB owner and superuser powers themselves are not made non-bypassable by these controls.

## Implemented, but intentionally NOT enabled

- `PRIVATE_CANCEL_EXECUTION_LOGIN_PREFLIGHT_SQL_V1` is an exact SQL catalog query embedded in TypeScript, evaluated under the **actual login session identity**, checking effective identity, role membership, `NOINHERIT`, superuser/`BYPASSRLS`/role-creation privileges, public schema `CREATE`, and private review, inbox, worker and alert grants.
- `validatePrivateCancelExecutionLoginPreflightV1` accepts only a named disposable D3e9 test login with **zero direct SQL execution/DDL/CRUD powers**. This outputs `effectAuthorized=false`, `directReviewAuthorized=false` and `signedReviewAuthorized=false`. It does not grant or authorize any action.
- `test/db/official_reader_d3e9_cancel_execution_login_preflight.sh` creates two **ephemeral PostgreSQL test roles** in an isolated CI database, uses `SET SESSION AUTHORIZATION`, extracts the *exact* TypeScript SQL constant, and runs the live JSON through the exact TypeScript validator. It tests real SQL denial for D3e6/D3e8, detects temporary overgrants and extra membership, tests `INHERIT`/`BYPASSRLS`/`CREATEDB`, verifies privilege restoration and drops its roles afterward.
- Unit tests deny malformed catalog shapes, missing/null/coerced permission fields, same-role impersonation and any hidden operational authority. No private keys, login credentials, merchant secrets, customer identifiers, payment state or entitlement mutation are used.
- **No schema migration, production roles, production ACL changes, Security Definer writers, live OAuth/OIDC integration, HTTP route, cron, sender or retention deletion.** Catalog drift snapshot stays unchanged.

## Next mandatory gates

1. **Identity provider and key ownership.** Independently identify two human operators, map their current roles and key custody to trusted registry IDs, bind ticket authority and expiry; handle resignations, revocations and admin override.
2. **Trusted execution architecture.** Separate verifier and DB executor identities; implement a narrow anti-bypass entrypoint where untrusted input cannot forge cryptographic sign-off or replay claims. Formal threat model and database security review mandatory.
3. **Least-privilege runtime test.** Once approved, provision a dedicated non-owner execution identity only on disposable PG first; test `SET SESSION AUTHORIZATION`/role memberships/direct D3e6 denial, and full signed success within the same race/atomicity protocol. D3e9 is a negative baseline, not that success test.
4. **Privacy & operations.** Retention, account deletion, restore reconciliation, alert destinations, audit pseudonyms, evidence classification and independent Legal/Privacy/Ops approval.
5. **Final release.** No LIVE merchant or refund/entitlement production effects without canonical Commerce authority and explicit go-live approvals.

**Status:** a preflight that **detects unsafe grants and proves the currently delegated SQL path is not sufficient**. It does not claim production-ready two-person control.
