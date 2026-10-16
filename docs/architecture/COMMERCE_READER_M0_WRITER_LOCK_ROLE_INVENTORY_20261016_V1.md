# M0-01 — Commerce 구매·회수·Official Reader T2 Writer/Lock/Role 조사

> **2026-10-16 / 문서 전용 / 운영 변경 0 / Watchtower-Track: commerce**
>
> 검증 기준: MyeongHa main `6062755fb840480c8486741175db06303ba08b55`, 로드맵 Draft #2163 `6d08fa5318006559e6a4c2a02ecc8cd6b9ec65d9`, 보안 Draft #2153 `54e547fcd80973eb4ed10d5e196f35c2b2cdd7f1`. 소스와 기존 격리 검증을 읽고 대조한 것이며 **전체 런타임 call graph나 운영 배포 자격증명을 전수 확인한 결과가 아님**. 상세 순서: [통합 로드맵 M0](../COMMERCE_READER_PAYMENT_INTEGRATION_ROADMAP_20261016_V2.md).

## 1. 핵심 결론

- **현재 main:** PortOne 서버 검증 및 Receipt/Provider Event persistence, 원본 Entitlement 효과 `1080/1090`, 공식 Reader 결속 `1220`, 비공개 T1/T2 재확인 예행연습이 존재한다.
- **보안/DB Draft:** `1740/1800/1810`의 공통 Product L0 → Reading×Reader L1 정렬 잠금, `1820` 신규 발급·결속, `1830/1840/1850` verified cancellation 원자 회수, `1870/1880` 심사 연결 및 `1890/1900` 구 경로 EXECUTE fence가 이미 개발·테스트되었다. **main에 병합·운영 적용된 것으로 간주하지 않는다.**
- **미확인 통합:** 실제 결제 완료 호출자에서 D2 발급/결속까지의 운영 연결, 모든 기존 1080/1090/1220/1770의 진입점 통제, 승인된 취소 작업자→D3 연결, 신규 Grant·취소·최종 paid T2가 공통 잠금을 함께 사용하는 원자적 공개 경계. 현재 T2 예행연습은 **항상 공개 거절**한다.
- **금지:** 이미 존재하는 D3e23~29 보안 격리 시험의 중복 구현, service_role 운영 REVOKE/GRANT, PortOne 실결제·환불, 운영 Secret 조작, 미승인 Saju 내용을 AI로 보완, Draft 임의 병합.

## 2. Writer / DB 역할 / 순서 지도

| ID | 실제 진입·소스 | 실행 역할과 잠금 순서 | 평가 |
| --- | --- | --- | --- |
| C01 구매 요청 | MAIN `apps/api/src/postgres-subject-execution.ts` + Purchase Intent/Payment Attempt | 앱 subject transaction은 `SET LOCAL ROLE myeongha_api_executor`. 본 경로가 Reader L0/L1 진입한다고 확인되지 않음 | 기반 구현, Offer/Charge Terms와 실제 판매 HOLD |
| C02 결제 Provider 검증·증거 | MAIN `apps/api/src/commerce-provider-payment-completion-orchestration.ts` → `commerce-verified-payment-evidence-persistence.ts` | `postgres-commerce-internal-execution.ts` → `SET LOCAL ROLE myeongha_commerce_internal_executor` → `cmd_persist_verified_payment_evidence_v1`. Provider 조회는 DB 거래와 분리 | Receipt/Event persistence 존재. 이 TS 함수의 본문은 D2 Reader 발급 함수 호출을 포함하지 않음 |
| C03 원본 영수증→구매권 | MAIN SQL `1090_verified_receipt_capability_fulfillment_batch_v1.sql` → `1080_entitlement_effect_apply_v1.sql` | Receipt `FOR UPDATE` 이후 원본 Grant/Event CAS, projection/outbox. 자체 Product L0/Reader L1 없음 | 원본 primitive 존재; Official Reader 공통 lock 사전 획득 요구 |
| C04 원본 Reader 결속 | MAIN SQL `1220_official_standard_reading_reader_interpretation_authority.sql` `cmd_bind_standard_reading_access_v2` | Intent → Grant → Birth row lock, purchase-backed Reader binding. 현재 Grant는 `replayed=true`와 동치가 아님 | L0/L1 자체 없음; 기존 Binder 앞쪽에 통일된 잠금 필요 |
| C05 공통 잠금 진입 | DRAFT `1740/1800/1810` + [D1 감사](./OFFICIAL_READER_D1_WRITER_LOCK_ORDER_AUDIT_20261012_V1.md) | DB-owned Product 전체 UUID 정렬 L0 → Reading×Reader 정렬 L1 → 원본 row lock. Canonical subject / READ COMMITTED / direct runtime EXECUTE 차단 | 격리 잠금 테스트 존재; 권한 허가나 운영 cutover 아님 |
| C06 공통 신규 발급·결속 | DRAFT `1820_official_reader_unified_issue_bind_private_v1.sql` (D2) | source-derived verified Receipt/Intent/Offer role→C05 L0/L1→원본 1090/1220→scope drift면 전체 rollback | 격리 테스트 통과 근거, **현행 C02 실제 운영 호출 연결 미입증** |
| C07 기존 회수 우회 | MAIN 원본 `1080` 및 DRAFT `1770/1780` legacy | 1080은 Event/Grant row lock, 1770은 L1-only. 범위 L0 전체 선점이 없음 | 다른 진입점에서 L0 이후 늦은 획득, 경합·우회 위험의 범위 조사 필요 |
| C08 D3 구매권 회수 | DRAFT `1830` 단건, `1840` 영향 집합, `1850` 일괄 원자 취소 | Source-derived 전체 Product L0 → Reader L1 → 1080 original CAS/event/projection/outbox. 2-Grant second-CAS 실패 전부 rollback 격리 증거 | private 시험 완료; 모든 runtime caller 전환 아님 |
| C09 심사된 공급사 취소 | DRAFT `1860~1960`, 특히 `1870` matching, `1880` review bridge, `1890/1900` EXECUTE fence | Provider 취소 사실 관측과 법무/상거래 승인 별도. 실제 회수 실행자는 독립 최소권한 역할 필요 | 운영 private cancel 함수 3종 부재 실측, 실제 PG/Worker 이관 HOLD |
| C10 실제 역할/권한 | DRAFT [#2150](https://github.com/gycha0109-beep/MyeongHa/pull/2150) → [#2153](https://github.com/gycha0109-beep/MyeongHa/pull/2153) | 운영 PG17 읽기 전용 메타데이터: 앱 4역할의 7 보호테이블 직접 DML=0, `service_role`은 **7/7 직접 DML 보유** | catalog 좁은 실측만. 실제 배포 login·Data API·관리자 접근/키는 미확인 |
| R01 Reader 예행연습 | MAIN `apps/api/src/official-reader-held-t1-t2-preflight-v1.ts` | T1: subject transaction/fresh DB clock, COMMIT 후 private generation, 별도 T2에서 fresh admission 비교. **L0/L1·유료 Writer 없음** | 생성 결과 폐기, 성공 반환도 `status: held`, `publicDisclosureAuthorized: false` |
| R02 일반 Chat 저장 | MAIN `0220_chat_attempt_commit_commands.sql` | Thread → Turn → Attempt row lock → 일반 message/memory/outbox | 유료 원문과 일반 기억이 혼합되지 않도록 protected body + side effects 별도 Privacy 승인 필요 |
| R03 RR-03 검증 답변 | DRAFT [#1960](https://github.com/gycha0109-beep/MyeongHa/pull/1960) | 서버 발급 Saju Unit + Guard PASS + current Grant + protected body를 원자 COMMIT해야 함 | 기존 provenance skeleton은 positive paid T2 아님. **migration 1720 중복 번호 충돌** |
| R04 RR-04 후속 조회 | DRAFT [#1974](https://github.com/gycha0109-beep/MyeongHa/pull/1974) | Commit된 정확한 paid Answer와 매 조회 current Subject/Reading/Reader/Grant/Bundle 재검증 필요 | 후보 조회는 존재, 운영 Reader follow-up 권한 아님 |
| R05 실제 T2 공개 | Owner 계약 [Official Reader 통합 S5](./OFFICIAL_READER_PAID_CHAT_INTEGRATION_ROADMAP_20261012_V1.md) 및 RR-09 | 요구: L0→L1→fresh Grant/Product/Saju source/Release→검증 답변·출처·본문 원자 COMMIT → 성공 후 공개 | **미구현/미승인.** 실제 신규 Grant↔취소↔T2 positive 3세션 통합 PASS 주장 불가 |

**직접 확인한 코드:** C02의 orchestration은 Provider lookup·verified persistence 이후 `receiptId`/`providerEventId`를 반환한다. 이 단계가 독립적으로 Reader Grant 발급·Reader bind·paid text 공개까지 호출한다고 주장하지 않는다. `official-reader-held-t1-t2-preflight-v1.ts`가 내부 generator의 출력값을 버리고 공개를 거부하는 것은 명시적 동작이다. 더 큰 전체 repository 호출 그래프/운영 런타임은 후속 조사 대상.

## 3. 기존 시험과 신규 gap를 분리

| 이미 존재하는 시험/근거 | 중복 구현하지 말 것 | 신규 필요 증거 |
| --- | --- | --- |
| `test/db/official_reader_new_grant_insert_phantom_preflight.sh` | 기존 Grant 행만 잠가 새 Grant 삽입이 가능한 현상을 반복 증명 | 실 발급/취소/T2가 **같은 L0→L1을 먼저 획득**하는지 |
| #1983/#1984/#1987, `official_reader_scope_lock_s2_instrumented_race.sh` | 합성 2세션 공통 범위 lock PASS 반복 | 실제 TS caller+DB owner의 전체 Writer 채택 |
| `official_reader_d2_unified_issue_bind_three_session.sh` | D2 단독 신규 발급/결속 성공·rollback 중복 | C02 Verified Receipt→D2 owned invocation, 실행 권한·재시도·원본 Grant 정합성 |
| `official_reader_d3_verified_cancel_unified_three_session.sh`, `official_reader_d3b_verified_impact_lockset_three_session.sh`, `official_reader_d3c_verified_cancel_atomic_batch.sh` | 범위 lock, CAS, 2-Grant rollback 회귀 중복 | 기존/신규 구매권 issuance와 **실제 T2** 간 동일 lock order |
| `official_reader_d3e23_seven_table_service_role_purchase_cancel_clone.sh` 및 D3e27~29 | 7테이블 ACL 거부, 간접 SECURITY DEFINER 탐지, ACL 원복 중복 | 실제 deployment login·Data API·owner 직접 SQL/Worker audit 및 Cutover 권위 |
| MAIN `test/official-reader-held-t1-t2-preflight-v1.test.ts` | deny-only T1/T2 예행연습 반복 | 승인된 **positive** T2 함수/비공개 본문 저장 경계 확보 전에는 실제 공개 테스트 불가 |
| #1960/#1974 | 문자열 Saju Unit을 검증된 Source로 오인 | exact grounding Unit membership, protected answer·memory/summary/search 격리 및 최신 권한 재조회 |

## 4. 결정할 결함·책임

- **G-01 Commerce/DB:** C02→C03/C06의 production-equivalent internal caller/transaction/role 연결 부재. 새 일반 executor에게 1820 권한을 바로 주지 말고, 실제 receipt→Grant 경로와 transaction split을 확인.
- **G-02 DB/Commerce/Security:** 구 1080/1090/1220/1770 직접 실행/우회 및 order inversion을 어떻게 한 범위로 닫을지. #2153 ACL 증거 재사용.
- **G-03 DB/Reader:** T2 positive Owner 권한·L0→L1·원자 paid body/출처 COMMIT, 3세션 phantom/revoke 경쟁. 현재 held 예행연습을 public으로 올리지 않음.
- **G-04 DB/Privacy:** RR-03 #1960의 `1720`과 현재 본선 Product `1720` migration 충돌. 기존 migration rewrite/원본 출처 삭제 금지, forward-only 번호와 Privacy 분류/삭제/복원 재검증.
- **G-05 Saju/Product/Reader:** `relationship/natal/general` 운영 interpretation pack, Standard Reader eligibility #1828, Release/Unlock/Bundle 등 upstream gate. 내용이 없으면 positive 판매·출력 경로 NO_BUILD.
- **G-06 Product/Commerce/Legal/Privacy/Release:** 첫 정가 8,900원은 정해졌으나 Offer/Charge Terms, 추가 Reader 가격, 제공 개시 증빙, 청약철회 고지, 이용권·결제 운영 활성화 HOLD.
- **G-07 Security/Ops:** service_role 7테이블 직접 DML, 운영 private cancel 함수 누락, DB login/Data API/관리자 계정 및 rollback 미확인. 운영 GRANT/REVOKE·배포 금지.

## 5. 바로 다음 최소 구현·시험 — M1-01

**작업명: 실제 결제 완료 → Verified Receipt → 구매권 발급 D2 내부 caller/role 연결 감사와 부정·경계 시험**

1. **read-only call graph:** `commerce-provider-payment-completion-orchestration.ts` → `commerce-verified-payment-evidence-persistence.ts` → SQL `1050`에서 어디까지 persisted fact인지, `1090/1080/1220/1820`을 어떤 역할로 호출 가능한지 규명. 코드상 연결 부재와 배포상 미확인은 구분.
2. **기존 격리 DB 재사용:** D2 suite의 이미 통과한 happy path 대신 **실제 선택된 caller role**의 구/신 writer 직접 실행 거부와 안전한 internal port 결정을 검증. 필요하면 특정 누락 결합에 대해서만 synthetic fault/race fixture 추가.
3. **3세션 T2는 후행:** Owner가 보호된 T2와 Source/Privacy contract를 승인한 뒤 (i) grant 먼저 (ii) revoke 먼저 (iii) T2 먼저에서 공통 L0→L1·fresh Grant와 COMMIT/reveal 결과를 실제 PG15/17로 검증. 지금 T2 자체가 부재하므로 가짜 positive HTTP 출력을 만들지 않는다.
4. **합격:** 정확한 누락 call/execute boundary, 기존 회귀 대비 새로 검증한 사항, 다음 작은 Draft 범위, Selected PG suite의 exact SHA 증거. Commerce/Legal/DB/Privacy 승인 전 실제 결제·취소·운영 DB 영향 0.

**이번 문서 상태:** M0 소스 조사 및 다음 갭 정리만 수행. 새 PostgreSQL 테스트/Production 감사/유료 공개를 수행했다고 주장하지 않는다. 사용한 PR의 당시 HEAD/CI 성공은 독립 재검증 전에 최신 상태를 다시 조회해야 한다.
