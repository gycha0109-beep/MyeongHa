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

- Cloudflare `myeongha` 최초 점검 당시 운영 버전: `33224f25-1599-444c-a5e7-0f7594b4928c` (#83, 100%). 이후 다른 트랙의 독립 배포가 이어져 고정된 최종 운영 버전이 아님.
- 2026-10-25 15:09 UTC 추가 조회: 100% 운영 버전 `ae4d8c9b-3c14-464d-a81d-1226db7dde6d`, `/api/readiness` 503. 같은 버전의 15:04 UTC owner-only `CF_READINESS_PREFLIGHT_V1` 로그 분류는 **`DB_LOGIN_MISMATCH`**. 앞선 두 버전의 owner-only 로그에는 `DB_PORT_MISMATCH`와 `DB_URL_TRANSACTION_...` 계열 분류도 있었음. 이는 버전별 진단이며 현재 버전의 모든 실패 원인이 같다고 추정하지 않음.
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

## Stage 9/10 — Vercel 종료 판정 자동화 (미배포)

- 명령: `npm run audit:vercel-retirement` (읽기 전용; HOLD도 정상적인 판정 결과이므로 종료 코드 0).
- 강제 게이트: `npm run verify:vercel-retirement` (종료 준비가 완료되지 않으면 종료 코드 2). 실제 종료 작업을 호출하지 않음.
- 수락 증거 파일을 사용하려면 `node scripts/verify-vercel-retirement-readiness.mjs --evidence <검증된-증거.json> --require-ready`. 파일은 `schemaVersion: myeongha-vercel-retirement-evidence-v1`, 실제 활성 `workerVersion`, 전체 40자리 `gitSha`, `checks.<독립 게이트>.{passed,evidenceRef}` 형식이며, `evidenceRef`는 동일 저장소의 PR·Actions·40자리 SHA 고정 문서 링크만 허용. 기존 SHA 또는 다른 버전의 증거는 재사용할 수 없고, URL 형식 검사 자체가 증거의 참실성을 증명하지는 않음. 승인 전 증거를 임의로 true 처리하지 않음.
- 진단 로직: 두 정본 도메인의 정적 12경로 HEAD(원본 11개 HTML와 루트), health/readiness JSON 최소 필드, Worker API 버전 헤더 시작/종료 일치. 공개 정보 및 열거형 실패 코드만 출력; 응답 본문·쿠키·비밀번호는 출력하지 않음.
- 종료 승인 조건: DB/사주 readiness 200과 ready, 정상 Vercel 대기 원본, 고정된 Worker 버전 외에도 OAuth/DB/Guest/사주 실 E2E, 보호된 AI/Commerce 차단, 시크릿 동등성, CI, rollback, 사용자 도메인 전환·최종 종료 승인 각각의 **독립 증거**.
- 이 명령은 도메인 변경, OAuth 등록, 배포, 병합, Vercel 종료, 시크릿 이전을 실행하지 않음. 읽기 전용 HTTP 성공만으로 종료를 승인하지 않음.
- 최초 실제 원격 실행: `HOLD`, Worker `3725d2ac-af83-4fcb-915c-6d9ae856a23c`, Vercel userData/sajuCalculation `ready/ready`, Cloudflare `unready/degraded`. 미확인 수락 증거는 각각 누락으로 명시.
- 검증: 신규 종료 게이트 단위 테스트 6개 및 기존 Cloudflare Auth/Primary E2E 테스트 포함 총 23개 통과(2026-10-25 UTC 기준).

Watchtower-Track: ops

## Stage 5 도메인 활성화 누락 경로 보완

- Native Member Auth 의 새 custom HTTPS host 에 대해 Worker Auth/DB/Callback admission 을 적용.
- 소셜 로그인 시작 API 에 서버가 승인한 `webOrigin` 을 명시해 Client 의 동일 출처 콜백 URI 를 Provider 에 전달. 임의 Host 또는 Vercel 콜백을 해당 Cloudflare 세션의 fallback 으로 허용하지 않음.
- 이메일 회원가입 확인 링크도 `approvedWebOrigin` 을 받은 경우에만 같은 도메인으로 생성; Vercel 기본 요청은 기존 허용 목록과 callback 을 그대로 사용.
- 올바른 승인값이 없는 Cloudflare custom host 는 Member API 404, 공개 처리 불가. Provider callback allowlist 외부 등록은 자동 수정하지 않음.
- 활성 Worker 에서 분류된 `DB_LOGIN_MISMATCH` 는 **Cloudflare DB URL login 과 전용 login principal / Supabase tenant suffix 의 불일치**를 뜻함. source secret 없이 코드를 완화하거나 임의 login 을 생성하지 않으며, 올바른 DB 전용 계정 및 접속 URL 을 검증해야 함.
- 운영판 readiness 503 은 보안 gate 실패이며 앱 중단이 아니라 전환 차단. 이 수정 브랜치에서는 DNS, Production DB/secret, Cloudflare deployment 불변.

Watchtower-Track: ops

## Cloudflare 기존 익명 E2E 실제 실행

- `node scripts/verify-cloudflare-primary-e2e.mjs` → 익명 14/14 경계 PASS.
- `/api/readiness=503`, 익명 `/api/me=503`, 사주 계산 `503`, 사주 preview `503` 이므로 DB·사주 positive 기능이 준비된 것은 아님.
- 권한 없는 외부 Origin 로그인 `403`, 잘못된 API `404`, 보호된 Chat/세연 401/503 유지 확인.
- Vercel 종료 게이트는 위 익명 E2E PASS 와 별개로 반드시 `HOLD`; live Member/DB/Saju E2E 와 롤백 증거는 확보되지 않음.

Watchtower-Track: ops

## Dedicated Cloudflare DB role and offline preflight (2026-10-26 KST)

- Supabase project metadata (read-only) confirms dedicated login role `myeongha_cf_api_login` is LOGIN=true, BYPASSRLS=false, SUPERUSER=false, member of `myeongha_api_executor`, and authorized until 2027-04-21 UTC. The DB account does **not** need to be recreated or escalated to a privileged/default account.
- `npm run verify:cloudflare-db-handoff` runs a **read-only offline advisory** on the invoking process environment for the canonical primary Worker origin; no secrets are provisioned or retrieved. It makes zero network calls and prints only a bounded `CONFIG_CONTRACT_PASS` or `HOLD` category. It never prints DB URL, username, host, password, root certificate or private origin. No environment is auto-loaded: missing source values must fail closed.
- Exact contract for `myeongha`: `MYEONGHA_DATABASE_PRINCIPAL=myeongha_cf_api_login`; Supavisor login account is this role plus the fixed, governed project tenant suffix; URL host+port exactly match separately approved Worker bindings; required TLS peer mode is `verify-full` with configured root CA. A legacy Vercel DB login or the `myeongha_api_executor` NOLOGIN role is not a valid substitute.
- A `CONFIG_CONTRACT_PASS` **only proves local syntax and binding agreement**. It does not prove Supavisor password authentication, DB socket availability, session RLS, actual Worker Secret parity or the positive Member/Saju E2E. Worker version #79 secret digest verification cannot be assumed to cover later automatically deployed versions.
- Production `MYEONGHA_DATABASE_URL` and the dedicated login role's **matching credential** must be provisioned through the already authorized secure secret handling workflow. Never copy Vercel's unrelated DB password or silently alter an existing database login.
- Previous live Cloudflare /api/readiness remains HTTP 503. The preflight does not change it or bypass its gate.
- Cloudflare deployed Worker / DNS / Supabase DB roles / Vercel production / PR merge remain untouched in this Ops branch.

Watchtower-Track: ops
