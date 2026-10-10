# 8C-2B-2D-3-04-01 — 실환경 증빙 수집·신뢰 루트·운영 승인 핸드오프

Watchtower-Track: saju-bridge

**최종 완료 기준·단계별 상태:** [8C-2B-2D 완료 로드맵](./SAJU_HELD_STAGING_COMPLETION_ROADMAP_8C2B2D.md). **3-04-02 신뢰 입력·영속 상태 설계:** [독립 Root/Revision/Challenge Authority](./SAJU_HELD_STAGING_INDEPENDENT_TRUST_CUSTODY_8C2B2D30402.md).


> 단계: **실행·권한 부여 이전의 운영 설계/증빙 준비**. 본 문서 자체는 승인, 검증된 운영 증빙 또는 실행 허가가 아니다. 검증된 운영 증빙을 실제로 생성한 적 없으며, 이 변경으로 키/GRANT/네트워크/배포/Runner를 활성화하지 않는다.

## 1. 현재 코드와 실환경 증빙 구분

| 코드 확인 계약 | 현재 검증 가능한 범위 | 실환경에서 추가로 입증할 사실 |
|---|---|---|
| 3-01 Permit V2 | Ed25519 서명·Manifest/Connection Plan digest·SHA 일치 | 승인자의 실제 신원, 키 custody, 발급/철회 권한 |
| 3-02 PG 원자 소비 | PostgreSQL 15/17 폐기형 CI RLS·ACL·경합·만료 재확인 | 실제 스테이징 로그인 권한·DB/클러스터 정체성·권한 배치 |
| 3-03A Registry/Evidence | 외부 제공 루트키에 대한 서명 계약, 키 역할 구분·철회 | 앱/증빙 번들과 독립적으로 고정된 루트키와 durable revision 하한 |
| 3-03B Trust Evaluator | 서명 주장·Challenge·Auth/DB/Proof 관찰값의 구조적 결속 | 독립 검증기관이 실제 검사를 수행한 사실과 정당한 권한 |
| Saju Proof | loopback 제한 프로세스 및 Bearer/HMAC 계약 | 별도 제한 HTTPS ingress·실제 서비스 계정·키 격리 |
| Rehearsal Runner V1 | 순수/합성 Port 계약·HOLD 결과 | Target Authority V2 인터페이스와 독립 승인 이후 연결 여부 |

**금지된 추론:** CI PASS / Registry 서명 PASS / Evidence 서명 PASS / 일치하는 3개 clusterIdentityDigest / `COMPLETE_UNTRUSTED` 각각은 실접속·실제 운영 인가 증빙이 아니다.

## 2. 실환경 준비 사전 의존성 (증빙 수집 실행 전에도 별도 승인이 필요)

1. 관리 주체 2인 이상이 격리 Staging의 목적·범위·운영 책임자·중단/롤백 권한 및 예산을 기록해 승인한다.
2. Production Supabase Project/DB/Calculation 서비스와 **자격증명 및 권한이 중복되지 않는** 별도 Staging 자원을 실제로 준비한다. 단순한 이름 차이는 격리 증거가 아니다.
3. 루트 공개키의 진짜 신뢰 기준은 Evidence 파일이나 애플리케이션 입력이 아닌 독립 관리 경로에서 확보한다. 키 ID·SPKI fingerprint·발급/폐기 승인 기록·관리자 이중 확인·변조 방지 보관을 요구한다.
4. 별도 durable 저장소에 Registry 최소 revision/금지된 키 ID를 보관해 롤백을 차단한다. 재시작·노드 간 경쟁·장애 복구 상황에서도 과거 revision으로 돌아가지 않아야 한다.
5. 일회성 Challenge 생성자와 저장소를 분리한다. 난수 자체는 256비트 이상, `challengeDigest`는 Challenge·명시적 도메인·대상환경·스냅샷 식별자에 결속한다. 보관 및 원자적 사용/만료/폐기 규칙을 명세하고 replay·동시성 시험을 수행한다. **3-03의 단순 문자열 비교는 nonce 소비/신뢰 출처 증빙이 아니다.**
6. Attestor가 신뢰할 수 있는 배포/인프라 관리 평면으로 관찰할 최소 읽기 권한과 로그 출처를 규정한다. 검사 응답을 애플리케이션 또는 테스트 피대상자가 임의로 작성할 수 있으면 독립 증빙으로 인정하지 않는다.
7. 단일 작업이 자체 승인·자체 증빙·자체 실행을 모두 수행하지 못하도록 권한 분리 및 break-glass 승인 절차를 마련한다.
8. 증빙 확보 전까지 `StagingTargetAuthorityPortV1`의 Proof Origin → Boolean 계약을 실제 Target Authority로 재사용하지 않는다.

## 3. 필수 Evidence 항목과 신뢰 가능한 출처

| ID | 증빙 | 독립 관찰·승인 출처 | 실패 시 |
|---|---|---|---|
| R01 | Root SPKI fingerprint / custody / 분리된 관리 주체 | 인프라 외부의 검증·감사 보관소 | HOLD |
| R02 | Registry signed revision, 최소 revision, 철회 목록 | 관리자 승인 이력 + durable rollback floor | HOLD |
| R03 | Operator ID/Key ID/역할·발급·폐기·Permit V2 결속 | 별도 승인 원장·서명자 키 레지스트리 | HOLD |
| R04 | Challenge 생성·원자적 소비·유효기간·재사용 방지 | 승인된 nonce 저장소의 독립 조회 | HOLD |
| R05 | Auth 프로젝트 Ref, Issuer, Member-only, Production 분리 | Supabase 관리 평면·격리된 시험 Member | HOLD |
| R06 | Subject DB의 실제 서버/클러스터, TLS peer·hostname·CA | 제한된 스테이징 로그인 + 독립 TLS 관찰 | HOLD |
| R07 | Subject DB session_user/current_user/role membership/RLS/ACL | DB 카탈로그 및 부정 권한 조회 | HOLD |
| R08 | Nonce DB 별도 클러스터, 최소 권한·nonce 재사용 차단 | 별도 제한 로그인·DB 권한/경합 증빙 | HOLD |
| R09 | Admission DB 별도 클러스터, V2 전용 소비·V1 경로 비활성 | 별도 제한 로그인·권한/DB 상태 조회 | HOLD |
| R10 | Saju HTTPS ingress, loopback upstream, TLS peer·DNS·SSRF 정책 | 네트워크/프록시 운영 담당의 실제 서비스 검증 | HOLD |
| R11 | Saju Bearer/HMAC 분리, Key ID/issuer/audience/TTL/rotation | 별도 Secret 관리 평면·무권한/부정 호출 | HOLD |
| R12 | MyeongHa/Saju 배포 SHA와 Manifest/Plan Digest | 서명된 배포·릴리스 증빙 및 재검증 | HOLD |
| R13 | 승인된 폐기형 테스트 Member만 접근, Birth/Subject 격리 | Auth/Subject DB 실험, 비식별화 로그 | HOLD |
| R14 | 사고 중단·키 회전·승인 폐기·시스템 복구 | 독립 운영자 승인과 리허설 증빙 | HOLD |

- 관찰 내용은 `apps/api/src/saju-held-staging-target-evidence-v1.ts`의 정확한 버전 계약에 정규화해 Attestor가 서명한다. 원본 증빙은 변조 방지·접근 제한된 감사 저장소에 보관한다.
- Evidence에는 `environmentId`, 두 digest, 두 SHA, 독립 Attestor ID/Key ID, Challenge Digest, 발급·만료 시각(최대 60초)을 결속한다.
- 공개 감사 보고에는 **키 지문과 증빙 참조 ID 등 비밀 아닌 식별자만** 허용한다. 토큰, SQL DB URL, 원문 CA PEM/비밀번호, 서비스 서명·Subject/Birth, Member credential은 문서·CI 로그·Issue·PR·채팅에 노출 금지.
- Auth/DB/Saju Proof 3영역의 독립 검증은 서로 다른 관리 평면에서 수행하며, 외부 검증자가 피검증 대상에게 원시 증거를 위임하지 않아야 한다.

## 4. 운영 실행 순서 — 이 문서는 실제 실행 승인이 아니다

### 준비/검사

1. 별도 운영 변경 요청을 발행하고 **대상 환경, 소유자, 심사자, 범위, 비용, 폐기 시각**을 고정.
2. 독립 Root/Registry 운영자 서명 검증 및 rollback floor 조회. 신뢰 실패·운영자가 동일한 주체로 서명을 위조할 수 있으면 중단.
3. 이중 승인으로 approved Manifest/Connection Plan/배포 SHA를 동결. 승인 후 값이 하나라도 변경되면 기존 Permit·Evidence 폐기 후 신규 검토.
4. 별도 검증자 권한으로 R05~R13을 실제 테스트. DB 세션/CA/클러스터 격리, Production 재사용, Member-only, Saju Proof Bearer/HMAC을 포함.
5. 외부 Challenge를 생성하고 Attestor가 해당 Challenge와 대상에 대해 관찰 결과를 서명. 로그와 독립 증빙원장을 동결.
6. `3-03B Trust Evaluator`로 정적 계약/서명을 재검증하되 `SIGNED_ASSERTIONS_UNANCHORED`를 운영 PASS로 간주하지 않음.
7. 실환경 검증자가 Evidence 출처·프로브 수행 사실·관리 평면 권한·최신 배포 drift/철회 상황을 독립 확인.
8. 조건 전부 충족한 경우에도 별도 운영 승인(서명자/승인자 분리)과 후속 `Target Authority V2` 연결 설계 검토 후 **2D-4**에서만 일회 실행을 심사.

### 실패·롤백·철회

- 하나라도 FAIL / INCOMPLETE / timeout / 미확인 / COMMIT 불명확 → **HOLD**. 재사용·자동 재시도·실행 허용 금지.
- Root/Operator/Attestor 키 폐기: Registry 재발급 및 durable revision floor 인상. 과거 Evidence/Permit 유효성 재평가 및 필요 시 승인 폐기.
- 배포 SHA·Auth 프로젝트·DB 대상·클러스터/TLS peer·로그인 권한/CA·Saju Proof Key ID가 바뀌면 즉시 기존 Evidence 무효로 판정하고 새 Challenge/승인 요구.
- 권한 상승이나 Production 혼입 감지 시 관련 Secret 회전, 임시 접근 차단, 제한된 로그 보존, 데이터 누출 여부 별도 보안 점검.
- Permit V2의 소비 결과가 COMMIT 응답 불확실 상태라면 임의 재소비하지 않는다. 별도 권한으로 실제 DB 상태를 확인해 폐기/수동 결론 처리.
- 회원/출생 정보는 본 운영 증빙 대상이 아니므로 필요 최소화·폐기형 계정과 비식별 결과만 사용한다.

## 5. 코드 단계의 종료와 운영 단계 HOLD

```text
A = 운영 증빙 목록, 신뢰 루트 custody, 키/Challenge 회전·폐기, 긴급 롤백 문서화
B = 범위·명칭·운영 비활성 경계 검증 및 기존 CI
C = PR HEAD/BASE·Squash merge·main SHA 확인

D = 실제 대상 프로비저닝, 관리 평면·DB·TLS·Auth·Proof 증빙 수집
E = 운영자 외부 승인 및 Target Authority V2/실행 계층 별도 검증
```

**A/B/C의 코드 또는 문서 검증은 D/E의 충족을 의미하지 않는다.**

```text
rootAuthority = NOT_VERIFIED
signerAuthority = NOT_VERIFIED
evidenceProvenance = NOT_VERIFIED
operationalEvidence = NOT_VERIFIED
stagingConnection = NOT_VERIFIED
stagingAdmission = HOLD
sourceAuthority = NOT_EVALUATED
releaseAuthorization = NOT_EVALUATED
canRunOnce = false
canExecute = false
canPublish = false
canSell = false
```

## 6. 후속 구현 범위

- `3-04-02`: 독립 운영자가 관리하는 Root/KMS/Key Registry 및 Durable Revision·Challenge 저장소의 설계 검토, **실제로 승인된 이후** 연결.
- `3-04-03`: Auth·DB·Saju Proof 독립 probe 및 signed Evidence 수집. 접속·비밀 발급에 대한 별도 명시적 운영 승인 필요.
- `3-04-04`: Target Authority V2 및 Runner 연결 전 보안 검토. 연결만으로 권한 상승 허용 금지.
- `2D-4`: 실제 격리 스테이징 단일 시도, 승인 소비/동작/검증 결과 감사 및 폐기.

실제 환경 값, root key fingerprint, 운영 승인자/접속 권한이 아직 제공·독립 확인되지 않았으므로 이 문서를 기준으로 실제 Secret이나 인프라를 생성하거나 운영 승인을 추정하지 않는다.
