# Se-yeon Internal Dogfood & Long-Run Validation V1

Status: PHASE S implementation started
Watchtower-Track: character-memory

## Purpose

PHASE S proves that the already-composed Se-yeon Production runtime behaves
correctly across real sequential turns. It does not create a public Chat route,
new personal-memory authority, or new relationship semantics.

## Current implementation slice

The first slice adds an internal-only harness around the existing Production
runtimes:

```text
Production Se-yeon Chat runtime
→ committed Chat / deferred post-turn outbox
→ Production post-turn worker
→ Event Authority / Production admission
→ relationship-sync outbox when admitted
→ Production relationship worker
→ deterministic relationship apply
```

The harness remains fixed to the PHASE R boundary:

```text
publicRoute = null
routeMounted = false
browserAuthority = false
relationshipMode = WRITE_DARK
postTurnExecution = DEFERRED
existing single-character Se-yeon thread only
```

Worker draining is operator-driven by the internal harness. The public Chat
response path remains deferred and is not changed.

## Replay invariant

A committed Chat replay returns the stored assistant material from the existing
Production Chat runtime and the harness does not invoke either downstream
worker again.

## Relationship invariant

The harness only invokes the relationship worker when the post-turn worker
returns an authoritative `enqueued` decision. `none`, `rejected`,
`disabled`, and `shadow` results never cause Production relationship apply.

When relationship apply runs, the harness surfaces only existing authoritative
apply evidence, including `revisionBefore`, `revisionAfter`, `applied`, and
`replayed`.

## Non-goals

- public/browser Chat activation
- new thread creation or rollout selection
- SRC-15 compatibility resolution
- new Life Fact / Character Memory type or write path
- SRC-05 / SRC-10 / SRC-25 resolution
- new retry/dead-letter policy for SRC-30
- generic multi-character abstraction
- Character-quality PASS declaration before long-run dogfood

## Next validation slice

After this harness is green, PHASE S continues with:

1. deterministic Production-composition integration against a controlled DB;
2. committed replay verification with provider-call counters;
3. post-turn checkpoint/retry fault cases;
4. relationship apply replay/duplicate checks;
5. configured-provider live internal dogfood when credentials are available;
6. 10–30 turn scenario suites for first meeting, accumulation, false shared
   memory, undefined biography, progression, conflict, reconciliation, and
   return-after-absence;
7. separate technical-integrity and Character-quality verdicts.


## Fault-boundary regression coverage

The harness regression suite now also verifies:

- every non-`enqueued` post-turn decision skips relationship apply;
- an unexpected non-deferred Chat result fails closed;
- canonical Subject drift between Chat, post-turn, and relationship workers fails closed;
- a post-turn worker crash propagates without attempting relationship apply.

These tests complement the existing lower-level post-turn checkpoint/retry and
relationship-event idempotency tests. They do not invent an SRC-30 retry policy.
