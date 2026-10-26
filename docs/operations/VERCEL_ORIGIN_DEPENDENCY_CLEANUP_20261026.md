# Vercel 원본 의존성 정리 — 2026-10-26

작업 트랙: Ops / 기존 브랜치 `feat/ops/cloudflare-vercel-exit-readiness-20261025`, Draft PR #2597.

## 실제 제품 코드에서 정리한 의존성

- 모바일 런타임의 기본 API origin을 `https://myeongha.gycha0109.workers.dev`로 변경했습니다. 모바일 출시 사전검사도 정확히 이 origin만 승인하고 기존 Vercel origin을 거부합니다.
- 네이버 OAuth bridge는 기본 Cloudflare 요청에 같은 Cloudflare callback을 사용합니다. **기존 Vercel 호스트에서 수신한 요청에 한해서만** Vercel callback을 유지하고, 임의 요청 호스트를 승인하지 않습니다.
- Supabase 이메일 인증의 미인증 호스트 fallback을 Cloudflare로 변경했습니다. Vercel의 실제 동일 출처 요청은 사용 중인 대기 서비스를 깨뜨리지 않도록 그대로 Vercel로 돌아갑니다.
- 웹 소셜 callback helper는 승인된 Worker/custom host에는 같은 출처, 정확한 Vercel 운영/프로젝트 Preview 호스트에는 기존 Vercel callback을 반환합니다. 다른 도메인에서는 callback이 없으며 브라우저는 소셜 인증 요청을 시작하지 않습니다.
- Stage 9/10 종료 게이트의 `approvedPublicOrigin`은 **정확한 정본 Workers URL 또는 승인된 별도 HTTPS 사용자 정의 도메인**의 두 선택지를 허용합니다. 사용자 정의 도메인은 기술적으로 필수 조건이 아닙니다. 다른 Workers alias·Vercel·테스트/사설 호스트는 계속 거부합니다. 필수 E2E, 롤백, 운영 안정성, 명시적인 최종 종료 승인은 생략할 수 없습니다.

## 의도적으로 남겨 둔 Vercel 전용 운영 절차

다음은 클라이언트가 호출하는 기본 API가 아니라 **Vercel 운영 서비스를 관리·검증하는 코드**입니다. 실제 Vercel 종료 시 더 이상 실행하지 않거나, 동등한 Cloudflare 운영 절차로 대체해야 합니다.

- `.github/workflows/mobile-push-production-activate.yml`: Vercel Production 재배포와 기존 호스트 검사 포함.
- `.github/workflows/production-saju-service-origin-binding.yml`, `.github/workflows/production-saju-redeploy-recovery.yml`: Vercel 환경 변수 갱신 및 복구.
- Vercel 전용 WAF/Member/Guest/Postgres canary·운영 스크립트 및 관련 GitHub Actions: 기존 Vercel 배포를 대상으로 하므로 Cloudflare 보안 점검과 동일하다고 간주하지 않습니다.
- `config/security/production-security-alerting-v1.json`: 기존 Vercel 운영 도메인과 알림 토큰 관리.
- `vercel.json`: Vercel 대기 서비스를 현재까지 유지하는 설정입니다. 실제 종료 전에 무조건 제거하거나 운영 배포를 끊지 않습니다.

## 소스 수정만으로 해결되지 않는 잔여 항목

1. 이전에 빌드·설치한 모바일 앱에 Vercel URL이 포함돼 있다면 **소스 수정만으로 해당 바이너리는 변경되지 않습니다**. 출시·배포 상태와 재빌드가 필요합니다. 스토어 배포 여부는 확인되지 않았습니다.
2. `myeongha.vercel.app` 사용자·공유 링크는 Vercel 소유 주소입니다. 프로젝트를 삭제한 뒤 그 주소에서 새 Cloudflare 주소로 영구 리디렉션을 제공할 수 있다고 가정하면 안 됩니다. 기존 링크 이관과 신규 공지·진입점 확인이 필요합니다.
3. Supabase 및 네이버·기타 OAuth 제공자에 등록된 **실제 redirect allowlist**의 상태와 Cloudflare 콜백 성공은 아직 독립적으로 검증되지 않았습니다. 서버 코드만 수정해도 등록값은 바뀌지 않습니다.
4. Worker `/api/readiness` 200은 전체 보호 API의 양성 E2E 검증이 아닙니다. 실제 사용자 인증/DB/사주·보호 경계 수락, 정확한 Worker 버전, 롤백 및 안정성 증거가 필요합니다.
5. 이번 작업은 **소스 브랜치 변경**입니다. 기존 배포 버전, DNS, Vercel 프로젝트, 앱 바이너리, Supabase·OAuth 제공자 설정, 실제 운영 시크릿은 변경하지 않았습니다.

## 종료 판정

정확한 Cloudflare Worker 또는 사용자 정의 도메인을 최종 공개 origin으로 선택한 다음, 해당 origin에서 독립 수락 증거를 모아 `npm run verify:vercel-retirement`의 `ELIGIBLE_FOR_MANUAL_RETIREMENT`를 확인하십시오. 실제 서비스의 Vercel 사용 중단은 최종 사용자 승인 전에는 수행하지 않습니다.


## 2026-10-26 최종 CI / 운영 재검사 (읽기 전용)

- 기존 Ops Draft PR #2597, 커밋 `7805853b2c00a4e78acace921a9bb82cc63f71f2`: 연결된 5개 워크플로 모두 완료·성공. 종합 CI: https://github.com/gycha0109-beep/MyeongHa/actions/runs/40256805729
- `node scripts/verify-cloudflare-primary-e2e.mjs`: 익명 E2E 14/14 통과. 정적 웹, readiness 200, 무인증 Member/Saju 차단, 외부 Origin 차단, Chat 보안 HOLD를 확인. **인증된 Member 로그인·사주 실제 계산 성공 증거는 아님.**
- `npm run audit:vercel-retirement`: 실제 Cloudflare 버전 `d0cb53be-262f-423a-8b5f-276ca35a3816`을 조회. Vercel과 Cloudflare의 `/api/readiness`는 모두 HTTP 200, `userData=ready`, `sajuCalculation=ready`.
- Cloudflare 정본 `https://myeongha.gycha0109.workers.dev`를 공개 origin으로 **읽기 전용 자동 검증**하도록 종료 검사 기본값을 보정했습니다. 공개 Worker의 health, 12개 정적 경로, 버전 동등성 및 readiness 검증 통과. 별도 사용자 정의 도메인 필수 요구는 없습니다.
- 그러나 종료 게이트 결과는 **`HOLD`**. 별도 증거 12종(실제 OAuth callback, 인증된 회원/DB TLS·RLS, Guest→Member, 사주 양성 경로, 보호 AI/Commerce, 배포 버전·시크릿, 롤백·안정성·최종 종료 승인 포함)은 누락 상태이며 이를 자동으로 성공 처리하지 않습니다.
- Vercel 전용 CI/운영 스크립트는 대기 서비스 관리용으로 유지합니다. 삭제 전에 실행 대상을 옮기거나 더 이상 호출하지 않도록 절차를 종료해야 하며, 기존 EAS 바이너리/외부 제공자 설정/기존 Vercel 링크는 소스 수정만으로 이관되지 않습니다.
- **운영 배포·DNS·Supabase/OAuth provider 설정 변경·Vercel 비활성화·PR 병합·Secret 수정 없음.** 이 재검사는 Vercel 종료 승인이 아닙니다.
