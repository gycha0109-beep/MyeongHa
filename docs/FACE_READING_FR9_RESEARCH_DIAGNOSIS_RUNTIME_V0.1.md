# Face Reading FR-9 — Research Diagnosis Runtime v0.1

Status: **research-only experience vertical / decisive narrative enabled / production image diagnosis not authorized**

## 1. Goal

FR-9 answers a different question from FR-4~FR-8.

Earlier stages established how a face observation, traditional source, calibration protocol, empirical report, and direct-scan authority must be governed before a machine-produced morphology assertion can become production authority.

FR-9 asks:

> If a bounded set of Face criterion states is already supplied under an explicit research assertion authority, can MyeongHa produce a distinctive, decisive, traceable reading experience without allowing the renderer or Character Runtime to invent semantics?

The vertical is:

```text
explicit research criterion states
→ existing FR-3 F2/F3 claim builders
→ deterministic product salience
→ optional deterministic Hidden Tension
→ ProductFaceReadingSemanticV3
→ deterministic research narrative blocks
→ issued CharacterFaceGrounding
```

FR-9 does **not** turn those criterion assertions into production computer-vision authority.

## 2. Research-only boundary

Every output is sealed with:

```text
status = research_only
```

Input assertion provenance must be one of:

```text
research_fixture
human_label_assertion
```

The second value deliberately does not say `reviewed`, `approved`, or `production`.

FR-9 does not resolve a reviewer registry or certify the label source. It only preserves the caller-declared research assertion class and explicit evidence refs.

Output therefore carries:

```text
assertionAuthority
evidenceRefs
```

They are provenance, not semantic-signature material.

## 3. What FR-9 consumes

The first vertical consumes existing FR-3 Five Officers criterion states:

```text
met
not_met
unavailable
not_evaluated
```

It calls the existing authority-bound functions:

```text
evaluateFiveOfficerStaticSupport()
buildFiveOfficerResearchClaims()
```

The runtime does not accept arbitrary provider scores or provider-created semantic keys.

Unknown criterion IDs remain fail-closed.

## 4. Static-v1 scope remains unchanged

FR-9 does not expand what FR-3 is allowed to observe.

For example, `審辨官` static-v1 currently admits bounded static conditions such as:

```text
criterion.discernment.bridge_straight
criterion.discernment.tip_round_full
```

but does not admit dynamic appearance such as:

```text
criterion.discernment.bright_color
```

A dynamic criterion may appear in a research assertion payload, but FR-3 does not emit it as a static claim and FR-9 does not include it in the semantic signature.

Therefore:

```text
same static states
+ different blocked dynamic assertion
=
same FR-9 semantic signature
+ same FR-9 narrative
```

This prevents false diversity from unsupported input.

## 5. Static support is not 官成

FR-9 uses:

```text
complete
contradicted
insufficient
```

as **static support states**.

It does not create:

```text
審辨官成
採聽官成
保壽官成
監察官成
出納官成
```

The traditional full-formation condition remains blocked because several source conditions are dynamic, capture-sensitive, multi-view, or not yet operationalized/calibrated.

The decisive consumer wording therefore refers to the bounded static support axis, not to a fabricated full traditional formation.

## 6. Product salience policy

The runtime chooses a lead axis deterministically.

Current research product policy:

```text
complete > contradicted > insufficient
```

Ties are resolved by:

```text
more evaluated static criteria
→ more met static criteria
→ canonical Five Officers order
```

This ranking is **not a classical ranking rule**.

It is a versioned product-level salience policy used to decide what the consumer should see first.

The underlying FaceClaims retain their own methodology/source provenance.

## 7. FaceVerdict

The lead axis drives a deterministic semantic verdict key:

```text
face.research.verdict.<officer>.<static_support_state>
```

Example research fixture:

```text
審辨官
  梁柱端直 = met
  準圓庫起 = met

出納官
  方大 = not_met
  端厚 = met
```

produces the headline narrative:

```text
審辨官이 중심을 잡는 관상입니다. 코 쪽 정적 조건이 이번 판독에서 가장 선명하게 모였습니다.
```

The text is decisive because the underlying research assertions are already explicit.

It does not add a probabilistic hedge that was not present in the semantic state.

## 8. Top 3

FR-9 creates up to three deterministic high-salience features from already-issued claims.

Candidate ordering starts with:

```text
lead F3 static-support claim
→ lead F2 local claims
→ strongest contradicted axis and its failed local claims
→ remaining claims by deterministic lead order
```

Duplicate claim refs are removed.

This ordering is a presentation policy, not an additional traditional inference.

## 9. Hidden Tension

Hidden Tension is created only when the same research reading contains:

```text
one complete static-support axis
+
one contradicted static-support axis
```

It produces a new bounded F3 claim:

```text
FACE_TENSION_INTERPRETATION
```

Example:

```text
審辨官 = complete
出納官 = contradicted
```

becomes:

```text
審辨官은 서고 出納官은 꺾입니다. 이번 판독의 핵심 대비는 코와 입 사이입니다.
```

Critical authority distinction:

```text
classical source
→ authorizes the component criteria / officer structure

FR-9 product composition
→ authorizes the deterministic relation between already-issued claims
```

The Hidden Tension sentence is **not presented as a verbatim classical doctrine**.

It is a product-level composition derived from two source-grounded claim states.

## 10. Semantic signature

The research semantic signature is deterministic and excludes request/provenance identity.

It includes only static-v1-eligible criterion states in canonical officer/criterion order.

Therefore these do not change the signature:

```text
readingRef
sourceSnapshotRef
evidenceRefs
assertionAuthority
blocked dynamic criteria
```

while a material static criterion change does.

This provides the basis for future collision tests:

```text
different protected static semantics
→ must not collapse to the same signature/result
```

and false-diversity tests:

```text
same protected static semantics
→ must not diverge because of request IDs or unsupported fields
```

## 11. Decisive narrative contract

Diagnosed research prose is linted against hedge phrases including:

```text
가능성이
일 수도
아마
것 같습니다
추정됩니다
정확히는 알 수 없
보입니다
```

This does not mean the system hides missing evidence.

Missing required static observations are represented structurally as:

```text
static_support_insufficient
section_limited
unavailableSections
```

and the verdict says explicitly that the axis is held rather than converting missing data into negative evidence.

The rule is:

```text
uncertainty before diagnosis
→ explicit structural hold

resolved claim after diagnosis
→ direct wording
```

## 12. Semantic object vs prose

`ProductFaceReadingSemanticV3` remains prose-free.

Consumer text lives in separate deterministic research narrative blocks.

This preserves the architecture:

```text
semantic authority
!=
consumer prose
```

FR-9 does not add `headline`, `summary`, `paragraph`, or free text fields into the protected semantic object.

## 13. Character boundary

A research diagnosis must first be issued by the runtime instance.

Only then may:

```text
projectResearchFaceDiagnosisGrounding()
```

produce `CharacterFaceGrounding`.

The projection contains:

```text
protected semanticClaims
approved deterministic narrative blocks
unavailableSections
prohibitedInferences
```

A structurally identical forged JavaScript object is rejected by the runtime issuance boundary.

This prevents downstream callers from manufacturing an arbitrary diagnosis object and asking the Character Runtime to treat it as authorized engine output.

## 14. Character freedom after FR-9

FR-9 does not yet create character-specific rewrites.

The next layer may vary:

```text
opening reaction
which approved block is mentioned first
question/follow-up style
relationship behavior
```

but must not vary:

```text
claim set
FaceVerdict semantic key
Hidden Tension relation
protected semantic signature
prohibited inference boundary
```

Character personality remains a renderer/relationship concern, not Face semantic authority.

## 15. Prohibited inference boundary

The reading keeps the protected inference blocklist, including:

```text
medical diagnosis
mental disorder
criminality
race/ethnicity
sexual orientation
pregnancy
objective intelligence
biometric identity
```

The existence of a decisive entertainment-oriented traditional reading does not authorize these unrelated sensitive assertions.

## 16. What FR-9 deliberately does not do

FR-9 does not authorize:

- production image → criterion classification
- a production `梁柱端直` threshold
- `審辨官成`
- dynamic 氣色 interpretation
- full Twelve Palaces diagnosis
- full Three Divisions life-period fortune synthesis
- personality claims invented from face geometry
- free-form LLM semantic generation
- Character-created Face claims

## 17. Verification matrix

Tests verify:

1. deterministic FaceVerdict
2. deterministic Top 3
3. deterministic Hidden Tension
4. no full 官成 promotion
5. blocked dynamic criterion cannot alter static signature/narrative
6. provenance IDs do not create false semantic diversity
7. material static criterion changes do change signature
8. missing observation is not converted into `not_met`
9. unknown criteria fail closed
10. duplicate officer inputs fail closed
11. evidence provenance is mandatory
12. assertion-authority enum fails closed at runtime
13. output preserves assertion authority and evidence refs
14. mixed F2/F3 Five Officers module does not claim a local-only comparison group
15. diagnosed prose contains no configured hedge phrases
16. Character grounding accepts only runtime-issued diagnosis objects
17. issued grounding carries only protected semantics plus engine-approved narrative blocks

## 18. Promotion state

| Layer | State |
|---|---|
| FR-3 Five Officers research claims | available |
| FR-9 product salience | research-only |
| FR-9 FaceVerdict | research-only |
| FR-9 Top 3 | research-only |
| FR-9 Hidden Tension | research-only product composition |
| decisive deterministic prose | research-only |
| Character grounding blocks | issued research output only |
| automatic production image diagnosis | blocked |
| production 官成 | blocked |
| production domain fortune synthesis | blocked |

## 19. Next step

After FR-9 is validated, the next useful vertical is Character presentation invariance:

```text
same FR-9 diagnosis
→ strongest-first character
→ contrast-first character
→ detail-first character
```

All presentations must retain the same protected semantic signature and claim set.

That stage tests MyeongHa's core product promise directly:

> the characters can feel genuinely different without becoming competing semantic authorities.
