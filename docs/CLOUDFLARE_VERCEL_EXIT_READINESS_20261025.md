# Cloudflare → Vercel 종료 준비: Ops 코드·운영 경계

- 점검 시점: 2026-10-25 KST
- 개발 출발점: main `5c95e8f9` (Cloudflare 운영 버전과 별개의 소스 SHA)
- 범위: 읽기 전용 원격 점검 + 인증 호스트 호환성 코드. 운영 배포·DNS·Vercel·DB·Provider 설정 변경 없음.

## 실제 확인

| 경계 | Vercel | Cloudflare |
| --- | --- | --- |
| / 및 /auth.html /birth.html /chat.html /reading.html /my.html | HTTP 200 | HTTP 200 |
| /api/health | HTTP 200 | HTTP 200 |
| /api/readiness | HTTP 200, userData ready / sajuCalculation ready | HTTP 503, userData unready / sajuCalculation degraded |
| 존재하지 않는 정적 경로 | 404 | 404 |

- Cloudflare `myeongha` 최신 관측 운영 버전: `33224f25-1599-444c-a5e7-0f7594b4928c` (#83, 100%).
- 버전 #83에서 이전 대상 12개의 **secret_text 바인딩 이름**은 모두 확인됨. 이름의 존재는 내용 동등성 검증이 아님.
- Vercel 원본 digest 12/12 일치가 확인된 Cloudflare 이관 버전 #79 (`3d1abaed-e724-4da5-ac72-c47801ed9499`)는 별도 미배포 버전. #79의 검증 증거를 #83으로 승계했다고 단정하지 않음.
- Worker에는 사용자 정의 도메인 연결이 관찰되지 않음. 현재 `myeongha.vercel.app`은 계속 Vercel 소유 호스트.
- `/api/readiness`는 설정 검증용으로 DB TCP 연결·실제 OAuth·사주 producer 가용성까지 검증하지 않음.

## 코드 변경의 적용 범위

- 이미 허용된 Vercel/Workers dev 주소의 로그인 동작은 유지.
- 새 Cloudflare HTTPS 사용자 정의 도메인에는 웹 OAuth 콜백을 **브라우저 동일 출처**로 생성. Vercel Preview/localhost/미등록 Workers sibling은 기존 Vercel 콜백 유지.
- Worker native Member Auth는 **바인딩에 명시된 정확한 HTTPS origin**, Auth DB mode 및 단계 5 DB TLS/RLS 승인, OAuth 요청의 별도 callback 일치를 충족할 때만 새 도메인에서 활성화.
- 클라이언트가 보낸 origin/redirectUri로 서버 허용 목록을 확장하지 않으며, Supabase Provider 콜백 등록도 자동 변경하지 않음.
- Cloudflare readiness 503을 200으로 위장하거나 Secret/DB/Provider 안전 게이트를 완화하지 않음.

## 종료 전 남은 필수 조건

1. Cloudflare #83 활성 secret 값과 이관 검증 대상 값의 일치 여부를 **원문 노출 없이** 따로 확인. 새 배포가 필요한 경우 별도 사용자 승인.
2. Cloudflare readiness `userData: ready` 및 `sajuCalculation: ready` 확보. 기존 `workers/cloudflare-readiness.mjs`에 비밀값 없는 소유자 로그 분류 `CF_READINESS_PREFLIGHT_V1`가 있으므로 운영 로그의 고정 카테고리로 차단 원인을 식별. 오류 메시지나 Secret 값은 기록 금지.
3. 정확한 사용자 정의 도메인, OAuth callback/provider allowlist, DB TLS/RLS 호스트 승인 매트릭스 확정.
4. 실제 로그인·Guest·Member·DB 조회·사주 계산·차단된 세연/결제 경계의 E2E 및 기존 브라우저 세션 전환/복구 점검.
5. 새 버전 정확한 SHA의 Preview 수락·rollback rehearsal, 운영 전환 승인, 안정화 증거 확보.
6. Vercel 완전 종료는 별도 최종 승인 전까지 금지. Cloudflare 코드 준비와 실제 Production 전환은 서로 다름.

Watchtower-Track: ops
