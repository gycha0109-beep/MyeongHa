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
