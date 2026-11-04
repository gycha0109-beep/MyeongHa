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
