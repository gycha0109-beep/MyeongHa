# SRC-38 — Character Runtime Fact Authority Binding

> Status: **BLOCKING BEFORE PRODUCTION CHARACTER FACT / DISCLOSURE RETRIEVAL BINDING**  
> Date: **2026-09-30**

## 1. Problem

Character Bible Standard v1 now separates three axes for Character facts:

```text
source_authority
character_knowledge
disclosure_default
```

and permits a Fact Authority & Biography Closure Appendix as an index over the human-authored A–K Bible.

The repository also has an experimental machine-readable foundation:

```text
docs/character/schema/character-manifest.v0.schema.json
```

but that schema explicitly declares:

```text
status = EXPERIMENTAL_NOT_RUNTIME_BOUND
```

and its own comment says it must not be hand-authored as a second Canon and is not yet bound to Runtime implementation.

Therefore the repository currently has no source-authorized Production path that may claim:

```text
Character Bible
→ compiled/extracted authoritative fact record
→ server Runtime fact metadata/value read
```

without adding authority that source has not yet granted.

## 2. What source authority already fixes

Character Bible Standard v1 fixes the meaning of:

```text
CANON
SOFT_CANON
AUTHOR_UNDEFINED
INTENTIONALLY_OPEN
WORLD_DEPENDENT

KNOWN
PARTIAL
UNKNOWN_TO_CHARACTER
NOT_APPLICABLE

PUBLIC
FAMILIAR
ATTACHED
DEEP_TRUST
CONTEXTUAL
NEVER
NOT_APPLICABLE
```

Character Runtime Standard v1 fixes the ordering:

```text
USER CLAIM
→ INTEGRITY / SOURCE CHECK
→ DISCLOSURE ELIGIBILITY
→ ALLOWED RETRIEVAL
→ CHARACTER ACTION
```

and specifically requires sensitive content retrieval to happen **after** disclosure eligibility.

The Standard also fixes that an eligible disclosure over an unresolved source fact must not invent biography and should become authority abstention / authoring debt.

These semantics are sufficient to implement deterministic preflight and a two-phase server read seam.

## 3. What is still missing

### 3.1 Production fact source

Source has not yet designated one of the following as the Production runtime fact authority:

- generated Character Manifest instances;
- a persisted Character fact table;
- immutable content-bundle fact artifacts;
- a compiled TypeScript registry;
- another governed source.

The experimental manifest schema alone is not that decision.

### 3.2 Compiler / extractor authority

If Character Manifest becomes the runtime source, source has not yet fixed:

- the compiler/extractor implementation;
- which Bible version/revision is accepted;
- how A–K + Closure Appendix are transformed;
- how conflicts between prose and appendix are surfaced;
- how build/release proves the manifest came from the approved Bible;
- whether unresolved entries must always materialize explicitly.

Runtime must not parse Markdown heuristically or use an LLM to manufacture authoritative fact records.

### 3.3 Topic / fact selector authority

Runtime Standard discusses a compact `topic_key`, while the experimental manifest is keyed by `fact_key`.

Source has not yet fixed:

- whether topic and fact keys are identical;
- whether one topic may map to several facts;
- who owns that mapping;
- how unknown topic/fact selectors fail closed.

The new server seam therefore accepts an already server-resolved exact `factKey` and does not classify raw user prose.

### 3.4 Relationship-stage disclosure mapping

Current Relationship Runtime exposes an authoritative projection containing:

```text
stageKey
closenessBand
trustBand
frictionBand
```

Character Runtime Standard describes disclosure stages:

```text
PUBLIC
FAMILIAR
ATTACHED
DEEP_TRUST
```

Source has not yet fixed a universal deterministic mapping from arbitrary Relationship `stageKey` values to these disclosure stages, nor a universal minimum trust threshold per topic.

The server fact-access seam therefore requires already server-resolved disclosure-stage / trust-policy inputs and does not derive them from client input or invent thresholds.

## 4. Implemented safe boundary

The repository may safely implement:

```text
1. exact Character + fact selector
2. metadata-only authority read
3. source/knowledge/disclosure preflight
4. no content read when blocked/unresolved
5. bounded content read only after ALLOW/PARTIAL
6. metadata/content identity + source revision re-check
```

This is implemented as a port boundary and does not itself nominate a Production fact store.

The content port is never called when:

- relationship/disclosure gate is closed;
- Character-specific boundary denies access;
- source authority is AUTHOR_UNDEFINED;
- source authority is INTENTIONALLY_OPEN;
- source authority is WORLD_DEPENDENT;
- the Character does not know the fact.

In particular, Principle / Calling / oath remain WORLD_DEPENDENT and are not materialized merely to make Runtime retrieval complete.

## 5. Implementation must NOT invent

Until this source gap is closed, do not:

- bind `character-manifest.v0.schema.json` directly to Production Runtime as authority;
- hand-author generated manifests as a second Canon;
- parse Character Bible Markdown at request time and call the parse authoritative;
- ask an LLM to extract fact authority at runtime and treat the output as Canon;
- infer missing Character facts from personality;
- infer Principle / Calling / oath from current Character behavior;
- treat `AUTHOR_UNDEFINED` as a secret the Character knows;
- treat `WORLD_DEPENDENT` as Character-owned data;
- derive disclosure stages from arbitrary Relationship stage labels by name matching;
- choose universal trust thresholds without source authority;
- let caller/client-supplied fact content bypass metadata preflight.

## 6. Required source completion

To close SRC-38, source authority should fix at minimum:

1. the Production Character fact source;
2. compiler/extractor or persistence lifecycle and provenance;
3. exact source revision/bundle pinning;
4. topic/fact selector ownership and mapping;
5. relationship-stage → disclosure-stage policy, or an explicit per-fact governed policy;
6. trust/context policy authority;
7. how previous disclosure history is persisted and read;
8. release compatibility / migration behavior when a Bible fact changes authority or disclosure policy.

## 7. Definition of Done

SRC-38 is CLOSED only when the server can answer, without heuristic invention:

```text
For this exact pinned Character version and exact fact selector:
- what source-authorized metadata applies?
- may this Character know it?
- may this user receive it now?
- what exact depth may be retrieved?
- what exact source revision produced the value?
```

and the resulting fact value is read only after that decision.

Until then:

```text
Runtime preflight semantics                 IMPLEMENTED
two-phase server fact authority seam        IMPLEMENTED
Production Character fact source            OPEN
Bible → runtime fact compiler/extractor     OPEN
topic/fact selector authority               OPEN
relationship disclosure-stage mapping       OPEN
Production live binding                     BLOCKED
```
