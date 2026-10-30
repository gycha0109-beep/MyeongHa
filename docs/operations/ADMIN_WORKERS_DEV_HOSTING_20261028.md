# 명하 Admin Console — 무료 workers.dev 운영 연결 지침

기준일: 2026-10-28. 이 문서는 실제 운영 설정을 실행했다는 기록이 아닌, 현재 코드에서 검증 가능한 배포 경계를 정리한 것입니다.

## 확정된 주소와 소유권

- 구매 도메인 없음. 도메인 구매를 요구하거나 임의의 커스텀 도메인을 사용하지 않습니다.
- 확인된 Cloudflare 계정 서브도메인: `gycha0109.workers.dev`.
- 관리자 전용 Worker 이름: `myeongha-admin`.
- 관리자 콘솔의 예정 주소: `https://myeongha-admin.gycha0109.workers.dev/admin/`.
- Cloudflare Access 조직: `noisy-star-3d9a.cloudflareaccess.com`. Zero Trust 무료 플랜 등록 완료.
- 기존 공개 서비스 Worker `myeongha`는 별개이며 관리자용 Access 정책으로 보호하거나 교체하지 않습니다.

## 현재 상태

- 실제 관리자 Worker 미배포. 2026-10-28 전용 Access 앱 `MyeongHa Admin Owner Only`(`3a376a53-ad4d-4a07-9fa0-cd55cb0cb62f`)을 `myeongha-admin.gycha0109.workers.dev`에 생성했으며 정확한 Owner 이메일 1개만 허용하는 정책을 API 재조회로 확인. Access AUD `5e7b528fd17cc2de740742971e542e258fc1875331a591d382a29cebac0316ab`. 로그인·JWT 실동작 검증 및 Worker 배포는 아직 수행하지 않음.
- 관리자 전용 Reader / Audit Writer / Command Executor DB 역할과 Hyperdrive 없음. Supabase 도구 연결은 `link_id must identify an eligible linked account`를 반환해 설치 전 계정 연결 복구가 필요함.
- `workers_dev: true`, `preview_urls: false`는 코드상의 라우팅 준비이며 실제 배포를 의미하지 않습니다.
- `MYEONGHA_ADMIN_PRIVATE_ENABLED=false`, `MYEONGHA_ADMIN_CREDIT_COMMANDS_ENABLED=false`, `MYEONGHA_ADMIN_RETENTION_ENABLED=false`가 기본값입니다.

## 추후 운영 연결 순서 (부작용 있는 작업은 실행 승인 필요)

1. **설정 생성·정책 재조회 완료:** `myeongha-admin`만 대상으로 Cloudflare Access 애플리케이션을 설치하고 **정확한 Owner 이메일 한 명만** 허용했습니다. 로그인·JWT 실동작은 별도 확인이 필요합니다. 기존 공개 `myeongha`를 일괄 보호하지 않았습니다.
2. 별도 Supabase 최소 권한 Reader, Audit Writer, Command Executor를 설치합니다. 기존 고객 서비스 DB 자격 증명, Hyperdrive, 권한은 재사용하지 않습니다. 오프라인 SQL 후보는 자동 운영 마이그레이션이 아닙니다.
3. 관리자 전용 Hyperdrive와 Access AUD, 기존 Member 인증 Owner UUID, 별도 서버 비밀키를 공급합니다. 비밀키를 커밋, 화면, 보고서에 노출하지 않습니다.
4. `npm run verify:hosted -w @myeongha/admin` 및 `npm run verify:origins -w @myeongha/admin`으로 환경 이름 누락·역할 격리를 확인합니다.
5. Access의 로그인 차단/허용, Owner 단독 접근, 별도 Reader/Audit Writer 권한, 감사 실패 차단을 실제 서비스와 구분해 검증한 뒤에만 활성화를 결정합니다.
6. 사용자 크레딧 지급/회수, 환불, 계정 제한·삭제 등 실제 고객에게 영향을 미치는 명령은 별도 실행 승인 없이 시도하지 않습니다.

## 관리자 Worker 런타임 DB 로그인 격리 (2026-10-29)

- `cloudflare/admin-worker.mjs`는 Owner Access 검증 이후, DB 연결이나 정적 자산 처리 전에 `validateAdminHttpBindingsV1`을 실행합니다.
- Reader/Audit Writer/선택적 Command·Audit Retention·Analytics Retention Hyperdrive는 **서로 다른 PostgreSQL 로그인 + DB 조합**이어야 합니다. 동일 URL뿐 아니라 비밀번호 변경, 대소문자 호스트 변경, SSL URI 파라미터 차이로 같은 DB 역할을 재사용하는 것도 거부합니다.
- 없는 필수 origin과 잘못된 선택적 origin은 실패 차단하며 연결 문자열을 로그·응답에 노출하지 않습니다. 이 검사는 SQL 접근 전의 선행 검사이고, 기존 원본 역할·RLS·TLS 실연결 검사와 별도로 모두 필요합니다.
- 연결된 Windows PC의 별도 Git worktree에서 이 가드의 독립 Node smoke 검증을 수행했습니다. 전체 CI와 실제 운영 DB 검증은 별개입니다.

## 저장소의 개발·검증 경계

- 브랜치 `feat/admin-console/admin-01-shell-20261026`, Draft PR #2630에서만 누적 구현합니다. 개발 단위별 브랜치·PR 분할이나 임의 병합을 하지 않습니다.
- `npm run build:private -w @myeongha/admin`은 번들 빌드와 Wrangler dry-run만 수행합니다. 실제 배포 명령을 실행하지 않습니다.
- 배포 전 검사는 관리자 주소를 `myeongha-admin.gycha0109.workers.dev`로 고정하고, 다른 workers.dev 계정 및 Access 조직·사용자 DB 연결 재사용을 거부합니다.
- Cloudflare Access JWT 검증은 정적 파일보다 먼저 실행됩니다. Access 또는 운영 전용 DB 구성이 빠졌을 때 Worker는 실패 차단합니다.

## 알려진 남은 구현·운영 의존성

- 일반 방문 분석은 동의 기반 서버 조합까지 코드 구현됐지만 실제 수집·삭제 스케줄/전용 Writer 설치는 미활성입니다. Saju의 공급사 호출 관측은 [Saju PR #2739](https://github.com/gycha0109-beep/Saju/pull/2739)에서 GREEN이며, 명하 Reading 원장 연동은 [Admin PR #2630](https://github.com/gycha0109-beep/MyeongHa/pull/2630)의 DB Owner 매핑 검증을 요구합니다. 실제 공급사 청구·환율과 전체 Reading 비용 관측률은 여전히 미측정입니다.
- 환불·계정 조치의 승인된 도메인 실행 계약. 읽기 전용 환불 검토를 환불 실행으로 오인하지 않습니다.
- 운영 전용 **Access 앱과 Owner 이메일 정책은 설치·재조회 완료**했습니다. 반면 DB 역할, 전용 Hyperdrive, Worker, 서버 비밀키 연결 및 Access 로그인/JWT 실동작 검증은 아직 완료되지 않았습니다. 사용자는 배포·DDL의 사전 승인을 제공했지만 운영 연결 도구에서 Supabase 계정 접근 오류가 지속됩니다.
