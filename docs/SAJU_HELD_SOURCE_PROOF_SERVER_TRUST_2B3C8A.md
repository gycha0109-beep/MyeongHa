# Saju bridge 2B-3C-8A: Preview proof trust composition

Watchtower-Track: saju-bridge

## Scope

Server-internal only. Composes the protected Preview HTTP issue port, the HMAC verifier trust settings, and the PostgreSQL nonce claim adapter. No environment-based automatic activation, no public endpoint, and no grant of interpretation, release or commerce authority.

## Contract

- All origin, issuer, audience, key ID and secret inputs are server-owned.
- HMAC key bytes are copied at construction.
- The HTTP issue port returns untrusted data; existing HMAC verification is mandatory.
- Replay checks use the PostgreSQL claim port exclusively, never process-local memory.
- Missing role membership or database connectivity blocks the proof.
- Construction itself makes no network or database requests.

## Verification

The synthetic test composes an independently HMAC-signed proof, an HTTP response stub and a PostgreSQL transaction stub. It checks success, replay rejection, invalid signing key, database outage, missing DB role and invalid configuration.

## Follow-up gates

A separately approved runtime database principal needs permission to enter the dedicated nonce role. Operational Saju issuer deployment, service credential provisioning, key rotation, real database failover testing and end-to-end staging tests are not part of this change. Production interpretation, publication and sale remain on HOLD.
