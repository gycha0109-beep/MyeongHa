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
psql -v ON_ERROR_STOP=1 -f supabase/migrations/1540_saju_source_proof_nonce_claim_authority_v1.sql
$env:MYEONGHA_LOCAL_NONCE_PG_ENABLED = '1'
node scripts/local/verify-saju-bridge-http.mjs ../Saju
```

**증명 범위 제한:** GitHub 테스트 DB는 임시 컨테이너의 superuser로 `SET LOCAL ROLE`을 실행합니다. 로컬 PostgreSQL의 실제 유니크 인덱스·RLS/ACL·원자성은 확인하지만, 독립 운영 로그인·접근 제어자·서버 간 DB 물리 분리/커스텀 TLS/실제 Supabase 회원 인증을 증명하지 않습니다. Saju Preview HMAC 결과는 여전히 `sourceAuthority=NOT_EVALUATED`, `stagingAdmission=HOLD` 및 제품 권한 모두 `false`입니다.

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
