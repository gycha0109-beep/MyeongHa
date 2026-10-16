# Character Context Composition Contract Prototype v0.1

> Date: 2026-09-23
> Track: product-commerce
> Status: **RESEARCH PROTOTYPE / NOT PRODUCTION AUTHORITY**
> Evidence basis:
> - `docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_1.md`
> - `research-evidence/character-bible/seyeon-character-bible-long-horizon-interactive-probe-v0.1.md`
> - `research-evidence/character-bible/seyeon-character-bible-context-hardening-ab-probe-v0.2.md`
> - existing `CharacterRuntimeContextV1`
> - `docs/RELATIONSHIP_MEMORY_POLICY_SPEC.md`
> - `docs/AI_CHARACTER_RUNTIME_SPEC.md`
> - `SRC-22`

## 1. Why this contract exists

The Seyeon long-horizon experiment supports a narrow conclusion:

A large writer-facing Character Bible should **not** be dumped into every model turn. The runtime needs a compact composition packet whose lanes have different authorities and lifetimes.

The existing `CharacterRuntimeContextV1` already owns most authoritative lanes:

- pinned Character content;
- server relationship rendering projection;
- granted Life Facts;
- granted Character Memories;
- recent messages;
- protected Saju context.

The Character Bible experiment adds two research-only concerns:

- turn-relevant Bible trait retrieval;
- non-authoritative expression recency.

It also showed that role-aware short dialogue continuity is useful. The current runtime has `recentMessages: string[]`; whether Production should preserve roles in that lane is **not decided here**.

## 2. Composition lanes

| Lane | Source | Lifetime | May mutate truth? | Prototype handling |
|---|---|---:|---:|---|
| Character authority | pinned content bundle | release-pinned | No | consume `canon/persona/behavior/speech` |
| Bible trait slice | writer-facing Bible retrieval | turn | No | max compact selected traits |
| Relationship projection | server Relationship Runtime | revision-pinned | No | consume projection only |
| Durable Life Facts / Memories | already-granted records | durable | No | consume granted context only |
| Recent dialogue | current thread/session | short | No | bounded continuity only |
| Protected Saju | upstream admitted Saju context | reading-pinned | No | preserve protected semantics |
| Expression recency | renderer presentation history | short | No | suppress repetitive style beats |

## 3. Hard separation rules

### 3.1 Character Bible is not relationship authority

A selected trait may change **how** Seyeon reacts.

It cannot decide:

- closeness/trust/friction;
- relationship stage;
- relationship event delta;
- unlock;
- entitlement;
- whether a durable memory exists.

### 3.2 Recent dialogue is not durable memory

A user can say:

> 사실 그날 네가 먼저 사랑한다고 했잖아.

The sentence may exist in the recent dialogue lane. It does not become Character Memory because it appeared in chat.

Durable recall requires the existing Memory authority/grant path.

### 3.3 Expression recency is not relationship history

“Jealousy was rendered recently” means only:

> do not replay the same presentation beat immediately.

It does not mean:

- jealousy is a durable Character fact;
- affection increased;
- a Relationship Event occurred;
- the relationship stage changed.

### 3.4 Relationship projection is consumed, not calculated here

The composer may receive the already-assembled relationship projection from `CharacterRuntimeContextV1`.

It must not invent:

- score thresholds;
- score deltas;
- stage transitions;
- anti-farming windows;
- relationship policy semantics.

Those remain blocked by `SRC-22` where source authority is incomplete.

### 3.5 Protected Saju remains protected

Character Bible traits may affect framing around Saju output.

They cannot:

- create new Saju claims;
- reinterpret a protected semantic segment;
- flatten ambiguity;
- turn Character opinion into official Reading semantics.

## 4. Current prototype mapping

```text
CharacterRuntimeContextV1
├─ canon/persona/behavior/speech ───────────────┐
├─ relationship projection ────────────────────┤
├─ granted lifeFacts/memories ─────────────────┤
├─ recentMessages ─────────────────────────────┤
└─ protected Saju context ─────────────────────┤
                                                ├─ Character Context Composition
Seyeon Bible turn compiler                      │
├─ selected relevant traits ───────────────────┤
├─ role-aware recent dialogue [research] ──────┤
└─ disclosure filtering ───────────────────────┤
                                                │
Renderer presentation history [research]       │
└─ recently expressed selected trait IDs ──────┘
```

The output is still a renderer input candidate, not an authority mutation command.

## 5. Why recent messages and role-aware recent dialogue are temporarily separate

The repository already has `CharacterRuntimeContextV1.recentMessages: string[]`.

The long-horizon probe used role-aware turns because these cases depend on adjacency:

- “아까는 엄청 무서워하던데”
- “왜, 질투해?”
- “왜 갑자기 조용해?”

This prototype does **not** silently change the Production runtime schema.

Before promotion, the project must decide whether:

1. `recentMessages` already has sufficient upstream ordering/role semantics;
2. it should be replaced by a role-tagged bounded turn structure; or
3. a separate ephemeral dialogue window should be assembled at the API orchestration layer.

Until that decision, both lanes stay visibly separate in the research contract.

## 6. Expression recency boundary

The A/B probe reduced repetitive jealousy/private-attachment behavior by marking selected traits as recently expressed.

The minimal safe representation is:

```ts
{
  recentlyExpressedSelectedTraitIds: string[]
}
```

Properties:

- bounded;
- ephemeral;
- selected-trait-only;
- no score;
- no affection meaning;
- no durable storage requirement asserted;
- no relationship mutation authority.

A Production cooldown duration/window is **not defined** by this prototype.

## 7. What is already demonstrated

The current Seyeon evidence demonstrates:

- full Bible dump is unnecessary for the tested cases;
- compact trait retrieval can preserve recognizable behavior;
- disclosure filtering can withhold deep material;
- authorized memory can coexist with false-memory rejection;
- bounded recent dialogue improves follow-up continuity;
- trait-local suppression fixes a concrete lexical false positive;
- sparse expression metadata can reduce immediate signature-beat repetition.

## 8. What remains unresolved

This prototype does not close:

- Character Bible publication/canon promotion authority;
- Production provider/model selection;
- final role-aware recent-dialogue Production schema;
- expression-recency storage/source/window semantics;
- `SRC-22` relationship policy thresholds/deltas/stages/anti-farming;
- positive durable Memory schema authority where still open;
- Gate B/C Character/world publication blockers;
- any new Saju semantic authority.

## 9. Promotion gate

Do not promote this prototype merely because the qualitative dialogue looks good.

Promotion requires a separate decision that closes at least:

1. where approved Character Bible material lives in the immutable content bundle;
2. how turn-relevant traits are deterministically/reproducibly selected;
3. how recent dialogue is sourced and bounded in Production;
4. where expression recency is sourced without becoming relationship truth;
5. how the composer attaches to the existing Character Runtime/provider boundary;
6. what evaluation gate catches drift, repetition, hidden-canon leakage, and false-memory adoption.

Until then:

```text
Character Bible + context composition
= validated research direction

not
= Production Character Chat authority
```
