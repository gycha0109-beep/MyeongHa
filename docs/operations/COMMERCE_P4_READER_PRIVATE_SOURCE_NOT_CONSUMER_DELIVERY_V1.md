# Commerce P4 — 정확한 유료 Reader 내부 해석 증거와 소비자 전달 증거 분리 v1

작성일: 2026-11-01
상태: 읽기 전용 내부 검증 후보. 실제 고객 콘텐츠 전달 검증·법적 환불 승인·실제 결제 취소·Grant 회수는 모두 HOLD.

## 목적

PR #2844는 인증된 PortOne 취소 전체 집합과 정확한 구매 영수증·Reader Grant 잠금/버전 CAS를 확인한 뒤, 해당 구매의 결제 시점 고지와 법적 검토 증거를 안전하게 조사하도록 연결했습니다. 기존 고지 migration이 아직 적용되지 않은 경우에는 정상적인 `HOLD` 결과를 반환합니다.

이번 단계는 **Reader Interpretation 논리적 연결**, **공식 해석 응답의 내부 저장**, **해당 소비자에게 구입한 콘텐츠의 실제 전달**을 구분합니다. 내부 `reading_refs.product_response_state='delivered'`는 고객 전달 성공이 아니며, Receipt 검증·T2 COMMIT·생성 완료·HTTP 의도·단순 화면 열람 역시 `DELIVERED_PROVABLE`이 아닙니다.

## 구현

- `scripts/operations/commerce-exact-reader-source-not-delivery-v1.mjs`: 정확한 `standard_reading_official_bindings`, `standard_reading_reader_interpretations`, `standard_reading_reader_access_grants`, `readings`, `reading_refs`를 하나의 SELECT로 연결합니다. **원본 Purchase Intent·정확한 Entitlement Grant·Reader·구매 콘텐츠 Bundle**을 모두 SQL 매개 변수로 요구합니다.
- `standard_reading_reader_interpretations.initial_reader_content_bundle_id`만으로 구매 Bundle을 식별하지 않습니다. 실제 테스트에는 **같은 Reader의 서로 다른 Bundle을 별도로 구입한 B2/B3**가 존재하며, 각 구매는 독립된 Purchase Intent·Grant·Bundle으로 대조해야 합니다.
- 내부 원본 응답의 성공적 커밋과 `reading_refs`의 일치하는 응답 지문은 `official_source_committed_not_consumer_delivery`로만 분류합니다. 해석 생성 중·미완료는 `private_source_not_committed`, 범위가 일치하지 않거나 저장 데이터가 모순되면 `inconsistent_private_source`, 행 자체가 없으면 `not_observed`입니다.
- `commerce-exact-reader-withdrawal-evidence-hold-v1.mjs`에 기존 **완전 가시성·REPEATABLE READ READ ONLY** 트랜잭션 내 추가 조회를 연결합니다. 불일치가 발견되면 고지/법적 검토 호출 전에 HOLD합니다. 내부 해석 행이 없거나 미완료여도 **소비자의 신고·청약철회 가능성을 부정하지 않고**, 기존 수동 증거 검토를 계속할 수 있습니다.
- 외부 출력에는 원본 Subject·영수증·구매 Intent·Reading·Grant·해석 내용·응답 지문·API Secret을 포함하지 않습니다. 단 두 가지 관찰값인 `privateReaderInterpretationIdentityObserved`와 `officialSourceCommittedButNotDelivered`만 추가합니다.
- **모든 결과에서** `durableConsumerDeliveryProven=false`, `legalDecisionAuthorized=false`, `grantRevocationAuthorized=false`, `providerRefundAuthorized=false`, `writesPerformed=false`를 유지합니다.

## 실제 DB 검증

기존 PR #2844의 `commerce-exact-reader-withdrawal-hold-pg17` 격리 PostgreSQL 17 CI fixture에 동일 실행용 SELECT SQL을 추가했습니다. 독립 구매한 B2/B3 Reader 단위를 대상으로 아래를 확인합니다.

1. B2의 정확한 Reader·Intent·Grant·Bundle으로 내부 공식 해석 원본이 조회되고, 이 결과를 소비자 전달 증거로 표시하지 않습니다.
2. 같은 Reader의 다른 Bundle 구매 B3도 B3 자신의 Grant·Intent·Bundle으로 정확히 조회되어야 합니다. B3가 B2의 Intent/Bundle을 가장하면 0건이어야 합니다.
3. 다른 Subject가 동일 Reading을 조회하면 0건이어야 합니다.
4. 고지 테이블은 기존 staging 정책에 따라 **설치되지 않은 상태**가 정상이며, `noticeInstalled=false`만 확인합니다. 설치되지 않은 테이블에 SQL JOIN을 시도하지 않습니다.
5. 변경되는 SQL·대조는 모두 트랜잭션 `ROLLBACK`. 환불 POST·Entitlement writer·운영 migration이 없습니다.

PostgreSQL 17의 실제 새 검사 성공은 PR CI에서 확인하기 전까지 **미확정**입니다. 로컬 검사는 Vitest/SQL 생성과 빌드까지만 인정합니다.

## 미완료 선행조건

- 고객에게 실제 콘텐츠가 **전달됐음을 서버가 독립적으로 검증하고 유지하는 승인된 durable delivery source**는 아직 없습니다. 이번 구현은 DB 테이블을 새로 설계·배포하거나 전달 완료를 주장하지 않습니다.
- Provider의 신뢰 가능한 NEWER/STALE 비교, 법적 최종 판단, Reader R2/T2 공유 선형화 및 실제 Grant writer의 원자적 결속은 별도 작업입니다.
- P0-PR-01 / LEGAL-004 / Refund Disclosure 승인된 정책과 기존 stage migration 제외 규칙은 변경하지 않습니다.
