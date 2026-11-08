# Admin Console — 읽기 전용 개통 작업 로그 (2026-11-05)

## 결정과 범위
- Owner가 관리자 콘솔의 실제 운영 배포 및 기존 A0–A7 로드맵 계속 진행을 승인했다. 별도 결제·크레딧·환불·계정 변경 기능의 활성화는 승인 범위에 포함되지 않는다.
- 공개 서비스 `myeongha`와 고객 데이터를 변경하는 DB 작업은 이 배포 범위에서 제외한다.
- 대상은 Access Owner 단독 보호를 받는 독립 Worker `myeongha-admin`이다.
- Reader, Audit Writer는 서로 분리된 기존 최소 권한 DB 접속을 사용한다. Command, Retention, Analytics Retention 접속은 바인딩하지 않는다.
- 정상적인 읽기 전용 개통은 `MYEONGHA_ADMIN_PRIVATE_ENABLED=true` 하나만 활성화하고, 다른 세 운영 플래그는 계속 `false`로 유지한다.
- 현재 Cloudflare 배포 설정은 네 플래그 모두 `false`인 상태로 확인했다. 단순 도구 호출을 통한 변경은 보안 검사에서 거부되어 성공으로 간주하지 않는다.

## 이미 확보된 근거
- 독립 Worker와 소유자 전용 Access 정책, Reader/Audit Hyperdrive, Rate Limiter, Member 검증 키의 배포 설정 존재 확인.
- 실제 Owner Access 통과 후 `ADMIN_PRIVATE_DISABLED` 응답은 관찰됨.
- 최소 권한 DB 역할 및 롤백형 감사 기록은 기존 CI 실검증 통과. 이 실행에서 반복 시행하지 않는다.
- Member 이메일+Auth UUID 운영 검증, 실제 Reader/Audit HTTP 호출, 비Owner 실제 로그인 차단 기록은 미완료다.

## 안전한 배포 작업
- 기존의 비활성 배포 경로는 그대로 보존한다.
- 보호된 `production` 환경에서 `main`의 명시적 읽기 전용 릴리스만 허용한다.
- 배포 전 Access/Hyperdrive/DB 권한 검증을 재사용하고, 배포 후 네 플래그 및 독립 연결을 다시 검증한다.
- 명령·환불·유지관리 접속이 한 개라도 생기면 읽기 전용 릴리스를 거절한다.
- 실패한 개통은 비활성 설정으로 되돌리는 복구 절차를 실행한다. API 키나 개인 신원 정보는 로그에 출력하지 않는다.
- 운영 Member 로그인은 실제 Owner가 브라우저에서 수행해야 하며, 토큰·비밀번호를 채팅에 전송하지 않는다.

## 작업 상태
- GitHub PR/CI 및 실제 Worker 개통의 성공 여부는 확인된 링크와 결과를 확보한 뒤에만 기록한다.
- 사용자 변경 명령·지속적 수집·정리 작업은 여전히 승인되지 않았다.

## 2026-11-05 운영 읽기 전용 개통 결과 (이전 상태를 대체하는 최신 근거)

- 승인된 PR [#2980](https://github.com/gycha0109-beep/MyeongHa/pull/2980)이 필수 검증 성공 후 `main`에 병합됨. 병합 커밋: `a34ee17d58a82b198358c2d40dae089157e5c5fd`.
- 정확한 병합 커밋을 사용한 [관리자 읽기 전용 배포 #41900698768](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41900698768)이 완료·성공. 별도 관리자 Worker만 배포했고 기존 고객용 Worker는 배포 대상이 아님.
- 배포 CI에서 Access Owner 정책, Reader/Audit 역할 분리, 실제 롤백형 감사 기록, 배포 후 설정, 익명 접근 차단 검사를 모두 통과함.
- Cloudflare 운영 Worker 설정을 별도 읽기 전용 API로 재확인: `MYEONGHA_ADMIN_PRIVATE_ENABLED=true`; `MYEONGHA_ADMIN_CREDIT_COMMANDS_ENABLED=false`, `MYEONGHA_ADMIN_RETENTION_ENABLED=false`, `MYEONGHA_ADMIN_ANALYTICS_RETENTION_ENABLED=false`.
- Reader, Audit Writer, Member 인증 검증 키, 요청 제한 바인딩 존재. Command, Retention, Analytics Retention Hyperdrive 바인딩은 없음.
- 인증되지 않은 요청의 `/admin/`와 `/api/admin/session`은 실제 Cloudflare Access 로그인으로 HTTP 302 이동함. 보호되지 않은 관리 페이지 또는 개인정보를 반환하지 않음.
- 홈 PC에서 관리자 페이지를 열면 실제 Cloudflare Access Owner 로그인 화면에 도달함. 여기서 **아직 실제 Owner 로그인 및 명하 Member 인증/조회/감사 API 호출까지 완료되지는 않음**. 사용자의 브라우저 로그인 후 개별 근거가 필요하며 비밀번호·토큰·쿠키를 작업 로그나 채팅에 보관하지 않음.
- 비Owner의 실제 로그인 거부 기록도 여전히 미확인. 해당 증거가 없는데 접근 정책의 개별 거부 검증을 완료 처리하지 않음.
- 범위 외: 결제·환불·크레딧·계정 변경, 고객정보 변경, 보존기간 정리, 분석 자동 수집·정리 등은 비활성/미승인 상태 유지. `ROADMAP_COMPLETE` 미도달.

## 2026-11-07 22:13 KST — 회원 중심 Owner 콘솔 운영 배포 검증

### 기존 로드맵의 이번 미완료 작업
- A0–A3의 읽기 전용 관리자 화면 최신화: 이미 구현·병합된 사용자/게스트 분리 및 루트 URL 정정 내용을 **독립 관리자 Worker**에 보호된 기존 배포 절차로 반영. 새로운 로드맵, 고객 쓰기 명령, DB 역할 확대는 추가하지 않음.
- 기존 WORKLOG 및 연속 구현 정본: 이 파일, `docs/operations/ADMIN_HOME_CONTINUATION_20261102.md`, `apps/admin/README.md`를 확인함. 해당 파일의 과거 미완료 표시 중 PR 병합/배포에 관한 사항만 아래의 새 실증으로 갱신함.

### 코드·변경 파일과 커밋
- [PR #3100](https://github.com/gycha0109-beep/MyeongHa/pull/3100) 회원 중심 목록/게스트 구분/상세: 병합 완료, squash merge `21ddb3192d8ad3f671e3cabaebec5089fc5e82c3`. 변경 파일: `apps/admin/README.md`, `apps/admin/src/AdminWorkbench.tsx`, `apps/admin/src/AdminWorkbench.test.tsx`, `apps/admin/src/styles.css`.
- [PR #3098](https://github.com/gycha0109-beep/MyeongHa/pull/3098) 루트 북마크를 /admin/으로 이동: 병합 완료, squash merge `a8f843b901d513b592f9a8ec70697f42c0ed90fd`. 변경 파일: `apps/api/src/admin-hosted-http-v1.ts`, `apps/api/src/admin-hosted-http-v1.test.ts`.
- 이 실행에서는 기능 코드 자체를 수정하지 않았음. PR #3100/#3098 기존 코드의 재구현·재병합을 수행하지 않음.

### 테스트·CI·실운영 근거
- #3100 일반 CI와 Web/Governance/Security 및 필수 [CI Integration #42367505896](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42367505896): 성공. #3098 필수 [CI Integration #42367583696](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42367583696): 성공.
- 보호된 main의 `Admin Console Read-Only Release`를 `release_mode=readonly`로 실행: [#42375880365](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42375880365), 실제 checkout 커밋 `61736e57979d886559451d15a853292fb3bf586e`. release job 및 모든 필수 실행 단계 **success**. npm 패키지 설치/타입 검사/관리자 테스트/빌드, Owner Access 및 DB 전용 연결/20종 Reader 쿼리와 롤백형 Audit 검사, Worker 배포, 후속 보안/설정 재조회, 익명 자산·API 접근 차단 검사 통과. 복구 단계는 정상적으로 skipped.
- Cloudflare 실제 `myeongha-admin` 버전 `b82a4c8e-cae6-4a98-91f6-9449240aa77d`에 100% 트래픽. 별도 Reader/Audit Hyperdrive와 Member 인증 서비스·Assets·RateLimiter 확인. `MYEONGHA_ADMIN_PRIVATE_ENABLED=true`; `MYEONGHA_ADMIN_CREDIT_COMMANDS_ENABLED=false`, `MYEONGHA_ADMIN_RETENTION_ENABLED=false`, `MYEONGHA_ADMIN_ANALYTICS_RETENTION_ENABLED=false`. Command/Retention 전용 바인딩 없음. 고객용 Worker/고객 데이터는 변경하지 않음.
- 이번 CI/배포 성공은 인증된 Owner의 **브라우저**에서 새 UI 및 `GET /api/admin/users` 후 정확히 결속된 `read:users / allowed` 감사 레코드를 확인했다는 뜻이 아님. 해당 실사용 검증은 미완료로 유지.

### 미완료·다음 기존 단위
1. 사용자에게 실제 Owner 로그인 후 /admin/users에서 활성 회원만 기본 표시되고, 게스트 전환/한국 시각/상세가 정상인지 확인. 동일 시점의 Owner 읽기 감사 성공 기록은 별도 근거 필요. 이는 UI 배포 검증과 다름.
2. 실제 비Owner의 Admin Access 앱 수준 거부 로그인 기록은 미확인. 기존 권한 정책 우회/가상 계정 생성 없이 실제 증거가 있을 때만 검증.
3. 현재 Admin Reader에 `auth.users`/프로필 원문 조회 권한 없음; 이름/이메일 식별은 미구현. 읽기 전용 최소 노출 projection에 대한 별도 계약·검증 없이 실명을 추측하거나 역할을 확대하지 않음. A4 비용 결속 HOLD, A5 수집·보존 비활성, A6 계정/환불/크레딧 명령 비활성, A7 게시 비활성 유지.
4. **다음 작업:** 우선 Owner 실사용 조회·감사 결속의 기존 수용 조건 확인. 추가 배포는 해당 근거에 실질 변경이 있을 경우에만 진행. `ROADMAP_COMPLETE` 선언하지 않음.

## 2026-11-08 — 관리자 Owner 실사용 읽기·감사 결속 실증 점검 (기존 A0–A3 단위)

- **로드맵·작업 목표:** 관리자 A0–A7 정본 중 기존 A0–A3의 미완료 수용 조건인 **최신 배포에서 Owner가 직접 `GET /api/admin/users`를 호출하고 같은 요청의 `read:users / allowed` 감사를 입증**하는 단위. 별도 로드맵·운영 기능을 만들지 않는다. 기준 `main@91739f98f8c124d472e34ab814edb8de057b40d0`, 전용 WORKLOG는 이 파일, 연속 상태는 `docs/operations/ADMIN_HOME_CONTINUATION_20261102.md`.
- **코드·PR·CI 대조:** 기존 회원 중심 화면 [PR #3100](https://github.com/gycha0109-beep/MyeongHa/pull/3100), 루트 관리자 경로 [PR #3098](https://github.com/gycha0109-beep/MyeongHa/pull/3098), 배포 기록 [PR #3107](https://github.com/gycha0109-beep/MyeongHa/pull/3107) 모두 병합. 보호된 `main@61736e57979d886559451d15a853292fb3bf586e`에서 실행된 [Admin Read-Only Release #42375880365](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42375880365)는 2026-11-07 13:13:29 UTC SUCCESS. Cloudflare **읽기 전용** 버전 조회 결과 최신 독립 `myeongha-admin` 배포 `b82a4c8e-cae6-4a98-91f6-9449240aa77d`가 2026-11-07 13:13:24 UTC부터 100% traffic. 고객 Worker 및 관리자 활성 플래그는 이 작업에서 변경하지 않았다.
- **읽기 전용 실측 결과:** Production 전용 `myeongha_admin_ops.admin_audit_events_v1`에서 2026-11-06 10:00 UTC 이후 선택된 감사 action의 **집계**만 SELECT-only 확인(개인 ID, request_id, 세션, 이메일, JWT 미출력). `read:users / allowed`는 총 5건, 마지막 2026-11-07 10:09:57.593 UTC. `session:verify / allowed`는 57건, 마지막 10:44:02.219 UTC. **최신 배포 시각 13:13:24.506 UTC 이후의 `read:users / allowed`는 0건**. 앞선 읽기 성공은 새 배포 실사용 완료 증거로 승격하지 않는다.
- **변경 파일·브랜치/커밋·PR:** 이번 단위 변경은 **기존 본 WORKLOG 한 파일만**; 브랜치 `admin/owner-read-audit-evidence-20261108`. 작업 근거·초기 WORKLOG 커밋 `8321e45f7ae8e4d9ac00cdd4eb26108c30cb3ce5`, [PR #3143](https://github.com/gycha0109-beep/MyeongHa/pull/3143); 본 단위 최종 WORKLOG 갱신은 이 PR 커밋 이력에 보존한다. 기능 코드/테스트/마이그레이션/운영 Worker/DB 역할·권한/Secret/트래픽은 변경하지 않았다. CI 감시 브랜치는 `main`; 다른 트랙의 CI/PR은 이 단위에 포함하거나 수정하지 않는다.
- **검증 범위와 미완료:** GitHub release SUCCESS + Cloudflare 최신 버전 100% + 관리자 감사 원장 SELECT-only 집계 확인. **실제 최신 Owner 브라우저 GET과 요청/감사 ID 결속은 미완료**. 브라우저 연결 도구는 세션을 열지 못했으며, Owner 신원/쿠키/토큰을 대신 사용하지 않는다. 비Owner 앱 정책 실제 거부도 여전히 미검증. A4 비용, A5 분석, A6 명령, A7 게시·보존 활성화 등은 기존 HOLD/비활성 상태 그대로이며 `ROADMAP_COMPLETE` 아님.
- **다음 작업·블로커/승인:** Owner가 기존 접근권한으로 `https://myeongha-admin.gycha0109.workers.dev/admin/users`에 로그인하여 실제 회원 목록을 열어야 한다. **비밀번호·JWT·쿠키 공유 불필요**. 그 후 같은 시점에 `GET /api/admin/users` 성공과 `read:users / allowed` 감사가 실제로 결속되었는지만 재조회한다. Owner 브라우저에서의 인증 요청이 없어서 수용은 **차단**; 사용자 변경·운영 배포·Access 우회/완화는 승인되지 않았으며 수행하지 않는다.
