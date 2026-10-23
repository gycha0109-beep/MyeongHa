# Cloudflare Ops Worker — 배포 소유권 및 workers.dev 유지

> 대상: `myeongha.gycha0109.workers.dev` / Cloudflare Worker 이름 `myeongha`
> 소유 트랙: Ops (Cloudflare Vercel 이관). 상태: 별도 Production 전환 전의 이관 검증 주소.

## 확인된 반복 장애 (2026-10-24, KST)

Cloudflare 감사 로그의 `script_on_subdomain` 항목에서 다음이 확인됐다.

- 2026-10-24 01:26, 01:34, 01:55 KST 부근의 Wrangler 배포 뒤 `workers.dev disabled, previews enabled`.
- Ops의 2026-10-24 01:19, 02:16 KST 배포에서는 `workers.dev enabled, previews enabled`.
- 장애 때 `/`, `/auth.html`, `/api/health`가 Cloudflare 기본 404 페이지로 표시됐다.
- 다른 출발지에서 같은 Worker `myeongha`를 갱신하는 충돌은 확인됐지만, 어느 개발 트랙의 프로세스가 설정을 해제했는지는 감사 로그만으로 특정할 수 없다.
- Worker의 시크릿이나 Supabase 역할이 사라진 것은 아니다. `subdomain.enabled=false`가 직접적인 화면 장애 원인이었다.

## 배포 규칙

1. **`myeongha` Worker는 Cloudflare Ops 트랙만 배포한다.** 다른 트랙의 Wrangler·`cf deploy`·Cloudflare 앱 배포는 다른 Worker 이름을 사용한다. 이름을 동일하게 사용하는 앱/스크립트는 이관 검증 서버를 덮어쓴다.
2. Ops의 `wrangler.jsonc`에 `workers_dev: true`, `preview_urls: true`, `name: "myeongha"`를 고정한다. 변경하지 않는다.
3. 집 PC/허가된 기기에서 Ops 브랜치 체크아웃 후 `npm run build:cloudflare:static` 및 `npm run deploy:cloudflare:ops` 사용. 배포 명령은 해당 브랜치·라우팅 설정을 확인하고 배포 직후 메인·로그인·Health 200을 검증한다.
4. 기존 인증 DB 시크릿을 보존하도록 `--keep-vars`를 사용한다. Vercel Production과 DNS는 건드리지 않는다.
5. 외부 배포로 공개 주소가 404가 된 경우 Cloudflare `GET /accounts/{account_id}/workers/scripts/myeongha/subdomain`을 확인하고, `enabled=false`이면 권한 있는 계정으로 `POST`에 `{"enabled":true,"previews_enabled":true}`를 전달한다. 이것은 응급 복구이며 재발 방지를 위해 외부 배포 설정을 반드시 수정해야 한다.

## 적용 한계

이 규칙은 저장소 내의 Ops 배포를 보호한다. 다른 앱이나 개발 세션이 Cloudflare API를 직접 호출해 `myeongha`를 `workers_dev=false`로 재배포하는 행위까지 기술적으로 차단하지는 못한다. 해당 호출의 소유자가 다른 Worker 이름을 사용하도록 분리해야 한다.

## 관련 증거

- Cloudflare 계정 Audit Logs: `script_on_subdomain`의 `action.info` 및 `actor.ip`
- Worker Versions/Deployments: 해당 시각의 `myeongha` 갱신 기록
- Ops Draft PR #2420, `workers/cloudflare-static-preview.mjs`, `wrangler.jsonc`
