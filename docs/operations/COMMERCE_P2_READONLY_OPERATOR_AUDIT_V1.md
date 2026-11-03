# Commerce P2 — 수동 읽기 전용 상품·가격 점검 실행기

범위: P0-CM-03, standard.love_relationship, KRW 8,900 표시 가격(판매 승인 아님).

이 스크립트는 운영자가 직접 요청할 때만 상품·Reader 구매 단위·Offer·Charge Terms를 하나의 PostgreSQL REPEATABLE READ READ ONLY 트랜잭션에서 점검합니다. 일반 HTTP/API/CI 자동 실행에 연결되지 않습니다.

## 사전 구성
실제 점검을 실행하기 전에 안전한 비밀 관리 방식으로 아래 환경 변수를 지정해야 합니다. 비밀번호·URI 값을 명령어, 로그 또는 문서에 쓰지 마십시오.

- MYEONGHA_COMMERCE_P2_AUDIT_DATABASE_URL: 승인된 감사 DB 자격증명과 sslmode=verify-full을 포함한 URI
- MYEONGHA_COMMERCE_P2_AUDIT_EXPECTED_HOST: 승인 호스트
- MYEONGHA_COMMERCE_P2_AUDIT_EXPECTED_PORT: 승인 포트
- MYEONGHA_COMMERCE_P2_AUDIT_EXPECTED_ROLE: 승인된 감사 로그인
- MYEONGHA_COMMERCE_P2_AUDIT_CA_PEM: 공용 신뢰 루트 인증서 PEM
- MYEONGHA_COMMERCE_P2_AUDIT_CA_FINGERPRINT256: 독립 검증된 CA SHA-256 지문

실행: node scripts/operations/run-commerce-p2-readonly-audit-v1.mjs

## 결과
- HOLD_OBSERVED (종료 0): 예상된 비활성 상태를 관측했을 뿐 판매 허가는 아닙니다.
- INVESTIGATION_REQUIRED (종료 2): 카탈로그·Offer·Charge Terms 상태에 이탈이 있습니다.
- HOLD (종료 2): 접속/TLS/권한/자료 무결성 검증 불가입니다. 민감한 DB 예외나 접속 URI를 노출하지 않습니다.

출력은 항상 판매·체크아웃·Production Reader 전달 승인 false, DB 쓰기 false입니다. 운영 DB 실제 조회, 상품 판매 승인, Saju Production 공급, PG 계약, 고객 전달 및 LIVE 활성화는 별도 절차이며 이 코드 변경으로 충족되지 않습니다.
