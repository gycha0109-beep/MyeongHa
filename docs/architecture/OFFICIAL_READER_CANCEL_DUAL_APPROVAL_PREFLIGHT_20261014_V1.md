# D3e8 — SANDBOX-only cryptographic dual-approval preflight

> 2026-10-14 | child of [Draft PR #2070](https://github.com/gycha0109-beep/MyeongHa/pull/2070) | **HOLD; not human-identity authorization, not production enabled**.

## Motivation

D3e6 added a privately owned `internal_private_cancel_review_v1` review/audit function. It uses database `session_user` rather than authenticating two distinct human operators. D3e7 added private aggregate alert outbox; no production transport. D3e8 demonstrates **proof-of-possession and independent approval scope checks** before a one-time sandbox recovery, without elevating financial or runtime access.

## Explicit scope

- TypeScript `commitPrivateCancelDualApprovedReviewV1` requires an **injected trusted Ed25519 public-key registry**. The registry is not populated from a request payload or environment defaults. One key must be registered as `requester`, another as `approver`, and they must resolve to **distinct pre-provisioned principals**.
- Two signatures authenticate identical canonical, bounded claims: protocol, `environment=sandbox`, temporary `inboxId`, `acknowledge|retry_transient`, `OPS-<digits>` ticket, random UUID challenge, ISO UTC issue/expiry (up to ten minutes; future tolerance 30 seconds). Changes to any claim invalidate both signatures.
- The verifier denies malformed/base64-invalid signatures, unknown or disabled keys, swapped roles, duplicate identities, expired/future-dated/overlong claims and unexpected fields **before any DB write**.
- New `1950` private `SECURITY INVOKER` owner-only function accepts the **already verified** claim metadata, rechecks original inbox environment and DB clock **after row lock**, calls the existing D3e6 review and writes an approval receipt in one PostgreSQL transaction. `challenge_id` is uniquely constrained; duplicate calls and concurrent replay roll back the D3e6 action with the whole SQL statement. No repeated dead-letter recovery.
- The receipt stores only pseudonymous key/principal IDs, a SHA-256 statement/signature digest (not raw signatures), ticket and temporary inbox linkage. These IDs **are still potentially personal information**. Both D3e6 review and D3e8 receipt delete by FK cascade if the temporary inbox is lawfully deleted; **no automatic purge is enabled**. The receipt is NOT legal P5Y statutory evidence.

## Non-claims / mandatory release blockers

**This is cryptographic key possession, not verified human presence.** The two signers are distinct registry principals only if independent identity proofing and key custody exist outside this feature. A single party controlling both private keys could still satisfy the protocol. The DB does not verify Ed25519 directly and relies on the explicitly injected, trusted preflight caller; **DB-owner calls to legacy D3e6 remain possible without signatures**. The temporary database owner can access both functions, so this architecture is not yet a nonbypassable privilege boundary. No runnable operator portal, 2FA/passkey, identity provisioning, role separation, admin session, service key rotation/revocation, key custody, privileged execution identity, production network entrypoint, or authorizer against signed human identity is shipped.

Before operational use: independent authenticated operator directory and dual control policy (including same-person multi-key detection), separate least-privileged DB executor, removal/blocking of direct 1930 bypass access, signed key registry/change approval, anti-replay across deployment cutovers, incident ticket ownership, dormant-release security review, retention / account-deletion / backup restoration reconciliation, and Legal/Privacy approval.

## Verification plan

- `test/official-reader-portone-cancel-private-dual-approval-v1.test.ts`: ephemeral Ed25519 keypairs, signed canonical claims, tampering/action/nonce/time/role/same-person failures, absent trust registry, DB response fail-closed and no rights-effect.
- `test/db/official_reader_d3e8_cancel_dual_approval_preflight.sh`: isolated real PostgreSQL attestation shape/expiry challenge checks, atomic D3e6 review + 1950 receipt, nonce replay with alternate ticket, duplicate ticket, eligible transient dead letter, security HOLD retention, temporary deletion cascade, denied runtime roles and unchanged entitlements. The SQL fixture tests structural fences only, **not cryptographic signature validation**.
- CI schema snapshot hash remains strict; only pin the exact new computed digest, never disable catalog enforcement. No LIVE switch, scheduled task or external alert transport test.

**All financial/entitlement mutation, public routes, production role grants, retention deletion and merchant LIVE integration remain disabled.**
