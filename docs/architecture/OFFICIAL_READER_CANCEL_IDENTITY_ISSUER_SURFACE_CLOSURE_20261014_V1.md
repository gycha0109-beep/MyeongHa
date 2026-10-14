# D3e13 — Remove identity-unbound permit issuance from application execution surface

**Date:** 2026-10-14 · **Parent:** [D3e12 Draft #2081](https://github.com/gycha0109-beep/MyeongHa/pull/2081) · **Status:** offline/Sandbox-only, Draft/HOLD.

## Prior gap

D3e12 added an identity-attested verification wrapper, but its issuer implementation called the independently exported lower-level D3e10 function `issueSandboxPrivateCancelReviewPermitV1`. That function could sign an otherwise well-formed permit using only two D3e8 operator signatures, **without** checking either D3e12 IdP assertion. A privileged offline caller with the injected issuer private key could therefore skip the identity policy. This was never enabled as a deployed service, but the software export surface contradicted the future intended mandatory path.

## D3e13 changes

- `apps/api/src/official-reader-portone-cancel-detached-permit-private-v1.ts` is now **VERIFY-ONLY**. It imports no Ed25519 signing function or private-key parser and exports no permit issuer. It retains strict, pure `validateSandboxPrivateCancelDetachedPayloadV1`, deterministic canonical encoding, pinned issuer signature verification and an injected owner-only test DB store after verification.
- `apps/api/src/official-reader-portone-cancel-private-identity-attestation-v1.ts` directly performs the sole app-source **offline permit signing** only **after** `verifyOfflinePrivateCancelIdentityPairV1` has accepted both independently provisioned signed operator proofs, two current organizational subject assertions, active directory role/key bindings and a pinned active IdP signer. The permit payload and 60-second expiry checks are reused from the strict D3e10 validator.
- `test/support/private-official-reader-cancel-legacy-permit-issuer-v1.ts` preserves the old identity-unbound generator **solely to construct D3e10 negative/adversarial test vectors**; production source has no import of it. D3e10 existing tests now use this test-only helper. It is NOT intended for packaging or deployment.
- `test/official-reader-portone-cancel-private-issuer-surface-closure-v1.test.ts` asserts the concrete module export surface, executor source absence of private-key signing, mandatory verification ordering of the only app-source issuer, and test-only location of the legacy helper. Existing D3e10/D3e12 tests cover positive and negative signed-vector behavior.

## What this does NOT prove

**This is removal of an application API bypass, not complete privilege isolation.** In particular:

1. The D3e12 offline function still accepts `trustedOperatorKeys`, `pinnedIdpKeys`, `trustedIdentityDirectory` and `issuerPrivateKeyPem` as injected arguments. A process that can provision fake registries or control the private key can manufacture a synthetic trust basis. The next release must bind these to an independently administered identity service, immutable issuer policy and hardware/service secret custody; do not accept them from a browser, caller request or plugin.
2. The existing D3e8 `commitPrivateCancelDualApprovedReviewV1` test-store helper and D3e6/D3e8 DB-owner paths can still perform offline review with no D3e12 identity assertion. **These bypasses remain release blockers**, despite passing this source-level issuer closure test. Remove or fence them with genuinely separated execution identities and a reviewed least-privilege SQL entrypoint before production.
3. A `phishing_resistant_mfa` string in a synthetic signed fixture does **not** constitute live WebAuthn evidence, real operator presence or proof that two natural persons are independent. Production IdP assertions must come from independently verified authentication context and independent operator enrollment.
4. Previously issued permits can remain valid until their maximum 60-second expiry; executor currently checks pinned permit issuer keys and signature/TTL, not an online revocation directory at execution time. A real incident revocation policy/epoch must be designed.
5. No SQL migration, database grant, production HTTP endpoint, scheduler, third-party IdP, LIVE PortOne, payment/refund, entitlement mutation, real notification transport or privacy purge was added. This PR is an **offline source-surface hardening proposal**.

## Acceptance

Run exact-head TypeScript/shared Work Track and affected D3e10/D3e12/D3e13 Vitest suites; check Governance and Web PR Domain Gates and final CI Verify. No schema changes, so PostgreSQL 15/17 or DB Authority may be skipped on this PR; a skipped check is not a DB PASS.

**Hold:** All parent and child PRs remain Draft/unmerged; no LIVE operations, direct privileged execution or rollout. Review by Security/Privacy/Commerce/Ops required before any production authorization.
