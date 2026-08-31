# 명하 UX / Screen State Specification v0.4 — SRC-33 Bound

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.4**  
> Date: **2026-08-31**  
> Product Authority: `Usecase_re_reviewed_v2(1).md`  
> Client Authority: `WEB_MOBILE_CLIENT_ARCHITECTURE_SPEC.md`

---

## 1. 목적

Use Case를 실제 Web/Mobile 화면/상태로 옮길 때 로그인 벽, 개인정보 폼, AI retry, clarification, 삭제 의미가 UI마다 달라지는 것을 막는다.

본 문서는 visual design/art direction을 확정하지 않는다. **screen/state semantics**를 정의한다.

## 2. Core Screen Map

```text
Landing
→ Hall
→ Character Intro / Chat
→ Birth Record Flow
→ First Reading
→ Chat continuation

Hall
├─ Character Chat
├─ Reading / Report
├─ Personal Records
├─ Episodes
├─ Notifications/Inbox
└─ Account/Settings
```

Web은 report/share/account에 더 넓은 layout을 사용할 수 있고 Mobile은 Hall/chat/return loop를 우선한다.

## 3. Landing

필수 상태:

- world/character preview
- `명하에 들어가기`
- 로그인 hard wall 없음
- app install/deep link CTA는 핵심 체험을 막지 않음

## 4. Hall

표시 가능한 상태:

- available character
- unlocked character
- locked silhouette
- coming soon
- unread/return event indicator
- current content compatibility/update-required

캐릭터를 단순 `직업/재물/연애` 메뉴 카드처럼만 표현하지 않는다.

## 5. Character Chat

필수 UI state:

```text
idle
sending
processing
awaiting_clarification
failed_retryable
failed_final
committed/revealing
```

- retry는 동일 logical turn
- abandon 제공
- duplicate user/assistant bubble 금지
- protected Saju segment는 source-approved product-semantic validation 전 표시 금지
- `SRC-33` 해결 전 transport success/JSON 저장/exported TypeScript shape deserialize를 validation 완료로 간주해 `awaiting_clarification` 또는 `committed/revealing`로 승격하지 않음
- general character framing과 grounded segment를 UX상 자연스럽게 결합하되 semantic provenance를 잃지 않음

## 6. Birth Record Flow

대형 일괄 form 대신 단계/대화형 가능.

최소 field:

- calendar type
- birth date
- birth time 또는 unknown
- leap month where applicable
- sex where engine contract requires/permits

입력 검증 실패는 character fiction으로 사실을 꾸며 넘기지 않는다.

수정은 새 revision임을 사용자가 이해할 수 있게 하며 과거 Reading이 stale될 수 있음을 안내한다.

Standalone privacy delete는 `SRC-06` resolution 전 UX를 확정하지 않는다.

## 7. First Reading

먼저 실제 grounded value를 제공하고 이후 필요한 current-life context를 질문한다.

상태:

- ready grounded reading
- partial/limited reading
- clarification required
- insufficient/unavailable
- material/public calculation ambiguity

위 Saju product-semantic 상태는 source-approved validated `ProductReadingResponse`가 존재할 때의 UI projection이다. `SRC-33` 해결 전 successful transport body를 이 상태들로 authoritative promotion하지 않는다.

`insufficient`를 캐릭터 generic AI fortune으로 메우지 않는다.

## 8. Clarification — `SRC-33` public input blocked

Saju clarification UI의 bounded 선택/입력은 source-approved versioned `ProductReadingResponse`와 clarification-answer positive contract가 있을 때만 executable하다.

현재 `SRC-33`은 complete `ProductReadingResponse` positive validation, `ClarificationAnswerV1`, question↔answer correlation, canonicalization/request-hash material, pending contract-version compatibility를 차단한다. 따라서 exported shape 또는 UX 예시에서 임의 선택/입력 schema를 만들어 public submit surface로 승격하지 않는다.

Source-complete UX invariants는 유지한다.

- prior response를 overwrite하지 않음
- same reading session lineage
- 취소/뒤로가기 가능
- clarification과 provider retry를 같은 버튼/상태로 표시하지 않음
- lower-level lineage/persistence test에서는 explicitly prevalidated canonical fixture를 사용할 수 있음
- `SRC-33` 해결 전 production public clarification submit은 disabled/fail-closed

## 9. Memory Decision UI

사용자-facing baseline:

```text
이 대화에서만
이 대리자만 기억
현재 접근 가능한 대리자들에게 공유
기록하지 않기
```

필요하면 별도 record-management 화면에서 `나만 보관(private)` 기능을 제공할 수 있으나 core choice와 혼동하지 않는다.

`current characters`는 미래/잠긴 캐릭터 자동 공유가 아님을 설명 가능해야 한다.

`SRC-05` 해결 전 session-only/reject 선택이 derivative proposal payload를 장기 shadow record로 남기는 구현 금지.

## 10. Personal Records

섹션:

```text
명식록
현세록
대리자별 기억/공개 범위
대화 기록
관계 상태
상대방 기록
```

삭제 action은 대상과 영향을 명확히 표시한다.

```text
대화 삭제 ≠ Life Fact 삭제
캐릭터가 잊기 ≠ 다른 캐릭터 memory 삭제
Life Fact 삭제 ≠ Birth 수정
Account 삭제 ≠ 로그아웃
```

## 11. Compatibility / Target Person

상대 기록은 사용자 계정 내부 record로만 표시한다.

- 연락처/계정 자동 연결 없음
- target-person delete 제공
- `SRC-06` 해결 후 기존 compatibility Reading 처리 영향 설명 필수

## 12. Reading Report

Web:

- 긴 구조화 report
- share
- purchase/paywall when applicable
- provenance/제한 표현

Mobile:

- summary/sections
- character follow-up CTA

Stale reading은 현재 결과처럼 표시하지 않고 stale badge/recompute action 제공.

`SRC-33` 해결 전 raw/successful transport response를 authoritative Reading report snapshot으로 표시하지 않는다.

## 13. Share

공유 전 preview에서 외부로 나갈 정보만 보여준다.

기본 비노출:

- raw birth time/date where not explicitly selected
- full conversation
- Life Fact/Memory
- target internal ID

Revoke action 제공.

## 14. Commerce / Paywall

- price/offer 표시와 entitlement authority 분리
- provider success 후 `확인 중` 상태 가능
- server entitlement 확인 후 unlock
- restore state 제공
- purchase error가 기존 free access를 깨지 않음

## 15. Notifications / Inbox

설정:

- global enabled
- category toggles
- quiet hours
- preview mode

Inbox read와 Push delivered/open을 동일 상태로 표현하지 않는다.

## 16. Account / Guest Claim

첫 value 이후 `내 기록 보관하기` 흐름.

신규 account promotion은 기존 guest state 연속성을 유지.

기존 account merge conflict:

- 자동 overwrite 금지
- Birth/Profile conflict 항목별 선택
- merge 진행/완료/실패 상태 표시

## 17. Deletion UX

Account delete는 재인증/영향 범위 확인.

시작 후:

- 새 AI/Saju/purchase 차단 상태 안내
- deletion job 상태 조회 가능
- 법적 commerce retention과 personalization deletion 분리 설명 가능

구체 기간은 `P0-PR-01` 결정 후 노출한다.

## 18. Error State Principles

User-facing error는 내부 존재/ownership/provider secret을 노출하지 않는다.

```text
retryable → retry action
final invalid input → correction action
capability unavailable → 가능한 범위 안내
stale revision → refresh/recompute
content incompatible → fallback/update guidance
```

`SRC-33` 해결 전 Product response/clarification positive validation failure의 세부 public error schema를 임의 발명하지 않는다. Source-safe 결과는 unvalidated product response의 no-promotion 및 public clarification mutation의 fail-closed다.

## 19. Accessibility / Reduced Motion

명식 생성/캐릭터 등장 animation은 reduced-motion/skip path를 제공한다. 중요한 의미를 animation만으로 전달하지 않는다.

## 20. Screen-State Test Gate

- Guest no-login first value path
- one in-flight chat retry/abandon
- Saju clarification vs retry visually distinct using source-approved/prevalidated state fixture
- `SRC-33` open → public clarification submit disabled/fail-closed
- transport success + unvalidated Product response → no authoritative ready/grounded/awaiting-clarification/revealing promotion
- validated material ambiguity visible when authoritative Product response exists
- session-only no durable record UI
- future/locked char not included in current-share grant
- stale Reading visible
- deletion meanings distinct
- target-person delete impact explicit after SRC-06
- provider success without entitlement remains locked
- deep-link unauthorized state safe
