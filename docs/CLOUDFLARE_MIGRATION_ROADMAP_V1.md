# 명하 Cloudflare 이관 실행 로드맵 v1.0

> 기준: 2026-10-20 KST / GitHub main 3f7e31c39c436474e6190058ea426e7a538e1cfc  
> 상태: **설계 단계 — Cloudflare 리소스 및 운영 환경 미변경**  
> 상위 설계: [Cloudflare Migration Architecture](./CLOUDFLARE_MIGRATION_ARCHITECTURE_V1.md)  
> 개발 트랙: ops / 기존 Vercel Production 계속 유지

## 0. 실행 원칙 및 완료 상태

진행 순서: **설계·인벤토리 → 로컬 정적 빌드 → 독립 Cloudflare 프리뷰 → HTTP API 거부 경계 → 인증·DB → 사주·관상 → AI·Commerce 별도 승인 → 전체 수락·복구 → DNS 운영 전환**.

- 설계 완료는 코드 구현 완료가 아니며, 프리뷰 성공은 Production 출시 승인이 아니다.
- 세연 최초 Reveal/기억 철회/전송 ACK의 미승인 상태, 기존 503 차단, 결제 및 사용자 정보 접근 권한을 유지한다.
- Vercel Production 또는 비밀정보를 제거하거나 Cloudflare 유료 플랜·DNS를 승인 없이 변경하지 않는다.
- 실제 코드와 결정 등록부가 로드맵보다 우선한다. 새 실행 시 fresh main과 해당 트랙의 운영 상태 확인 후 **필요한 작업만** 한다.
- 테스트는 정확한 완료 기준을 충족하는 범위만 실행하며, 이미 확인된 항목을 검증을 위해 반복하지 않는다.

완료 상태: NOT_STARTED(미착수), IN_PROGRESS(작업 중), EVIDENCED(정확한 SHA에서 증거 확인), HOLD(구체적인 의존성/승인 차단), ACCEPTED(해당 단계의 기술 수락), RELEASED(사용자 운영 승인에 따른 배포).

## 1. 현재 기준 상태

| 영역 | 현재 상태 | 근거 또는 의미 |
|---|---|---|
| Cloudflare 계정 | 접근 확인 | 2026-10-20 읽기 전용 API 조회 |
| Workers / Pages | **각 0개** | 프로젝트 생성·첫 배포 전 |
| Vercel 호스팅 | 기존 운영 유지 | 전환을 승인·실행하지 않음 |
| 프런트엔드 | React + Vite 멀티페이지 | 11개 HTML 진입점, build:web → public |
| API | Vercel 기반 | process.env, pg, TLS 등 Workers 호환성 미검증 |
| Supabase/사주 생산자 | 기존 권한 체계 유지 | 이관 대상 DB 아님 |
| 세연 AI | **독립 기술 출시 HOLD 유지** | 503 first reveal fence 우회 금지 |
| PortOne 결제 | **독립 공개/판매 승인 HOLD** | 결제 provider 선택과 출시 허가는 다름 |
| DNS/운영 전환 | 미실시/승인 필요 | Vercel fallback 유지 |

## 2. 선후 관계

| 순서 | 실행 영역 | 선행 조건 | 후속 판단 |
|---|---|---|---|
| 0 | 설계·로드맵 PR | GitHub 읽기/쓰기 | 문서만 검토 |
| 1 | 실제 라우트·의존성 inventory | fresh main | 정적 구성 범위 고정 |
| 2 | 로컬 Workers 정적 구성 | 1의 웹 빌드 확인 | 11개 HTML/header parity |
| 3 | Cloudflare 프리뷰 | 계정 리소스 생성·연동 승인 | 별도 Preview URL 수락 |
| 4 | API router·deny boundary | 2 및 3 | health/404/405/503 parity |
| 5 | Auth + DB 연결 | 보안·secret 사용 승인 | RLS/TLS/owner 수락 |
| 6 | 사주·관상 | 5 및 producer 계약 | 기능별 조건부 수락 |
| 7 | 세연 AI/Reader | 승인받은 기술 gate 범위 | 미승인 positive Reveal 0 |
| 8 | Commerce | Commerce 별도 승인 | 미승인 webhook·실판매 0 |
| 9 | CI·사용량·복구 | 적용할 기능별 수락 | 전체 프리뷰·비용·롤백 |
| 10 | DNS/운영 전환 | **사용자 명시 승인** | Vercel standby + 운영 관측 |

정적 검증과 API 의존성 분석은 일부 병렬 수행 가능하다. API 일부가 막혀도 정적 프리뷰는 진행할 수 있으나, 차단 중인 API를 개발 편의로 활성화해서는 안 된다.

## 3. 단계 0 — 이번 작업: 설계·로드맵 등록

**작업:** Cloudflare 최신 한도·설정 및 현재 main 배포 코드를 읽고 설계서를 작성한다. 별도 브랜치에 문서 두 개를 커밋한 뒤 PR을 생성한다. 기존 코드·워크플로·Vercel·Cloudflare 설정을 수정하지 않는다.

**산출물:** docs/CLOUDFLARE_MIGRATION_ARCHITECTURE_V1.md, docs/CLOUDFLARE_MIGRATION_ROADMAP_V1.md, PR 링크, 변경사항 기록.

**완료 기준:** 두 파일이 GitHub 브랜치에서 조회되고 PR에 Vercel 유지·승인 경계·다음 작업이 명시되어 있음. PR 작성과 main 병합은 다르며, 자동 병합하지 않는다.

## 4. 단계 1 — 실행 전 inventory (코드 사실 확정)

**작업**
1. fresh main의 vercel.json, api/ 전체, 앱의 실제 API 호출 목록, Vercel-specific redirect/rewrite/headers를 정확한 경로별로 기록한다.
2. 각 route의 GET/POST/OPTIONS, JSON shape, authorization, status, caching, error mapping, body handling, streaming/deadline, handler 호출 순서를 확인한다.
3. 별도 runtime compatibility 표에 Node 24, pg, node:net/tls/crypto, process.env, @vercel/oidc 실제 call-site, 공유 pool, Vercel 기능 제한을 기록한다.
4. 빌드를 실행해 전체 static asset 파일 개수/최대 크기/HTML 경로/민감파일 포함 여부를 측정한다.
5. 보안 비활성 경로를 분리: 세연 첫 Reveal, 권한 없는 기록, 유료 Reader, 공개 PortOne webhook, 미승인 AI/DB.

**산출물:** 후속 docs/CLOUDFLARE_MIGRATION_COMPATIBILITY_INVENTORY_V1.md에 URL → handler → 권한 → 테스트 → 결정(HOLD 또는 진행) 매핑.

**완료 기준:** 현재 Vercel API와 실제 클라이언트 호출의 미분류 항목 0. 불확실한 route는 추측해 열지 않고 HOLD.

## 5. 단계 2 — 로컬 정적 Workers 구성 (Cloudflare 계정 불변)

**작업**
1. Cloudflare 전용 Wrangler 설정을 Vercel 코드와 분리하여 작성; 정적 Assets directory 후보는 기존 빌드 출력인 public.
2. 기존 npm ci, npm run build:web를 재사용. Node24/npm lockfile, Vite output/asset path를 유지한다.
3. 명하가 멀티페이지이므로 SPA 일괄 index.html fallback 금지. html_handling, not_found_handling 값은 실제 /index.html·/chat.html·없는 URL 동작을 비교해 결정한다.
4. Vercel CSP·Referrer-Policy·nosniff·frame deny·robots noindex 동등 헤더 적용. 현재 정적 복사 allowlist는 _headers를 복사하지 않으므로 **명시적 생성/후처리**를 설계 및 구현.
5. /api/*가 정적 HTML 성공 응답으로 변환되지 않게 부정 테스트 구성. API 실호출은 이 단계에서 연결하지 않는다.
6. 기존 Vercel 빌드 회귀 및 파일 노출 검사 재실행.

**산출물:** Cloudflare config, 최소 script(필요 시), 정적 artifact 검사, 로컬 smoke 결과.

**완료 기준:** 11개 HTML 파일과 자산·헤더·404 정상, source map/secret 유출 없음, 기존 Vercel build PASS.

**차단:** Node/Workers runtime 불일치 시 해당 좁은 모듈만 수정. 막히는 API를 정적으로 위장하지 않는다.

## 6. 단계 3 — Cloudflare 독립 Worker 프리뷰

**별도 승인 대상:** Cloudflare Worker 프로젝트 생성, GitHub 저장소 연결 및 App 권한, preview 도메인 접근 범위. 기존 계정 결제·DNS·Production 전환 권한은 포함하지 않는다.

**작업**
1. 기존 Vercel main 자동배포는 유지하고 Cloudflare Builds가 main을 무단 운영 배포하지 않도록 preview-only 정책을 먼저 확정한다.
2. Worker명/production branch/preview branch/GitHub comment/build command와 output 위치를 설정한다.
3. Cloudflare URL에서 11 HTML·그림·CSS·JS·404·header·cache/noindex 파악, 정확한 Worker version과 SHA 기록.
4. Static preview의 API 경로는 미승인 200/stream을 반환하지 않는지 확인.
5. Cloudflare Build time, files, 번들 크기, 빌드 실패 복구 결과 기록.

**산출물:** 실제 Preview URL, 빌드/배포 증거, 안전한 도메인 접근 결과.

**완료 기준:** Vercel Production 무변경 + Cloudflare 프리뷰 분리, 정적 화면 PASS. 인증/결제/DB 기능을 검증한 것으로 선언하지 않는다.

**차단:** 계정 리소스 생성 승인이 없다면 이 단계만 HOLD하고 로컬 작업 지속.

## 7. 단계 4 — API 기본 router 및 오류 경계

**작업**
- health/readiness 후보 분리; readiness의 TLS canary를 공개 health로 오인하지 않는다.
- Vercel rewrite 1:1 보존을 위해 /api/auth/social/naver/*, /api/chat/:threadId/turns, /api/me/saju/preview-reading, /api/birth-profiles/:id 등 explicit matcher 작성.
- marker query parameter의 중복/변조, method mismatch, URL encoding, CORS preflight, host redirect와 OPTIONS를 negative 테스트한다.
- 기본 비활성 API는 기존 차단 또는 동급 이상 방어(404/503) 유지. 메서드나 unknown route에 200 HTML 반환 금지.
- secrets 미설정/timeout/redirect/응답 직렬화 실패도 보호된 오류로 귀결.

**산출물:** Worker API dispatcher + route matrix 시험 + 보안 헤더.

**완료 기준:** health 및 라우팅/오류 등 **비영업/비개인정보 경로** 동작 검증. 스테이징의 보호 경로 본문 누출 0.

## 8. 단계 5 — 인증·세션·Supabase/PostgreSQL

**작업**
1. Guest/Member 검증 → 서버 신뢰 subject resolver → canonical subjects.id 연속성 유지.
2. OAuth (네이버 포함) callback/redirect/state/CSRF/cookie Domain/SameSite/Secure 설정을 Cloudflare 호스트별로 분리하고 임의 wildcard를 열지 않는다.
3. Workers에서 pg 직접 TLS 또는 Hyperdrive 후보를 공식 지원·실제 명하 제약과 함께 비교한다. Hyperdrive를 쓴다는 이유로 전용 DB role·인증서·RLS·transaction context를 생략하지 않는다.
4. 프리뷰용 secret 이름/범위/rotation owner inventory 작성. Vercel secret은 자동 복사되지 않으며 GitHub/PR/로그에 값을 적지 않는다.
5. DB TLS verify-full, unprivileged login, role transition, transaction-local trusted subject, cross-user deny, expired guest, invalid OAuth, retry/cancellation 연결 끊김 검증.
6. 기존 DB schema나 Production 데이터를 대량 이동하지 않는다.

**산출물:** Worker runtime DB adapter(필요한 경우), secret mapping(값 제외), Auth/DB E2E, gate 증거.

**완료 기준:** 실제 보안 정책 및 현재 DB 권한 계약을 유지한 로그인/조회/거부 테스트 PASS. TLS/role/subject contamination 위험이 있으면 해당 API HOLD.

**승인 차단:** credential·OAuth callback 설정 및 user-data 실행 경로에 대한 Security/API/DB 승인.

## 9. 단계 6 — 사주 계산·관상 이미지

**사주**
- P0-SA-01의 별도 HTTPS 계산-only producer를 사용하고, server bearer/redirect refusal 및 version/policy/Birth revision correlation을 보존.
- 계산-only 응답으로 Reading/LLM 해석·유료 entitlement를 자동 활성화하지 않음.
- 정상 사주/미상 출생시간/타입 오류/producer outage/timeout/중복 요청의 status 및 shape parity.

**관상**
- 실제 이미지 route/quality/extractor source inventory 후 파일 크기·MIME·stream·ephemeral raw image·재시도·삭제·캐시/로그 금지 검증.
- CPU 10ms, 메모리 128MB, 외부 subrequest 50 내 가능 여부 **실측**. 한도 불충족 시 구조 변경 또는 별도 비용 승인안 마련.

**완료 기준:** 승인된 기존 기능만 정합성 PASS, 사용자 이미지 잔존/개인정보 노출 0. 실패 시 원본 Vercel 기능을 훼손하지 않음.

## 10. 단계 7 — 세연 AI·Reader / 기억 철회 / ACK

**작업**
1. 기존 Seyeon first Reveal hard fence의 정적 4xx allowlist, 나머지 503 차단 원칙을 Worker dispatch와 외부 전송 경계에서 보존한다.
2. G0-D04의 Security/API/DB 기술 승인 없이 protected assistant body, SSE/WS positive stream, memory read 권한 확대, commit/reveal 순서 변경 금지.
3. 첫 답변 commit, 전송 handoff, 사용자 ACK, abort/disconnect/retry/duplicate action의 실제 가능한 증명 범위를 구별해 기록.
4. 기억 승인·철회 후 Context Assembly 즉시 제외, Reader별 knowledge grant, Saju protected grounding, Output Guard의 negative 테스트.
5. OpenAI 서버 secret, store:false, 모델/비용·429 정책, prompt-injection 및 cross-reader/cross-user 테스트 유지.

**산출물:** 최소 호환 guard, 실패 시 고정 503, 승인 서명 및 실수신 조건에 따른 E2E.

**완료 기준:** 해당 Security/API/DB 승인과 기술 증거가 **실제** 존재할 때만 positive Reveal 대상 공개. 없으면 **HOLD — 기존 503 유지**.

## 11. 단계 8 — 결제·웹훅 / PortOne V2

**작업**
1. 최신 P0-CM-01/02/03/04와 메인 브랜치의 실제 active route 상태 확인.
2. provider webhook의 raw bytes 서명 검증 → timestamp/replay → 서버 PortOne payment lookup → amount/currency/product/environment exact 검증 → 멱등 grant 흐름 유지.
3. 이관 편의로 새로운 공개 webhook URL, 실결제 checkout, 상품 판매 및 entitlement grant를 먼저 활성화하지 않음.
4. Sandbox/격리된 모의 데이터에서 중복 전달·순서 역전·위조 이벤트·다른 owner grant 거부 확인.
5. Preview URL을 실수납 callback으로 등록하지 않음.

**산출물:** Commerce/보안 수락 기록, webhook route default HOLD 확인, 추후 live 활성화 별도 PR.

**완료 기준:** nonfinancial E2E PASS와 public payment launch 승인 구별. 승인 미존재 시 public route HOLD.

## 12. 단계 9 — CI, 성능·비용, 프리뷰, rollback 수락

**CI 운영**
- 기존 CI, web-pr-domain-gates, Vitest, 브라우저 smoke, API/DB/Commerce 테스트 재사용. 기존 기능/연구별 workflow를 다시 만드는 방식 금지.
- 변경된 Cloudflare 기능에만 조건부 Worker-specific build/test 추가하고 PR 및 exact git SHA와 연결.
- CI Watchtower의 고정 Track Key = ops, 브랜치와 PR의 Watchtower-Track 표기.
- 실제 Preview version/asset checksum/빌드 명령/변경 SHA/보호 경로의 negative test evidence 기록.

**한도·비용**
- 공식 Workers Free: API 100,000/day, CPU 10ms/request, 128MB memory, external subrequests 50/request, Workers 100, bundle 64MiB, 정적 20,000 files/version·개별 25MiB.
- Workers Builds Free: 월 3,000 build minutes, 동시 1개, build timeout 20분.
- 별도 OpenAI, Supabase, PortOne 청구 및 Cloudflare Paid 변경액을 계산; Paid 최소 $5는 **사용자 승인 후**만.
- 라우트별 CPU p50/p95/max, 메모리, request/429, 에러율, 비용 예상치를 실제 부하에 맞춰 수집. 프런트 정적 요청과 Worker API 요청을 별도 집계.

**복구**
- Cloudflare Worker Preview에서 이전 검증 version으로 rollback 후 정적/민감 route parity.
- 쿠키/로그인, 실패한 POST, 중복 요청, 중단된 AI/결제의 replay 방어 확인.
- Vercel 원본은 그대로 두고, DNS cutover 이전 Vercel fallback을 실측.
- secret rotation 실패, OAuth callback 실패, DB TLS 오류, AI/Producer timeout, billable request 급증 시 자동/수동 중단 기준 문서화.

**완료 기준:** 정확한 SHA에 연결된 모든 공개 대상 endpoint의 수락 증거 및 1회 이상 복구 rehearsal. 실제 Cloudflare 운영 전환 권한은 별개.

## 13. 단계 10 — 사용자 승인 이후에만 운영 전환

**사전 승인 필수**
- 모든 *공개 대상* 기능의 검증·권한·안전 Gate PASS 및 그 대상 목록 명시.
- G0-D04, Reader/Commerce/DB 독립 출시 미승인 영역은 전환 대상에서 제외하고 차단 유지.
- GitHub/Cloudflare 배포·결제·도메인/계정 변경을 사용자 승인.
- Vercel 마지막 정상 Production SHA, secrets·도메인 설정·rollback 담당자 확인.
- 장애 임계치, 사용자 impact, DNS TTL 및 원복 수단 승인.

**실행 순서**
1. 허용된 Cloudflare version과 exact SHA 고정, 승인된 callback/OAuth/DNS 설정만 적용.
2. 단계적 트래픽 이전 및 정확한 health/Auth/사주/관상/권한 거부/차단된 AI·결제 경로 smoke.
3. 오류율/CPU/요청·비용이 기준을 초과하면 Worker rollback 또는 Vercel DNS 원복.
4. 안정적 운영 증거를 별도 판정하고, Vercel 종료는 **새로운 사용자 승인** 전까지 보류.

**절대 금지:** GitHub에 문서/코드가 올라갔다고 Vercel 또는 실제 DNS·결제 설정을 자동 삭제/전환.

## 14. 단계 상태판 (2026-10-20 시작 기준)

| 단계 | 시작 상태 | 완료 증거 | 승인/차단 |
|---|---|---|---|
| 0 문서 PR | 진행 중 | 2문서 commit 및 PR | main 자동 병합 없음 |
| 1 inventory | NOT_STARTED | 전체 route/dependency 표 | 미확인 사실 임의 추정 금지 |
| 2 local static | NOT_STARTED | build + 11 HTML/404/header | API 실제 호출 불필요 |
| 3 Cloudflare Preview | NOT_STARTED | Worker version + preview URL | 프로젝트/연결 승인 필요 |
| 4 router deny | NOT_STARTED | negative route/method parity | AI 503 유지 |
| 5 Auth/DB | NOT_STARTED | role/RLS/TLS/OAuth E2E | credentials·Security 승인 |
| 6 Saju/Face | NOT_STARTED | calculation/image parity | P0-SA-01 범위 제한 |
| 7 Seyeon/Reader | HOLD | signed G0-D04 & ACK evidence | 첫 Reveal 미승인 |
| 8 PortOne | HOLD | sandbox/실운영 별도 evidence | 공개 webhook/실판매 미승인 |
| 9 CI·비용·rollback | NOT_STARTED | exact-SHA report/rehearsal | 필요한 과금 별도 승인 |
| 10 DNS cutover | HOLD | 사용자 운영 승인 및 이전 기록 | Vercel 유지 |

이 표의 NOT_STARTED는 명하의 전체 기능 미구현이라는 뜻이 아니라, **Cloudflare 이관 작업으로 확인·구현하지 않았음**을 뜻한다. 일부 검증 성공을 나머지 미승인 단계의 권한으로 사용하지 않는다.

## 15. 반드시 남길 증거

| 필드 | 기록 원칙 |
|---|---|
| 작업 시점 | KST date/time |
| 기준 SHA | 40자리 exact git SHA |
| 범위 | 변경된 파일, 생성한 Cloudflare 리소스 |
| 배포 | 실제 Worker version/Preview URL만 |
| 테스트 | 실제 명령·시나리오·pass/fail |
| 보안 | 첫 Reveal/유료/DB route의 HOLD 또는 승인 문서 |
| 비용 | Free/Paid 승인 여부, 실제 한도 계측 |
| 복구 | 이전 버전 및 Vercel 경로의 준비·리허설 |
| 다음 | 실제로 이어 실행할 최소 작업 |
| 차단 | 승인 소유자와 사유(추측·자격 증명 원문 금지) |

Secret 값, 사용자 Birth/chat/memory/Face 원본, JWT, 결제 receipt, provider raw body를 PR·로그·스크린샷에 기록하지 않는다.

## 16. 승인 구간과 승인 전 가능한 작업

| 사용자/타 팀이 승인해야 할 것 | 승인 전 허용되는 작업 |
|---|---|
| Worker/Repo GitHub 연결 | Wrangler 코딩·로컬 테스트 |
| Preview 생성/접근 공개 | 로컬 정적·보안 검사 |
| Cloudflare secret/DB 접속 | mock/negative boundary/목록 작성 |
| OAuth redirect/provider 변경 | 정확한 허용 URL matrix |
| Security/API/DB G0-D04 | 세연 503 유지, 거부 경계 검사 |
| PortOne callback/merchant | 서명·lookup mock 테스트, route 차단 |
| Workers 유료 플랜/과금 수단 | Free 리소스 예산 계측 |
| DNS/운영 전환 | Preview와 rollback 수락 |

## 17. 후속 PR 범위(불필요하게 쪼개지 않음)

- 문서 PR(이번): 설계·로드맵만.
- 구현 PR: Cloudflare static/build/header/경로 parity.
- 검증 PR: 필요한 기존 CI 확장 및 Preview E2E.
- API PR: health/router/denial 먼저, Auth/DB와 Saju/Face는 독립 검토.
- 세연/Commerce 변경: **승인된 정확한 scope만** 좁게 작업.
- 운영 PR/Runbook: Worker version rollback, 비용, DNS 이전.

각 PR에는 Watchtower-Track: ops 표시. 다른 도메인 authority를 바꾸는 PR은 원 트랙 담당자 검토를 요구한다.

## 18. 완료·보류 판정

- **부분 완료:** 정적 Cloudflare 프리뷰가 동작해도 인증/DB/세연/결제 미승인이라면 해당 범위는 HOLD.
- **전체 수락:** 공개 대상 route 전부 정확한 SHA/실행환경/거부·정상 테스트 및 rollback 증거가 존재하며 승인 주체가 확인.
- **운영 완료:** DNS/계정/요금 변경에 사용자 명시 승인 + 서비스 전환 결과/복구 경로 증거가 있을 때.
- **중단:** Worker CPU/비용/보안/권한 문제를 무시하지 않고 기존 Vercel 유지; 필요 시 유료·하이브리드·계속 Vercel 중 사용자에게 근거 있는 선택지를 제시.

## 19. 후속 작업자가 가장 먼저 읽을 자료

- [설계서](./CLOUDFLARE_MIGRATION_ARCHITECTURE_V1.md)
- docs/P0_DECISION_REGISTER.md, docs/AI_SECURITY_TRUST_BOUNDARY_V1.md, docs/READER_RUNTIME_SEYEON_FIRST_RELEASE_GATES_2026-10-09.md
- vercel.json, package.json, apps/web/vite.config.ts, scripts/build-web-static.mjs, api/, apps/api/src/
- 기존 CI: .github/workflows/ci.yml 및 .github/workflows/web-pr-domain-gates.yml
- 최신 [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), [Static Assets](https://developers.cloudflare.com/workers/static-assets/), [Rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/), [Limits](https://developers.cloudflare.com/workers/platform/limits/)

## 20. 작업 보고 기준

**한 작업:** 실제 수정·검증된 결과를 한두 줄.  
**남은 작업:** 핵심 미완료 항목 한두 줄.  
**다음 작업:** 로드맵 기준 즉시 수행할 일 한두 줄.  
**승인/차단:** 실제 승인 또는 blocker가 있는 경우에만 한두 줄.

내부 단계명만 보고하지 않고 사용자가 이해할 수 있는 기능·효과를 우선한다.
