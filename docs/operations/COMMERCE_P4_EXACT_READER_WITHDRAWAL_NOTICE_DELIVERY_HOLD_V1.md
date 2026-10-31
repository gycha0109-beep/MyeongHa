# Commerce P4 — 정확한 Reader 구매권의 고지·전달·법적 검토 증거 연결

작성일: 2026-11-01
상태: 내부 읽기 전용 재검토 후보. 운영 취소/환불·자동 회수·LIVE 비활성.

## 배경

병합된 [#2841](https://github.com/gycha0109-beep/MyeongHa/pull/2841)은 취소 Provider Event의 원본 Receipt와 Reader 구매권을 정확히 맞추고, 인증된 PortOne 전체 취소 GET·DB 원장 비교 후 `SERIALIZABLE` Event→Grant 잠금 및 revision CAS 사전검사를 확인했습니다. 이것만으로 디지털 콘텐츠가 실제로 전달되었는지, 법정 청약철회가 제한되는지, 환불 후 권한 회수가 허용되는지는 결정할 수 없습니다.

기존 법적 원칙 P0-PR-01 및 LEGAL-004는 확정 상태이며, 이번 작업에서 다시 승인받거나 바꾸지 않습니다.

## 실제 구현

- `scripts/operations/commerce-exact-reader-withdrawal-evidence-hold-v1.mjs`에서 #2841의 **인증된 최신 취소 집합과 정확한 Reader Grant 잠금·버전 CAS** 결과를 확인한 경우에만 별도 `REPEATABLE READ READ ONLY` 트랜잭션을 시작합니다. 다른 이벤트, 영수증, 권한 또는 버전이면 DB 고지를 읽지 않습니다.
- 기존 `commerce_provider_events`, `commerce_receipts`, verified Purchase Intent, `entitlement_grants`, `standard_reading_reader_access_grants`, 불변 Reader Selection에 결속된 **정확한 구입 단위**를 찾습니다. 결제 시점의 `digital_reading_checkout_notice_presentations_v1`은 같은 Intent/Subject/Reader/Bundle에 연결될 때만 사용할 수 있습니다. 고객이 넘기는 Subject·Intent·Unit ID를 증거로 받아들이지 않습니다.
- 기존 `createPostgresDigitalReadingWithdrawalEvidencePrivateV1`과 `prepareDigitalReadingWithdrawalReviewV1`을 그대로 재사용합니다. 서버 측 승인된 고지·확인 증거, 검증된 production Receipt 및 구입 단위가 있는 경우에만 `checkoutNoticeEvidenceAvailable` 관측값을 생성합니다. 단순 생성 완료·T2 커밋·결제 영수증을 **실제 고객 콘텐츠 전달 기록으로 승격하지 않습니다**.
- 승인된 **durable consumer delivery** 소스는 아직 존재하지 않으므로 `durableConsumerDeliveryProven=false`이며, delivery 완료를 뜻하는 `restriction_review_candidate`를 다른 임시 검토자가 반환해도 `delivery_provenance_not_available`로 보류합니다.
- 허용하는 기존 수동 검토 분류는 `statutory_exception_review`, `separable_part_review`, `evidence_review_required`, `not_proven_delivered` 등 **읽기 전용 triage**뿐입니다. 어떤 분류도 법적 승인·거절·Provider 환불·Grant 변경 권한이 아닙니다.
- 내부 읽기 전용 SELECT SQL만 추가하며, 운영 마이그레이션·공개 API·새 영속화 원장은 추가하지 않습니다. 권한이 제한된 일반 API 역할이나 DB 가시성이 부족한 계정은 차단합니다. 모든 트랜잭션은 `ROLLBACK`하며 원본 Subject/Unit/Receipt ID·비밀키·고지 내용을 결과에 포함하지 않습니다.

## 테스트 / 실제 DB 계약

- `test/commerce-exact-reader-withdrawal-evidence-hold-v1.test.mjs`: 구매·영수증·Reader 버전·구입 단위 변경, 고지 없음, 다른 Subject, 법적 사유 별 수동 triage, 없는 delivery 권한, 잘못된 역할·DB 실패, 효과 미실행을 검증합니다. 실제 타입스크립트 기존 evidence adapter와 compiled module 호출도 수행합니다.
- `test/db/commerce_exact_reader_withdrawal_hold_pg17_generator.mjs` 및 `commerce_exact_reader_withdrawal_hold_pg17.sh`: 기존 공식 Reading B2/B3 독립 구매·합성 취소 이벤트 fixture를 재사용합니다. **동일한 운영 후보 SELECT SQL**을 실제 PostgreSQL 17에 적용해 B2는 정확히 조회되지만 B3 권한·가짜 영수증·가짜 이벤트는 조회되지 않아야 합니다. 공식 fixture에는 승인된 고지/전달 증거가 없으므로 `unitId=null`로 HOLD임을 확인합니다. 합성 데이터는 트랜잭션 `ROLLBACK`합니다.
- 격리 PostgreSQL 17 테스트 항목은 `postgres17` 전용 CI에만 추가합니다. 공식 CI가 끝나기 전까지는 **실제 PG17 PASS라고 기록하지 않습니다**.

## 여전히 남은 운영 선행 조건

1. 승인된 서버 측 **실제 고객 전달 기록** 및 정확한 Reader 구입 단위의 R2/T2 최종 공개·락 선형화.
2. PortOne Provider 이벤트의 신뢰 가능한 `NEWER/STALE` 비교 또는 공식 동등한 최신 상태 조정 근거, 법적 환불 최종 판단.
3. 위 독립 권한들이 하나의 트랜잭션에서 기존 Entitlement Effect writer와 안전하게 결합될 때만 운영 실행 단계로 진입할 수 있습니다.

따라서 `legalDecisionAuthorized=false`, `providerRefundAuthorized=false`, `grantRevocationAuthorized=false`, `readerT2LockHeld=false`, `writesPerformed=false`는 유지됩니다.
