# @myeongha/admin

명하 운영자 전용 콘솔의 첫 구현 단계(Admin-01 / A0)입니다.

## 실행

Node 24 / npm 11, 저장소 루트에서 의존성을 설치한 후:

- 개발: npm run dev:admin → http://127.0.0.1:4184/admin/
- 타입 검사: npm run typecheck -w @myeongha/admin
- 빌드: npm run build:admin
- 미리보기: npm run preview -w @myeongha/admin
- 경로 테스트: npm run test -w @myeongha/admin

React 19와 기존 web 워크스페이스에서 설치하는 Vite 8 빌드 도구를 재사용합니다. 취약 버전으로 표시된 Vite를 관리자 workspace에 새 의존성으로 추가하지 않으며, 개발 서버는 127.0.0.1에서만 바인딩합니다. 결과물은 apps/admin/dist에만 저장하며, 기존 apps/web → public 빌드 및 명하 Production 배포와 결합하지 않습니다.

## 현재 보안 경계

**A0은 화면 골격입니다. 인증 또는 운영 데이터 조회가 구현된 상태가 아닙니다.**

- 화면에 표시되는 수치는 모두 '—'이며 모의 사용자/매출/비용 데이터가 없습니다.
- 브라우저에서는 사용자 DB, 서비스 권한, 영수증, 원장, Reading, API secret에 접근하지 않습니다.
- 운영자 인증/허용 목록/서버 강제 접근 제어는 후속 Admin-02(A1)에서 구현합니다.
- 이 앱을 공개 환경에 호스팅하거나 기존 Vercel Production의 공개 경로에 병합하지 마세요. 독립 배포는 서버 측 인증 및 배포 플랫폼의 접근 제한이 마련된 이후 별도 게이트로 진행합니다.
- 관리자 로그인/버튼 표시 여부는 서버 권한 증거가 아닙니다. A1 전에는 운영 API를 열지 않습니다.
- 관리자 화면은 콘텐츠 정본을 편집하는 자유형 CMS가 아닙니다.

## 화면

/admin (운영 개요), /admin/users (사용자), /admin/commerce (결제·크레딧), /admin/readings (사주·AI), /admin/analytics (베타 분석), /admin/issues (운영 이슈).

로딩, 데이터 없음, 접근 거부, 오류에 공통 StatusPanel을 사용합니다. 뒤로 가기/앞으로 가기와 키보드 내비게이션을 지원합니다.

구현 순서 정본: docs/ADMIN_IMPLEMENTATION_ROADMAP_V1.md (Admin-01 → Admin-02 → …)

## 연속 구현 현황 (2026-10-26)

- A0: 화면 6개, 독립 빌드, 공통 상태, 반응형 구성. 기존 사용자 웹 변경 없음.
- A1: 서버 측 Member 검증 + Owner 허용 목록, 전용 관리자 읽기 역할 검사, 감사 writer 역할 검사, 쿼리 및 응답 필드 제한 구현. 별도 비공개 배포/DB 역할 설치 전까지 실제 활성화 금지.
- A2: 사용자 목록과 상세 메타데이터를 조회하는 파라미터화 SQL 및 화면 검색·페이징 구현. 실운영 권한은 미연결.
- A3: 검증 영수증 메타데이터, 가입 크레딧 지급 lot 조회 구현. 실제 결제 금액·잔여 크레딧·환불·권한 지급은 검증된 별도 계약 없으면 미표시.
- A4: Reading 실행 상태, AI 호출 건수·토큰·지연, 별도 추정 USD 비용 이벤트 조회 구현. 원화 원가나 공급사 청구금액으로 간주 금지.
- A5: 베타 analytics 집계 원본 미확인. 조회 비활성, 임의 퍼널 데이터 없음.
- A6: 승인된 운영 명령 미연결. 임의 지급·환불·계정 변경 기능 없음.
- A7: 상품 카탈로그 메타데이터 읽기 전용 조회 추가. 활성 플래그는 판매 출시 승인과 다름.

### 독립 운영 접근 게이트

별도 관리자 Runtime 조합은 apps/api/src/admin-private-runtime-v1.ts에만 있으며 기존 공개 api 디렉터리와 연결되지 않았습니다. 서버 환경설정에는 MYEONGHA_ADMIN_PRIVATE_ENABLED, MYEONGHA_ADMIN_OWNER_AUTH_USER_ID, MYEONGHA_ADMIN_SUPABASE_ORIGIN, MYEONGHA_SUPABASE_API_KEY가 필요합니다. 비공개 호스팅, dedicated admin reader 및 audit writer 권한/보존 정책, 감사 RLS의 설치·실증 없이 운영 데이터 조회 불가 상태를 유지합니다.

오프라인 감사 스키마 후보: apps/admin/database/operator-audit-local-v1.sql. 운영 마이그레이션에 포함되지 않았습니다.

오프라인 최소 권한 후보 SQL: apps/admin/database/operator-roles-offline-v1.sql. 위 스크립트는 로컬/격리된 검토 대상이며 운영 DB에 적용되었다는 의미가 아닙니다. 컬럼별 SELECT와 관리자 전용 RLS 정책, 감사 INSERT 전용 정책을 분리하며 운영 로그인 비밀은 코드에 저장하지 않습니다.

## 로컬 전용 API 실행 (A1 실행 가능 코드)

일반 사용자 API나 Production 배포에 등록하지 않는 독립 로컬 백엔드가 추가되었습니다.

1. 기존처럼 관리자 프런트는 `npm run dev:admin`으로 실행합니다. Vite 개발 서버는 127.0.0.1:4184로 바인딩됩니다.
2. 관리자 API는 `npm run serve:private -w @myeongha/admin`으로 별도 실행합니다. 127.0.0.1:4185 외 네트워크 바인딩을 거부합니다.
3. 실행 전에 서버 환경에 `MYEONGHA_ADMIN_PRIVATE_ENABLED=true`, `MYEONGHA_ADMIN_OWNER_AUTH_USER_ID`, `MYEONGHA_ADMIN_SUPABASE_ORIGIN`, `MYEONGHA_SUPABASE_API_KEY`, `MYEONGHA_ADMIN_MEMBER_AUTH_ORIGIN`, `MYEONGHA_ADMIN_READ_DATABASE_URL`, `MYEONGHA_ADMIN_AUDIT_DATABASE_URL`, `MYEONGHA_ADMIN_DATABASE_SSL_ROOT_CERT_PEM`을 안전하게 제공해야 합니다.
4. DB URL은 서로 다른 최소권한 PostgreSQL 로그인 `myeongha_admin_reader` / `myeongha_admin_audit_writer`로 설정하고 TLS `sslmode=verify-full` 및 고정된 Supabase Root CA를 사용합니다. 자격 증명은 Vite나 브라우저 환경에 입력하지 않습니다.

로컬 인증 중계는 기존 회원 인증 API의 sign-in만 재사용하며, 응답에서 access token 외 모든 사용자 정보·Refresh token·Set-Cookie를 제거합니다. 실제 Owner 확인은 다시 Supabase 회원 검증과 허용 목록/감사 DB를 사용합니다. 기존 서비스의 로그인 제한 정책을 우회하거나 새로운 인증 정본을 만들지 않습니다. 비공개 호스팅과 DB 전용 역할이 준비되지 않았다면 API 구동을 시도하지 말고 조회 차단 상태를 유지합니다.

**중요:** 아직 사용자 Production DB 접근 권한과 외부 배포가 설정되지 않았습니다. 위 커맨드는 준비된 자격증명/역할이 실제 존재할 때만 동작하며, 현재 코드 병합 자체는 허가가 아닙니다.
