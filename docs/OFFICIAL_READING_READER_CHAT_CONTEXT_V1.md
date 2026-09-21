# Official Reading → Reader Chat Context v1

> Status: **IMPLEMENTED SERVER COMPOSITION + PRODUCTION RUNTIME ADMISSION / PUBLIC CHAT SEND STILL GATED**  
> Date: 2026-09-21  
> Depends on: #1142, #1147

## Purpose

This slice makes the Reader follow-up Chat data path explicit without accepting
browser-carried Saju prose as authority.

```text
server-resolved subject
+ active Reader
+ Official Reading id
        ↓
Reader access authority re-read
        ↓
raw Official Reading artifact re-read
        ↓
Official Reading provenance correlation
        ↓
#1147 protected Character Saju projection
        ↓
Character Chat context assembly input
        ↓
owned active single-Character thread re-read
        ↓
thread Reader + content bundle correlation
        ↓
Production Character runtime context
```

## Invariants

- caller-supplied `saju` context is rejected before authority lookup;
- exact Reader access is re-resolved server-side;
- raw Official Reading is independently re-read server-side;
- Reading/Product/Reader/contract/response-hash drift remains fail-closed in the
  upstream Reader Knowledge resolver;
- active Character identity must equal the Reader that owns access;
- active Character published capability must cover the Official Reading domain;
- protected text comes only from the pinned Official Reading response projection.

## Non-authority

This boundary does not use:

- `sessionStorage`;
- URL topic/scope;
- client-carried Reading prose;
- Preview output;
- Character-authored Saju semantics.

## Production runtime admission

The server-only composer now mints an in-process authority plan. Only that exact
plan object may enter the Official Reading Production runtime assembly seam.
Structural lookalikes are rejected.

The ordinary `assembleCharacterRuntimeContext` path remains fail-closed for
direct Saju injection in Production, so this does not turn client-carried Saju
data into authority.

## Server receive → Reader runtime preflight

The non-generative turn preflight now requires an exact `ChatReceivePlan` object
minted by `prepareChatReceiveCommand`. A structural lookalike is rejected before
thread or Reader Knowledge authority lookup.

For an existing Reader thread, preflight then independently re-reads the owned
thread and Official Reading runtime and requires the receive-plan release/bundle
to still match the current thread binding. It does not call a model/provider,
create a durable turn/attempt, commit a Character message, or reveal output.

This does **not** weaken `SRC-15`. Current client/content compatibility comparison
authority is still unresolved, so Production `ContentReleaseRuntime` cannot mint
a positive compatible receive plan today. The preflight therefore remains
fail-closed until a source-authorized compatibility verdict exists.

## Remaining gate

The thread-bound server composition is now implemented: active owned thread,
single Reader identity, active content bundle, Reader access, and Official Reading
artifact provenance must all correlate before Production runtime assembly.

Production DB Reader Knowledge is now reachable only through transaction-subject-
bound server runtime wrappers. The migration-1220 INTERNAL source functions and
raw authority tables remain ungranted to ordinary runtime roles.

No public Chat send route is activated by this slice. Actual public send remains
fail-closed until `SRC-15` compatibility authority and the receive/generate/
output-guard/commit transport are promoted through the same server-owned thread
and Official Reading authority path.


## Relationship to Reader Interpretation Preview

This slice does not merge or promote PR #1137. It completes the Mode A exact-text
Official Reading path needed for safe Reader follow-up context. Character-specific
semantic realization remains a separate reviewed/approved path.
