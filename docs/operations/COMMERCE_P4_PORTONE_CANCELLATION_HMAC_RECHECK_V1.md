# Commerce Payment P4 — PortOne V2 취소 ID HMAC 재조회 연결

작성일: 2026-10-31

## 목적

기존 비배포 취소 Provider Event 기록(`commerce-portone-cancellation-source-v2`)은 개인정보 최소화로 원본 `cancellationId` 대신 `hmac-sha256:k1` 지문만 보유합니다. 따라서 나중에 PortOne V2의 현재 `GET /payments/{paymentId}`에서 정확한 취소 항목을 다시 확인하려면 원본 ID를 별도 저장하지 않는 안전한 재대조 기능이 필요합니다.

## 실제 구현

- 기존 미배포 서버 전용 `inspectPortOneV2CancellationViaGetCandidateV1`에 `cancellationIdHmac`과 `sourceHmacSecret` 내부 인수를 추가했습니다.
- 원본 영수증에서 확정한 Payment ID의 인증된 GET 응답 내 최대 64개 취소 항목의 ID로 `HMAC-SHA256(secret, JSON.stringify(['portone-cancellation-item-v1', paymentId, cancellationId]))`를 임시 계산하고 저장 지문과 일정 시간 비교합니다.
- 지문이 **정확히 한 건** 매칭돼야 기존 상태·개별 성공 금액·누적 취소액 분류기에 해당 ID를 전달합니다. 원본 취소 ID·비밀키는 반환하거나 저장하지 않습니다.
- 잘못된 키·지문·원본 Payment ID·동시 raw ID 지정·중복 매칭은 거부합니다. `REQUESTED`와 `FAILED`는 `SUCCEEDED`로 승격하지 않습니다. 3,000원+5,900원 취소가 합산 8,900원이 된 경우에도 해당 HMAC이 가리킨 건의 금액을 정확히 구분합니다.
- 기존 내부 raw-ID 이용 경로는 그대로 유지하며, 고정 출처/인증된 GET, 10초 제한, JSON/응답 크기 제한, GET-only 설정을 변경하지 않습니다.

## 안전과 검증 범위

- PortOne GET의 지문 매칭 외에도 `scripts/operations/commerce-stored-portone-cancellation-hmac-recheck-v1.mjs`를 추가하여 **저장된 개별 취소 Provider Event → 검증된 원본 Receipt/Purchase Intent → 정확한 Reader Grant**의 일대일 DB 계보를 완전 가시성·읽기 전용 트랜잭션에서 확인한 후, DB 트랜잭션을 종료하고 인증된 최신 PortOne GET으로 재대조합니다. 원본 항목 금액 변화·누적액 감소·원본 결제/통화 불일치·취소 실패·다른 Reader 권한·중복 DB 결과는 거부합니다. `test/commerce-stored-portone-cancellation-hmac-recheck-v1.test.mjs`의 별도 23개 검증을 추가했습니다.
- 운영 엔드포인트, DB 마이그레이션, PG 환불 POST, Reader Grant Effect는 추가하지 않습니다.
- 관련 Vitest 8개 파일 **172건 PASS**, TypeScript 검사·빌드 PASS. 합성 GET 응답 기반으로 동작을 검증했으며 실제 PortOne 계정 또는 운영 결제를 호출하지 않았습니다.
- 이 단계에서 **Provider 순서 NEWER/STALE 판단, 법정 환불 판정, 실제 정산 완료, Reader R2/T2 최종 제공 잠금·실제 권한 회수 권한은 여전히 미검증·비활성**입니다. 단순히 HMAC과 최신 응답이 일치해도 회수 허가는 되지 않습니다.
- 공식 PortOne V2 Payment API 참고: https://developers.portone.io/api/rest-v2/payment
