# D3e10 — Detached dual approval verifier and sandbox execution permit

**Date:** 2026-10-14 · **Scope:** offline/Sandbox-only, after D3e9 PR #2075 · **Release:** HOLD / NO LIVE

## Problem

D3e8 verifies two Ed25519 operator signatures in a single process which then invokes the DB-owner-only `1950` function. D3e9 proved that simply granting an untrusted login `EXECUTE` on `1950` is not secure: the wrapper runs as `SECURITY INVOKER` and calls direct D3e6, so allowing its callee creates a direct unsigned bypass. The DB-owner itself remains privileged to invoke the legacy path.

D3e10 introduces a **separate cryptographically verifiable application-boundary permit**, tested without enabling any service or SQL grants. It does **not** make a DB-owner identity non-bypassable.

## Proposed trust graph

```text
[Two operator signatures; no runtime DB access]
               |
               v
[Offline verifier: pre-provisioned operator public keys]
  - Reuse strict D3e8 dual Ed25519 signature verification
  - Verify different registry principals and roles
  - Bounded sandbox claim/ticket/nonce/expiry
  - Issue a separate verifier-signed permit
  - Keep verifier private key OUT of executor
               |
  Ed25519 permit (valid max 60 s; original claim not extended)
               |
               v
[Offline executor: pinned verifier public key only]
  - Strict purpose, schema, signature, digest/IDs and TTL
  - Unknown/disabled verifier or any tamper => NO SQL
  - Invoke the EXISTING owner-only test store (1950)
  - DB 1950 performs one-use challenge and atomic D3e6 review
               |
               v
[Private temporary D3e6 + D3e8 audit; no refund/rights]
```

## Source and execution rules

- `verifyPrivateCancelDualSignaturesV1` is extracted from D3e8's previously verified implementation. The original `commitPrivateCancelDualApprovedReviewV1` now calls this **same verifier** and the shared `validatePrivateCancelReviewReceiptV1`, so direct D3e8 tests remain relevant.
- `issueSandboxPrivateCancelReviewPermitV1` accepts operator signing evidence, independently trusted operator public keys, an explicit verifier-service Ed25519 *private* key and `now`. The verifier's private key is not exported, logged or embedded in a permit.
- `executeSandboxPrivateCancelReviewPermitV1` accepts only a permit, an independently pinned public-key registry of trusted permit issuers, a clock, and a **test-only** `PrivateCancelReviewAuthorizedStoreV1`. The executor must have no verifier private key or human signing key. It checks the permit **before** any SQL call.
- The verifier's signed payload includes protocol version, Sandbox environment, issuer key ID, permit issue/expiry, exact inbox/action/ticket/challenge, both pseudonymous signer/key identities, human statement issue/expiry and D3e8 combined statement/signatures digest. Unknown fields, invalid base64, issuer substitution, changed actions or recipients, expired/replayed claims and wrong Ed25519 signatures fail closed.
- The permit lasts at most **60 seconds**, cannot outlive the original approval claim, cannot precede claim issuance, and never permits production. The DB `1950` remains the durable challenge replay fence: a cryptographic permit by itself is not a single-use database transaction.
- Signed digest records remain temporary/private and linked to temporary inbox deletion by `1950`. No raw user signatures are written or passed to the executor. Pseudonymous identifiers can still be personal data.

## Test coverage

`test/official-reader-portone-cancel-detached-permit-private-v1.test.ts` uses *ephemeral* independent Ed25519 operator and issuer keys to test both approved actions, exact signed command fields, one-minute deadline, all-field tamper, unknown/revoked/wrong-algorithm keys, extra fields, invalid base64, forged human proof, missing/invalid DB responses and no financial/entitlement authorizations. No external services or storage are used.

Existing D3e8 isolated DB tests retain nonce uniqueness and atomic record semantics. Existing D3e9 isolated role tests prohibit granting the non-owner login D3e6, D3e8, or private tables. No new SQL migration or additional runtime privileges are in D3e10.

## Non-bypassable release gates NOT satisfied

1. **Two actual humans:** pre-provisioned external identity provider/directory, independent organizational principals and hardware-backed key custody, explicit ticket ownership, privilege revocation, authentication freshness, separation-of-duties and verifier-key rotation/revocation.
2. **Operational process isolation:** executable verifier and executor as separate processes with distinct service identities, secret custody boundaries, authenticated transport/replay protection, intrusion audit and failure recovery. Modules alone are not a service isolation boundary.
3. **DB privilege isolation:** a strictly reviewed, owner-locked server-side entrypoint and proven non-owner execution capability that cannot bypass signed decisions or call D3e6 directly. **Do not introduce a SECURITY DEFINER accepting unverified caller-supplied `approved`, key IDs or digest.** A DB owner or superuser cannot be constrained by an application-layer permit.
4. **Financial/privacy release:** proper Commerce canonical cancellation authority, retention and deletion/backup reconciliation, Legal/Privacy/Security/Ops approval, and independent acceptance tests. No provider refunds, entitlement mutation, production GRANT, endpoint, background scheduler or real alert sending.

**Status:** application-layer cryptographic authority **prototype**, not operator SSO authorization or a production revocation service. All Draft PRs remain HOLD.
