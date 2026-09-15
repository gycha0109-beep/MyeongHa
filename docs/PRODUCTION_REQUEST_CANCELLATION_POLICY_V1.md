# Production Request Cancellation Policy V1

Status: ACTIVE

Authority issue: #701

Baseline reviewed: `96769bd2fb017c012a3af76d3c061e6c6092f094`

## Purpose

This policy governs when a deployed Vercel Function may opt into client-disconnect cancellation through `functions.<path>.supportsCancellation` and when MyeongHa must intentionally continue or remain fail-closed.

The policy is deliberately function-path aware. Vercel cancellation is configured at the Function path, while several MyeongHa public routes are rewrites into shared Functions. A read route does not gain cancellation authority merely because its own semantic work is read-only when the same deployed Function also owns a durable command.

## Platform contract

Revalidated against current Vercel Functions documentation on 2026-09-16 KST:

- request cancellation is opt-in through `vercel.json` `functions.<path>.supportsCancellation: true`;
- an opted-in Web `Request` exposes client disconnect through `request.signal`;
- the signal can be propagated to signal-aware upstream work such as `fetch`;
- work that must survive the response/client lifecycle requires explicit `waitUntil`/equivalent handling rather than assuming ordinary request work will survive cancellation.

This policy does not convert Vercel platform lifetime into an application deadline and does not replace any existing MyeongHa-owned dependency deadline.

## Classes

### `cancel_on_disconnect`

The deployed Function may opt into Vercel request cancellation. In V1 this class is restricted to local operational probes that perform no database work, no upstream I/O, and no durable side effect.

### `continue_to_terminal_outcome`

The deployed Function must not opt into client-disconnect cancellation. It owns a durable command, an upstream action with mutation/session semantics, or a mixed dispatcher containing such a command. A caller disconnect must not become an application-level abort signal that can interrupt the command at an arbitrary point.

### `not_yet_authorized_for_cancellation`

The work is read-only or recomputable enough that cancellation may be desirable, but the current implementation does not own an end-to-end caller-abort contract across every active resource boundary. The Function remains opted out until those prerequisites are explicitly governed and tested.

## Deployed Function matrix

| Vercel Function source | Public action(s) | V1 class | Rationale |
| --- | --- | --- | --- |
| `api/health.ts` | `GET /api/health` | `cancel_on_disconnect` | synchronous/local health response; no DB, upstream I/O, or durable side effect |
| `api/readiness.ts` | `GET /api/readiness` | `cancel_on_disconnect` | synchronous/local environment readiness evaluation; no DB, upstream I/O, or durable side effect |
| `api/auth/sign-in.ts` | sign-in | `continue_to_terminal_outcome` | Supabase Auth action/session semantics; do not create caller-abort ambiguity |
| `api/auth/sign-up.ts` | sign-up | `continue_to_terminal_outcome` | Supabase Auth account action; terminal upstream outcome must remain authoritative |
| `api/auth/refresh.ts` | refresh | `continue_to_terminal_outcome` | session/token action; terminal upstream outcome must remain authoritative |
| `api/auth/sign-out.ts` | sign-out | `continue_to_terminal_outcome` | logout/session action; terminal upstream outcome must remain authoritative |
| `api/auth/promote-guest.ts` | `POST /api/auth/promote-guest` | `continue_to_terminal_outcome` | durable Guest→Member promotion transaction |
| `api/session/bootstrap.ts` | `POST /api/session/bootstrap` | `continue_to_terminal_outcome` | durable Guest/session creation |
| `api/birth-profiles.ts` | Birth Profile create/read dispatcher | `continue_to_terminal_outcome` | one deployed Function owns durable create as well as read behavior; Function-level opt-in cannot isolate only the read action |
| `api/me.ts` | current profile, Life Record, Memories, Reading History, Chat read, Chat open | `continue_to_terminal_outcome` | shared Function includes durable `POST /api/chat` thread-open command; rewrites cannot independently opt the read routes into Function cancellation |
| `api/me/birth-profile.ts` | current Birth Profile read | `not_yet_authorized_for_cancellation` | DB-backed read has no repository-owned caller-abort/query-cancellation propagation contract |
| `api/me/saju/calculation.ts` | current-subject Saju calculation | `not_yet_authorized_for_cancellation` | recomputable operation spans request-body probe, identity verification, PostgreSQL read transaction, and Saju upstream fetch without end-to-end caller-abort propagation |

The matrix covers every TypeScript Function currently present under `api/`. A new deployed Function must be added to this policy before CI can accept it.

## V1 activation

`vercel.json` may set `supportsCancellation: true` for exactly:

```text
api/health.ts
api/readiness.ts
```

No wildcard such as `api/*` is authorized.

All other current Function paths must remain absent from cancellation-enabled Vercel configuration.

## Signal, deadline, and database composition

V1 introduces no new signal merging for application I/O because the only `cancel_on_disconnect` Functions are local synchronous probes.

For any future asynchronous `cancel_on_disconnect` route:

1. caller abort must not weaken or replace an existing repository-owned dependency deadline;
2. caller abort and dependency deadline races must have deterministic cleanup and error ownership;
3. PostgreSQL work may observe caller cancellation only after an explicit query/transaction cancellation authority exists and connection cleanup is proven;
4. a shared Function cannot enable cancellation for only one rewritten route unless deployment topology makes that separation real.

#681 remains the independent PostgreSQL execution-deadline authority. This policy neither chooses a DB timeout nor treats a client disconnect as a DB deadline.

## Durable work and `waitUntil`

V1 does not use `waitUntil`/`after` because every current durable or mutation-capable Function is deliberately opted out of platform cancellation.

Before any `continue_to_terminal_outcome` Function can be opted in, a follow-up authority must identify the exact work that must survive caller disconnect, prove commit/rollback/connection cleanup, and define any required idempotency or retry behavior for disconnect-after-side-effect races. No retry count or new timeout is authorized here.

## Disconnect outcome semantics

For `continue_to_terminal_outcome` Functions, client disconnect is not promoted to an application cancellation signal. Server work continues under the endpoint's existing transaction, dependency-deadline, and platform-lifetime behavior. The client may lose the response, but this policy does not create a second abort path or silently reinterpret that lost response as rollback.

For `not_yet_authorized_for_cancellation` Functions, the same fail-closed behavior remains until an end-to-end cancellation primitive is owned.

## Observability and drift

The deterministic policy regression must:

- enumerate every deployed `api/**/*.ts` Function and require an explicit class;
- require `vercel.json` cancellation opt-in to equal the `cancel_on_disconnect` subset exactly;
- reject a wildcard cancellation configuration;
- keep the two mixed/durable dispatchers (`api/birth-profiles.ts`, `api/me.ts`) non-cancellable at Function level.

Any future asynchronous cancellation activation must add deterministic abort-race coverage for the resources it actually touches before Production activation.

## Non-authority

This policy does not authorize or change:

- request/response byte limits;
- rate limits or abuse thresholds;
- retries;
- PostgreSQL query deadline values;
- request-body EOF/completion deadlines;
- pagination sizes;
- payment/Commerce activation;
- durable-command semantics;
- existing dependency timeout values.

Independent issues including #680, #681, #682, #684, #696, #699, #700, #715, #646, #647, and #389 remain separate.