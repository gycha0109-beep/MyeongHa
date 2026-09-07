# Character Detailed Authoring — Product Owner Decision Gate v1

> 상태: **PENDING PRODUCT OWNER DECISION / NOT CANON**  
> 기준 proposal: `docs/character/CHARACTER_DETAILED_AUTHORING_PROPOSAL_V1.md`  
> proposal commit: `7d80f0fc790a9cd7614d358d87264d97ecdc907c`  
> 대상: MVP Launch 9명 — 세연 / 여울 / 서린 / 라현 / 미라 / 태겸 / 윤호 / 도윤 / 백헌

## 1. 목적

이 문서는 Character Detailed Authoring Proposal v1의 creative proposal과 실제 immutable Character canon 사이에 **명시적 Product Owner 승인 경계**를 둔다.

다음은 승인으로 간주하지 않는다.

```text
계속 진행
진행
ㄱㄱ
실행
다음
CI green
PR merge
Draft 해제
문서가 main에 존재함
schema/validator 통과
```

이러한 상태는 작업 진행 또는 기술 검증일 뿐, proposed Character semantics의 Product Owner 승인 증거가 아니다.

## 2. 유효한 승인 증거

승인에는 최소한 다음 세 요소가 모두 필요하다.

1. **대상 proposal version** — `Character Detailed Authoring Proposal v1` 또는 exact proposal commit
2. **승인 범위** — 전체 9명 또는 명시된 Character/section
3. **결정** — `APPROVE`, `REVISE`, `REJECT` 중 하나가 명시적으로 드러나야 함

예시:

```text
Character Detailed Authoring Proposal v1 전체 9명 APPROVE.

Character Detailed Authoring Proposal v1에서 세연/서린/윤호는 APPROVE,
여울/라현은 REVISE, 나머지는 PENDING.

Proposal v1의 cross-character relation/history graph는 REJECT.
```

자연어 승인은 위 예시와 정확히 동일한 문구일 필요는 없지만, 대상과 결정 범위가 모호하지 않아야 한다.

## 3. 승인 단위

Product Owner는 다음 단위로 독립 결정할 수 있다.

### 3.1 Per-Character semantic thesis

각 Character별로 다음 proposal 묶음을 함께 또는 부분적으로 승인할 수 있다.

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

부분 승인 시 승인되지 않은 항목은 계속 `PROPOSAL / PENDING`이다.

### 3.2 Roster-level proposal

다음은 per-Character 승인과 별도다.

- cross-roster differentiation overview
- close-pair separation rationale
- functional-role regression self-review
- directed/asymmetric Character-to-Character relation seeds
- shared-history seeds
- visual differentiation theses across roster

이 항목의 승인도 `SRC-35` closure와 동일하지 않다. `SRC-35`는 별도의 reproducible/auditable roster-level acceptance semantics가 필요하다.

## 4. Current decision ledger

### 4.1 Per-Character semantic proposal

| Character | Decision | Scope | Notes |
| --- | --- | --- | --- |
| 세연 | `PENDING` | none approved from Proposal v1 | |
| 여울 | `PENDING` | none approved from Proposal v1 | |
| 서린 | `PENDING` | none approved from Proposal v1 | |
| 라현 | `PENDING` | none approved from Proposal v1 | |
| 미라 | `PENDING` | none approved from Proposal v1 | |
| 태겸 | `PENDING` | none approved from Proposal v1 | |
| 윤호 | `PENDING` | none approved from Proposal v1 | |
| 도윤 | `PENDING` | none approved from Proposal v1 | |
| 백헌 | `PENDING` | none approved from Proposal v1 | |

### 4.2 Roster-level proposal

| Area | Decision | Notes |
| --- | --- | --- |
| differentiation overview | `PENDING` | qualitative proposal only |
| close-pair separation rationale | `PENDING` | not SRC-35 acceptance |
| functional-role regression self-review | `PENDING` | review evidence only |
| directed/asymmetric relation seeds | `PENDING` | not immutable world canon |
| shared-history seeds | `PENDING` | not immutable episode/history canon |
| visual differentiation theses | `PENDING` | no final gender/age/palette/motif/assets |

## 5. Explicitly excluded from this approval gate

Proposal v1 intentionally does not contain enough authority to approve the following actual Production values:

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

따라서 Proposal v1 전체 승인 후에도 위 항목은 별도 authoring/approval이 필요하다.

## 6. Approval transition rule

명시적 Product Owner 승인 후에도 Proposal 문서를 직접 runtime source로 사용하지 않는다.

```text
PO explicit decision
→ decision evidence를 source-authority decision 문서에 기록
→ 승인된 semantic subset만 immutable Character authoring baseline으로 번역
→ canonical IDs / gender / age / origin / deity / visual / runtime rules 별도 승인
→ schema + Production validator
→ world relation/history canonicalization
→ SRC-35 differentiation acceptance
→ asset provenance
→ immutable bundle
→ catalog/release registration
→ Production publication
```

`REVISE` 항목은 수정 proposal을 작성한 뒤 새 version/commit에 대해 다시 결정한다. 이전 proposal 승인 증거를 새 wording에 자동 상속하지 않는다.

## 7. Merge semantics

PR #549가 언젠가 main에 merge되더라도 그 의미는 다음으로 제한한다.

```text
repository에 reviewable proposal artifact가 존재함
```

다음을 의미하지 않는다.

```text
Product Owner approved
immutable canon established
Production content ready
SRC-35 closed
Character publication authorized
```

Product Owner 승인 상태를 나타내려면 이 ledger 또는 후속 source-authority decision artifact가 명시적으로 갱신되어야 한다.

## 8. Current gate result

현재 상태:

```text
Proposal v1 technical CI            PASS
Proposal v1 Product Owner decision  PENDING
Immutable Character canon           NOT AUTHORIZED
Production publication              BLOCKED
```

따라서 Product Owner의 명시적 Character-content 결정 전에는 실제 Production Character bundle/DB publication/positive Member Chat smoke를 진행하지 않는다.
