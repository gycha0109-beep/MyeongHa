# 결제 트랙 개발 전용 로드맵 — 모바일 고객 청약철회 접수 연결 (2026-11-03)

## 구현

- 기존 서버의 고객 접수 API \`POST /api/me?__myeongha_withdrawal_claim=1\` 및 계정별 상태 조회 \`GET\`에 **명하 공용 API 클라이언트**를 연결합니다.
- 모바일 회원 인증 코디네이터의 \`withMemberBearer\`만 사용합니다. 게스트 자격증명으로 폴백하지 않습니다.
- 요청 전송 시 \`credentials: 'omit'\`으로 브라우저/네이티브 쿠키를 명시적으로 제외하고, \`Authorization: Bearer\`만 전달합니다. 서버 측 JWT 검증과 Subject 격리는 별도로 유지합니다.
- 제출 성공은 서버가 반환한 \`claimId\`, \`receivedAt\`, \`status: received\`, \`refundApproved: false\`, \`providerRefundCompleted: false\`의 정확한 형식이 확인된 때만 인정합니다. 상태 조회는 해당 접수 ID와 허용된 상태만 인정합니다.
- 모바일의 계정 전환·로그아웃 중 지연 응답이 도착하면 결과를 폐기하고, 화면의 과거 접수 번호·중복방지 번호를 초기화합니다.
- 모바일 마이 화면에는 회원일 때만 표시되는 청약철회 접수/상태 조회 폼을 연결합니다. 주문번호를 모르면 일반 민원으로 접수할 수 있으며, 환불 승인으로 표시하지 않습니다. 불확실한 통신 재시도는 동일한 중복방지 UUID를 사용합니다.

## 운영 경계

- 앱 화면·모바일 API 클라이언트는 \`EXPO_PUBLIC_MYEONGHA_WITHDRAWAL_REQUEST_ENABLED=1\` 빌드가 아닌 한 **기본 OFF**입니다. 운영 서버의 \`MYEONGHA_WITHDRAWAL_CLAIM_ENABLED\`와 DB 마이그레이션 게이트도 독립적으로 OFF이며 이 PR은 이를 바꾸지 않습니다.
- 운영 판매·PG 환불 POST·Reader Grant 회수·DB 마이그레이션·상품 활성화·LIVE는 수행하지 않습니다.
- 모바일 nonce 생성은 \`globalThis.crypto.randomUUID\`가 제공될 때만 수행하며, 안전한 난수 API가 없다면 자동 접수를 시도하지 않고 오류로 종료합니다. \`Math.random\` 폴백은 사용하지 않습니다.
- 본 개발은 **고객 접수 인터페이스의 비활성 구현**이며 실제 디지털 콘텐츠가 고객에게 전달되었다는 법적 증거를 새로 만들지 않습니다.

## 검증

- \`test/commerce-mobile-withdrawal-claim-client.test.ts\`: exact member Bearer, 쿠키 생략, 일반/정확한 구매 단위, 중복방지, 서버 접수 응답 검증, 전환된 세션 차단, 게스트/기본 OFF.
- \`test/commerce-mobile-withdrawal-ui-release.test.ts\`: 마이 화면 회원·릴리스 게이트, 전역 보안 난수, 인증 상태 변경 시 기존 민감 결과 초기화.
- 실제 CI와 필요 시 격리 앱 빌드 결과가 성공하기 전까지 구현 검증 완료를 선언하지 않습니다.

## 후속 개발

- 기존 Reader S7에 기록되는 실제 전달 시도·고객 확인과 운영 증빙은 콘텐츠 공급 입증과 구분하여 검증합니다.
- 고객 접수와 정확한 구매/Receipt/원본 Grant 사이의 비운영 격리 연결, account deletion/restore replay 및 종단 간 통합 검증을 개발 전용 로드맵대로 진행합니다.
