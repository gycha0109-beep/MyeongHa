# 관리자 운영 연결 재조회 — 2026-10-30

기존 A0–A7 잔여 작업의 실행 기록입니다. 신규 로드맵이나 기능 활성화 증거가 아닙니다. 비밀번호·Owner 이메일·세션·토큰·고객 데이터는 기록하지 않습니다.

## 실제 확인

- 명하 PR #2630: OPEN/Draft, 시작 HEAD `2b183e7e2f2fafa66056c19acffddabb193237da`. Governance/CI/Web PR Domain Gates/Web Auth Browser Regression 성공. 기존 관리자 worktree는 깨끗하며 지정 브랜치와 일치했습니다.
- Saju PR #2739: OPEN/Draft, HEAD `09221bf6ecb7cf215d45a6bbd1bffe5e330df55e`, 기존 CI 성공. Saju 작업 트리에는 다른 작업의 대량 변경이 있어 수정하지 않았고 해당 커밋의 계약을 Git object로 읽었습니다. 명하 주 작업 트리의 미추적 로그도 보존했습니다.
- Supabase Production `cnsfpcdiyofqvhpcegfc`: 설치 이력 `20261029071539` 1개, 관리자 정책 29개, Reader SELECT 컬럼 178개. 감사 테이블은 RLS/FORCE RLS. Reader/Audit Writer는 LOGIN/NOINHERIT, 비슈퍼유저, NOBYPASSRLS, 관리 권한·역할 멤버십 없음. **두 역할의 비밀번호는 없음**. 기존 설치를 재적용하지 않았습니다.
- Cloudflare: 기존 고객/세연 Hyperdrive 3개만 존재하며 변경하지 않았습니다. 관리자 전용 Hyperdrive는 없고 `myeongha-admin` Worker는 404/미설치입니다.
- Access 앱 `3a376a53-ad4d-4a07-9fa0-cd55cb0cb62f`: 정확한 관리자 호스트, 단일 allow 정책, 단일 이메일 include, require/exclude 없음. 실제 로그인 세션 및 서명 JWT의 실검증은 미완료입니다.
- `admin-console-private-build.yml`: GitHub Actions 등록 상태는 active이나 기본 브랜치 `main`의 파일 조회는 404입니다. 기본 브랜치 등록을 수동 실행의 선행조건으로 취급합니다. [GitHub 공식 문서](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow). Draft PR을 병합하거나 기본 브랜치를 수정하지 않았습니다.
- 저장소 및 production 환경의 Secret 이름을 조회했으나 관리자 전용 배포 Secret은 없습니다. 로컬에 Supabase CLI/관리 토큰 및 관리자 환경 자격증명도 없습니다. 기존 일반 서비스 Secret을 관리자 런타임에 재사용하지 않았습니다.

## 운영 연결 차단

현재 Supabase 연결의 SQL 도구는 정상입니다. 다만 연결 도구에는 비밀번호를 로그 없이 생성·보관하고 Hyperdrive 및 GitHub에 전달하는 전용 자격증명 관리 기능이 없습니다. 기존 세션의 안전 검사 거부 이력이 있는 자격증명 변경을 SQL/다른 경로로 우회하거나 반복하지 않았습니다. 이번 세션에서 새로운 자동 승인 거부가 발생한 것으로 보고하지 않습니다.

비밀 입력을 일반 도구 인수·출력에 남기는 방식으로 대체하지 않습니다. 안전한 전용 자격증명 관리/전달 경로와 관리자 전용 배포 Secret이 준비된 후 TLS 로그인 → Hyperdrive 생성/재조회 → 비활성 배포 → 실제 Owner/비허용 세션 → Member 인증·감사·Production 조회를 검증해야 합니다. 읽기 개통에는 Credit Executor나 A4/A5 완성을 요구하지 않습니다.

## 연결 검증 구현

- 감사 저장 검사: 실제 전용 TLS 로그인 및 권한 검사 후 합성 감사 INSERT 1개, 감사/고객 SELECT 및 고객 UPDATE의 권한 거부, 감사 CHECK 거부를 검증하고 전부 롤백합니다. EXPLAIN은 ANALYZE 없이 사용하며 고객 DML은 실행하지 않습니다. 정상 저장·권한 거부·연결 장애를 같은 성공으로 취급하지 않습니다.
- 비활성 Worker: Access JWT 검증을 기능 플래그보다 먼저 수행합니다. 검증된 Owner에만 명시적 비활성 응답을 반환하며 DB 연결·자산 처리 없이 종료합니다.
- 익명 검사: 일반 503은 실패입니다. 실제 빌드 JS/CSS를 두 자산 경로에서 검사합니다. 별도 실세션 검사는 Owner 및 비허용 사용자 둘 모두 필요하며 Member 인증·데이터 조회 검증과 분리합니다.
- 워크플로: 감사 저장 롤백 검사와 배포 후 Access/Hyperdrive 재조회를 기존 비활성 스테이징에 연결했습니다. 4개 활성화 플래그는 false를 유지합니다.
- A5: 늦게 도착한 동의 응답이 철회 뒤 쿠키를 되살리는 경합을 수정했습니다. 진행 중인 응답 이후 철회를 실행하며 [Web Locks 표준](https://www.w3.org/TR/web-locks/)의 동일 출처 잠금으로 탭 간 쿠키 변경도 직렬화합니다. 미지원 환경은 탭 내부 직렬화를 적용하며 다른 탭의 무효 동의는 서버 원장에서 거부합니다. 실패한 철회는 명시적 재시도 성공 전까지 수집을 재개하지 않습니다. 실제 동의 처리기·원장 모형·브라우저 쿠키 순서를 함께 검증하는 회귀 테스트를 추가했습니다.
- A5 보존: 같은 DB 로그인을 비밀번호·호스트 대소문자·percent 인코딩·SSL 옵션만 바꿔 재사용해도 SQL 실행 전에 거부합니다. 스케줄 자체는 운영 설치되지 않았고 활성화하지 않았습니다.

## 기존 A4–A7의 남은 외부 의존성

| 단계 | 현재 코드와 남은 정본 |
|---|---|
| A0–A3 | 기존 구현 완료. 전용 로그인·TLS·Access/Owner·감사·Production 조회 실검증 후 읽기 개통 |
| A4 | Saju 실제 공급사 콜백은 서버 전용 `onProviderCall`이며 requestId/callId/usage를 제공함. 명하 Product Reading의 영속 실행 시도 할당/최종화 및 Production Interpretation Authority가 HTTP 실행 함수 밖에 있음. Saju requestId → DB Reading/실행 시도 매핑 정본이 없으므로 `resolve()`를 추측 구현하지 않음. 전용 비용 Writer/원장 설치도 이 증거와 별개로 필요 |
| A5 | 명시 동의·철회 UI, 서명 탭 세션, 서버 검증 Reading/결제/출생 adapter, 삭제 worker 주입, 180일 bounded purge 코드가 있음. 실제 정책 버전/방문 판정 증거·전용 Writer 설치·공개 라우트 구성·삭제 주입·스케줄 운영 확인이 없어 수집은 비활성. 수집 미확인은 0으로 표시하지 않음 |
| A6 | 크레딧과 표현 정보의 검토된 RPC 후보 및 확인/멱등/감사 경로가 있음. 전용 Executor 설치/로그인·Lot/예약 실검증 전 고객 명령은 비활성. 환불·제한·대리 삭제/복구는 정본 실행 계약이 없어 차단 유지 |
| A7 | 운영 DB에는 감사 테이블만 있고 표현 정보 테이블/RPC/Executor는 없음. 후보는 단일 Owner·전용 자격증명 결속을 요구하므로 해당 기반 준비 전 운영 설치하지 않음. 기존 가격/판매/상품/캐릭터 권한을 확대하지 않음 |

위 외부 의존성을 합성 테스트 통과로 대체하거나 완료로 표기하지 않습니다.
