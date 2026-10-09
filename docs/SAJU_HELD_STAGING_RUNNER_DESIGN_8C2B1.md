# Saju bridge 8C-2B-1 — 스테이징 전용 실행기 설계 기준

> 상태: **DESIGN ONLY / NOT IMPLEMENTED**. 이 문서는 API, 배포, DB 권한, Secret 공급, 실제 Source proof 실행을 활성화하지 않는다.
>
> Watchtower-Track: saju-bridge
>
> 기준(2026-10-09): MyeongHa `a3ab960c0b025026ae208fa422dfa265f27e9650`, Saju `61ffa3fc1d7412df4e9ad73985a35efaba694ea5`. 구현 착수 시 양쪽 최신 main을 다시 확인한다.

## 1. 목적 / 책임 경계

이 작업은 이미 병합된 8B `createSajuHeldCurrentBirthServerRehearsalV1` 및 8C-2A `assessSajuHeldStagingPreflightV1`을 **일회성 격리된 스테이징 실행 문맥**에서 안전하게 조합하기 위한 설계다. 핵심은 인증된 Member, 별도 운영 승인, 올바른 스테이징 대상, 독립 DB 권한을 입증한 뒤에만 8B를 **최대 한 번** 호출하는 것이다.

- Saju: 기존 `createMyeonghwaSourceReadingProofIssuerHttpServerV1`에서 `POST /api/internal/preview/source-readings` 보호형 발급. Source 의미 결정과 발급 증빙은 Saju 소유.
- MyeongHa: 현재 인증 Member의 Subject·Birth Revision pin, 고정 `전체 사주`, 서명 검증 및 nonce claim, 후속 Revision 재조회.
- DB Authority: `myeongha_saju_proof_nonce_runtime` 전용 NOLOGIN 역할, 원자적 `INSERT ... ON CONFLICT DO NOTHING`, RLS 및 독립 로그인 계정 멤버십.
- 배포·운영: 격리된 스테이징 환경, 운영자 권한 부여, 검증용 멤버 자격 증명, Secret 수탁, 실제 Saju 기동/네트워크/TLS 관리.
- CI: synthetic 검증과 SHA 고정 통합 CI만. CI는 실제 staging evidence가 아니다.

Production Interpretation, Release, Product, Character, Commerce 권한은 **항상 HOLD**. HTTP wrapper의 `canExecute: false`는 제품 의미의 실행 불가 플래그이며 스테이징 검증 호출 허가와 무관하다.

## 2. 현재 구현에서 확인된 제약

1. `VerifiedSubjectIdentityEvidenceV1`은 **일반 구조적 타입**이다. 호출자가 `{kind:'member',verifiedAuthUserId: ...}`를 작성할 수 있으므로, 타입 검사만으로 Auth 검증을 증명하지 못한다. 8B의 `rehearse(verifiedEvidence)`를 외부 사용자 입력에 직접 연결해서는 안 된다.
2. `createProductionRequestIdentityVerifierV1`은 Member 외 Guest fallback을 포함한다. 본 실행기에는 Guest를 허용하지 않는다. 대신 기존 `SupabaseMemberIdentityEvidenceVerifierV1`을 **격리된 스테이징 Supabase Origin**에 바인딩하여 호출한다.
3. `parseProductionUserDataRuntimeConfigV1`은 고정된 **운영 Supabase 프로젝트**를 요구한다. 이를 스테이징에 재사용하면 운영 데이터에 접근할 위험이 있다. 신규 스테이징 전용 검증 설정과 독립 DB Pool 조립 계약이 필요하며, 운영 Origin/DB가 감지되면 차단한다.
4. `assessSajuHeldStagingPreflightV1`의 `configuration:'VALID'`은 **형식 검증**만 의미하고 `stagingAdmission:'HOLD'` 및 `stagingConnection:'NOT_VERIFIED'`는 변경하지 않는다. 별도 승인/기동 결과를 이 필드에 병합하지 않는다.
5. nonce DB는 일반 Subject Pool과 구별돼야 하며 객체가 다르다는 검사 외에도 실제 접속 주체·권한·대상 DB가 별도로 확인돼야 한다. `SET LOCAL ROLE myeongha_saju_proof_nonce_runtime`의 실환경 성공과 `anon/authenticated/service_role` 접근 거부 증빙 필요.
6. 8B 발급은 nonce를 내부 CSPRNG로 생성한다. 동일 요청을 2회 실행하는 테스트는 동일 Proof replay 테스트가 아니다. 실제 재전송 테스트는 서명 Envelope 자체를 제한된 테스트 경계에서 재검증해야 한다.

## 3. 설계할 파일과 인터페이스

### 3.1 명하 실행기 — 신규(구현 단계에서 추가)

`apps/api/src/saju-held-staging-rehearsal-runner-v1.ts`

인터페이스 후보 (계약 초안, 아직 구현·공개 API 아님):

```ts
interface SajuHeldStagingRehearsalRunnerV1 {
  runOnce(): Promise<SanitizedStagingRehearsalReportV1>;
}
interface CreateSajuHeldStagingRunnerInputV1 {
  readonly admissionPort: StagingOperatorAdmissionPortV1;
  readonly approvedMemberRequestPort: StagingApprovedMemberRequestPortV1;
  readonly memberIdentityVerifier: IdentityEvidenceVerificationPortV1;
  readonly preflightInput: SajuHeldStagingPreflightInputV1;
  readonly rehearsal: SajuHeldCurrentBirthServerRehearsalV1;
  readonly targetAssertionPort: StagingTargetAuthorityPortV1;
  readonly observer?: SanitizedStagingObservationPortV1;
}
```

- `admissionPort.authorizeOnce()`는 신뢰된 배포/운영 승인 주체가 제공하는 기능 포트다. 호출자가 넘기는 `approved=true`, 문자열 토큰 형식·JSON 객체·환경변수 플래그만으로 승인하면 안 된다. 실행 승인 자체의 신뢰성은 포트 구현과 실행 환경에 달려 있으며 **테스트용 mock은 배포 권한을 증명하지 못한다**.
- 운영 승인 증빙에는 대상 staging 식별자, 양쪽 배포/커밋, 만료시각, 승인 주체, 실행 횟수 제한을 결속해야 한다. 재사용 불가가 필요한 경우 **공유 영속 저장소의 원자적 소진**을 사용한다. 서명 검증이나 일회성 claim이 없는 단순 문자열/프로세스 내 Set은 불가.
- `approvedMemberRequestPort`는 운영자 승인 하에 Secret store에서 테스트용 Member 자격 증명을 가져와 메모리에서만 HTTP `Request`를 조립한다. 값을 CLI argv, 로그, GitHub Action 출력 또는 보고서에 넣지 않는다. 응답/요청 Body에서 직접 Subject, Birth, ReadingText, Source Authority, 키, Origin을 선택받지 않는다.
- `memberIdentityVerifier.verifyRequestIdentity(request)`를 실제로 호출한 뒤 **`kind === 'member'`**만 허용한다. 객체를 만들어 넣는 fixture 경로는 유닛테스트에만 존재한다. Auth 검증 실패·Guest·예외이면 Proof/nonce/Subject 쿼리를 진행하지 않는다.
- `targetAssertionPort`는 운영 Supabase 프로젝트/운영 DB·공용 Proof Origin과 다른 **명시적으로 허가된 격리 환경**임을 독립 확인한다. Origin 문자열 비교만으로 TLS peer, DB 분리, 네트워크 접근 통제를 입증했다고 주장하지 않는다.
- `preflightInput`은 서버만 조립한다. `configuration === 'VALID'`가 아니면 실행 금지. `stagingAdmission === 'HOLD'`는 그대로 유지한다. 실행 허가가 필요한 경우 별도의 운영 승인 게이트를 통과해야 한다.
- `rehearsal.rehearse(verifiedMemberEvidence)`는 이 계층의 **유일한** 8B 호출이다. 생성자에서는 IO 없음. 자동 retry 없음. Promise rejection은 fail-closed 및 고정 오류 코드로 변환.
- `observer`는 승인된 접근제어 로그에 **정규화된 결과 상태만** 기록하고 오류 객체/스택, 원문 출생정보, Subject ID, Revision ID, Proof 원문, request/response hash, raw nonce, credential을 기록하지 않는다.

### 3.2 운영 전용 조립 경계 — 신규(구현·배포 분리)

- 코드 검증 단계: `test/saju-held-staging-rehearsal-runner-v1.test.ts`에서만 신뢰 포트 synthetic mock 사용.
- 실제 스테이징 구동기: 기존 배포 인프라가 **별도 스테이징 실행 프로세스**를 제공하는 경우에만 마련한다. 공개 Web/Shared API 라우팅 테이블이나 `/api/me/saju/...` 경로, 일반 서비스 `start` 스크립트, Production readiness에 자동 연결하지 않는다.
- 외부 승인 검증, 실제 Secret provider 및 staging DB Pool creator는 8C-2B-2의 운영 계약이다. 8C-2B-1에서 우회용 구현을 추가하지 않는다.
- 기존 `MYEONGHA_SAJU_SERVICE_ORIGIN`/`MYEONGHA_SAJU_SERVICE_BEARER`는 **일반 계산 API용**이므로 Preview proof 인증에 그대로 재사용하지 않는다.

## 4. 실행 상태 기계

| 상태 | 진입·조건 | 다음 |
| --- | --- | --- |
| `UNADMITTED` | 초기값. 구성만 확인 가능 | 거부 또는 승인 검증 |
| `TARGET_CHECKED` | 실제 허가된 격리 스테이징 대상 확인 | 승인 검증 |
| `ADMITTED_ONCE` | 대상/SHA/만료/주체가 결속된 1회성 운영 승인 확인·소진 | 인증 |
| `MEMBER_VERIFIED` | staging Auth의 Member 토큰 검증 완료 | 8B 호출 |
| `PROOF_REHEARSED` | HTTP→HMAC→nonce→Revision 경로 완료 | 결과 정리 |
| `BLOCKED` | 앞 단계 거부·예외, no retry | 종료 |
| `TRANSPORT_HELD_ONLY` | 8B `held`이고 HOLD invariants 일치 | 종료 |

인증 실패나 잘못된 대상은 **HTTP/nonce/Subject 쿼리 이전**에 차단한다. 운영 승인 포트가 영속 기반 1회 소진을 수행하더라도 이를 Source proof nonce로 혼용하지 않는다.

실행 결과 보고 계약은 고정 키만 포함한다:

```ts
type SanitizedStagingRehearsalReportV1 = Readonly<{
  version: 'myeongha-held-saju-staging-runner-v1';
  result: 'BLOCKED' | 'TRANSPORT_HELD_ONLY';
  reason: 'ADMISSION_UNAVAILABLE' | 'TARGET_UNVERIFIED'
        | 'PREFLIGHT_BLOCKED' | 'MEMBER_NOT_VERIFIED'
        | 'PROOF_UNAVAILABLE' | 'REVISION_CHANGED'
        | 'TRANSPORT_INTEGRITY_VERIFIED_ONLY';
  stagingConnection: 'NOT_VERIFIED'; // Real staging evidence is independent
  sourceAuthority: 'NOT_EVALUATED';
  releaseAuthorization: 'NOT_EVALUATED';
  canExecute: false;
  canPublish: false;
  canSell: false;
}>;
```

이는 **신규 인터페이스 설계안**이며 현재 저장소의 공개 계약이 아니다. 실행기 결과 `TRANSPORT_HELD_ONLY`조차 독립 실환경 증빙 기록이 충족되기 전에는 스테이징 검증 완료로 승격되지 않는다.

## 5. 필수 부정 테스트 (합성)

| ID | 조건 | 기대 |
| --- | --- | --- |
| R01 | 런타임 생성 | HTTP/DB/Auth 요청 0건 |
| R02 | 승인 없음·만료·다른 대상·이미 소진됨 | Auth/DB/Saju 0건, `BLOCKED` |
| R03 | 운영 Supabase 프로젝트, 운영 DB, 일반 계산 Saju Origin 재사용 | `BLOCKED` |
| R04 | preflight `BLOCKED` 또는 Descriptor 불일치 | `BLOCKED`, Proof 실행 0회 |
| R05 | 회원 토큰 없음, 불일치, Supabase 오류 | `BLOCKED` |
| R06 | Guest 인식 | `BLOCKED` |
| R07 | Member 인증 정상, 승인 정상 | 기존 8B 호출 **정확히 1회** |
| R08 | 8B `held` | 외부 무결성 전용 결과 + 불변 HOLD 플래그 |
| R09 | 8B `blocked`·예외·Source 409·timeout | 일반화된 `BLOCKED`, 원문 노출 0건 |
| R10 | 동일 1회성 승인 재사용 / 병렬 요청 | 최대 1회 실행(실제 원자성은 운영 승인 포트의 별도 통합 검증) |
| R11 | 응답에 Subject, Birth, hash, nonce, Origin, Bearer/키 포함 시도 | Sanitized report에서 모두 제거 |
| R12 | CLI/공개 HTTP/Release/Commerce 자동 연결 검증 | 연결 없음, HOLD 유지 |
| R13 | 정상 이후 수정된 Birth Revision | 기존 binder가 `blocked` 유지 |
| R14 | 권한 플래그 변조 후 반환 | `BLOCKED`, 제품 권한 상승 없음 |

8C-2B-1 테스트는 승인 포트/인증 포트의 **합성 상호작용**만 검증하며 실서비스 연결·실제 RLS/원자성·TLS peer 검증을 주장하지 않는다.

## 6. 보안·리스크 및 운영 전환 금지선

- **신뢰 경계:** TypeScript interface, 환경변수 `STAGING=true`, CI green, mock 응답, 승인 문자열만으로 권한 성립 불가. 외부에서 생성한 `verifiedEvidence` 객체를 받는 새 API도 불가.
- **환경 분리:** 운영 전용 `parseProductionUserDataRuntimeConfigV1` 및 운영 전용 Postgres Subject Pool creator를 재활용한 스테이징 연결은 금지. 스테이징 전용 인증 Origin과 DB TLS/권한 계약 별도 설계. 운영 프로젝트 인지 검사 실패 시 차단.
- **신뢰 키:** Bearer는 HTTP 인증, HMAC 키는 서명 검증. 최소 32바이트, 서로 독립적. 서비스 Origin HTTPS 및 서버 측 고정, 리디렉션 불허.
- **DB:** Owner/Subject DB 실행 역할 `myeongha_api_executor`; nonce 로그인 연결은 별도 주체가 `myeongha_saju_proof_nonce_runtime`으로 전환. 전용 DB 역할을 일반 API principal에 부여 금지.
- **관찰:** 상태·검사 코드·불변 flag만 출력. `JSON.stringify(error)`, 요청/응답 전문, Binding 데이터, 스택 추적이 운영 로그로 유입되면 불합격.
- **수명:** 단일 사용 승인 + no retry + 리소스 close(); 취소·중단 시 차단. `timeout`은 기존 HTTP 클라이언트의 15초 기본/30초 상한을 준수. 임의로 변경하지 않는다.

## 7. 단계별 구현·승인 경로

1. **8C-2B-1A:** 신규 서버 내부 runner(포트 기반) + 정해진 report 타입. 기존 8B·8C-2A 계약 무수정.
2. **8C-2B-1B:** R01~R14 mock 테스트. 잘못된 대상·미승인 상태에서는 Auth, DB, Saju 호출 0건 검증.
3. **8C-2B-1C:** 기존 `Watchtower-Track: saju-bridge` scoped CI 후 필요한 SHA-pinned 통합 CI 1회. 검증된 HEAD/BASE에서 Squash merge, main 재조회.
4. **8C-2B-2:** 실제 스테이징 Auth/DB/issuer 서비스 준비 및 통신. 운영 승인, Secret, 인입 제한, DB 로그인 멤버십 실증 후 별도 실행.
5. **8C-2B-3/4:** 실제 HTTP/서명/replay/Revision 실패 시나리오와 증빙 레저. 8C-2C 키 교체·다중 인스턴스 장애 검증은 별도.

## 8. 결정 사항과 미해결 의존성

**이번 설계에서 결정:** Member-only; no new route; runner `runOnce()`; 무조건 별도 운영 승인; 대상/환경 검증 우선; 8B 1회; raw 결과/비밀/PII 비출력; 문서/합성 테스트는 실환경 근거가 아님; 8C-2A의 `stagingAdmission=HOLD` 유지.

**실행 전 필수 외부 의존성 (HOLD):** staging Supabase Origin/별도 Auth 프로젝트와 disposable member, 운영자 승인 포트 및 1회성 소진 실체, 격리 PostgreSQL 접속 주체 및 TLS, 실제 Saju 보호형 서비스 배포, Secret 관리, 운영 로그/롤백 정책. 어느 항목도 CI로 대체하지 못한다.

```text
sourceAuthority = NOT_EVALUATED
releaseAuthorization = NOT_EVALUATED
canExecute = false
canPublish = false
canSell = false
```
