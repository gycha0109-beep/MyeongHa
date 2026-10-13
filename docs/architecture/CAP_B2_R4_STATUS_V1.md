# CAP-B2/R4 — BIND-01~29 실제 검증 현황

> 2026-10-13 · Watchtower-Track: applizing · **격리 Draft / 운영 활성화 OFF**

원본 D-01 매트릭스: Product Draft #2003의 `STANDARD_READER_V2_BIND_POLICY_SPLIT_D01_TEST_MATRIX_V1.md`. 현재 Product 정책은 `premium_character_bound(targetReaderId)` 단일 대상만 허용하며, 과거 Premium Reader allowlist는 폐기했습니다. 본 문서는 **개별 사례 PASS와 전체 BIND 완료를 구별**합니다.

## 현재 증거

- [R4 CI #38355686962](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38355686962): **SUCCESS**, PostgreSQL 15 Authority Core + CI Verify, PostgreSQL 17/Commerce/Content/Runtime 성공. HEAD `229c1fcba2d4510468867f2198d706cc2027a927`.
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
| 16 | committed official Source **없을 때** 추가 Reader Binder DENY PG PASS | Birth revision/domain Capability drift 별도 증명 필요 |
| 17 | 역사적 replay가 새 current Access 허용하지 않음: R2/S4 범위 PASS | Product disabled/expire 혼합 전체 |
| 18 | invalid request hash·forged snapshot·invalid contract: 추가 Binder DENY PG PASS | 같은 Reader의 두 current bundle 충돌 |
| 19 | 기존 서로 다른 Reader 구매권은 개별 revoke 뒤 상대 Access를 보존(1220 실PG) | **같은 Reader·같은 bundle의 독립 Grant 일부만 revoke**는 미증명 |
| 20 | Subject execution-context guard는 설치됨 | cross-Subject/Reading/Reader 및 Guest→Member Reader lineage 종단 미완 |
| 21 | legacy 1170 별도 이력 유지 | 1170/v2 교차 자동권한 승격 방지 종단 미완 |
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
