# 8C-2B-2A — 격리 스테이징 Target Trust / Admission / Readiness 구현 설계

Watchtower-Track: saju-bridge

> 상태: IMPLEMENTATION DESIGN ONLY. 이 파일 자체로 실행·배포·Secret 발급·DB GRANT·권한 승인은 발생하지 않는다.
> 조사 기준: 2026-10-09, MyeongHa main `c62b573e053361e851235ef768385e6da9d66058`, Saju main `f16ef27e5122b15836cf368d93eabb0667e093e1`. 구현 시 최신 main 다시 확인.

## 1. 목표 / 이번 PR의 경계

이미 있는 8C-2A `assessSajuHeldStagingPreflightV1` 및 8C-2B-1A `createSajuHeldStagingRehearsalRunnerV1` 사이에 독립적인 **서버 전용 스테이징 환경 신뢰 계약**을 세운다. 이번 단계는 구현 가능한 순수 계약·정적 검사·증빙 상태 정의까지다. 실제 운영 포트/키/인가 실행은 별도 8C-2B-2B/2C/2D 승인 단계.

현재 리포지토리의 검증기는 원본 `Source` 의미나 Production Interpretation/Release/Product/Character/Commerce 권한을 부여하지 않는다. `runOnce()`는 외부에서 주입된 Target Authority, one-shot Admission, 테스트 Member Request 및 Member-only Verifier를 필요로 하며 **자동으로 서버 라우트를 등록하지 않는다**.

실환경 의존성은 아직 NOT_VERIFIED: 별도 staging Auth 프로젝트·DB, 보호형 Saju 발급 배포, 격리된 DB 로그인, TLS peer/네트워크, 승인 저장소·서명 권한, 테스트 Member 및 변경 승인.

## 2. 핵심 보안 결정

1. **Manifest는 비밀이 아닌 환경 식별 계약**이며 `manifest.valid`는 `stagingAdmission` 승인과 동의어가 아니다. 파일/JSON/사용자 요청을 신뢰 루트로 삼지 않는다. 승인 주체가 **대상·배포·검증 키 ID·Manifest canonical digest**를 독립적으로 결속한다.
2. Auth Project는 운영 Supabase ref `cnsfpcdiyofqvhpcegfc`와 달라야 한다. 운영 `parseProductionUserDataRuntimeConfigV1` 및 `createProductionRequestIdentityVerifierV1`의 Guest fallback 재사용 금지. 스테이징에서는 `SupabaseMemberIdentityEvidenceVerifierV1`를 스테이징 Origin에만 바인딩.
3. `Refund_management` 등 다른 프로젝트를 staging으로 임의 전용 금지. 프로젝트 별도 승인·생성 전까지 실제 단계 HOLD.
4. **서로 다른 Pool 객체**만으로 PostgreSQL 인프라 격리를 증명하지 못한다. 별도 Subject 로그인과 nonce 로그인, TLS verify-full 및 타깃 DB/클러스터 증빙을 배포 단계에서 확인한다. nonce 실행 역할은 `myeongha_saju_proof_nonce_runtime`; 일반 Subject 역할과 섞지 않는다.
5. Saju Production Calculation의 `MYEONGHA_SAJU_SERVICE_ORIGIN`/`MYEONGHA_SAJU_SERVICE_BEARER`는 보호형 Proof용으로 재사용하지 않는다. 별도 HTTPS Origin, Bearer, HMAC 키를 사용한다.
6. 승인 레코드는 **공유 영속 저장소에서 원자적 1회 소비**. 프로세스 변수, `STAGING=true`, CI 성공, 문자열 `approved`, 형식 검사만으로 승인 불가. 승인 소비 뒤 실패해도 자동 재사용하지 않는다.
7. 운영 증빙의 실패·부재·만료·SHA drift·권한 불일치는 BLOCKED/HOLD. 어떤 실패도 `canExecute/canPublish/canSell=true`로 변환 금지. 단일 실행과 no-retry.
8. 로그/리포트에는 Secret, Token, 연결 문자열, raw nonce, Subject/Birth, response/proof 본문, 서명, Request/Response hash를 담지 않는다. 리포트의 체크 이름과 결과는 고정 allowlist.

## 3. 구현 산출물 및 추천 파일

| 파일 | 역할 |
| --- | --- |
| `apps/api/src/saju-held-staging-target-manifest-v1.ts` | 비밀 없는 타입·canonicalization·고정 필드 및 manifest digest 계산 |
| `apps/api/src/saju-held-staging-target-validator-v1.ts` | 운영 혼입/HTTPS origin/소유 서비스 역할/SHA·Issuer·Audience·KeyId 일치 확인, I/O 없음 |
| `apps/api/src/saju-held-staging-admission-contract-v1.ts` | 승인 대상·배포·만료·소진 상태 계약 및 fail-closed 판정 인터페이스. 실제 영속 소진 구현은 2B-2C |
| `apps/api/src/saju-held-staging-readiness-v1.ts` | configuration status와 독립 실환경 evidence 상태를 결합한 무권한 보고 타입·정적 판정 |
| `test/saju-held-staging-target-manifest-v1.test.ts` | 표준화, 필드·변조·hash 테스트 |
| `test/saju-held-staging-target-validator-v1.test.ts` | 운영 Origin 차단, target/SHA drift, DB 분리, secret-in-manifest 검증 |
| `test/saju-held-staging-admission-contract-v1.test.ts` | expired/reused/wrong manifest/wrong deployment/unsupported issuer 차단 |
| `test/saju-held-staging-readiness-v1.test.ts` | 증빙 결손·만료·중복/충돌·권한 상승 방지, 개인정보 비출력 |
| `docs/SAJU_HELD_STAGING_TRUST_IMPLEMENTATION_8C2B2A.md` | 이 명세와 후속 운영 책임 구분 |

기존 8B, 8C-2A, 8C-2B-1A 코드를 변경하지 않는 것이 기본값. 필요한 연동은 후속 운영 조립 시 **고정·검증된 Manifest에서 생성된 동일 preflight client options**와 existing runner를 연결하는 방식.

## 4. 비밀 없는 Manifest V1 계약 (제안)

```ts
type SajuHeldStagingTargetManifestV1 = Readonly<{
  version: 'myeongha-saju-staging-target-v1';
  environmentId: string;            // reviewed non-production ID
  myeonghaCommitSha: string;        // exact 40-char Git SHA
  sajuCommitSha: string;            // exact 40-char Git SHA
  authProjectRef: string;           // expected staging Supabase project ref
  authOrigin: string;               // bare HTTPS origin, no credentials/query/path
  subjectDbTargetId: string;        // reviewed non-secret target identifier
  nonceDbTargetId: string;          // reviewed non-secret target identifier
  proofServiceOrigin: string;       // dedicated bare HTTPS origin
  proofIssuer: string;
  proofAudience: string;
  proofKeyId: string;               // ID ONLY, not the key
  proofTtlMs: number;               // 1..120000
}>;
```

- 타입은 기존 계약과 호환되는 값 형식을 선별한다. `authOrigin`은 `https://<authProjectRef>.supabase.co` 및 승인된 staging 프로젝트로 일치해야 한다. localhost/http, IP literal, UserInfo, query, fragment, trailing path, 운영/일반 Calculation URL은 거부.
- `subjectDbTargetId` / `nonceDbTargetId`는 **식별 선언**이지 실접속 증명 아님. 배포 Authority가 TLS peer, 실제 DB cluster, current_user·역할 멤버십을 확인하고 결속한 Evidence가 있어야 한다.
- Manifest의 키는 **정확한 allowlist**. `serviceBearer`, `keyBytes`, `databaseUrl`, `birth`, `subjectId` 등 추가 키는 거부. 개체/배열의 Prototype 변조와 중복 JSON keys는 입력 파서 경계에서 거부하도록 별도 검증.
- Digest는 domain-separated canonical encoding의 SHA-256, 재현 가능·결정적. `SHA256`은 무결성 식별자일 뿐 **서명이나 승인 권한 아님**.
- 값 기반 비교가 아니라 독립 배포 Evidence의 실제 대상/버전/SHA와 **완전 일치**시킨다. 최신 배포가 바뀌면 과거 승인 소진 금지.

## 5. Config Validator V1 (순수, zero I/O)

`assessSajuHeldStagingTargetConfigV1({manifest, preflightDescriptor, approvedNonSecretTarget})`

- 승인된 **별도** staging ref/Origin과 일치, 운영 ref와 불일치, 실제 등록된 staging target만 인정; 모든 ID와 SHA 문법 및 정확한 키 집합 검증.
- Proof issuer/audience/keyId/TTL 및 `/api/internal/preview/source-readings` wire descriptor와 일치; 양쪽 commit SHA가 사전 승인된 대상과 일치.
- Secret 값은 매개변수·출력에 포함하지 않는다. `VALID`은 **계약만** 통과한 것, `stagingConnection='NOT_VERIFIED'`, `stagingAdmission='HOLD'` 유지.
- `approvedNonSecretTarget`는 별도 reviewed config 입력일 뿐, **호출자가 제공한 JSON을 복사한 값이 아니어야 한다**. 공급 출처의 신뢰성은 후속 운영 Authority의 책임이다.
- 알 수 없는 필드/고정 필드 변경을 조용히 수용하지 않는다.

## 6. One-shot Admission 계약 (운영 구현의 선행 사양)

권장 승인 레코드: `permitId`(난수), `manifestDigest`, `environmentId`, `myeonghaCommitSha`, `sajuCommitSha`, `approvedOperatorId`, `issuedAt`, `expiresAt`, `consumedAt`(nullable), `status`, `approvalSignatureKeyId`; secret/token 미저장.

트랜잭션 단위 조건부 원자 소진: 특정 permit ID + 타깃 digest/SHA + 미사용 + 미만료 + 승인 서명 검증 성공일 때 한 행 UPDATE ... WHERE ... RETURNING; 결과 정확히 1행이 아니면 거부. DB unique key, 별도 NOLOGIN 실행 역할·최소 GRANT·RLS 및 사용자 Data API 접근 거부. 격리된 관리 승인 절차가 있어야 하며, 일반 API/Web/Commerce에서 승인 레코드 생성이나 소진 불가. 실행 실패 후 자동 롤백해 permit을 재사용하면 안 된다.

**8C-2B-2A는 계약만 작성**: migration/테이블 생성, 로그인 역할 GRANT, Secret 발급, 실제 approval issuer, signing/verification key provisioning은 아직 수행하지 않는다. 실제 저장소의 분리·atomicity는 8C-2B-2C에서 관찰해야 한다.

## 7. Readiness와 증빙

독립 Evidence 분류:
- `staging_auth_project_isolation`
- `subject_db_tls_identity_and_role`
- `nonce_db_tls_identity_and_runtime_role`
- `saju_issuer_deployed_restricted_tls`
- `bearer_and_hmac_provisioned_separately`
- `disposable_verified_member_and_current_birth`
- `one_shot_operator_admission_atomicity`
- `staging_change_approval_and_rollback`

각 Evidence는 책임 주체, 검증 대상 digest/배포 SHA, 기록 시간, 만료 및 검증 결과를 포함하되 **관찰자 입력만으로 신뢰 여부를 결정하지 않는다**. 서버 측 검증 Authority가 독립적으로 평가해야 한다.

Readiness report는 `configuration:'VALID'|'BLOCKED'`, `operationalEvidence:'NOT_VERIFIED'|'BLOCKED'|'VERIFIED'`, `stagingAdmission:'HOLD'`, `canExecute:false`, `canPublish:false`, `canSell:false`로 고정. 실환경 Evidence가 모두 `VERIFIED`여도 이 **설계/정적 checker**는 `stagingAdmission=HOLD`를 변경하지 않는다. 개별 1회 실행 가능 여부는 trusted runtime admission port가 별도 소진 후 판단한다. `TRANSPORT_HELD_ONLY`는 8B/runner의 전송 결과일 뿐 상품 출시 승인 아님.

## 8. 구현 순서 / 테스트 범위

1. 2B-2A-01 Manifest 타입, canonical digest, 알 수 없는 필드/secret 거부 테스트.
2. 2B-2A-02 Config Validator: 실제 운영 Supabase ID와 동일한 ref, 미승인 프로젝트, Auth Origin mismatch, 일반 Saju 계산 Origin reuse, HTTP/unsafe URL, SHA drift, TTL mismatch, DB target 미분리/역할 충돌 차단.
3. 2B-2A-03 Admission Contract: wrong digest/expired/consumed/replayed/tampered/actor mismatch test. **실제 원자성 PASS는 DB test 전까지 주장 금지**.
4. 2B-2A-04 Readiness: zero-I/O, 증빙 부재·누락·만료·거부·권한 상승/민감 값 제거 검증.
5. PR 분할은 코드 단위가 커지면 Manifest+Validator / Admission+Readiness 2개만 권장. 공통 계약 중복 구현 방지.
6. `Watchtower-Track: saju-bridge` 사용; 기존 scoped CI와 필요시 **한 번** SHA 고정 통합 CI; 신규 GitHub Actions workflow 금지.
7. 2B-2B Saju 전용 보호형 발급 서비스 배포, 2B-2C 명하 실제 포트·DB auth provisioning, 2B-2D 승인된 일회 실행은 각각 별도 게이트.

테스트에서 synthetic Authority는 동작 경계만 검증한다. 실제 Auth/DB/TLS/허가 검증은 2B-2B/2C/2D의 외부 Evidence 없이는 HOLD.

## 9. 종료 기준과 금지 사항

A — 구현 대상 인터페이스/정적 계약/테스트 명세 정리 완료. B — 본 설계 PR에 대해 기존 검증 CI 통과. C — SHA 확인·Squash merge·main 재조회. **실제 8C-2B-2A 코드의 구현 A/B/C는 후속 구현 PR로 별도 판정.**

하지 말 것: 별도 승인 없는 Supabase 프로젝트 생성, 운영 데이터 복제, 기존 운영 Secret 재사용, nonce 역할 우회, 자동 route/CLI/deploy 추가, E2E 성공 허위 주장, config-pass에 의한 상품 권한 상승.

```text
sourceAuthority = NOT_EVALUATED
releaseAuthorization = NOT_EVALUATED
canExecute = false
canPublish = false
canSell = false
```
