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
