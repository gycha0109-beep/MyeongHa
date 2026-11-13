# Commerce Payment — 저장된 청약철회 접수에서 구매 증거 검토까지 연결

**개발 로드맵:** docs/operations/COMMERCE_PAYMENT_TRACK_STATUS_IMPLEMENTATION_ENDPOINTS_20261030.md 6절의 3번(결과물 제공·청약철회 접수). 개발 전용, 운영 판매·실제 환불·LIVE 비활성.

## 구현한 경계

- apps/api/src/commerce-recorded-reader-withdrawal-private-review-v1.ts는 **이미 DB에 저장된** digital_reading_withdrawal_claims_private_v1의 claimId만 입력받습니다. Subject, 구매 Intent/Unit, 접수 사유·시각은 오직 그 저장 행에서 읽으며 호출자가 임의로 공급할 수 없습니다.
- 기존 prepareDigitalReadingWithdrawalReviewV1 및 createPostgresDigitalReadingWithdrawalEvidencePrivateV1을 재사용해 **같은 읽기 전용 스냅샷**에서 원본 production PortOne Receipt, 정확한 구매 단위, 결제 당시 고지·확인 기록을 검토합니다. 새 결제·환불·권한·분쟁 원장은 만들지 않습니다.
- 연결되지 않은 일반 접수는 구매 사실을 추정하지 않고 general_unlinked_manual_review로 남깁니다. 원본 영수증이 이미 취소됐거나, 고객 제공/고지 증거가 불충분하거나 DB 증거에 접근할 수 없으면 **접수 기록은 유지**한 채 exact_unit_evidence_unavailable로 분리합니다.
- 확인된 정확한 구매권에 대해서도 판단은 기존 검토기에서 제공한 수동 분류만 보입니다. 이는 법적 결론, 환불 승인, 콘텐츠 전달 완료, Provider 취소 요청 또는 Entitlement Effect 실행 권한이 아닙니다.
- BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY 및 ROLLBACK만 사용하고, RLS 전체 가시성을 가진 내부 운영 연결 외에는 사용하지 않습니다. 반환 결과에는 Subject/구매 ID, 고지 본문, 원본 결제 내역을 노출하지 않습니다. 계정 삭제 이후 조회할 수 없는 접수는 없는 결과로 남깁니다.

## 검증 및 미완료

- test/commerce-recorded-reader-withdrawal-private-review-v1.test.ts: 정확한 저장 Claim·Receipt·결제 시점 고지 결속, 일반 민원·취소된 결제·다른 Subject·불명확한 데이터, 잘못된 내부 DB 역할, 롤백·초기화 오류, 고객 접수와 환불 승인 분리를 검증합니다.
- 최종 TypeScript 검사·Vitest·GitHub CI·통합 검증은 PR의 실제 결과로 판정합니다.
- 기존 Reader S5/S7에는 서버 준비와 인증된 클라이언트 ACK가 기록되지만, **소비자에게 콘텐츠가 법적으로 제공되었음을 입증하는 완료 증거와 같지 않습니다**. 이 PR은 현재 검토기의 DELIVERED_PROVABLE을 만들지 않습니다.
- 취소 Provider의 신뢰 가능한 NEWER/STALE 순서 및 정확한 Reader T2 동시성·권한 회수, 기록의 복원 후 privacy replay, 구매부터 삭제까지 PostgreSQL 17 종단 간 통합 검증은 후속 로드맵 과제로 남깁니다.
- 운영 DB SQL/마이그레이션 적용, 기존 기능 릴리스 플래그 활성화, 실제 PG 환불 POST, 자동 환불 결정, LIVE/공개 라우트 변경 없음.
## 2026-11-08 — 실제 PostgreSQL 17에서 Claim→수동 환불 진행 상태 결속

- 기존 `commerce-verified-reader-claim-cancel-effect-pg17` **격리 ROLLBACK 시나리오**가 고객의 정확한 B2 원본 Claim을 받아, 별도로 입력된 **합성 운영자 승인**의 P5Y 최소 재무 기록과 결속하는 부분을 추가했습니다. 이 승인 기록은 시험용으로만 만들며 사용자 Claim 자체가 환불 승인으로 승격되지는 않습니다.
- 실제 `qry_received_digital_reading_withdrawal_claim_v1`을 재조회해 **received → refund_decision_recorded → refund_processing** 상태를 검증합니다. 기존 `internal_reserve_reader_full_refund_dispatch_v1`과 `internal_record_reader_full_refund_response_v1`을 사용하되 **PortOne POST/GET 네트워크 요청은 하지 않습니다**.
- 같은 시험에서 원본 Source Event 및 합성 Grant 회수만으로는 `internal_confirm_reader_full_refund_dispatch_v1`이 환불을 확정할 수 없어야 하고, 고객 상태가 **refund_confirmed로 거짓 승격되지 않아야** 합니다. 다른 회원의 Claim 상태는 received로 보존하고, 계정 삭제 후에는 개인 Claim이 삭제되지만 기존 P5Y 최소 판단 기록은 유지되는지 검사합니다.
- 이는 **실제 PostgreSQL 17 함수의 합성 상태 전이 검증**일 뿐 소비자 제공 완료, 실제 법적 승인·PG 환불·Provider 순서·LIVE 준비 완료를 뜻하지 않습니다. 운영 DB와 기존 승인된 SQL migrations는 변경하지 않습니다.

## 2026-11-08 — 수동 환불 확정의 원결제·Provider 검증 자료 결속

- 기존 2310 내부 환불 확정 함수는 **회수 상태의 Receipt + 같은 취소 ID로 표시된 Event**만 확인했습니다. 그 Event가 **동일한 원결제 요청**, PortOne V2 전체 취소 GET 검증 형식, 전액·통화·원거래·서명 지문·검증기 버전까지 일치하는지는 확인하지 않았습니다.
- 새로운 개발용 정방향 migration `2370_commerce_reader_refund_confirm_exact_provider_lineage_v1.sql`은 기존 함수만 교체하여, 원본 Receipt, 유일한 결제 시도, 해당 Provider Event의 전체 취소 검증 payload를 **같은 DB 트랜잭션에서 다시 대조**합니다. 일치가 정확히 한 건일 때만 수동 결정 `confirmed` 상태를 허용합니다. 중복된 재시도는 기존 확인시각과 5년 보존 기준을 유지합니다.
- 격리 PG17 시나리오는 **취소 ID와 회수 상태는 일치하지만 금액이 다른 가짜 Provider Event**를 잠깐 합성하고, 실제 DB 함수의 확인 거부·이전 상태 롤백·고객 상태의 `refund_processing` 유지가 성립하는지 검증합니다. 모든 작업은 기존 테스트 트랜잭션의 ROLLBACK 안에서 실행합니다.
- **범위 제한:** 기존 법적 수동 승인과 검증된 PG GET을 대신하지 않으며, 운영 DB SQL 적용·실제 환불 POST·공개 권한/기능 활성화는 하지 않습니다. 신규 CI/PG17 실행이 완료되기 전에는 PASS를 주장하지 않습니다.
## 2026-11-08 — 원결제 Grant가 남아 있는 환불 확정 차단

- 2370 수동 최종 환불 확인은 원본 PortOne 취소 GET 증거 외에도 **같은 Receipt/Subject에서 발생한 모든 구매 Grant가 revoked**인지 재검사합니다. 다른 Receipt의 독립 구매권은 범위에서 제외합니다.
- 격리 PostgreSQL 17 부정 시험에서 금액·통화·원거래 ID가 모두 맞는 합성 취소 증거와 revoked Receipt가 있어도 기존 구매 Grant가 활성이라면 고객 상태가 환불 확정으로 승격되지 않도록 합니다. Provider의 실제 취소 요청이나 실제 환불/법적 제공 완료를 수행하거나 증명하지는 않습니다.

## 2026-11-08 — 동일 PortOne 취소 원본에 귀속한 구매권 회수 확인

- 고객 환불 상태 `refund_confirmed`의 비공개 함수는 이제 정확한 GET 검증 원본 취소 Event와 **그 Event가 실제로 회수한** 동일 Receipt의 구매 Grant/Event 증거를 함께 요구합니다. 단지 `status=revoked`이거나 다른 Provider Event가 먼저 회수했다는 이유만으로 환불 확정하지 않습니다.
- 격리 PostgreSQL 정상 성공·재실행과 다른 Event 회수 혼입 부정 시험을 각각 원상복구하며, 타 Reader 권리와 원 Claim을 보존합니다. 실제 PortOne 환불/운영 출시는 수행하거나 승인하지 않습니다.
