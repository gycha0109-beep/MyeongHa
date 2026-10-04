# SRC-19 — Device Installation Registration / Re-registration Lifecycle Authority

> Status: **RESOLVED for Mobile Expo Push registration lifecycle**  
> Product-owner decision: **2026-10-02**  
> Domain: Notification / Device Installation

## 1. Resolved production boundary

The approved Mobile lifecycle is:

```text
first registration
→ create a server-generated device_installations.id

same subject + same active (platform, installation_key)
→ refresh the existing active row in place

same installation + changed Expo Push token
→ rotate protected token material in that same active row

same subject + same active token + different installation_key
→ revoke the prior active row
→ create a new server-generated installation row

revoked row registers again
→ never resurrect the revoked row
→ create a new server-generated row

cross-subject active installation_key or token
→ registration fails closed
→ old subject must revoke first
```

A successful registration refreshes `app_version`, `client_capability`, and
`last_seen_at` together with protected token material.

The client owns only a stable installation key. It does **not** choose the canonical
subject or the server row id.

## 2. Token authority

The Mobile client may transmit the current Expo Push token only over the authenticated
HTTPS registration request. The server immediately converts it into AES-256-GCM
ciphertext plus a key id and HMAC-SHA256 fingerprint. Raw token material must not be
persisted or logged.

## 3. Retry / concurrency

Registration is serialized by canonical subject plus installation/token identities.
Exact same-subject retry converges on the current active row. Database uniqueness
remains a defense-in-depth invariant, not the lifecycle contract.

## 4. Logout / account switch

The old installation binding must be revoked before a different canonical subject can
bind the same installation key or token.

Guest → new Member promotion that preserves the canonical subject does not require a
revoke/recreate boundary.

## 5. Still out of scope

This resolution does **not** resolve:

```text
notification scheduling/cadence/frequency       → SRC-32
delivery-attempt provider provenance + sending   → SRC-31
effective preference defaults                    → SRC-12
final inbox membership semantics         → SRC-13
```

The 2026-10-02 Product Owner decision separately selects Expo Push Notifications as the
Mobile iOS/Android MVP transport service. This registration lifecycle still does not
authorize notification-attempt provider provenance, retry/failover, or autonomous sends.

## 6. Verification gate

Production activation must prove first-create, exact retry, token rotation, same-subject
rebind, non-resurrection of revoked rows, cross-subject conflict denial, no direct API
executor DML, no raw token persistence, and idempotent owner-scoped revoke.
