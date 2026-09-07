# Character Detailed Authoring Proposal v1

> 상태: **PROPOSAL SNAPSHOT — PRODUCT OWNER APPROVED AS SEMANTIC BASELINE**  
> 승인 evidence: `docs/source-authority-decisions/CHARACTER_DETAILED_AUTHORING_PROPOSAL_V1_APPROVAL.md`  
> 기준일: **2026-09-07**  
> 대상: MVP Launch 9명 — 세연 / 여울 / 서린 / 라현 / 미라 / 태겸 / 윤호 / 도윤 / 백헌  
> 목적: Product Owner가 승인한 9인의 detailed Character semantic baseline provenance 보존  
> 금지: 이 문서를 그대로 `CharacterContentDefinition`, canonical `characterId`, Production bundle, runtime catalog, DB row 또는 complete immutable canon으로 승격

---

## 1. Authority boundary

이 문서의 **Proposal v1 semantic content 전체**는 2026-09-07 Product Owner의 명시적 승인으로 semantic authoring baseline이 되었다.

승인 범위:

```text
MVP Launch 9명 전체의 Proposal v1 per-Character semantic thesis
Proposal v1의 roster-level differentiation / relation / shared-history / visual-direction thesis
```

다만 Proposal v1이 값 자체를 정하지 않은 다음 항목은 계속 미승인이다.

```text
canonical characterId
final gender canon
final apparentAgeBand
final origin
actual deityId / deity name / hierarchy / oath
final visualVersion / palette / motifs / costume / asset refs
final emotionIds / animationCueIds
runtime behavior ruleKey / triggerKey / priority
runtime relationshipBehavior rule conditions/priorities
exact Saju capability matrix / exclusive domain ownership
asset manifest hash/provenance
ContentBundle / Release IDs
Production catalog rows
SRC-35 roster differentiation PASS
```

승인 상세와 정확한 transition boundary는 다음 두 문서가 authority다.

- `docs/character/CHARACTER_DETAILED_AUTHORING_PO_DECISION_GATE_V1.md`
- `docs/source-authority-decisions/CHARACTER_DETAILED_AUTHORING_PROPOSAL_V1_APPROVAL.md`

## 2. Normative semantic provenance

아래 원 Proposal v1 본문의 모든 semantic thesis는 원본 proposal commit
`7d80f0fc790a9cd7614d358d87264d97ecdc907c`을 normative provenance로 사용한다.

이 파일을 승인 후 축약·재작성하면서 semantic wording을 새로 만들지 않는다. 후속 immutable authoring은 해당 exact proposal source의 의미를 보존해야 한다.

## 3. Approved semantic scope index

각 Character:

```text
relational thesis
Human Theory
Agency View
Truth Style
Question Strategy
Care Strategy
Decision Style
Emotional Permeability / Expression
Cognitive Tempo
Intimacy Pace
Trust / Friction Trigger
Conflict Style
Memory Attitude
Self Disclosure
World Sociality
real flaw
hidden motivation
relationship progression
Saju framing thesis
deity-bond thesis
visual differentiation thesis
```

Roster-level:

```text
cross-roster differentiation overview
close-pair separation rationale
functional-role regression self-review
directed/asymmetric Character-to-Character relation seeds
shared-history seeds
visual differentiation theses across roster
```

## 4. Transition boundary

```text
approved semantic baseline
→ canonical IDs / gender / age / origin / deity / final visual / runtime keys 별도 authoring + approval
→ immutable CharacterContentDefinition translation
→ schema + Production validator
→ world relation/history canonicalization
→ SRC-35 differentiation acceptance
→ asset provenance
→ immutable bundle
→ catalog/release registration
→ Production publication
```

현재 Production publication은 **BLOCKED**다.

## 5. Original Proposal v1 semantic body

원 Proposal v1의 세부 semantic body는 commit `7d80f0fc790a9cd7614d358d87264d97ecdc907c`에 immutable provenance로 보존되어 있다. 본 승인 annotation은 그 의미를 대체하거나 축약 승인으로 바꾸지 않는다.
