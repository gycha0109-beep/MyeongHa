# D3e12 — Offline identity-attested dual review preflight (not production SSO)

> 2026-10-14 · parent [D3e11 Draft #2080](https://github.com/gycha0109-beep/MyeongHa/pull/2080) · **Sandbox-only / Draft / HOLD**.

## Why this boundary exists

The D3e8/D3e10 chain verifies two valid Ed25519 operator signatures, then an independent short-lived verifier-issued permit. Distinct signing keys (or even distinct registry principal strings) do **not** prove that two different, currently authorized organizational identities participated. Key duplication, stolen credentials, revoked accounts or a spoofed ticket/role can compromise the intended separation of duties.

D3e12 adds an **offline identity-attestation policy** to the D3e10 permit issuer path; it is a cryptographic **test fixture**, not an actual IdP, OIDC/WebAuthn, authenticated administration console or a production trust authority.

## Proposed chain

```text
[Same D3e8 signed cancellation review claim]
   requester Ed25519              approver Ed25519
           |                               |
           +---------------+---------------+
                           v
[PINNED, pre-provisioned organization directory]
   org subject -> principal ID, signing key ID, role, active status
   (never accepted from the untrusted request)
                           |
[Two separately signed IdP identity assertions]
  - PINNED, active IdP Ed25519 public key; issuer private key outside verifier
  - Phishing-resistant MFA claim, authentication within 5 minutes
  - Identity assertions expire within 5 minutes
  - Role/identity/signing key bound to original inbox/action/ticket/challenge
  - Issued-after-original signed claim, expire no later than original claim
                           v
[D3e12 identity policy + existing D3e8 operator signature checks]
                           v
[D3e10 separate verifier Ed25519 permit: <=60s]
                           v
[D3e10 offline executor: pinned permit issuer public key]
                           v
[D3e8 owner-only SQL 1950 -> D3e6; existing DB challenge replay fence]
```

The **two identity assertions are verified independently**. Either assertion can be denied for an untrusted/revoked IdP issuer, inactive org identity, changed directory key assignment, wrong approval role, compromised/untrusted signing-key mapping, missing MFA assertion, stale authentication, altered ticket/inbox/challenge/action, wrong audience or any extra payload field.

IdP attestations contain **no emails, names, raw personal details, bearer access tokens or authentication secrets**. They contain pseudonymous org subject and principal IDs, key ID, action scope, ticket ID and bounded timestamps. These identifiers are still potentially personal data; raw IdP assertions are **not** persisted to the database or forwarded to the executor.

## Implementation

- `apps/api/src/official-reader-portone-cancel-private-identity-attestation-v1.ts`: canonical fixed-field identity assertion serializer, Ed25519 issuer signature verification, active pre-provisioned directory matching, distinct-org-subject guard, fresh phishing-resistant MFA claim, action/scope/ticket verification and issuance wrapper for D3e10.
- `test/official-reader-portone-cancel-private-identity-attestation-v1.test.ts`: isolated ephemeral IdP/operator/permit-issuer Ed25519 keys; positive two-subject signing; revoked directory/issuer; key rotation mismatch; claim tampering; swapped roles; stale/future/expired authorization; invalid purpose or environment; extra PII fields; malformed messages; no DB calls until permit execution; fail-closed SQL receipt tests.
- No DB migrations, real key storage, runtime GRANTs, production endpoints, schedulers, third-party IdP calls, actual payment/provider operations, financial effects or retention tasks.

## Security limitations / gates

1. **Offline only:** a fixture Ed25519 IdP asserting `phishing_resistant_mfa` does not prove real WebAuthn, hardware-bound keys, operator presence or independence. Production IdP integration must independently verify authentication context, not trust an unverified MFA string from a caller.
2. **No forced issuance cutover:** older D3e10 `issueSandboxPrivateCancelReviewPermitV1` remains callable in test modules and bypasses this *optional offline identity wrapper*. There are no production issuance rights today. Before a release, all issuer entrypoints must enforce the same policy with non-bypassable process/key ownership and all legacy direct issuance paths closed.
3. **Trust provisioning:** org directory mapping and IdP public-key pinning are injected trusted dependencies, not fetched from HTTP or claim payloads. Future provisioning needs independent approval, revocation/rotation, identity audits, tenant isolation and provider issuer/audience checks.
4. **Privilege boundary:** even a correctly signed D3e12 identity claim is **not database authority**. SQL D3e6/D3e8 are still SECURITY INVOKER owner-only; the DB owner or superuser can bypass TS/IdP checks. The non-owner isolated role D3e9 must not be promoted or granted any direct 1930/1950 EXECUTE or private table write privileges.
5. **Financial release:** real refunds, entitlements, Commerce canonical verification, operator ticket authority and legal/privacy classification require independent Security/Commerce/Ops approval. No LIVE deployment is enabled.

## Exit criteria

Run exact-HEAD Work Track affected tests, full TypeScript, Web, Governance and CI Verify. Because D3e12 adds no SQL schema or grants, DB Authority may be scoped out by CI; do not misrepresent a skipped DB job as independently exercised for this PR.

Keep the pull request **Draft/HOLD** until a separate, externally authenticated service and separately privileged backend are designed and accepted.
