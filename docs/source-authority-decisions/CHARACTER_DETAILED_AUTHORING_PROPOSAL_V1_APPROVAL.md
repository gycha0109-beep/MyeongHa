# Character Detailed Authoring Proposal v1 — Product Owner Approval

> 상태: **APPROVED SEMANTIC BASELINE / NOT PRODUCTION CHARACTER CONTENT**  
> 승인일: **2026-09-07**  
> 대상 proposal: `docs/character/CHARACTER_DETAILED_AUTHORING_PROPOSAL_V1.md`  
> proposal source commit: `7d80f0fc790a9cd7614d358d87264d97ecdc907c`  
> 승인 범위: MVP Launch 9명 전체 + Proposal v1의 roster-level semantic proposal 전체

## 1. Product Owner decision

Product Owner가 현재 대화에서 **“ㅇㅋ 제안 승인”**이라고 명시적으로 결정했다.

직전 decision gate가 제시한 승인 대상은 `Character Detailed Authoring Proposal v1 전체 9명`이었고, 본 응답은 그 제안에 대한 명시적 승인으로 해석한다.

따라서 결정은 다음과 같다.

```text
proposal: Character Detailed Authoring Proposal v1
scope: all nine Launch Characters + all roster-level semantic proposal sections contained in v1
decision: APPROVE
```

대상 Character:

```text
세연 / 여울 / 서린 / 라현 / 미라 / 태겸 / 윤호 / 도윤 / 백헌
```

## 2. Approved semantic scope

각 Character에 대해 Proposal v1에 실제로 기재된 다음 semantic thesis를 승인된 authoring baseline으로 사용할 수 있다.

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

Roster-level로 Proposal v1에 기재된 다음도 승인된 semantic baseline이다.

```text
cross-roster differentiation overview
close-pair separation rationale
functional-role regression self-review
directed/asymmetric Character-to-Character relation seeds
shared-history seeds
visual differentiation theses across roster
```

이 승인은 Proposal v1의 wording과 의미 범위 안에서만 유효하다. 후속 authoring이 의미를 추가·변경하면 새 승인 대상이다.

## 3. Explicit exclusions — still NOT approved

Proposal v1이 의도적으로 값 자체를 정하지 않았던 다음 항목은 이번 승인에 포함되지 않는다.

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

특히 Proposal v1의 `deity-bond thesis`와 `visual differentiation thesis` 승인은 방향/semantic thesis 승인이지, 실제 deity 또는 immutable visual 값의 승인으로 확장하지 않는다.

## 4. Authority transition

이 승인으로 다음 단계가 허용된다.

```text
approved Proposal v1 semantic baseline
→ immutable Character authoring baseline으로 번역
→ 아직 미승인인 canonical IDs / gender / age / origin / deity / final visual / runtime keys 별도 authoring + approval
→ schema + Production validator
→ world relation/history canonicalization
→ SRC-35 differentiation acceptance
→ asset provenance
→ immutable bundle
→ catalog/release registration
→ Production publication
```

이번 승인만으로 Production publication은 허용되지 않는다.

## 5. Current result

```text
Proposal v1 technical CI                 PASS
Proposal v1 Product Owner decision       APPROVE
9-Character semantic baseline            AUTHORIZED
Immutable complete Character canon       PARTIAL / NOT YET COMPLETE
Production Character publication         BLOCKED
Positive Member Chat Production smoke    BLOCKED pending real published Character/content
```

이 문서는 `CHARACTER_DETAILED_AUTHORING_PO_DECISION_GATE_V1.md`의 PENDING 상태를 후속 source-authority decision으로 supersede한다.
