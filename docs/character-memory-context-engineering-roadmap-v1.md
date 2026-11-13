# MyeongHa Persistent Memory & Context Engineering Roadmap v1

> **2026-11-13 제품 범위 반영:** [현행 6명 동시 웹 출시 결정](LAUNCH_SCOPE_OWNER_DECISION_AND_TRACK_CLASSIFICATION_20261113.md)은 기존 5명 실행 기반선 및 윤호 제외 **현재 구현 상태**를 바꾸지 않는다. 최초 출시 전 윤호 포함 여섯 명 각각의 승인된 채팅 실행·보호·배포를 검증해야 한다. 이 로드맵의 고급 자동 기억·GEPA 등은 필수 6명 채팅 기능을 안전하게 제공하는 데 직접 필요한 부분만 선행시키며, 사용자 승인으로 OFF인 자동 기억 기능을 임의 활성화하지 않는다. 기존 Memory 로드맵의 독립 최종 목표는 삭제하지 않는다.


> Watchtower-Track: character-memory
> Status (2026-11-13): APPROVED OFFLINE SCOPE VERIFIED AND MERGED / END-TO-END RELEASE DEPENDENCIES HELD / OVERALL ROADMAP_IN_PROGRESS
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

PR [#3068](https://github.com/gycha0109-beep/MyeongHa/pull/3068) was **merged** into `main` on 2026-11-13 11:14:14 UTC. Final PR head: `859f1c9050c8660e010899bdaf8c7f8c9dd4c08c`; squash merge: `764fa668192b7a280720b58b7b051feaa82ee9df`; [exact-head integration run #43413337871](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43413337871) completed SUCCESS. The original runtime baseline commit was `29f58f4d7dcac0f00ea21c0f0ed32d3ede68a9bd`. This is a code/CI merge result, not Production activation or proof of deployed migrations.

The original baseline contains:
- independent Character room selection and server-side turn gateway foundations;
- source-bound four-Character execution orchestration contract;
- immutable published-source/hash validation foundations;
- PostgreSQL 17 disposable integration coverage for turn persistence, receipt issuance, ACK/idempotency and DB authority boundaries;
- shared four-Character length constants and boundary tests;
- existing message and generated-reply guard: 8,000 UTF-16 code units;
- existing canonical-context guard: 32,768 UTF-16 code units.

The former Draft status is historical, not the current PR state. The merged work remains read-only/offline for Character memory retrieval; additional Characters and a Production Provider route were not enabled. Later dated Draft/CI-pending statements in this document are preserved as historical work notes and are superseded by the verified merge above.

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

**Status: Runtime baseline implemented, verified and merged by PR #3068; additional live Character activation remains a separate release gate.**

- Preserve the six visible discovery cards and current Yunho exclusion.
- Preserve independent room/thread ownership, immutable source pinning, turn persistence, receipt and ACK authority.
- Preserve PostgreSQL 17 and DB privilege verification.
- Keep the existing UTF-16 length guards as defensive bounds.
- Do not claim live AI execution for Baekheon, Yeoul, Rahyeon or Taegyeom.

**Exit evidence:** the original baseline evidence is anchored at `29f58f4`; subsequent implementation commits and current CI evidence are tracked on PR #3068.

### Phase 1 — Authority contract and data-source inventory

**Status: APPROVED READ-ONLY SCOPE IMPLEMENTED / MERGED; live Production integration is separately held.**

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

**Status: PROVIDER-NEUTRAL OFFLINE PREFLIGHT IMPLEMENTED / MERGED; real Provider profile, pricing and Production wiring remain separate O-C1-07/Cost Governor gates.**

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

**Status: APPROVED LEXICAL+METADATA READ-ONLY RETRIEVAL SCOPE IMPLEMENTED / MERGED; full semantic/causal ranking is source-authority HOLD, not an open-ended offline test task.**

**Source timestamp defense-in-depth (offline, 2026-11-08):** Phase 3 read-only retrieval now rejects undecodable grant/creation/confirmation/validity timestamps, inverted Life Fact validity intervals and an authoritative current User message later than the pinned server as-of; still excludes valid but future grants and not-yet-valid/expired facts. This does not create any new grant, supersession authority or Production model route.

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

**Additional exit evidence:** multi-session relevant/irrelevant recall and abstention, generic bounded callback, and PostgreSQL revoked-grant/superseded Life Fact denial were part of the implemented test coverage. The final merged PR passed its exact-head integration; green CI establishes these offline/source-bound checks only, not semantic model accuracy or Production source availability.

**Phase 3 scope disposition (2026-11-13):** the source-supported read-only lexical/metadata retrieval and its merged offline tests have reached their approved implementation boundary. Causal/relationship/contradiction ranking remains unimplemented because the owning source contracts do not supply the required evidence/links. Do not re-open this scope for speculative synthetic cases; activate those features only after their independent source authority is available. Production retrieval remains gated.


**Canonical dialogue chronology gate (offline, 2026-11-08):** The existing Working Memory projection now rejects a prior canonical message dated after the current User message or any backward timestamp across sequence-ordered messages. Equal creation timestamps remain valid; canonical sequence is still authoritative. This read-only fail-closed gate also checks messages excluded from model-facing context, so their inconsistent source evidence is not silently ignored. This narrows Phase 3 temporal safety, not source-policy approval, causal-memory support or Production activation.

**Polite Korean explicit recall questions (offline, 2026-11-08):** Phase 3's existing bounded lexical callback detector now admits question-form `기억하세요?`, `기억하시나요?` and `기억하십니까?`, while excluding those exact scaffold tokens from topical matching. Topic-free explicit questions can use the existing Memory-only latest-episode fallback; declarative/imperative forms without a question marker cannot trigger that fallback, and external false-hint suppression remains effective. Synthetic positive, abstention and Composer-contract fixtures cover these source-supported recall forms. No semantic search, new permission, durable memory or Production model route is introduced.

**Exact User turn replay closure (offline, 2026-11-08):** Phase 3 retrieval now carries an exact server-private binding for its canonical User turn; Phase 4 checks message ID, sequence, timestamp and full text against the pinned Composer turn before any model request is built or counted. This prevents same-thread reuse of irrelevant retrieved memories from another turn. The private binding stays outside redacted traces; Production Provider and durable Memory authority remain held.

**Current-turn temporal source cutoff (offline, 2026-11-08):** Phase 3 retrieval now also excludes existing Memory/Life Fact evidence created, granted or confirmed *after* the exact canonical User message, even if the server read happens later. Life Fact validity start is checked against the turn; expiration/revocation remains enforced against server-asOf rather than resurrecting stale sources. This is a conservative source-supported read safeguard with synthetic regression tests, not a new historical replay or durable retention policy.

**Callback intent source closure (offline, 2026-11-08):** Phase 3 read-only retrieval now requires positive callback evidence in the exact canonical User text: a server-supplied `explicitCallbackRequested=true` hint cannot fabricate generic fallback or callback ranking. A false hint may suppress retrieval and invalid runtime types reject. This reduces unsupported recent-episode recall without adding semantic search, new grant/source authority or Production model dispatch.

### Phase 4 — Dynamic Context Composer

**Status: SOURCE-SUPPORTED OFFLINE EXACT-REQUEST COMPOSER IMPLEMENTED / MERGED; Production request wiring and externally authorized layers remain separate holds.**

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

**Additional offline admission and dialogue labeling:** External policy, Character core, response task, Bible and event segments now require an explicit server-owned source-admission port matching the exact scope/layer/ref/text before request serialization or counting. Missing/denied/throwing approval fails closed; no Production adapter/authority is invented. Same-thread dialogue now preserves source role, Character speaker and timestamp in the model-facing serialized context. The concrete source-reader bindings and Production integration remain unfinished.

**Additional retrieved-memory epistemic protection:** Selected Memory and Life Fact summaries now keep their source-owned record kind, fact-vs-Character-interpretation claim kind, stored source kind and effective timestamp inside the offline assembled memory segment. The model receives a labeled derived perspective rather than a silently promoted user fact. No new durable schema or Claim authority is introduced.

**Four-Character published core, offline only (2026-11-08):** The independent published-source reader can now feed exactly one immutable, digest-pinned Character core into the offline composer through a same-Scope admission adapter. The adapter uses the existing DB-evidence/artifact/compiler port, never invents a source, rejects changed content/scope and delegates non-Character segments to separate approved authorities. The currently enforced 8,000-character per-segment limit is fail-closed, not a reason to truncate published canon. This is an offline test fixture and server helper; no four-Character publication or live inference activation has occurred. Other Character/provider/relationship/Reading admissions remain incomplete.

**Additional offline source/layer protection:** The composer now carries an authoritative current-turn-state segment and a server-pinned response task as mandatory layers. Diagnostic source IDs must use bounded machine-safe identifiers; private prose or control characters fail closed before request construction/counting. Relationship revision metadata without its pinned current relationship fails closed. This is not Production source/category admission or model dispatch.

**Additional implemented server-side offline boundary:** `apps/api/src/character-dynamic-context-for-turn-v1.ts` composes the existing permission-first Subject/Character/thread retrieval with the exact-count context composer. A denied Capability Gate blocks all source reads and model-request serialization. Synthetic offline integration tests cover successful source-bound assembly and entitlement denial before reads/counting. No public route or Provider is enabled.

**Additional permission-first published-core turn path (offline only, 2026-11-08):** The new server wrapper first verifies the existing Capability Gate and source-scoped Memory retrieval, then reads the same Subject/thread/Character's existing independently published core by pinned release/bundle/version, then calls the exact-request composer. Denied turns perform no publication read, source admission, serialization or counting. This is a server-only offline request path; no Provider dispatch, public handler or Character activation was added.

**Additional governed preflight layers (offline-only, 2026-11-08):** The composer now supports independently admitted, non-droppable Integrity/Claim and sensitive-topic Disclosure decision segments, plus lower-priority, approved repetition-suppression hints. A bounded server projection helper consumes existing Integrity v1/Disclosure v2 preflight results for the pinned current turn. It preserves the USER_ASSERTED-versus-VERIFIED boundary and does not copy private Character source bodies or raw claim statements. Every new source still requires exact source admission; no paid classification or protected Reading retrieval is activated.

**Relationship event metadata chronology (offline, 2026-11-08):** The existing read-only Relationship Event index can now contribute explicitly labeled metadata-only revision/timestamp/type entries under the pinned current Relationship; the items are lower-priority and do not become causal event statements. Future/unpinned revision metadata fails closed. The underlying existing event read lacks actor/causal payload and source event IDs, so true causal/unresolved-event retrieval and private Relationship content remain separately blocked until corresponding authoritative fields are available.

**Remaining Phase 4 work:** wire trusted source/category admission to the runtime, include the remaining source-authorized context layers, connect the exact serialized request to the actual approved Provider dispatch path after O-C1-07, and verify Production Cost Governor/Output Guard parity. This offline foundation alone does not satisfy Phase 4 exit conditions.

**Exit criteria:**
- identical inputs/policy produce deterministic assembly decisions;
- all included items have authorized source references;
- drop-order tests prove protected layers survive context pressure;
- token budget is respected without character-count heuristics;
- private/raw content is not exposed through logs or diagnostics.

**Phase 4 original-turn Relationship snapshot cutoff (offline, 2026-11-09):** In addition to existing Memory and relationship-event time checks, Composer now rejects a selected current Relationship snapshot whose source `updatedAt` or optional `lastInteractionAt` is invalid or later than the canonical current User message; it also rejects interaction time later than the snapshot update. These are checks on already-present Relationship source fields, before admission or exact request/count, with valid earlier/equal timestamp fixtures. It does not create historical state reads, event causality, relationship mutation or Production authorization.

**Phase 4 retrieval temporal defense in depth (offline, 2026-11-08):** In addition to Phase 3's canonical-turn source cutoff, the offline Composer now rejects a selected Memory/Life Fact whose creation/grant/confirmation timestamp is invalid or later than the pinned current User turn, whose effective timestamp contradicts its source, or whose Life Fact validity interval excludes the turn. This check is before exact request serialization and counting. It verifies already-present metadata; it does not perform a second DB authority read, relax current server-asOf expiry or approve Production wiring.

**Phase 4 canonical dialogue recheck (offline, 2026-11-08):** The source-authorized recent User/Character dialogue is now rechecked for exact selected-Character speaker attribution, strictly increasing original sequence, unique noncurrent message identity, and nondescending timestamps not later than the pinned User turn before source admission and exact token counting. Malformed/forged dialogue fails closed, while equal timestamps with valid sequence are allowed. This closes a source-integrity seam between the read-only Projection and offline Composer; live runtime admission and Provider dispatch remain held.

**Phase 4 epistemic source and ranking recheck (offline, 2026-11-08):** The Composer now rejects a selected Memory/Life Fact whose source kind, grant reason or fact-vs-Character-interpretation label contradicts the existing source projector contract. It also checks source-owned relevance/salience against selection signals and bounds lexical coverage before any admission/request serialization/counting. This read-only guard adds no new source data, semantic ranking signal, durable-write permission or Provider dispatch.

**Phase 4 canonical callback/lexical retrieval coherence (offline, 2026-11-08):** The Composer now rechecks the existing lexical retrieval schema/mode, canonical source-query token count, explicit callback and fallback constraints, candidate-count invariants and selected-item callback flags before source admission and exact request/count. The token count uses the original retrieval tokenizer on the pinned User text, not client-supplied hint metadata; an externally suppressed callback remains allowed but a fabricated positive callback cannot create Memory authority. Synthetic malformed-trace tests fail closed without any paid/Production inference.

**Phase 4 pre-read published-Character admission and Memory integration (offline, 2026-11-09):** The server's existing four-Character offline turn wrapper now shares exact pinned Character/Subject/thread/publication-input validation with the published-source adapter and invokes it before any private authority-port reads. Malformed/unsupported target, missing content version or missing independent source-admission port fail closed without Memory/Life Fact/dialogue/relationship or publication reads. Integrated synthetic tests bind an existing authorized Memory to the exact independently published Character core in one counted request, while a different Character grant fails before publication or serialization. No new publication, persistence, paid Provider, public route or policy authority is introduced.

### Phase 5 — Memory Consolidation and Lifecycle

**Status: APPROVED HOLD — automatic conversation-to-durable-memory extraction/writes are explicitly OFF under the 2026-11-11 owner decision. Existing proposal/approval contracts remain; SRC-25/SRC-05/SRC-10 are separate source-authority dependencies. This is not unfinished approved manual-memory work.**

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

**Status: SOURCE-VERIFIED OFFLINE EXTRACTIVE COMPACTION IMPLEMENTED / MERGED; persistent/semantic compaction remains deliberately held behind retention, source and deployment authority.**

**Additional offline reuse guard (2026-11-08):** Any previous extractive episode must be rebuilt from the current fully authorized canonical turns before reuse, and all original source IDs, verbatim excerpts and timeline fields must still match. Revocation/deletion or scope drift blocks the episode. No Production cache, database invalidation job or retention policy is introduced; Phase 6 durable deletion/compaction remains incomplete.

**Implemented offline-only subset (2026-11-08):** Strict-scoped exact-turn revalidation, protected evidence inclusion, chronological verbatim excerpt selection, source ID/time provenance and a measured byte-reduction decision. This is not an LLM-created episode summary, durable store or production Source/Context authorization. There is no new retention or cross-Character disclosure policy; real semantic compaction remains held until evidence and revocation authority are available.

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

**Status: APPROVED DETERMINISTIC OFFLINE EVALUATION SCOPE IMPLEMENTED / MERGED; actual Provider response/usage/latency measurements remain external evidence gates. Owner consent for a bounded paid pilot is already recorded, but billing/identity/hard-limit/cross-run reservation controls still prohibit paid dispatch. Model comparison/optimization belongs to the GEPA track; do not duplicate it here.**

**Verified exact-head offline integration (2026-11-09):** Draft PR #3068 commit `6c4c3c18856b027e71290731421f8f0dc4ea077c` passed [CI #42554861447](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42554861447), [Governance #42554861300](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42554861300), [Web PR Domain Gates #42554861317](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42554861317), and [Web Auth Browser Regression #42554861299](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42554861299). Its Character Memory Work Track completed shared TypeScript, affected tests, client checks and build, including the unmocked two-session Memory-callback, canonical-expression, 40-turn episode and held-unknown-cost integration fixture. This establishes only deterministic, source-owned **offline** evidence and does not prove semantic recall or a live Provider response.

**Additional offline temporal and abstention checks (2026-11-08):** The synthetic evaluator now rejects source-grant, creation/confirmation or effective timestamps occurring after the pinned User turn and excludes Life Facts whose validity range does not cover that instant. It also has an explicit no-memory abstention fixture. This covers temporal source admissibility, **not** full changed-fact, supersession, contradiction or multi-session semantic reasoning; those remain incomplete.

**Independent Memory grant/provenance lineage gold (offline, 2026-11-08):** Source-fidelity checks now pin original record IDs/type/schema/projector, exact access grant and grantee, granted/created timestamps, source turn/message/merge-action references, creator and Life Fact validity/confirmation fields. Authorized-looking reattachment of the same Memory summary to another grant or source turn fails independently of Composer/request agreement. This is synthetic canonical-source integrity, not authority to publish or write memory.

**Independent Memory source-claim gold (offline, 2026-11-08):** Quality evaluation now pins canonical synthetic Memory source claims separately from Composer/retrieval/request evidence (source ID, record/claim/source kinds, effective timestamp and exact summary). It flags coordinated false biography injection when retrieval, assembled context and serialized model request have all been rewritten in agreement. A truthful source or real-model false-memory rate is **not** established by this deterministic guard.

**Independent protected-context gold (offline, 2026-11-08):** Quality evaluation now compares all fixture-authorized non-droppable policy, Character, turn, dialogue, relationship, Bible and preflight-decision source segments to independent trusted gold, in both assembled context and serialized request. It detects coordinated rewriting or omission even when request and trace agree. This verifies offline fixture fidelity, not live Provider authority or Character content publication.

**Offline final serialized-request source audit (2026-11-08):** An independently supplied synthetic-format reader checks exact dispatched-body segment order, refs, layers and text against the Composer output; body-only source injection or epistemic relabeling fails. This does not establish real Provider dispatch or model truthfulness.

**Cross-session recall score reflects final exact-request inclusion (offline, 2026-11-08):** Retrieval-only hits no longer count as delivered callback successes. A gold-relevant memory must survive token-pressure drops and pass the independently verified per-turn request/source checks to earn a recall success. This is offline prompt-availability fidelity, not model output recall.

**Additional synthetic cross-session callback validation (2026-11-08):** A multi-session evaluator now enforces same Subject/Character/thread scope and strictly ordered independent synthetic sessions, then scores explicitly gold-relevant source callbacks across sessions using the already source-/time-/body-verified per-turn evaluator. This is source-level continuity, not model-response semantic memory, biography knowledge inference or Production sessions.

**Additional long-session episode source-fidelity evaluation (offline, 2026-11-08):** A deterministic 40-turn fixture checks source-authorized extractive episode reuse against independent required/forbidden/protected source ID gold, including omissions, cross-Subject denial, revocation, verbatim chronology and measured byte savings. It is deliberately limited to source selection and extractive integrity, not model text-level false-recall or actual token/cost reduction.

**Offline cost evidence boundary strengthening (2026-11-08):** Cost quality checks additionally match the Provider usage event purpose against the reservation stage, enforce every independently known input/output cap even when the other usage dimension is missing, and require certified input headroom/context-envelope consistency. This still cannot approve a production price or usage settlement without existing atomic DB authority.

**Additional offline Cost/Usage Governor consistency evaluation (2026-11-08):** A server-only synthetic quality scorer now consumes existing model-token preflight receipts, Se-yeon cost usage events and reservation states. It checks Subject/turn/attempt, model/rate-card matching, known token ceilings, settled estimates, over-ceiling failures, held unknown usage and duplicate call/reservation evidence. Unknown usage is accounted as held ceiling, **never** free or confirmed measured tokens. This is a read-only reference tied to existing Se-yeon contracts, not production five-Character price publication, invoice reconciliation, runtime cost enforcement or paid-model evaluation.

**Independent canonical-expression exact-repeat axis (offline, 2026-11-08):** A source-verified, same-Subject/Character/thread synthetic evaluator now grades exact normalized repeats in the Runtime Standard's catchphrase, question, comfort, memory-callback, relationship-expression and trivia categories against independent fixture gold. Invalid, revoked, cross-scope or future prior turns fail closed; reports contain counts/booleans only. This is NOT a semantic/paraphrase detector, persona-fidelity verdict or live response Guard.

**Implemented synthetic offline foundation (2026-11-08):** A typed evaluator compares approved memory retrieval and exact-context output against independent fixture gold, reporting source-selection precision/recall, missing/extra context memories, cross-scope/forbidden-source closure, Fact-vs-Character-Insight provenance consistency, redacted traces, certified token bound and drop-order correctness. This does not grade real model prose, analyze temporal/causal recall, claim benchmark compatibility or authorize paid testing.

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

**Independent original-dialogue fidelity (offline, 2026-11-08):** The Phase 7 evaluator now requires separately captured canonical same-thread dialogue gold, validates source ordering/timestamps and role/Character identity, and independently compares retained immediate/older dialogue payloads with original messages. This catches coherent older-dialogue rewriting even when the assembled context and exact serialized request agree. Dropped optional older dialogue remains allowed under token pressure. This is source-fidelity fixture evidence, not semantic/real-model benchmark completion or a Production authorization.

**Independent relationship event metadata fidelity (offline, 2026-11-08):** Phase 7 now compares optional metadata-only relationship events in the exact assembled Context/request against separately pinned original event-type, schema/policy, revision and timestamp gold. It verifies source-backed inclusion/drop decisions and detects coordinated tampering while preserving the non-causal epistemic boundary. This does not approve relationship mutation, add missing causal source fields or complete a real-model/Production evaluation.

**Independent retrieval User-turn gold (offline, 2026-11-08):** The Phase 7 offline evaluator now separately grades the exact message ID, canonical sequence, timestamp and verbatim text used for Memory retrieval against already-pinned original current-turn and turn-state gold. It detects coherent/stale retrieval-result reuse even if Context/request serialization and Memory claims are otherwise self-consistent. The report exposes a boolean only, not User text. This is offline source-integrity coverage, not live causal/semantic evaluation or Production admission.

**Cross-session immutable Memory source gold (offline, 2026-11-08):** Phase 7 multi-session evaluation now requires all occurrences of the same original record+grant source identity to preserve independent fixture-gold claim, grant, provenance, timestamp, schema and validity fields. Conflicting identity reuse fails the multi-session result and earns no callback delivery success for that source even if both per-turn checks pass separately. Synthetic coordinated summary and source-message rewrite cases are covered. Legitimate changed facts/supersession still require their existing distinct authoritative record identity; no Production Memory mutation, semantic contradiction model or paid evaluation is introduced.

**Cross-session canonical turn identity integrity (offline, 2026-11-08):** The Phase 7 multi-session evaluator now rejects the same original User message ID or non-increasing canonical message sequence across distinct fixture turns in one Subject/Character/thread; original protected turn-state gold, source references and evaluation instant are checked before scoring. Existing positive multi-session fixtures use distinct User IDs and increasing sequences. This is source-bound offline continuity, not live historical replay, new storage or real-model evaluation.

**Cross-session original dialogue source fidelity (offline, 2026-11-08):** Phase 7 now independently compares the same canonical source message across session fixtures by original message ID, sequence, role/speaker, timestamp and exact text, including original current User turns. Conflicting history fails the aggregate source-integrity check even when both turns independently pass. Three deterministic tamper cases cover altered text, time and speaker. No Production source history, semantic conflict resolution, private trace leakage or paid Provider evaluation is authorized.

**Cross-session original relationship event gold (offline, 2026-11-08):** Phase 7 now compares immutable event type/schema/policy/applied time for each repeated original relationship-state ID plus revision across sessions. The state ID is read only from independent protected relationship gold, so identical revision numbers in different states do not collide. Coherent later-event rewrites fail aggregate continuity despite individually passing per-turn checks; deterministic positive, independent-state and three negative fixtures are included. The evidence remains metadata-only and does not establish causal memory, new mutation authority or Production readiness.

**Original Relationship state revision continuity (offline, 2026-11-09):** In addition to repeated relationship event metadata, Phase 7 multi-session source-fidelity grading now verifies that each independently pinned original Relationship state ID + revision retains identical Character attribution, scores, stage, policy version and timestamps across synthetic sessions. It rejects a backward revision for the same state, while allowing genuinely newer revisions to change their original scores and distinct state IDs to remain independent. Read-only synthetic variants cover coherent same-revision rewrites, forward progress and rollback, without inventing a causal narrative, state mutation authority or a paid-model metric.

**Integrated existing offline evaluation axes (2026-11-09):** Phase 7 now provides a single server-only synthetic runner to execute its already implemented multi-session Memory delivery/source-integrity, canonical anti-repetition, extractive episode/byte saving, and existing Se-yeon accounting-safety evaluators. It gates cross-axis Subject and Character/thread scope before any source callback and reports only redacted per-axis counts/booleans with held-unknown cost ceiling separately from measured estimates. This combines existing **offline** evidence only; no new semantic truth, Source-to-Provider-turn cost join, model matrix, real latency/usage, invoice settlement, policy thresholds, paid evaluation or Production activation is claimed.

**Real four-axis synthetic offline integration evidence (2026-11-09):** A new unmocked Phase 7 integration test runs the existing two-session source-grant Memory callback through actual read-only projection, retrieval, exact offline Composer and multi-session scoring; the same offline runner also evaluates real canonical-expression verification, 40-turn extractive source-verified episode reuse, and an existing Se-yeon synthetic Cost Governor unknown-usage reservation. Unlike the prior mock-isolated runner tests, these are the existing evaluators' real implementations together. No Production model/Provider call, real usage or latency data, actual cross-Character cost linkage, semantic false-recall/causal evaluator, invoice settlement or new source approval is established.

**Changed-fact exact-request delivery check (2026-11-13, offline):** The existing Phase 7 integrated runner now uses its source-pinned multi-session exact-request evaluator to require that a verified currently relevant corrected Life Fact actually survives into the final serialized model request. A retrieval-only success is no longer equivalent to delivery. The unmocked fixture runs an original fact timeline through the same second-turn retrieval and counted Composer; a missing model-request fact fails the existing redacted changed-fact axis. This does not assess natural-language model recall or authorize Provider dispatch.

**Changed-fact original source attribution check (2026-11-13, offline):** Phase 7's existing independently pinned Life Fact evaluator now rejects a matching-ID current fact when retrieved source kind, granted Character or fact-vs-opinion classification differs from its source authority. Previous matching ID/grant/date validation did not include these source fields. Read-only synthetic tests verify this negative case; no new model claim, grant policy or Production permission is created.

**Changed-fact exact-turn cross-axis admission (2026-11-13, offline):** The single integrated runner now requires the Life Fact correction evaluation's original User message ID, sequence, timestamp and verbatim text to match one independently pinned multi-session User turn before calling any source evaluator. Previously only Subject/Character/thread/time-internal equality was checked, so a coherent unrelated same-scope retrieval could score as if it belonged to the scenario. The unmocked changed-fact fixture now shares the actual second synthetic User turn. No semantic AI accuracy, paid dispatch or Production Memory authority is implied.

**Changed-fact source-gold integration (2026-11-13, offline):** The existing Phase 7 integrated runner now requires independently pinned Life Fact correction/supersession cases alongside the four existing axes. Same Subject/Character/thread, exact User turn, relevant fact topic and source-gold presence are preflight requirements. An unmocked synthetic fixture runs existing read-only projection/retrieval against historical and current facts. The fifth axis is redacted and does not verify actual model semantic recall, Provider billing or Production readiness; exact-head CI is required.

### Phase 8 — Provider, Cache and Production Rollout

**Status: END-TO-END RELEASE INTEGRATION HELD by O-C1-07/provider evidence, independent Character publication, Guard/ACK runtime integration and Production security/DR acceptance. These are not unimplemented items in the completed read-only/offline scope.**

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

### 7.1 Closeout classification — implementation vs deliberate hold vs external dependency (2026-11-13)

**Verified repository fact:** [PR #3068](https://github.com/gycha0109-beep/MyeongHa/pull/3068) merged after [exact-head integration #43413337871](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43413337871) passed. A merged, green offline implementation must not be described as an open Draft or made to re-enter indefinite synthetic-test development. The full live product/Production exit conditions below are *retained*, not waived.

| Classification | Phase/work | Closeout and remaining gate |
|---|---|---|
| **IMPLEMENTED / VERIFIED / MERGED** | Phase 0 runtime baseline; Phase 1 source inventory and read-only authority projection; Phase 2 provider-neutral exact-request budget/counter contract; Phase 3 source-supported lexical+metadata retrieval; Phase 4 offline source-admitted context assembly; Phase 6 source-verified extractive episode reuse; Phase 7 deterministic offline multi-session/source/cost safety evaluation | This is the **approved source-supported offline implementation scope**. Evidence is the merged PR and its exact-head required checks/integration. Do not re-open as generic additional fixture work. These rows do **not** assert that every original phase's Production/semantic exit criterion is met. |
| **IMPLEMENTED / VERIFIED / MERGED; DEPLOYMENT HOLD** | Member-authored shared My Page memory CRUD, owner/RLS limits, account/individual-note deletion and bounded encrypted-backup replay mechanics | The [owner decision](CHARACTER_SHARED_MEMORY_OWNER_DECISION_V1.md) is already made. Local/disposable evidence does not establish actual Production migrations, continuous independent privacy ledger or Hosted Auth/Storage/backup recovery. Keep `MYEONGHA_SHARED_MEMORY_ENABLED=0` pending operational acceptance. |
| **APPROVED HOLD — DO NOT BUILD UNDER PRESENT POLICY** | Phase 5 automatic conversation extraction, auto-approved durable Life Fact/Memory writes and pending-proposal persistence; related Phase 6 durable/semantic summarization | Owner reaffirmed **manual shared notes only; automatic collection/writes OFF** on 2026-11-11. SRC-25 positive schemas, SRC-05 proposal retention and SRC-10 grant/regrant must be resolved by their authoritative source tracks before any authorized expansion. Approval is **not missing** for current manual scope; do not ask the owner to select a memory policy again. |
| **CROSS-TRACK DEPENDENCY / OUTSIDE OFFLINE SCOPE** | Provider/model/fallback and price (O-C1-07); GEPA model comparison/optimization; independently published four-Character canon/asset sources (SRC-15/16); Phase 8 Provider/Cost Governor/Output Guard/receipt/ACK; production security and DR (#1843/#1887) | Track/authority owners provide approved source artifacts and live acceptance evidence. Memory integration then consumes the resulting contracts and verifies its own read/write/disclosure boundaries. No generic approval question, fictitious asset, new paid test or Production toggle is authorized. |
| **EXTERNAL EVIDENCE HOLD, NOT AN OWNER CHOICE** | Phase 7 real-model measurement and the previously approved narrowly capped C08 paid evaluation | Owner's pilot consent is documented. Historic eleven-call billing/receipt reconciliation, exact evaluation-key/project attribution, hard spend enforcement and durable cross-run reservation remain unverified. `paidDispatchEnabled=false`; do not re-request consent or use another project's credentials/GEPA process as substitute. |

**Disposition:** `OFFLINE_SCOPE_COMPLETE / ROADMAP_IN_PROGRESS`. The approved offline subset is completed by documented evidence; the **original end-to-end Context Engine / Production release roadmap remains incomplete**. Neither status is `ROADMAP_COMPLETE` for the parent roadmap. No Production readiness, deployed migration, model semantic accuracy, real cost or all-Character publication is inferred.

**No-work stopping rule:** After exact-head proof, when every remaining item is (a) explicitly owner-held, (b) external source/GEPA/Character content/operations dependency, or (c) real Provider/Production evidence unavailable in this track, **do not invent further synthetic tests or re-ask already decided policy questions**. Record the exact unresolved dependency and stop this work unit. Resume only upon new authoritative source/evidence or a distinct owner scope change. Successful CI on a new docs PR changes documentation, not these authority gates.

### 7.2 Original full-service completion criteria (unchanged requirements)

The **full live Context Engine and Character Chat release**, not the offline implementation subset, is complete only when all of the following are evidenced:

1. Model-specific input/output limits are enforced against the exact dispatched request, not estimated from character count.
2. Context is assembled dynamically from authorized, relevant, source-traceable information.
3. Long-term memory consolidation preserves authority, provenance, temporal updates, user choice and revocation.
4. Compaction reduces context size without losing source traceability or increasing false recall.
5. Character identity, knowledge boundaries, relationship continuity and Saju authority remain intact.
6. Multi-session offline evaluation passes the agreed memory, privacy, quality and budget gates.
7. Real Provider, Cost Governor, Output Guard, receipt/ACK and approved content publication are integrated for each activated Character.
8. No paid inference, Production DB mutation, public route or Character activation occurs merely because this roadmap is approved or merged.

### Owner-approved shared My Page memory — manual lane (2026-11-09)

**Status: Merged manual shared-memory CRUD and captured-window synthetic restore/extractor implementation (historical proof at `73c1a710`; final PR #3068 integrated GREEN); Production migration, independently complete off-DB capture, and real backup recovery remain separate HOLD gates.** The owner chose one shared My Page memory space instead of requiring users to classify memories by current vs next conversation. Active Members may manually add/edit/delete their own notes; all Characters of the same Subject may consult relevant notes without per-Character grant copies. Conversation-to-memory extraction remains OFF. This manual lane is distinct from automatic Memory Proposals, Life Facts, protected Saju and Character-private disclosure.

- My Page has a member-authenticated CRUD editor, no localStorage of personal text, bounded notes, and five-locale labels.
- A separate owner-RLS PostgreSQL table and member-only HTTP API implement the manual lane; deletion removes the owner note row. The Vercel endpoint is disabled by default until explicit deployment admission.
- An optional read-only same-Subject cross-Character context port selects at most five topically matched notes, pins the authoring and update source, and passes them through positive source admission and the existing exact-request token budget. The Production model route is not wired or enabled by this offline capability.
- SRC-05/SRC-25/SRC-10 for automatic Memory, independent SRC-15/SRC-16 Character publication, and O-C1-07 model/cost/guard/ACK decisions remain unchanged.
- Exact HEAD `30ec78a` passed [CI #42585925479](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42585925479), [Governance #42585925382](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42585925382), [Web Auth Browser Regression #42585925409](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42585925409), and [Web PR Domain Gates #42585925366](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42585925366). The disposable DB authority, PostgreSQL 17 dependency, and account-deletion worker E2E succeeded. Every subsequent HEAD must be checked independently; these checks do not prove Production RLS or a restorable privacy-safe backup.

### Shared-memory recovery boundary after owner approval and exact-head GREEN (2026-11-10)

- **Earlier implementation proven at `30ec78a`:** manual owner CRUD, active Member/RLS restrictions, grant-independent same-Subject context selection and exact offline model-request count; migration 2370 deletes shared-memory rows during the existing atomic account finalizer. Those earlier disposable PostgreSQL tests cover rollback preservation, physical erasure and idempotent completion. The current `73c1a710` CI is also GREEN, including the subsequent separately approved individual-note post-backup replay tests. None of these checks proves Production migration application.
- **Existing approved backup semantics:** encrypted `P30D` backup blobs are not rewritten per deletion. The off-primary privacy recovery ledger only authorizes explicitly supported events in the exact captured window after the selected backup; prior bounded successful replay cannot be extrapolated to later backup/incident windows. Recovery admission still reports `futureSafePrivacyReconciliation=false` and `drReady=false`.
- **Individual note deletion is now approved and synthetic restore tested:** the owner explicitly approved separate `SHARED_MEMORY_NOTE_DELETED` authority. Migration 2380 atomically records item/Subject UUID and deletion time without text, and the existing encrypted P30D captured-window manifest and privileged planner accept and replay this distinct event. In the GREEN exact HEAD `73c1a710`, the real read-only exporter SQL was exercised against a synthetic PostgreSQL post-backup deletion and the extracted event physically erased the note in an isolated backup clone; identical replay preserved the deletion marker and did not resurrect plaintext. **Still unresolved:** a governed migrated Production schema, an independently complete actual off-DB ledger covering the selected incident, and a real Production backup/Hosted recovery acceptance. Do not turn synthetic captured-window mechanics into service-resumption or future-safe claims, and do not enable the public endpoint.
- **Implementation frontier:** Phase 3 semantic/causal signals, Phase 5 durable automatic memory, Phase 6 semantic/persistent compaction, Phase 7 real-model quality/cost and Phase 8 Provider/independent Character rollout remain source-/model-/paid-evaluation-gated as stated below. Do not repeat already-GREEN offline evaluation, RLS, finalizer or catalog-fingerprint work.

## 8. Immediate next work

**As of 2026-11-13:** PR #3068 is merged, not Draft. See the authoritative three-way closeout table in §7.1; do not replay historical "Draft/CI pending" checklist items or start new read-only fixture work to compensate for external blockers.

1. **Within the approved offline scope:** no unfinished generic implementation or synthetic evaluation work remains identified. Existing source-bound retrieval, composer, manual-note mechanics, compaction and offline evaluation are implemented/verified/merged. The absence of unsupported causal/source evidence is a *hold*, not permission to invent a new input registry.
2. **Approved hold (no request to the owner):** retain manual shared notes, automatic Memory collection/writes OFF, unsupported source schemas closed, individual Character/private/Official Saju source fences intact. Source-owner resolutions for SRC-25/SRC-05/SRC-10 and SRC-22 can enable future separate implementation when actual evidence is supplied.
3. **External integration dependency:** GEPA owns model comparison and optimization; Character content publication owns canonical bundles, SRC-15/16 and visual/cue provenance; the Provider/Cost Governor/Guard/ACK and Security/Operations tracks own their respective live controls. Do not attempt to close their gates here through more offline tests or repeat questions settled in `docs/CHARACTER_SHARED_MEMORY_OWNER_DECISION_V1.md`.
4. **Production/paid gate:** manual shared-memory endpoint remains disabled; no migration or public route release until independently verifiable production/backup/privacy/security evidence exists. Owner pilot consent does not override missing invoice/key/hard-limit/global-reservation controls; paid calls remain disabled.
5. **Resume rule:** name the concrete new artifact or evidence, the source-owning track, and the precise outstanding integration test when a dependency changes. If no new authoritative evidence exists, report `OFFLINE_SCOPE_COMPLETE / ROADMAP_IN_PROGRESS` and stop; do not manufacture extra tasks or label already completed work as unfinished.

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

### Owner-approved individual shared-note delete recovery (2026-11-10)

The owner approved immediate note-text erasure with a strictly identifier/time-only transactional recovery event and replay in the existing encrypted P30D ledger. Migration `2380_subject_shared_memory_note_deletion_recovery_v1.sql` adds a read-isolated deletion metadata table, an atomic after-DELETE trigger and a privileged replay command. The governed read-only extractor, deterministic manifest validator and transactional planner now support `SHARED_MEMORY_NOTE_DELETED` separately from Character `MEMORY_ITEM_REVOKED`. Replaying a historical note deletion can erase restored text, preserve the original event time, or accept a note absent from the backup; mismatched Subject/event time fail closed.

Status: **OWNER POLICY DECIDED / EXACT-HEAD GREEN at `73c1a710` / ISOLATED SYNTHETIC RESTORE AND SOURCE EXTRACTION VERIFIED**. CI, Governance, Web Auth Browser Regression and Web PR Domain Gates all completed SUCCESS on that same head. The five-event protected synthetic restore and the separate test that executes the real Production read-only SQL extractor against a synthetic committed deletion, then replays the exact extracted event into a PostgreSQL backup clone, are both CI GREEN. This proves bounded offline mechanics, but not continuous off-DB capture, a real Production backup, migration lineage, Hosted Auth/Storage equivalence, whole-service recovery or source publication. Before activation, require independently governed Production migration/restore evidence. `MYEONGHA_SHARED_MEMORY_ENABLED=0` remains the default; `futureSafePrivacyReconciliation=false`, `drReady=false`.

### Owner paid-evaluation consent and exact pilot readiness (2026-11-11)

The owner explicitly reconfirmed that paid model evaluation may proceed. The previously approved additional **KRW 5,000** allowance and the pinned C08-T six-call first batch (A01/H01/C02 mixed, Original/Compact; `gpt-5.6-luna`, output cap 1,024 tokens, no retry, fixed pre-dispatch reserves) remain the approved scope. This consent does not change the Provider/model release plan, permit an unlimited evaluation, or authorize Production exposure.

The existing main-only read-only C08-U workflow [run 42985531155](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42985531155) succeeded with `MODEL_GET_ACCESSIBLE` for `OPENAI_EVAL_API_KEY`. The first-ever offline-only C08-V manual rehearsal [run 42985971822](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42985971822) completed with 6/6 synthetic mocked slots, all budget reservations, and no failed screen. Neither workflow issued a paid inference request.

**Outstanding technical/billing evidence remains independent of consent:** the 11 previous billed calls lack verified invoice reconciliation; the dedicated Project/Key association, current period spending, and project USD 1 `Enforce a hard limit` setting cannot be inferred from a model GET; the existing C08-Z PostgreSQL ledger is disposable `OFFLINE_ONLY` and does not attest a real cross-run reserved paid execution or live production admission. Therefore `paidDispatchEnabled=false`, `providerHardLimitVerified=false`, `invoiceReconciled=false`, `actualBilledKrw=null`, and Phase 7 remains incomplete. Do not flip the old workflows' `if: false` guards or issue paid POSTs until the remaining independent controls are verified. No change to the S0 Security, manual shared-memory or automatic-memory release holds.

## 2026-11-11 — read-only external billing evidence adapter (no paid dispatch)

A new explicitly scoped verifier `scripts/seyeon-c08-admin-spend-readiness-v1.mjs` reads only the official OpenAI Admin API project hard spend limit (`GET /v1/organization/projects/{project_id}/spend_limit`) and month-to-date project costs (`GET /v1/organization/costs`). The response must show `object: project.spend_limit`, `currency: USD`, monthly interval, `enforcement.status: enforcing` and a hard limit of no more than USD 1, in keeping with existing C08-T policy. Costs are paginated, pinned to the explicit project and UTC current month, and checked against the six-slot original reservation (19,662 microUSD).

This is an OPTIONAL standalone read-only diagnostic, not a prerequisite for merging, CI, or activation. It accepts separate Admin credentials and a project ID only if voluntarily executed; nobody is required to create or register them to merge the Character Memory track. It never reuses Production credentials, issues paid POSTs, or grants paid-dispatch authority.

A successful Admin readback would still leave independently unverified: exact project binding of the `OPENAI_EVAL_API_KEY` secret, prior eleven-call invoice reconciliation, reported cost freshness and eventual billing, durable cross-run paid reservation, and the actual reviewed paid-execution workflow. It is not proof that provider enforcement is instantaneous. No live Admin key or project ID was supplied in this worktree; the local default therefore returns HOLD without network access. C08-U model GET and C08-V mock 6/6 remain the only actual verified live/offline results respectively; owner budget approval is recorded but does not override these gates.

Tests: `npx vitest run test/seyeon-c08-admin-spend-readiness-v1.test.mjs`. Official current sources: https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/subresources/spend_limit/methods/retrieve and https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs and https://developers.openai.com/api/docs/guides/spend-limits .

### Evaluation-project active-source boundary (2026-11-12)

The existing read-only Admin spending diagnostic now checks `GET /v1/organization/projects/{project_id}` against the exact configured project ID, active state and absent archival before reading the project hard spending limit or current-month costs. Any mismatch, archived state or failed GET returns HOLD without continuing. Additional source-bound negative tests preserve the original zero-paid-dispatch contract. This is **not** an attestation of the actual evaluation key's Project ownership, the preceding 11 invoices, the current month's invoice finality, or the real cross-run paid reservation; the paid workflow and Production G0–G6 remain locked. API reference: https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/methods/retrieve .

### Optional Admin workflow retired by owner (2026-11-13)

The manual-only Admin-spending GitHub Actions workflow was removed. It was an optional diagnostic, not a required merge or deployment gate. Run #43384082891 failed because the optional Secret and evaluation-project Variable were not configured. Their registration is NOT required to merge this PR. The standalone read-only diagnostic remains available for voluntary future use; it does not grant spending authority. Existing billing, key attribution, provider limits, and cross-run reservation checks remain on HOLD with paidDispatchEnabled=false.

### 2026-11-13 — C08 evaluation-key ID project metadata readback (read-only, non-authorizing)

- The existing C08 Admin GET readiness verifier now optionally reads the exact `/organization/projects/{project_id}/api_keys/{api_key_id}` metadata for the independently configured non-secret `OPENAI_EVAL_API_KEY_ID`. It first verifies the project is active, then requires that the key record ID matches and that the key owner has active project access. A mismatched, inactive, missing or invalid record returns HOLD before cost reads.
- The optional standalone read-only verifier accepts a non-secret key-ID environment value only when deliberately executed. If unset, the independent project/hard-limit/current-cost path reports projectKeyMetadataVerified=false.
- **Important authority limit:** matching a project-owned **key ID** does not cryptographically prove that the existing `OPENAI_EVAL_API_KEY` Secret holds that exact key. `projectCredentialBindingVerified=false` and `paidDispatchEnabled=false` remain mandatory. No new invoice, historical 11-call reconciliation, live billing, cross-run reservation, real-model use, memory write, migration or Production permission is granted. Real Admin readback not observed from this Draft PR.
- Uses the current documented Admin GET key metadata shape, not a masked-key string comparison or new Provider key creation. This is a narrower read-only evidence step for the already-listed C08 key/project identity gap, not completion of Phase 7.


### 2026-11-13 — Evaluation Admin key expiry and exact project admission (read-only)

- Aligned the optional C08 project-key metadata check with the existing C08-AB source policy: the Admin project response must identify the exact `MyeongHa-Evaluation` name, and an active owner's key must not be expired at the pinned readback time. A key created in the future, an invalid expiration timestamp, a malformed project-key owner identity, or a mismatched key/project is rejected before any limit/cost readback.
- The key ID remains optional for standalone read-only diagnostics; the verifier does not consume the evaluation model API key Secret, send paid Provider POST requests, write Memory, or enable Production.
- The earlier 16/16 Windows Vitest result covered the then-present optional workflow and Admin checker. The workflow and its dedicated test are now retired; no previous approval of paid dispatch, invoice reconciliation, or Production is inferred from that historical result.


### 2026-11-13 — Prior eleven C06/F01/C07 charged attempts: independent daily aggregate readback candidate

- Confirmed original historical C06 (3), F01 V2 (2) and C07 (6) workload provenance, with GitHub Actions run timestamps all falling on 2026-10-16 UTC. The existing 3,770 microUSD estimated usage and 36,047 microUSD conservative reserve remain **non-invoice** evidence.
- Added `scripts/seyeon-c08-prior11-provider-cost-v1.mjs`: a separate read-only Admin GET for the fixed historical UTC date with independently configured *historical* project and API-key IDs, checking exact date bucket, project/key attribution, USD shape, complete response, and bounded cost sum. It never substitutes the new C08 evaluation project/key for old usage and never initiates paid models, credentials purchases or database writes.
- Provider Cost API returns **daily aggregated costs**, not 11 per-call invoices; other key traffic and final charges can differ. Therefore an observed daily amount does not reconcile earlier eleven calls; `elevenRequestReceiptsVerified=false`, `invoiceReconciled=false`, `actualBilledKrw=null`, and `paidDispatchEnabled=false` are immutable. Past actual project/key IDs and provider/Admin credentials remain unavailable.
- Offline local historical aggregate and existing Admin regression tests: 22/22 PASS. External/historical billing evidence is still required before the separately approved six-call C08-T paid trial; no release or automatic Memory authority changes. See `docs/character-memory-seyeon-c08-prior11-provider-cost-v1.md`.


### 2026-11-13 — C08 prior 11 historical usage/cost aggregate corroboration (read-only)

- The previous C06 (3), F01 V2 (2) and C07 (6) calls were executed on 2026-10-16 UTC. The existing historical Costs readback checks the independently verified *old* project/key and one-day UTC aggregate; the new `seyeon-c08-prior11-usage-cost-crosscheck-v1.mjs` additionally checks `GET /v1/organization/usage/completions` for the same old identity/day, pinned model, hourly buckets and exactly eleven aggregate model requests, with all pagination and identity ambiguity handled as HOLD.
- Both queries are **Admin GET only**, without adding a paid inference workflow, Production access, new secrets, user messages or any automatic Memory operation. Real historical project/key IDs and Admin access have not been supplied; any missing source blocks all external calls.
- **Absolute evidence boundary:** aggregated provider requests and daily project/key cost are not independent eleven per-request receipts or an invoice; other calls and additional models on that key cannot be excluded. Even if both GETs match, `invoiceReconciled=false`, `actualBilledKrw=null`, `paidDispatchEnabled=false`, Production and shared-memory release HOLD remain mandatory.
- Local Vitest for the earlier aggregate cost, new hourly usage crosscheck and current Admin budget diagnostics: 28/28 PASS. Exact new PR HEAD CI must succeed; Phase 7 / C08 paid evaluation remains unfinished. Details: `docs/character-memory-seyeon-c08-prior11-usage-cost-crosscheck-v1.md`.


### 2026-11-13 — historical 11-call same-key hidden-model and time-gap controls (read-only)

- Reconciled the C08 usage/cost collector with the official OpenAI Admin Completions Usage API: filtering the usage request to the expected model would hide other-model requests on the same old Project/Key. Removed that model filter and instead inspects model-grouped responses for any non-approved model, returning HOLD on sight.
- Requires a complete, strictly ordered 24-bucket UTC day (including explicitly empty idle hours); omitted, reordered, duplicated or foreign-attribution hourly records HOLD. The previous verifier could have classified a two-hour subset as a valid historical day. Source correctness improved without adding real keys or new payable requests.
- Local targeted regression: 30/30 PASS (prior costs, hourly usage, Admin preflight, read-only workflow). This remains **aggregate accounting only**: neither exact eleven individual receipts, the real invoice, FX, additional provider costs nor historical key exclusivity is independently proven. `invoiceReconciled=false`, `actualBilledKrw=null`, `paidDispatchEnabled=false`, automatic Memory OFF, Draft PR #3068 and Production HOLD remain unchanged.



### 2026-11-13 — Phase 7 changed-fact and supersession source-gold evaluator (offline)

- Implemented `packages/domain/src/character-memory-changed-fact-offline-evaluation-v1.ts` to compare existing read-only Life Fact retrieval with **independently pinned synthetic source-grant history** for the exact canonical User turn time. Validity, creation/confirmation/grant timestamps, historical supersession references, revocation, original Subject/Character and duplicate/foreign source references are verified without relying on model assertions.
- A source with an explicit correction must name the same-topic predecessor, have a later confirmation and a non-overlapping effective interval. Multiple current sources for the same independently relevant topic, previously superseded facts, future or revoked facts are not silently promoted. The output is redacted to booleans and counts and never declares real User fact truth or model semantic recall.
- Focused fixture tests exercise before/after replacement, stale retrieval, future evidence, conflicting overlapping facts, invalid lineage, revocation, wrong-scope/grant, duplicate retrieval and unrelated topic abstention. This is a **partial Phase 7 offline source correctness** axis; no automatic consolidation/supersession in Production, new authorization or actual evaluated model answer is provided.
- See `docs/character-memory-changed-fact-offline-evaluation-v1.md`. Existing Phase 5 automatic Memory, Phase 8 Provider/Production, Source authority, C08-T capped paid pilot and historical 11 invoice evidence remain unchanged/HOLD.

- Strengthened the offline temporal guard to require the evaluator's instant to match the original retrieval query's canonical User-turn timestamp and positive message sequence; a grant before record creation or a revocation before grant is invalid. Corrected a missing revocation predicate grouping detected by test failures; independent changes are only source-fixture validation, not automatic fact mutation. The three relevant local suites passed 33/33 after the fix.
