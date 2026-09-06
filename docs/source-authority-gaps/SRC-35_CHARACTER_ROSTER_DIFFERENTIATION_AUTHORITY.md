# SRC-35 — Character Roster Differentiation Authority

> Status: **OPEN / BLOCKING for production-authoritative Character roster differentiation acceptance**  
> Domain: Character / Content / World / Production Readiness  
> Source authority reviewed:
> - `MyeongHa_Character_System_Architecture_C1_v0.1_SELF_REVIEWED(1).md`
> - `docs/character/CHARACTER_CONCEPT_V1_WORKING_ROSTER.md`
> - `docs/source-authority-decisions/CHARACTER_LAUNCH_MVP_AUTHORITY_V1.md`
> - current `@myeongha/character-content` schema / validation / Production publication boundary
> - current world-content directed Character relation contract
> - existing source-gap contracts through `SRC-34`
> - PR #542 launch-roster authority enforcement

---

## 1. Gap

Character C1 fixes a **Launch core architecture minimum of five Characters** and requires the launch roster to be differentiated by relational experience rather than by five functional Saju menu roles.

The later Character Concept V1 source established a nine-person working concept roster. Product Owner authority on 2026-09-06 then resolved the launch membership/name portion of the earlier open Character decision:

```text
MVP Production Launch roster = exactly 9

세연 / 여울 / 서린 / 라현 / 미라 / 태겸 / 윤호 / 도윤 / 백헌
```

Those nine names are now the approved official Launch display names, and `미라` is no longer temporary. PR #542 additionally enforces this exact nine-name boundary in the Production Character-content validator.

This resolves the previous ambiguity between the C1 minimum and the concrete MVP launch roster:

```text
5 = C1 architecture floor / historical minimum requirement
9 = approved MVP Production Launch roster cardinality
9 approved display names = current Launch name authority
```

It does **not** establish canonical `characterId` values or the still-missing detailed immutable Character content. Canon, Persona, Behavior, SajuProfile, RelationshipBehavior, gender, visual, origin, apparent age, deity binding, cross-Character history, and asset provenance remain separately governed authoring/review work.

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

However, source still does **not** define the deterministic executable acceptance semantics that turn those qualitative requirements into a Production `PASS` or `FAIL` for the approved nine-person roster.

The repository can validate exact Launch membership/display names and that one Character is fully authored, but it cannot safely decide whether the authored nine-person roster is sufficiently differentiated without inventing comparison semantics. This missing executable decision remains `SRC-35`.

## 2. What source authority already fixes

### 2.1 Exact MVP Launch roster identity surface

Source now fixes all of the following:

- C1 architecture minimum roster size is five;
- the concrete MVP Production Launch roster is exactly nine Characters;
- the official Launch display names are `세연`, `여울`, `서린`, `라현`, `미라`, `태겸`, `윤호`, `도윤`, `백헌`;
- `미라` is a final Launch display name, not temporary;
- all nine are default-available to normal Members at Launch;
- the launch roster is not a set of Saju functional menu owners;
- the roster must provide different relational experiences;
- speaking style alone is insufficient for Character Differentiation PASS;
- Character identity is grounded in world role, deity bond, human theory, values, question strategy, and relationship behavior rather than legacy functional archetypes;
- the nine relationship-fantasy directions are source-backed concept evidence, not detailed immutable Canon/Persona/Behavior/SajuProfile/RelationshipBehavior authority.

Therefore the exact Launch roster cardinality/membership/display names are **no longer part of the unresolved SRC-35 question**. `SRC-35` now concerns whether the eventually authored detailed content for those approved nine Characters is sufficiently differentiated.

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

The current Character Concept V1 Launch roster snapshot is intentionally **not** a complete `CharacterContentDefinition`. It still contains no canonical `characterId` and no approved detailed per-Character Canon/Persona/Behavior/SajuProfile/RelationshipBehavior payload.

Therefore `SRC-35` is not an individual authored-content completeness gap. It is a **roster-level comparison / acceptance** gap that becomes executable after the approved nine Characters have source-authorized detailed content and relation/world evidence.

### 2.3 Cross-Character relationship intent

Source fixes that Character relations may be directed/asymmetric and that the launch roster requires positive connection, tension, asymmetry, and shared history rather than only generic `friend / rival / enemy` labels.

Current world-content can represent directed `fromCharacterId → toCharacterId` relations and relation summaries, but source has not yet fixed the machine-verifiable representation and acceptance semantics for all four required relationship qualities.

The approved nine-person relationship-fantasy directions concern each Character's intended relationship experience with the user. They do not establish the immutable Character-to-Character relation graph and must not be used as cross-Character relation evidence.

### 2.4 Visual diversity intent

C1 forbids converging the roster into a homogeneous romance-game presentation and recommends diversity in gender presentation, perceived age, mature presence, romance coding, visual authority/strangeness, silhouette, palette, motif, and costume language.

The source wording mixes explicit prohibitions and recommendations. Repository code must not silently promote recommendation-level guidance into numeric quotas or hard demographic gates.

Concept/reference images are not immutable visual canon, so incidental clothing, props, backgrounds, expressions, palettes, or accessories cannot be used as Production differentiation authority until separately approved as versioned visual content.

## 3. Missing differentiation authority

### 3.1 Comparison scope

The exact roster is now known to be the approved nine Launch Characters, but source does not define how differentiation is evaluated across those nine:

```text
pairwise between every Character
against at least one other Character
across the roster as a whole
against a designated anchor/baseline Character
or by another deterministic topology
```

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
- the minimum graph-level coverage for all nine approved Launch Characters.

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

Until this is fixed, a Production validator cannot claim authoritative differentiation PASS merely because individual schemas are complete or because the nine relationship-fantasy strings differ.

## 4. Current safe boundary

Source-complete and enforceable now:

```text
C1 Launch architecture minimum >= 5
MVP Production Launch roster cardinality = exactly 9
approved Launch membership = 세연 / 여울 / 서린 / 라현 / 미라 / 태겸 / 윤호 / 도윤 / 백헌
approved official Launch display names = same nine names
미라 temporary-name status = ended
Launch nine default-available to normal Members
source-backed relationship-fantasy direction
no development placeholders in Production Character content
individual Character authored-content completeness once detailed content exists
versioned immutable bundle/hash provenance
source-authored gender presence for Production content
versioned visual-authoring presence for Production content
real flaw / hidden motivation presence for Production content
canonical directed Character relation representation once IDs/relations are authored
```

Not source-complete yet:

```text
canonical characterId values for the nine Launch Characters
final gender / origin / apparent age / deity / visual canon values
approved detailed Canon / Persona / Behavior / SajuProfile / RelationshipBehavior
immutable Character-to-Character relation graph and shared history
asset provenance for actual Launch content
roster-level Character Differentiation PASS
numeric diversity score
pairwise uniqueness gate
semantic-similarity threshold
graph-level relation diversity gate
visual diversity score / demographic quota
machine assertion that the final nine-person roster provides sufficiently different relational experiences
```

## 5. Relationship to existing authority gaps

`SRC-35` is distinct from existing blockers:

```text
O-C1-05
→ PARTIALLY RESOLVED by 2026-09-06 Product Owner decision
→ exact Launch membership/cardinality + official display names are fixed
→ canonical IDs and detailed immutable Character content remain open

SRC-15
→ whether resolved content is compatible with the current client

SRC-16
→ Member MVP subject-specific rollout is superseded by the uniform active-default policy;
   remaining compatibility/release concerns are handled separately

SRC-23
→ not required for the approved Launch nine, which are default-available;
   remains relevant to future conditional unlock Characters

SRC-27
→ how content bundles/releases are registered, activated, retired, and audited beyond the approved MVP lifecycle subset

SRC-34
→ Member single-Character create/reuse core is resolved by the approved policy + migration 0970 + HTTP authority;
   Guest/first-meeting side effects and other broader semantics remain separate

SRC-35
→ how the authored detailed content and relation/world evidence for the approved nine-person Launch roster is accepted as sufficiently differentiated for Production
```

Resolving the remaining `O-C1-05` detailed authoring does not itself define the roster-level differentiation algorithm. Conversely, resolving `SRC-35` does not authorize inventing canonical IDs or detailed Character facts.

## 6. What implementation must NOT invent

Until source resolution, do not add a Production differentiation gate that silently chooses:

- canonical Character IDs derived from the approved display names;
- a numeric Character-diversity score;
- an arbitrary minimum number of differing axes;
- pairwise uniqueness for every free-form field;
- an embedding/LLM similarity threshold as authority;
- a mandatory enum taxonomy for currently free-form worldview/persona values;
- visual similarity thresholds;
- perceived-age or gender quotas inferred from assets;
- `relationType` labels as sufficient proof of positive tie/tension/asymmetry/shared history;
- human-review approval semantics that source has not defined.

Also do not weaken or reopen the already approved Launch boundary:

```text
exact nine Launch members
exact nine official display names
미라 final display name
all nine default-available to normal Members
```

Do not author real immutable roster canon merely to exercise a speculative differentiation validator.

## 7. Recommended source completion

Source authority should explicitly fix, at minimum:

1. source-approved detailed immutable Character content for each of the nine Launch Characters, including canonical IDs and required content layers;
2. the roster-comparison scope/topology across the approved nine;
3. the mandatory differentiation dimensions;
4. deterministic pass/fail semantics, or an explicit governed human-review authority if the decision is intentionally qualitative;
5. normalization/equivalence rules for free-form authored values;
6. canonical evidence representation for positive tie, meaningful tension, asymmetry, and shared historical event;
7. whether and how visual diversity guidance participates in hard Production readiness;
8. audit/provenance requirements for the final differentiation decision.

The resolution must preserve the existing invariants:

```text
MVP Launch roster = exact approved nine
Character differentiation != speaking-style variation only
Character identity != Saju menu ownership
Character relation may be directed/asymmetric
actual detailed immutable roster canon remains source-authored
```

## 8. Definition of Done

`SRC-35` is CLOSED only when source authority is sufficient to implement and test an acceptance path that can answer, without heuristic invention:

```text
Given the approved nine-person Production Launch roster,
its source-authorized detailed Character content,
and its relation/world evidence,
is this roster sufficiently differentiated to be Production-eligible?
```

A valid closure must make the answer reproducible/auditable and must distinguish authored canon evidence from runtime presentation, concept-direction evidence, or model inference.

Until then:

```text
exact Launch membership/display-name authority = CLOSED
detailed immutable Character authoring = OPEN
individual authored Character validation = AVAILABLE once source-authorized content exists
Production roster-level differentiation acceptance = BLOCKED
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
- `docs/character/CHARACTER_CONCEPT_V1_WORKING_ROSTER.md`
- `docs/source-authority-decisions/CHARACTER_LAUNCH_MVP_AUTHORITY_V1.md`
- PR #504: Production individual Character gender/visual completeness gate
- PR #513: Character Concept V1 source-authority remediation
- PR #542: exact approved MVP Launch roster/name Production enforcement
