# SRC-16 — Member Content Rollout Resolver Authority

> 상태: **CLOSED FOR MEMBER MVP / FUTURE COHORT ROLLOUT NOT AUTHORIZED**  
> 관련 결정: `docs/source-authority-decisions/CHARACTER_LAUNCH_MVP_AUTHORITY_V1.md`

## 1. 기존 Gap

기존 source는 subject-specific rollout을 요구했지만 rollout JSON schema, bucket/hash, precedence, fallback, merge continuity를 정의하지 않아 Production resolver 구현이 BLOCKING이었다.

## 2. 승인된 MVP 결정

2026-09-06 제품 소유자 승인에 따라 MVP Member rollout은 subject-specific cohort를 사용하지 않는다.

```text
모든 정상 Member
→ current active default release
```

MVP에는 다음이 존재하지 않는다.

```text
A/B test
cohort
percentage rollout
allowlist rollout
subject hash/bucket
non-default subject matching
experiment assignment
subject-specific precedence
```

따라서 Member MVP resolver는 subject identity를 rollout 선택에 사용하지 않는다.

## 3. 실행 권한

다음 동작은 이제 Member MVP에서 source-authorized다.

```text
resolveMemberContentRelease(member)
→ qry_active_default_content_release_v1()가 기록한 active default release/bundle
```

조건:

1. active default release가 정확히 하나 존재해야 한다.
2. 없거나 relational authority가 비정상이면 fail closed 한다.
3. 이미 release/bundle을 pin한 thread/reading/episode는 global default 변경으로 자동 재바인딩하지 않는다.
4. 최종 선택 evidence는 실제 pin된 `release_id + content_bundle_id`로 충분하다.
5. cohort/bucket evidence는 MVP에서 생성하지 않는다.

## 4. Guest 범위

Guest rollout은 이번 결정 범위 밖이다.

Member resolver 규칙을 Guest에 자동 복제하지 않는다.

## 5. 향후 cohort rollout

향후 A/B, percentage, allowlist, experiment rollout을 도입하려면 다음 권한이 새로 필요하다.

```text
rollout policy schema
stable identity input
hash/bucket algorithm
matching/precedence
fallback
Guest→Member continuity
persisted cohort evidence
```

현재 `rollout_jsonb`의 존재만으로 위 정책을 추론해서는 안 된다.

## 6. Definition of Done — Member MVP

Member MVP에서 아래를 만족하면 SRC-16은 CLOSED다.

- 모든 Member가 동일 active default release를 resolve한다.
- no active default → fail closed.
- 여러 후보를 arbitrary order로 고르지 않는다.
- subject hash/bucket을 사용하지 않는다.
- 기존 pinned runtime object를 default 변경으로 재바인딩하지 않는다.
- resolved release/bundle이 thread 등 durable owner object에 정확히 pin된다.

이 문서는 **Member MVP 범위만 닫는다.** 향후 subject-specific rollout 기능 자체가 승인된 것은 아니다.
