# M3-β-2b / D-01·D-02 — Product·Commerce·DB exact Reader Grant 계약 설계 v1

> Status: SOURCE-REVIEWED DESIGN / OWNER APPROVAL HOLD / PUBLIC OFF
> Baseline: MyeongHa main 0b82b3f157b052c7110c9b4c7f5d5a1874918929 (2026-10-09)
> No API, catalog, sale, database migration, product approval or activation change.

## 1. 결론 — 신규 Grant 테이블을 만들지 않는다

명하 v2에는 **Reader-independent official Reading**과 **exact purchase-backed Reader access**의 관계형 authority가 이미 있다.

- Commerce: purchase_intents + purchase_intent_reader_selections + verified commerce_receipts → independent entitlement_grants.
- Official Reading: standard_reading_official_bindings — Subject/Product/Scope/immutable Birth revision/spec/domain capability로 재사용 identity 고정.
- Reader explanation: standard_reading_reader_interpretations (official_reading_id, reader_character_id) logical identity. Saju Source Truth와 별도.
- Reader access: standard_reading_reader_access_grants — purchase_intent_id PK, entitlement_grant_id UNIQUE; exact Subject, official Reading, Reader, bundle와 receipt-backed grant 연결.
- Current read: qry_character_standard_reading_access_runtime_v2 (bundle-aware metadata) 및 qry_standard_reading_artifact_source_runtime_v1 (서버 전용 raw official source).

이 모델을 **재사용**하고 Product rule·Grant 발급·Reader 공개 계약의 누락을 해결한다. 모바일에 별도 Grant 계층을 신설하거나 public DB authority를 개방하지 않는다.

## 2. 기존 구현 증거

| 파일 | 이미 존재하는 권위 | HOLD 또는 독립 검증 |
| --- | --- | --- |
| migration 1130_standard_love_relationship_reader_authority.sql | immutable Standard Product spec과 sparse Purchase Intent Reader selection | v4 purchase command public 활성 여부 별도 |
| migration 1170_standard_reading_unit_binding_authority.sql | 기존 Reader-bound 단위 바인딩 | 역사 보존. 새 Reader의 official Reading 생성 경로로 재사용 금지 |
| migration 1220_official_standard_reading_reader_interpretation_authority.sql | official Reading/Reader logical identity/access grants, v2 bind command, Receipt/Grant lineage | 새 실판매 Offer, Saju Production 생성, public grant 활성 없음 |
| migration 1240_character_standard_reading_knowledge_runtime_authority.sql | transaction-local canonical Subject용 metadata/artifact server wrapper | 원본 클라이언트 공개 금지 |
| migration 1270_reader_interpretation_access_bundle_runtime_authority.sql | bundle-aware distinct rows로 모호한 bundle를 상위 호출자가 차단 | multiple active bundle 선택 금지 |
| migration 1080_entitlement_effect_apply_v1.sql | verified receipt와 independent grant/effect/projection 경계 | 실제 Provider live receipt→fulfillment admission은 별도 |
| apps/api/src/official-reading-reader-admission-v1.ts | server-only metadata→Product rule→official artifact→Thread pin→one-use proof | Product policy의 승인된 Production adapter, revoke race / 운영 권한 별도 |
| apps/api/src/reader-interpretation-preview-postgres-execution.ts | canonical Subject transaction + activation + explicit Product reader rule port | 해당 Port 미주입이면 fail-closed; public OFF |

Migration 1170 legacy Reader-bound Reading identity를 다시 도입하거나 migration 1220의 immutable 이력을 rewrite 하지 않는다.

## 3. 실제 첫 Product의 출시 경계

| 항목 | 결정문 상태 |
| --- | --- |
| 후보 Product | standard.love_relationship |
| Saju intent | relationship / natal / general |
| Capability entitlement_key | reading.standard.love_relationship.unit.v1 |
| Reader | Topic SKU에서 분리; 구매 Intent에 선택한 Reader를 pinned |
| Product Owner 정가 | KRW 8,900 (Offer 가격 또는 결제 청구 승인 아님) |
| Product enabled / Offer / Charge Terms | false / 없음 / 없음 |
| P0-CM-03 | OPEN-P0 |
| 출시 결제 rail | Web one-off, PortOne V2 선정; 실제 Live merchant/checkout 별도 |
| Production Saju interpretation | upstream BLOCKED 기록 / 별도 최신 운영 증거 필요 |

추가 Reader의 할인율·가격·유효기간·환불/재열람 정책은 확정하지 않는다. Native checkout/자동 PortOne 이동도 이 계약에 포함하지 않는다.

## 4. 서버 실행 계약 — 설계 검토용 (신규 API 제안 아님)

### 4.1 최초 구매·Reader 설명권

1. Canonical Subject와 approved initial_reading Offer를 서버에서 확정한다.
2. Product와 분리된 Reader selection (Reader Character ID / exact bundle)을 immutable Purchase Intent와 결합한다.
3. Web PortOne V2의 server-verified production receipt만 fulfillment 입력으로 취급한다. Callback/Webhook hint 자체는 결제 확정이 아니다.
4. Receipt 고유 provenance에 대한 independent Entitlement Grant를 생성/재생 처리한다.
5. v2 bind command는 verified Intent, exact Offer, production receipt, active purchase Grant, Reader selection, Product spec을 확인한다.
6. 동일 exact official Reading이 없으면 단 한 번 PENDING Reading/session을 만들고 Reader logical identity + access provenance를 생성한다.
7. Saju production-authorized 생성/commit이 완료되어야 그 official Reading이 source로 재사용 가능하다.
8. Reader 해설 실행은 **매번** 현재 Reader Grant/Source/Rule/Thread/Release를 재확인해야 한다. bind 성공 결과는 무기한 access pass가 아니다.

### 4.2 추가 Reader 구매·재사용

1. 별도 승인된 additional_reader_interpretation Offer 및 별도 verified Receipt/Grant가 필요하다.
2. 현재 Subject/Product/topic/Scope/Birth revision/spec/domain capability에 맞는 **기존 committed official Reading**을 조회한다.
3. 기존 Reading이 없거나 Saju artifact commit이 안 되었으면 추가 Reader 생성/결제를 통한 새 Reading 우회 금지.
4. 다른 Reader의 logical interpretation + independent Reader access provenance만 추가한다.
5. Official Reading ID, Saju Source Truth, version/hash는 바꾸거나 재계산하지 않는다.

같은 Reader의 다수 독립 구매, 서로 다른 content bundle 충돌은 Product/Commerce/DB owner가 정확히 정책을 확정하기 전 HOLD.

### 4.3 실행 시점 권한 조회·A2/A3

canonical transaction-local Subject
→ owned single-Reader Thread와 pinned bundle/release
→ qry_character_standard_reading_access_runtime_v2(subjectId, readerId, effectiveAt)
→ readingId exact 1 row/bundle
→ Product/Commerce approved productId/spec/domain rule
→ exact artifact runtime source, delivered/version/hash parity
→ Thread/source/release 재검증
→ 서버 전용 one-use A2 proof
→ A3 Saju semantic guard/approved Reader response.

다른 Reading/Reader/Subject의 existence 정보가 노출되어선 안 된다. Archive 화면, readerCharacterIds, Char Unlock, 과거 UI 'allowed', aggregated entitlement, Chat Thread 존재 자체는 Grant가 아니다.

## 5. SQL 접근권 predicate — 설계 수용 조건

- subject_id는 canonical transaction의 신뢰 원천에서만 결정. 기존 direct merged-Guest 읽기 lineage를 보존하고 immutable owner를 재작성하지 않음.
- access_grant의 official_reading_id + subject_id + reader_character_id + reader_content_bundle_id를 정확히 결속.
- access_grant의 entitlement_grant_id는 같은 Subject의 **purchase-backed** Grant를 가리킬 것.
- active 조건: grant_source_type='purchase', status='active', valid_from <= effectiveAt, valid_until IS NULL OR valid_until > effectiveAt.
- verified receipt ↔ Purchase Intent / approved Offer lineage는 **발급 시점** 정확히 증명. 정책이 요구한다면 실행 시 source provenance도 추가 교차검증한다.
- delivered official Reading의 committed_execution_attempt_id, reading_refs.contract/version/responseHash를 확인. Raw artifact는 approved Product rule 전에 접근 금지.
- ProductReaderEligibilityAuthorityPortV1의 Production approved rule 없으면 Unknown/Disabled/Malformed/Error 모두 HOLD.
- Client가 Reader ID, Product Rule, Admission Ticket을 전송해 권한을 발급하도록 하는 경로 금지.

## 6. 경합·모호성 — 승인 전 반드시 해결

**R1. 같은 Reader 복수 유효 Grant:** access_grants는 Purchase Intent마다 여러 행 가능. migration 1270 조회의 DISTINCT는 같은 bundle 행을 합치지만 다른 활성 bundle은 별개 행으로 유지한다. A2 exact-one 조건에 따라 다중 bundle은 거부; 임의 최신 bundle 선정 금지. 같은 bundle의 두 Grant 중 하나 revoke해도 다른 유효 Grant가 있으면 access 유지해야 함.

**R2. v2 bind replay:** cmd_bind_standard_reading_access_v2의 existing-access 분기는 immutable provenance를 replayed=true로 반환한다. 이 분기에서 current Grant active 상태를 다시 검사하는 코드는 확인되지 않는다. **Replay 반환을 현재 paid access/fulfillment 성공 증거로 사용하지 않는다.** DB owner는 호출자와 replay 계약을 검토하고 negative test를 확정해야 한다.

**R3. Reader Capability 정책 충돌:** cmd_bind_standard_reading_access_v2는 character_capabilities.can_initiate와 exact domain 검사 구문을 사용한다. A3 V2의 Product-approved 일반 Reader 범용화는 specialist Capability 위조 없이 동작한다. DB/Product/Reader owner가 둘의 양립 여부를 결정해야 하며, 기존 검사를 조용히 제거하거나 Character capability 객체를 합성하지 않는다.

**R4. Refund/revoke race:** A2 one-use proof만으로 외부 Saju/LLM 대기 중 회수된 권한의 reveal race가 해결된 것은 아니다. DB/Reader owner는 lock order, isolation, final disclose 전 재검증, timeout 및 transaction 안 원격 await 정책을 결정하고 interleaving을 테스트해야 한다.

**R5. 동시 최초·추가 Reader 구매:** Official identity UNIQUE 및 locked Intent/Grant/Source mutation 경계를 기준으로 Race 테스트. 하나의 공식 Reading identity로 두 생성이 가능해져서는 안 된다. 다른 request_hash는 immutable conflict, 동일 hash는 replay 시 신규 발생 행 0.

**R6. Reader artifact 저장:** standard_reading_reader_interpretations는 logical identity일 뿐 유료 Reader 발화 원문 저장소가 아니다. migration 1530 character_reading_artifacts는 face_governed_reading을 대상으로 한다. Reader 결과의 persist/re-read와 Chat 권한은 Records/Reader owner의 별도 검토가 필요하다.

## 7. 테스트 요구사항 (미실행)

| ID | 입력·상태 | 기대 |
| --- | --- | --- |
| GRANT-01 | 미결제/미검증 receipt/unknown Offer | Reader grant/access 0, raw artifact 0 |
| GRANT-02 | exact verified production receipt + initial_reader Offer | 1 Intent → 1 source Grant → 1 Reading → 1 Reader access |
| GRANT-03 | 추가 Reader Offer + committed official Reading | Reading 증가 0, Reader access +1, Saju 재계산 0 |
| GRANT-04 | 추가 Reader Offer지만 committed source 없음 | DENY; 새로운 Reading 생성 0 |
| GRANT-05 | cross-Subject/cross-Reader/cross-Reading | DENY, 원본 조회 0 |
| GRANT-06 | 동일 Intent/hash request replay | 신규 Grant/Reading/Access/청구 0; replay는 current grant 증거 아님 |
| GRANT-07 | 동일 Intent 다른 hash | Conflict, 기존 이력 불변 |
| GRANT-08 | 독립 Grant A/B 중 A revoke | B가 정확한 같은 Reader/bundle 범위면 유지, A 단독이면 접근 거부 |
| GRANT-09 | 다른 active bundle 2개 | exact-one ambiguity DENY |
| GRANT-10 | 생성 중 환불/권한회수 | 최종 reveal 전 정책에 따른 current access 검증, disclosure 0 |
| GRANT-11 | Product rule missing/invalid/stale | raw artifact/Saju 0 |
| GRANT-12 | cmd_bind_v2 replay after revoke | current access 성공으로 잘못 표시하는 경로 0 |
| GRANT-13 | A3 V2 일반 Reader, specialist Capability 미부여 | DB v2 binder can_initiate와 Product policy 충돌 검토 및 regression |
| GRANT-14 | merged Guest→Member lineage | historical owner rewrite 0, canonical Subject 범위 보존 |
| GRANT-15 | legacy v1 bound Reading | v2 official identity 자동 생성/권한 승격 금지 |
| GRANT-16 | generated Reader explanation only | official Reading Source Truth 또는 paid Chat 권한으로 승격 금지 |

## 8. 실행 PR 분리·판정

- D01/Product+Saju: official product semantic + versioned rule + live Offer/Charge Terms 승인.
- D02/Commerce+DB: receipt→Grant→v2 binding 호출자 및 replay/multi-bundle/revoke race 정책을 **현재 구현에 맞춰 좁은 PR**로 검증.
- D03/Reader Runtime: Product-approved rule adapter를 A2/A3에 결속; public OFF에서 미승인 artifact 0.
- D04/API: approved Reader/Reading Thread discovery 및 paid response lifecycle/version 계약.
- D05/Mobile: 서버 DTO가 확정된 뒤에만 진입·상태·session-race UI 연결; Native Public OFF 유지.

**현재 판정:** Source reviewed DESIGN 완료. Product/Commerce/DB owner 승인 0 확인, A HOLD. 실제 구현 B HOLD. 출시 C HOLD.
