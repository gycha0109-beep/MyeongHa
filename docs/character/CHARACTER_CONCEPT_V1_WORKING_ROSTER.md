# Character Concept V1 — Launch Roster Authority Snapshot

> 상태: **LAUNCH ROSTER / NAME AUTHORITY APPROVED · DETAILED CANON INCOMPLETE · PRODUCTION CONTENT INELIGIBLE**  
> 범위: MVP Launch roster 구성, 공식 표시 이름, 기존 relationship-fantasy 방향  
> 비범위: canonical Character ID, 최종 gender/age/origin/deity/visual, 상세 Canon/Persona/Behavior/SajuProfile/RelationshipBehavior, Production publication

## 1. 권한 경계

2026-09-06 제품 소유자 승인에 따라 기존 Character Concept V1 working roster를 **MVP Production Launch roster membership + 공식 표시 이름 권한**으로 승격한다.

MVP Launch roster는 정확히 9명이다.

```text
세연
여울
서린
라현
미라
태겸
윤호
도윤
백헌
```

`미라`는 더 이상 temporary name이 아니다. `미라`를 공식 표시 이름으로 사용한다.

이 승인은 roster membership과 표시 이름을 확정하지만, 상세 Character content 전체를 자동 승인하지 않는다.

관련 승인 문서:

- `docs/source-authority-decisions/CHARACTER_LAUNCH_MVP_AUTHORITY_V1.md`

## 2. 승인된 Launch roster

| 공식 표시 이름 | Launch 상태 | 기존 relationship fantasy / direction | User-facing relationship hook |
| --- | --- | --- | --- |
| 세연 | Launch | First Companion / 정실감 / 소꿉친구적 순애 | 돌아오면 얘가 있을 것 같다. |
| 여울 | Launch | 호감 부정 / 질투 / 숨길 수 없는 관심 | 신경 쓰는 게 너무 티 나는데 본인만 아니라고 우기는 여자. |
| 서린 | Launch | 오래 기억해주는 사람 / 잔잔하고 깊은 관계 | 이 사람은 내가 한 말을 정말 기억한다. |
| 라현 | Launch | 성숙한 매혹 / 주도권 / 심리전 | 이 사람한테 휘말리고 싶다. |
| 미라 | Launch | 잘생긴 여자 / 무심다정 / Friends-to-Lovers | 너무 자연스럽게 가까워서 사랑인지도 몰랐던 잘생긴 여자. |
| 태겸 | Launch | 냉미남 / 마찰 / 인정받는 관계 | 저 인간한테 인정받고 싶다. |
| 윤호 | Launch | 다정남 / 생활형 안정 / 안경 너드 미남 | 누군가에게 편하게 기대고 싶다. |
| 도윤 | Launch | 능글 / 아웃사이더 / 공범 / 선택적 특별취급 | 왜 나한테만 이러지? |
| 백헌 | Launch | 연상 / 베테랑 / 으른섹시 / 능력에서 오는 안정 | 흔들리지 않는 어른의 사적인 얼굴을 보고 싶다. |

Relationship-fantasy 방향은 기존 Concept V1 source의 설계 방향을 보존한다. 이 표의 관계 방향이 곧 상세 Persona/Behavior 전체 승인이라는 뜻은 아니다.

## 3. 아직 미해결인 상세 Character 권한

현재 승인만으로 다음을 추론해서 만들면 안 된다.

```text
canonical characterId
final gender canon
origin
apparent age band
final deity hierarchy / deityId / deity doctrine binding
versioned immutable visual profile
Character-to-Character canonical relation graph
Production roster-level differentiation PASS
```

또한 다음 상세 필드는 별도 authoring/검토 후 승인해야 한다.

```text
exact oath
Human Theory
Agency Theory
Truth Theory
desire / fear / flaw / contradiction / hidden motivation
Persona fields
Behavior rules
SajuProfile fields
RelationshipBehavior rules
```

초안/제안은 작성할 수 있지만, 별도 승인 전에는 immutable Character content로 승격하지 않는다.

## 4. Launch 사용 가능 정책

승인된 Launch 9명은 모든 정상 Member에게 출시 시점부터 기본 사용 가능하다.

```text
Launch 9
→ default available
→ 조건부 unlock 불필요
```

향후 추가 캐릭터/조건부 해금은 별도 `SRC-23` 권한을 따른다.

## 5. Production 경계

이 문서는 roster membership/name authority를 제공하지만 아직 `CharacterContentDefinition` 전체를 완성하지 않는다.

Production Character publication에는 여전히 다음이 필요하다.

```text
상세 Character canon/persona/behavior/saju/relationship authoring 승인
final gender / visual / origin / deity 등 필수 content 값
SRC-15 compatibility evaluator 해결
SRC-27의 남은 lifecycle mutation authority 해결
SRC-35 roster-level differentiation acceptance 해결
```

Member Chat thread create/reuse의 핵심 제품 정책은 `CHARACTER_LAUNCH_MVP_AUTHORITY_V1.md`에서 승인되었지만, first-meeting side effect 등 남은 `SRC-34` 범위는 별도 해결이 필요하다.

## 6. 허용 / 금지

허용:

- 정확한 Launch roster 9명 membership 유지;
- 위 9개 공식 표시 이름 사용;
- `미라`를 공식 표시 이름으로 사용;
- 기존 relationship-fantasy 방향 보존;
- 명시적으로 draft/proposal 표시한 상세 캐릭터 authoring;
- 상세 authoring 검토를 통해 이후 immutable content로 승격.

금지:

- Launch roster를 5명으로 축소;
- 승인 없이 9명 외 캐릭터를 Launch roster에 추가;
- `미라`를 temporary로 되돌림;
- 표시 이름을 근거로 canonical `characterId`를 자동 생성하고 그것을 source canon이라고 주장;
- 누락된 gender/age/origin/deity/visual을 추론;
- generated Persona/Behavior/Saju/relationship text를 별도 승인 없이 immutable canon이라고 주장;
- roster 이름이 확정됐다는 이유만으로 Character Differentiation PASS를 선언.

## 7. C1과의 관계

Character C1은 계속 Canon / Persona / Behavior / Saju Capability / Relationship Behavior 분리, controlled rendering, relationship projection, roster differentiation의 architecture authority다.

이 문서는 C1의 Launch minimum(>=5)을 충족하는 **실제 MVP Launch roster = 9명**과 공식 표시 이름을 확정한다. 상세 C2 content는 별도 authoring/검토 대상이다.
