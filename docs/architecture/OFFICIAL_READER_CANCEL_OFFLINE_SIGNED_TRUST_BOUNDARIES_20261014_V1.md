# D3e14 — Offline root-signed trust snapshot and split issuer/executor boot surfaces

**Date:** 2026-10-14 · Parent [D3e13 Draft #2083](https://github.com/gycha0109-beep/MyeongHa/pull/2083) (CI PASS) · **Draft/HOLD · offline/Sandbox ONLY · no deployment**.

## Scope and motivation

D3e13 removed the identity-unbound permit issuer from the application execution module, but D3e12's `issueIdentityBoundSandboxPrivateCancelPermitV1` still accepts caller-injected `trustedOperatorKeys`, `trustedIdentityDirectory`, `pinnedIdpKeys` and an issuer private key. D3e10's lower-level `executeSandboxPrivateCancelReviewPermitV1` likewise accepts caller-supplied issuer public keys and an injected DB-owner test store. Neither a TypeScript interface nor a distinct module is an authentication/privilege boundary.

D3e14 implements a **test-only signed policy bootstrap and two narrow facades**. Their per-request methods accept no trust keys, policy revisions, clock, signing key, IdP directory, DB executor or connection credentials. This closes **per-request trust overriding through the new facades**, not arbitrary code execution by a privileged process.

## Signed trust policy

`apps/api/src/official-reader-portone-cancel-private-signed-trust-policy-v1.ts`

- One versioned `sandbox` policy with strict audience/purpose, bounded operator assignments, IdP public keys and permit issuer public keys, issue/expiry and integer revision.
- Entire normalized policy **plus root key ID** is Ed25519 signed. The pinned root public key and minimum acceptable revision are supplied separately by the trusted bootstrap; neither can originate from a review request, IdP assertion or the signed policy itself.
- Strict exact-field rejection, canonical ordering, fixed UTC millisecond timestamp format, 24-hour maximum policy validity, maximum size 64 KiB, no duplicate organization subjects/principals/key IDs and **no cryptographically identical public keys across any operator, IdP, permit issuer or trust root**. Private PEMs presented as public keys fail.
- At least one active requester, approver, IdP and permit issuer required. Disabled operator assignments yield **no trusted operator signing key**. A revoked or replaced signer requires a new independently signed policy.
- Only validated, frozen `trustedOperatorKeys`, `trustedIdentityDirectory`, `pinnedIdpKeys`, `trustedPermitIssuers` and policy expiry are returned. No root private key or caller-provided PEM signing secrets are stored.

## Separate offline bootstrap facades

```text
        Independently provisioned Ed25519 policy-authority public root
                   + minimum accepted policy revision
                                |
                     Signed bounded trust policy
                         /                \
                        v                  v
   [D3e14 verifier-only bootstrap]  [D3e14 executor-only bootstrap]
   Trust: org directory, operator      Trust: ONLY active permit
          public keys, IdP keys               issuer public keys + expiry
   Capability: verifier private key    Capability: injected isolated
   No SQL store or DB connection               test-only owner-store
                        |                  ^
   Review request:     |                  |  Permit only; no trust
   two operator proofs |                  |  keys/DB store in request
   two IdP assertions  v                  |
   -> D3e12 verify -> issue D3e10 <=60s permit
```

- `apps/api/src/official-reader-portone-cancel-private-offline-issuer-boundary-v1.ts` validates the separately signed root policy **once at trusted boot**, checks that the explicit issuer private key matches the signer public key recorded in the signed policy, retains frozen verified trust maps, and calls the D3e12 identity-gated issuer. Per-request shape is exactly `{statement,operatorAttestations,identityAssertions}`.
- `apps/api/src/official-reader-portone-cancel-private-offline-executor-boundary-v1.ts` **independently** validates its root-signed trust policy at boot, discards organizational identity mappings and IdP keys, and keeps only verified **permit issuer public keys**, policy expiry and a test-only DB store. Per-request shape is exactly `{permit}`. No signing private key, no identity verification, and no DB capability passed by the requester.
- A trusted clock is injected at **bootstrap only**. Both facades recheck the policy expiry on **every call**; the executor then uses the existing D3e10 signature/time validation and D3e8 receipt validation. A policy refresh requires a new trusted boot; there is **no automatic refresh, scheduler, network call or dynamic account revocation**.
- The signed policy does **not** grant DB privileges. Existing D3e9 isolated PostgreSQL role-denial tests remain the negative privilege gate. The SQL D3e6/D3e8 owner still can bypass these application facades.

## Verification

`test/official-reader-portone-cancel-private-signed-trust-boundaries-v1.test.ts` uses independent ephemeral Ed25519 keys for policy root, two operators, IdP, verifier permit issuer and an attacker. It checks:

- Positive independent signed policy boot at BOTH facades, D3e8 two-operator signature + D3e12 identity signature + D3e10 permit signature and a single test-only SQL-store receipt with **no rights/financial effects**.
- Per-request injection attempts for root keys, trust directory, IdP/public keys, signer private key, clock, SQL store and environment are rejected **before invoking the test DB store**.
- Forged root or issuer, changed policy audience/environment, missing/extra fields, too-low revision, wrong private key, private PEM masquerading as public, duplicate keys/identities and cloned public keys across trust roles fail closed.
- Expiry after bootstrap is checked on issuance and execution. Mutation of original caller-owned policy after boot cannot update the verified private snapshots.
- Missing/ambiguous DB receipts or SQL errors do not become successful actions.
- Source import guards prevent the issuer facade using the DB test store and the executor facade importing signing private-key or IdP identity code.
- TypeScript, Vitest, Web PR Domain Gates, Governance, CI Verify. No SQL schema changes, so a skipped DB Authority job is **not** a DB PASS for this PR.

## Non-claims / hard release blockers

1. **Not an OS/service separation:** both factories can be instantiated in one process by anyone with the injected key and test-store capability. JavaScript closures or types do not restrict a malicious server owner. Actual process boundaries, separate deployment identities, authenticated transport, secret-vault/HSM sign operations and hardware-protected keys remain unimplemented.
2. **Trust-root provisioning:** the root public key, revision floor and private permit signer are still caller-injected at *trusted boot*. An attacker who can create a new boot context with their own root/signing key can sign their own synthetic policy. Future production must independently provision immutable roots, rotation/revocation and signed-change governance. The snapshot is not authority without a trustworthy boot process.
3. **Revocation gap:** policy expiration is enforced, but a compromised signer may still be accepted until a new signed policy is deliberately loaded or the existing policy expires; a revoked IdP/org account is **not** dynamically checked. 24 hours is an offline test bound, not an approved production incident SLA.
4. **DB bypass:** `SECURITY INVOKER` D3e6/D3e8 owner-only functions and the older D3e8 test store remain callable by the DB owner. Neither offline policy nor verified permit can make DB-owner/superuser power non-bypassable. A separately owned, least-privilege, reviewed server entrypoint and demonstrated direct D3e6 denial remain mandatory.
5. **Real identity/financial risk:** the `phishing_resistant_mfa` claim remains a signed offline fixture, not live WebAuthn/OIDC evidence, verified human presence or separation-of-duties. No real PortOne cancellation, refund, entitlement changes, registered operator identities, legal evidence promotion, external alert delivery, retention purge or operational deployment occurs here.

**Exit:** Draft/HOLD, unmerged. Do not grant any runtime role or activate a worker. Security, Privacy, Commerce and Operations must approve a separate real service/DB architecture before any LIVE path.
