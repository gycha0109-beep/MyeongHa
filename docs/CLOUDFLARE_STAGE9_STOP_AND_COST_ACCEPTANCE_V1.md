# Cloudflare Stage 9 — Preview 중단·비용·복구 운영 기준 (2026-10-22)

Watchtower-Track: ops. 기준: [Cloudflare 이관 로드맵](https://github.com/gycha0109-beep/MyeongHa/pull/2381) / [기존 Draft 구현 PR](https://github.com/gycha0109-beep/MyeongHa/pull/2420). 이 문서는 Preview 통제 규칙이며, 운영/과금/DB/시크릿 변경 승인이 아닙니다.

## 1. 적용 범위

기존 단일 Worker myeongha의 Preview만 대상으로 합니다. 운영용 workers.dev는 비활성, Preview URLs만 활성입니다. 기존 운영 Vercel https://myeongha.vercel.app 은 변경하지 않습니다.

- mutable 대상: https://feat-ops-cloudflare-authdb-clean-snapshot-20261021-myeongha.gycha0109.workers.dev
- 읽기 전용 고정 복구 후보: https://59a14b13-myeongha.gycha0109.workers.dev — 이전 검증 커밋 d4f7cebb3d9be6b4ad9e526c53e3f5b8585cc9c0
- 실제 기존 Preview 과거 버전 복원→최신 버전 재배포 이력: [Cloudflare 원격 복원 검증 #39741192373](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39741192373). 이 검증은 운영 Worker/DNS/DB failback을 의미하지 않습니다.

## 2. 판정 로직

scripts/cloudflare-preview-ops-stop-gate.mjs에서 실행되는 읽기 전용 판정입니다. 기존 Cloudflare Preview Remote Smoke의 정확한 배포 SHA 영수증, 합성 HTTP 응답, 라우트 분류와 별도로 검토한 실제 Worker 사용량만 받아들입니다.

| 관측 | Preview | Production |
|---|---|---|
| SHA 일치·HTTP 성공·4분류의 합성 검사 존재·세연 503 유지 | ALLOW_DENY_ONLY_PREVIEW | HOLD |
| SHA 불일치·HTTP 오류·429·미승인 5xx·전송 오류·보호 503 누락 | STOP_REHEARSAL, 해당 CI FAIL | HOLD |
| 별도 owner 입증: 시크릿 회전 실패·OAuth callback 실패·DB TLS/RLS 오류·개인정보 응답·AI timeout·결제 재실행 위험·급격한 과금 | STOP_REHEARSAL | HOLD |
| 실제 Cloudflare Free 상한 근접/도달 및 빌드 분수 소진 | STOP_REHEARSAL; Paid 자동변경 금지 | HOLD |
| CPU·메모리·실사용량·계정 청구 증거 없음 | 기존 deny-only Preview는 유지 가능 | HOLD |

세연 의도된 503은 비정상 서버 5xx 카운트가 아니라 expectedHolds503로 기록합니다. Chrome과 HTTP CI 성공은 실제 인증/DB 로그인·AI·결제 승인이나 Production 운영 전환이 아닙니다.

## 3. Free 한도/측정 근거

[공식 Workers 한도](https://developers.cloudflare.com/workers/platform/limits/), [2026-02-11 subrequest 변경](https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/) 확인 기준:
- Worker 호출 일 100,000건(UTC 기준), CPU 요청당 10ms, 메모리 128MB, 외부 subrequest 50건, 정적 파일 최대 20,000개 및 개별 최대 25MiB.
- 실제 승인된 Worker 사용량 계측에 한해서만 이 한도와 비교하며, 한도에 도달하면 새 트래픽 여유가 없으므로 보수적으로 STOP합니다.
- 기존 synthetic HTTP p50/p95/max는 **클라이언트→Preview 응답헤더까지 시간**입니다. Worker CPU, 메모리, 실제 유입량 또는 청구 비용과 동등하지 않습니다.
- 빌드 한도 소진 boolean만 읽기 가능했습니다. 계정 billable-usage/billing-usage API는 403이므로 청구액은 **미확정**입니다. 0원·Free 적합성을 추측하거나 Vercel/Cloudflare 요금제를 전환하지 않습니다.
- Supabase, OpenAI, PortOne 청구액은 별도로 owner가 수락해야 합니다.

## 4. 중단 후 조치

1. Protected Auth/DB API의 404, 세연 최초/History/Replay 503, Reader/Commerce/PortOne/AI positive HOLD를 유지합니다.
2. 기존 Preview의 정확한 Git SHA 및 원격 영수증을 대조합니다. 성공한 immutable 후보 검사를 mutable Preview 복원과 동일시하지 않습니다.
3. 승인된 기존 Preview가 손상됐다면 이전 pinned SHA로 Preview만 수동 재배포한 뒤 58건 HTTP, Chrome 11화면, 정확한 영수증을 확인합니다. 이어 원래 최신 SHA를 다시 게시하고 같은 검사를 반복합니다. 자동 Worker Production 롤백/요금제 변경은 없습니다.
4. Vercel은 이미 Production이므로 현재 Preview 사건에서 DNS failback이 필요하다고 단정하지 않습니다. Stage 10 DNS 이전은 별도 사용자 승인입니다.
5. 실제 URL, OAuth 공급자 callback allowlist, 격리 DB verify-full 및 A/B RLS, Security/API/DB G0-D04, AI/결제 권한, 실제 비용 한도는 각각 해당 owner의 독립 인수를 받기 전까지 HOLD입니다.

## 5. 미확정 증거

실제 Workers CPU·메모리·UTC 일별 호출량, route별 실제 오류/부하 분포, 계정 청구 API 접근 권한, Auth/DB TLS·RLS 및 OAuth 공급자 등록, 운영 예산·DNS 전환 승인이 필요합니다. 특정 다른 트랙의 브라우저 CI가 실패하면 원인 없이 무시하거나 Cloudflare 전체 병합을 완료로 선언하지 않습니다.

**결론:** Cloudflare Static/deny-only Preview 및 기존 복구 리허설 증거만 사용합니다. 운영 전환, 유료 기능, 계정 변경, 생산 데이터 접근은 HOLD입니다.

### 2026-10-22 — 현재·과거 Preview 원격 실측 증거를 JSON으로 보존

- 기존 원격 Smoke (동일 58개 synthetic 요청)에 `MYEONGHA_CLOUDFLARE_EVIDENCE_KIND=current/recovery`만 주입하여 현재 Preview와 이전 pinned immutable 복구 후보의 **각각 다른 증거 파일**을 생성한다. `scripts/cloudflare-preview-smoke-evidence.mjs`의 고정 필드 allowlist로 full SHA, aggregate route ID, 지연 n/p50/p95/max, 의도된 503/429/오류, Free/청구 관측 경계를 담는다.
- 로컬 산출물 경로는 `artifacts/cloudflare-preview-stage9/current.json` 및 `recovery.json` 둘로 고정하며, 덮어쓰기를 거부한다. 실제 raw API 경로/쿼리/쿠키/요청/응답 본문, provider state, 개인 ID, 토큰, DB 원문 또는 빌드 로그는 JSON으로 복제하지 않는다. 도메인/비밀 문자열을 추가하는 필드나 임의 route ID는 거절하는 격리 단위 테스트를 포함한다.
- 기존 `Cloudflare Preview Remote Smoke`는 성공/실패 시 `actions/upload-artifact`의 **고정 SHA**를 사용해 `cloudflare-preview-stage9-evidence` 파일 하나에 두 JSON을 최대 **7일**만 보관한다. Artifact가 없으면 결과를 조작해 PASS로 만들지 않는다. `#2384` Stage 4 legacy에는 주입하지 않는다.
- 인수 파일은 Worker CPU/메모리/실청구/실사용자 p95를 기록하지 않고 `notMeasured`로 명시한다. 운영 계정 비용 API 403 상태를 수용하며 Production/DNS/시크릿/유료 리소스 변경 없음. 만료된 증거 파일만으로 향후 수락하지 않는다.

### 2026-10-22 — 동일 GitHub 실행의 현재·복구 증거 2종 필수 수락

- 기존 원격 Smoke에 기록되는 `githubRun.id`와 `githubRun.attempt`를 GitHub Actions 런타임의 **동일 실행 ID·시도 번호**에서만 읽는다. 현재 Preview 파일은 PR의 최신 `head.sha`, 복구 후보 파일은 고정 `d4f7cebb3d9be6b4ad9e526c53e3f5b8585cc9c0`를 증명해야 한다.
- `scripts/accept-cloudflare-stage9-evidence-pair.mjs`가 두 파일 **정확히 2개**를 별도 수락한다. 누락·중복·심볼릭 링크·지원하지 않는 키, 다른 GitHub 시도, 서로 다른 라우트 분류/표본 수, 원격 영수증 SHA 이탈, 기존 58개 합성 probe 및 의도된 세연 503 6건 미충족, 예상 밖 429·5xx·전송 오류/차단 이탈은 **CI FAIL**로 판정한다. 승인되지 않은 실제 URL·쿼리·개인정보·시크릿·호스트가 섞인 JSON 필드도 허용하지 않는다.
- `Cloudflare Preview Remote Smoke`의 **11개 Chrome 화면/기존 Vercel standby 검사 뒤**에 위 쌍을 확인하는 필수 단계를 추가하고, 아티팩트 업로드는 파일 없을 때 `error`로 중단한다. 실패 시에도 안전한 증거 파일이 존재하면 기존 `if: always()` 업로드는 수행하며, CI 성공으로 승격하지 않는다. `#2384` Stage 4 legacy 동작은 바꾸지 않는다.
- 수락 판정은 `ALLOW_DENY_ONLY_PREVIEW`만 의미한다. CPU·메모리·계정 청구 자료가 없다는 사실을 명시하고, 두 증거가 모두 PASS해도 `Production=HOLD`, `Cost=COST_OR_LIMIT_EVIDENCE_HOLD`, 실제 rollback/restore 미실행 상태를 유지한다. **과거 immutable 배포 HTTP 수락이 곧 mutable Preview를 실제 되돌려 복구했다는 뜻은 아니다.**
- 합성 회귀 `test/cloudflare-stage9-evidence-pair.test.mjs`를 기존 Cloudflare 테스트 명령에 추가했다. 파일 수·보존·승인 근거는 해당 GitHub Actions run의 artifacts API에서 다시 확인해야 하며, 7일 만료 후에는 과거 증거를 현재 PASS로 재사용하지 않는다.

### 2026-10-23 — Preview 실배포 공개 HTML 11개 SHA-256 증거

- 기존 Cloudflare Remote Smoke가 이미 읽는 **11개 공개 HTML**(index/hall/auth/birth/chat-hub/chat/my/reading/face-reading/reading-detail/records)의 HTTP body text를 Node SHA-256으로 해시한다. 새 HTTP 요청, 본문/쿠키/개인정보 로그 및 추가 Cloudflare 리소스를 만들지 않는다.
- 각 SHA와 복구 후보 SHA를 별도 `publicHtmlSha256`의 **허용된 파일 이름→64자리 소문자 digest**로 JSON에 기록한다. 해시가 하나라도 누락되거나 새 경로·잘못된 digest가 추가되면 `scripts/cloudflare-preview-smoke-evidence.mjs` 생성 단계 또는 `scripts/accept-cloudflare-stage9-evidence-pair.mjs` 쌍 수락 단계에서 **CI 실패**한다. 테스트에는 합성 문자열만 사용한다.
- 이 증거는 **Git SHA와 결합된 원격 공개 HTML 체크섬**이지 전체 Worker JS 번들 크기/해시, CSS/JS 파일 전체, CDN 캐시의 모든 시점, 사용자 개인정보 화면 렌더링이나 Cloudflare 청구/CPU 실측까지 증명하지 않는다. 과거 SHA와 최신 SHA의 HTML 바이트 일치를 강요하지 않는다.

### 2026-10-23 — Worker 코드 번들 Free 상한의 로컬 Dry-run 증거

- 기존 Cloudflare CI의 Ops 작업에서만 **동일 고정 버전 Wrangler 4.151.2**로 `wrangler deploy --dry-run --config wrangler.jsonc --outdir <임시경로>`를 호출한다. `--dry-run`을 필수로 고정하므로 **실제 Worker 업로드·라우트 배포·유료 기능 생성·계정 접근은 하지 않는다**. CLI에 제공하는 환경에서도 Cloudflare/API/provider credential을 전달하지 않는다.
- 생성된 로컬 `.js/.mjs/.cjs/.wasm` 코드 파일만 합산해 **공식 Worker 64MiB 용량 경계**와 비교한다. 코드 파일 수·총 바이트·읽기 전용 SHA-256·local bundling wall time을 CI에 출력하며, 코드/지도 파일 원문은 로그에 출력하지 않고 임시 디렉터리는 삭제한다.
- 이 수치는 **Wrangler 로컬 코드 번들 근사값**으로 Static Assets 파일 총 용량과 분리된다. 압축 후 실제 업로드 크기·Cloudflare 서버 수락 결과·Free CPU 10ms/메모리/청구 금액을 검증한 것으로 표시하지 않는다. 불확실하거나 dry-run 실패 시 CI 실패로 처리한다. 기존 Vercel Production과 Worker Preview 설정은 수정하지 않는다.

### 2026-10-23 — 전체 정적 배포 자산 트리의 로컬 SHA-256

- 기존 `verifyCloudflareStaticArtifact()`가 **이미 파일 크기·개수·숨김 Secret·맵 파일·심볼릭 링크·API 디렉터리**를 확인하는 동일 정적 파일 순회에서, 25MiB 이내 허용된 실제 배포 파일 전체의 바이트 SHA-256을 스트리밍으로 측정한다.
- 정렬된 공개 상대 파일 경로 + 정확한 바이트 수 + 파일 SHA-256을 결합하여 하나의 `staticAssetTreeSha256`(64자리)를 기존 CI 출력에 추가한다. 파일별 내용/경로 목록·Secret·JWT·사용자 원본을 로그/Artifact로 내보내지 않는다. 순회 순서가 바뀌어도 동일한 파일 트리는 같은 체크섬을 생성하며, 한 바이트라도 바뀌면 다른 SHA가 된다.
- **적용 범위 `LOCAL_STATIC_ARTIFACT_ONLY`**: 전체 Static Assets **로컬 빌드 출력**의 무결성 증거이며, 원격 Worker bundle/CDN POP 수신본·이미지 사용자 입력·CPU/실청구/개별 asset의 HTTP 배포까지 증명하지 않는다. 원격 실배포에서 실제 바이트를 읽는 체크섬은 기존 11개 공개 HTML의 `publicHtmlSha256` 별도 증거로 유지한다.
