# Character Immutable Identity / Deity / Visual Proposal v1 — Product Owner Approval

> 상태: **APPROVED IMMUTABLE AUTHORING BASELINE / NOT PRODUCTION CHARACTER CONTENT**  
> 승인일: **2026-09-07**  
> 대상 proposal: `docs/character/CHARACTER_IMMUTABLE_IDENTITY_VISUAL_PROPOSAL_V1.md`  
> proposal source commit: `34a226e0943d74c07c8d96e6fcfd4e588351683f`  
> proposal blob: `536f9335d14bd1207313b8684d4f470c7d39abde`  
> 승인 범위: **PR #551 전체**

## 1. Product Owner decision

Product Owner가 현재 대화에서 **“#551 전체 승인”**이라고 명시적으로 결정했다.

따라서 PR #551의 proposal 문서에 실제로 기재된 immutable identity / Deity / visual 값 전체를 승인한다.

```text
proposal: Character Immutable Identity / Deity / Visual Proposal v1
scope: PR #551 entire proposal snapshot at 34a226e0943d74c07c8d96e6fcfd4e588351683f
decision: APPROVE
```

대상 Launch Character:

```text
세연 / 여울 / 서린 / 라현 / 미라 / 태겸 / 윤호 / 도윤 / 백헌
```

## 2. Approved immutable authoring scope

승인 범위에는 proposal 원문에 실제로 정의된 다음 값과 roster-level constraints가 포함된다.

```text
canonical stable characterId for all nine
final gender canon
final apparent age band
final origin
exact worldRole wording
five-Deity peer Mandate Circle definition
Deity principles / demands / intervention taboos / symbolic language
per-Character Deity assignments
representation roles
oaths
accepted / resisted doctrines
deityProxyLabel
short descriptor
personalityTraits
values
flaw representation
visualVersion
visualDirection
silhouette
palette
motifs
costumeDirection
prohibitedTropes
roster-level gender/presentation differentiation
roster-level perceived-age differentiation
low-romance / mystery-first differentiation constraints
roster silhouette and palette differentiation constraints
```

이 승인은 위 source snapshot의 wording과 의미 범위 안에서만 유효하다. 후속 authoring이 값을 추가·변경하면 별도 source authority가 필요하다.

## 3. Authority safeguards preserved

이번 승인으로도 다음 경계는 그대로 유지한다.

- Deity는 Saju Domain owner가 아니며 Saju semantic authority를 대체하지 않는다.
- shared Deity는 Character personality/tension을 동일화하지 않는다.
- canonical characterId는 gender, role, Saju domain을 encode하지 않는다.
- 승인된 visual 값은 authored visual canon baseline이지 실제 asset provenance가 아니다.
- 이번 승인만으로 SRC-35 PASS를 선언하지 않는다.

## 4. Explicit exclusions — still NOT approved / not supplied by #551

```text
runtime speech/persona exact strings
behavior ruleKey / triggerKey / priority
relationshipBehavior DSL conditions/priorities
exact Saju capability matrix and safe-framing runtime catalog
emotionIds / animationCueIds
actual image files / asset refs / provenance
asset manifest hash
ContentBundle IDs
ContentRelease IDs
runtime catalog rows
Production publication
positive Member Chat Production smoke
```

## 5. Authority transition

이 승인으로 다음 단계의 authoring/implementation을 진행할 수 있다.

```text
approved semantic baseline (#549)
+ approved immutable identity / Deity / visual baseline (#551)
→ runtime Persona / Behavior / RelationshipBehavior authoring
→ Saju capability + safe-framing catalog authoring
→ emotion / animation stable IDs
→ Character/world relation canonicalization and SRC-35 acceptance
→ asset creation + provenance
→ immutable bundle / manifest
→ release/catalog registration
→ Production publication
→ positive Member Chat Production E2E
```

## 6. Current result

```text
9-Character semantic baseline                 AUTHORIZED
canonical Character identity values           AUTHORIZED
Deity system + Character Deity bindings        AUTHORIZED
immutable authored visual canon                AUTHORIZED
runtime persona / behavior exact authoring     OPEN
asset provenance                               OPEN
Production Character publication               BLOCKED
positive Member Chat Production smoke          BLOCKED pending real published Character/content
```

이 문서는 PR #551의 `PROPOSAL / NOT APPROVED` 상태를 Product Owner decision으로 supersede한다. Proposal 원문 자체는 provenance 보존을 위해 수정하지 않는다.
