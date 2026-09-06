# 명하 Character Launch MVP 권한 결정 v1

> 상태: **승인됨 / 제품 권한**  
> 승인일: 2026-09-06  
> 범위: 출시 캐릭터 구성, 출시 시 사용 가능 상태, MVP 콘텐츠 배포 정책, 기본 릴리스 전환 정책, 회원 단일 캐릭터 대화방 생성/재사용 정책  
> 비범위: 캐릭터별 상세 Canon/Persona/Behavior, 최종 성별/외형/신격 설정, 향후 조건부 해금 DSL, Guest 대화방 생성 정책, 관리자 감사 세부 계약, 첫 만남 부작용/World Event 세부 계약

## 1. 권한 근거

이 문서는 제품 소유자의 명시적 승인에 따라 기존 working proposal을 MVP 운영 권한으로 승격한다.

승인된 핵심 문장은 다음과 같다.

```text
현재 working roster 9명 전부 출시
미라를 최종 이름으로 사용
9명 전부 출시 시 회원에게 즉시 사용 가능
A/B / cohort 없이 모든 회원이 동일한 활성 기본 릴리스 사용
새 기본 릴리스 활성화 시 기존 기본 릴리스는 rollback용 active non-default로 유지
회원 + 캐릭터별 활성 single-character 대화방은 1개
있으면 재사용, 없으면 생성
생성 시 해당 시점의 활성 기본 release/bundle 고정
재시도/동시 요청은 동일 logical active thread로 수렴
세부 캐릭터 Canon/Persona/Behavior는 별도 검토 후 확정
```

## 2. D-CHAR-LAUNCH-01 — 출시 캐릭터 9명 확정

MVP Production Launch roster는 **정확히 9명**이다.

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

위 9개 이름은 Launch roster의 **공식 표시 이름**으로 승인한다.

기존 `미라 = temporary` 상태는 종료한다. `미라`를 그대로 공식 표시 이름으로 사용한다.

이 결정이 확정하는 것:

- Launch roster membership = 위 9명;
- Launch roster cardinality = 9;
- 위 9개의 공식 표시 이름;
- `미라` temporary-name 상태 종료.

이 결정이 아직 확정하지 않는 것:

- canonical `character_id` 값/형식;
- 각 캐릭터의 최종 성별 canon;
- 최종 외형/연령대/origin;
- deity hierarchy / deityId / oath 상세;
- 상세 Human Theory / Agency / Truth / Persona / Behavior / SajuProfile / RelationshipBehavior;
- Character-to-Character 최종 relation graph;
- SRC-35 roster differentiation PASS.

따라서 roster membership/name 권한은 확정되지만 상세 Character content publication은 아직 별도 authoring/검토가 필요하다.

## 3. D-CHAR-UNLOCK-01 — Launch 9명 전원 즉시 사용 가능

MVP Launch 시 위 9명은 **모든 정상 Member에게 처음부터 사용 가능**하다.

```text
Launch roster 9명
→ default available
→ 별도 관계 단계 / Reading / Episode / season / operator unlock 조건 불필요
```

이 정책은 Launch 9명에 한정한다.

향후 추가 캐릭터나 조건부 해금 콘텐츠에 대해서는 `SRC-23`의 조건/World Event 권한이 계속 필요하다.

클라이언트가 임의의 `unlocked=true`를 보내는 것은 여전히 권한이 아니다. 서버는 이 Launch 정책과 실제 active content authority를 기준으로 사용 가능 여부를 판정해야 한다.

## 4. D-CONTENT-ROLLOUT-01 — Uniform Default Rollout

MVP에는 사용자별 A/B 테스트, cohort, percentage rollout, allowlist rollout을 사용하지 않는다.

모든 정상 Member는 동일한 **현재 활성 기본 릴리스(active default release)** 를 사용한다.

```text
resolveMemberContentRelease(member)
→ current active default release
```

MVP resolver는 Member identity를 hash/bucket에 사용하지 않는다.

다음은 MVP에 존재하지 않는다.

```text
subject cohort
percentage bucket
rollout hash
non-default subject matching
subject-specific precedence
experiment assignment
```

이미 생성되어 특정 release/bundle을 pin한 thread/reading/episode 등은 이후 default가 바뀌어도 자동 재바인딩하지 않는다.

MVP Member rollout decision evidence는 최종적으로 선택된 `release_id + content_bundle_id` pin으로 충분하다. cohort/bucket evidence는 존재하지 않는다.

Guest rollout은 이 결정 범위 밖이다.

## 5. D-CONTENT-COMPAT-01 — MVP 클라이언트 범위

MVP remote content compatibility의 지원 대상은 **현재 Production Web Client**로 한정한다.

이 결정은 지원 대상 범위만 확정한다.

다음 세부 비교 알고리즘은 이 결정만으로 새로 만들지 않는다.

- capability identifier comparator;
- asset manifest compatibility proof;
- cue schema fallback/compatibility algorithm.

따라서 `SRC-15`의 세부 compatibility evaluator 권한은 별도 해결이 필요하다.

## 6. D-CONTENT-LIFECYCLE-01 — 기본 릴리스 전환 정책

MVP 콘텐츠 릴리스 상태 흐름은 다음을 기본으로 한다.

```text
draft → active → retired
```

항상 활성 기본 릴리스는 최대 하나만 존재한다.

새 릴리스를 새 기본 릴리스로 활성화할 때:

```text
new release
→ active + default

previous default release
→ active + non-default
```

기존 기본 릴리스를 즉시 retired 처리하지 않는다. 이는 rollback 후보로 유지하기 위함이다.

Rollback은 rollback 후보인 active non-default release를 다시 default로 승격하는 방향을 사용한다.

이 결정이 아직 확정하지 않는 것:

- retired release의 재활성화 허용 여부;
- default release 직접 retirement 절차;
- release create request key/idempotency 세부;
- 관리자 actor/audit persistence 형식;
- artifact hash verification 구현 경계;
- activation timestamp/CAS 세부 프로토콜.

따라서 `SRC-27`은 위 전환 정책 범위에서는 해결되지만 전체 Production lifecycle mutation authority는 아직 부분 미해결이다.

## 7. D-CHAT-THREAD-01 — Member Character 대화방 단일 활성 정책

정상 Member와 Launch Character의 조합에는 **활성 single-character thread를 최대 1개** 둔다.

```text
(member subject, character)
→ active single-character thread <= 1
```

캐릭터 선택 시:

```text
기존 활성 thread 있음
→ 그 thread 재사용

기존 활성 thread 없음
→ 새 thread 생성
```

새 thread 생성 시 현재 Member에게 적용되는 `D-CONTENT-ROLLOUT-01`의 활성 기본 release/bundle을 정확히 pin한다.

이후 기본 릴리스가 바뀌어도 기존 thread는 자동으로 새 bundle로 변경하지 않는다.

### 재시도 / 동시성

동일 Member가 동일 Character에 대해 동시에 또는 반복적으로 create/open을 요청하더라도 결과는 동일한 하나의 logical active thread로 수렴해야 한다.

즉 네트워크 재시도나 race 때문에 같은 `(member subject, character)`에 활성 thread가 여러 개 생성되어서는 안 된다.

이 정책에서는 `(member subject, character, active)` 자체가 논리적 멱등성 경계이므로 별도의 사용자 노출 idempotency key가 필수 제품 개념은 아니다.

### 범위 밖

아래는 별도 권한이 필요하다.

- Guest thread create/open;
- thread title 세부 정책;
- first-meeting message 자동 삽입 여부;
- first-meeting World Event / Relationship Event / outbox 부작용;
- archived thread 재개 vs 신규 생성 정책;
- multi-character thread.

따라서 `SRC-34`은 Member single-character create/reuse 핵심 정책은 해결되지만 first-meeting 부작용 등 전체 범위는 부분 미해결이다.

## 8. 기존 blocker에 대한 영향

```text
O-C1-05
→ PARTIAL RESOLUTION
→ Launch roster membership + 공식 표시 이름 9명 확정
→ 상세 canon/gender/visual/characterId 등은 미해결

SRC-15
→ OPEN / BLOCKING
→ 지원 클라이언트 범위는 Production Web Client로 좁힘
→ comparator/asset/cue evaluator는 미해결

SRC-16
→ CLOSED FOR MEMBER MVP
→ subject-specific rollout을 사용하지 않고 active default를 모든 Member에게 적용

SRC-23
→ NOT REQUIRED FOR LAUNCH 9
→ Launch 9명은 default available
→ 향후 조건부 해금은 OPEN

SRC-27
→ PARTIAL RESOLUTION
→ draft/active/retired 및 default 교체 시 이전 default active non-default 유지 확정
→ 전체 mutation/audit/idempotency 계약은 미해결

SRC-34
→ PARTIAL RESOLUTION
→ Member + Character 활성 thread 1개, reuse/create, default release pin, concurrency 수렴 확정
→ Guest/first-meeting 부작용 등은 미해결

SRC-35
→ OPEN / BLOCKING
→ exact Launch roster membership/name은 확정
→ 상세 content authoring 이후 differentiation acceptance가 필요
```

## 9. 구현 불변조건

향후 구현은 다음을 위반하면 안 된다.

1. Launch roster를 5명으로 축소하지 않는다.
2. 승인 없이 9명 외 캐릭터를 Launch roster에 추가하지 않는다.
3. `미라`를 temporary name으로 취급하지 않는다.
4. Launch 9명에 조건부 unlock을 새로 요구하지 않는다.
5. MVP Member를 cohort/hash로 다른 릴리스에 배정하지 않는다.
6. 새 default 활성화 시 이전 default를 자동 retired 처리하지 않는다.
7. 동일 Member + Character에 활성 single-character thread를 중복 생성하지 않는다.
8. 기존 thread의 pinned release/bundle을 global default 변경으로 자동 변경하지 않는다.
9. 아직 승인되지 않은 상세 Character canon이나 compatibility 알고리즘을 추론해서 채우지 않는다.
