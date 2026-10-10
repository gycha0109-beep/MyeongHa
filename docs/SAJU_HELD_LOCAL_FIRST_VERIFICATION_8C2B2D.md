# 사주 브릿지 — 무료 로컬 검증 우선 실행 경로 (8C-2B-2D / 2026-10-10)

Watchtower-Track: saju-bridge

## 결정: 유료 클라우드보다 로컬부터

1. **로컬 정적·합성 통합 테스트:** MyeongHa의 기존 Source Proof/Member/Current Birth·서명/nonce·Preflight/Runner 계약 테스트를 실행한다. Saju Engine의 source issuer 관련 테스트는 Saju 저장소에서 별도로 확인한다.
2. **실제 로컬 PostgreSQL:** Docker 내부 전용 네트워크에서 PostgreSQL 15·17을 띄우고 기존 **Permit V2** DB RLS/ACL/재사용/동시성/철회/만료 테스트를 수행한다.
3. **로컬에서 할 수 없는 실환경 검증:** 독립 Root custody, durable revision/challenge의 실제 운영 원장, 별도 Staging Auth·3개 독립 DB 클러스터, TLS peer/관리 평면, Saju HTTPS ingress/Bearer/HMAC, 2인 운영 승인 및 실제 Member 데이터 검증은 R01–R14의 각 독립 출처에서 별도 확인한다.
4. **단일 실환경 실행(2D-4):** 3-04-03B/04에 실제 격리 환경·승인 증빙이 확보된 후 별도로 1회 수행한다.

기존 Production Supabase `cnsfpcdiyofqvhpcegfc`에 접근하거나 설정을 변경하지 않는다. 이 작업에는 유료 인프라·실환경 Secret/키 생성·DB GRANT·Supabase 신규 프로젝트가 필요 없다.

## 1. 준비

- GitHub 저장소 `gycha0109-beep/MyeongHa` 최신 `main`을 로컬에 내려받는다.
- Docker Engine 또는 Docker Desktop (Linux containers) + Compose v2, Node.js 24.
- **실서비스 환경변수/DB URL/사용자 데이터가 필요 없으며 제공해서도 안 된다.**
- Docker 컨테이너의 이미지를 처음 가져올 때는 인터넷이 필요할 수 있지만 클라우드 서비스 리소스 생성이나 지속적인 서버 요금은 발생하지 않는다.

## 2. 바로 실행할 명령

MyeongHa 저장소 루트에서:

```powershell
node scripts/local/verify-saju-bridge-db.mjs
```

스크립트는 내부적으로 다음을 수행한다.

1. 난수로 고유 Docker Compose 프로젝트명 생성.
2. `postgres:15`, `postgres:17.6`을 별도 DB 컨테이너로 실행. 둘 다 호스트 포트를 열지 않고, DB 파일은 tmpfs(휘발성)에만 둔다.
3. 컨테이너 각각에서 기존 `test/db/run_ci_case.sh saju-staging-operator-admission-v2`를 실제 `psql`로 수행. 원자 Permit V2 소비·RLS·ACL·2개 커넥션 경합·철회·만료·잠금 대기 후 만료를 검사한다.
4. PASS/FAIL와 관계없이 `docker compose down --volumes --remove-orphans` 수행. 비정상 종료/강제 종료 시 컨테이너가 남을 수 있으므로 이때 수동 점검해야 한다.

구현 파일: `scripts/local/saju-bridge-db.compose.yml` 및 `scripts/local/verify-saju-bridge-db.mjs`.

### 기존 MyeongHa 증빙/연결 로직 테스트

```powershell
npm ci --ignore-scripts
npx vitest run test/saju-held-current-birth-server-rehearsal-v1.test.ts test/saju-held-source-proof-server-trust-v1.test.ts test/saju-held-source-proof-revision-binding-v1.test.ts test/saju-held-staging-rehearsal-runner-v1.test.ts test/saju-held-staging-target-trust-v1.test.ts test/saju-held-staging-evidence-index-v1.test.ts
```

Saju는 별도 저장소에서 확인한다. 동일한 비밀값을 공유하지 않고 해당 저장소의 `npm ci --ignore-scripts`, `npm test`를 독립 실행한다. 이것은 양쪽의 계약·시뮬레이션 테스트이며 두 서버를 실제 네트워크로 연결했다는 증빙이 아니다.

## 2A. 명하 ↔ 사주 **실제 로컬 HTTP** 교차 저장소 검증

명하와 사주 저장소의 기존 코드를 **같은 머신에 별도 체크아웃**한 후 실행한다. 별도 유료 프로젝트, Supabase 접근, 실제 회원/출생정보 또는 클라우드 Secret 없이 Saju의 `source-reading-proof-server`가 `127.0.0.1`에 실제 Node HTTP listener를 열고, MyeongHa의 기존 `saju-held-source-proof-http-client-v1`이 고정 Preview Proof 경로를 호출한다.

```powershell
# MyeongHa 및 Saju 각각에서 최초 1회
npm ci --ignore-scripts --no-audit --no-fund

# Saju 디렉터리에서
npm run build

# MyeongHa 디렉터리에서 (Saju가 ../Saju 에 있을 경우)
node scripts/local/verify-saju-bridge-http.mjs ../Saju
```

이 명령은 다음을 검증한다.

- 실제 Saju Preview 엔진 기동 및 `POST /api/internal/preview/source-readings` 이외 라우트의 차단
- 전용 Bearer 부정 인증 및 입력 형식 거부, 올바른 요청·no-store 전송
- **발급 성공(HTTP 200) 시에만** Saju가 생성한 HMAC 서명 Proof를 명하 검증기가 요청 본문·Nonce·발급자·Audience와 결속 검증하고, 동일 Proof 재사용을 거부하는지 확인
- 실제 Saju 프리뷰가 `409 SOURCE_PROOF_NOT_READY`만 반환할 경우 CI는 해당 교차 저장소 proof 테스트를 **실패**로 판정하며, 정상 연결 자체와 발급 가능성을 혼동하지 않음
- 모든 권한 `canExecute/canPublish/canSell=false`, 운영 승인 `NOT_VERIFIED/HOLD` 유지

**TLS 유의:** 현행 명하 운영 HTTP 클라이언트는 HTTPS URL만 허용한다. 위 Vitest 전용 `fetchImpl`만 정확히 고정된 보호 라우트에서 `http://127.0.0.1`로 요청을 전달하며, 운영 URL 정책을 바꾸지 않는다. 테스트용 인증·HMAC 키는 실행마다 난수로 생성해 자식 프로세스에만 전달한다. Nonce 재사용 검사는 이 단계에서 **테스트 프로세스 내 Set**을 사용하므로 실환경 PostgreSQL 원자적 claim 결과를 대체하지 않는다. 독립 DB 원자 검증은 앞 절의 PG15/17 테스트에서 별도로 수행한다.

GitHub의 범위 제한된 [교차 저장소 루프백 CI](../.github/workflows/saju-bridge-cross-repo-local-http.yml)는 Saju 소스의 정확한 SHA를 고정하고, 실제 HTTP 경로를 **서버/클라이언트 양쪽의 현재 구현으로** 실행한다. Saju 코드가 변경되면 고정 SHA를 다시 선택하고 계약 테스트를 재실행한다.

## 2B. 사주 엔진 실 HTTP + PostgreSQL Nonce 영속 재사용 차단

앞선 2A의 인메모리 `Set` 검증에서 한 단계 나아가, 기존 명하 Nonce DB 어댑터(`createSajuSourceProofPostgresNonceClaimV1`)를 **실제 휘발성 PostgreSQL 15**에서 실행합니다. GitHub의 [대상 범위 한정 교차 저장소 CI](../.github/workflows/saju-bridge-cross-repo-local-http.yml)가 다음을 수행합니다.

1. CI 실행마다 독립된 `postgres:15` 서비스와 `myeongha_saju_local_verify` 데이터베이스 생성.
2. 기존 테스트 전용 Supabase Auth 역할 fixture와 **운영 스키마 변경 없이 재사용한** `1540_saju_source_proof_nonce_claim_authority_v1.sql`을 임시 DB에만 적용.
3. 별도 Node 프로세스로 실제 Saju Proof 발급 서버를 `127.0.0.1`에 기동하고, 명하의 **기존** HTTP 클라이언트·HMAC 검증기·PostgreSQL nonce 소비 어댑터 연결.
4. 올바른 서명/Nonce 조합을 원자적으로 한 번만 소비하고, 별도 DB 연결에서 동일 Proof 재사용을 거부하는지 확인.
5. DB 연결 둘에서 같은 서명 Proof를 병렬 검증하여 정확히 하나만 `held`가 되고 nonce digest 행도 하나만 저장되는지 확인.
6. HMAC 응답 변조는 nonce claim 전에 차단하며, `authenticated` 역할은 직접 INSERT할 수 없는지 검증. 원본 nonce/출생정보는 Nonce 테이블에 저장하지 않음.

로컬에서 동일 검증을 수행하려면 **명하·사주 저장소, Node 24, 로컬 전용 PostgreSQL 15**가 있어야 합니다. 운영 DB 또는 운영 PostgreSQL 포트 포워딩을 사용하지 마십시오.

```powershell
# 아래 명령은 MyeongHa 저장소 루트에서 실행하며,
# 환경변수 PGHOST=127.0.0.1, PGPORT=5432, PGDATABASE=myeongha_saju_local_verify,
# PGUSER=postgres, PGPASSWORD=<로컬 임시 DB 비밀번호>를 미리 설정합니다.
# 데이터베이스는 실 운영과 무관한 폐기용 로컬 인스턴스만 허용됩니다.

psql -v ON_ERROR_STOP=1 -f test/db/bootstrap_supabase_auth_stub.sql
# 아래 전체 마이그레이션은 오직 새로 만든 폐기용 로컬 DB에서만 실행
Get-ChildItem supabase/migrations/*.sql | Sort-Object Name | ForEach-Object {
  psql -v ON_ERROR_STOP=1 -f $_.FullName
  if ($LASTEXITCODE -ne 0) { throw 'Local disposable DB migration failed' }
}
psql -v ON_ERROR_STOP=1 -f test/db/fixtures/saju_local_subject_birth_proof_e2e.sql
$env:MYEONGHA_LOCAL_NONCE_PG_ENABLED = '1'
node scripts/local/verify-saju-bridge-http.mjs ../Saju
```

**증명 범위 제한:** GitHub 테스트 DB는 임시 컨테이너의 superuser로 `SET LOCAL ROLE`을 실행합니다. 로컬 PostgreSQL의 실제 유니크 인덱스·RLS/ACL·원자성은 확인하지만, 독립 운영 로그인·접근 제어자·서버 간 DB 물리 분리/커스텀 TLS/실제 Supabase 회원 인증을 증명하지 않습니다. Saju Preview HMAC 결과는 여전히 `sourceAuthority=NOT_EVALUATED`, `stagingAdmission=HOLD` 및 제품 권한 모두 `false`입니다.

## 2C. 실제 PostgreSQL 소유자·Current Birth Revision ↔ 실제 Saju Proof 종단 간 검증

2B의 Nonce 검증에 이어, **명하에 이미 구현된 `bindCurrentSubjectSajuHeldProofV1` 함수를 수정하지 않고** 임시 DB의 실제 회원·Subject·Birth Profile·불변 Revision을 주입한 다음 **실제 사주 서버 HTTP → HMAC 검증 → PostgreSQL nonce claim → 동일 회원의 Current Birth 재조회**를 수행한다.

- 테스트 전용 `auth.users`에 2명의 임시 계정을 생성한다. 여기서 전달되는 `VerifiedSubjectIdentityEvidenceV1`는 **테스트 어셈블리에서 주입한 합성 검증 결과**이며, 실제 Supabase JWT/세션 인증이 아니다.
- 첫 번째 회원만 `self` Birth Profile과 같은 출생값을 가진 2개의 불변 Revision을 보유한다. 권한 검증은 원래 `myeongha_api_executor`의 `SET LOCAL ROLE`, Subject RLS, Birth RLS 및 `qry_*_v1` 조회 함수를 사용한다.
- 실제 PostgreSQL 조회의 현재 Revision #1을 기반으로 Saju 프로세스가 서명한 Proof를 받고 명하 검증기로 검증한다. 결과는 **HELD, 운송 무결성만 검증**, 배포·판매 권한은 모두 false다.
- 타 회원에게 Current Birth가 없으면 보호된 Saju 요청을 보내기 전에 거절한다.
- 사주 Proof 발급과 후행 DB 재조회 사이에 현재 Revision이 #2로 바뀌면, **출생일·시간·성별이 같아도** `current_birth_revision_changed`로 차단하며 `binding`을 노출하지 않는다.
- 실제 HTTP Proof 사용 및 동시성/재사용 방지는 2B의 기존 PostgreSQL nonce 검증을 그대로 사용한다. 새 제품/HTTP 라우트를 만들지 않는다.

[교차 저장소 CI](../.github/workflows/saju-bridge-cross-repo-local-http.yml)는 이전과 동일한 단일 한정 워크플로에서 **격리 PostgreSQL 15에 기존 전체 명하 마이그레이션을 적용**하고 [합성 출생정보 fixture](../test/db/fixtures/saju_local_subject_birth_proof_e2e.sql)를 삽입한 뒤, 총 세 가지 범위(기존 HTTP / DB nonce / DB Current Birth)를 함께 실행한다. 기존 운영 DB에는 이 fixture를 절대 적용하지 않는다.

명하·사주 체크아웃의 로컬 실행은 이전 절과 동일하되, **기존 2B의 단독 `1540` SQL 실행만으로는 2C를 시작할 수 없다.** 오직 처음 생성한 일회용 `myeongha_saju_local_verify` 데이터베이스에서 테스트용 Auth stub을 적용하고 `supabase/migrations/*.sql` 전체를 순서대로 적용한 후 `test/db/fixtures/saju_local_subject_birth_proof_e2e.sql`을 넣어야 한다. 실행 완료 후 해당 DB는 폐기한다.

**남는 검증:** 실제 클라우드 Auth identity verifier, 독립 권한으로 로그인한 DB Pool, 독립 출처의 Root/Challenge/Attestor, TLS peer, 운영 Subject/Birth/Revision, R01–R14 및 2D-4 Runner는 여전히 `NOT_VERIFIED`/`HOLD`. 테스트의 가짜 회원을 운영 인증 증빙으로 승격하지 않는다.

## 2D. 테스트 전용 서명 인증 서버 → 기존 Supabase Member 검증기 → 현재 Birth → Saju Proof

실제 회원의 인증 토큰이나 운영 Supabase 프로젝트 없이, 테스트 프로세스 내부에서 **매 실행마다 별도 비밀키로 HS256 서명한 합성 JWT**를 만들고 `127.0.0.1`에 테스트용 `GET /auth/v1/user` HTTP 서버를 띄운다. 서버는 서명·발급자·Audience·만료·폐기 목록을 확인한 뒤에만 테스트용 Auth 사용자 ID를 반환한다.

테스트는 `createProductionRequestIdentityVerifierV1` 및 `SupabaseMemberIdentityEvidenceVerifierV1`의 **기존 검증 로직을 그대로 사용한다.** 이들의 HTTPS-only 허용 원칙과 Production Supabase 고정 Origin 검사는 바꾸지 않는다. 테스트의 `memberFetchImpl`만 **정확한 Auth user 경로 하나**에서 로컬 인증 서버로 전달하며, 다른 주소로는 전송하지 않는다.

신규 `bindAuthenticatedMemberSajuHeldProofV1`는 서버 내부 전용 조합 함수이며, **공개 라우트나 Runner를 등록하지 않는다**. 클라이언트가 Subject ID·Birth 데이터·사주 읽기 유형·Proof Nonce·서버 Origin을 지정할 수 없고, 검증된 Member 증빙을 받아야만 기존 `bindCurrentSubjectSajuHeldProofV1`로 전달한다. Guest, 인증 누락/거부/장애, POST 외 메서드, 요청 본문이 있을 경우 Fail-Closed 한다.

통합 테스트 `test/saju-held-cross-repo-local-auth-user.test.ts`는 기존 2C 테스트와 동일한 임시 회원/Birth DB 및 실제 Saju HTTP 서버를 사용한다. 정상 서명 토큰→로컬 인증 서버 200→명하 기존 Member 검증기→DB 현재 Birth→실제 사주 Proof→Postgres Nonce→Revision 재조회를 확인하고 다음 거부 사례를 함께 검사한다.

- 다른 비밀키 서명, 만료·잘못된 Issuer/Audience, 폐기된 토큰, 형식 오류
- 토큰을 정상 검증받은 다른 회원의 소유 Birth 부재
- Guest 자격증명, 인증 누락, 본문으로 출생정보를 덮으려는 시도, 비-POST 요청
- 인증 서버 중단 시 우회 없이 차단
- `user_metadata` 및 `X-Client-Subject-Id`의 임의 소유자 값 무시

**중요:** 위 로컬 인증 서버는 **Supabase Auth 에뮬레이터**이며 실제 Supabase가 검증한 JWT·운영 세션·폐기/로그아웃 정책을 증명하지 않는다. 합성 JWT의 폐기 `jti` 저장소는 테스트용 메모리이고 Supabase의 실제 세션 저장소가 아니다. 기존 운영 인프라의 실제 Auth와 DB 자격증명, TLS, R01–R14 독립 운영 증빙, 일회용 Runner는 계속 `NOT_VERIFIED`/`HOLD`. 운영 DB에 접속하거나 Prod 인증 API를 호출하지 않는다.

## 2E. 실제 Supabase GoTrue 로컬 엔진 ↔ 출생정보 ↔ 사주 Proof (무료 격리 CI)

2D의 자체 구현 합성 Auth 서버를 추가로 재현하는 대신, **실제 Supabase Auth에서 사용하는 GoTrue v2.196.0**을 별도 컨테이너에 띄운다. CI는 독립된 Auth 전용 `postgres:15` DB(호스트 5433)와 기존 명하 테스트 DB(호스트 5432)를 사용한다. Auth 서버는 `127.0.0.1:9999`에만 바인딩되고 테스트 종료 시 파기된다.

1. 테스트마다 GoTrue에 이메일·비밀번호로 **임시 사용자 2명을 실제로 등록**하고, GoTrue가 발급한 JWT를 `GET /user`로 다시 인증한다. 실제 회원 가입 이메일 전송은 사용하지 않는다(`GOTRUE_MAILER_AUTOCONFIRM=true`).
2. 테스트용 DB 운영자가 GoTrue에서 얻은 사용자 UUID를 폐기할 **명하 테스트 DB에만** 매핑한다. 이는 CI fixture 운영 작업이며 실제 회원 계정 연동/운영 회원 인증·프로비저닝이 아니다.
3. `createProductionRequestIdentityVerifierV1` / `SupabaseMemberIdentityEvidenceVerifierV1`의 운영 Auth URL 정책과 구현은 수정하지 않는다. 테스트에서 정확히 `/auth/v1/user`로 가는 `memberFetchImpl` 호출만 로컬 GoTrue의 실제 `/user`로 전달한다.
4. 기존 명하 Postgres RLS 조회 → 본인 현재 Birth Revision → 실제 사주 HTTP 발급·HMAC 검증·DB nonce 소비 및 Revision 재확인을 수행한다.
5. 다른 GoTrue 회원의 유효 JWT로 타 회원 출생정보에 접근하거나, JWT 서명을 변조하거나, 사용자 요청의 Subject/Birth 필드·수정 가능한 `user_metadata`로 소유자를 가장하면 차단되는지 확인한다.

검증 파일은 `test/saju-held-cross-repo-local-gotrue-auth.test.ts`이며 **기존 2A–2D 테스트 실행이 끝난 뒤 별도 Vitest 프로세스**에서 실행한다. 별도 GoTrue DB에서 발급되는 동적 사용자 UUID를 테스트용 Birth DB에 매핑하므로, 앞선 정적 테스트들과 병렬 실행하면 안 된다. 새로운 CI 워크플로나 대형 통합 트랙을 추가하지 않고 기존 [한정 교차 저장소 CI](../.github/workflows/saju-bridge-cross-repo-local-http.yml)만 확장한다.

**한계:** GoTrue 자체의 실제 회원 발급·검증 코드를 로컬에서 실행해도, *운영 Supabase Cloud Auth 세션, 서로 독립된 운영 자격증명/원본 증빙, Auth–MyeongHa API의 실서비스 TLS peer, Token revocation의 운영 정책, 독립 Root/Attestor R01–R14*는 확인되지 않는다. 특히 GoTrue의 로그아웃은 Refresh Token 폐기와 Access JWT 즉시 무효화를 동일하게 보장하지 않는다. 테스트 결과를 `stagingConnection=VERIFIED`나 `canExecute/canPublish/canSell=true`로 승격하지 않는다.

## 2F. 실제 제한된 PostgreSQL 로그인 계정 검증 — 최소 권한 1단계

2E의 실제 GoTrue → Subject/Birth → Saju Proof 연결에 앞서, 기존 CI의 superuser 테스트와 **독립적으로** 실제 TCP PostgreSQL 사용자명을 사용한 DB 검증을 추가한다.

- 기존 `0800_production_api_login_principal.sql`이 생성하는 `myeongha_runtime` 계정에는 테스트 시점에만 암호를 부여한다. `myeongha_saju_nonce_ci_login`은 disposable DB에서 새로 생성하며 오직 `myeongha_saju_proof_nonce_runtime` 역할만 멤버십으로 부여한다. 두 계정 모두 `NOSUPERUSER/NOINHERIT/NOBYPASSRLS`이다.
- `test/db/fixtures/saju_local_restricted_logins.sql`의 실행 조건은 **정확한 폐기 DB 이름과 postgres 관리 세션**으로 제한한다. SQL은 Production migration이 아니다. 암호는 CI에서 매 실행 별도 난수로 생성하여 로그에 출력하지 않으며, 세션 종료 후 컨테이너와 함께 폐기한다.
- `test/saju-held-cross-repo-local-restricted-login.test.ts`는 `session_user`/`current_user` 및 멤버십을 실제 TCP로 확인한다. `SET ROLE`을 할 수 없는 타 전용 역할, 직접 테이블 조회 거부, 회원 간 Birth 격리, 기존 `NodePostgresSubjectPoolV1` 사전 로그인 계정 확인을 검사한다.
- 올바른 제한 Subject 로그인으로 현재 Birth를 조회 → 실제 Saju HTTP Proof 발급 → **별도 제한 Nonce 로그인**으로 한 번만 claim → Revision 재조회. 다른 연결에서 동일 Proof를 소비하면 정확히 한 건만 성공해야 한다.
- 기존 baseline 15건을 먼저 수행하고, **GoTrue가 CI Subject 소유자 매핑을 바꾸기 전에** 제한 로그인 테스트를 별도 Vitest 프로세스로 수행한다. 이후 GoTrue 실제 엔진의 기존 3건을 검증한다.

**한계:** 동일한 disposable PostgreSQL 클러스터 내에서 두 로그인 권한을 물리적으로 구분한 것으로, 독립된 Subject/Nonce/Admission **클러스터**나 원격 Staging 로그인은 아직 검증하지 않았다. 또한 이 단계의 PostgreSQL 연결은 TLS가 아니다. 엄격한 hostname/CA `verify-full` **실소켓 검증** 및 3 DB 물리 분리는 다음 단계를 통해 별도로 입증한다. 이 결과를 R06–R09 운영 신뢰 증빙 또는 `stagingAdmission=HOLD` 해제로 처리하지 않는다.

## 2G. 실제 TLS 연결·서버 호스트 검증과 Nonce DB 물리 분리 — 2단계

2F의 실제 TCP 제한 로그인 이후 별도의 임시 `postgres:15` 컨테이너를 **Nonce 전용 PostgreSQL 클러스터**로 생성한다. 기존 Subject DB(5432)는 유지하고 독립 Nonce DB(로컬 포트 5443)에만 기존 `1540_saju_source_proof_nonce_claim_authority_v1.sql`을 적용한다.

- [CI 전용 설정 스크립트](../scripts/local/setup-saju-bridge-tls-nonce-ci.sh)는 CI 한정 가드, 포트 5443, `myeongha_saju_nonce_tls_verify` 데이터베이스 이름을 강제한다. 실행마다 새로운 CA·별도 오답 CA·서버 인증서를 생성하고 인증서의 SAN을 `nonce.saju-bridge-ci.invalid`로 고정한다. 자체 CA 개인키와 서버 개인키는 CI 종료 시 폐기한다.
- Postgres TLS 1.2 이상과 인증서/개인키 파일 권한을 적용하고, `hostnossl ... reject` HBA 규칙으로 평문 TCP 접속을 서버에서도 거부한다. 실제 `psql sslmode=verify-full`/일회성 CA로 인증된 별도 `myeongha_tls_nonce_ci_login` 계정의 TCP 로그인을 먼저 확인한다.
- [추가 검증](../test/saju-held-cross-repo-local-tls-nonce.test.ts)은 node-postgres의 `ssl: {ca, rejectUnauthorized:true}` 및 기본 호스트명 검증으로 실제 서버와 연결하고, `pg_stat_ssl`의 현재 세션 TLS 버전과 `session_user`, 실제 DB 이름을 확인한다. 잘못된 CA/호스트명·SSL 미사용·Subject 로그인 재사용 및 테이블 직접 접근은 실패해야 한다.
- 제한 로그인 Subject DB의 현재 Birth 조회 → 실제 Saju 서버 HTTP 서명 Proof → **물리적으로 분리된 TLS Nonce 클러스터**에서 원자 claim → 동일 Birth Revision 재확인까지 기존 함수를 변경하지 않고 실행한다. 독립 TLS 연결 2개 사이에서 같은 Proof는 한 번만 소비한다.
- 기존 베이스라인·2F·실제 GoTrue 테스트는 보존하고 동일 scoped Workflow에서 순차적으로 실행한다. TLS DB에는 Birth/회원 정보나 로그인 주체가 없으며, Subject·GoTrue CI DB를 TLS 서버 DB로 복제하지 않는다.

**한계:** 이 테스트의 CA는 CI가 생성한 일회용 자체 CA이다. `saju-held-staging-db-tls-target-v1.ts`의 독립 운영 승인 Plan을 실제로 수령하거나 운영 Root fingerprint를 검증하지 않는다. Subject DB는 이 단계에서도 **평문 로컬 연결**이며, Admission DB의 독립 TLS 실소켓 경계 역시 미검증이다. 운영 Auth/Root/Attestor/Runner/Permit custody, 실제 TLS 대상·DNS·R01–R14 운영 신뢰 증빙은 계속 `NOT_VERIFIED`/`HOLD` 상태로 유지한다.

## 3. 통과 기준 / 아직 증명하지 않은 것

| 시험 | 로컬/기존 CI에서 검사 가능 | 남는 실제 환경 확인 |
|---|---|---|
| Permit V2 재사용·경합·RLS/ACL·잠금 후 만료 | 로컬 PG15·17 실제 트랜잭션으로 검사 | 독립 운영 Admission DB·로그인 role·물리적 격리 |
| Current Birth / Subject·Source Proof 서명·nonce | 기존 범위 합성·단위 통합 테스트 | 승인된 Member와 실제 분리 DB/서버의 끝단 연결 |
| Registry/Target Evidence/Challenge Binding | 서명·digest 및 입력 구조 | 독립 키 Custody, durable floor, 실제 Challenge issuer |
| R01–R14 접수 인덱스 | 누락·중복·드리프트 거부 | 원본 관찰 사실, 관리 평면, Attestor 서명 |
| TLS/Auth/별도 Saju HTTPS ingress | 형식·계약 부정 테스트 | 실제 peer, DNS/SSRF, Bearer/HMAC 회전 |
| 실행/상품·판매 | **HOLD** 불변 검사 | 3-04-04 게이트, 2D-4 단일 승인, 별도 Production/Commerce 승인 |

**주의:** `postgres` 테스트 컨테이너는 CI 소유의 synthetic superuser로 격리 fixture를 적용한다. superuser가 `SET LOCAL ROLE`을 성공시켰다는 사실은 실제 운영 로그인 최소권한 증빙이 아니다. 로컬의 두 컨테이너가 별도라고 해서 실제 클라우드 DB 3종의 물리적 분리가 확인된 것도 아니다.

## 4. 운영 검증으로 넘어갈 조건

로컬 테스트 PASS만으로 이슈 [#1871](https://github.com/gycha0109-beep/MyeongHa/issues/1871)을 닫지 않는다. R01–R14에 대한 독립 운영 관찰과 신뢰 root/custody, 비용·접근 승인 및 폐기형 테스트 데이터가 준비되면 해당 단계만 검증한다. 테스트를 위해 새 유료 리소스를 임의 생성하지 않는다.

```text
rootAuthority=NOT_VERIFIED
evidenceProvenance=NOT_VERIFIED
operationalEvidence=NOT_VERIFIED
stagingConnection=NOT_VERIFIED
stagingAdmission=HOLD
canRunOnce=false
canExecute=false
canPublish=false
canSell=false
```
