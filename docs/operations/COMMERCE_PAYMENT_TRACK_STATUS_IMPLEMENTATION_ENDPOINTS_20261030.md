# 명하 결제 트랙 — 구현 현황, 목적, 엔드포인트 및 종료 조건

> 기준: **2026-10-30 / `feat/commerce-payment/roadmap-continuation-20261030`**
> 병합 대상: `gycha0109-beep/MyeongHa` → `main` (이번 트랙 구현을 **단일 PR로 통합**)
> 구분: **저장소 구현 사실 / 샌드박스 실측 / 내부 후보 / 운영 출시**를 혼동하지 않는다.
> 범위: Commerce Payment P1–P5. 이 보고서는 LIVE 출시 또는 환불 집행 승인이 아니다.
> 연결 문서: [현재 정책·구현 게이트](COMMERCE_PAYMENT_CURRENT_DECISION_AND_IMPLEMENTATION_GATES_20261030.md), [P1/P2 실측](COMMERCE_P1_ACCEPTANCE_P2_CATALOG_HOLD_20261029.md).

## 1. 구현 목적과 최종 엔드포인트(완료 목표)

**최종 목적:** 고객이 공식 사주 Reading을 **특정 Reader 기준의 1회성 유료 상품**으로 안전하게 구매하고, 서버 검증으로 결제를 확정한 다음 정확한 유료 해석 권한을 지급하며, 청약철회·환불 발생 시 **해당 구매 권한만** 처리하고 독립적으로 구매한 다른 Reader 이용권 및 일반 채팅 권한을 보존하는 것.

정상 흐름의 최종 목표:

1. 운영 권한이 확인된 **상품·고정 금액/통화·Offer·Charge Terms**를 구매 전에 서버에서 확정한다.
2. **본인 Subject → Purchase Intent → Payment Attempt → PortOne V2 요청**을 불변 관계로 만든다. 브라우저 결제 성공 콜백은 증거가 아니다.
3. **서버가 PG를 독립 재조회**하고 원본 상품/금액/통화/환경/거래번호를 대조한다. 검증된 Receipt/Provider Event를 중복 없이 기록한다.
4. **원본 Receipt와 구매한 Reader/Reading 유닛에 정확히 매인 Grant/Event**를 지급한다. Reader의 실제 유료 결과물 제공 여부는 결제/DB 커밋과 별도로 추적한다.
5. **고객 환불 접수 → 법정 예외·실제 제공 증거 심사 → PG 취소 결과 확인 → 원본 Provider Event 순서/중복 방지 → 해당 Grant만 회수 → 구매/환불 이력 보존**을 연결한다.
6. **개인정보 삭제·익명화·법정 결제 증거 보존·백업 복원 재처리**는 이미 확정된 `P0-PR-01` 정책을 적용한다.
7. 상기 검증과 실제 가맹점/PG 계약, 판매 상품 준비를 만족한 뒤 **LIVE checkout, 유료 결과물, 환불 접수/회수 경로를 각각 운영 활성화**한다.

**현재 종료 상태:** P1/P2 검증·기초 상품 정의는 완료됐지만 **판매/결제/유료 제공/환불의 고객 운영 E2E는 완성되지 않았다.** 이 보고서 PR 병합은 코드 통합일 뿐 P5 LIVE 출시가 아니다.

## 2. 단계별 진척도 — 증거가 있는 상태만 표시

| 단계 | 목적 | 확인된 구현/증거 | 현재 상태 |
|---|---|---|---|
| **P1: 결제 원본 검증** | 실제 PG 서버 검증과 안전한 Receipt/재시도 | 2026-10-29 **Owner KCP TEST**: `chat_credits_300_v1`, **KRW 1,900**, PortOne V2 SANDBOX PAID → Purchase Intent verified / Receipt verified / Provider Event 기록. 반복 서버 검증 시 Receipt 1건 유지. 운영 크레딧 발급 **0**. | **샌드박스 수락 완료**, LIVE 미실시 |
| **P2: 상품/결제 카탈로그 무결성** | 실제 유료 품목과 구매 단위·금액 권한 | `standard.love_relationship` / `relationship:natal:general` / 특정 Reader 선택 / capability `reading.standard.love_relationship.unit.v1` / **KRW 8,900 결정된 목록가**. Product `enabled=false`; **판매 Offer 0, 실행 Charge Terms 0**. 기존 9,900원 일반 사주 후보는 퇴역. | **Read-only 카탈로그 HOLD 검증 완료**, 판매 미활성 |
| **P3: 결제 → 유료 권한 지급** | 검증 Receipt 기반으로 특정 Reader의 구매권만 발행·열람 | 기존 Entitlement Effect·Projection, `commerce-credit-checkout-fulfillment-candidate-v1.ts`, `commerce-credit-verified-topup-fulfillment-candidate-v1.ts` 등 **내부 후보** 존재. 검증 결제만으로 운영 유료 Grant/크레딧 자동 발급하지 않음. | **구현 기반 존재 / productionMounted=false** |
| **P4: 환불/취소/권한 회수** | 법정 기준의 접수, 정확한 결제/제공 증거 심사, 취소 결과와 특정 Grant 회수 | 정책 분류기, 체크아웃 고지·확인 증거 읽기, 본인 구매·Reader 사전 검사, 내부 claim idempotency 후보, 서명된 PortOne 취소 신호, 원본 Receipt 결속, **GET 재조회**, 전액·부분·대기/실패 분류, 해당 Grant/Event 비교, Reader별 독립 구매권 조사. **운영 취소/회수는 수행하지 않음.** | **내부 검사·분류기 구현, 고객 흐름/실제 회수 미연결** |
| **P5: LIVE 운영** | 실제 고객 판매/정산/환불, 배포, 관측·회복 | 운영 가맹점·PG/채널 최종 준비, 판매 Offer, Saju 공식 유료 Reading 공급, Reader 결과 제공, 실제 환불 경로 등이 필요. | **HOLD / 운영 활성화 아님** |

*진척률(%)은 산정하지 않는다. “코드가 있다”와 “운영 경로에서 작동한다”는 서로 다른 상태다.*

## 3. 구현된 HTTP 엔드포인트와 노출 상태

### 3.1 실제 Cloudflare 경로가 있는 Owner SANDBOX 및 조회

| HTTP | 경로 | 목적 | 제약·검증 | 운영 의미 |
|---|---|---|---|---|
| `GET` | `/api/me/credits` | 인증된 Member 크레딧 잔액/Owner 역할 조회 | `workers/cloudflare-chat-credit-wallet.mjs`, Cloudflare rewrite | **조회 기능**, 실제 판매/충전 실행 아님 |
| `POST` | `/api/me/credits/portone/test-prepare` | Owner 전용 **TEST** Purchase Intent/Attempt 준비 | 인증 Member/Owner, 서버 상품/금액 고정, idempotency token | **실제 SANDBOX 준비 경로** |
| `POST` | `/api/me/credits/portone/test-checkout` | DB 소유 Attempt의 PortOne KCP TEST 결제창 인자 반환 | 브라우저 상품·금액 조작 불허, 고정된 KCP TEST 계약 | **실제 SANDBOX 핸드오프** |
| `POST` | `/api/me/credits/portone/test-verify` | DB의 Attempt ID로 PortOne 서버 PAID 재조회 및 Receipt/Provider Event 확인 | 브라우저 callback 증거 무효, 재검증 중복 방지, 권한 있는 K2 경로 | **SANDBOX 검증, Production Grant 0** |
| `GET` | `/owner-portone-sandbox.html` | Owner TEST 화면 | 공개 유료 구매 화면 아님; Owner 인증/검증 필요 | **테스트용 UI** |
| `GET` | `/owner-portone-sdk-v2.js` | 허용된 공식 SDK만 중계 | 요청자 임의 URL·헤더 전달 금지 | **SDK 지원 리소스** |

증거 코드: `workers/cloudflare-api-router.mjs`, `workers/cloudflare-portone-owner-sandbox-actions.mjs`, `workers/cloudflare-portone-owner-sandbox-checkout.mjs`, `workers/cloudflare-chat-credit-wallet.mjs`, `apps/web/owner-portone-sandbox.js`, `api/me.ts`. **실제 온라인 성공 증명은 P1의 2026-10-29 TEST 실행만 해당한다.** 이 표만으로 현재 시점의 모든 Cloudflare 배포 버전 또는 LIVE 정상 동작을 주장하지 않는다.

### 3.2 코드/HTTP 계약은 있지만 **Production 공개 경로로 연결되지 않은 기능**

| 메서드 / 경로 | 코드 | 현재 노출 | 실제 의미 |
|---|---|---|---|
| `POST /api/commerce/webhooks/portone-v2` | `apps/api/src/portone-v2-webhook-http.ts`, `portone-v2-webhook-runtime.ts` | **공식 HTTP 핸들러 계약 존재 / public Production webhook 미마운트** | 기존 PAID 처리 계약. **새 취소 이벤트 처리기를 붙였다는 의미 아님** |
| `POST` / **공개 URL 없음** | `purchase-intent-create-http-v3.ts` | `publicRoute: null` | 일반 유료 상품 구매 Intent의 서버 측 후보 |
| `POST` / **공개 URL 없음** | `payment-attempt-create-http.ts` | `publicRoute: null` | 일반 유료 결제 Attempt 생성 후보 |
| `POST` / **공개 URL 없음** | `payment-attempt-handoff-context-http.ts` | `publicRoute: null` | 일반 결제창 Context 후보 |
| `POST` / **공개 URL 없음** | `payment-attempt-server-verification-http.ts` | `publicRoute: null` | 일반 결제 영수증 검증 후보 |
| `GET /api/me/credits` (**후보 구현**) | `commerce-chat-credit-wallet-http-candidate-v1.ts` | **productionRouteMounted=false** | 위의 **실제 Cloudflare 잔액 조회**와 별개인 후보; 이 파일 자체가 운영 라우트 아님 |
| `POST /api/chat/credit-delivery/ack` | `commerce-chat-credit-delivery-ack-http-candidate-v1.ts` | **productionMounted=false** | 전달 ACK 후보, 실제 운영 승인 아님 |
| **경로 없음** (HTTP 미구현) | `commerce-digital-reading-withdrawal-private-intake-v1.ts` | **publicRouteMounted=false** | 내부 환불/청약철회 claim 후보일 뿐 고객 접수 API가 아니다 |
| **경로 없음** (HTTP 미구현) | `portone-v2-cancellation-webhook-candidate-v1.ts`, `scripts/operations/commerce-signed-cancellation-private-reconciliation-v1.mjs` | **미마운트** | 서명된 취소 알림 검증과 내부 정합성 재조회. 공개 취소 webhook이나 환불 API 아님 |

**중요:** 일반 유료 Reading 결제·환불의 외부 URL을 현재 상태에서 임의로 만들어 명세하지 않는다. 해당 URL의 Route/인증/배포 연결이 실제 구현되는 순간 별도 엔드포인트로 등록한다.

### 3.3 외부 결제사 요청 — **우리 서비스 API가 아님**

| 방향 | 메서드/엔드포인트 | 목적 | 현재 사용 |
|---|---|---|---|
| 내부 서버 → PortOne V2 | `GET https://api.portone.io/payments/{paymentId}` | 이미 검증된 원본 결제의 최신 취소 상태 조회 | **내부 읽기 전용 어댑터 후보**. 고정 호스트, redirect 거절, 응답 크기/시간 제한, 서버 시크릿. 운영 webhook 미연결 |
| 내부 서버 → PortOne 취소 API | **운영 호출 없음** | PG 취소 요청/정산 | **미구현·미활성**, 이번 트랙에서 POST 취소를 호출하지 않음 |

## 4. P4 구현 단위 및 안전 경계

| 구성 | 실제 파일 | 구현 목적 | 현재 경계 |
|---|---|---|---|
| 본인 Reading 구매 사전 검사 | `apps/api/src/commerce-digital-reading-withdrawal-review-preflight-v1.ts` | Subject/Receipt/Reader 유닛 일치 및 고지·제공증거 비교 | private read-only |
| 검증 데이터 조회 | `apps/api/src/postgres-digital-reading-withdrawal-evidence-private-v1.ts`, `commerce-digital-reading-withdrawal-private-transaction-v1.ts` | 기존 Receipt·Purchase Intent·Reader 선택·고지에 결속한 일관된 Snapshot | 실제 소비자 제공 증거 source 없으면 **제공 완료 추정 금지** |
| 청약철회 접수 후보 | `commerce-digital-reading-withdrawal-private-intake-v1.ts` | 서버 HMAC 멱등성·중복 접수·원본 claim 불변성 | **운영 DB에 테이블 미적용, 소비자 접수 경로/확인 응답 없음** |
| 취소 알림 분류 | `portone-v2-cancellation-webhook-candidate-v1.ts` | 서명된 `Transaction.Cancelled / PartialCancelled / CancelPending` 분류 | **실제 webhook 미마운트** |
| PG 조회 결과 검사 | `portone-v2-cancellation-readback-evidence-v1.ts`, `portone-v2-cancellation-readback-get-v1.ts` | 원본 결제의 금액·통화·환경·거래번호와 PG 취소 누적 금액/개별 요청 상태 대조 | GET만 허용, **전액/부분/대기 분류는 권한 회수 승인이 아님** |
| 원본 결제/Reader·Grant 감사 | `scripts/operations/commerce-cancellation-payment-receipt-link-v1.mjs`, `commerce-refund-event-grant-reconciliation-v1.mjs`, `commerce-exact-reader-cancellation-evidence-v1.mjs` | 검증된 원본 Receipt, PortOne 취소 태그, 정확한 Grant 회수 이벤트 및 다른 Reader 권한 대조 | **오프라인 read-only**, Source 이벤트 순서·금액 최종성·법정 청약철회 판단 대체 불가 |
| 내부 경로 조립 | `scripts/operations/commerce-signed-cancellation-private-reconciliation-v1.mjs` | signed webhook → exact verified Reading Receipt → PortOne GET → 내부 검토결과 | **외부 라우트 없음, DB/PG 취소 POST/Grant 수정 없음** |
| 고지 이력 감사 | `scripts/operations/commerce-paid-reading-notice-audit-v1.mjs` | 결제 전 법정 고지/동의 기록의 누락·정합성 집계 | **읽기 전용**, 고지만으로 제공 완료 판정 금지 |

테스트는 **모의 응답 및 일회용 PostgreSQL 17** 기반. **PortOne 운영 취소 실거래, 고객 실제 환불, 운영 Grant 회수 E2E는 검증하지 않았다.**

## 5. 승인된 정책과 실제 구현 차이

- **P0-PR-01 개인정보 정책 이미 결정**(2026-09-19): 서비스/개인화 DELETE, 구조 정보 4개 ANONYMIZE, 명시된 Commerce 증거 9개 테이블 **달력 기준 P5Y**, 암호화 백업 **P30D** 및 복구 시 개인정보 삭제 재적용. **정책 재승인 금지.**
- **환불·청약철회 정책 원칙 이미 결정**: 콘텐츠 제공 시작 시점과 실제 소비자 제공 증거를 구분하고, 미제공/하자/중복 결제/법적 예외/부분 제공을 별도 검토하며, 다른 Reader 구매권과 일반 Chat을 보존한다. **정책 재확정 요청 금지.** 다만 소비자 고지·법정 의무 적합성 검증과 실제 출시 승인은 별도다.
- **새 접수 테이블 `digital_reading_withdrawal_claims_private_v1`은 승인된 개인정보 Subject 그래프에 미편입**: 승인된 9개 P5Y 증거 테이블에 없는 새로운 테이블. 따라서 `supabase/migrations/`가 아닌 `docs/operations/candidates/digital_reading_withdrawal_claim_private_v1.sql`에 보관. `accountDeletionPolicyDecided=true`이지만 `claimDispositionGraphIntegrated=false`. 기존 개인정보 삭제 finalizer·FK 정리·복원 검증에 편입하기 전 **자동 배포 불가**. 새로운 정책 결정을 요구하지 않는다.
- **상품 가격과 판매 가능한 청구 권한은 별개**: `standard.love_relationship` **8,900원 목록가 결정** ≠ enabled Offer/ChargeTerms ≠ 구매 가능.

## 6. 다음 구현 순서와 의존성 — 병합 이후 개발 경로

1. **기존 Commerce Provider Event 저장·중복 방지·순서 권한 재사용**: 이번 검증한 원본 거래번호, PortOne 취소 최종 상태와 정확한 결제 영수증을 **기존 이벤트 스키마**로 수렴한다. 신규 중복 원장을 만들지 않는다.
2. **기존 Entitlement Effect와 Reader/T2 접근 잠금 결속**: 전액·부분·취소 대기를 구분하고 해당 Purchase Intent / Reader / Grant만 회수할 수 있는 안전한 적용 조건을 완성한다. 일반 채팅과 별도 구매권 불변.
3. **실제 Reading 제공 사실 source 확보**: 결제 성공/고지 체크/T2 COMMIT/HTTP 송신 시도만으로 제공 완료를 판단하지 않는다. 사용자 안내·접수·확인 경로를 연결한다.
4. **신규 환불 claim 후보의 개인정보 삭제 실행 그래프 편입**: 기존 P0-PR-01 DELETE/ANONYMIZE/P5Y/P30D에 맞는 정확한 테이블 처리·FK 순서와 복원 후 privacy replay 증명. 그 전까지 자동 SQL 적용 금지.
5. **P3 유료 공급 + P5 LIVE 게이트 확인**: 승인된 Saju production relationship/natal/general 풀이 공급, Reader access eligibility, 실행 Offer/ChargeTerms, PG 상점/채널/정산·보안·상품고지·실제 환불 제공 준비 이후 독립 E2E와 배포.

**사용자 재승인 요청 대상이 아닌 것:** P0-PR-01 및 이미 승인된 환불 정책 원칙.
**여전히 실제로 필요한 것:** 미완성 구현과 운영 상점/상품/Reader/Saju 공급·LEGAL·PG 준비. “LIVE HOLD”를 “정책 재승인 HOLD”로 바꾸지 않는다.

## 7. 통합/검증과 병합 범위

- 이 브랜치는 `53f4053d`부터 `f12869cc`까지 **10개 결제 트랙 커밋**을 축적했다.
- 이 보고서와 해당 커밋은 **한 개 PR**로 `main`에 병합한다. 중간 병합은 하지 않는다.
- 별도 사주/Reader/운영 트랙에서 수행한 변경을 이번 트랙이 직접 고치지 않는다.
- 기대되는 로컬 검증: `npm run typecheck --silent`, `npm run build --silent`, 관련 Vitest와 PostgreSQL 독립 fixture. CI 상태와 실제 병합 상태는 **PR의 GitHub 체크 및 merge SHA로 별도 확인**한다.
- 실제 PG 취소·정산 호출 또는 Production 스키마 적용 없음. 이 병합으로 소비자 환불·유료 구매 API가 열리지 않는다.

### 근거 링크

- [P0-PR-01 Owner 결정](https://github.com/gycha0109-beep/MyeongHa/issues/964#issuecomment-5737913582)
- [환불/청약철회 정책](../COMMERCE_DIGITAL_READING_REFUND_DISCLOSURE_POLICY_V1.md)
- [현재 결정 등록부](../P0_DECISION_REGISTER.md)
- [P1/P2 실측](COMMERCE_P1_ACCEPTANCE_P2_CATALOG_HOLD_20261029.md)
- [취소 검증 후보 상세](COMMERCE_PORTONE_V2_CANCELLATION_SIGNAL_CANDIDATE_V1.md)
- [환불 접수 후보/보류](COMMERCE_DIGITAL_READING_WITHDRAWAL_PRIVATE_CLAIM_V1.md)
