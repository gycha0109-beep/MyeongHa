# MyeongHa Production Request Identity Verifier V1

Status: **implementation contract — public user-data route activation remains gated**

## Purpose

This contract binds raw Shared API request credentials to the existing narrow trusted-evidence boundary used by `SubjectIdentityResolver`.

It implements the HTTP verification side of `P0-AUTH-01` without changing the canonical owner model:

```text
raw request credential
→ ProductionRequestIdentityVerifierV1
→ VerifiedSubjectIdentityEvidenceV1
→ transaction-scoped canonical subjects.id resolution
```

A client-supplied `subjectId` or `userId` is never identity evidence.

## V1 transport

V1 uses one request transport:

```text
Authorization: Bearer <credential>
```

No query-string credential, body credential, custom subject header, or browser cookie is accepted by this verifier.

The transport is a MyeongHa deployment implementation choice. It does not redefine source-level Guest/Member ownership semantics.

## Member verification

A JWT-shaped bearer credential is treated only as a Supabase Member credential candidate.

```text
three base64url JWT segments
→ GET {governed production Supabase origin}/auth/v1/user
→ apikey: MYEONGHA_SUPABASE_API_KEY
→ Authorization: Bearer <JWT>
→ HTTP 200 + valid user UUID
→ { kind: member, verifiedAuthUserId }
```

The Supabase API key is required to be a modern `sb_publishable_...` key. Secret/service-role keys and legacy JWT-style anon keys are rejected by production configuration.

A JWT-shaped credential rejected by Supabase Auth does **not** fall through to Guest resolution.

Supabase network failure, 429, 5xx, malformed success JSON, non-JSON success, or an invalid verified user identity fails closed as verifier infrastructure failure. Raw access tokens and API-key material are never placed in verifier errors.

## Guest verification

A non-JWT opaque bearer is eligible for the Guest V1 verifier only when it is 32–512 printable non-whitespace ASCII bytes and does not contain a comma.

The verifier computes:

```text
fingerprint version:
myeongha-guest-bearer-hmac-sha256-v1

HMAC key:
MYEONGHA_GUEST_FINGERPRINT_SECRET

HMAC message:
"myeongha-guest-bearer-hmac-sha256-v1\0" + raw bearer token

stored/resolver form:
myeongha-guest-bearer-hmac-sha256-v1:<64 lowercase hex chars>
```

The raw Guest bearer is never passed to PostgreSQL. `begin_guest_subject_context_v1` receives only the fingerprint and remains authoritative for active/unconsumed Guest Session matching.

`createProductionGuestBearerTokenFingerprintPortV1()` exposes the exact same fingerprint implementation to Guest bootstrap persistence so issuance/storage and subsequent request verification cannot silently diverge.

This slice does not choose Guest TTL. `P0-PR-01` remains open and concrete Guest bootstrap credential expiry policy is still separate.

## Credential classification invariant

```text
JWT-shaped bearer
→ Member verification only

supported non-JWT opaque bearer
→ Guest fingerprint only

missing/malformed/unsupported bearer
→ no identity evidence
```

This prevents a rejected Member JWT from being reinterpreted as a Guest credential and prevents ordinary Guest requests from depending on Supabase Auth availability.

## Runtime wiring

The production Saju composition root now constructs this verifier from server environment configuration. The caller can no longer inject an already-trusted `IdentityEvidenceVerificationPortV1` into the production Saju runtime.

A corresponding production `/api/me` composition root also exists.

Neither composition root by itself activates a Vercel route.

## Production activation gate

As of 2026-09-02, production Supabase has the required `myeongha_api_executor` role and Member/Guest subject-context functions, but there is no dedicated non-privileged login principal with membership in `myeongha_api_executor`. The only current member observed is the privileged `postgres` role, which is not an acceptable ordinary user runtime principal.

Therefore public `/api/me` and `/api/me/saju/calculation` route activation remains blocked until all of the following are true:

```text
1. dedicated non-privileged PostgreSQL login principal exists
2. that principal can enter myeongha_api_executor
3. MYEONGHA_DATABASE_URL / MYEONGHA_DATABASE_PRINCIPAL are bound in Vercel production
4. MYEONGHA_SUPABASE_URL points to the governed project
5. MYEONGHA_SUPABASE_API_KEY is the governed publishable key class
6. MYEONGHA_GUEST_FINGERPRINT_SECRET is provisioned
7. route adapter is added
8. unauthenticated / Member / Guest / cross-subject production smoke passes
```

Do not substitute `postgres`, `service_role`, or another BYPASSRLS principal to bypass this gate.
