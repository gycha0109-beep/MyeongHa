# Se-yeon Production Runtime Composition V1

Status: internal dogfood runtime only
Watchtower-Track: character-memory

## 1. Purpose

PHASE R composes the authoritative Se-yeon Character runtime pieces into one
server-owned internal execution boundary without opening public/browser Chat.

The caller supplies only verified Subject evidence plus an existing Se-yeon
thread and one text turn. Relationship state, memories, relationship bands,
governance decisions, pinned content identities, and truth authority remain
server-owned.

## 2. Runtime flow

```text
verified identity evidence
→ canonical Subject
→ owned active thread binding
→ pinned release / bundle
→ exact bundle manifest
→ internal pinned receive plan
→ Production relationship read
→ Production context read
→ server relationship-band projection
→ Production Integrity / Disclosure governance
→ structured provider
→ Se-yeon governed runtime
→ generated / validated / committed Chat persistence
→ durable post-turn analysis outbox
→ return committed assistant text
```

The runtime is deliberately fixed to:

```text
publicRoute = null
routeMounted = false
browserAuthority = false
relationshipMode = WRITE_DARK
postTurnExecution = DEFERRED
clientCompatibilityVerdict = false
existingSingleCharacterThreadRequired = true
```

## 3. Content authority

The internal dogfood path accepts only an already-owned active thread whose
participant set is exactly `['seyeon']`. It reuses the thread-pinned release,
thread-pinned bundle, and exact immutable bundle manifest projection.

It does not choose a new release, create a new thread, decide rollout, decide
client compatibility, compare capability versions, or invent publication
assets. SRC-15 therefore remains unresolved for public activation.

## 4. Relationship band projection

Caller-provided bands are removed from the Production composition path.
Closeness/trust bands are derived from the frozen `relationship-policy-v1`
stage-gate score floors. Friction is derived from relationship condition rather
than an invented numeric threshold:

```text
STABLE            → low
RESOLVED_RECENTLY → medium
OPEN_CONFLICT     → high
```

## 5. Governance

Production governance is server-owned and conservative. Model classification
is never truth authority. Unsupported Character fact, shared-event, or
relationship-status claims remain UNVERIFIED and cannot become Working Context
facts or mutate relationship state.

Sensitive disclosure is resolved against the authored Se-yeon Fact Authority
registry. Undefined biography remains undefined regardless of relationship
depth. Private-source retrieval remains empty until exact source-backed
retrieval authority exists.

## 6. Structured provider

`createOpenAiSeyeonStructuredProviderV1` binds the structured-provider port to
the Responses API using a server-owned credential/model, native fetch,
`store: false`, strict JSON Schema output, explicit timeout, no implicit retry,
and fail-closed refusal/malformed-output handling.

Provider output may support classification, interpretation, rendering, review,
and event extraction, but does not directly become durable biography or
relationship authority.

## 7. PostgreSQL transaction shape

Model network I/O must not occur while a Subject transaction is held.
`createSeyeonProductionSubjectTransactionRunnerV1` and
`createSeyeonProductionTransactionalPortsV1` therefore open one short
Subject-bound transaction per authority operation and revalidate the canonical
Subject on every operation.

## 8. Deferred worker flow

Chat execution uses DEFERRED post-turn mode.

Worker A — `createProductionSeyeonPostTurnWorkerRuntimeV1`:

```text
claim durable post-turn job
→ validate immutable snapshot/hash
→ event extractor
→ Event Authority
→ Production admission
→ immutable checkpoint
→ enqueue relationship-sync outbox
→ complete post-turn job
```

Worker B — `createProductionSeyeonRelationshipWorkerRuntimeV1`:

```text
claim relationship-sync outbox
→ lock/replay Production relationship history
→ deterministic policy evaluation
→ atomic append/apply
→ complete relationship-sync job
```

The Chat runtime never directly mutates Production relationship state.

## 9. Retry invariants

- committed `clientTurnId` replay returns stored assistant material;
- DEFERRED replay does not invoke the model;
- post-turn retry after checkpoint does not rerun extractor;
- relationship apply remains idempotent through existing PHASE M/N/O authority.

## 10. Non-goals

This phase does not expose public Chat HTTP, resolve SRC-15 compatibility,
create new durable Life Fact/Character Memory types, close SRC-25, let LLM
output directly write durable Memory, or treat relationship depth as missing
biography authority.

## 11. Internal dogfood readiness

Internal execution requires a verified identity, an owned active single-character
Se-yeon thread, a pinned bundle containing Se-yeon, PostgreSQL runtime
credentials, and a configured structured provider. Public launch readiness is
a separate decision.
