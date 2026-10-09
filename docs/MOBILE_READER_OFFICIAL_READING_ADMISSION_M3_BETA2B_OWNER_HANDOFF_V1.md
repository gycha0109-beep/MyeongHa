# M3-β-2b — 서버 소유자 계약 검토·구현 핸드오프 v1

> 상태: SELF-REVIEWED DESIGN HANDOFF / OWNER APPROVAL NOT RECEIVED / PUBLIC OFF
> 기존 확인 기준: 2026-10-09 main 0b82b3f157b052c7110c9b4c7f5d5a1874918929
> 후속 동기화: main 34ba01d470b29fbd4827db2692b65146d252553c (PR #1825/#1826 병합). Owner 교차 승인 리뷰 0건, tracked issues #1827/#1828.
> 출처 우선순위: 실제 main 코드·docs/P0_DECISION_REGISTER.md 및 최근 병합 PR > 더 이전 역사 문서.
> 확인 범위: GitHub PR #1823 리뷰/일반 코멘트 0건. 아래 OWNER는 담당 **트랙**이지 실제 담당자의 승인·리뷰 참여를 의미하지 않는다.

## 1. 검토 결론 (승인 아님)

- 모바일 Reader 공개 OFF, 백엔드 공개 Reader 상수 false, Production activation은 off/internal_preview 두 모드만 허용한다. 배포 Vercel rewrite와 api/me.ts dispatch에 Reader public route가 없다.
- A2에는 exact Thread/Reading/Reader/상품적격성/소스 증명, 1회성 서버 proof가 있고 정책 포트는 호출자 주입이 전제다. Production 승인된 Product rule adapter 존재·배포·정합성은 아직 증명되지 않았다.
- A3의 #1821 server non-Saju base 및 #1824 Thread-bound V2 Preview 실행 경로가 병합됐다. 이는 내부 진전이며 실제 공개 HTTP/유료 V2 Chat/지속 저장 계약과 구분한다.
- P0-CM-01은 출시 Web one-off 결제이고 Native Store 결제는 범위 밖이다.
- P0-CM-03은 OPEN-P0. `standard.love_relationship` 후보의 Product Owner 정가 KRW 8,900, intent `relationship/natal/general`, Reader 별도 선택이 기록됐으나 상품 enabled=false, Offer/Charge Terms 없음, 실행 결제·fulfillment 권한은 없다. 추가 Reader 할인가와 타 도메인 판매가는 별도 승인 필요.
- P0-CM-02 PortOne V2 선택은 DECIDED이지만 실제 merchant/live PG/Offer/Checkout 승인이 아니다.
- Saju Production Interpretation Authority는 P0-CM-03의 upstream BLOCKED 기록을 보존한다. MyeongHa의 Reader Runtime 코드 합성 테스트로 해결할 수 없다.
- #680 Supabase Production 배포 권한 복구 이슈는 **CLOSED (2026-09-17)**. 역사적인 OPEN 서술을 현재 상태로 되풀이하지 않는다. 해당 이슈 종료도 새 Product/Reader/Payment 출시 승인은 아니다.
- P0-PR-01 보존/삭제 결정은 DECIDED다. 별도 법적·정책 변경을 임의 가정하지 않는다.

## 2. D-01~D-08 결정 레지스터 — 저장소 자기 검토 결과

| ID | 담당 트랙 | 현재 확인된 사실 | 미확정/블로커 | 수용할 owner 산출물 | 상태 |
| --- | --- | --- | --- | --- | --- |
| D-01 | Product / commerce-payment / commerce-entitlement | P0-CM-01 Web one-off, P0-CM-02 PortOne V2, P0-CM-03 비활성 `standard.love_relationship`+가격 결정 | Live Saju authority, 승인 Reader Product rule revision, enabled Offer/Charge Terms, 추가 Reader 가격/환불, 실판매 승인 없음 | 승인 SKU/spec/domain/rule/revision 연결 표, Offer/Grant 키, Web handoff, 판매 OPEN 조건과 실행 증거 | PARTIAL/HOLD |
| D-02 | commerce-entitlement / DB | migrations 1220/1240/1270: Reader별 exact access_grants↔entitlement_grant↔official Reading 관계, v2 bind 및 runtime Query 이미 존재; A2 one-use proof | LIVE verified receipt→Grant→v2 bind 호출자/EXECUTE 활성, v2 replay 후 revoke의 의미, 다중 bundle, 기존 DB can_initiate와 A3 V2 일반 Reader 정책 차이, 최종 reveal revoke 경합 | 새 계약서의 GRANT-01~16 실행·SQL 소유자 검증과 안전한 activation 승인 | PARTIAL/HOLD |
| D-03 | reader-runtime / API / Release | `READER_RUNTIME_PUBLIC_ACTIVATED_V1=false`; activation `off/internal_preview`, 내부 세연 only | 유료 public 게이트·공개 endpoint·cohort·rollback 오너 없음 | approved rollout/release policy, public HTTP ingress+error/limits+kill switch, 서버 deny trace | HOLD |
| D-04 | API / frontend-integration / Privacy | 현재 UI 4축 모두 `not_checked`로 보존 | 안전한 상태 조회 UX 계약 존재 여부, scope·status·session expiry·가시성/거부 분류 미정 | 기존 API 재사용 여부 결정 + 엄격 response schema 혹은 API 불필요 결정, PII 비노출 테스트 | HOLD |
| D-05 | API / DB / Reader Runtime | 기존 `GET /api/chat/:threadId`는 인증된 Thread Character를 검증 가능. M3-β-2a 사용 | 공식 Reading+Reader에 결합된 owned Thread를 최초 획득/복구하는 서버 계약 없음 | exact authorized Thread binding/lookup, client discoverability, replay/revoke/cross-user denial tests | PARTIAL/HOLD |
| D-06 | reader-runtime / saju-bridge / API | #1815 bounded renderer, #1821 non-Saju base, #1824 A2 Thread-bound V2 내부 Preview 연결 | Public/paid V2 응답 승인, live Saju Product interpretation, Preview→paid 버전 호환·fallback 계약 없음 | A2→A3 one-use proof 실행 증거 및 response lifecycle/version/bounded fallback contract, official semantics parity | PARTIAL/HOLD |
| D-07 | Reader / Records / Chat / DB | archived Official Reading 상세, Chat read/send와 A2 후속 Chat preflight 구현 | Reader별 해설 결과 저장/재열람·Chat V2 연결·source 범위·재접속 후 권한검증 운영 계약 미정 | per-Reader interpretation persistence/read/source version/revocation policy, follow-up chat admission and separation | HOLD |
| D-08 | Release / QA / Security / Ops | 세연 internal Preview tranche와 off 스위치 존재; base CI와 문서 PR 검사 성공 | Public cohort 실측, live Web checkout/Grant→Reader E2E, kill-switch drill, multi-device/refund/rollback 증거 없음 | exact production deploy SHA, cohort evidence, kill-switch rollback runbook, audit-safe signals | HOLD |

세부 D-01/D-02 근거: **MOBILE_READER_PRODUCT_COMMERCE_DB_EXACT_GRANT_M3_BETA2B_CONTRACT_V1.md**. 이미 구현된 v2 DB authority를 신규 스키마 요구로 잘못 분류하지 않으며, 운영 활성화는 별개 HOLD.

**D-01~D-08 최종 owner 승인: 0/8 확인.** 이 문서는 기술적 사실의 정리일 뿐, 승인 요청이 실제로 수락됐거나 각 트랙의 최종 계약이 확정되었다는 뜻이 아니다.

## 3. 서버 API 경계 — 검토 요청 (형식/경로 신규 확정 금지)

### 3.1 존재하는 Preview 계약
```text
POST /api/me/readings/reader-interpretation/preview
Body: { threadId: UUID, officialReadingId: UUID }
Result: schemaVersion=myeongha-reader-interpretation-preview-http-v1, lifecycle=preview
```

현재는 서버 내부 계약이다. Vercel 공개 ingress 미연결, iOS/Android native 공개 OFF. 이 Preview 결과가 구매한 유료 해설 영구 기록의 표준이라는 보장은 없다.

### 3.2 운영 계약에서 서버가 결정할 것
```text
Authenticated canonical Subject
→ Reader별 exact active purchase-backed Grant
→ owner single-Character Thread + pinned Bundle/Release
→ approved Product rule (productId/specVersion/domain/policyRevision)
→ delivered Official Reading identity/hash/contract
→ server-only A2 admission ticket(one use) + A3 guarded runtime
→ versioned public response / protected fallback / replay+rate-limits
```

공식 Reading 아카이브 조회, 소유 Chat Thread의 Reader 검증은 client 방어층에 불과하다. 어떤 순서로 상태 조회·Thread discovery·해설 실행이 가능한지 API owner가 계약 문서로 결론내기 전에는 구체적 새 path나 전송 필드, 서버 grant 상태를 고정하지 않는다.

모바일 화면의 `not_checked`, `approval_pending`, `access_granted` 등은 내부 표현이며 현재 서버 DTO가 아니다. 성공적인 화면 Projection에서 과거 받은 상태를 다음 실행 권한으로 재사용할 수 없다.

### 3.3 Paid Preview 혼동 금지
- 기존 `lifecycle=preview`와 `schemaVersion=...-preview-http-v1`을 상품 구매 성공, 공식 결과 지급, persist/re-read 권한으로 해석하지 않는다.
- 실제 공개가 Preview 호환 계약을 사용할지 `paid` V2 계약을 추가할지 API+Reader+Commerce 결정이 필요하다.
- 모바일의 `publicRouteActivated:true` 단독 설정은 백엔드 구매 권한·공개 승인·보안 인증의 대체 불가능.
- P0-CM-01 때문에 모바일 내부에서 Native IAP/PortOne Checkout을 임의 호출하거나 결제완료 callback을 grant로 전환할 수 없다.
- 운영 스위치를 켜는 PR은 유료 API/Commerce/Grant/회수/출시 소유자와 별도로 승인받고, 이 설계 PR에서는 절대 실행하지 않는다.

## 4. 최소 독립 PR 순서와 적용 조건

| 작업 ID | 트랙 | 좁은 범위 | 선행 요구·완료 조건 |
| --- | --- | --- | --- |
| S0 | saju-bridge + Product | 유료 대상 Saju interpretation provenance/public Reading authority 결정 | Saju Production authority 승인 근거; 현재 BLOCKED |
| C1 | Product + Commerce + DB | 비활성 Product→approved rule/real Grant binding (상태·증거 구현) | P0-CM-03 + Saleable Offer 승인 전 운영 행 활성 금지; paid row 없는 synthetic-only는 B 조건의 일부만 가능 |
| R1 | reader-runtime + API | server-authenticated exact Reader/Reading Thread binding 및 Preview/paid contract 결정 | A2/ A3 drift+revocation, public OFF negative 검증. 승인 전 endpoint 미배포 |
| R2 | reader-runtime + API | guarded paid result + fallback/idempotence+versioning | C1/R1 완료 및 운영 정책 승인이 있어야 public 활성화 가능 |
| M1 | frontend-integration | 승인 DTO 소비 + 9 Reader 상태/Thread retrieval + session-race 차단 | R1/R2의 실제 스키마·권한 증거, public OFF 기본값 |
| M2 | frontend-integration + Records + Chat | Reader별 재열람/후속 대화 UX | 저장·읽기·후속 대화의 별도 서버 계약 |
| E1 | QA + Release | Staging→세연 cohort→부분 확대, Web commerce E2E 및 rollback | G1~G7 증거, explicit operator approval; public OFF 전에 모든 오픈 금지 |

이 표의 작업 ID는 **제안된 분리 단위**다. 각 트랙의 기존 진행 중인 PR을 확인해 중복 작업을 만들지 않고, 승인된 작업만 별도 코드 PR로 시작한다. 코드를 위한 긍정 fixture는 Saleability 또는 운영 배포 증거가 아니다.

## 5. 거부·동시성·회수의 추가 의사결정 질문

1. DB 기준 exact Grant가 결제 성공 전에 노출되지 않는가? verified receipt→independent Grant→Reading access projection의 버전/원자성을 어떻게 증명하는가?
2. 하나의 Reader가 권한을 보유하다 환불되면, 외부 Saju/LLM 실행 도중의 결과 노출·중복 과금 정책은 누가 확정하는가? 기존 Subject transaction에서 네트워크 await 시 락/풀 점유 정책은 무엇인가?
3. 실행 전 `GET /api/chat/:threadId`에서 통과해도 바로 후속 Reader runtime 내 Grant가 회수됐다면 0 disclosure와 0 active-access를 어떻게 보장하는가?
4. 해설 DTO는 공식 Saju 의미/원문과 Reader 의견을 구분하고, off/cohort/release failure를 외부에서 구매·존재 여부를 추론할 수 없게 합성하는가?
5. 모바일 로그인 전환/Guest→Member continuity 중 늦게 돌아온 이전 Subject의 결과를 어떻게 폐기하는가?
6. 연애·관계라는 **첫 Product 후보**가 일반 9 Reader×9 Saju domain 합성 검증과 다름을 상품·UI에 어떻게 반영하는가?
7. 앱의 Reader 구매 추가 흐름이 승인된 Web-only checkout 정책을 어떤 공식 handoff/복원 계약으로 만족하는가? 현재는 미승인이다.

## 5.1 최신 Reader 검증 반영 및 담당 이슈

- **PR #1825 병합:** A3 V2 Preview의 `interpretationHash`를 `sha256:v1:<hex>`에 맞추고 guarded `protected_fallback`, 재조회 철회/미승인 premium 규칙 음성 테스트 보강. 이는 public paid HTTP·실운영 동시성 실측이 아니다.
- **PR #1826 병합:** 9 Reader × 9 Saju domain = 81개 synthetic A2/A3 eligible 조합에 대해 각 one-use proof 발급·소비·재사용 거부 PASS. 운영 DB 구매 바인딩, 실제 발행 Character 콘텐츠, Product saleability, 실사용 E2E를 증명하지 않는다.
- **Issue #1827 (DB):** `cmd_bind_standard_reading_access_v2`의 historical replay와 current active Grant 분리, 복수 exact Grant·bundle ambiguity, revoke 중 공개 판단. DB owner 리뷰·격리 Postgres 테스트 및 필요시 forward-only 수정을 요구.
- **Issue #1828 (Product/DB/Reader):** 기존 DB `character_capabilities.can_initiate`/domain 검증과 A3 Product-approved `standard_all_readers`의 운영 계약 충돌 검토. 정확한 Reader unlock/출판/premium 정책을 승인받기 전 임의 DB 조건 완화 금지.

이슈 등록은 **승인이 아니라 트랙별 작업 요청**이다. 담당자들의 owner decision과 검증 증거가 확인되기 전 D-01/D-02와 A 설계 승인은 HOLD다. 앱화 트랙이 과거 readonly binder 결과나 A3 synthetic PASS를 미래 paid 권한으로 사용해서는 안 된다.

## 6. A/B/C 판정

- A: 문서 초안+source reconciliation은 작성됨. D-01~D-08 owner 계약/승인 증거가 없으므로 **A HOLD (owner approval 0/8)**.
- B: 운영 서버 DTO/Rule+Grant/Reader HTTP/모바일 소비 미연결. 기술 코드의 기존 #1818/#1824 CI는 각 범위에서만 의미. **B HOLD**.
- C: paid Product/Saju authority/Checkout/Grant/revoke/follow-up live E2E 및 rollout 미승인. **C HOLD**.

**금지:** Draft #1823을 상품 승인·운영 공개로 해석하거나 PR의 일반 CI PASS를 위 세 게이트의 PASS로 기록하지 않는다.
