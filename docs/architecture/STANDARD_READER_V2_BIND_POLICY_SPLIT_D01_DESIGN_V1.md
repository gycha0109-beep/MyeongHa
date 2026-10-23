# D-01 / CAP-B — 일반 Standard Reader와 전문 Capability의 v2 결속 분리 상세 설계 v1

> 상태: SOURCE-REVIEWED / 설계 착수·실행 계약 초안 / Product·DB·Commerce·Reader 승인 HOLD / PUBLIC OFF
> Watchtower-Track: applizing
> 검증 기준 main `5ec469a89f89197eef2ef8df12cf8482b4d1a755` (2026-10-12); 미병합 #1999 HEAD `84e748565c5acd2b7f17f6ebe576add396d4ca36`, DB 계열 #1983→#1984→#1987→#1993→#1996.
> 관련 설계: #1823의 `MOBILE_READER_PRODUCT_CAPABILITY_CONSISTENCY_M3_BETA2B_DESIGN_V1.md` (대안 C: 조건부 권고), #1777의 범용화 계약, #1827, #1828, #1999.

## 1. 결정: 설계 방향은 존재하지만 DB 결속 실행 계약은 아직 미완료

- 확정된 제품 의미: 일반 공식 사주는 정식 Reader 9명 모두 **상품 적격성**을 가질 수 있다. 특정 Reader 한정은 추후 개별 승인 프리미엄에만 적용한다. 적격성은 출판·Unlock·구매·실행·공개 권한과 다르다.
- #1823이 기술 대안 C(승인 Product Rule과 전문 can_initiate 분리)를 권고하되, Product/DB/Reader 승인·DB 원본·계약 고정 이전에는 D(기존 gate 유지)로 HOLD하도록 명시했다.
- 현재 #1999는 Product×Spec×Domain×승인 revision의 append-only 비공개 조회 원본을 추가한 **미병합 후보**다. 승인 정책 행 0개, 결제/바인더 연동 0개. 기존 1720 scope 조회는 승인 정책이 아니다.
- 1220의 `cmd_bind_standard_reading_access_v2`는 verified Intent·Reader selection·verified production receipt·exact active Grant·현재 Birth revision·Saju domain 확인 후 `character_capabilities.can_initiate=true`를 일반/프리미엄 구별 없이 요구한다. 현재의 generic A1 Product Rule로 이 gate를 대체하지 않는다.
- 1220의 재실행 분기는 기존 access와 request_hash 비교 후 **현재 Grant/Product policy를 다시 검증하기 전에** `replayed=true`를 반환한다. 재실행 반환은 새 entitlement 증명이 아니다.
- v2 최초 결속은 Purchase Intent → Grant → Birth 행 잠금 후 Reading을 생성할 수 있다. S2 #1760은 **이미 존재하는 공식 Reading의 추가 Reader** 범위에서만 공통 잠금을 선행 확보하며, 최초 Reading·Commerce 환불/회수·기존 운영 호출자까지 보호하지 않는다.

**판정:** 대안 C의 제품·유형 설계는 존재하지만, 안전한 DB Writer 통합·잠금·정책 revision 증빙·replay 계약이 없어 바로 1220의 검사를 삭제하거나 신규 binder EXECUTE를 열 수 없다. 이 문서는 후속 DB 구현을 수행할 수 있도록 필요한 계약과 테스트를 고정하는 **검토 초안**이며 실제 변경을 승인하지 않는다.

## 2. 책임 경계와 불변 조건

| 검사 축 | 반드시 사용하는 authority | 절대 대신할 수 없는 것 |
|---|---|---|
| Canonical Subject | transaction-local DB subject context, 구매 소유 계보 | client subjectId, merged guest의 임의 승격 |
| Catalog/Content | exact Reader ID·content bundle·published default release·enable/availability·Unlock | Product Rule, can_initiate |
| Product Classification | **승인·유효·미철회·단 하나**인 Product/Spec/Domain/Rule/Revision | 상품 이름, A3 합성 proof, client tier |
| Specialist Capability | actual `character_capabilities(character_id,content_bundle_id,saju_domain).can_initiate` | 일반 Standard 적격성 |
| Commerce | verified Intent, exact production verified receipt, exact independent active purchase Grant, approved Offer/role | Product eligible, aggregate grant, replayed |
| Reading | Reader-independent official Reading/committed Saju Source Truth; 추가 Reader는 기존 Reading만 재사용 | Character 해설, 새 Saju 계산 |
| Admission/Reveal | 매번 exact current Grant, policy, Thread/Bundle/Source/Release; S2 공통 잠금/T2 | 과거 bind 결과, client preview, one-use A2 ticket |

**변경 불가:** Migration 1130/1150/1170/1220의 과거 식별자 및 provenance 재작성 금지. Character capability 행을 9×9 `true`로 변조 금지. Standard를 `productId` 문자열이나 `topicKey`에서 추론 금지. Product Rule만으로 판매/Grant/출력/공개 금지. 새 역할·SKU/Offer/유료 가격·정책 행 미승인 생성 금지.

## 3. 내부 판정 계약 (후속 구현 목표, 현재 실행 코드 아님)

입력은 client 값이 아닌 **서버가 서명 아닌 DB 원본으로 확정한** `subject`, `purchaseIntentId`, `productId`, `productSpecVersion`, `sajuDomain`, `readerCharacterId`, `readerContentBundleId`, `offerRole`, `effective DB time`이다. 동일 transaction 안에서 Product Rule은 #1999의 private approved DB source 계열로 재조회한다. SQL 자체에서 공식 Reader ID 검증을 해야 하며 TypeScript 9명 검사만을 방어벽으로 간주하지 않는다.

| 정책 결과 | 전문 can_initiate | v2 신규 결속 후보 | 이유 |
|---|---:|---|---|
| Product Rule 없음 / 미승인 / 만료 / 철회 / 중복 / 불일치 | 임의 | **DENY** | 기본 Standard 승격 금지 |
| 승인 `standard_all_readers`, 정확한 정식 Reader·Release·Unlock, 구매/Grant 조건 충족 | `false` 또는 행 없음 | **ALLOW 후보** | 일반 해설 적격성은 전문 기술과 독립; 아래 나머지 모든 gate 필수 |
| 승인 `standard_all_readers`, 구매·출판·Unlock·Saju 근거 중 하나라도 부족 | `true` | **DENY** | 정책 적격성만으로 권한 창설 금지 |
| 승인 `premium_restricted`, Reader allowlist 바깥 | `true` | **DENY** | 프리미엄 Reader 제한 우선 |
| 승인 `premium_restricted`, Reader allowlist 안 | `false`/행 없음 | **DENY** | 전문 Capability 결핍; Standard fallback 금지 |
| 승인 `premium_restricted`, allowlist 안 + 실제 전문 Capability | `true` | **HOLD** | Product·Commerce의 Premium SKU/실행 정책 별도 승인 전에는 결속 가능으로 확정하지 않음 |

Standard의 `ALLOW 후보`는 Product 정책 판단만을 뜻한다. 1220의 verified Intent/Receipt/Grant/Birth/Saju/role/official uniqueness 검사와 catalog·release·Unlock 등 **실제 결속 시점의 검증을 전부 통과**한 경우에만 내부 mutation으로 진행한다. 기존 v2가 선택 테이블을 읽는다는 사실만으로 현재 published/Unlocked가 고정됐다고 가정하면 안 된다. UI의 9 Reader와 9 Saju domain 합성 테스트 역시 실제 DB 결속 성공 증거가 아니다.

## 4. 권한 조회·쓰기의 정확한 위치 (DB 소유자 검토 사항)

1. **Transaction/Subject:** 명시적 DB transaction, canonical Subject, 허용 격리 수준. S2의 잠금 후 현재 조회는 `READ COMMITTED`만 증명돼 있다. `transaction_timestamp()`를 권한 회수 후에도 현재 시점으로 간주하지 않는다.
2. **공통 범위 식별:** 최초/추가 Offer role을 DB에 기록된 verified Purchase Intent·Reader selection으로 확정. 추가 Reader는 기존 committed official Reading 식별자를 소유 데이터에서 결정할 수 있어 #1760 후보 재사용 가능. 최초 official Reading은 아직 생성되지 않으므로 **잠금 키 도출 방법을 DB Owner가 먼저 확정**해야 한다. 사용자가 제시한 Proposed Reading ID를 권위로 삼지 않는다.
3. **Lock order:** 공통 Reader scope lock을 취득해야 하는 경로는 verified Receipt→Grant 발급, v2 Reader 결속, 환불/회수, T2 최종 저장이다. 모든 Writer가 scope lock을 **Purchase/Receipt/Grant/Birth 잠금보다 먼저** 획득해야 교착·팬텀을 막을 수 있다. #1760은 추가 Reader subset만 충족한다. 경합 테스트만으로 미참여 운영 Writer의 안전을 선언하지 않는다.
4. **Current provenance:** 잠금 후 새로운 SQL statement에서 verified Intent/Offer role/product/spec, exact receipt, purchase Grant, Reader/Bundle Catalog·Release·Unlock, Saju domain/current Birth revision 확인. active Grant 기간은 **잠금 대기 후 새 `clock_timestamp()`**로 평가하고 새 구매권 삽입·회수로 달라진 집합을 반영한다.
5. **Approved Product Rule:** 같은 DB transaction의 authoritative Product/Spec/Domain/Reader identity로 #1999 비공개 Product Rule을 다시 읽는다. 현재 1770은 최대 30초 범위의 timestamp 검사/미철회 행 조회일 뿐 승인 Writer와의 동시 철회 직렬화 계약을 제공하지 않는다. Product Owner는 해당 쓰기·철회 경합의 잠금/수명주기와 최신 조회 semantics를 승인해야 한다.
6. **Branch:** 일반 Standard는 전문 `can_initiate`만을 근거로 거부하지 않되 위 모든 조건을 요구한다. Premium은 specialist Capability를 계속 검사하고, 실제 premium 상품 승인이 없으면 fail-closed. 별도의 specialist 행동 API도 그대로 기존 권한을 요구한다.
7. **No mutation before allow:** 정책 조회 오류·중복 revision·권한 검증 실패면 `standard_reading_official_bindings`, `standard_reading_reader_interpretations`, `standard_reading_reader_access_grants`, `readings`, `reading_sessions` 새 기록 0. 실패 시 transaction 전체 rollback.
8. **Replay:** 동일 request_hash의 `replayed=true` 응답은 immutable binding history만 의미한다. 현재 Grant/Rule/Release가 취소됐다면 **권한 성공을 반환하지 않는다**는 별도 API 계약이 필요하다. 기존 historical audit rewrite 금지.
9. **Persisted policy provenance:** policy approved revision을 정확한 Purchase/Bind lineage와 함께 어떻게 보관할지 미결정. 승인 없이 access 테이블에 컬럼/sidecar 생성 금지. 미래 부가 이력은 append-only + exact intent/access FK + 개인정보 삭제/복구 분류를 만족해야 한다.
10. **A2/A3/T2:** bind 시 허용됐다는 사실은 후속 Chat/재열람 허용이 아니다. 유료 생성 직전(T1), 공개 직전 원자 확정(T2), 후속 조회마다 현재 exact Grant·Product Rule·Thread/Bundle/Source/Release를 별도 검사한다. AI 호출/부분 스트리밍을 잠금 거래 안에 넣지 않는다.

## 5. 실제 Writer 변경 착수 전 선행 결정을 요구하는 사항

| ID | 필수 결정 및 책임 | 현재 상태 / 왜 막히는가 |
|---|---|---|
| DEC-1 | **Product+Commerce:** 1770 승인 revision 삽입/철회 권한, 정확한 Standard vs Premium 분류와 출시 가능성 | #1999 DRAFT, 승인 policy row 없음 |
| DEC-2 | **DB+Commerce:** 초기 Reading의 안정적 공동 잠금 키, 모든 Receipt/Refund/Grant Writer 채택 및 lock order | #1760은 추가 Reader subset, 초기/환불 writer 미연결 |
| DEC-3 | **DB:** v2 replay에 현재 Grant/Rule 재검사 책임을 둘지, 호출자에게 historical-only로 분리할지 | 현행 replay가 authorization 재검증 전 반환 |
| DEC-4 | **Product+DB:** 승인/철회 경합과 policy revision provenance pinning, 현재 시각 확정 | 1770 read는 동시 writer 직렬화 증거가 아님 |
| DEC-5 | **Content+Character+DB:** v2 bind 시 current published release/unlock 검증의 단일 authority | 1150 선택과 1220 결속 시점의 drift 검증 계약 미결정 |
| DEC-6 | **Reader+Commerce+Legal:** Premium specialty 실행 허가, current Grant revoke/Refund T2 확인과 제공 고지 | Premium 구매/공개 미승인, 공개 OFF |

이 결정이 없으면 대안 D(기존 Capability gate 유지 / 미승인 정책 DENY)가 안전한 현행값이다. 본 문서·향후 테스트의 녹색 결과만으로 소유자 결정을 대신하지 않는다.

## 6. 변경 요청/마이그레이션 분할 및 의존 순서

- **CAP-B0 (이 PR):** 정확한 Writer·정책 분기·잠금·리플레이 설계와 거절 테스트 매트릭스. Docs only, public/purchase/Grant/SQL 불변.
- **CAP-B1 Product source:** #1999 기술 승인, 누락된 policy writer/withdrawal 동시성 계약·ACL·Provenance 설계 확인. 운영 승인 정책 행은 별도 결정 전 0개.
- **CAP-B2 DB locked binder:** #1983→#1996 S2 소유자가 실제 결속/발급/회수 Writer의 모든 관련 범위를 통합한 뒤, *새로운 forward-only migration*에서 일반/전문 Reader gate 분기. migration 번호는 의존 PR 충돌을 확인하고 **실제 작성 시 배정**하며 1220 원본을 덮어 고치지 않는다. Direct v2 실행권한을 실수로 열지 않는다.
- **CAP-B3 Proof:** PG15/17 독립 접속의 lock acquisition/phantom/revoke/withdraw, verified synthetic receipt, exact Grant, Standard no-specialist 긍정 및 Premium/Unknown 부정, idempotent replay, new official Reading identity 보존.
- **CAP-B4 API/Reader admission:** 동일 승인 policy revision 계보와 current Grant를 A2/A3/T2로 결속. 현재 Customer/Public Reader/Checkout OFF, Price·Offer·환불 자동 거절 OFF.
- **CAP-B5 Operations:** migration frontier/DR restore/revoke recovery 등 운영 증빙과 Product·DB·Commerce·Reader·Privacy·Release 승인 이후에만 merge/deploy/live 별도 결정.

## 7. 병합·개발 승인 분리

- 이 문서 PR은 실제 정책 승인 아님. 정책 행 삽입·마이그레이션·결제·API 공개·출처 Raw 접근·Reader 응답 저장·환불 정책 변경 없음.
- 설계 검토에서 DEC-1~6 담당자를 명시하고 실행 기준에 서명/승인하기 전에는 v2 bind SQL gate를 치환하는 PR을 만들더라도 **Draft/never deploy**로 유지한다.
- 기존 운영 DR Readiness/Isolated Restore 실패, #1960의 1720 migration 충돌, stacked S2 #1983~#1996 미병합 상태에서는 운영 migration 및 유료 공개 금지.
- 테스트 상세: `STANDARD_READER_V2_BIND_POLICY_SPLIT_D01_TEST_MATRIX_V1.md`.

## 8. 다음 기술 구현의 완료 기준

기술 B: 정식 승인 Product Rule이 없는 실행은 0 bind; 허용 Standard는 전문 can_initiate 행 없이도 **정확한** Receipt/Grant/Release/Unlock/Reading 검증 후 오직 일반 해설만 결속; Premium이나 전문 행동은 우회 불가; 2-connection race, replay, revoke, duplicated rules와 모든 독립 Grant 모호성 모두 실제 PostgreSQL PASS.

출시 C: 별도 Product/Commerce/DB/Reader/Privacy/Legal/Release 승인 및 현재 운영 복구 증빙이 확인된 경우에만 공개 결정을 검토한다.