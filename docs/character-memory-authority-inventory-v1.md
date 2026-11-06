# Character Working Memory — Authority Inventory v1

> Watchtower-Track: character-memory  
> Status: PHASE 1 READ-ONLY PROJECTION IMPLEMENTED / NOT WIRED TO PRODUCTION MODEL EXECUTION  
> Date: 2026-11-07

## 1. Purpose

This document records the existing authoritative sources used by the shared Character Working Memory projection. The projection is a read-only view for one canonical Subject, one active Character, and one server-bound conversation thread.

It does not create a new memory database, infer facts, approve new Memory schemas, change grants, mutate relationship state, or retrieve Official Reading/Saju content.

## 2. Existing authority map

| Product meaning | Existing authoritative source | Existing read boundary | Working Memory treatment |
|---|---|---|---|
| Canonical owner | \`subjects\` and transaction-local \`myeongha.subject_id\` | \`executePostgresSubjectTransactionV1\` + \`assert_myeongha_subject_context_v1\` | Required scope for every read |
| Conversation history | \`conversation_threads\`, \`chat_turns\`, \`conversation_messages\` | \`qry_reader_context_recent_messages_v1\` | Current thread only; redacted/payload-only messages excluded by SQL |
| Structured user-life facts | \`life_facts\` | \`qry_reader_context_granted_life_facts_v1\` | Current, non-revoked, non-superseded rows with active grant to the exact Character |
| Character/conversation memories | \`memory_items\` | \`qry_memory_items_v1\` + \`qry_memory_active_grants_v1\`; new batched wrapper \`qry_reader_context_granted_memory_items_v1\` | Current, non-revoked rows with active explicit grant to the exact Character |
| Memory candidate staging | \`memory_proposals\` | Existing proposal resolution authority | Not a committed memory source; excluded |
| Character access permission | \`record_access_grants\` | Active grant query and RLS-bound API executor | The only durable Character visibility source for Life Fact/Memory |
| Current relationship | \`user_character_states\` | \`qry_character_relationship_v1\`; Se-yeon Production has its own pinned runtime read | Read existing projection only; never create a baseline or calculate new scores |
| Relationship history | \`relationship_events\` and Se-yeon relationship history ledger | \`qry_reader_context_relationship_events_v1\` / pinned Se-yeon history read | Generic projection exposes event metadata only; it does not invent event meaning or score deltas |
| Official Saju Reading | \`reading_sessions\`, \`readings\`, \`reading_refs\`, Reader access/interpretation grants | \`character-standard-reading-knowledge\` exact Reader access + immutable artifact re-read | Separate protected context path; never merged into general Memory |
| Character Canon | immutable \`content_bundles\` / published runtime sources | Existing content release and Character runtime binding | Remains a separate authority layer, not user Memory |

## 3. Existing implementation reused

- \`apps/api/src/memory-items-read.ts\` and \`memory-grants-read.ts\`: owner-visible current Memory and per-record grant reads.
- \`apps/api/src/reader-context-non-memory-read.ts\` and \`postgres-reader-context-non-memory.ts\`: exact Character-granted Life Facts, relationship-event metadata, and recent thread messages.
- \`apps/api/src/character-relationship-read.ts\` and \`postgres-character-relationship-read.ts\`: read-only current relationship projection.
- \`apps/api/src/seyeon-production-context-read-v1.ts\` and \`postgres-seyeon-production-context-read-v1.ts\`: existing Se-yeon-specific personal-record and pinned relationship-history path. Its positive personal-record projector registry remains empty while SRC-25 is unresolved.
- \`apps/api/src/character-standard-reading-knowledge.ts\`, \`postgres-character-standard-reading-knowledge.ts\`, and \`character-standard-reading-protected-context.ts\`: exact Reader-scoped Official Reading source and protected projection.
- \`packages/domain/src/character-runtime-context.ts\` and \`seyeon-runtime-context-v2.ts\`: existing Character context assembly contracts.

## 4. Phase 1 implementation

### 4.1 Batched exact-Character Memory read

Migration \`2330_reader_context_granted_memory_projection_v1.sql\` adds one read-only SQL function. It composes the existing owner-current Memory query with the existing active-grant query and returns only rows granted to the requested Character.

It:
- requires the transaction-local canonical Subject to match the requested Subject;
- returns only current, non-revoked Memory Items;
- requires an active explicit grant to the exact Character;
- excludes private, ungranted, other-Character-only, and revoked records;
- grants EXECUTE only to \`myeongha_api_executor\`;
- adds no table, column, write path, or schema registry.

### 4.2 Shared read-only projection

\`packages/domain/src/character-working-memory-projection-v1.ts\` defines the provider-neutral projection contract. \`apps/api/src/character-working-memory-context-v1.ts\` reads the existing authority ports and composes one projection for a server-bound thread turn.

The projection separates:
- approved Life Fact / Memory summaries with record and grant provenance;
- unsupported type/schema admissions, which expose no payload to model context;
- current relationship projection pinned to the exact turn revision;
- relationship event metadata, explicitly marked metadata-only;
- recent same-Character/user dialogue;
- the exact current User message, which remains separate from the prior dialogue window.

Messages from another Character and system messages are excluded from this initial single-Character projection. A future shared multi-Character context requires a separate explicit visibility authority.

### 4.3 Schema admission remains closed by default

The projection accepts only an explicit server-owned projector for an exact record kind, type, and schema version. No projector is implicitly registered. Without one, the record receives \`UNSUPPORTED_SCHEMA\` and its payload is not copied into the projection.

This preserves SRC-25. The existing \`conversation_recall/v1\` codec remains a contract candidate and is not automatically enabled in Production.

### 4.4 Protected Saju remains separate

The Working Memory API does not accept \`saju\`, \`protectedSaju\`, or \`officialReading\` input. Official Reading context must continue through exact Reader access, immutable artifact provenance, and the protected Character Saju path. Aggregate entitlement, general Memory, or browser-carried prose cannot widen Reader Knowledge.

## 5. Known gaps preserved

| Gap | Current handling |
|---|---|
| SRC-25 positive Life Fact / Memory schema registries | No default projector; unsupported payloads remain outside model context |
| SRC-05 rejected/session-only proposal retention | Proposals are not read as durable Memory; no staging retention change |
| SRC-10 grant create/regrant authority | No grant writes; only current active grants are read |
| SRC-22 relationship event evaluator | Relationship history is metadata-only; no score/stage/anti-farming logic added |
| O-C1-07 Provider/model/fallback selection | Projection is provider-neutral and does not dispatch a model |
| Paid model evaluation hold | No paid call or live evaluation |
| Official Reading Production chat gate | Reader Knowledge remains on its existing separate gated path |
| Original source-turn/message columns | Current Reader read projections do not return all source-turn/message fields; this version preserves record and grant IDs and does not fabricate missing provenance |

## 6. Verification

- Unit tests cover explicit grant scope, unsupported schemas, payload non-exposure, relationship revision pinning, event revision bounds, message separation, and protected Saju separation.
- PostgreSQL tenant test covers exact-Character grants, private Memory exclusion, revoked grant/item exclusion, cross-Subject denial, and the transaction-local Subject boundary.
- PostgreSQL adapter test verifies the new query binding and row mapping.
- No Production model route, provider, durable write, Memory schema registry, or Character activation is connected by this phase.
