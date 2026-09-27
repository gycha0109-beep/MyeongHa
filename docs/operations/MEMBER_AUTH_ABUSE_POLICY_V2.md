# MyeongHa Member Auth Abuse Policy V2

Status: **PRODUCTION ACTIVE / C2 CANARY PROVEN**

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

C1 did **not** modify `api/auth/sign-in.ts`, `api/auth/sign-up.ts`, `api/auth/refresh.ts`, `api/auth/sign-out.ts`, or `apps/api/src/supabase-auth-http.ts`. That dormant boundary is historical after C2A activation.

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

C2A wires the production `sign-in`, `sign-up`, and `refresh` routes through the application admission boundary. Missing/invalid trusted client IP, missing/invalid HMAC activation config, PostgreSQL connection failure, statement timeout, or malformed admission authority output returns:

```text
503 AUTH_RATE_LIMIT_UNAVAILABLE
```

The runtime does not silently bypass the limiter into Supabase Auth. A blocked client receives:

```text
429 RATE_LIMITED
Retry-After: 1..60
Cache-Control: no-store
```

The request body is not parsed after a block or admission-infrastructure failure.

## Vercel WAF relation

The V1 WAF evidence remains authoritative history: the governed project rejected an additional Member Auth rate-limit rule with `Rate limiting is not available for this plan`.

V2 does not delete or rewrite that evidence. Existing Guest Bootstrap WAF protection also remains unchanged.

## C2A production activation

C2A activates the already-proven C1 primitive without changing the existing Supabase Auth business logic.

The protected routes now compose a module-scoped `ProductionMemberAuthHttpRuntimeV1`:

```text
POST /api/auth/sign-in
POST /api/auth/sign-up
POST /api/auth/refresh
  -> trusted x-forwarded-for
  -> endpoint-separated HMAC-SHA256 fingerprint
  -> PostgreSQL admission
  -> existing handleSupabaseAuthRequestV1()
```

`POST /api/auth/sign-out` remains directly bound to the existing Auth handler and is not rate-limited.

The Member Auth admission pool uses a narrow profile only for this boundary:

```text
max connections per runtime = 4
connection timeout           = 1500 ms
statement timeout            = 1500 ms
idle timeout                 = 5000 ms
```

Ordinary MyeongHa PostgreSQL callers keep their prior pool defaults.

The dedicated Production secret `MYEONGHA_AUTH_RATE_LIMIT_SECRET` was provisioned in Vercel as a `sensitive`, Production-only environment variable by governed run `36341568878`. The run recorded `secret_value_emitted=false`; the secret value is not repository or runtime evidence.

The activation state is `production-active`. Side-effect-free Production canary run `36346090857`, bound to exact Production deployment `dpl_8sA237CXZ4vN65N9Nq4uSPYf9p4h`, proved:

1. sign-in invalid requests 1..30 returned local `400 INVALID_REQUEST`; attempt 31 returned `429 RATE_LIMITED` with `Retry-After: 52`;
2. sign-up independently admitted 30 invalid requests; attempt 31 returned `429 RATE_LIMITED` with `Retry-After: 53`;
3. refresh independently admitted 30 invalid requests; attempt 31 returned `429 RATE_LIMITED` with `Retry-After: 52`;
4. endpoint bucket independence passed;
5. sign-out remained outside the limiter and preserved `401 AUTH_REQUIRED`;
6. probe payloads were local-invalid-only;
7. raw network identifiers were not emitted;
8. credential material was not emitted.

The one-shot canary bridge was used only to obtain runtime evidence. The permanent canary workflow remains manual-only and the V2 application limiter is now the active Member Auth abuse boundary. #1332 may be closed once this evidence promotion and cleanup are merged.
