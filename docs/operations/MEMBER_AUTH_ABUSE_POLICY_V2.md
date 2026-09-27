# MyeongHa Member Auth Abuse Policy V2

Status: **C1 FOUNDATION DORMANT / NOT WIRED TO PRODUCTION AUTH HTTP**

Issue: `#1332`

## Objective

Replace the blocked Vercel WAF Member Auth strategy with an application-layer admission boundary backed by the existing governed PostgreSQL runtime.

The exact protected action set remains:

```text
sign-in
sign-up
refresh
```

`sign-out` remains outside V2.

## C1 scope

C1 creates only dormant security primitives:

- a 60-second, 30-request anchored fixed-window admission command;
- an UNLOGGED PostgreSQL counter table;
- a dedicated NOLOGIN/NOBYPASSRLS owner;
- a server-side HMAC-SHA256 network-key derivation boundary;
- a PostgreSQL admission port that enters `myeongha_api_executor`;
- unit and real-PostgreSQL concurrency tests.

C1 does **not** modify `api/auth/sign-in.ts`, `api/auth/sign-up.ts`, `api/auth/refresh.ts`, `api/auth/sign-out.ts`, or `apps/api/src/supabase-auth-http.ts`. Production Auth traffic therefore remains unchanged after C1.

## Client network key

Production activation will read exactly one trusted Vercel `x-forwarded-for` IP literal. Missing, comma-separated, or non-IP values fail validation.

The raw network identifier is converted before any PostgreSQL call:

```text
HMAC-SHA256(
  MYEONGHA_AUTH_RATE_LIMIT_SECRET,
  "myeongha-member-auth-rate-limit-hmac-sha256-v1"
  + NUL
  + action
  + NUL
  + client_ip
)
```

The database receives only the resulting 32-byte fingerprint.

Because `action` participates in the HMAC domain, the same client receives unrelated fingerprints for sign-in, sign-up, and refresh. V2 stores no raw IP, email, password, refresh token, user id, or user agent.

The dedicated secret `MYEONGHA_AUTH_RATE_LIMIT_SECRET` is not shared with the Guest bearer fingerprint secret.

## PostgreSQL authority

`public.member_auth_rate_limit_buckets` is an UNLOGGED ephemeral table keyed by:

```text
(action, client_fingerprint)
```

The only production command is:

```text
public.cmd_admit_member_auth_request_v1(text, bytea)
```

The command owns the policy values:

```text
window = 60 seconds
limit = 30
blocked-count saturation = 31
```

The application cannot supply a weaker threshold.

The API execution role receives EXECUTE on the command but no direct SELECT/INSERT/UPDATE/DELETE authority on the table.

## Concurrency

Admission uses one PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` statement. PostgreSQL row-conflict serialization is the source of truth when multiple serverless instances admit the same client/action concurrently.

The C1 PostgreSQL integration fixture requires exactly:

```text
40 concurrent admissions
30 allowed
10 denied
```

It also proves that saturating sign-in does not consume sign-up or refresh capacity.

## Retention

Counters saturate at 31 instead of increasing without bound.

Every admission performs bounded opportunistic cleanup of at most 8 rows whose reset time is more than five minutes old. C1 introduces no cron or unbounded DELETE.

Because the table is UNLOGGED, it is intentionally outside durable recovery semantics. Losing these counters during a database restart is acceptable; the next request starts a new admission window.

## Failure policy

The V2 contract is `fail-closed`.

C1 is dormant, so this does not affect Production HTTP yet. C2 activation will map admission-infrastructure failure to a bounded 503 and will not silently bypass the limiter into Supabase Auth.

## Vercel WAF relation

The V1 WAF evidence remains authoritative history: the governed project rejected an additional Member Auth rate-limit rule with `Rate limiting is not available for this plan`.

V2 does not delete or rewrite that evidence. Existing Guest Bootstrap WAF protection also remains unchanged.

## C2 activation boundary

C2 is a separate reviewed change. It must:

1. bind `MYEONGHA_AUTH_RATE_LIMIT_SECRET` in Production;
2. compose one module-scoped PostgreSQL runtime for Member Auth;
3. derive the client fingerprint before request-body parsing;
4. admit sign-in/sign-up/refresh before any Supabase Auth call;
5. return 429 with `Retry-After` when denied;
6. return a bounded 503 when admission infrastructure is unavailable;
7. keep sign-out excluded;
8. run side-effect-free Production canaries;
9. prove independent endpoint buckets;
10. preserve the existing Guest Bootstrap WAF rule.

C1 alone does not close #1332.
