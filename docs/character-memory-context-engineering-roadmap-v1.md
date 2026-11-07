# MyeongHa Persistent Memory & Context Engineering Roadmap v1

> Watchtower-Track: character-memory
> Status: APPROVED ROADMAP / IMPLEMENTATION NOT COMPLETE
> Date: 2026-11-07
> Parent runtime track: PR #3068
> Baseline commit: `29f58f4d7dcac0f00ea21c0f0ed32d3ede68a9bd`

## 1. Goal

Build a shared, provider-neutral Memory and Context Engine for MyeongHa Character Chat. The engine must preserve long-term conversational continuity while sending each model only the information required for the current turn, within a measured model-specific token budget.

The system must:
- preserve original conversation evidence and provenance;
- distinguish durable facts, episodic memories, relationship events, session-only context, character knowledge, and protected Saju Reading knowledge;
- retrieve only information the current Subject and Character are authorized to access;
- select context according to relevance, causal dependency, salience, unresolved state, recency, and explicit callbacks;
- measure the exact serialized model request and enforce input/output/cost limits before dispatch;
- preserve Character Canon, personality, epistemic boundaries, and Saju semantic authority;
- evaluate recall quality, false recall, privacy boundaries, continuity, cost, and latency over multi-session conversations.

This roadmap extends the existing Character Runtime and Memory authority. It does not replace them with a third-party agent framework or a new independent memory database.

## 2. Baseline and current implementation status

### 2.1 PR #3068 baseline

PR #3068 remains **Open / Draft / not merged**. The original baseline commit is `29f58f4d7dcac0f00ea21c0f0ed32d3ede68a9bd`. Current implementation changes are carried on `feat/character-memory/five-character-chat-runtime-bridge-20261106`; the live head and check results are tracked on PR #3068 rather than duplicated as static counts here.

The original baseline contains:
- independent Character room selection and server-side turn gateway foundations;
- source-bound four-Character execution orchestration contract;
- immutable published-source/hash validation foundations;
- PostgreSQL 17 disposable integration coverage for turn persistence, receipt issuance, ACK/idempotency and DB authority boundaries;
- shared four-Character length constants and boundary tests;
- existing message and generated-reply guard: 8,000 UTF-16 code units;
- existing canonical-context guard: 32,768 UTF-16 code units.

The PR remains Draft because the four additional Characters are not yet production-ready live AI chat targets. Recent Memory retrieval work remains read-only and does not activate those Characters or connect a Production model route.

### 2.2 What the current length limits do not mean

The 8,000 / 32,768 values are JavaScript UTF-16 string-length safety bounds. They are **not**:
- tokenizer measurements;
- a model Context Window definition;
- a dynamic context budget;
- a provider-enforced output-token cap;
- an AI cost ceiling.

Keep these existing guards while introducing model-specific token accounting. Do not convert character counts into token counts using a fixed multiplier.

### 2.3 Existing implementation that must be reused

- Character Runtime Standard v1: Context Layers, retrieval signals/rules, Memory Rules, Token / Context Pressure Drop Order, evaluation axes.
- AI Character Runtime Specification v0.4: server retrieval, policy-filtered Context Assembler, Renderer, Output Guard, atomic commit and controlled reveal.
- Relationship / Life Record / Memory Policy v0.5: Life Fact, Character Memory, Session-only Context, Memory Proposal resolution and access grants.
- C09 long-term persona-memory and epistemic-boundary research: Fact Memory vs Insight Memory, source/time provenance, character knowledge boundaries, retrieval-versus-mention distinction, multi-session evaluation.
- Existing Cost Governor and PR-04D2 input-token-count work: reuse their contracts and verified adapters; do not recreate a parallel cost ledger or token-count service.

## 3. Non-negotiable authority and privacy rules

1. **Original conversation is evidence, not automatically durable memory.** Preserve original turns under existing conversation retention/deletion rules. Derived summaries and memories must retain source references.
2. **Storage is not retrieval.** A record is not placed into every prompt merely because it exists.
3. **Retrieval is not disclosure.** Disclosure/entitlement/access checks precede sensitive-content retrieval. Do not retrieve private data and rely on a prompt instruction to hide it.
4. **Retrieval is not mention.** The model may use a relevant memory without explicitly announcing it.
5. **Subject ownership and grants remain authoritative.** Use existing server-pinned Subject identity, active `record_access_grants`, revocation and Reader Knowledge/entitlement rules. No cross-Subject or cross-Character private-memory leakage.
6. **Memory proposals are not committed facts.** The LLM can propose; only the server authority can validate, resolve and commit.
7. **Session-only means non-durable.** It must not appear in durable Life Fact/Memory tables, future threads, other Characters or hidden execution-log shadow memory.
8. **Insight Memory is not Fact Memory.** A Character's interpretation may be stored as a clearly typed derived perspective, but it cannot become independent evidence about the user.
9. **Saju authority stays separate.** Only source-approved validated Reading material and the correct Reader/Character entitlement may enter the protected Saju context. Character memory retrieval cannot create or broaden Saju authority.
10. **No model or provider fallback by guess.** O-C1-07 remains open until the user-approved Provider/model/Fallback decision is recorded.

## 4. Existing source-authority blockers

The roadmap must not silently resolve these gaps through implementation assumptions:

| Gap | Impact | Permitted work before resolution |
|---|---|---|
| SRC-25 | Complete versioned positive schemas/allowlists for durable Life Fact and Character Memory values are not finalized | Reuse already-valid record reads, grants, revokes and provenance. Do not create arbitrary new durable values or invent registries. |
| SRC-05 | Retention/privacy semantics for rejected and session-only proposal payload staging remain unresolved | Do not introduce a long-lived shadow proposal store or silently retain rejected/session-only payloads. |
| SRC-10 | Grant create/regrant authority remains an independent gate where applicable | Reuse valid existing grants; do not invent grant creation/regrant behavior. |
| O-C1-07 | Provider, model and fallback selection unresolved | Implement provider-neutral contracts and offline tests; do not set model IDs, token windows, prices or output caps. |
| Paid-evaluation lock | Real paid model evaluation remains held by the existing cost-incident controls | Offline/mock/fixture evaluation only until a separately approved, hard-capped evaluation path exists. |
| SRC-15 / SRC-16 | Character source/content publication requirements remain outstanding for the four additional Characters | No invented canon/assets, publication or Production activation. |

SRC-22 governs executable relationship-event scoring/stage/anti-farming semantics. It is required before implementing any new relationship-state mutation policy, but it must not block read-only memory retrieval or Context assembly that consumes the already-authoritative relationship projection.

## 5. Roadmap phases

### Phase 0 — Preserve and close the current chat-runtime baseline

**Status: Implemented at PR #3068 head; PR remains Draft and unmerged.**

- Preserve the six visible discovery cards and current Yunho exclusion.
- Preserve independent room/thread ownership, immutable source pinning, turn persistence, receipt and ACK authority.
- Preserve PostgreSQL 17 and DB privilege verification.
- Keep the existing UTF-16 length guards as defensive bounds.
- Do not claim live AI execution for Baekheon, Yeoul, Rahyeon or Taegyeom.

**Exit evidence:** the original baseline evidence is anchored at `29f58f4`; subsequent implementation commits and current CI evidence are tracked on PR #3068.

### Phase 1 — Authority contract and data-source inventory

**Status: READ-ONLY CORE IMPLEMENTED; not connected to Production model execution.**

1. Inventory existing conversation, turn, Life Fact, Memory Item, Memory Proposal, access-grant, relationship-event, Reader Knowledge and Reading records. **Implemented in `docs/character-memory-authority-inventory-v1.md`.**
2. Map each record type to its authoritative owner, Subject scope, Character visibility, disclosure gate, lifecycle and revocation behavior. **Implemented for the currently exposed read fields and grants.**
3. Define a versioned, read-only Working Memory projection using only already-authoritative fields and existing grants. **Implemented as `character-working-memory-projection-v1` and the server-side read composer.**
4. Separate the logical memory categories:
   - episodic event memory;
   - factual/user-state memory;
   - derived Character insight;
   - relationship event/projection;
   - session-only context;
   - protected Saju Reading knowledge.
5. Record unresolved source decisions against SRC-25, SRC-05 and SRC-10. Resolve them through source-authority documents before enabling blocked writes.
6. Do not add a new vector database, graph database, or replacement memory store. First prove whether existing PostgreSQL structures and indexes can support the required reads.

**Exit criteria:**
- every projected Life Fact/Memory summary carries its record ID and active grant ID; unsupported schemas expose no payload;
- cross-Subject, ungranted Character, revoked Memory/grant and non-current Life Fact reads are excluded by the existing DB authorities;
- recent dialogue is thread-bound, redacted messages are excluded, and the exact current User message is kept separate;
- relationship projection is read through a transaction-Subject-bound, least-privilege wrapper and pinned to the exact turn revision; generic relationship-event data remains metadata-only;
- Official Reading/Saju is excluded from general Working Memory and remains on its exact Reader-authorized protected path;
- session-only proposals are not read as durable Memory and this read-only projection has no write/grant/mutation capability.

**Known limitation:** the provenance-enriched Reader projections now return source-turn/message/merge references and Life Fact validity/confirmation fields when those values are stored. Missing source references remain NULL; no source field or relationship is inferred.

### Phase 2 — Provider-neutral Token Budget Manager

**Status: PROVIDER-NEUTRAL PROFILE AND EXACT-REQUEST PREFLIGHT IMPLEMENTED; real model profile and four-Character Production wiring remain HOLD pending O-C1-07 and the existing Cost Governor operational gates.**

1. Define a provider-neutral model profile contract. **Implemented** in \`packages/domain/src/model-token-budget-profile-v1.ts\`. It carries the server-owned provider/model identity, context/input/output ceilings, reserved headroom, serialized-byte ceiling, token-counter adapter identity/request format, and pricing version.
2. Do not populate real model values until O-C1-07 is resolved. **Still on hold; no real model profile is registered.**
3. Count the exact serialized request that will be dispatched. **Implemented** by \`certifyModelTokenBudgetV1\`; UTF-8 byte parity is checked and the exact immutable body is passed unchanged to the counter adapter.
4. Reuse the existing official OpenAI Responses input-token-count adapter only for the exact supported native Responses request shape. **Implemented** as an explicit opt-in binding in \`apps/api/src/seyeon-model-token-budget-profile-v1.ts\`; its current opt-in/unsupported-provider/Production-hold constraints remain in force.
5. For another Provider, require its exact supported tokenizer/count contract. **The generic adapter boundary is implemented; no unsupported Provider is registered and no character-count estimate is permitted.**
6. Compute the input budget after reserving output tokens and approved headroom. **Implemented**: adapter upper bounds must include the exact profile headroom, and the actual Provider output cap must equal the profile cap.
7. Bind the resulting reservation to the exact model and price version through the existing Cost Governor. **Implemented at the handoff boundary**: the certified receipt is converted to the existing Cost Governor quote and the exact atomic-admission call input; the existing DB RPC remains the only reservation authority.
8. On unknown model, unsupported request shape, count mismatch, timeout, missing usage, exceeded budget or missing output cap: fail closed before Provider dispatch, or preserve the existing unknown-usage hold semantics after dispatch. **Pre-dispatch profile/count/output-cap failures are covered by offline tests; post-dispatch unknown-usage behavior remains under the existing Cost Governor contract.**

**Exit criteria:**
- exact request-count parity is covered by the generic profile tests and existing PR-04D2 count/generation parity tests;
- over-budget/count-failure paths are covered as pre-dispatch failures; existing PR-04D2 tests verify zero Provider calls and zero cost reservations when certification fails;
- output-token cap is checked by the generic profile and remains present in the actual native Provider request;
- reservation/dispatch/settlement/unknown-usage behavior remains governed by the existing DB Cost Governor; operational closure is still required before Production ENFORCE;
- no paid Production evaluation or inference is activated by this phase alone.

**Implementation record:** \`docs/character-memory-token-budget-profile-v1.md\`.

### Phase 3 — Permission-first Hybrid Memory Retrieval

**Status: INITIAL READ-ONLY RETRIEVAL CORE IMPLEMENTED; PHASE 3 NOT COMPLETE.**

1. A single server-side entrypoint is implemented as `retrieveCharacterWorkingMemoryForTurnV1`. It is scoped to the canonical Subject, selected Character and server-bound thread. The existing Capability Gate runs before any Memory, Life Fact, relationship or message read. The query is taken from the exact current User message returned by the authoritative thread read.
2. Access controls currently applied:
   - server-resolved consent, entitlement, content-policy, world-state and client-capability inputs must pass the existing Capability Gate before reads;
   - PostgreSQL v2 projections reuse the existing current-owner, exact-Character active-grant, revocation and supersession authorities;
   - Life Facts outside their valid-time interval are removed using the same server `asOf` instant before projection; future source/grant/confirmation timestamps fail closed during retrieval;
   - this path does not read Character-private biography or Official Reading/Saju. Character-private sources must continue through the separate disclosure preflight, and Saju remains on the exact Reader Knowledge path.
3. Implemented retrieval signals:
   - lexical token coverage and phrase match;
   - server-owned projector relevance and salience;
   - explicit callback detection and callback priority;
   - generic callback fallback when the user asks to recall a previous conversation without a topical keyword; this fallback is Memory-only and prefers the most recent episode;
   - bounded recency: topical queries use source time only after callback, phrase, lexical, salience and relevance ordering; generic callback fallback uses episode recency first.
   Exact Subject/Character/grant scope remains a hard filter, not a ranking bonus.
4. The current retrieval mode is explicitly `lexical+metadata`. Semantic/vector retrieval is not enabled because no approved embedding/index contract is present in the existing source. Graph traversal is not enabled because the current source records do not expose proven causal edges. No new database or vector infrastructure was added.
5. Causal event grouping, unresolved-thread weighting, relationship relevance, contradiction risk and repetition penalty are not yet implemented. The current source projection does not provide authoritative record-to-event links or approved values for these signals; they will not be guessed from prose.
6. Selected records retain record/grant IDs, grant reason/time, stored source references and relevant timestamps. The v2 SQL projections return stored Memory source turn/message/merge references and Life Fact source/validity/confirmation/creation fields. Missing references remain NULL and are never fabricated.
7. `retrieve != mention` is preserved. The API entrypoint returns selected retrieval records plus non-content context metadata; it does not return the entire unselected projection and does not force the Character to mention a recalled fact.

**Exit evidence implemented so far:** unit coverage for lexical relevance, explicit/generic callback, unsupported-schema non-exposure, temporal Life Fact validity, exact Subject/Character/thread scope and selected-record-only output; SQL coverage for v2 function ACLs, source provenance, active grants, no-grant Character isolation and cross-Subject denial.

**Additional exit evidence submitted for CI:** multi-session relevant/irrelevant recall and abstention tests, generic callback bounded selection, and PostgreSQL v2 revoked-grant/superseded Life Fact denial. These must pass on the latest head; submitting tests is not proof of a green run.

**Remaining Phase 3 exit work:** establish the latest-head green CI and evaluate any uncovered source-supported signals or retrieval abstention cases. Causal/relationship/contradiction signals cannot be claimed until authoritative record links or approved policy values exist. Phase 3 is not complete, and Phase 4 must not be declared complete or started as a production context composer before these criteria are evidenced.

### Phase 4 — Dynamic Context Composer

**Status: OFFLINE EXACT-REQUEST CONTEXT COMPOSER FOUNDATION IMPLEMENTED; Production composer wiring and complete runtime layer coverage remain outstanding.**

1. Compose the Working Context from the existing Runtime Standard layers:
   - System / Safety / Product Authority;
   - Character Core Anchor;
   - current Relationship Projection;
   - current turn state;
   - Integrity/Claim and Disclosure decisions when applicable;
   - relevant Bible slices;
   - retrieved event memory with provenance;
   - unresolved threads;
   - recent dialogue window;
   - protected domain segment when authorized;
   - repetition-suppression hints;
   - response task.
2. Keep fixed context small: authority rules, Character Core Anchor and hard unknown boundaries.
3. Allocate dynamic context from the remaining model-specific token budget.
4. Preserve the existing drop order under pressure:
   1. low-relevance trivia;
   2. redundant Bible examples;
   3. resolved low-salience events;
   4. older recent dialogue already represented by an authoritative event.
5. Never drop authority/safety, current user turn, immediate recent continuity, current relationship projection, conflict/unresolved causal events or relevant Bible core merely to fit more trivia.
6. Produce a redacted, inspectable Context assembly trace: included source refs, excluded-item reason, token contribution, policy/version and final budget. Do not log raw private prompt/context or secrets into general observability.
7. Ensure the exact assembled request is the same request counted by Phase 2.

**Implemented offline foundation:** `packages/domain/src/character-dynamic-context-composer-v1.ts` receives permission-filtered retrieval output and an already-authorized read-only Working Context projection, plus trusted server-pinned Character and policy source segments. It preserves System/Safety, Character Core, the current User turn, the latest dialogue, approved Bible core and explicitly source-verified unresolved causal events. It drops low-priority trivia, redundant Bible examples, resolved low-salience events, older dialogue and finally lower-ranked retrieved memory, using the actual Phase 2 exact-request certification after each decision. Failure of token counting or an over-budget mandatory core fails closed. The trace has source IDs and certified token counts, never raw text. The implementation makes no network call, DB write, reservation or Provider dispatch.

**Offline test coverage:** deterministic order and redacted trace, mandatory-layer survival, exact UTF-8 body accounting, selected-memory provenance, budget failure on an oversized mandatory core, scope mismatch, unknown token count and duplicate source denial.

**Remaining Phase 4 work:** wire trusted source/category admission to the runtime, include the remaining source-authorized context layers, connect the exact serialized request to the actual approved Provider dispatch path after O-C1-07, and verify Production Cost Governor/Output Guard parity. This offline foundation alone does not satisfy Phase 4 exit conditions.

**Exit criteria:**
- identical inputs/policy produce deterministic assembly decisions;
- all included items have authorized source references;
- drop-order tests prove protected layers survive context pressure;
- token budget is respected without character-count heuristics;
- private/raw content is not exposed through logs or diagnostics.

### Phase 5 — Memory Consolidation and Lifecycle

**Status: Existing proposal/approval architecture is defined; full durable consolidation is gated by source authority.**

1. Extract bounded candidates from committed conversation turns: events, user facts, preferences, commitments and unresolved topics.
2. Keep Fact Memory and Insight Memory distinct. Insight must cite the facts/events it derives from and cannot become an independent user fact.
3. Deduplicate repeated candidates and detect contradiction, temporal change and supersession.
4. Preserve source turn, speaker, timestamp, confidence/authority, valid time, extraction version and supersession/revocation lineage.
5. Use existing Memory Proposal resolution semantics: accept long-term, session-only or reject. LLM output never writes directly to Life Fact, Memory Item or Relationship state.
6. Enforce source-approved versioned type/value schemas. Do not create a generic arbitrary-JSON durable memory escape hatch.
7. Preserve current Life Fact history semantics: no overwrite; same-type changes append through valid supersession.
8. Do not retain rejected/session-only proposal payloads indefinitely or create a shadow archive while SRC-05 is unresolved.
9. Do not infer relationship score/stage changes from extracted memories. SRC-22 remains the separate relationship mutation authority.

**Exit criteria:**
- duplicate extraction and retry do not create duplicate durable records;
- conflicting facts retain history and require valid supersession;
- session-only/rejected candidates create no durable Life Fact/Memory row;
- every durable write validates against the approved registry and explicit grant decision;
- revocation and deletion cannot be undone by consolidation or retrieval.

### Phase 6 — Evidence-preserving Context Compaction

**Status: Not implemented as a shared production capability.**

1. Compact old dialogue into bounded episode summaries only when it improves retrieval or context efficiency.
2. Keep original turns immutable under existing retention/deletion rules; summaries are derived indexes, not replacements for evidence.
3. Every summary must include source-turn ranges/IDs, time range, Character/Subject scope, summary version and generation provenance.
4. Do not repeatedly summarize a previous summary as the sole source. Rebuild a revised summary from canonical source turns and authoritative events.
5. Preserve event chronology, participants, commitments, unresolved status, corrections and supersession links.
6. Do not merge private Character memories or protected Reading knowledge into shared summaries.
7. Treat compaction as retrieval/index maintenance, not automatic durable-memory approval.

**Exit criteria:**
- summary claims can be traced to source turns/events;
- temporal order and corrections survive compaction;
- summary-only evidence cannot override authoritative source records;
- deleting/revoking source material removes it from future context according to the governing deletion policy;
- long-session tests demonstrate reduced prompt size without increased false recall.

### Phase 7 — Memory Quality, Context and Cost Evaluation

**Status: Existing Runtime Standard evaluation axes and C09 research are the baseline; integrated evaluation suite remains to be built.**

Create an offline, deterministic evaluation set covering:
- relevant recall and explicit callback;
- temporal correctness and changed facts;
- multi-session continuity and long-horizon recall;
- causal conflict/repair continuity;
- provenance correctness;
- contradiction and supersession;
- abstention when memory is absent;
- false recall and unsupported biography;
- retrieval/disclosure boundary and cross-Subject isolation;
- Character knowledge boundary and private-memory leakage;
- persona fidelity and anti-repetition;
- context truncation/drop-order correctness;
- input/output token count and budget enforcement;
- cost reservation, settlement, unknown usage and retry behavior.

Use the existing Character Runtime Standard axes and appropriate research benchmarks (for example LongMemEval-style multi-session fact/update/time reasoning and role/knowledge-boundary probes) as design references, not as claims of benchmark compatibility without an adapter.

Run offline fixtures and database tests first. Paid model evaluation remains locked until a separately approved exact model matrix, maximum output tokens, worst-case spend ceiling, per-case reservation and hard stop are in place.

**Exit criteria:**
- every quality/security dimension has a reproducible test and recorded result;
- no test depends on a grader's self-reported claim for security truth;
- token/cost/latency metrics are tied to actual request and Provider usage metadata;
- paid evaluation remains disabled unless separately authorized.

### Phase 8 — Provider, Cache and Production Rollout

**Status: Blocked by O-C1-07, independent Character source publication, real Guard/ACK adapters and remaining source gates.**

1. After O-C1-07 is resolved, bind approved model profiles and independent Provider adapters to each eligible Character. No implicit Se-yeon fallback.
2. Wire the model-specific Token Budget Manager, exact input counter, output cap and Cost Governor into every production inference entrypoint.
3. Wire the Dynamic Context Composer and permission-first retrieval into the real Provider request path.
4. Add prompt caching only after correctness and token accounting are proven. Keep stable Character/system prefixes separate from user-private dynamic context; measure cache hit rate and actual cached-token usage. Caching must not broaden access or mix Subjects.
5. Connect each Character's own Output Guard, transactional persistence, secure receipt and Worker/browser ACK.
6. Verify independently approved/published content bundles and source hashes for Baekheon, Yeoul, Rahyeon and Taegyeom. Preserve the existing six visible cards and Yunho exclusion.
7. Complete the required source/content publication and browser compatibility gates before activation.
8. Roll out one Character at a time with hard cost limits, bounded canary, rollback/hold path and evidence review. No production activation by merge alone.

**Exit criteria:**
- all five intended chat targets have independent, source-approved runtime and Provider/Guard wiring;
- real user messages are stored, generated, guarded, committed and ACKed exactly once;
- actual input/output/cached token usage and cost reconcile with reservations/settlement;
- context and memory access boundaries pass tenant and Character isolation tests;
- all publication and client compatibility gates pass;
- activation is explicitly authorized and observable.

## 6. Work sequencing and parallelism

The order is dependency-aware, not a requirement to wait idly between independent tasks:

- Phase 1 authority/source inventory can proceed alongside provider-neutral contract work in Phase 2.
- Phase 3 retrieval can begin in read-only mode using already-valid records and grants while blocked durable-write schemas remain unresolved.
- Phase 4 composer can be implemented with deterministic fixtures before real Provider selection.
- Phase 5 durable consolidation is gated by SRC-25/SRC-05/SRC-10; candidate extraction and offline validation must not bypass those gates.
- Phase 6 compaction can be built over synthetic/approved fixtures, but production persistence follows retention and source authority.
- Phase 7 offline evaluation can proceed without API keys. Paid/live evaluation cannot.
- Phase 8 depends on O-C1-07, source-complete Character publication, cost enforcement, Output Guard and ACK.

## 7. Definition of done

The Context Engine is complete only when all of the following are evidenced:

1. Model-specific input/output limits are enforced against the exact dispatched request, not estimated from character count.
2. Context is assembled dynamically from authorized, relevant, source-traceable information.
3. Long-term memory consolidation preserves authority, provenance, temporal updates, user choice and revocation.
4. Compaction reduces context size without losing source traceability or increasing false recall.
5. Character identity, knowledge boundaries, relationship continuity and Saju authority remain intact.
6. Multi-session offline evaluation passes the agreed memory, privacy, quality and budget gates.
7. Real Provider, Cost Governor, Output Guard, receipt/ACK and approved content publication are integrated for each activated Character.
8. No paid inference, Production DB mutation, public route or Character activation occurs merely because this roadmap is approved or merged.

## 8. Immediate next work

1. Keep PR #3068 Draft; no Production model route, paid inference, public route or additional Character activation is authorized by these read-only changes.
2. Phase 1 authority inventory, projection and provenance-enriched read path are implemented. Preserve the existing Subject/Character grant boundaries and keep unsupported schemas closed.
3. Phase 2 provider-neutral exact-request preflight remains implemented. Offline exit evidence is separate from Production readiness: real model profiles and four-Character Production wiring remain on hold until O-C1-07 and the existing PR-04B/04C/04D operational gates are resolved.
4. Phase 3 read-only retrieval has passed the previous latest-head CI with source scope, source provenance, revocation and multi-session recall tests; unsupported semantic/causal/relationship/contradiction signals remain unimplemented until authoritative record fields are available.
5. Phase 4 offline composer foundation now uses exact-request counting to enforce protected layers and drop order. Extend its fixture evaluation and authority integration without opening Production inference.
6. Keep Character-private disclosure and Official Reading/Saju on their existing separate authority paths. Do not broaden Working Memory into either source.
7. Report unresolved source-authority decisions explicitly; do not invent schemas, model IDs, token budgets, prices or publication assets.

## 9. Governing documents

- `docs/AI_CHARACTER_RUNTIME_SPEC.md`
- `docs/RELATIONSHIP_MEMORY_POLICY_SPEC.md`
- `docs/character/CHARACTER_RUNTIME_STANDARD_V1.md`
- `docs/character/CHARACTER_CHATBOT_COMMON_SPEC_V1_1.md`
- `docs/character-memory-seyeon-c09-long-term-persona-memory-research-20261029.md`
- `docs/character-memory-seyeon-c09-epistemic-knowledge-boundary-research-20261029.md`
- `docs/character-memory-seyeon-cost-governor-contract-v1.md`
- `docs/character-memory-seyeon-governor-04d2-openai-input-count-v1.md`
- `docs/SEYEON_SECURITY_EVAL_ADMISSION_READINESS_AND_READER_MEMORY_DB_V1.md`
