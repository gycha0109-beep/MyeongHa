# M3-β-2b / D-02 — Final Authorization 잠금·회수 동시성 실행 설계 v1

> 상태: 코드 근거 자기 검토 / DB·Commerce·Reader·API Owner 승인 전 설계 후보 / Reader Public OFF
> 최신 비교 기준: main 2ec39bc55a08b38b625bbc2ec10382b2341a9d58 (2026-10-10)
> 관련: Draft #1823, DB 이슈 #1827, 기존 #1831 revoke replay 회귀, #1838 Capability missing 회귀.
> 기존 상위 문서: MOBILE_READER_GRANT_REVOKE_REVEAL_CONCURRENCY_M3_BETA2B_DESIGN_V1.md
> 본 문서는 새 SQL migration/API/public route/유료 상품 권한을 만들거나 승인하지 않는다.

## 1. 코드로 검증된 경계와 미구현 영역

| 위치 | 현재 근거 | 아직 보장되지 않는 사실 |
| --- | --- | --- |
| migration 1080 internal_apply_entitlement_effect_v1 | Provider/Receipt 기반 Grant를 FOR UPDATE하고 revision/ordering CAS로 상태 변경 | Reader 최종 해설 공개와 하나의 선형화 시점 공유 |
| migration 1220 cmd_bind_standard_reading_access_v2 | 구매 Grant FOR UPDATE → 변경된 자격 재검증 → Birth profile 잠금 뒤 official Reading/Reader access 결속 | 나중에 Reader 결과를 공개할 때의 최신 Grant를 보증 |
| migration 1270 qry_character_standard_reading_access_runtime_v2 | 현재 active purchase Grant를 effectiveAt에 따라 필터링, 다른 bundle은 별도 row | 조회 이후 회수까지 차단하는 row lock 또는 phantom insert 차단 |
| apps/api/src/reader-interpretation-preview-postgres-execution.ts | V1 Preview 실행이 executePostgresSubjectTransactionV1의 awaited callback 안에 존재 | Provider 실행 중 DB connection lease 종료/Final T2 권한 재확인 |
| apps/api/src/reader-interpretation-preview-runtime-v2.ts | 내부 A3 V2에서 A2 두 번 검사하나 동일 effectiveAt을 재사용 | 외부 Saju projection 이후 fresh clock/Grant 재검사, paid public ingress |
| PostgreSQL #1831/#1838 | 과거 바인딩 replay 후 Reader A 회수 차단, 필수 Capability 행 부재시 DB bind 차단 검증 | 환불과 외부 생성 사이 실제 PostgreSQL 동시성 |

핵심 구분: 과거 구매 바인딩 사실, 최초 Reader 접근, Saju source 열람, 임시 발화 생성, 최종 발화 공개는 **서로 다른 시점의 권위**이다.

## 2. 승인받을 선형화 정책

**후보 정책 L1 — T2 commit 선형화:** 최종 권한 확인과 해설 결과 공개 자격의 결정 시점을 T2 COMMIT 성공으로 둔다. 환불/revoke가 T2보다 먼저 commit되면 결과는 DENY. T2가 먼저 모든 필요한 권한을 잠그고 commit하면 해당 요청의 결과 공개는 허용할 수 있고, 뒤이어 commit된 revoke는 미래 신규 요청/재열람을 차단한다. 이는 이미 보낸 내용을 서버가 되돌릴 수 있다는 주장이 아니다.

**결정이 필요한 곳:** Commerce·Product·Legal·DB·API가 T2 commit과 실제 HTTP 송신 사이 회수의 의미, 결과 캐시/재열람, Provider 비용 처리 및 결과 기록 여부를 승인해야 한다. 사용자 환불 약관과 충돌하면 다른 L2 선형화 프로토콜이 필요하다. 승인 전 유료 Reader 공개 HOLD.

## 3. T1 / 실행 / T2 / 응답 4단계

### T1 — 짧은 Subject transaction

- 검증된 identity에서 canonical Subject와 owned single-Reader Thread를 서버가 조회.
- rollout/cohort OFF 시 raw official artifact와 Provider 호출 전에 즉시 DENY.
- 정확한 Official Reading, Reader, Product Rule, immutable Source hash, Reader bundle/contentRevision/release, 현재 purchase Grant 확인.
- T1 시점에만 유효한 불변 서버 내부 실행 packet을 만든 후 COMMIT/connection release.
- packet을 클라이언트에 전송하지 않으며 A2 proof 또는 과거 allowed 캐시를 영구 권한으로 취급하지 않음.

### EXECUTE — DB transaction 밖

- 이미 허용된 official source와 pinned release에서 protected Saju grounding, bounded renderer, semantic guard를 수행.
- 모든 응답과 fallback은 pending/private. 먼저 HTTP 스트리밍/클라이언트 전송 금지.
- Provider timeout, retries, duplicate cost, server crash/restart 처리 정책은 Runtime/Commerce owner 책임.
- 이 단계에서 Grant가 revoke돼도 임시 발화는 다음 T2에서 폐기 가능해야 함.

### T2 — 새 canonical Subject transaction

1. 새 DB connection과 transaction에서 SET LOCAL ROLE, verified identity, canonical Subject 및 current rollout을 **새로** 검증.
2. 현재 Subject×Official Reading×Reader의 Grant/access provenance와 source/release identity를 조회. T1 effectiveAt 복사 금지.
3. 아래 4장의 **공통 잠금 프로토콜**에 따라 정확한 후보 Grant와 scope anchor를 잠금. 단순 SELECT는 최종 승인 증명이 아님.
4. 잠금 획득 **후** 새 DB clock으로 Grant active/effective window, 다른 active bundle 여부, committed Reading response hash, 현재 Thread/Content/Policy revision을 재조회.
5. 하나라도 mismatch, zero Grant, two different active bundle, policy withdrawn, Subject 변경, source drift → ROLLBACK/DENY. Pending 발화, 보호 fallback도 공개하지 않음.
6. Paid 결과의 영속 기록은 Records owner가 별도 승인한 계약이 있을 때만 동일 트랜잭션에서 원자적으로 commit. 현재 Preview를 paid result로 변경하지 않음.
7. T2 commit 성공 이후에만 정확한 Reader·Reading·domain·source hash에 결속된 단일 결과를 응답으로 내보냄. DB timeout/deadlock/commit 오류는 fail closed.

### RESPONSE — 모바일 결속

- 앱의 기존 Reader·Reading·domain strict response binding과 현재 Subject/session nonce 검증 적용.
- 로그인 전환/화면 종료 후 오래된 결과를 표시하지 않음.
- HTTP 송신 실패 후 재시도는 새로운 실행권 허가가 아니며, Paid idempotent archive/fulfillment는 별도 승인 필요.

## 4. 잠금 정책 후보와 잔여 위험

| 후보 | 효과 | 적용 조건 |
| --- | --- | --- |
| R0: 기존 stable access query 두 번 | revoke가 T2 조회 이전에 commit된 경우 DENY | **불충분**. 조회 직후 회수·새 bundle 편입 경쟁 |
| R1: T2에서 정확한 Grant row들을 FOR SHARE 등 UPDATE와 충돌하는 잠금으로 보호 + 잠금 뒤 fresh DB clock 재조회 | 기존 Grant UPDATE/환불과 T2를 짧게 직렬화 | 새로운 Grant/bundle INSERT의 phantom은 차단 못함 |
| R2: R1 + Subject×Official Reading×Reader에 대한 안정된 공동 직렬화 anchor를 bind·Grant 변경·T2가 모두 준수 | 기존 row revoke와 신규 Reader bundle 추가 경합까지 직렬화할 수 있는 후보 | **조건부 추천**. 공통 row/lock order/권한/모든 writer 수정 필요. 미구현 |
| R3: SERIALIZABLE 단독 적용 | 일부 충돌 탐지 가능 | 모든 writer·retry/HTTP side effect 정책 없이 공개 선형화 보증 불충분 |

### Lock을 실제로 설계할 때 반드시 해결할 것

- 이미 존재하는 entitlement_grants row 업데이트는 기존 Commerce internal_apply_entitlement_effect_v1의 FOR UPDATE/revision CAS와 경합한다. T2의 FOR SHARE 계열 잠금은 **후속 UPDATE를 대기시킬 수 있지만**, lock 이전/이후 현재 상태를 재조회해야 한다.
- **동일 Reader·bundle의 복수 독립 Grant:** source receipt와 purchase_intent_id를 합치지 않는다. 적용 가능한 각 Grant row를 정해진 ID 정렬 순서로 잠그고, 한쪽 revoke 후 나머지 active가 있는지 재조회한다. 서로 다른 bundle이 동시에 active이면 exact-one 기준 DENY.
- **신규 Grant/bundle phantom:** 기존 entitlement row들을 잠가도 새 Reader access row 삽입까지 막을 수 없다. 안정된 공유 anchor(기존 logical official Reading / Reader interpretation 관련 권위 또는 DB Owner가 승인한 동등한 동시성 gate)를 bind·refund/revoke·T2가 동일한 전역 순서로 준수해야 한다.
- **교착 위험:** 현 v2 bind는 구매 Grant를 잠근 뒤 Birth aggregate를 잠근다. T2만 임의로 Reader/Reading anchor를 먼저 잠그면 기존 writer와 교차 deadlock이 날 수 있다. 정확한 lock order는 관련 DB 함수와 전역 writer를 대조해 DB Owner가 최종 승인.
- **시간:** transaction_timestamp()는 트랜잭션 시작 시각에 고정된다. 긴 lock wait 후 시한이 지난 Grant가 과거 effectiveAt으로 통과하지 않도록 잠금 획득 후 clock_timestamp() 등 현재 DB clock 사용을 검토. valid_from <= now < valid_until을 재평가하고 statement/lock timeout을 별도 적용.
- **액세스 제어:** 기존 runtime은 transaction-local myeongha_api_executor/RLS/SECURITY DEFINER wrapper를 사용한다. 일반 앱 클라이언트의 entitlement_grants 직접 SELECT/LOCK 허용 금지. 신규 server-only authority로 봉인하고 public EXECUTE 권한, search_path, error information leakage를 검사.
- **실행 증거:** 위 R1/R2는 설계 후보. 이미 코드에 구현돼 있거나 잠금 방식이 실제 안전하다는 뜻은 아니다.

## 5. 경합 순서에 따른 권위 판단

| 상황 | 최초 실행 T1 | T2 전에 일어난 변화 | 정책 후보 L1의 기대 결과 |
| --- | --- | --- | --- |
| CASE-A | 승인 | 환불·revoke COMMIT 후 T2 | T2 DENY, 임시 발화 공개 0 |
| CASE-B | 승인 | T2 row+scope lock 선점, 그 뒤 refund 시도 | refund가 필요한 잠금을 대기. T2 commit 전 취소 commit 안 됐다면 요청은 T2 기준 승인 후보, 이후 신규 조회는 DENY |
| CASE-C | 승인 | refund가 row lock 선점한 동안 T2 진입 | T2 wait 후 새로운 active 상태 재조회. revoke가 먼저 commit이면 DENY |
| CASE-D | 승인 | lock 기다리는 동안 Grant validity 만료 | lock 획득 후 DB clock으로 만료 확인. T2 DENY |
| CASE-E | 승인 | Grant A/B 중 A revoke, 동일 Reader/bundle에 B active | B는 독립 source로 유지. 모든 승인 조건 충족하면 T2 허용 후보 |
| CASE-F | 승인 | 서로 다른 active bundle의 새 Reader Grant bind | 공유 scope lock과 fresh bundle set 없으면 위험: 운영 HOLD |
| CASE-G | 승인 | source response hash/Thread revision/Policy 철회·Subject 변경 | T2 scope mismatch/DENY |
| CASE-H | 승인 | T2 COMMIT 다음 HTTP send 직전 revoke | Product/Legal/Commerce가 정의할 L1 결과. 이미 송신된 본문 회수 불가능 |

## 6. PostgreSQL 실제 경합 검증 계획

### 기존 CI 인프라 재사용

- test/db/run_authority_core.sh 안의 run_isolated_case와 test/db/official_standard_reading_reader_interpretation.sh fixture를 재사용.
- test/db/entitlement_projection_recompute_concurrency.sh 와 test/db/life_fact_grant_revoke_concurrency.sh 는 독립 두 psql 연결/lock wait/결과 검증 선례.
- PostgreSQL 17 격리 DB에 synthetic verified receipt+exact Grant+committed official Reading을 생성. 외부 PortOne/Saju 호출 0.
- 두 개 이상 psql -X -v ON_ERROR_STOP=1 session, test-only barrier/synchronization, lock_timeout 및 전체 프로세스 cleanup. 임의 sleep만으로 interleaving 성공 주장 금지.
- R1/R2 도입 전에는 **현재 DB 동작의 한계/재현**과 원시 SQL 권위 확인만 테스트. 미승인 server final authorization function을 가정해서 그 기능 PASS를 주장하지 않는다.

### 검증 게이트 및 분리 PR

| ID | 내용 | 예상 PR/담당 | 현재 |
| --- | --- | --- | --- |
| DB-C0 | revoked bind replay는 현재 권한 아님, Reader A DENY/Reader B 허용 | #1831 / db-authority-core | 범위 한정 PASS |
| DB-C1 | 같은 Reader/Reading/bundle의 독립 active Grants 둘, B1 revoke 후 B2 유지, 전부 revoke 시 deny | #1854 / db-authority-core | **실제 Postgres PASS / merged b18e6c15** |
| DB-C2 | 서로 다른 active bundle 둘은 DB 메타데이터 2행으로 유지, 한 bundle revoke 뒤 단일 행 복구 | #1854 / db-authority-core | **DB SQL 2행 PASS**. 애플리케이션 exact-one reject의 새 E2E는 별도 |
| DB-C3 | T2보다 revoke commit 우선, revoke lock 우선, T2 잠금 우선 양방향 경합 | 승인 R1/R2 server-only function + 두 PostgreSQL connection | 정책·구현 HOLD |
| DB-C4 | 신규 bundle insert와 T2 공개 판단의 phantom 경합 | DB Owner 승인 shared scope anchor 및 모든 mutation writer 수정 | 정책·구현 HOLD |
| API-C1 | T1→원격 fake Saju wait→T2, provider await 중 DB pool lease 0 | Reader/API Runtime 별도 PR | 구현 HOLD |
| API-C2 | Fresh clock/Subject/Source/policy/release 검증 및 client stale response 폐기 | Reader/API + 모바일 계약 검증 | 구현 HOLD |
| RELEASE | Web checkout→receipt→Grant→Reader result→refund→re-read, kill switch | Product/Commerce/Saju/QA | 운영 HOLD |

DB-C1/C2는 #1854로 격리 PostgreSQL 범위에서 검증·병합 완료. 별도 synthetic verified receipt+독립 purchase Grants가 유지되며 Source Truth/과거 바인딩 불변. **DB-C2의 2행은 DB에서 모호성을 드러내는 결과이지 DB 단독 DENY가 아니다**. 실제 A2 exact-one 선택은 서버에서 거부하도록 기존 로직이 구현돼 있지만, #1854는 해당 서버 통합 E2E까지 새로 검증하지 않았다. DB-C3/C4는 Owner가 선형화 정책과 모든 writer 잠금/ACL 계약에 서명하기 전 SQL 마이그레이션을 시작하지 않는다.

## 7. 부정 테스트·출시 금지

- 기존 Product standard.love_relationship 활성화·Offer/Charge Terms·PortOne 결제·Grant 발급 운영 승인은 아직 확인되지 않음.
- Product-approved standard_all_readers와 DB can_initiate 경계도 #1828에서 별도 HOLD.
- 공개 API, Vercel rewrite, Native Reader publicRouteActivated, paid 결과 저장, Chat 해금, 기존 migration rewrite 금지.
- 로그에는 Subject/Reading/영수증/사주 raw source/Reader 전문 발화 원문을 남기지 않는다.
- Test fixture PASS는 LIVE 환불·공개 선형화 보증, 결과 공개 승인, 실제 9 Reader 구매 가능성을 증명하지 않음.

## 8. A/B/C 종료

A. 실행 가능한 lock/linearization 후보·DB-C1~C4 테스트 설계 작성: **SELF REVIEW PASS**. DB/Commerce/Reader/API/Legal 합의: **HOLD**.
B. #1831·#1838·**#1854(DB-C1/C2)** 범위 한정 DB 회귀 PASS. DB-C3/C4, short T1-T2/Final reveal 구현·실경합은 **HOLD**.
C. 실판매·환불/권한회수·Saju Production·Reader 공개/rollback 실제 E2E: **HOLD**.

본 문서는 코드가 아니라 owner 검토용 설계이며, 어떤 실제 동시성 테스트 실행도 주장하지 않는다.
