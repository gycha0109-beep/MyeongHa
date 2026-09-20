# Official Reading → Reader Chat Context v1

> Status: **IMPLEMENTED SERVER COMPOSITION / PUBLIC CHAT EXECUTION STILL GATED**  
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

## Remaining gate

This slice intentionally returns a Character runtime **context-assembly input**.
It does not weaken `assembleCharacterRuntimeContext`'s current Production Saju
admission guard and does not expose a public Chat send route.

The next activation step must resolve the existing upstream Production Saju
semantic/public-Chat authority gate rather than bypass it.


## Relationship to Reader Interpretation Preview

This slice does not merge or promote PR #1137. It completes the Mode A exact-text
Official Reading path needed for safe Reader follow-up context. Character-specific
semantic realization remains a separate reviewed/approved path.
