# MyeongHa Face Reading Engine Authority v0.3

> Status: **IMPLEMENTATION ARCHITECTURE AUTHORITY CANDIDATE**  
> Date: 2026-08-27  
> Derived from the third-reviewed Face Reading Engine architecture.  
> Scope: authority boundaries that implementation MUST preserve.

## 1. Core verdict

```text
판정 전
→ strict observation / source / methodology verification

판정 후
→ decisive, memorable traditional face-reading diagnosis
```

The engine is not designed to hedge every consumer sentence. Once a bounded claim is resolved, the narrative may state that claim directly. Decisiveness does not authorize semantic expansion beyond the claim.

## 2. Authority ownership

```text
Shared Face Observation Core
= neutral observable face structure

Face Reading Engine
= source-governed traditional physiognomy semantic authority

Face Narrative Layer
= deterministic consumer rendering of resolved semantics

Character Runtime
= character framing / reaction around protected Face Grounding

MyeongHa Product
= lifecycle / consent / history / UI / relationship authority
```

Forbidden shortcut:

```text
Photo → VLM/LLM → physiognomy diagnosis
```

Required path:

```text
Photo
→ observation
→ pinned methodology
→ structured claims
→ governed synthesis
→ narrative rendering
```

## 3. Runtime

```text
RAW IMAGE
↓
Shared Image Intake
↓
Eligibility / Quality Gate
↓
Geometry + Observation Extraction
↓
Canonical Face Observation Snapshot
↓
MyeongHa Static Observation Adapter
↓
Pinned Face Methodology Pack
├─ Source Witness Set
├─ Region Map Definition
├─ Metric Registry
├─ Operationalization Registry
├─ Claim Type Registry
├─ Rule Registry
└─ Comparison Policy
↓
F1/F2/F3/F4/F6 Claims
↓
F7 Domain Synthesis
↓
Semantic Face Reading
↓
Deterministic Face Narrative
↓
Face Grounding
↓
Character Runtime
↓
Output Guard / Commit / Reveal
```

Consumer prose is not engine semantic authority.

## 4. F0–F8 taxonomy

```text
F0  observable geometry / visibility / quality
F1  methodology-bound morphology classification
F2  local feature / palace interpretation
F3  configuration / harmony / tension
F4  type / 五行形相 style classification
F5  dynamic appearance / 氣色 — V1 production disabled
F6  position / life-phase interpretation
F7  bounded domain synthesis
F8  question-specific synthesis
```

Raw geometry stays F0. A domain conclusion does not belong in F0/F1.

## 5. Source authority

```text
SourceWork
→ SourceWitness
→ SourcePassage
→ Methodology Statement
→ Operationalization
→ Rule
→ Claim
```

Production rule promotion requires an exact witness and a `scan_checked` or stronger passage. Electronic transcription is search/research material until checked against a scan.

Textual genealogy is mandatory. Quoted, copied, adapted, or same-lineage passages must not be automatically counted as independent confirmations.

## 6. Observation authority

Observation confidence and traditional diagnosis strength are different concepts.

```text
CV confidence
!= traditional favorable/challenging status
!= fortune score
```

Unavailable observation does not become negative evidence.

```text
covered ear
→ ear section unavailable
!= bad ear diagnosis
```

Static Face Reading v1 MUST NOT consume:

```text
observations.colorAppearance
```

F5 dynamic appearance remains disabled until a separate capture/lighting/methodology program is authorized.

## 7. Operationalization authority

Traditional qualitative terms such as:

```text
長 / 短 / 方 / 圓 / 隆 / 陷 / 清 / 濁
```

cannot be converted into arbitrary pixel thresholds by an implementer.

A valid operationalization pins:

```text
traditional term
+ source refs
+ metric version
+ classification bands
+ review status
```

## 8. Region map authority

三停 / 十二宮 / 十三部位 mappings are methodology/version specific.

There is no generic developer-invented “MyeongHa standard face map”. Every production face region map must carry source refs and a version.

## 9. Comparison authority

Entertainment UX may expose:

```text
TOP 3
most prominent readings
strongest / weakest
```

but wording is constrained by `FaceComparisonPolicy`.

```text
methodology_ordinal
→ strongest / weakest allowed only with an ordering rule

diagnostic_salience
→ most salient / most prominent only

unordered
→ no ranking
```

Do not manufacture hidden fortune scores for ranking.

## 10. Local reading and synthesis

A single feature may produce a bounded F2 diagnosis when the source/methodology authorizes it.

A single local feature does not automatically authorize a whole-life F7 conclusion.

```text
local feature
→ bounded local diagnosis

multiple relevant local/configuration claims
→ governed F7 synthesis
```

`Hidden Tension` is a governed F3/F7 claim. An LLM cannot invent tension from two observations.

## 11. Decisive diagnosis

When a bounded claim is resolved, the narrative should lead with the result.

Allowed style:

```text
관록궁이 강합니다.
중정이 얼굴의 중심입니다.
재물 축은 분명하고 관계 축에는 충돌이 있습니다.
```

The following is not required merely because the system is traditional/interpretive:

```text
~일 수도 있습니다.
~일 가능성이 있습니다.
```

However a bounded claim cannot be enlarged into an unsupported deterministic real-world event. Decisive tone and semantic scope are separate contracts.

## 12. Product fun modules

The architecture explicitly supports:

```text
one-line verdict
Three Divisions life-flow view
Five Officers view
Twelve Palaces face map
most salient TOP readings
mixed primary/secondary type
Hidden Tension
career / wealth / relationship / social lenses
shareable result cards
character reaction to protected Face Grounding
```

These are projections over governed claims, not separate semantic generators.

## 13. FaceLab bridge

Target integration:

```text
                     Shared Face Observation Core
                     /                          \
                    /                            \
            Visually FaceLab              MyeongHa Face Engine
            style authority               physiognomy authority
```

Reusable neutral inputs may include pose, occlusion, outline, vertical balance, eye geometry, feature layout, visual-language geometry, and versioned landmark metrics.

Forbidden cross-authority inputs:

```text
FaceLab animal/archetype label → physiognomy claim
FaceLab style recommendation → physiognomy evidence
Face Reading diagnosis → FaceLab beauty/style authority
```

## 14. Product DB boundary

MyeongHa Product DB does not replicate the full internal Face Claim Graph, source registry, raw landmarks, or rule registry.

Product consumes a version-pinned semantic projection / Face Grounding with provenance refs, unavailable sections, and prohibited inferences.

## 15. Privacy / image lifecycle

V1 defaults:

- raw image ephemeral processing;
- EXIF/metadata removal at intake;
- no identity matching;
- no face embedding authority;
- no silent long-term face-photo retention;
- third-party person face reading is outside V1 scope.

## 16. Implementation gates

```text
FR-0  source / claim / comparison authority
FR-1  Shared Face Observation compatibility
FR-2  scan-checked source passages + region/metric operationalization
FR-3  first F1/F2 rules
FR-4  F3 configuration / Hidden Tension
FR-5  bounded F7 domain synthesis
FR-6  product-safe semantic projection / Face Grounding
FR-7  decisive deterministic narrative profiles
FR-8  FaceLab shared-core integration
```

No stage may bypass earlier authority by inserting attractive consumer copy or free-model interpretation.
