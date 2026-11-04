# Commerce Reader S7 — 모바일 수신 확인 식별자·인증 전송 보완

**결제 트랙 개발 전용 로드맵:** 2026-11-03 실행 로드맵 3번(실제 결과물 제공·고객 확인).

## 이번 변경

- 유료 Reader 결과물 전용 모바일 GET의 전달 시도 UUID는 암호학적 난수 기능에서만 만듭니다. 기존 일반 채팅의 호환용 비보안 난수 대체 경로를 더 이상 재사용하지 않습니다.
- 기기가 crypto.randomUUID를 지원하면 v4 UUID 형식을 검증합니다. 없을 때 crypto.getRandomValues의 안전한 난수 16바이트로 v4 UUID를 만듭니다. 둘 다 없으면 결과물을 요청하기 **전** 오류로 종료합니다.
- Reader의 유료 해설 GET과 독립된 수신 확인 POST 모두 credentials: 'omit'을 지정합니다. 네이티브 Member Bearer만 사용하며, 앱 환경에 남아 있는 Cookie를 요청에 포함하지 않습니다.
- 기존 S7 서버 수신 확인은 고객이 콘텐츠를 실제로 읽었다는 법적 입증이나 청약철회 거절·환불 자동 승인 근거가 아닙니다. S5 저장, 응답 준비, 클라이언트 화면 배치, S7 ACK를 구별하며 DELIVERED_PROVABLE을 새로 주장하지 않습니다.

## 범위 및 검증

- 코드: apps/mobile/src/features/chat/mobile-paid-reader-delivery-id.ts, apps/mobile/src/features/chat/mobile-paid-reader-delivery-service.ts
- 테스트: test/mobile-paid-reader-native-receipt-transport.test.ts에서 안전 UUID v4, 암호학적 난수 미지원 시 요청 차단, 서버 GET 및 ACK의 동일 원본 시도 식별자·Cookie 배제·회원 Bearer·응답 계약을 확인합니다.
- 검증 완료는 PR CI 및 통합 검증의 실제 통과 결과를 확인한 뒤에만 선언합니다.
- 비활성 서버 유료 해설 공개 라우트·기존 Reader T2·실제 결제·실제 PG 환불·운영 마이그레이션·법적 판단·LIVE를 활성화하지 않습니다.

## 남은 로드맵

PortOne Provider 이벤트 순서의 신뢰 가능한 판정, 정확한 Entitlement 회수 선형화, 서버가 독립적으로 입증할 수 있는 실제 소비자 전달 완료 기록, 청약철회 개인정보 복원 후 재삭제 검증, 전체 구매→전달→환불/취소→삭제 격리 통합 검증은 여전히 별개입니다.
