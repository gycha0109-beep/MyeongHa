# 명하 Web / Mobile Client Architecture Specification v0.3 — Full Audit

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.3**  
> Date: **2026-08-25**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`  
> API Authority: `API_CONTRACT.md`  
> Shared Contracts: `SHARED_DOMAIN_CONTRACTS_SPEC.md`

---

## 1. 목적

Web과 Mobile을 포팅 관계로 보지 않고 **동일한 명하 서버 세계에 접속하는 두 first-class client**로 설계한다.

## 2. Baseline Repository Shape

Source Use Case candidate:

```text
apps/
  web/
  mobile/
  api/
  admin/
packages/
  contracts/
  api-client/
  domain/
  character-content/
  world-content/
  design-tokens/
  test-fixtures/
```

구체 build tooling은 구현 시 선택 가능하지만 공통 HTTP/domain contract를 client별로 재정의하지 않는다.

## 3. Web Responsibility

- 광고/검색 유입
- 세계관 landing
- 캐릭터 소개/첫 체험
- 긴 Reading/report
- share artifact 생성/조회
- Web commerce rail when enabled
- 계정/명식록/현세록/기억 관리

## 4. Mobile Responsibility

- Hall
- 캐릭터 chat/scene
- 관계/기억
- Push/inbox
- 일/월 return loop
- episode
- 신규 캐릭터/world event
- app-store commerce rail when enabled

## 5. Shared Responsibilities

공유:

- API request/response/error contracts
- bounded StructuredAction/event/type registry
- stable content/character/domain IDs
- authentication session semantics
- deep-link route semantics
- server DTO/revision semantics
- design tokens where platform-neutral

반드시 공유할 필요가 없는 것:

- UI component implementation
- navigation implementation
- desktop report layout
- native animation implementation

Web DOM UI를 React Native에 억지로 재사용하지 않는다.

## 6. Authority Boundary

```text
Server = product state authority
Client = cache + optimistic presentation
```

Client는 독자적으로 다음을 확정하지 않는다.

- relationship score/stage
- memory persistence/grant
- character unlock
- episode final progress
- Reading final result
- entitlement
- canon transition

## 7. Authentication / Trusted Subject

Web/Mobile은 Supabase Auth credential/session을 Shared API에 제시한다. **Client request의 `subject_id` 값은 trusted identity가 아니다.** API가 authentication/guest token에서 canonical subject를 resolve한다.

`OPEN-P0: P0-AUTH-01`은 API→PostgreSQL RLS execution identity에 관한 서버 내부 결정이며, 어떤 선택을 하더라도 client에 service-role/BYPASSRLS/provider secret을 배포하지 않는다.

## 8. Guest Experience

Web/App 모두 로그인 전 최소:

- session bootstrap
- character choice
- nickname
- birth input
- first Reading/chat

가능하다.

신규 가입:

```text
guest subject
→ same-subject member promotion
```

기존 계정 로그인:

```text
guest session ownership proof
→ merge job
→ conflict resolution where needed
```

Client가 owner FK 이동을 직접 수행하지 않는다.

## 9. Client Cache / Revision

캐시 가능한 예:

- content bundle assets/public metadata
- committed message history
- immutable Reading/report snapshot
- user current projection with revision

Write에는 API가 요구하는:

```text
idempotencyKey
clientTurnId
expectedRevision/currentRevisionId
```

등을 사용한다.

서버 conflict를 조용히 local overwrite하지 않는다.

## 10. Chat UX State Machine

Client가 표시하는 최소 상태:

```text
sending
server_received
processing
committed
failed_retryable
failed_final
```

정확한 서버 turn state를 UI용으로 projection할 수 있다.

### Retry

`failed_retryable`:

- 같은 logical turn에 `/retry`
- 새 user bubble 생성 금지
- 새 `clientTurnId`로 동일 메시지 재송신 금지

### Abandon

사용자가 retry하지 않을 경우 `/abandon`을 제공해야 V1 thread의 one-in-flight 제약이 영구 lock처럼 보이지 않는다.

### Reconnect

Network reconnect:

- 같은 `clientTurnId` / turn ID 조회
- committed assistant message가 있으면 재사용
- duplicate bubble 금지

## 11. Grounded Saju Rendering UX

Saju-bearing semantic segment는 서버 validation/commit 이전에 공개하지 않는다.

Client는 기다림을 감추기 위해 검증 전 의미 문장을 임의 stream하지 않고 다음을 사용할 수 있다.

- deterministic loading/status animation
- character idle/reaction cue
- validated chunk가 실제 존재할 때 controlled reveal

`semanticClaims`를 client가 자체 문장으로 생성/요약하지 않는다.

## 12. Reading Clarification UX

Saju Product Response가 clarification을 요구하면 Client는 `requiredAction/clarification schema`에 따라 bounded UI를 표시한다.

```text
Reading session
→ clarification choice/input
→ same session new Reading attempt
```

이를 새로운 unrelated Reading으로 만들지 않는다.

## 13. Personal Record UX

명확히 분리한다.

```text
Birth correction
Life Fact supersede/revoke
Conversation delete
Character forget
Memory revoke/grant
Target person delete
Account delete
```

한 버튼이 위 의미를 암묵적으로 여러 개 수행하지 않는다.

`session-only` 선택은 durable memory가 저장되었다가 즉시 삭제되는 UX로 구현하지 않는다.

## 14. Deep Links

Web/App route semantics:

```text
/character/:id
/reading/:id
/episode/:id
/record
```

Deep link/token 자체는 authorization이 아니다. Private route open 시 API 재검증.

## 15. Remote Content Compatibility

Client는:

- clientCapability
- minClientCapability
- cue schema
- asset manifest hash/schema

를 검사한다.

미지원 content는 content contract가 지정한 hide/fallback/update-required 중 하나로 처리하며 crash 금지.

`SRC-01`의 per-character/per-episode operational override는 client가 임의 추론하지 않는다. Server/content release 결과를 따른다.

## 16. Notification

Push payload는 presentation hint다.

- notification ID로 server state 조회
- payload text를 authoritative chat message로 저장 금지
- private route authorization 재검증
- preview privacy mode 준수

## 17. Commerce

Client는 `productKey/offer`를 표시하지만 access authority는 server entitlement다.

- purchase success screen ≠ entitlement
- entitlement API 확인 후 paid resource unlock
- fulfillment scope를 client arbitrary key로 결정하지 않음
- restore도 server verification 결과 사용

`OPEN-P0: P0-CM-01`에 따라 플랫폼 rail implementation만 달라진다.

## 18. Accessibility / Motion

세계관 연출이 핵심이어도 최소:

- text contrast
- scalable font
- reduced-motion fallback
- screen-reader labels
- keyboard/focus Web support
- skippable/replayable non-essential animation

을 지원한다.

## 19. Client Test Gates

- Web/Mobile same API fixtures deserialize
- client-supplied foreign subject ID cannot change ownership
- old client unsupported cue → graceful fallback
- duplicate chat retry → one logical turn/message
- failed_retryable → retry without duplicate user bubble
- abandon → next turn possible
- reconnect committed turn → no duplicate assistant message
- clarification → same Reading session lineage
- session-only → no durable record appears
- unauthorized deep link → access denied UX
- Guest→new member continuity
- Guest→existing member conflict flow
- Web-created thread → Mobile continuation
- store UI success but entitlement absent → paid content remains denied
