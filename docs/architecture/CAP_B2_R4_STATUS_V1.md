# CAP-B2/R4 — BIND-01~29 실제 검증 현황

> 2026-10-13 · Watchtower-Track: applizing · **격리 Draft / 운영 활성화 OFF**

원본 D-01 매트릭스: Product Draft #2003의 `STANDARD_READER_V2_BIND_POLICY_SPLIT_D01_TEST_MATRIX_V1.md`. 현재 Product 정책은 `premium_character_bound(targetReaderId)` 단일 대상만 허용하며, 과거 Premium Reader allowlist는 폐기했습니다. 본 문서는 **개별 사례 PASS와 전체 BIND 완료를 구별**합니다.

## 현재 증거

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
| 13 | pending Intent·no-Grant·sandbox Receipt·unverified Receipt·future-active Grant 5종 실PG DENY, Reading/Access 증가 0 | 기타 다중 Grant/취소·wrong Offer 조합 |
| 14 | 최초 공식 Reading 1 + 정확한 Reader Access 1 PG PASS | 운영 |
| 15 | 별도 verified 추가 Reader 구매 → Reading 0 증가, Access 1: S4/1800 실PG PASS | 운영 |
| 16 | committed official Source 없음: PG PASS. BirthRevision·Saju domain Capability version drift 2건 실PG15 DENY PASS | 실제 운영 Saju Source 개정·발행 전 경합은 HOLD |
| 17 | 기존 R2/S4 replay + **별도 PG15 합성 Grant 만료/Offer disabled 후 동일 Intent replay DENY**, 공식 Reading/Access/Commerce event 불변 PASS (#38498134483) | 운영 Commerce revoke/expire Writer·동시 경합 미연결 |
| 18 | invalid request hash·forged snapshot·invalid contract: 추가 Binder DENY PG PASS | 같은 Reader의 두 current bundle 충돌 |
| 19 | 기존 서로 다른 Reader 권한의 개별 보존 PG PASS; **같은 Reader·같은 bundle의 독립 구매권 2개, 1개 synthetic revoke** 후 다른 권한 보존·폐기 구매 replay 차단 실PG15 PASS | 실제 Provider refund CAS 및 운영 ingress 미검증 |
| 20 | 기존 실행 Subject 위조 DENY + **합성 직접 Guest→Member 계보에서 동일 baekheon·정확한 Reading 열람 보존, 다른 Member·미구매 seyeon·위조 거래 문맥 DENY**, 원 Guest 기록 유지 PG15 PASS (#38498134483) | 운영 Guest merge 명령/세션 검증·교차 Reading/Reader 전체 경우의 수와 API 종단 HOLD |
| 21 | **실제 1170 구매→cmd_bind_standard_reading_unit_v1 이력 생성** 이후 추가 Reader 구매가 이를 Official v2 Source로 승격하지 못함; 별도 검증된 최초 구매는 새 공식 Reading을 독립 생성하고 1170 이력 보존, PG15 PASS (#38498134483) | 운영 1170 호출 경로 cutover 및 migration/Privacy 승인 HOLD |
| 22 | 실제 T2 Writer 연결 | HOLD |
| 23 | R2 revoke↔최초 Binder 2-connection PASS | T2 공개 경합 HOLD |
| 24 | R3 승인 철회↔Binder 양방향 PASS | 운영 연결 |
| 25 | **READ COMMITTED 2-connection advisory lock 대기 중 3초 Grant 만료 → fresh clock 기준 DENY**, Reading/Access 0 PG15 PASS | 운영 전 writer 참여 |
| 26 | REPEATABLE READ stale snapshot DENY PG15/17 PASS | SERIALIZABLE 별도 증명 |
| 27 | R3 복수 Reader 정렬 lock 2-connection PASS | 전역 Writer 전체 무교착 |
| 28 | R3 소스 ingress HOLD 검사 PASS | 원본 1220/Commerce/API Writer 미연결, 실운영 우회 존재 |
| 29 | Product withdrawal 부분 경합 PASS | Content retire/Unlock/Release/T2 복합 경합 HOLD |

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
- **남은 우선순위:** BIND-18 한 Reader에 현재 유효한 서로 다른 2개 Bundle 충돌; BIND-20 실 Guest merge Writer·cross-reading; R3 전 Writer 잠금 공동참여, R5 T1→T2 보호 본문; Privacy P0-PR-01/1840 FK, 1400~1450 DR, Owner 출시 승인 모두 HOLD.
