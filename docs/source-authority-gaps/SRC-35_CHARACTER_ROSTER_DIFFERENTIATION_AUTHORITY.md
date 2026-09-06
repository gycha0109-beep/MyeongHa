# SRC-35 — Character Roster Differentiation Authority

> Status: **OPEN / BLOCKING for production-authoritative initial Character roster differentiation acceptance**  
> Domain: Character / Content / World / Production Readiness  
> Source authority reviewed:
> - `MyeongHa_Character_System_Architecture_C1_v0.1_SELF_REVIEWED(1).md`
> - `docs/character/CHARACTER_CONCEPT_V1_WORKING_ROSTER.md`
> - current `@myeongha/character-content` schema / validation / Production publication boundary
> - current world-content directed Character relation contract
> - existing source-gap contracts through `SRC-34`

---

## 1. Gap

Character C1 fixes a **Launch core minimum of five Characters** and requires the launch roster to be differentiated by relational experience rather than by five functional Saju menu roles.

A later Character Concept V1 source now fixes the **current working-concept roster at exactly nine Characters**:

```text
세연 / 여울 / 서린 / 라현 / 미라 / 태겸 / 윤호 / 도윤 / 백헌
```

That later source simultaneously states that the current names, detailed age, and detailed canon are not final immutable authority, and that `미라` is a temporary name. Therefore the two cardinality statements must not be collapsed into one authority claim:

```text
5  = C1 Launch architecture minimum
9  = current Character Concept V1 working-roster composition
?  = exact immutable Production launch roster until O-C1-05 is resolved
```

The later nine-person working roster supersedes an exact-five **working roster assumption**, but it does not rewrite C1's minimum-five launch constraint and does not itself establish nine immutable Production Character identities.

C1 also fixes substantive differentiation dimensions and minimum relationship evidence. In particular, it requires each C2 Character to be designed differently across at least these dimensions:

```text
Human Theory
Question Strategy
Agency View
Conflict Style
Memory Attitude
Saju Attention
Relationship Progression
Other-character relations
Real flaw
Hidden motivation
```

C1 separately defines broader roster differentiation axes such as truth style, care strategy, decision style, emotional permeability/expression, cognitive tempo, intimacy pace, trust/friction triggers, self-disclosure, and world sociality.

For Character-to-Character relations, C1 requires each launch-roster Character to have:

```text
1 strong positive tie
1 meaningful tension
1 asymmetrical relation
1 shared historical event
```

However, source does **not** define the deterministic executable acceptance semantics that turn those qualitative requirements into a Production `PASS` or `FAIL` for one exact immutable candidate launch roster.

The repository can validate that one Character is fully authored, but it cannot safely decide whether a candidate launch roster is sufficiently differentiated without inventing comparison semantics. This missing executable decision is `SRC-35`.

## 2. What source authority already fixes

### 2.1 Launch minimum and current working roster

Source fixes all of the following without making them equivalent:

- C1 Launch core minimum roster size is five;
- the launch roster is not five Saju functional owners;
- the roster must provide different relational experiences;
- speaking style alone is insufficient for Character Differentiation PASS;
- final Character identity is grounded in world role, deity bond, human theory, values, question strategy, and relationship behavior rather than legacy functional archetypes;
- later Character Concept V1 fixes the current **working roster** at exactly nine Characters;
- those nine display names are not immutable-name approval, and `미라` is explicitly temporary;
- the nine working-roster relationship-fantasy directions are source-backed concept evidence, not detailed immutable Canon/Persona/Behavior/Saju/RelationshipBehavior authority.

Therefore neither `5` nor `9` may be used as a shortcut for the unresolved question of which exact immutable Character identities form the Production launch roster.

### 2.2 Individual Character completeness

Current repository validation can already require source-authored non-placeholder Character content across:

```text
canon
persona
behavior
sajuProfile
relationshipBehavior
gender
visual
asset-manifest provenance
```

and validates many nested authored values including real flaw and hidden motivation.

The current Character Concept V1 working-roster snapshot is intentionally **not** such content. It contains no canonical `characterId`, no immutable names, and no approved detailed per-Character Canon/Persona/Behavior/SajuProfile/RelationshipBehavior payload.

Therefore `SRC-35` is not an individual authored-content completeness gap. It is a **roster-level comparison / acceptance** gap that becomes executable only after the candidate immutable roster itself is source-authorized.

### 2.3 Cross-Character relationship intent

Source fixes that Character relations may be directed/asymmetric and that the launch roster requires positive connection, tension, asymmetry, and shared history rather than only generic `friend / rival / enemy` labels.

Current world-content can represent directed `fromCharacterId → toCharacterId` relations and relation summaries, but source has not yet fixed the machine-verifiable representation and acceptance semantics for all four required relationship qualities.

The current nine-person working roster also does not establish the immutable Character-to-Character relation graph. Relationship-fantasy direction between a Character and the user must not be mistaken for cross-Character relation evidence.

### 2.4 Visual diversity intent

C1 forbids converging the roster into a homogeneous romance-game presentation and recommends diversity in gender presentation, perceived age, mature presence, romance coding, visual authority/strangeness, silhouette, palette, motif, and costume language.

The source wording mixes explicit prohibitions and recommendations. Repository code must not silently promote recommendation-level guidance into numeric quotas or hard demographic gates.

Current Character Concept V1 images are visual references / concept art, not immutable visual canon, so their incidental clothing, props, backgrounds, expressions, palettes, or accessories cannot be used as Production differentiation authority.

## 3. Missing differentiation authority

### 3.1 Comparison scope

Source does not define whether differentiation is evaluated:

```text
pairwise between every Character
against at least one other Character
across the roster as a whole
against a designated anchor/baseline Character
or by another deterministic topology
```

This remains unresolved whether the eventual immutable launch roster contains the C1 minimum of five, all nine current working-concept Characters, or another source-authorized set satisfying the launch minimum.

### 3.2 Mandatory axes and pass threshold

Source enumerates differentiation axes, but does not define an executable rule such as:

```text
which axes are mandatory for every Character pair
how many axes must differ
whether some axes carry more weight
whether one shared value is acceptable when other axes differ strongly
whether every Character must be unique on every listed field
```

No numeric diversity score or threshold is source-authorized.

### 3.3 Equality / normalization semantics

Many authored values are free-form strings or lists.

Source does not define whether two values are considered equivalent by:

```text
exact string equality
case/whitespace normalization
controlled vocabulary
semantic equivalence
human editorial review
model-assisted review
```

Therefore hard-coded string uniqueness would confuse wording variation with actual Character differentiation, while embedding/model similarity thresholds would invent a new authority.

### 3.4 Relationship evidence semantics

Source requires positive tie, meaningful tension, asymmetry, and shared historical event, but does not define:

- the canonical structured types or evidence fields for those properties;
- whether one relation/episode may satisfy multiple requirements;
- whether reciprocal rows are required to prove asymmetry;
- how `strong` or `meaningful` is determined;
- whether shared historical evidence belongs in relation content, episode content, or an explicit linkage contract;
- the minimum graph-level coverage for the exact immutable candidate Production launch roster.

### 3.5 Visual differentiation semantics

Source does not define an executable visual comparison rule for:

```text
silhouette distinctness
palette repetition
motif repetition
costume-language repetition
perceived age differentiation
romance-coding differentiation
```

It also does not authorize converting recommended diversity guidance into demographic quotas, protected-class inference, or model-estimated age/gender gates.

### 3.6 Review authority

Source does not decide whether roster differentiation acceptance is:

```text
fully deterministic validation
human editorial approval recorded as authority
human review assisted by deterministic evidence
or another governed review contract
```

Until this is fixed, a Production validator cannot claim authoritative PASS merely because individual schemas are complete or because the current nine working relationship-fantasy strings differ.

## 4. Current safe boundary

Source-complete and enforceable now:

```text
C1 Launch minimum Production roster count
current Character Concept V1 working-roster composition = 9
working-name status only (미라 = temporary; others = working)
source-backed working relationship-fantasy direction
no development placeholders in Production Character content
individual Character authored-content completeness once immutable content exists
versioned immutable bundle/hash provenance
source-authored gender presence for Production content
versioned visual-authoring presence for Production content
real flaw / hidden motivation presence for Production content
canonical directed Character relation representation once IDs/relations are authored
```

Not source-complete yet:

```text
exact immutable Production launch Character identities
immutable names for the current working roster
whether all nine working Characters are in the immutable Production launch roster
roster-level Character Differentiation PASS
numeric diversity score
pairwise uniqueness gate
semantic-similarity threshold
graph-level relation diversity gate
visual diversity score / demographic quota
machine assertion that the final launch roster provides sufficiently different relational experiences
```

## 5. Relationship to existing authority gaps

`SRC-35` is distinct from existing blockers:

```text
O-C1-05
→ which exact Character identities are immutable Production canon: canonical IDs, names, gender, visual and detailed Character canon

SRC-15
→ whether resolved content is compatible with the current client

SRC-16
→ which release applies to this subject under rollout policy

SRC-23
→ when/how world state unlocks a Character

SRC-27
→ how content bundles/releases are registered, activated, retired, and audited

SRC-34
→ how one production-authoritative Character Chat thread is created or reused

SRC-35
→ how an authored immutable launch roster is deterministically accepted as sufficiently differentiated for Production
```

Resolving `O-C1-05` by authoring real immutable Characters does not itself define the roster-level acceptance algorithm. Conversely, resolving `SRC-35` does not authorize inventing the actual immutable Character identities or promoting current working names into canonical IDs.

## 6. What implementation must NOT invent

Until source resolution, do not add a Production gate that silently chooses:

- an exact Production roster cardinality solely from C1's minimum-five statement;
- an exact Production roster cardinality solely from the later nine-person working-concept roster;
- canonical Character IDs derived from current working display names;
- a numeric Character-diversity score;
- an arbitrary minimum number of differing axes;
- pairwise uniqueness for every free-form field;
- an embedding/LLM similarity threshold as authority;
- a mandatory enum taxonomy for currently free-form worldview/persona values;
- visual similarity thresholds;
- perceived-age or gender quotas inferred from assets;
- `relationType` labels as sufficient proof of positive tie/tension/asymmetry/shared history;
- human-review approval semantics that source has not defined.

Do not author real immutable roster canon merely to exercise such a speculative validator.

## 7. Recommended source completion

Source authority should explicitly fix, at minimum:

1. the exact immutable Production launch roster identities, separately from the C1 minimum and Concept V1 working roster;
2. the roster-comparison scope/topology;
3. the mandatory differentiation dimensions;
4. deterministic pass/fail semantics, or an explicit governed human-review authority if the decision is intentionally qualitative;
5. normalization/equivalence rules for free-form authored values;
6. canonical evidence representation for positive tie, meaningful tension, asymmetry, and shared historical event;
7. whether and how visual diversity guidance participates in hard Production readiness;
8. audit/provenance requirements for the final differentiation decision.

The resolution should preserve the existing invariants:

```text
Launch minimum >= 5
current working concept roster = 9, non-immutable
Character differentiation != speaking-style variation only
Character identity != Saju menu ownership
Character relation may be directed/asymmetric
actual immutable roster canon remains source-authored
```

## 8. Definition of Done

`SRC-35` is CLOSED only when source authority is sufficient to implement and test an acceptance path that can answer, without heuristic invention:

```text
Given one exact immutable candidate Production launch Character roster and its relation/world evidence,
is this roster sufficiently differentiated to be Production-eligible?
```

A valid closure must make the answer reproducible/auditable and must distinguish authored canon evidence from runtime presentation, working-concept evidence, or model inference.

Until then:

```text
current nine-person working roster may remain concept evidence
individual authored Character validation may proceed only on source-authorized immutable content
real immutable roster authoring remains governed by O-C1-05
Production roster-level differentiation acceptance remains BLOCKED
```

## 9. References

- Character C1: `Character-to-Character Relation`
- Character C1: `Character Differentiation Axes`
- Character C1: `Real Flaw Requirement`
- Character C1: `Initial Roster Architecture Constraint`
- Character C1: `Roster Visual Constraint`
- Character C1 Self-Review Finding 5: minimum C2 differentiation fields
- Character C1 Decision Register: `D-C1-10`, `O-C1-05`
- Character C1 Next Phase: `Phase C1-F — Roster Diversity Constraint`
- Character Concept V1 working roster snapshot: `docs/character/CHARACTER_CONCEPT_V1_WORKING_ROSTER.md`
- PR #504: Production individual Character gender/visual completeness gate
- PR #513: Character Concept V1 source-authority remediation
