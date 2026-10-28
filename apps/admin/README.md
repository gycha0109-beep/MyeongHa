# @myeongha/admin

명하 운영자 전용 콘솔의 연속 구현 브랜치(A0~A7 일부)입니다. 코드 구현과 실제 운영 활성화는 분리합니다.

## 실행

Node 24 / npm 11, 저장소 루트에서 의존성을 설치한 후:

- 개발: npm run dev:admin → http://127.0.0.1:4184/admin/
- 타입 검사: npm run typecheck -w @myeongha/admin
- 빌드: npm run build:admin
- 미리보기: npm run preview -w @myeongha/admin
- 경로 테스트: npm run test -w @myeongha/admin

## 독립 운영 배포 구성

`apps/admin/wrangler.jsonc`와 `cloudflare/admin-worker.mjs`는 기존 사용자 Worker와 다른 `myeongha-admin` 대상입니다. `npm run build:private -w @myeongha/admin`은 번들·자산을 dry-run 검증하며 업로드하지 않습니다. 수동 `Admin Console Private Build` workflow도 배포·역할 설치를 실행하지 않습니다.

모든 자산에 Cloudflare Access의 RS256 서명·정확한 issuer/audience/Owner 이메일·만료 검증이 선행하고, API는 기존 Supabase Owner 허용 목록을 추가 검증합니다. 원래 사용자 DB binding은 재사용하지 않습니다. 전용 Reader/Audit Writer Hyperdrive origin과 실제 최소 권한 속성 검사가 필요하며, 브라우저는 Access 쿠키를 same-origin으로만 전송하고 서버는 상류에 쿠키·refresh token을 전달하지 않습니다.

`npm run verify:hosted -w @myeongha/admin`은 필요한 설정 **이름**만 보고하며 미설정이면 종료 코드 2입니다. `--allow-blocked`는 구성 계약 확인용입니다. 완성된 환경에서 `node apps/admin/deployment-check.mjs --write-config <새 로컬 경로>`로 전용 binding을 가진 구성을 생성할 수 있습니다. API 키는 생성된 파일에 쓰지 않으며 활성화는 여전히 false입니다. Access 정책·전용 origin 역할·감사 저장의 실제 검증 후에만 서버 secret으로 활성화합니다.

2026-10-27 연결 메타데이터 확인: Production에는 관리자 전용 Reader/Audit Writer 역할·감사 테이블이 없고, Cloudflare에는 별도 관리자 Worker/binding이 없으며 Access는 미활성입니다. 기존 사용자 Worker와 Vercel 프로젝트를 변경하거나 postgres 연결을 관리자 자격증명으로 승격하지 않았습니다. 새 역할 비밀 생성·운영 DDL·실사용자 조치는 실행하지 않았습니다.

React 19와 기존 web 워크스페이스에서 설치하는 Vite 8 빌드 도구를 재사용합니다. 취약 버전으로 표시된 Vite를 관리자 workspace에 새 의존성으로 추가하지 않으며, 개발 서버는 127.0.0.1에서만 바인딩합니다. 결과물은 apps/admin/dist에만 저장하며, 기존 apps/web → public 빌드 및 명하 Production 배포와 결합하지 않습니다.

## 현재 보안 경계

**Owner 확인, 감사, 읽기 전용 조회, 로컬 API 실행 후보는 코드로 구현됐지만 아직 운영 DB 권한·실제 호스팅과 연결되지 않았습니다.**

- Owner 서버 권한·전용 DB 연결이 없을 때는 수치가 '—'로 표시되며 모의 사용자/매출/비용 데이터는 없습니다. 연결 성공 시에는 정본 테이블의 집계만 표시합니다.
- 브라우저에서는 사용자 DB, 서비스 권한, 영수증, 원장, Reading, API secret에 접근하지 않습니다.
- Owner 인증·허용 목록·서버 접근 제어는 코드로 구현돼 있으며 실제 관리자 전용 역할 및 비공개 호스팅 설치 전에는 활성화되지 않습니다.
- 이 앱을 공개 환경에 호스팅하거나 기존 Vercel Production의 공개 경로에 병합하지 마세요. 독립 배포는 서버 측 인증 및 배포 플랫폼의 접근 제한이 마련된 이후 별도 게이트로 진행합니다.
- 관리자 로그인/버튼 표시 여부는 서버 권한 증거가 아닙니다. 비공개 접근·전용 DB 권한·감사 정책 검증 전에는 운영 API를 열지 않습니다.
- 관리자 화면은 콘텐츠 정본을 편집하는 자유형 CMS가 아닙니다.

## 화면

/admin (운영 개요), /admin/users (사용자), /admin/commerce (결제·크레딧), /admin/readings (사주·AI), /admin/analytics (베타 분석), /admin/issues (운영 이슈).

로딩, 데이터 없음, 접근 거부, 오류에 공통 StatusPanel을 사용합니다. 뒤로 가기/앞으로 가기와 키보드 내비게이션을 지원합니다.

구현 순서 정본: docs/ADMIN_IMPLEMENTATION_ROADMAP_V1.md (Admin-01 → Admin-02 → …)

## 연속 구현 현황 (2026-10-27)

- A0: 화면 6개, 독립 빌드, 공통 상태, 반응형 구성. 사용자 웹에는 표현 정보 공개 피드와 기본 비활성 분석 초기화만 추가합니다.
- A1: 서버 측 Member 검증 + Owner 허용 목록, 전용 관리자 읽기 역할 검사, 감사 writer 역할 검사, 쿼리 및 응답 필드 제한 구현. 별도 비공개 배포/DB 역할 설치 전까지 실제 활성화 금지.
- A2: 사용자 목록과 상세 메타데이터를 조회하는 파라미터화 SQL 및 화면 검색·페이징 구현. 실운영 권한은 미연결.
- A3: 검증 금액·통화, 영수증별 권한 이력·결제사 처리 메타데이터, Lot 잔액·출처·예약·배분·요청 멱등성 참조, 수동 불일치 점검 구현. 결제사 refund 유형이나 revoked 상태를 실제 환불 완료로 간주하지 않음.
- A4: Reading 실행·AI 토큰·지연 및 호출/기능/사용자/일·월별 비용 조회, 캐시를 반영한 계산·단가 버전·서버 청구 대조 인터페이스 구현. 청구 원본·환율·Reading 원가 적재 미연결 값은 null입니다.
- A5: 버전 이벤트·동의 결속·철회/삭제·TTL·멱등 적재와 동일 UTC 코호트 집계, 일/주/월·상품/채널/캠페인 화면 구현. 실제 정책·관측 원본이 없으므로 추적 비활성. 검증 영수증 금액 조회는 별도 원본입니다.
- A6: Owner·입력·사유·확인·멱등 결과 재조회 공통 경로 구현. 크레딧·환불·계정 조치는 도메인 실행 계약 부재로 차단합니다.
- A7: 기존 운영 조회와 CSV에 공지·배너 작성/수정·게시/예약·미리보기·변경 이력·원자적 감사를 추가했습니다. 표현 정보 전용 RPC와 최소 권한 설치 후보이며 운영 미활성입니다. 판매·가격·캐릭터 정본을 수정하지 않습니다.

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

## 최신 구현 진척 및 데이터 제한

- Owner 인증: 정상 회원 로그인을 한 뒤 별도 `GET /api/admin/session`을 조회하고, 서버가 확인한 Owner만 화면으로 진입합니다. 권한 만료·거부 시 메모리 토큰을 즉시 폐기합니다.
- 첫 화면: 현재 활성 회원 수, 최근 7일 검증 영수증 수, 완료 Reading 수, AI 호출 건수를 실제 정본 테이블에서 집계합니다. 연결 실패 시 `—` 표시합니다. 원가/순매출로 해석하지 않습니다.
- 상세 조회: 사용자 UUID → 사용자 상세 → 동일 사용자 결제·Reading 이동, 개별 영수증 UUID를 기준으로 결제 검증/결제 시도 상태를 조회합니다. 임의 카드 결제액·권한 지급 결론을 생성하지 않습니다.
- 조회 필터: 사용자 참조(지원하는 테이블에 한함), 날짜 양단 지정 최대 90일, 50개 이하 페이지, 상태별 운영 이슈 필터. SQL에서 지원하지 않는 필터는 서버가 명시적으로 거부합니다.
- 이슈 내보내기: 운영자 권한과 감사 기록이 성공한 경우에만 CSV 최대 50건. 원본 이벤트 payload·대화·출생·영수증 내용 제외, CSV 수식 주입을 제한합니다.
- 베타 분석: 분석 관측 계약이 없을 때 방문자 지표는 `—`입니다. 수집·동의·보존 계약 확정 전까지 실제 이벤트 적재는 없고 서버 검증 영수증 사실만 별도 조회합니다.
- 운영 조치: 크레딧 보정·환불·회원 삭제/복구·가격 변경은 모두 비활성입니다. 승인된 도메인 명령과 멱등성·감사·재인증이 마련되기 전까지 임의 실행 불가.
- 로컬 테스트: 사용자 인증은 기존 공식 Member 인증 경로로만 중계합니다. 토큰과 사용자 정보의 불필요한 복제를 금지하고, 관리자 API는 별도 DB 역할을 검증합니다.

기본 관리자 앱 빌드가 성공해도 운영 데이터 연결·권한 부여·Production readiness를 의미하지 않습니다. CI는 관리자 콘솔 코드를 검증하지만 개인 데이터가 있는 운영 DB를 자동으로 연결하지 않습니다.

## A3 운영 원장 조회 보강

- `signup` 50/30일, `portone_topup` 300/무기한, `reading_reward` 150/90일을 기존 도메인 정본의 Lot와 만료일로 구분합니다. 구매/보상 발행은 운영자 UI에서 실행하지 않습니다.
- 사용자 가용 크레딧 조회는 만료일 NULL인 유료 Lot를 포함합니다. 지급 목록에는 현재 Lot 잔액·유효성·만료일을 표시하고, 지급 후 계정 잔액을 임의로 추정하지 않습니다.
- 검증된 크레딧 결제는 일반 `entitlement_events` 대신 출처가 연결된 `portone_topup` Lot를 확인합니다. 연결 증거가 없을 때에는 수동 점검 대상으로 표시하며 자동 지급하지 않습니다.
- 금액·통화는 실제 `commerce_receipts`에서 `verified` 상태일 때의 `verified_amount_minor` / `verified_currency`만 표시합니다. 카탈로그 정가를 실제 결제로 표현하지 않습니다.
- 크레딧 원장 출처 및 예약 상태는 허용값으로만 서버 필터링하며 조회·감사 권한은 동일하게 유지합니다.

- 크레딧 예약에 실제 투입된 Lot별 수량은 `credit-allocations` 읽기에서 조회합니다. `released` 예약은 정산 과정에서 원장으로 복원되므로, 표시된 할당 수량을 현재 차감액으로 취급하지 않습니다. 본문·대화 내용과 원장 변경 명령은 제공하지 않습니다.

## 관리자 감사 이력 조회

- `/api/admin/audit`은 별도 읽기 역할이 허용하는 요청 UUID, 운영자 UUID, 대상 UUID, 행동, 성공/거부/실패, 기록 시각만 반환합니다. 최대 90일·페이지당 50건 제한을 유지합니다.
- 감사 writer 역할은 INSERT 전용으로 유지하며, reader 역할의 SELECT/정확한 필드·RLS 정책은 운영 승인이 필요한 오프라인 후보에만 기술되어 있습니다.
- 감사 테이블의 로컬 설치 후보와 운영 권한 활성화는 별개입니다. 프로덕션 적용·기록 보존 정책은 자동으로 확정하거나 실행하지 않습니다.

## 사용자·거래 조사 보강 (2026-10-27)

- 영수증별 결제사 이벤트는 `resolved_receipt_id`와 enum 처리 상태로 조회합니다. 원본 거래 ID·결제사 payload·fingerprint는 권한 후보·응답에서 제외합니다. 90일 이전에 지급된 Lot도 현재 가용 잔액이 있으면 기간 미지정 목록에 포함합니다.
- Reader/Audit Writer는 이름 외에 LOGIN·NOINHERIT·NOSUPERUSER·NOBYPASSRLS·관리 권한 없음·다른 역할 멤버십 없음까지 확인합니다. 같은 이름의 권한 상승도 안전하게 거부합니다. 실제 설치·자격증명 제공은 계속 별도 게이트입니다.

- 기존 `/api/admin/analytics`는 11개 baseline 이벤트의 정본 근거를 유지합니다. 추가 `/api/admin/analytics-dashboard`는 실제 검증 결제와 분석 코호트를 분리합니다. 확장 이벤트·추적기·저장소는 명시적 정책이 필요한 후보이며 자동으로 승인·활성화되지 않습니다.

- AI 호출·추정 원장은 정확한 모델과 각 원본의 기능 enum으로 필터링합니다. 일별 집계는 UTC이며 대화 참조가 없는 실행을 Reading 비용으로 추정하지 않습니다. Reading 전용 원가·원화 환산은 근거 부재로 미측정입니다.
- Reading 목록도 실제 기록된 엔진·응답 계약·최근 오류를 표시하며, 상세에는 요청 계약·확정 시도·응답 상태를 추가합니다. birth hash, 외부 Reading 참조, 요청/응답 본문은 조회하지 않습니다.
- 카탈로그는 폐기·미폐기 활성 Offer 수, 장애는 저장 오류 코드·시도 수·임대 시각, 삭제 작업은 시작·요청 후 경과를 관측합니다. 카탈로그 활성은 판매 승인, 저장 시도 수는 재시도 정책의 증거가 아닙니다.

- 보유 권한은 저장된 `entitlements` 투영과 만료 근거를 표시합니다. 실제 접근 허용 판정은 기존 Access Gate의 책임입니다.
- 영수증 상세의 권한 이력은 정확한 `source_receipt_id`에 연결된 지급·갱신·철회 등 최소 이벤트 메타데이터만 조회합니다. 이벤트 payload, 외부 거래 키, 사유 원문은 반환하지 않습니다.
- 동일 영수증·사용자·권한 종류·범위에 복수 활성 Grant가 있으면 수동 점검 신호를 표시합니다. 한 상품의 서로 다른 Capability 지급을 중복으로 간주하지 않습니다.
- 크레딧 예약의 `thread_id`·`client_turn_id`는 요청 멱등성 참조입니다. released는 미전달 해제·Lot 복원 상태이며, 복원한 Lot의 만료와 가용 잔액은 별도로 판단합니다.
- UI는 access token 만료에 잠기며, 60초 간격과 화면 재진입 시 Owner 권한을 서버에서 재검증합니다. 단일 비공개 Runtime의 Owner 조회는 분당 60건으로 제한하고 초과 요청도 감사합니다.

### 격리 DB 검사

`npm run test:db:offline -w @myeongha/admin`은 `MYEONGHA_ADMIN_TEST_DATABASE_URL`이 `postgresql://myeongha_admin_reader@127.0.0.1:<port>/myeongha_admin_disposable`인 경우에만 실행합니다. 먼저 폐기 가능한 로컬 DB에 기존 CI bootstrap/migrations, credit private candidate, 관리자 감사·권한 후보를 준비해야 합니다. PG17의 0860 managed-principal 검사는 기존 CI 전용 경계를 따릅니다. 이 명령은 역할을 설치하거나 운영 DB에 접근하지 않습니다.

실제 PostgreSQL에서 모든 지원 조회를 실행하고, 원문·비밀 컬럼 SELECT와 UPDATE/DELETE 거부를 확인합니다. 빈 데이터베이스 검사만으로 지급 불일치의 데이터 시나리오 또는 운영 E2E 통과를 주장하지 않습니다.

## 현재 남은 경계

- **운영 환경:** 비공개 호스팅, 실제 Owner·Reader/Audit Writer 자격증명과 역할 설치, 감사 보존·복구 검증. 후보 SQL과 로컬 검증은 운영 설치 허가가 아닙니다.
- **A4 비용:** 서버 전용 증거 로더는 별도 인증된 공급사 청구·환율 전송에서 얻은 원본의 실제 바이트 SHA-256을 독립적으로 고정된 해시와 대조한 후에만 파싱합니다. 이 해시는 무결성 검사이지 공급사 인증 자체가 아닙니다. 실제 로더/정본 청구서·환율 파일은 아직 연결되지 않았으며 기본값은 미측정입니다.
- **A4 비용:** 미종료 서울 월의 `complete` 표시 자료도 확정 월 전체 비용으로 인정하지 않고, 확인된 일부 금액과 별도로 보관합니다.
- **A4 비용:** Reading 전용 비용 적재, 공급사 확정 청구액, 검증된 원화 단가·환율 근거가 없어 해당 원가·예산 초과 경보는 미측정입니다. 기존 호출/실패/추정 원장과 분리합니다.
- **A5 실측:** 명시적으로 승인된 클라이언트에서만 저장된 HttpOnly 동의 영수증과 DB 동의를 재검증하고 같은 탭의 분석 세션을 복원할 수 있습니다. 복원은 신규 동의 발급·추적을 실행하지 않으며, 기본 비활성 페이지는 네트워크 호출이 없습니다.
- **A5 실측:** 상품 상세 유효 방문·결제 시도·결과 열람·평가·중대 불만 계약, 분석 전용 동의/거부·연결 보존/삭제, 적재·고유 코호트·캠페인·유료/체험단 결속 근거가 필요합니다. 추가 추적은 비활성입니다.
- **A6 변경:** 관리자 보정·환불·삭제/제한/복구의 승인 실행 계약이 없습니다. 회원 본인의 삭제 명령이나 내부 도메인 함수를 관리자 권한으로 전환하지 않습니다. 공지·배너는 별도 표현 정보 전용 명령 후보로 구현했습니다.

현재 권한과 정본으로 구현 가능한 읽기·계약 범위를 연결한 상태이며, 운영 환경 검증·활성화 완료와 구분합니다. 위 결정의 주체는 이 프로젝트의 단일 Owner인 사용자입니다.

## 추가 저장소·명령 검증 및 활성화 경계

- 격리 DB 설치 순서: 기존 bootstrap/migrations·credit candidate → `operator-audit-local-v1.sql` → `operator-roles-offline-v1.sql` → `ai-finance-offline-v1.sql` / `operator-presentation-offline-v1.sql` / `analytics-pipeline-offline-v1.sql`. 모두 이 디렉터리의 오프라인 후보이며 자동 운영 마이그레이션에 포함하지 않습니다.
- 위 설치 후 `npm run build`와 `MYEONGHA_ADMIN_TEST_DATABASE_URL=postgresql://myeongha_admin_reader@127.0.0.1:<port>/myeongha_admin_disposable`을 사용해 `node apps/admin/database/verify-analytics-offline-v1.mjs`를 실행합니다. 실제 적재·재실행·충돌·철회·subject 삭제·TTL·읽기 역할 쓰기 거부를 검사합니다. 운영 URL은 거부합니다.
- `ai-finance-offline-v1.test.sql`과 `operator-presentation-offline-v1.test.sql`은 비어 있지 않은 합성 시나리오를 트랜잭션 안에서 검증한 뒤 롤백합니다. 공지 테스트는 공개 API 역할의 비공개 이력 접근 거부와 감사 실패 시 저장 롤백을 포함합니다.
- 공지 명령은 전용 `myeongha_admin_command_executor`만 RPC를 호출합니다. 테이블 쓰기 권한은 없고, NOLOGIN 소유자가 표현 정보·명령 영수증·변경 이력·감사를 같은 트랜잭션에 저장합니다. 다른 테이블 또는 자유 SQL은 노출하지 않습니다.
- 로컬 명령 연결에는 선택적 `MYEONGHA_ADMIN_COMMAND_DATABASE_URL`이 필요합니다. 호스팅에는 별도 `MYEONGHA_ADMIN_COMMAND_HYPERDRIVE_ID`와 서버 secret `MYEONGHA_ADMIN_CONFIRMATION_SECRET`(32바이트 이상)이 필요합니다. 확인 서명은 Owner·입력 해시·작업 ID·예상 버전·5분 만료에 결속되어 서로 다른 Worker 요청에서도 검증됩니다. 구성 생성기는 secret 값을 기록하지 않습니다.
- 사용자 Worker의 `/.well-known/myeongha/presentations`는 `MYEONGHA_PUBLIC_PRESENTATIONS_ENABLED=true`일 때만 동작합니다. 정해진 공개 RPC가 현재 게시 기간에 해당하는 표현 정보만 반환합니다. 사용자 웹은 일반 텍스트와 내부 링크만 렌더링합니다. 기본값은 404이며 설치 전 활성화하지 않습니다.
- 분석 서버 Collector·Postgres Store는 아직 Production에 장착하지 않습니다. 분석 전용 동의 발급/철회, 보존 시간, 삭제 작업 연결, 유효 방문 판정, 승인 이벤트/채널 목록과 관측 완전성 근거가 필요합니다. 브라우저 기본 초기화는 식별자 생성·storage/referrer 읽기·분석 요청을 하지 않습니다.
- AI는 기존 `seyeon_ai_call_cost_events`와 저장된 가격 버전을 좁은 RPC로 조회합니다. 캐릭터 대화와 미적재 Reading 비용을 혼합하지 않습니다. 서버의 청구 원본 어댑터가 없는 확정 비용·원화·매출 대비 비율은 null입니다. 브라우저 청구 비교 입력은 미검증 미리보기이며 원장이나 확정액을 바꾸지 않습니다.

호스팅 기본 필수 이름은 `deployment-check.mjs`의 `ADMIN_HOSTED_REQUIRED_V1`에 있습니다: 관리자 origin, Access issuer/AUD, Owner 이메일/Auth UUID, 고정 Supabase origin/publishable API key, 기존 회원 인증 origin, 서로 다른 Reader/Audit Writer Hyperdrive ID. 현재 실제 전용 역할·감사 테이블·Access 앱·관리자 Worker가 없어 배포와 활성화를 수행하지 않았습니다. 이 미연결 상태는 코드·로컬 테스트 통과와 별개입니다.


## 2026-10-28 source-linked AI / consented analytics implementation

- Reading detail now exposes `GET /api/admin/readings/:id/ai-usage` for **AI calls that actually referenced the selected Reading grounding**. It does not claim the price of Reading generation; unverified KRW costs remain `null`. New read-only grounding link grants are offline candidates only.
- Verified server event deduplication tolerates a new tab session for the same source/visitor/consent, preserves the first attribution, and still rejects conflicting subject, purchase or client-origin event data.
- Analytics TTL maintenance has a separate disabled-by-default Worker schedule gate and a dedicated analytics-writer Hyperdrive; each run deletes at most 1000 events plus 1000 drained consents per transaction, independent of audit retention. No DB role or Cloudflare binding has been installed.
- The offline Reader role includes only the receipt `environment` metadata needed for that production-only filter; it does not grant access to payment provider payloads.
- The existing claimed account-deletion worker accepts an optional dedicated analytics erasure store; when configured it erases subject analytics before DB finalization and before completion acknowledgement. Failure blocks completion for retry. Production remains unconfigured by default.
- Analytics retention keeps running bounded batches until BOTH expired events and consents are drained, not just until one table returns fewer than 1000 rows.
- A5 purchase conversion and operational finance exclude sandbox/test receipts by checking the server-persisted receipt environment (`production`) in addition to verification status; none of these figures are net revenue or refunds.
- Three server-only A5 adapters validate source evidence before a cohort event can be admitted: `admin-analytics-verified-purchase-v1.ts` (verified paid Reading receipt), `admin-analytics-verified-reading-v1.ts` (committed Reading completion), and `admin-analytics-verified-birth-v1.ts` (persisted current self birth revision; no birth values selected).
- Each requires an authenticated Subject, active consent/session, matching durable pseudonymous Subject link, and **consent granted before the actual domain event**. Stable server event IDs deduplicate repeated processing. No conversion is inferred from browser success screens or a purchase intent.
- These adapters are not attached to Production command handlers or event collectors. The separate analytics writer, consent runtime, complete observability coverage, deletion binding and explicit collection activation remain prerequisites. Billing exports, verified FX and Reading-generation costs are still unconnected.

## workers.dev without a purchased domain (2026-10-28)

The verified account subdomain is gycha0109.workers.dev; this isolated console's intended origin is https://myeongha-admin.gycha0109.workers.dev. Cloudflare Zero Trust registration is complete but there is not yet a dedicated Access application, Admin Worker, dedicated Hyperdrive, or Admin Postgres role.

The wrangler.jsonc now permits only its own workers.dev hostname, while keeping preview_urls: false and all operational activation flags at false. The worker rejects every request unless the explicit private enablement, verified Access JWT/Owner, dedicated read/audit DB and rate limiter are available. The deploy preflight rejects other worker hostnames, mismatched Access tenants, and reused customer DB bindings. No production deploy is implicit in build or dry-run.

See docs/operations/ADMIN_WORKERS_DEV_HOSTING_20261028.md before any live execution. Existing public myeongha Worker must not be protected or replaced with Admin settings.
