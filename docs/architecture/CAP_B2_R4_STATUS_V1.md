# CAP-B2/R4 — BIND-01~29 실제 검증 현황

> 2026-10-13 · Watchtower-Track: applizing · **격리 Draft / 운영 활성화 OFF**

원본 D-01 매트릭스: Product Draft #2003의 `STANDARD_READER_V2_BIND_POLICY_SPLIT_D01_TEST_MATRIX_V1.md`. 현재 Product 정책은 `premium_character_bound(targetReaderId)` 단일 대상만 허용하며, 과거 Premium Reader allowlist는 폐기했습니다. 본 문서는 **개별 사례 PASS와 전체 BIND 완료를 구별**합니다.

## 현재 증거

- [R4 CI #38511264077](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38511264077): HEAD `a771c94df01c8173c4e73ccd346949bdff6237dc` **전체 CI SUCCESS**, 실제 PG15 로그에 `PASS R4/BIND-13 wrong Receipt Offer blocked by actual receipt authority BEFORE verified persistence; no Receipt/Grant/Reading/Access/ledger effect` 및 `PASS R4/BIND-20 actual Guest-to-NEW-Member runtime promotion retains paid Reader/Reading and same Subject; existing-Member merge remains SRC-24 HOLD` 확인. BIND-13 Receipt 삽입을 거부하는 더 이른 DB source 검증이 유효함; downstream Commerce issuer를 호출한 결과로 오인 금지. 신규 BIND-13/20 사례의 PostgreSQL 17 실행은 **후속 HEAD CI 확인 전 후보**입니다. 별도 Privacy Governance FAIL.
- [R4 CI #38508267224](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38508267224): HEAD `18a3edd1501181889785776180b5aca4ddf4c54b`에서 **PostgreSQL15 Authority Core·PostgreSQL17/Commerce/Content/Runtime 의존성·Work Track·CI Verify 전부 SUCCESS**. 새 **BIND-29** 2세션 Reader initial-scope advisory lock 대기 중 *합성 cooperating Content Publisher*가 **실제 `cmd_activate_content_release_v1`로 단일 default Bundle을 교체** → Binder fresh catalog DENY, Official Reading/Reader Access/Commerce ledger 변화 0. `PASS R4/BIND-29 two-session synthetic cooperating Content Release replacement before Binder; fresh Reader bundle DENY, no Reading/Access/ledger mutation` 실로그 확인. 새 BIND-29 테스트는 **PG15 전용**, 운영 Content Writer lock 자동참여 증명이 아님. 기존 BIND-18 PG15 PASS 회귀. R3 static ingress HOLD 인벤토리 **8 legacy paths / 461 runtime files / 18 private calls prohibited** PASS. 별도 Governance는 1840 FK–기승인 Privacy graphRef 불일치 FAIL, 운영 미승인.
- [R4 CI #38505790959](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38505790959): HEAD `d85090f8e3eaa904b2c9f7100afcdccc5a8883f9` **전체 SUCCESS**. BIND-18의 실제 다른 2 Bundle 충돌이 **PG15와 PG17 양쪽에서 각각 `PASS`**, API exact Reader admission / deny-only T1→T2 새 current Bundle ambiguity 경계 TS 회귀 Work Track PASS. 별도 Privacy Governance FAIL.
- [R4 CI #38504283064](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38504283064): HEAD `f52a32094a9a9c87d2fc256977da13e7925cc2b3`에서 PostgreSQL 15 Authority Core·CI Verify·PostgreSQL 17 의존성·Commerce·Content·Runtime **SUCCESS**. 로그 `PASS R4/BIND-18 two independent current purchased Reader bundles; scope lock ambiguity DENY; one revoke preserves other` 확인. **BIND-18 신규 사례는 이 HEAD에서 PG15만 실행**; PG17 신규 동일 사례와 앱 API의 새 회귀는 후속 HEAD 검증 후보입니다. Governance Privacy 별도 HOLD.
- [R4 CI #38498134483](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38498134483): 코드 HEAD `b632511c55a35c31be6ba1b5a69e97014f31809f`에서 **실 PostgreSQL 15 db-authority-core SUCCESS**. 신규 BIND-17(Grant 만료/Offer disabled 후 replay DENY), BIND-20(합성 직접 Guest→Member 병합 계보의 Reader/Reading 보존·교차 Subject/Reader DENY), BIND-21(실제 레거시 1170 결속 이력과 신규 공식 v2 권한 격리·독립 신규 공식 결속) **5개 격리 테스트 모두 PASS**. PG17/Commerce/Content/Runtime 의존성 Job은 해당 HEAD에서 SUCCESS; 신규 5종은 PG15 전용입니다. CI Verify의 최종 결론은 별도 확인 필요. Governance는 승인된 Privacy graphRef edgeCount와 신규 FK 실제 그래프 불일치로 FAIL이며 운영 미승인.
- [R4 CI #38495013601](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38495013601): **SUCCESS**, BIND-16/19/20 신규 실PG15 및 전체 CI Verify PASS, PG17/Commerce/Content/Runtime PASS; **별도 Governance Privacy FAIL**. 코드 HEAD `6c66f6925e55cff18f86ea2f25f4e5ae3e6ee813`.
- [R4 CI #38356466547](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38356466547): **SUCCESS**, PostgreSQL 15 Authority Core·CI Verify 및 PostgreSQL 17/Commerce/Content/Runtime. BIND-16 원문 부재와 BIND-18 요청 위조 4개 실PG PASS. HEAD `ff2eae33f6a0aa28f693b9c489269fd135570375`.
- 이전 [R4 CI #38353544317](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38353544317): **SUCCESS**, BIND-13 Receipt exceptions와 BIND-25 2-connection 시간 경합 PASS.
- 위 증거는 **운영 API/Commerce/T2 Writer 연결이나 Owner 승인**이 아닙니다. 별도 Governance는 Privacy P0-PR-01 graph 140→141 경계로 FAIL.

## BIND별 판정

| ID | 실제 확인된 범위 | 미완 / HOLD |
|---|---|---|
| 01 | 미승인 Standard Rule인 경우 private Binder DENY, Reading/Access 증가 0 | Receipt 발급 전 Product admission |
| 02 | 전문 Capability 0인 Standard 1회 최초 결속 PG PASS | 운영 End-to-end |
| 03 | 전문 `can_initiate=false`에도 Standard 결속, 원행 불변 PG PASS | 운영 연결 |
| 04 | disabled/coming-soon/locked Reader, default Release 없음: PG DENY | Content retire 시점 경합 |
| 05 | Offer disabled/Spec retired: PG DENY | 전체 spec/Offer 매트릭스 |
| 06 | 미래·중복·철회 승인 Rule DENY, R3 철회↔Binder 경합 PASS | 새 revision 전역 경쟁 |
| 07 | 공식 Reader 9명 각각 × 9 Saju domain 승인조회; 단일 **relationship-only 합성 Product**에서 정확한 Reader 1회 결속 PG PASS | 타 8개 영역의 실제 승인 Product는 없음 |
| 08 | Premium 단일 대상 Product 제약 일부 | Premium Binder HOLD |
| 09 | Premium 대상 일치해도 Standard fallback DENY PG PASS | 전문 Premium 권한 HOLD |
| 10 | 미승인 Premium 판매/전문 결속 | HOLD |
| 11 | Premium target 유효성 SQL constraint 일부 | Premium Binder HOLD |
| 12 | 요청 스냅샷 진위 경계 부분 | 운영 서버-DB 종단 |
| 13 | 기존 pending Intent·no-Grant·sandbox/unverified Receipt·future-active Grant 5종 + **verified Intent와 다른 유효 Offer를 가진 합성 Receipt 저장 자체가 DB 원본 일치 검증에서 거부**, Receipt/Grant/Reading/Access/ledger 변화 0, 실제 PG15 PASS (#38511264077) | 실제 Provider verification ingress, 그 외 취소·다중 Grant 및 PG17 신규 사례 미확인 |
| 14 | 최초 공식 Reading 1 + 정확한 Reader Access 1 PG PASS | 운영 |
| 15 | 별도 verified 추가 Reader 구매 → Reading 0 증가, Access 1: S4/1800 실PG PASS | 운영 |
| 16 | committed official Source 없음: PG PASS. BirthRevision·Saju domain Capability version drift 2건 실PG15 DENY PASS | 실제 운영 Saju Source 개정·발행 전 경합은 HOLD |
| 17 | 기존 R2/S4 replay + **별도 PG15 합성 Grant 만료/Offer disabled 후 동일 Intent replay DENY**, 공식 Reading/Access/Commerce event 불변 PASS (#38498134483) | 운영 Commerce revoke/expire Writer·동시 경합 미연결 |
| 18 | 기존 해시·스냅샷·계약 위조 DENY + 같은 Reader/공식 Reading에서 독립된 두 verified 구매의 서로 다른 현재 Bundle 충돌 → `ambiguous_bundles|2|NULL`·유료 대상 임의 선택 0; 하나 회수 시 다른 권한 보존, PG15·PG17 모두 PASS (#38505790959), API 사전 본문 차단·T1→T2 생성 도중 새 모호성 DENY/rollback TS PASS | 실제 Content/Commerce Provider Writer/T2 공개 연결 HOLD |
| 19 | 기존 서로 다른 Reader 권한의 개별 보존 PG PASS; **같은 Reader·같은 bundle의 독립 구매권 2개, 1개 synthetic revoke** 후 다른 권한 보존·폐기 구매 replay 차단 실PG15 PASS | 실제 Provider refund CAS 및 운영 ingress 미검증 |
| 20 | 기존 합성 **Guest→기존 Member 직접 lineage**에서 정당 회원만 구매 Reader/Reading 재열람 PG15 PASS + **실제 `cmd_promote_guest_runtime_v1` 신규 회원 승격 명령 호출**로 동일 Subject 소유권·기존 유료 Reader/Reading·Guest session 소비·멱등 replay 유지, 기존 회원 auth 사용자 탈취·위조 Subject 거부 실PG15 PASS (#38511264077) | **실제 Guest→기존 회원 merge 명령은 SRC-24 OPEN/미구현**, 긍정 통합 불가; API 종단·교차 Reading/Reader 전체·PG17 신규 사례 미확인 |
| 21 | **실제 1170 구매→cmd_bind_standard_reading_unit_v1 이력 생성** 이후 추가 Reader 구매가 이를 Official v2 Source로 승격하지 못함; 별도 검증된 최초 구매는 새 공식 Reading을 독립 생성하고 1170 이력 보존, PG15 PASS (#38498134483) | 운영 1170 호출 경로 cutover 및 migration/Privacy 승인 HOLD |
| 22 | 실제 T2 Writer 연결 | HOLD |
| 23 | R2 revoke↔최초 Binder 2-connection PASS | T2 공개 경합 HOLD |
| 24 | R3 승인 철회↔Binder 양방향 PASS | 운영 연결 |
| 25 | **READ COMMITTED 2-connection advisory lock 대기 중 3초 Grant 만료 → fresh clock 기준 DENY**, Reading/Access 0 PG15 PASS | 운영 전 writer 참여 |
| 26 | REPEATABLE READ stale snapshot DENY PG15/17 PASS | SERIALIZABLE 별도 증명 |
| 27 | R3 복수 Reader 정렬 lock 2-connection PASS | 전역 Writer 전체 무교착 |
| 28 | R3 소스 ingress HOLD 검사 PASS | 원본 1220/Commerce/API Writer 미연결, 실운영 우회 존재 |
| 29 | Product withdrawal 경합 + **검증된 최초 Reader 구매 후 Content default 교체 ↔ Binder 2세션 수동 공통잠금 경합**: 실제 Release activation 완료 후 Binder는 과거 bundle DENY, Reading/Access/ledger 불변 실PG15 PASS (#38508267224) | 운영 Content Writer의 S3/S2 lock 자동참여·Unlock/retire/T2 복합 경합 미입증, PG17 신규 사례 미실행; HOLD |

## Release blockers

1. **DB/Commerce Owner:** v4 Intent→1840 atomic initial scope pin, 최초·추가 Binder/verified issuer/refund 전체 동일 lock 및 CAS/ledger 교체 계약.
2. **Product/Reader/Content/Saju Owner:** 공식 상품별 domain/Reader 승인, Release/Unlock 및 최종 T1→T2 current entitlement 검증.
3. **Privacy/DR Owner:** 1840 FK 보존·삭제 disposition, Governance 서명, 1400~1450 운영 복구 실증.

**종료 판정:** 위 좁은 실DB 사례 PASS / BIND-01~29 전체 인증 및 유료 운영 출시 **HOLD**. PR #2041 Draft·미병합, live Checkout/Refund/paid Reveal OFF.

## BIND-16/19/20 실DB 검증 완료 — 운영 연결 HOLD

- `standard_reader_r4_additional_source_drift_real_pg.sh`: 최초 공식 Source를 보존한 채 current BirthRevision 또는 Saju domain Capability version을 변경할 때 추가 Binder가 새 Access/Interpretation을 만들지 않는지 확인. 별도의 cross-Subject 요청은 신뢰된 실행 Subject 문맥 불일치를 거부해야 함.
- `standard_reader_r4_same_bundle_independent_grants_real_pg.sh`: 한 Reader·한 bundle에서 서로 다른 verified Purchase Intent/Receipt/Grant 두 개를 만든 후, 하나만 **격리 fixture에서 직접** revoke했을 때 다른 Grant의 current access를 보존하고 폐기 구매의 Binder replay를 거부하는지 확인.
- 신규 사례는 [CI #38495013601](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38495013601), 코드·테스트 검증 HEAD `6c66f6925e55cff18f86ea2f25f4e5ae3e6ee813`에서 PostgreSQL 15 Authority Core·CI Verify PASS. 실제 Provider Refund CAS·Guest→Member 권한 계보·운영 T2 검증과 동치가 아닙니다.

## BIND-17/20/21 신규 좁은 실PG 증거 — 2026-10-14

- `test/db/standard_reader_r4_post_bind_replay_real_pg.sh`: 별도 검증된 추가 Reader 구매·최초 정상 결속 후 synthetic 만료/Offer 비활성화. 원 구매로 새 Reader 권한을 재발급하지 못하고 행사 이력·Commerce ledger 변경 0. **운영 Provider revoke/expire Writer가 아님**.
- `test/db/standard_reader_r4_direct_merge_lineage_real_pg.sh`: 합성 `subjects` 직계 병합을 DB에 구성해 `internal_qry_character_standard_reading_access_v2`의 원 Guest Purchase 소유권 보존, 회원 계보·Reader 범위와 거래 Subject 위조 방지 확인. **실제 Guest claim/merge Writer, 다른 Reading 결속, API 종단 증명 아님**.
- `test/db/standard_reader_r4_legacy_1170_isolation_real_pg.sh`: 진짜 레거시 1170 함수 호출과 새 v2 Reader Binder를 서로 다른 검증 구매로 대조. 레거시 이력을 공식 원본으로 자동 채택 불가하며 별도 독립 공식 구매의 정상 결속은 허용. 기존 구매/Reading 이력 불변.
- 위 5종의 **PG15 격리 fixture PASS**는 [#38498134483](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38498134483)의 `db-authority-core` 실로그에 기록. 테스트 범위 확대이지 BIND-01~29 전면 완료, PG17 신규 5종 PASS, 운영/출시 승인으로 승격하지 않음.
- **남은 우선순위:** BIND-18 운영 Content/Commerce/API 실결속과 PG17 확장, BIND-20 실제 Guest merge Writer·cross-reading, R3 전 Writer 잠금 공동참여, R5 T1→T2 보호 본문. Privacy P0-PR-01/1840 FK, 1400~1450 DR, Owner 출시 승인 모두 HOLD.

## BIND-18 상이한 current Bundle 충돌 — 실PG15·PG17 및 API/T2 비공개 회귀 완료

- `test/db/standard_reader_r4_distinct_current_bundles_real_pg.sh`: 먼저 정상 공식 Source에 첫 Baekheon 독립 verified 추가 구매를 결속, 합성 **단 하나의 default Content Release**를 기존 Bundle→새 Bundle로 교체한 후 동일 Reader·같은 Official Reading의 다른 verified 구매를 정확한 신규 Bundle에 결속. 서로 다른 현재 유효 Bundle 2개를 `internal_qry_character_standard_reading_access_v2`에서 확인하고, `internal_qry_official_reader_locked_bundle_scope_v1`은 `ambiguous_bundles/2/NULL`로 fail-closed. 합성 한 Grant 회수 후 `one_current_bundle` 및 남은 독립 권한 유지. Content Release/Commerce 운영 Writer를 건드리지 않았으며, 최초 Reading/Interpretation 역사 중복 0.
- [PG15 실로그 CI #38504283064](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38504283064) **PASS**. 이전 표의 BIND-18 요청 위조 차단과 구분되는 신규 범위.
- 초기 [CI #38505299558](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38505299558)의 Work Track에서 DB suite 37/34→38/35 기대 수 갱신 누락 1건을 수정. 최종 [CI #38505790959](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38505790959)에서 PG15·PG17 BIND-18 로그와 Work Track/TS 테스트 및 CI Verify **전부 PASS**. 운영 T2 유료 공개와 동치 아님.
- R3 운영 Writer cutover·R5 T2 paid reveal은 계속 소유자 승인 HOLD. 공개 함수 ACL, 기존 1220/Commerce Writer, Privacy 140-edge와 운영 DR 계약 불변.

## BIND-29 Content Release 교체 ↔ 최초 Binder — 좁은 실PG15 경합 증거

- 파일: `test/db/standard_reader_r4_content_release_after_receipt_race_real_pg.sh`, `test/db/run_authority_core.sh` PG15 격리 등록. 정상 verified 최초 Receipt/Entitlement Grant와 구매의 **불변 Reader selection Bundle**을 보존하고, 별도의 새 Content Bundle·Catalog·draft Release를 생성. 합성 cooperating Content Publisher 세션이 **공통 S3 initial purchase lock을 명시적으로 수동 취득**한 뒤 실제 `cmd_activate_content_release_v1`을 호출하여 단 하나의 default Release 교체. Binder 다른 세션은 실제 `pg_stat_activity.wait_event_type='Lock'` 대기를 거친 후 fresh Reader catalog가 옛 선택 Bundle을 거부해야 함. 공식 Reading·Reader Access 0, 기존 Commerce event count 불변, 선택 이력 불변 확인.
- [CI #38507567844](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38507567844)의 초기 FAIL은 **신규 테스트의 58자리 요청 해시(정상 64자리보다 짧음)**로 Content 경계 전에 거부된 fixture 오류. 실제 Binder 초기 요청 fixture의 64 hex로 수정. **운영 결함 발견이나 정책 회귀 성공으로 해석 금지.**
- [CI #38508267224](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38508267224)의 수정 HEAD `18a3edd1501181889785776180b5aca4ddf4c54b` 실PG15 로그 `PASS R4/BIND-29 two-session synthetic cooperating Content Release replacement before Binder; fresh Reader bundle DENY, no Reading/Access/ledger mutation` 및 CI Verify/전 의존성 **SUCCESS**.
- **범위 제한:** 실제 Content 운영 lifecycle Writer는 S3 lock을 스스로 취득하지 않습니다. 본 테스트의 cooperating Writer는 disposable fixture에서 수동 구현한 조건부 동작입니다. Content retire/unlock 전 종류, 검증된 Reader 추가 구매, 실운영 Commerce/Content interleaving, atomic T2 유료 공개, PG17 BIND-29는 **HOLD**. R3 문서 `CAP_B2_R3_OPERATIONAL_WRITER_CUTOVER_CONTRACT_V1.md`의 C8/C9 및 Owner G1–G4 선행.

## BIND-13 잘못된 Offer 및 BIND-20 실제 Guest 승격 — 2026-10-14

- `test/db/standard_reader_r4_b13_wrong_receipt_offer_real_pg.sh`: 구매 Intent는 기존 verified `initial_reading` Offer·Reader 선택을 그대로 두고, 해당 Intent의 Receipt에 **다른 실제 등록된 `additional_reader_interpretation` Offer**를 결합한 합성 insert를 시도. DB가 `receipt resolved offer must equal the purchase intent offer`로 **Receipt 저장 전 거부**하며, Receipt·Entitlement Grant/Event·공식 Reading·Reader Access 0 추가. Binder도 활성 exact Grant 부재로 DENY. **실제 Provider signature 검증이나 downstream issuer까지 통과한 상황이 아님**. 첫 [CI #38510583344](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38510583344) FAIL은 테스트가 잘못된 Receipt를 저장할 수 있다고 가정한 오류. 거부 지점에 맞춘 후속 [CI #38511264077](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38511264077) PG15 PASS.
- `test/db/standard_reader_r4_b20_actual_new_member_promotion_real_pg.sh`: 진짜 verified Guest 최초 Source·추가 Reader 구매권 결속 후 **실제로 구현돼 있는** `cmd_promote_guest_runtime_v1`을 `myeongha_api_executor`로 호출; **Guest→신규 Member이므로 Subject ID는 그대로 유지**. Baekheon 구매/공식 Reading·Session 소비와 멱등 재호출 보존, 미구매 Reader 미승격, 다른 Guest가 이미 회원에 연결된 auth ID로 신규 승격하려는 시도와 교차 Subject 거래 문맥은 거부. PG15 PASS (#38511264077).
- **기존 회원 병합은 다름**: `docs/source-authority-gaps/SRC-24_EXISTING_MEMBER_GUEST_MERGE_POLICY.md`의 **OPEN / BLOCKING** 계약에는 충돌 분류·`resolution_jsonb`·`policy_version`·`subject_merge_actions` 실행 매핑·retry/resume가 부족해 실제 `Guest→existing Member` 운영 merge command를 만들거나 시험 통과로 주장할 수 없습니다. 기존 BIND-20 direct lineage 증거는 **합성 관계 DML**, 신규 증거는 **실제 신규 회원 승격 명령**이며 서로 대체 불가.
- PostgreSQL 17으로 위 두 테스트를 확장 등록 (`run_ci_case.sh`, `db-suites.json`, suite plan test). **새 exact HEAD 성공 로그 전에는 PG17 PASS로 승격 금지**. R3 실제 Writer 통합, R5 T2 보호 본문 공개, Privacy P0-PR-01, DR 1400–1450과 Owner 서명 HOLD.

## BIND-13 Provider 검증 진입점 + Receipt 발급/Reader 결속 경합 — 테스트 후보

- **앱 Provider 경로**: `tests/commerce-provider-payment-completion-orchestration.test.ts`에서 실제 `executeAuthenticatedCommerceProviderPaymentCompletionV1` 함수를 호출하되 **모의 Provider 인증기·검증 어댑터·DB pool**을 사용. 인증된 Provider lookup→DB 거래/Intent Product 문맥→Provider 검증 결과가 다른 `externalProductId`를 주장하면 `PRODUCT_MISMATCH`로 **두 번째 영속화 트랜잭션 미개시**. 검증 도중 DB Product 권위가 변한 것으로 모의한 `cmd_persist_verified_payment_evidence_v1_product_authority_mismatch`는 최종 DB 저장에서 **NOT_FOUND, ROLLBACK, COMMIT 0**. 이는 실제 Provider API/PortOne 실서명 실행·운영 영수증 발급 증거가 아닌 **실제 오케스트레이션 함수의 결정론적 단위 검증**.
- **DB private issuer↔Binder 두 세션**: `test/db/standard_reader_r4_b13_receipt_issuer_vs_binder_race_real_pg.sh`는 정상 verified-표시 합성 Receipt + 현행 Offer/Intent를 설치하지만 초기 Grant는 만들지 않음. 선발급 Binder DENY → 다른 거래에서 실제 private `internal_apply_initial_official_reader_receipt_locked_v1`로 Grant를 발급하고 **커밋 전 S3 lock 유지** → 초기 Binder가 `pg_stat_activity.wait_event_type='Lock'`에 머물러 dirty Grant read 불가 → 발급 커밋 후 정확한 Grant에 공식 Reading·Reader Access 각 1건, Event 1건. **운영 verified Receipt persistence↔issuance의 트랜잭션 원자성·Provider 콜백 직렬화 증거는 아님**.
- PostgreSQL15 격리 Authority Core 및 PostgreSQL17 명시적 `cap-b2-r4-receipt-issuer-binder-race` 사례 등록. `db-suites.json` 41 cases / 38 unique, `tests/verification-plan.test.ts` 동기화. **현재 구간의 신규 CI 완료 전까지 PASS 미선언**.
- 운영 Writer 통합·실제 Checkout·Provider 서명 검증·영수증↔Entitlement 원자 cutover, 별도 Privacy Governance 및 R5 유료 공개는 **HOLD**.

## BIND-13 Receipt persistence↔Entitlement issuance 합성 트랜잭션 rollback/recovery — 격리 신규 증거 대기

- 새 `test/db/standard_reader_r4_b13_receipt_issuer_recovery_real_pg.sh`는 실제 Receipt 스키마 제약과 private `internal_apply_initial_official_reader_receipt_locked_v1`을 사용하지만 **운영 `cmd_persist_verified_payment_evidence_v1` 경로가 아닌, 테스트에서 합성한 하나의 트랜잭션**입니다. verified 표기된 테스트용 Receipt만 사용하며 실제 Provider 검증 결과가 아닙니다.
- 세션 A가 동일한 Receipt 식별자를 INSERT하고 Grant/Event/projection/outbox를 발급한 직후 커밋 전에 **의도된 division-by-zero 실패** → 별도 세션에서 미커밋 Receipt/Grant/Event 모두 0을 확인. 세션 B는 동일 Receipt INSERT 시 PG 실제 row/unique transaction lock을 기다렸다가 세션 A의 전체 rollback 후 **하나의 Receipt/Grant/Event만 commit**하도록 설계.
- 같은 식별자·Capability Item·effective_at·valid_from의 정확한 발급 재전송은 `result_replayed=true`, 새 Event/Outbox/Grant 없는 멱등 처리. 효과 시간을 1초 변경한 재전송은 `internal_entitlement_effect_source_semantic_conflict`로 거부하고 Event·Grant identity/Outbox count 불변이어야 함. 본 테스트에서는 공식 Reading·Reader Access가 **발급만으로 생성되면 안 됨**.
- `test/db/run_authority_core.sh` PG15 전용 격리 DB와 `test/db/run_ci_case.sh` PostgreSQL17 분리 사례 `cap-b2-r4-receipt-issuer-recovery`에 등록, `db-suites.json` **42 cases / 39 unique** 및 Work Track assertion 동기화. **새 exact HEAD CI 성공 및 개별 PASS 로그 전에는 검증 완료로 표시하지 않음**.
- 미증명: 실운영 Provider 검증→원본 Receipt 영속화→Entitlement issuer를 단일 트랜잭션으로 연결한 end-to-end Writer, 실결제 Provider webhook 동시 순서, 환불 CAS와 반대 방향 경합, R5 T2 원자 공개. 관련 Owner 승인 및 Privacy/DR 선행 **HOLD**.

## BIND-13 검증된 Receipt 발급 FIRST ↔ verified cancellation 이벤트 경합 (2026-10-14)

- 기존 `test/db/standard_reader_initial_no_grant_r2_real_pg.sh`: **이벤트 FIRST**일 때 합성 cooperating verifier가 R1/S3 Scope Advisory Lock을 잡아 `payment.cancelled` verified Event를 먼저 커밋 → 실제 `internal_apply_b2_r2_initial_receipt_cancel_guarded_private_v1`가 대기 후 `b2_r2_cancelled_receipt_issuance_denied` 및 Grant/Access 0. 기존 독립 검증이며 운영 Writer 연결이 아님.
- 신규 `test/db/standard_reader_r4_b13_issuer_before_cancel_real_pg.sh`: **발급 FIRST**일 때 R1 Checkout Scope Pin을 가진 verified 표시 테스트 Receipt·Grant 0으로 시작. 실제 private `1860` Guarded Issuer가 동일 S3 lock을 유지한 채 original Commerce Entitlement Event/Grant를 쓰지만 아직 미커밋 → 합성 cooperating Provider Event Writer는 **반드시 그 S3 lock을 먼저 획득한 뒤에만** verified `payment.cancelled` 이벤트를 저장하도록 테스트 스크립트가 강제. 두 번째 PostgreSQL 세션의 실제 `pg_stat_activity.wait_event_type='Lock'`과 미커밋 Grant 비가시성을 증명하도록 구성.
- 발급 COMMIT 후 Event Writer는 자체 동일 트랜잭션 내에서 verified cancellation 이벤트 + **실제 private R2 1850 Commerce CAS Revoke**를 실행. Receipt의 정확한 하나의 Grant는 `revoked`, `granted` 1 Event + Provider `revoked` 1 Event, 공식 Reading/Reader Access 0이어야 함. 이후 Guarded Issuer 재발급은 verified 취소 이벤트 존재로 **DENY**, 원장 불변.
- **핵심 제약:** 운영 Provider 이벤트 검증·저장 코드가 실제로 S3 lock에 참여한다는 증거가 아님. 테스트만 lock을 자발적으로 획득합니다. 취소 전/후 반대 방향 두 사례는 각 별도의 격리 검증이며, **R3 통합 Writer cutover 승인·실환불·Provider ordering·R5 paid T2 공개** 모두 HOLD.
- PG15 `run_authority_core.sh` 및 PG17 `cap-b2-r4-issuer-before-cancel` 등록. Suite manifest **43 cases / 40 unique**. 이 신규 사례는 **exact HEAD CI PASS 로그 검증 전에는 완료로 승격 금지**.

## R4/BIND-13 운영 Provider 취소 진입 계약 감사 — 2026-10-14

- 호출 경로별 실제 소스/미구현 지점, R1/S3→S2/Commerce row lock 순서, event+CAS 단일 커밋 요구 및 Owner HOLD를 `docs/architecture/CAP_B2_R4_PROVIDER_CANCEL_INGRESS_PREFLIGHT_V1.md`에 분리했습니다. PortOne V2 운영 웹훅은 **`Transaction.Paid`만** 결제 완료로 연결하고 다른 event type은 `ignored`; verified cancellation을 1850 CAS까지 전달하는 운영 Writer 증거는 없습니다.
- 신규 `test/db/standard_reader_r4_b13_provider_cancel_contract_denials_real_pg.sh`는 status/environment/type/Receipt lineage/transaction/Grant/Subject/CAS/isolation 불일치 및 합성 event+CAS rollback을 독립 PG15/17에서 검증하도록 등록. `tests/cap-b2-r4-provider-cancel-operating-ingress-hold.test.ts`로 paid-only와 private-only 정적 경계를 감시. Manifest 44 cases / 41 unique.
- **새 exact HEAD PG15/17 및 Work Track CI의 개별 PASS 전에는 결과 미확정**. 기존 Privacy Governance, R3 all-operating-Writer S3 채택, R5 T2, SRC-24 및 DR 1400–1450 모두 HOLD.
