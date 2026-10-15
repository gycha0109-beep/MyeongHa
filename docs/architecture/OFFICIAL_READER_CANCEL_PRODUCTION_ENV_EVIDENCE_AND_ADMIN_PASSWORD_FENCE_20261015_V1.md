# D3e24 — 명하 운영 환경변수 확인 결과 및 관리자 비밀번호의 앱 코드 격리

작성: 2026-10-15. **운영 DB·Vercel 값·키·실결제·배포 변경 없음.**

## 실제 사용자의 Vercel 확인 결과 (이전 확인 요청 정정)

Vercel `myeongha` 프로젝트 **Production**의 설정 화면을 소유자가 직접 확인했습니다.

다음 7개 변수 **이름 및 Production 적용 범위**가 사용자 제공 화면으로 확인되었습니다.

1. `MYEONGHA_DATABASE_URL`
2. `MYEONGHA_DATABASE_PRINCIPAL`
3. `MYEONGHA_SUPABASE_URL`
4. `MYEONGHA_SUPABASE_API_KEY`
5. `MYEONGHA_DATABASE_TLS_PEER_MODE`
6. `MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM`
7. `MYEONGHA_GUEST_FINGERPRINT_SECRET`

`MYEONGHA_DATABASE_PRINCIPAL`의 값은 사용자 확인에 따라 **`myeongha_runtime`**입니다. 이는 비밀번호가 아닌 역할 식별자입니다.

**중요한 정정:** `SUPABASE_DB_PASSWORD`는 Vercel에 원래 존재하지 않았습니다. 잘못된 안내에 따라 사용자가 일시 등록한 뒤 스스로 삭제했으며, 현재의 사용자 확인 기준 Vercel Production 환경변수 목록에는 **없습니다**. 기존에 관리자 비밀번호가 Production 앱에 배치되어 있었다는 이전 추정은 **근거가 없으며 철회**합니다. GitHub Actions의 별도 `secrets.SUPABASE_DB_PASSWORD` 설정은 Vercel 앱의 변수와 별개입니다. 여기에서 GitHub Actions 비밀값의 실제 존재/내용을 확인하지 않았습니다.

변수 목록 확인은 **변수 값, 실제 연결의 사용자명, 인증 키 등급, TLS 인증서 내용, 현재 배포 빌드에 변수 변경이 반영되었는지**를 확인한 것은 아닙니다. Vercel 연결 도구의 환경변수 API는 403 Forbidden이므로 소유자의 화면과 별도로 기계적으로 검증할 수 없었습니다. **실제 비밀값을 출력·문서화·요청하지 않습니다.**

## 실제 데이터베이스 권한의 독립 메타데이터 확인

읽기 전용 Supabase PostgreSQL `pg_catalog`에서 `myeongha_runtime`은 LOGIN 가능한 계정이며 superuser도, BYPASSRLS 권한 보유 계정도 아닙니다. `myeongha_api_executor` 구성원이며 `entitlement_events`·`purchase_intents` 직접 INSERT 권한이 없습니다. 따라서 사용자 확인 Vercel 계정명과 **의도된 일반 서비스 계정 구성이 일치합니다**.

반면 `service_role`은 이전 실사 결과 7개 Commerce·이용권 테이블에 직접 SELECT/INSERT/UPDATE/DELETE를 가지고 있습니다. **이 역할의 API 키가 어떤 배포 영역에 노출되는지는 아직 검증되지 않았으므로, 전체 서비스의 보안을 최종 합격 처리하지 않습니다.**

## D3e24 새 자동 검증: 관리자 DB 비밀번호의 앱 코드 재유입 방지

- `scripts/ci/official-reader-production-admin-secret-fence.mjs`: Vercel 설정 `vercel.json` 및 앱/API/Web/Mobile/shared package의 JavaScript·TypeScript·HTML·JSON **실행 코드**를 정적 검사합니다.
- `SUPABASE_DB_PASSWORD`, `SUPABASE_DATABASE_PASSWORD`, `POSTGRES_PASSWORD`라는 관리자 DB 비밀번호 환경변수 이름이 실행 코드에 등장하면 **오류로 처리**합니다. 비밀 원문이나 문제가 있는 코드 행은 로그에 출력하지 않습니다.
- GitHub Actions의 승인된 데이터베이스 관리 워크플로와 별도 스크립트가 관리자 비밀번호를 **서로 다른 실행 범위에서 참조**하는 계약을 확인합니다.
- 전용 일반 로그인 계정을 기대하는 코드·실제 로그인 역할 검사 코드가 유지되고 있는지도 확인합니다.
- 스캐너의 안전·비안전 사례 테스트를 같은 Node 실행에서 수행합니다. 실제 DB 권한 변화 없이 기존 DB Authority CI에 포함합니다.
- 이 검사는 **해당 환경변수 이름의 실행 코드 내 참조**만 탐지합니다. 코드상 문자열 조합, 외부 라이브러리, Vercel UI로 직접 입력한 환경변수/비밀값, 실제 배포된 함수, 사용 중인 Supabase API 키 등급까지 보장하지 않습니다.

## 여전히 보류인 부분

실제 `MYEONGHA_DATABASE_URL`의 사용자명과 `MYEONGHA_DATABASE_PRINCIPAL` 값이 일치하는지, Production 배포의 TLS peer 인증이 성공하는지, 실제 서비스 API 키가 publishable/anon인지 더 강한 권한의 서비스 키인지, 모든 비공개 결제·이용권 경로가 정상인가를 별도로 확인해야 합니다. 이를 위해 **추가 사용자 입력을 이번 작업에서 요청하지 않습니다.**

**D3e24: 저장소 내 안전 장치와 증거 정리만 수행. 운영 DB·환경변수·관리자 비밀번호·결제·배포 상태는 변경하지 않음. Draft/HOLD 유지.**
