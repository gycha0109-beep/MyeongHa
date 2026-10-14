# D3e15 — Policy-bound review permit, signing-key rotation, stale-executor preflight

**Date:** 2026-10-14 · Parent: [D3e14 Draft #2085](https://github.com/gycha0109-beep/MyeongHa/pull/2085) · **Offline Sandbox only / Draft / HOLD**.

## Problem / confirmed gap

D3e14 separately verifies a root-signed trust policy when bootstrapping an offline issuer and executor. However, the permit emitted by its D3e12 issuer contains only the action, target, challenge, signatures and short expiry. It does **not cryptographically identify the trust policy** under which it was authorized.

When an operator, IdP, verifier signing key or root policy is rotated, a *new* executor could still trust a previously issued D3e10 permit if the permit issuer public key remains pinned. In particular, retiring an operator in the new policy does not invalidate a permit signed by a still-active issuer unless the executor also requires the exact policy version and content.

## New explicit D3e15 binding

- `verifyOfflinePrivateCancelSignedTrustPolicyV1` now emits the root key ID and `sha256:` digest of the exact canonical, successfully Ed25519-verified policy bytes. Both are **verified facts**, not caller-provided permit metadata.
- The offline D3e14 **issuer** first performs the full D3e12 operator/IdP identity check and signs the inner D3e10 permit as before. It then creates a separate **policy binding**:
  `{protocol, environment:sandbox, rootKeyId, policyId, policyRevision, policyDigest, issuerKeyId, permitDigest}`.
- `permitDigest` uses SHA-256 over a domain-separated byte sequence containing the canonical **inner signed permit payload plus its actual inner Ed25519 signature**. This prevents splicing an inner permit with somebody else's valid policy binding.
- A **second Ed25519 signature** by the trusted permit issuer covers the deterministic policy binding. The D3e15 bound token adds `policyBinding` and `policyBindingSignatureBase64` without modifying the existing D3e10 wire-format type used in legacy adversarial tests.
- The offline D3e14 **executor** accepts only this bound token. **Before calling any DB test store**, it verifies exact envelope/policy binding fields and canonical signatures, requires all root/policy/revision/digest fields to equal its independently verified **active boot policy**, checks the digest of the inner signed permit, and verifies the binding signature using its pinned issuer public key. Then D3e10 independently verifies the **inner** signature, issuer and <=60-second TTL before the D3e8 no-effect atomic review fixture.

The inner permit's signed meaning, the D3e8 one-use database challenge, the D3e11 proven-transient dead-letter constraint and the owner-only no-rights-effects contract remain unchanged.

## Snapshot cutover / rollover demonstrations

- **Version rotation:** a freshly booted executor on root-signed revision 8 rejects permits issued under revision 7, **even if still unexpired**. A freshly booted rev-8 issuer can issue a new valid, properly bound permit.
- **Same-revision content rotation:** even if policy ID and numeric revision are unchanged, changed IdP/operator/key contents yield a different canonical SHA-256 and invalidate all prior bound permits in the newly booted executor.
- **Permit signing-key retirement:** an independently signed new policy disables the old permit issuer and enables a replacement. A new executor rejects prior permits; the old private key fails the new issuer bootstrap. A matching new provisioned key and authenticated signers would be needed to issue new permits.
- **Trust root rotation:** a policy independently signed under a different root key ID causes newly booted executors to reject old-root permits.
- **Legacy token rejection:** the D3e14 executor refuses bare, identity-unbound D3e10 tokens with no D3e15 binding.
- **Tamper rejection:** policy purpose, root ID, revision, issuer ID, policy hash, inner permit hash, signed inner fields, outer signature or extra fields fail closed before DB.

## Security limit: not instantaneous revocation

**A previously running executor does NOT learn about a newly signed policy automatically.** It continues to hold its previously root-verified policy snapshot. If the old permit and policy remain in their valid time windows, that old executor can still accept the permit. This is a deliberate, separately tested **release blocker**, not a passed global revocation guarantee.

For production, the execution identity must receive a trusted, monotonic **current-policy epoch / revocation feed** or a securely orchestrated fail-closed process restart / shutdown on key compromise. The root minimum revision must be advanced independently, and old executors drained before new authority becomes effective. Offline D3e15 does not fetch external state, schedule checks, or issue notifications and therefore cannot guarantee immediate key/account revocation.

Other preexisting blockers remain: injected issuer private PEM and pinned root at trusted boot, simulated rather than real SSO/WebAuthn identity, lack of separate OS processes/secrets vault, directly callable D3e6/D3e8 owner-only functions and inability of an application permit to constrain an actual DB owner/superuser. Untrusted callers must never be allowed to bootstrap a new issuer/executor with their own root, signer or test store.

## Tests / acceptance

`test/official-reader-portone-cancel-private-signed-trust-boundaries-v1.test.ts` extends the D3e14 test suite with D3e15 independent policy binding, nested signed-permit tamper, forged outer proof, old raw token denial, rev-7 -> rev-8 rotation, same-revision digest divergence, signing-key retirement, root rotation, and intentionally retained stale-executor acceptance (for an independently documented risk).

Run exact-head TypeScript, affected Vitest and broader Work Track suite, Governance, Web and CI Verify. No SQL migration or GRANT changes: DB Authority/PG jobs may be skipped and must **not** be reported as new DB PASS.

**Hold:** Keep PR Draft/unmerged. No production IdP, live PortOne, refunds, entitlement mutation, automated review, external alert, policy-fetch scheduler, database role grant, evidence retention executor, or deployment.
