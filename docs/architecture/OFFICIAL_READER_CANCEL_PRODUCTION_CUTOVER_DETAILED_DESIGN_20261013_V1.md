# 공식 리더 결제 취소·이용권 회수 운영 연결 상세 설계 v1

> 기준일: 2026-10-13 (Asia/Seoul)
> 기준 코드: 명하 저장소의 비공개 검토 요청 #2038 → #2039 → #2044 → #2045 → #2049, 마지막 코드 f9a2203361c686770af1604d128192e858b29aef
> 분류: 결제/상거래 + DB 권한 + 공식 리더 + 보안/법무/개인정보 공동 설계
> **상태: 설계 초안 / 구현 승인 아님 / 실제 결제·환불·이용권 회수·공개 유료 리더 기능 전부 비활성**
> 우선순위: 최신 제품·결제·운영 결정문과 실제 병합된 운영 코드 > 본 설계. 과거 Commerce 트랙 문서의 시점 정보는 역사적 근거로만 취급한다.

## 1. 목적과 확정된 범위

### 목적
실제 PortOne V2에서 취소된 결제 사실을 **서버에서 독립 확인**하고, 명하의 정확한 구매·영수증·이용권 및 **상거래·법무 승인**과 결합한 후에만, 기존 DB의 원자 회수 기능을 최소 권한으로 실행한다. 이전 권한 변경 함수나 운영 관리자 경로가 이 절차를 우회하지 못하게 한다.

이 문서는 구현할 계약·순서·검증·운영 전환 조건을 정의한다. 새 환불 정책이나 법률 판단을 승인하지 않는다.

### 첫 운영 후보의 좁은 범위
- 국내 웹, PortOne V2, 한 번의 구매, 정확한 공식 Reading × 한 Reader 유료 해설 **단건 이용권**.
- 결제사가 반환한 상태가 완료된 **전액 취소**이며 원결제 금액·통화·결제번호·거래번호·취소번호·영수증이 모두 일치할 때만 회수 후보로 승격.
- 이미 회수된 이용권은 재회수하지 않는다. 미결속 최초 구매 이용권도 Source 기반 Product 잠금 후 회수하되 충분한 검증이 필요하다.
- 전액 취소 1건이 여러 이용권에 걸치는 결제, 부분 취소와 구성요소별 환불, 이의제기·차지백, 결제 복구, 판매 중간 변경, 타 PG·앱스토어는 **별도 후속 설계**. 이를 단건으로 축소하거나 일부만 회수해서는 안 된다.
- 환불금 지급·PG 취소 요청과 이용권 회수는 서로 다른 절차다. **본 설계의 회수 실행은 PG 환불을 발생시키지 않는다.** 실제 환불 실행은 승인된 별도 결제 처리 트랙에서만 한다.

### 불변 조건
1. 브라우저/앱, 이용자 ID 입력값, 웹훅 본문, API 호출 성공, 검토 대상 분류, 내부 DB 이벤트의 status='verified' 중 **어느 하나도 단독 회수 권한이 아니다**.
2. 서버 검증된 결제 취소 사실 + 정본 구매·이용권 완전 연결 + 법무/상거래 결정 + 독립 승인 발급자 검증 + 잠금 후 최신 상태 재검사 + 원자 변경을 **모두** 충족해야 한다.
3. 상품 Product L0 전체 → Reading×Reader L1 전체 → Provider Event/Receipt/Grant 원본 행 잠금 → ledger/projection/outbox 한 거래. 역순 잠금과 누락된 범위 금지.
4. 운영 애플리케이션 계정에 원본 Entitlement Writer 또는 승인 기록 직접 INSERT/UPDATE 권한을 주지 않는다.
5. 검증 실패·오류·출처 불확실·중복·역순·부분 취소·법률 판단 유보는 거부 또는 보류하며, 이미 인도된 콘텐츠를 삭제할 수 있다고 주장하지 않는다.

## 2. 현재 구현의 정확한 출발점

| 현재 파일/계층 | 확인된 기능 | 운영 연결에서 빠진 것 |
| --- | --- | --- |
| apps/api/src/portone-v2-webhook-payment-completion.ts, portone-v2-webhook-http.ts, portone-v2-webhook-runtime.ts | 기존 서명 검사 및 Paid 전용 결제 완료 처리. 취소 타입은 정상 Paid 경로에서 처리하지 않음 | 실제 취소 수신·내구성 있는 접수·별도 worker 분기 |
| apps/api/src/portone-v2-cancellation-source-v1.ts | 서명 검증 재사용, 고정 PortOne GET, timeout·응답 크기 제한, 취소금액·취소ID 및 거래 동일성 검사. full_candidate/pending/partial/superseded 분류 | 실제 운영 worker·독립 DB 저장·환불 승인 |
| apps/api/src/official-reader-provider-cancel-preflight-v1.ts | 읽기 전용 후보 판정, 항상 회수·환불 권한 false | 실제 승인이나 실행 아님 |
| SQL 1860 | 취소 관측 shadow 원장, 중복/순서 분류, 결제별 advisory 잠금, 외부 계정 접근 차단 | 서버 verified 원본 인증·작업자 권한 발급·영속 정규화 |
| SQL 1870 | 결제번호 → Payment Attempt → 영수증 → verified Provider Event → Intent/Offer → 단일 active Grant 대조 | 다중 Grant, 운영 provenance와 승인 |
| SQL 1840 + 1850 | 정본 영향 범위에서 Product L0/Reader L1 취득 후 전체 원자 회수, CAS·ledger·outbox | 실제 취소 사실이 법적으로·상거래상 승인됐는지 검증하지 않음 |
| SQL 1880 | 비공개 승인 지문·승인자 2명·재조회 시간, 단건 원자 회수 연결 | 승인자 자격의 서버 측 검증/승인 발행자, 최신 공급사 상태 증명, 운영 호출 권한 |
| SQL 1890 | 기존 직접 권한 변경/취소 관련 함수 7개에 대한 일반 사용자·API·결제·채팅 실행 계정의 EXECUTE 차단 | DB 소유자 경로/새 역할 포함 전체 정적·동적 감사 및 원본 Writer 완전 전환 |

**검증된 사실:** #2049 코드 f9a2203의 전체 CI 38354271814 성공. PostgreSQL 15에서 다섯 실제 실행 계정의 구/신 함수 직접 호출 거부와 승인 기록 생성 거부를 검증했다. 이는 **운영 cutover, 실제 환불, DB 소유자 우회 전면 제거를 입증하지 않는다.**

**관련 운영 정책:** docs/COMMERCE_DIGITAL_READING_REFUND_DISCLOSURE_POLICY_V1.md는 법률 검토/상업 공개 HOLD이며, 서버 내부 T2 확정만으로 실제 소비자 제공을 증명하지 못한다고 정의한다. 이전 Commerce 통합 문서(2026-09-16)에서도 Web 1회성 판매, PortOne V2 채택, 실제 판매·상업 공개 보류를 구분한다.

## 3. 권한과 책임 — 누가 무엇을 결정하는가

| 주체 | 허용 책임 | 금지 책임 |
| --- | --- | --- |
| PortOne V2 | 원결제·취소 상태/금액/ID에 대한 외부 사실 제공 | 명하 이용권 및 법적 환불 가능 여부 결정 |
| 서명 검증 진입 계층 | 원시 웹훅 인증, 크기/시간 제한, 별도 내구 접수 | 취소 웹훅만 보고 Grant 변경 |
| 취소 출처 검증 작업자 | 서버 비밀키로 PortOne 재조회, 환경·거래·누적 취소금액 검증, 읽기 전용 사실 생성 | 판매자 승인, 법률 판정, 회수 |
| 구매 대조 계층 | 정본 Payment Attempt/Receipt/Intent/Offer/Grant와 취소 연결 검증 | 전달받은 subject/receipt를 신뢰하거나 부분 취소를 전액으로 추정 |
| 상거래 담당자 | 거래·결제·환급·고객사유·부분/전액 정책 판단 및 서명된 결정 | 법무 결정 대행, DB Grant 직접 수정 |
| 법무 담당자 | 법정 취소·미제공·가분성·고지·인도 증거 및 법적 예외 판단 | PG 취소 사실 위조, DB 직접 변경 |
| 승인 기록 발행 서비스 | 두 사람의 **실제 서버 인증 신원·역할·승인 범위**를 확인하고 불변 승인 증거 발행 | 브라우저에서 제출된 reviewer ID나 approved=true를 그대로 저장 |
| 전용 취소 실행자 | 승인 증거를 다시 검사하고 최소한의 DB 회수 명령 **하나** 실행 | 1080·1850·1880 직접 범용 실행, 임의 DB 소유자 승격 |
| DB 소유자/배포 실행자 | 마이그레이션·역할 발급·권한 감사·재해 복구 | 정상 취소의 상시 실행 계정 겸직 |
| 유료 Reader/T2 읽기 계층 | 최신 권한 확인 후 보안 승인된 콘텐츠만 공개 | 과거 캐시·브라우저 Paid flag를 근거로 유료 본문 공개 |

**핵심 분리:** 서버 검증 결과를 생성하는 역할, 법무/상거래 승인을 기록하는 역할, DB 상태를 변경하는 역할의 DB 계정과 비밀이 서로 같아서는 안 된다. 기존 myeongha_commerce_internal_executor는 범용 결제 완료 역할이므로 신규 회수 실행 권한을 곧바로 부여하지 않는다.

## 4. 정상 처리 흐름과 커밋 경계

1. **접수:** 현재 Paid 경로와 충돌하지 않는 별도 취소 분기에서 원시 요청 크기·시한·서명·발생 시각을 검증한다. 서명 유효/이벤트 타입 확인까지만 수행. 성공 응답 전 접수 키를 durable 저장하며, 저장 실패 시 재시도 가능한 서버 오류로 응답한다.
2. **별도 처리 대기열:** webhookId를 내구성 있게 기록한다. 동일 webhookId·동일 사실은 한 건, 동일 ID에 다른 본문·금액은 충돌 보류. 큐 등록과 관측 저장은 같은 DB 거래로 확정.
3. **공급사 독립 조회:** 워커가 서버 소유 API Secret으로 PortOne GET /payments/{paymentId}를 호출한다. 동일 store/환경/transaction, status, payment amount, currency, cancellationId, SUCCEEDED 누적금액을 검사한다. **외부 HTTP는 DB 잠금을 잡기 전에** 수행한다.
4. **출처 증명 영속화:** 원시 본문은 보관하지 않으며 정규화된 단건 식별자·금액·상태·증거 지문·확인 시각·검증 알고리즘 버전을 append-only로 저장한다. provider fact와 법무 승인 상태를 섞지 않는다.
5. **정본 구매 대조:** 1870 계약대로 서버에 저장된 paymentId→Attempt→verified Receipt→verified Provider Event→Intent/Offer→정확한 active Grant를 교차 확인. 다수 Grant, 상태 모호, 다른 환경·금액·통화 등은 보류.
6. **법무·상거래 심사:** 사유 및 고지/제공 증거까지 조회하여 각각 독립 심사. 서명된 결정이 없으면 자동 회수 금지. 결정 범위는 정확한 취소 이벤트·Receipt·Grant·원본 지문에 고정한다.
7. **최종 최신성 확인:** 작업자는 승인 발행 후 재조회 유효기간, 이벤트 신규 도착/취소 취소/Provider ordering의 불확실성, 정확한 구매 매핑을 재확인한다. 오래된 승인은 새 승인 필요.
8. **원자 DB 실행:** 전용 실행자만 비공개 게이트 진입 → 출처/승인 read → 결제별 관측 lock → 잠금 후 재검사 → 전체 Product L0 → 전체 Reader L1 → 1850·원본 1080 → Event/Grant/projection/outbox 변경 → 단일 COMMIT.
9. **사후 확인:** 별도 이벤트를 읽어 승인 건 1개 ↔ 원자 회수 1건/정확한 Grant ↔ 갱신된 projection ↔ outbox 이벤트를 대조한다. Reader의 새 접근은 fresh Grant를 확인하고 거절한다.
10. **완료/재시도:** 성공 결과가 응답 전 유실되더라도 영속 완료 이벤트와 Grant 최종상태를 다시 조회하여 중복 회수하지 않는다. 외부 결제 취소를 다시 요청하지 않는다.

### 핵심 순서 도식

~~~text
PortOne signed webhook
  → 독립 PortOne GET (DB 잠금 없음)
  → 영속 취소 관측 / 이벤트 정규화
  → 구매·영수증·단일 이용권 대조
  → 상거래 검토 ─┐
               ├→ 검증된 불변 승인 발급 → 전용 회수 실행자
  → 법무 검토 ──┘                       ↓
                     결제 관측 lock → Product L0 전체
                                          ↓
                                 Reading×Reader L1 전체
                                          ↓
                             Provider/Receipt/Grant 최신성·CAS
                                          ↓
                              Entitlement Event/Grant/Outbox
                                          ↓
                                       COMMIT
~~~

## 5. 웹훅 진입점 구체 계약

현재 portone-v2-webhook-http.ts는 Paid 처리 결과에 성공 시 204를 반환하며 비 Paid 이벤트는 취소 처리하지 않는다. 현행 운영 경로를 바로 바꾸면 정상 결제 안정성을 훼손할 수 있으므로 **기존 Paid 처리와 독립된 취소 관측 분기를 새로 설계**한다.

- 허용 이벤트: Transaction.CancelPending, Transaction.PartialCancelled, Transaction.Cancelled. 나머지 타입은 기존 Paid와 독립적인 비변경 경로로 처리.
- 요청 진입: 기존 bounded raw-body, deadline, signature validation, timestamp tolerance를 재사용. body parser 결과나 임의 조회 URL을 인증 근거로 사용하지 않는다.
- 별도 분기에서도 먼저 durable receipt 기록. 성공 응답 코드는 **접수 완료**를 뜻하지, 환불 승인·이용권 회수 완료가 아니다.
- 서명·요청형식 오류는 400 계열, 저장소 일시 실패·비밀키 구성 장애 등은 안전하게 재시도 가능한 503. 정상 접수 후 심사 보류는 별도 영속 상태로 유지하며 재전송 무한 유도 금지. 구체적인 인증 실패 응답과 관측 정책은 기존 HTTP 응답의 정보 노출 경계를 따라 확정.
- 같은 웹훅을 동시에 받은 경우 unique(provider, environment, webhookId)로 동일 사실 replay, 다른 지문 conflict. webhookId 재시도 시 타임스탬프가 같을 수 있으므로 시간을 기본 중복키로 삼지 않는다.
- PortOne의 인출/취소 요청 API는 별도의 상거래 실행 계약이고, **이 수신 경로에서 호출 금지**.

## 6. 공급사 결과와 구매 증거

### 공급사 쪽 필수 대조
- provider=portone_v2, 환경 production, 검증된 결제 소속 storeId 일치.
- webhook paymentId == PortOne GET payment.id == 저장된 결제 시도 provider_request_id.
- webhook transactionId == GET transactionId == Receipt external_transaction_id.
- 원결제 금액 > 0, 통화 일치, 취소누적액이 GET cancellations[] 중 SUCCEEDED 결과의 합계와 일치.
- 전액 회수 후보는 Transaction.Cancelled + GET status=CANCELLED + 누적 취소액=원결제액 + 해당 cancellationId의 SUCCEEDED 사건. 필드 누락·부분/진행중/실패/초과 합산 모두 HOLD.
- 오래된 PartialCancelled 웹훅을 최신 GET이 이미 CANCELLED라고 해서 전액 사건으로 승격하지 않는다. 취소 사건과 GET snapshot이 다른 시간 축에 놓이면 원 사건 타입을 유지.
- 응답 코드와 HTTP 결과 자체는 검증된 Refund/Entitlement 신호가 아니다.

### 명하 DB 쪽 필수 대조
- Payment Attempt provider/environment/request/transaction/intent/offer/subject 연속 연결.
- Receipt verification_status, 실제 결제액/통화, Receipt↔Intent/Offer/Product 고정.
- commerce_provider_events의 production verified payment.cancelled 사건이 **독립 검증자에 의해 기록**되었는지 확인. 단순 shadow 행 복사나 임의 INSERT는 검증이 아니다.
- 검토 범위가 1개 active purchase Grant에 정확히 고정되고 같은 Receipt에 다른 Grant가 없어야 한다. 숨겨진 미결속 Grant나 별도 Reader 권한이 발견되면 범위 확장 승인 전 HOLD.
- Subject는 사용자가 보내는 식별자가 아니라 검증된 Receipt에서 유도한다. 프로필 merge 이력도 임의 rewrite 금지.

### 중복·순서
- 별도 unique: webhook identity, PortOne transaction/cancellation identity, 동일 효과의 의미상 idempotency key. Provider 이벤트 수와 Grant 수를 1:1로 마음대로 조작하지 않는다.
- 1860의 observed/out_of_order/ordering_unproven은 **DB 관측 시간 관계**이지 PortOne의 확정된 결제/정산 ordering proof가 아니다.
- GET snapshot의 statusChangedAt과 webhook timestamp의 우열만으로 최종 금전 상태를 추론하지 않는다. 동시/역순/취소 재조회 사이 상태가 바뀌면 HOLD+재조회.
- 새 취소 관측과 회수 함수는 같은 transaction-scoped 결제별 잠금을 사용한다. 다른 Writer는 이 잠금을 Product L0 이후 역순으로 획득하면 안 된다.

## 7. 승인 기록 설계 — 현행 1880의 미흡한 부분 보완

**현재 1880의 한계:** 승인 테이블에 reviewer UUID 두 개와 approval_status='approved', 원본 식별자 4종의 scope_digest가 있더라도 **누가 두 리뷰어를 인증했는지** 자체 증명하지 않는다. 시험에서 DB 소유자가 임의로 INSERT하는 것은 기능 시험일 뿐 실제 승인 근거가 아니다. 현재 값만으로 서비스 실행 권한을 열지 않는다.

### 승인 기록 발급의 제안 계약
- 상거래/법무 담당자 각각 회사가 관리하는 독립 인증 신원, 유효 역할, 승인 시점 권한, 감사 가능한 요청 내용을 서버에서 증명. 동일 실사용자의 복수 계정이나 역할 겸임 금지를 정책으로 정한다.
- 승인 입력 화면은 읽기 전용 정본 구매·제공·취소 사건을 표시한다. reviewerId, paid flag, provider status, 법률 결론을 브라우저 임의값으로 받아 쓰지 않는다.
- 서로 다른 결정 2건은 각 decision ID/서명 또는 서버 원장 인가 증거를 갖는다. 둘 중 하나라도 부결/철회/인증 만료면 승인 발급 금지.
- 최종 approval은 취소 관측 ID, verified Provider Event ID, Receipt ID, Grant ID의 canonical 정렬된 범위 및 원문 지문·정책 버전·재조회 시각에 묶는다. 현행 scope_digest는 **동일성 고정용**이며 승인 진위용 전자서명을 대체하지 못한다.
- 리뷰어 원본 신원·토큰을 범용 공개 테이블에 중복 저장하지 않고 보안된 감사 원장에 키로 연결한다. 개인정보 보존기간·열람·삭제 예외는 Privacy/Legal 승인 후 확정.
- 승인 이후 최신 PortOne 상태가 바뀌거나 더 새로운 충돌 사건이 나오면 이전 결정은 자동 실행 무효. 수정/삭제 대신 별도 정정·철회 이벤트를 append-only로 남긴다.
- 승인 발행자는 승인 원장 INSERT만 허용하되 Grant/Event 직접 변경 권한은 없다. 실행자는 정확한 승인 조회/소비만 가능하고 승인 자체를 만들 수 없다.

### 제안 추가 스키마(미구현)
| 후보 논리 객체 | 핵심 키/필드 | 유일성·권한 |
| --- | --- | --- |
| 취소 수신/작업 대기 | provider, environment, webhookId, payloadDigest, receivedAt, retryCount, nextAttemptAt, disposition | webhook ID unique, 별도 worker 전용, PII/원문 금지 |
| 독립 Provider 조회 증거 | paymentId/transactionId/cancellationId, checkedAt, providerStatus, amountMinor, currency, verifierRevision, evidenceDigest | 결제·취소 관계 고정, append-only, 증거 변조 검출 |
| 결제 취소 심사 이벤트 | reviewId, caseId, reviewerType, actorAuthorityRef, decision, policyRevision, decidedAt | 두 실제 담당자 분리, 변경 대신 추가 이벤트 |
| 승인 발행 감사 | approvalId, scopeDigest, sourceDigest, reviewerDecisionRefs, issuedAt, expiresAt, issuerRevision, consumedEffectRef | 소유 계정만 승인 발행, 실행자 INSERT 금지 |
| 회수 결과 감사 | approvalId, providerEventId, GrantId 대신 보안된 참조 지문, committedAt, outcome, entitlementEventRef | exact-once 증명, outbox 기반 조회 전용 |

위 표는 구현 확정 SQL이 아니다. 1860·1880 및 기존 Provider Event/Outbox에 필요한 정보가 이미 존재하는지 먼저 살핀 뒤 중복 테이블을 줄여 설계한다. 트랜잭션 영속 저장과 보존/삭제 계약 없이 새 테이블을 곧바로 만들지 않는다.

## 8. 전용 실행자 및 DB 소유자 우회 차단

### 최소 권한 역할
- 새 전용 역할은 예를 들어 공식 취소 회수에만 쓰는 **비로그인 실행 역할**로 설계한다. 외부 연결 비밀은 서버 작업자만 보유하고, 기존 일반 API/결제완료/채팅 실행 계정과 분리한다.
- 실행 역할은 **하나의 좁은 비공개 회수 진입 함수 실행** 외에 승인 INSERT, 원본 1080·1850·1880 직접 EXECUTE, entitlement_grants/events/entitlements DML, 테이블·스키마 DDL, SET ROLE postgres 권한을 갖지 않는다.
- DB Gateway는 고정된 search_path, 스키마 소유자, SECURITY DEFINER 필요성·오용 위험을 독립 보안 검토 후 확정. 가능하면 private schema와 좁은 실행 함수만 노출. DEFINER의 소유자는 로그인하지 않는 통제 역할이며 public 함수 자동 EXECUTE 및 기본 권한을 명시적 차단.
- 게이트는 입력된 subject 또는 role 주장값을 신뢰하지 않고 영수증에서 Subject를 유도해 자체 거래 범위에만 설정한다. SET LOCAL/custom session variable은 **사용자가 쓸 수 있는 값**이므로 그 자체를 보안 인증으로 사용하지 않는다.
- connection pool에서는 BEGIN → 가장 좁은 역할 선택 → 승인/원본 증거 검증·DB 상태 변경 → COMMIT/ROLLBACK → 세션 오염 없음 확인. 일반 commerce completion의 실행 래퍼를 그대로 회수 권한용으로 전용하지 않는다.
- 승인 기록은 실제 발행자가 직접 원장에 쓰기 전에 별도 증거 검증을 완료해야 한다. 두 승인자 UUID만으로 단일 계정이 양쪽을 위조할 수 없어야 한다.

### 기존 Writer 전환 및 소유자 경로
1. 1890이 봉쇄한 7개 함수의 사용자·서버·결제 역할 권한을 유지하고 재부여 CI를 구성한다. 특히 1780은 SECURITY DEFINER이므로 함수 EXECUTE까지 검증.
2. 1080(원본 효과), 1090(영수증 발급), 1220(공식 Reading 결속), 1760/1770/1780/1790(과거 래퍼), 1750(유료 범위 조회), 0220(일반 채팅 기록), 관리자 보정·배치·정산 작업의 **실제 호출자와 잠금 순서**를 전체 목록화한다.
3. Reader 구매 신규 Grant와 회수가 동시에 일어나는 동안 **모든 협력 Writer**가 정본 Product L0를 먼저 얻고, 필요 시 전 L1을 순서대로 취득해야 한다. 호출자 한 곳이라도 행 잠금을 먼저 잡으면 전면 활성화 차단.
4. DB 소유자/마이그레이션 계정의 상시 운영 연결 및 임의 SQL 실행을 금지하는 운영 자격/비밀 통제, 접근 로그, 긴급 절차를 설계한다. **DB 소유자의 원천 권한을 SQL REVOKE만으로 제거할 수 있다고 주장하지 않는다.**
5. 기존 래퍼/구 코드는 곧바로 DROP하지 않는다. 정적 호출 그래프·실행 로그·실제 Role/DML 권한 및 회귀 시험에서 사용처 0을 확인한 뒤 폐기한다. 제거 전에도 기존 로그인 계정이 우회할 수 없어야 한다.
6. 전체 Entitlement 사용 사례(일반 상품·복구·만료·관리자 보정)를 조사하여 1080 실행 권한을 무턱대고 변경해 정상 결제 발급을 막지 않는다. 좁은 Reader 취소를 우선 분기하고 다른 사업 도메인 Writer는 별도 승인된 절차로 전환한다.

## 9. 동시성·원자성 설계

- HTTP 공급사 재조회는 **DB 트랜잭션 밖**. DB 내부는 짧은 READ COMMITTED 거래만 사용.
- DB 거래 내에서는 관측 결제 advisory 잠금 → 재조회된 shadow 이벤트 동일성 검사 → 1870 정본 매치 및 승인 검증 → 1840의 정렬된 Product 전체 L0 → Reading/Reader 전체 L1 → 1850의 엄격한 revision/order/CAS → 원본 1080의 불변 Event·Grant·projection·outbox 동시 반영.
- 결제 관측 advisory를 L0보다 먼저 잡는 모든 경로를 명시하고, 어떤 경로도 이미 L0를 보유한 채 같은 관측 advisory로 역진입하지 못하게 한다. 기존 구매 발급 Writer는 결제 관측 lock을 얻지 않는다면 협력 여부를 별도 실제 경쟁 시험으로 증명한다.
- 1850 내부 원본 Grant/Provider row lock 전 Product/Reader lock 확보를 보장. 잠금 대기 후 Product/Reader/Grant/Receipt 바인딩 및 승인 유효성을 다시 조회.
- 한 Grant의 회수 CAS나 다른 Grant의 CAS가 실패하면 전부 롤백. 작업자 재시도는 처음부터 최신 Provider/DB 상태 재조회.
- DB COMMIT 후 worker ACK 실패는 **환불 재요청 금지**. 기존 이벤트/Grant/Outbox의 의미상 동일성으로 결과 재조회하고 이미 처리된 경우 완료로 분류한다.
- 환불 이후 과거 T2 본문이 이미 송신됐다면 제거를 보장할 수 없다. 미래 T2·보호 본문 재조회는 fresh Grant와 release/provenance를 다시 확인하고 DENY한다.
- 여러 Grant가 하나의 취소 이벤트에 연결될 때 현재 1850의 독립 Event 배열 제약을 우회하기 위해 가짜 Provider Event를 생성해서는 안 된다. 다건 회수의 모델링과 정책·정산 단위를 별도 설계한다.

## 10. 처리 상태와 보류 규칙

| 상태 | 진입 증거 | 가능한 후속 |
| --- | --- | --- |
| RECEIVED | 인증된 webhook + 내구 접수 | 공급사 독립 재조회 |
| SOURCE_VERIFIED | PortOne GET와 서명·취소 내역 교차 일치 | 구매 정본 대조 |
| PURCHASE_MATCHED | 실제 Attempt/Receipt/Event/Intent/Offer/Grant 일치 | 심사 |
| REVIEW_REQUIRED | 법무/상거래 중 하나 이상 미결정 | 수동 검토 |
| REVIEW_APPROVED | 인증된 두 담당자의 같은 범위 승인 + 최신성 | 좁은 DB 실행 시도 |
| APPLYING | 전용 역할이 DB 거래 수행 중 | COMMIT or ROLLBACK |
| REVOKED | 정확한 Event/Grant/projection/outbox committed | 중복 호출 시 조회 완료 |
| HOLD | 출처 불명·부분/역순·법무 유보·경합/연결 범위 불완전 | 이유 교정·새 검증, 자동 회수 금지 |
| MANUAL_INCIDENT | PG에서는 취소 확정, DB 회수가 반복 실패/권한 장애 | 결제/DB 담당 사고 처리, 재조회 기반 복구 |

- SOURCE_VERIFIED는 APPROVED가 아니다. REVIEW_APPROVED는 Provider에게 환불을 다시 요청하는 명령이 아니다.
- 중복 이벤트, 낡은 상태, 다른 지문, 부분 취소는 REVOKED의 우회 경로가 될 수 없다.
- HOLD 해제는 이전 승인 재사용이 아니라 새로운 정확한 Source·정본·승인 검증을 요구한다.
- 오류 분류는 기술 오류(503·타임아웃·연결), 증거 오류, 정책 보류, 재시도 불가 충돌로 분리하며 사용자에게 내부 SQL·개인정보·비밀 값을 노출하지 않는다.

## 11. 실패·복구·운영 감시

| 발생 상황 | 즉시 조치 | 재처리 조건 |
| --- | --- | --- |
| 웹훅 재전송 | 동일 지문이면 접수 재사용, 변경 지문이면 격리 | 해당 거래의 새 PortOne GET |
| 공급사 타임아웃/5xx | 아무 이용권도 변경하지 않고 제한된 지수 재시도 | 재조회 성공 후 처음부터 검증 |
| 공급사 취소 완료, 내부 DB 오류 | 이미 취소된 금액을 다시 취소하지 않음, 사고 대기열 경고 | 원본 취소 사건·승인·Grant 최신 재검증 |
| 잘못된 Receipt/금액/통화/구매자 | HOLD, 감사 원장에 비식별 이유만 기록 | Commerce 수동 대조 후 새로운 검증 |
| 심사 중 더 최신 취소 사건 | 이전 심사 실행 무효 | 새 사건 기준 재심사 |
| 회수 트랜잭션 CAS 충돌 | 전체 롤백 | Product L0부터 다시 시도 |
| Grant는 revoked, worker 응답 유실 | 이벤트·Grant·Outbox 조회하여 단 한 건 처리 여부 판정 | 새로운 효과 생성 금지 |
| 승인자 계정 탈취·승인 지문 충돌 | 승인 발급/실행 기능 전면 중지 | 보안 조사·인증 갱신·별도 재승인 |
| 운영 회수 뒤 분쟁·결제 복구 | 자동 grant restore 금지 | 별도 복구 정책·법무/상거래 승인 |

최소 운영 지표: 접수에서 GET까지 소요 시간, verified/hold 비율, 동일 결제 재전송·충돌, 수동 심사 대기, 승인 이후 취소/무효화, DB 회수 성공/롤백/중복, PortOne 취소됐으나 Grant active인 불일치 건수, 사용자에게 최신 권한이 없는 T2 요청 거부 건수. 기준 임계값·온콜·보존기간은 운영 소유자가 별도 서명한다.

## 12. 보안·개인정보·민감정보

- 저장 금지: 서명 비밀키/PortOne API secret, 원시 웹훅 전문, PG 전체 영수증, 카드정보, 사주 생년월일/원문, 챗봇 유료 해설 본문, 브라우저 자유입력 사용자 프로필.
- 최소 저장: 사건/거래 식별 참조와 일관된 지문, 최소 금액/통화, 검증 버전, UTC 확인 시각, 결정/실행 상태 및 감사 참조.
- 단순 SHA-256(scope IDs)는 **서명·권한 증명·암호화가 아니다**. 원본 키가 유출된 경우 재식별 가능성을 고려하고 HMAC/키관리·보존기간을 검토한다. 지문 형식을 바꾸면 기존 1880과 호환/마이그레이션 설계가 필요하다.
- RLS뿐 아니라 테이블 SELECT/INSERT/UPDATE/DELETE, 함수 EXECUTE, schema USAGE, 역할 상속, SECURITY DEFINER search_path, default privileges, connection-pool 재사용을 함께 검사.
- 승인 원장 및 취소 작업 대기열에 대한 원칙적 append-only, 삭제/보존 예외, 유출 사고 접근 감사와 권한 취소는 Privacy/Legal 승인 후 확정.
- 운영 로그는 실패 분류만 남기며 API 비밀, body, SQL 변수·미리보기 콘텐츠가 로그에 섞이지 않도록 한다.

## 13. 구현 작업 분해 — 추천 순서

| 단계 | 실행 산출 | 완료 조건 | 다음 단계 전 금지 |
| --- | --- | --- | --- |
| ① 실제 호출자·권한 전수 조사 | 모든 DB Writer/관리자/배치 호출 그래프 + 권한 표 | SQL 역할 전환 및 원본 Writer 경합 재현, 미귀속 호출자 0 | 기능 활성화 |
| ② 서버 취소 수신 분리 | Paid 불변, 취소 이벤트 내구 접수 + 재시도 정책 | 원시 서명/크기/시간/내구 ACK/replay/위조 시험 | 이벤트만으로 회수 |
| ③ 독립 PortOne 결과 증명 | GET 증거·영속 Provider Event 정상화 + 상태 차이 기록 | full/partial/superseded/timeout/동일성/누적 합계/중복·역순 시험 | shadow를 verified로 단순 승격 |
| ④ 상품·환불/제공 계약 확정 | exact SKU/구성요소/인도 증거/고지 revision/법무 정책 | 승인받은 제품·Commerce·Legal·Privacy 정책과 자동거절 방지 시험 | 공개 유료 판매 |
| ⑤ 실제 승인 발행 서비스 | 리뷰어 인증·독립 권한·서명된 불변 결론 | 가짜 ID·동일 사용자 겸역할·결정 철회·stale source 차단 | 1880에 임의 INSERT |
| ⑥ 전용 DB 게이트 | 최소권한 역할 및 승인 결속·실행 소비 | 부정 역할 0 EXECUTE, owner 우회 감사, 정확한 원자 회수 | 범용 Commerce 역할 GRANT |
| ⑦ 모든 Writer 잠금 전환 | D1 L0→L1로 구매발급·bind·회수·T2 진입 통일 | 역순 3세션/새 Grant phantom/역방향 경쟁 0 오류 | T2/보호 콘텐츠 공개 |
| ⑧ 장애·보정·복구 경로 | reconciliation, 운영 이중 확인, alert/runbook | 누락 취소·중복 재처리·rollback·복구 훈련 | LIVE 켜기 |
| ⑨ 공개 승인 | 개인정보·법무·상거래·DB·보안·Product·운영 정식 서명 | 프로덕션 복구·배포·릴리스 게이트와 E2E 증거 | 모든 공개 및 실제 환불/회수 |

①~③은 기능을 끈 상태에서 먼저 작성·시험할 수 있다. ⑤~⑧도 테스트 전용 계정과 합성 자료로만 검증한다. **어느 단계도 ⑨를 자동 승인하지 않는다.**

## 14. 검증 계획 — 최소 시나리오 28개

### 접수와 공급사 진실성
- T01 정상 서명·정상 ID의 Cancelled, 실제 GET과 전액 일치 → 오직 SOURCE_VERIFIED.
- T02 위조 서명, 변조 body, 잘못된 timestamp → 접수 거부, DB 효과 0.
- T03 64KiB 초과/본문 지연/UTF-8 오류/GET timeout·redirect·과대 응답 → 안전 종료, DB 효과 0.
- T04 동일 webhookId 같은 사실의 중복/동시 전송 → 접수 1건, 권한 효과 0.
- T05 같은 webhookId 다른 payment/금액/지문 → identity conflict HOLD.
- T06 PartialCancelled→Cancelled 순서와 역순 수신, pending, 실패 취소 → 전액 아닌 사건은 회수 0.
- T07 store/환경/결제번호/거래번호 불일치 → 독립 조회 거부.
- T08 누적 SUCCEEDED 합계와 결제 취소액 불일치, cancellationId 누락/중복 → HOLD.

### 구매·심사
- T09 다른 Payment Attempt/Receipt/subject/Offer/Grant → HOLD.
- T10 Receipt 한 건에 두 Grant, 미결속 대상 미포함, 타 Product 범위 → 회수 0.
- T11 Verified Provider Event 없이 shadow만 존재 → 승인·회수 0.
- T12 배송 미증빙/내부 생성/T2 확정만 존재 → 단순 변심 자동 거절 0.
- T13 법정 하자·미제공·중복결제/가분 미개시 부분 → 별도 수동 법무 경로로 분류.
- T14 승인 없음/상거래만 승인/법무만 승인/두 reviewer 동일인 → 회수 0.
- T15 브라우저가 reviewer ID나 승인 flag를 조작해도 승인 발행 0.
- T16 승인 후 최신 취소사건·재조회 시각 만료·계약 범위 변경 → 기존 승인 재사용 0.

### DB 권한·동시성·효과
- T17 anon/authenticated/service_role/API/Commerce/Chat 직접 1080/구 취소/1880/새 게이트 실행 불가.
- T18 승인 발행 역할은 Entitlement DML 불가, 회수 실행 역할은 승인 INSERT 및 범용 Writer 호출 불가.
- T19 DB owner/migration 계정이 일반 runtime 연결에서 사용되지 않음; 긴급 예외 접근은 감사.
- T20 한 Grant 전액 취소 → 정확한 하나의 Entitlement Event/Grant·projection/outbox 원자 COMMIT.
- T21 취소 회수 중 의도적 장애 → 전체 ROLLBACK, 중간 Grant/Event/Outbox 잔류 0.
- T22 커밋 후 응답 유실·재시도 → 기존 결과 조회, 회수 이벤트 추가 0.
- T23 신규 Grant INSERT와 취소, bind와 취소, T2 read와 취소 **양방향** 경쟁: L0/L1 잠금 대기·최종 최신 권한 차단.
- T24 2 Product×여러 Reader 역순·세 실제 PG 세션 → 교착/임의 누락 없음, source drift는 전체 거부.
- T25 READ COMMITTED 외 격리수준·잘못된 Subject 컨텍스트·부분 실패 → 효과 0.
- T26 범용 채팅의 유료 본문 저장/캐시·유료 T2 우회/철회 후 재열람 → 0.
- T27 리포트·로그·감사 화면에 원문 개인사주/PG 비밀/유료 해설 노출 → 0.
- T28 운영 kill switch 중인 상태·미인가 배포·회수 중단·백업/복구 훈련 → 자동 실사용 회수 0.

검사는 전체 PostgreSQL 15, PostgreSQL 17, API 단위/통합, Governance, Web PR 변경 검사 및 권한 음성 시험을 **정확한 최종 커밋**으로 수행해야 한다. 기존 2026-10-13 CI는 오프라인 좁은 경로만 증명하고, 위 28개 시나리오를 모두 통과했다는 의미가 아니다.

## 15. 점진 전환과 되돌리기

- 1차: 문서·테스트·정적 호출자 목록만; 실판매, 환불, 회수 모두 OFF.
- 2차: 인증된 취소 사건을 **관측만** 저장하되 권한/고객 화면 변경 0. 기존 Paid 처리와 응답 회귀를 검증.
- 3차: 실제 운영 사실을 조회하더라도 shadow-only / 승인 미발급 / 회수 미실행. 누적 사건 중복·금액·ordering과 과거 취소·구매 데이터 차이를 계측.
- 4차: 합성 승인+가짜 PortOne sandbox 자료의 전용 게이트 E2E 및 2~3 PostgreSQL 세션 경합. Live merchant 사용 금지.
- 5차: 전체 정책/복구/서명된 소유자 승인 후에만 작은 실운영 범위의 별도 활성화 심사. **이 문서 자체로 실운영 켜지 않는다.**
- 중단 스위치: 취소 인입을 폐기하지 않으면서 회수 발행만 즉시 정지하고 수동 재처리 가능해야 한다. 이미 DB에서 COMMIT된 회수를 단순 배포 되돌리기로 복구한다고 주장하지 않는다.
- 롤백 순서: 새 회수 실행자 비활성 → 별도 승인 발행 중지 → 상태·Event/Grant 재조회 → 사고 대기열 기록 → 법무/상거래 승인 하에 별도 복구. DB 마이그레이션을 역으로 DROP해 정상 결제·공식 Reading을 파손하지 않는다.

## 16. 이 설계의 미결정 사항과 승인 담당

| 미결정 | 책임 주체 | 미결정이면 |
| --- | --- | --- |
| 실제 판매 SKU·구성/가분 단위·부분 환불 법적 판단 | Product + Commerce + Legal | LIVE checkout 및 부분 회수 HOLD |
| PortOne 재조회 증거의 fresh 기간/키 교체·실제 ordering 유효성 | Commerce + Security | 취소 원장에서 실행 승격 HOLD |
| 리뷰어 인증·이중 승인·서명/철회/위조 대응 | Commerce + Legal + Security | 1880 운영 INSERT 및 실행 HOLD |
| 신규 전용 role, DB 소유자 접근 정책, 게이트 소유권 | DB Owner + Security + Operations | 전용 회수 실행 권한 부여 HOLD |
| 소비자 실제 제공 증거·공지/체험 적합성·보존기간 | Legal + Privacy + Product | 자동 환불 거절·공개 판매 HOLD |
| 범용 Writer 전환·다중 Grant 모델·T2 정본 최신성 | DB Owner + Reader + Commerce + Chat | 유료 T2 및 전체 회수 적용 HOLD |
| 복구 절차·백업 증빙·사고 대응/온콜 | Operations + DB Owner | 운영 활성화 HOLD |
| 운영 배포·상품 활성화·인증된 결제사 계정 | 최종 Release Owner | 본 문서 및 모든 비공개 코드는 미병합·미배포 유지 |

## 17. 설계 완료 판정과 실제 구현 착수 기준

**이번 문서에서 완료해야 할 것:** ① 코드와 운영 상태 구분, ② 책임/신뢰 경계, ③ 단일 전액 회수 계약과 잠금·멱등·승인/개인정보, ④ 구 Writer 우회 감사와 전환 순서, ⑤ 테스트·복구/중단 조건, ⑥ 미결정/소유자.

**문서만으로 완료될 수 없는 것:** 실제 PortOne 취소 인입, 실 인증된 승인 원장 발행, 운영 최소 권한 게이트, 모든 Writer의 전면 cutover, 부분 환불, 제공 증빙·법무 고지, 실판매 승인, T2 유료 공개.

**착수 제안:** 가장 먼저 ① 실제 함수/역할·관리자 호출자 전수 목록을 코드로 자동 산출하고, ② 승인·회수를 호출하지 않는 취소 수신 모의 계약/영속 접수 설계와 테스트부터 병렬로 진행한다. 외부 운영 결제사 연결 없이도 위험도가 높은 미귀속 우회 Writer와 임의 승인 발행 경로를 먼저 줄일 수 있다.

### 근거 위치
- 이 설계의 기준 코드/시험: #2038, #2039, #2044, #2045, #2049 및 #2049 최종 CI https://github.com/gycha0109-beep/MyeongHa/actions/runs/38354271814
- 내부 통합 로드맵: docs/architecture/OFFICIAL_READER_PAID_CHAT_INTEGRATION_ROADMAP_20261012_V1.md
- 기존 Writer 잠금 감사: docs/architecture/OFFICIAL_READER_D1_WRITER_LOCK_ORDER_AUDIT_20261012_V1.md
- 국내 디지털 Reading 환불 고지 정책: docs/COMMERCE_DIGITAL_READING_REFUND_DISCLOSURE_POLICY_V1.md
- PortOne source verifier: apps/api/src/portone-v2-cancellation-source-v1.ts
- 핵심 DB: supabase/migrations/1840, 1850, 1860, 1870, 1880, 1890 (정확한 파일명은 각 마이그레이션 참조)

## 18. 첫 구현 단계: Writer 실제 호출·권한 조사 결과 (2026-10-14)

- [공식 리더 Writer 호출·관리자 우회 경로 1차 감사](./OFFICIAL_READER_WRITER_SURFACE_AUDIT_20261014_V1.md)에 1080/1090/1220/1760/1770/1780/1790/1820/1830/1850/1880의 호출 관계와 운영 역할 우회 여부를 별도로 기록했다.
- 누락된 이전 `1830`의 두 번째 **관리자 권한 취소 함수**를 포함해 비공개 함수 8개의 앱 계정 실행권을 `1900`에서 명시적으로 다시 차단하고, 실제 PostgreSQL 역할 전환 시험을 추가했다.
- 새 정적 검사로 미검토 원본 이용권 변경 함수 호출 파일이나 앱 직접 호출 경로가 추가되면 CI에서 검출한다. 단, 동적 SQL·DB 관리자 직접 작업 및 운영 배포 이미지 목록은 **정적 검사만으로 완결되지 않는다**.
- 코드·시험은 비공개 후보이며, 안전한 실제 취소 내구 수신과 별도 승인 서비스가 만들어지기 전까지 운영 회수는 활성화하지 않는다.


## 19. 비공개 관측 연결 후보 구현 (2026-10-14 / 운영 미연결)

- 이전 18절의 Writer 우회 차단 다음 단계: \`official-reader-portone-cancel-observation-bridge-v1.ts\`가 기존 서명 검증과 PortOne GET을 호출하고, 값이 일치한 사건만 기존 1860 private observation port로 전달한다. 코드 경계는 주입된 recorder까지만이다. 공개 엔드포인트, worker, 연결자 권한 및 새 보관 테이블은 만들지 않는다.
- DB owner로만 가능한 1860 호출의 SQL 매핑은 \`test/support/private-official-reader-cancel-recorder-v1.ts\`에만 있고, 애플리케이션 직접 호출은 1900 정적 검사로 계속 금지한다. 1860은 효과 권한을 항상 false로 반환하며 1080/1850/1880과 연결되지 않는다.
- source evidence fingerprint는 정본 검증 결과의 버전 고정된 필드를 SHA-256으로 묶은 **동일성 비교용**으로, 신원 검증·서명·익명화를 대체하지 않는다. 매번 독립 GET을 수행하므로 과거 같은 webhookId의 재전송 때 Provider snapshot이 앞서 달라졌으면 1860은 단순 replay가 아닌 conflict로 보류할 수 있다.
- 실패 경계: 검증/GET 실패와 저장 트랜잭션 실패는 성공 응답이 아니라 재시도 대상으로 남겨야 한다. 현재 helper 자체에는 HTTP ACK가 없으며, 영속 저장과 commit 이전 ACK를 허용하지 않는다.
- **미구현:** 웹훅의 단독 내구 inbox(조회 전), 개인정보 분류·보존/복원, 정본 역할 소유의 영속 실행 worker, 운영 권한 최소화, 공급사 source 조회/정산의 후속 시간 상태 관리, 승인자 실신원/서명, 별도 회수 실행자. 운영 연동/환불/권한 변경은 계속 금지.
