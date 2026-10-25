# Cloudflare Ops Worker — 배포 소유권 및 workers.dev 유지

> 대상: `myeongha.gycha0109.workers.dev` / Cloudflare Worker 이름 `myeongha`
> 소유 트랙: Ops (Cloudflare Vercel 이관). 상태: 별도 Production 전환 전의 이관 검증 주소.

## 확인된 반복 장애 (2026-10-24, KST)

Cloudflare 감사 로그의 `script_on_subdomain` 항목에서 다음이 확인됐다.

- 2026-10-24 01:26, 01:34, 01:55 KST 부근의 Wrangler 배포 뒤 `workers.dev disabled, previews enabled`.
- Ops의 2026-10-24 01:19, 02:16 KST 배포에서는 `workers.dev enabled, previews enabled`.
- 장애 때 `/`, `/auth.html`, `/api/health`가 Cloudflare 기본 404 페이지로 표시됐다.
- 다른 출발지에서 같은 Worker `myeongha`를 갱신하는 충돌은 확인됐다. 감사 로그만으로 개별 개발 트랙은 특정할 수 없지만, Cloudflare Workers Builds 설정에서 공용 `main` 브랜치의 `production_settings.deploy_command = npx wrangler deploy`와 `wrangler.jsonc`의 `name: myeongha`, `workers_dev: false`가 직접적인 설정 충돌 원인임을 확인했다.
- 2026-10-24 응급 조치: 기존 Worker `myeongha`에 연결된 Workers Builds production deploy 명령을 안전한 출력 전용 `echo SKIP`으로 변경했다. Git 자동 빌드는 유지되지만 이 이름으로는 더 이상 배포하지 않는다.
- [PR #2531](https://github.com/gycha0109-beep/MyeongHa/pull/2531)은 2026-10-23 병합됐고, 공용 정적 Preview Worker 이름을 `myeongha-static-preview`로 분리했다. CI/병합 후 Preview CD는 별도 Worker 이름을 사용한다.
- Worker의 시크릿이나 Supabase 역할이 사라진 것은 아니다. `subdomain.enabled=false`가 직접적인 화면 장애 원인이었다.

## 배포 규칙

1. **`myeongha` Worker는 Cloudflare Ops 트랙만 배포한다.** 다른 트랙의 Wrangler·`cf deploy`·Cloudflare 앱 배포는 다른 Worker 이름을 사용한다. 이름을 동일하게 사용하는 앱/스크립트는 이관 검증 서버를 덮어쓴다.
2. Ops의 `wrangler.jsonc`에 `workers_dev: true`, `preview_urls: true`, `name: "myeongha"`를 고정한다. 변경하지 않는다.
3. 집 PC/허가된 기기에서 Ops 브랜치 체크아웃 후 `npm run build:cloudflare:static` 및 `npm run deploy:cloudflare:ops` 사용. 배포 명령은 해당 브랜치·라우팅 설정을 확인하고 배포 직후 메인·로그인·Health 200을 검증한다.
4. 기존 인증 DB 시크릿을 보존하도록 `--keep-vars`를 사용한다. Vercel Production과 DNS는 건드리지 않는다.
5. 외부 배포로 공개 주소가 404가 된 경우 Cloudflare `GET /accounts/{account_id}/workers/scripts/myeongha/subdomain`을 확인하고, `enabled=false`이면 권한 있는 계정으로 `POST`에 `{"enabled":true,"previews_enabled":true}`를 전달한다. 이것은 응급 복구이며 재발 방지를 위해 외부 배포 설정을 반드시 수정해야 한다.

6. 승인된 Ops deploy helper는 `wrangler deploy`에 전체 Git commit SHA를 `--tag`와 `--message`로 함께 전달한다. exact SHA가 없거나 tracked/untracked worktree 변경이 있으면 배포 전 거부한다. 이 메타데이터는 향후 Worker Version을 PR/CI 소스와 대조하기 위한 것이며, 그 자체로 배포 승인이나 실제 검증을 의미하지 않는다.

## Read-only deployment attribution (2026-10-25 UTC)

- 시크릿 이전 version 79 `3d1abaed-e724-4da5-ac72-c47801ed9499`는 13:46:51.494에 생성됐으며 현재 deployment 목록에 없다.
- Version 80 `5fdc6d28-4db0-49d7-a3a5-143866a910e8`의 deployment `312a708b-8925-47f3-b09b-dd0c3562aabc`는 13:48:19.953에 Wrangler source로 100% 배포됐다. 직후 audit log에는 `script_update`, `script_deploy`, `patch_settings`, `script_on_subdomain`이 기록됐고, version metadata에는 Git SHA/tag/message가 없다.
- Version 79와 80은 같은 Cloudflare account actor로 기록됐다. 이관 helper는 `wrangler versions secret bulk`만 실행하며 GitHub Actions/커밋에서 version 80 배포를 연결하는 provenance는 확인되지 않았다. 같은 계정·근접 시각만으로 작업 트랙이나 CLI 호출 주체를 특정할 수 없으므로, version 80을 이관 산출물로 간주하지 않는다.
- 같은 시각대 main commit `ba13cb4924d20133453a3c876ece5c76bc67ccf3`은 Security 트랙의 disposable S0 DB rehearsal 스크립트 변경이다. 대응 Actions는 CI/Governance/Supabase Production 기록이며 migration job은 skipped 상태였다. `feat/ops` PR head에는 해당 시간의 Actions 실행이 없었다.
- 이 조사는 배포를 되돌리거나 다시 만들지 않았으며, 이후 Ops 배포 provenance 기록을 위해 위 규칙 6을 추가했다.

## 적용 한계

이 규칙은 저장소 내의 Ops 배포와 알려진 공용 main 자동 배포 충돌을 보호한다. 기존 공용 Preview CD 자동 배포는 독립 Worker로 이관할 때까지 일시 중지된 상태다. 다른 앱이나 개발 세션이 Cloudflare API를 직접 호출해 `myeongha`를 `workers_dev=false`로 재배포하는 행위까지 기술적으로 차단하지는 못한다. 해당 호출의 소유자가 다른 Worker 이름을 사용하도록 분리해야 한다.

## 관련 증거

- Cloudflare 계정 Audit Logs: `script_on_subdomain`의 `action.info` 및 `actor.ip`
- Worker Versions/Deployments: 해당 시각의 `myeongha` 갱신 기록
- Ops Draft PR #2420, `workers/cloudflare-static-preview.mjs`, `wrangler.jsonc`
