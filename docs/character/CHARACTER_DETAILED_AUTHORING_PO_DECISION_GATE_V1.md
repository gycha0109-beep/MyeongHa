# Character Detailed Authoring — Product Owner Decision Gate v1

> 상태: **APPROVED / SEMANTIC BASELINE AUTHORIZED / NOT PRODUCTION CHARACTER CONTENT**  
> 기준 proposal: `docs/character/CHARACTER_DETAILED_AUTHORING_PROPOSAL_V1.md`  
> proposal source commit: `7d80f0fc790a9cd7614d358d87264d97ecdc907c`  
> 승인 evidence: `docs/source-authority-decisions/CHARACTER_DETAILED_AUTHORING_PROPOSAL_V1_APPROVAL.md`  
> 대상: MVP Launch 9명 — 세연 / 여울 / 서린 / 라현 / 미라 / 태겸 / 윤호 / 도윤 / 백헌

## 1. Decision

Product Owner가 2026-09-07 현재 대화에서 Proposal v1 전체 제안에 대해 **“ㅇㅋ 제안 승인”**이라고 명시적으로 승인했다.

```text
proposal: Character Detailed Authoring Proposal v1
scope: all nine Launch Characters + all roster-level semantic proposal sections in v1
decision: APPROVE
```

이 결정은 이전 `PENDING` ledger를 supersede한다.

## 2. Approved per-Character semantic scope

9명 모두 다음 Proposal v1 항목이 승인된 semantic authoring baseline이다.

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

| Character | Decision | Scope |
| --- | --- | --- |
| 세연 | `APPROVE` | Proposal v1 semantic scope 전체 |
| 여울 | `APPROVE` | Proposal v1 semantic scope 전체 |
| 서린 | `APPROVE` | Proposal v1 semantic scope 전체 |
| 라현 | `APPROVE` | Proposal v1 semantic scope 전체 |
| 미라 | `APPROVE` | Proposal v1 semantic scope 전체 |
| 태겸 | `APPROVE` | Proposal v1 semantic scope 전체 |
| 윤호 | `APPROVE` | Proposal v1 semantic scope 전체 |
| 도윤 | `APPROVE` | Proposal v1 semantic scope 전체 |
| 백헌 | `APPROVE` | Proposal v1 semantic scope 전체 |

## 3. Approved roster-level semantic scope

| Area | Decision | Boundary |
| --- | --- | --- |
| differentiation overview | `APPROVE` | semantic baseline only |
| close-pair separation rationale | `APPROVE` | not SRC-35 acceptance |
| functional-role regression self-review | `APPROVE` | semantic design baseline |
| directed/asymmetric relation seeds | `APPROVE` | requires later immutable relation canonicalization |
| shared-history seeds | `APPROVE` | requires later immutable history canonicalization |
| visual differentiation theses | `APPROVE` | direction only; no final visual values |

## 4. Still excluded from approval

Proposal v1 did not establish actual values for the following, so they remain a separate authoring/approval gate.

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

Proposal v1의 `deity-bond thesis`와 `visual differentiation thesis`는 방향 승인이다. 실제 immutable deity/visual 값으로 자동 승격하지 않는다.

## 5. Transition rule

```text
PO APPROVE
→ approved semantic baseline
→ canonical IDs / gender / age / origin / deity / final visual / runtime keys 별도 authoring + approval
→ immutable CharacterContentDefinition authoring
→ schema + Production validator
→ world relation/history canonicalization
→ SRC-35 differentiation acceptance
→ asset provenance
→ immutable bundle
→ catalog/release registration
→ Production publication
```

## 6. Gate result

```text
Proposal v1 technical CI            PASS
Proposal v1 Product Owner decision  APPROVE
Semantic authoring baseline         AUTHORIZED
Complete immutable Character canon  NOT YET COMPLETE
Production publication              BLOCKED
```

`계속 진행`, CI green, PR merge 등은 원래 승인 증거가 아니지만, 이번에는 별도로 명시된 Product Owner 승인 자체가 존재하므로 gate가 닫혔다.
