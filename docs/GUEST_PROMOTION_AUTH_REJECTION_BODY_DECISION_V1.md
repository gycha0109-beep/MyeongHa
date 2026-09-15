# MyeongHa Guest Promotion Auth-Rejection Request-Body Decision V1

> Status: **DECIDED — Production HTTP lifecycle binding**  
> Date: **2026-09-16**  
> Scope: `POST /api/auth/promote-guest` authentication-rejection request-body lifecycle only  
> Resolves: **#708**

## 1. Decision

For `POST /api/auth/promote-guest`, once request method validation has passed and the existing authentication boundary rejects the request with either:

```text
401 GUEST_AUTH_REQUIRED
401 MEMBER_AUTH_REQUIRED
```

the request body remains **untouched**.

The Production runtime MUST NOT, merely for cleanup after that authentication rejection:

```text
read
parse
cancel
drain
materialize
or otherwise disturb
```

the request body.

The observable V1 contract remains:

```text
authentication rejection
→ response can complete without waiting for request-body EOF
→ request.bodyUsed === false
```

This selects **Option A** from #708.

## 2. Existing Authority Preserved

This decision does not create a new product semantic or transport feature. It preserves the already-closed #664 / PR #665 Production contract:

```text
method validation
→ Guest-header/authentication precedence
→ member + Guest identity verification
→ only authenticated requests may enter request-body validation
```

The permanent #664 closure regression explicitly proves both unauthenticated non-closing-body paths return their existing 401 result while `request.bodyUsed === false`.

Current `apps/api/src/production-guest-promotion-runtime.ts` already conforms to this decision:

- invalid/missing Guest evidence returns `GUEST_AUTH_REQUIRED` without body access;
- invalid/missing Member evidence returns `MEMBER_AUTH_REQUIRED` without body access;
- request-body validation begins only after both authentication boundaries succeed.

Current `test/production-guest-promotion-auth-before-body.test.ts` already asserts the V1 contract on non-closing request bodies.

Therefore **no runtime code change is authorized or required by this decision**.

## 3. Why Post-Rejection Cancellation Is Not Adopted

Best-effort `ReadableStream.cancel()` after the 401 decision could be operationally reasonable in another contract, but it would disturb the request body and could change the already-verified `bodyUsed === false` behavior.

That would be a semantic change to an established Production HTTP lifecycle contract, not an implementation-local cleanup.

No current product, security, or runtime authority requires that change. The narrower existing contract therefore remains authoritative.

## 4. Method Rejection Remains Separate

This decision does **not** change the existing non-POST method-rejection path.

Current Production code may continue its existing best-effort unused-body cancellation for:

```text
405 Method Not Allowed
```

because #708 concerns authentication rejection after method validation, not method rejection itself.

The distinction is intentional:

```text
method rejection
→ existing best-effort disposal behavior preserved

authentication rejection
→ body remains untouched
```

## 5. Independent Boundaries Not Resolved Here

This decision does not resolve or broaden any of the following:

```text
#715 Guest promotion valid-prefix request-body EOF completion
#701 Production client-disconnect cancellation semantics
#681 Production API PostgreSQL statement/query deadline authority
#680 Supabase Production deployment authorization
#389 backup / restore / RPO / RTO
```

It also does not introduce:

```text
request-body deadline
byte limit
rate limit
retry count
Content-Length trust rule
stream framing rule
Vercel supportsCancellation policy
DB/RLS/identity changes
```

Authenticated Guest promotion request-body parsing and its valid-prefix EOF problem remain governed separately.

## 6. Verification Contract

The repository regression for this decision is the existing:

```text
test/production-guest-promotion-auth-before-body.test.ts
```

At minimum it must continue proving that non-closing request bodies do not delay authentication rejection and that both 401 branches leave:

```text
request.bodyUsed === false
```

A future implementation that cancels, drains, or reads an auth-rejected body is a contract change and must not silently update this regression.

## 7. Reopen / Supersession Rule

This decision may be superseded only by a new explicit, versioned Production request-lifecycle decision that deliberately changes post-authentication-rejection disposal semantics and provides deterministic regression plus exact-SHA Production evidence.

A generic cleanup refactor, a future global cancellation toggle, or an unrelated request-body timeout decision is insufficient to supersede this contract.
