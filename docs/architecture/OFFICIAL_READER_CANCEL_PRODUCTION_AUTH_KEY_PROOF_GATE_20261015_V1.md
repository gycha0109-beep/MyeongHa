# D3e26 — 운영 Supabase API 키 등급의 비밀값 미출력 검증 게이트

**작성:** 2026-10-15. **상태:** DRAFT / HOLD / 미배포. 실제 결제, 운영 DB, 운영 키, 환경변수, PR 병합 및 배포는 변경하지 않았습니다.

## 현재 근거와 확인할 수 없는 영역

- 명하 Vercel Production에는 사용자 확인 기준 `MYEONGHA_SUPABASE_API_KEY`라는 변수 **이름**이 존재합니다. 해당 **값·등급은 확인되지 않았습니다.** `MYEONGHA_DATABASE_PRINCIPAL=myeongha_runtime`은 사용자 확인값입니다.
- Vercel 연결 도구의 환경변수 목록 조회는 403 Forbidden입니다. 명하 Supabase 프로젝트의 **공개키 목록**은 운영 Vercel에 **실제로 설정된 키 값과 동일한지** 입증하지 않으므로, Supabase 공개키를 조회·출력하거나 실제 Vercel 키로 추정하지 않았습니다.
- 2026-10-15에 Vercel Production 배포 목록을 읽기 전용으로 확인했습니다. 당시 가장 최근 배포는 `main` 기준 `5044d152e28beabb6143dc6515a7e30825f741d9`, 상태 READY였으며, 이 D3e26 및 부모 #2129의 인증 키 보호 코드는 **해당 Production 배포에 포함되지 않았습니다.**
- Supabase 공식 문서 <https://supabase.com/docs/guides/getting-started/api-keys>: `sb_publishable_…`와 기존 `anon` JWT는 일반 앱의 제한된 권한용, `sb_secret_…`와 기존 `service_role` JWT는 RLS 우회가 가능한 관리자급 키입니다. 사용자 로그인/회원가입/회원 신원 확인에는 후자 등급을 요구하지 않습니다.
- 기존 Vercel 환경변수 `SUPABASE_DB_PASSWORD`는 처음부터 없었고, 잘못된 안내로 임시 추가되었다가 사용자가 직접 삭제했습니다. **기존에 관리자용 비밀번호가 배포되어 있었다는 추정은 철회된 상태입니다.**

## 새 1단계: 검증 도구는 운영 키를 조회하지 않고 CI에서 완전히 시험

**`scripts/operations/verify-production-supabase-auth-key-class-local.mjs`**

- 접근권한이 **이미 있는** 승인된 운영 실행 환경 내부에서만 환경변수 `MYEONGHA_SUPABASE_API_KEY` 값을 **프로세스 메모리로 읽고**, 기존 #2129의 동일한 공개용/관리자용 분류기를 재사용합니다.
- 키 값·일부·해시·JWT payload·HTTP 헤더·비밀 URL은 어디에도 출력하거나 저장하지 않습니다. **명령행 인자로 키를 입력할 수 없도록 차단**합니다. `.env` 파일, Vercel API, Supabase API, 고객 데이터, 결제 데이터 및 외부 네트워크에 접근하지 않습니다.
- 공개용 `sb_publishable_` 또는 기존 `anon` 등급의 **형식만** PASS. `sb_secret_`, 기존 `service_role`, 미지 형식, 누락값은 HOLD(종료 코드 2).
- 이미 확인한 비민감 식별자 `MYEONGHA_SUPABASE_URL=https://cnsfpcdiyofqvhpcegfc.supabase.co` 및 `MYEONGHA_DATABASE_PRINCIPAL=myeongha_runtime`도 일치해야 PASS입니다. 일치하지 않으면 실제 입력값을 노출하지 않고 사유 코드만 출력합니다.
- `legacy_anon`이 PASS하는 경우도 역할 *claim 형식*만 확인한 것이며, 서명이나 진짜 운영 Supabase 발급키인지 검증한 것은 아닙니다. 따라서 **키 형식 PASS = 운영 배포 허가가 아닙니다.**
- Node.js **24 이상**의 기본 TypeScript 타입 제거 기능을 사용하여, 배포에 쓰일 실제 분류기 `.ts` 파일을 직접 가져옵니다. 별도로 복사한 분류 로직은 없습니다.

**실행 방법 (실제 운영 보안 담당자의 승인된 프로세스 환경 내부에서만):**

```bash
node scripts/operations/verify-production-supabase-auth-key-class-local.mjs
```

키는 반드시 **이미 프로세스 환경에 안전하게 제공되어 있어야 하며**, 명령행·채팅·PR·스크린샷·로그에 붙여넣지 않습니다. 실제 서비스 Vercel 계정 안에서 승인된 환경 실행 방법이 없으면 이 단계는 **HOLD**로 남깁니다. 운영 앱에 검증용 임시 엔드포인트를 추가하거나, 키를 출력해 로컬로 복사하는 우회는 하지 않습니다.

`PASS D3e26: least-privilege_supabase_auth_key_class=publishable...` 또는 `legacy_anon...`는 **키의 형식과 설정된 비민감 프로젝트 식별자에 대한 로컬 결과**입니다. `HOLD ...`는 승인 거부 신호입니다. 프로그램은 어떤 형태로도 운영 키의 실효 권한이나 실제 로그인·인증·결제 호출을 검증하지 않습니다.

## 새 2단계: 새롭거나 우회적인 직접 API 키 소비 경로 재유입 차단

**`scripts/ci/official-reader-supabase-auth-key-source-fence.mjs`**

- 기존 710개 규모의 Runtime 코드 인벤토리를 재사용해, API 서버 실행 코드에서 환경변수 이름 `MYEONGHA_SUPABASE_API_KEY`를 직접 참조하는 파일을 폐쇄형 인벤토리로 검사합니다. 실제 직접 환경변수 이름을 선언하는 파일은 **생산용 런타임 파서 한 곳**이며, 로그인 프록시는 해당 파서의 환경변수 바인딩을 사용합니다. 추가로 **계정 삭제 관리 설정 한 곳은 일반 API 키를 관리자 전용 `MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET`과 같지 않은지 비교하는 목적**으로만 참조합니다. 예상하지 못한 새 직접 참조가 생기면 실패합니다.
- 회원 조회용 Supabase 검증기까지 포함한 **세 경로 모두** `isLeastPrivilegeSupabaseAuthApiKeyV1` 호출을 유지하는지 검사합니다. 별도의 계정 삭제 관리 설정은 일반 키와 관리자 키가 **서로 달라야 함**을 확인할 뿐, 일반 키를 관리자 API에 전달하는 것으로 판정하지 않습니다. 이 관리 기능의 실제 배포·관리자 비밀 구성은 별도 검증 대상입니다.
- 오류에 **문제 파일명만** 출력하고 해당 코드 줄·키 값은 출력하지 않습니다. 문자열 결합이나 동적 속성명 생성, 서드파티 라이브러리, 실제 배포 비밀값에는 정적 검사 한계가 있습니다.

`test/verify-production-supabase-auth-key-class-local.test.mjs`는 **합성 공개키/관리자키/레거시 키만** 환경변수에 주입한 독립 자식 Node 프로세스로 정상·거부·값 비노출·CLI 인자 거부를 검증합니다. 코드 인벤토리 검사 및 테스트는 기존 `test/db/run_authority_core.sh`에서 실행되므로, 합성 결제/취소 회귀 시험이 그대로 유지됩니다.

## 운영 전환까지 남은 HOLD 조건

1. 승인된 운영 환경 내에서 **배포된 실제** `MYEONGHA_SUPABASE_API_KEY` 등급을 위 명령으로 출력 **없는 방식**으로 확인하고, 결과 상태만 검토 기록에 남깁니다. Vercel 환경 접근 제한이 지속되면 미확인으로 처리합니다.
2. 실제 Supabase Auth 사용자 로그인/회원 갱신의 스테이징 또는 명시적으로 허용된 무해한 smoke test가 성공해야 합니다. 가짜 테스트 키 결과를 실제 Auth 사용자 확인으로 오해해서는 안 됩니다.
3. 데이터베이스 연결 계정의 실효 신원, TLS 피어 검증, Supabase Data API 노출, 공용 `service_role`의 7개 상거래 테이블 쓰기 권한과 모든 실제 결제·취소/복구 호출 영향은 별도 승인된 조사가 필요합니다.
4. 운영 DBA·보안·Commerce 등 관계자 승인, 실패 시 복구계획, 실제 고객/결제 데이터에 영향을 미치지 않는 배포 검증 조건을 확보하기 전에는 **관리자 권한 축소, 키 교체/삭제, PR 병합, Vercel 배포, 실제 결제·환불을 실행하지 않습니다.**

**현재 판정: 합성 테스트 기반 비밀값 미출력 운영 검증 방법 준비. 실제 운영 키 등급은 아직 미확인. HOLD.**
