# 8C-2B-2D-3-01 — Permit V2 서명·연결 계획 결속 계약

Watchtower-Track: saju-bridge

## 목표와 배경

8C-2B-2C의 Permit V1 Ed25519 서명은 Manifest Digest 및 MyeongHa/Saju deployment SHA만 결속한다. 8C-2B-2D-2에서 별도 Connection Plan으로 Auth Origin, Saju Proof, Subject/nonce/Admission DB의 target/login/runtime role/TLS hostname/CA pin을 선언했지만, **V1 서명에는 Connection Plan Digest가 없다**.

Permit V1/기존 운영 Postgres consumer를 변경하지 않고 **Permit V2**의 독립 도메인·canonical 서명 계약 및 zero-I/O 검증기를 구현한다.

## 계약

- 파일: `apps/api/src/saju-held-staging-admission-signature-v2.ts`
- 버전: `myeongha-saju-staging-admission-contract-v2`
- 도메인 분리: `myeongha/saju/staging-admission/permit/v2\0` (V1과 다른 prefix)
- Canonical bytes: UTF-8 of domain + JSON serialization of the **fixed ordered array** `SAJU_HELD_STAGING_ADMISSION_PERMIT_KEYS_V2`.
- 필수 서명 필드: version, permitId, manifestDigest, **connectionPlanDigest**, environmentId, myeonghaCommitSha, sajuCommitSha, approvedOperatorId, issuedAtMs, expiresAtMs, consumedAtMs, status, approvalSignatureKeyId.
- 형식: UUIDv4 permit ID, SHA-256 hex digests, 40 hex commit SHAs, TTL 최대 15분, ISSUED 상태에서 consumedAtMs null.
- 검증: permit Manifest Digest == 실제 Manifest Digest == 독립 검토 Manifest Digest. Connection Plan의 Manifest 바인딩과 독립 검토 Plan Digest 일치. Permit Connection Plan Digest == 실제 Plan Digest. 운영자 ID, Key ID 및 기간 검증. canonical base64url 64-byte Ed25519 detached signature + 전달된 public KeyObject 일치.
- 결과 `SIGNED_TARGET_MATCHED_UNVERIFIED_AUTHORITY`는 **제공받은 공개키로 서명 검증이 성공했다**는 뜻일 뿐이다. 공개키의 신뢰·서명자 승인·실제 배포/DB/TLS/서비스 검증의 증거가 아니다.

## 보안 경계

- 본 단계는 **검증용 순수 계약**. Ed25519 private key 생성·서명 발급, 운영자 인증, 실DB 조회·승인 소진, Route, HTTP, Secret loader, GRANT, migrations, Supabase 생성/연결, 배포를 구현하지 않는다.
- 기존 `saju-held-staging-admission-contract-v1.ts`, `saju-held-staging-admission-postgres-v1.ts` 및 V1 DB 테이블은 미변경.
- V1 permit/signature는 V2 parser·도메인에서 거부된다. 기존 V1 consumer는 존재하지만 별도 staging deployment 운영 경계에서는 V1 admission path를 재사용하지 않도록 후속 게이트가 필요하다.
- 정적 Approved Manifest/Plan이 caller JSON과 일치한다는 이유로 **독립 승인 출처가 증명되지는 않는다**. 검증 공개키도 운영 Authority가 독립 key registry와 신뢰된 요청 범위에 결속해야 한다.
- 서명이 유효해도 `signerAuthority=NOT_VERIFIED`, `atomicConsumption=NOT_VERIFIED`, `stagingConnection=NOT_VERIFIED`, `stagingAdmission=HOLD`이며 모든 `can*` false.
- 보고서는 임의 URL, Subject/Birth, Secret, public/private key material, signature, permitId, digest를 출력하지 않는다.
- 부정 테스트: V1 cross-version, domain replay, wrong digest/CA/role/host/Origin, altered approval plan/Manifest/commit SHA, wrong signer/key ID, wrong key type, signature tampering, expired/future/consumed/revoked, accessors/prototypes, extra secret fields.

## 다음 단계 / 실환경 차단

**8C-2B-2D-3-02**: V2 전용 PostgreSQL 승인 영속화·최소 권한·원자 소비, Manifest+Connection Plan digest가 함께 equality predicate에 포함된 독립 approval row, 실제 폐기 가능한 PG15/PG17 병렬 race 검증. 운영 DB migration/GRANT는 하지 않는다.

**8C-2B-2D-3-03~04**: 독립 Target Authority, signer public-key trust registry, 실제 DB cluster/session_user/role TLS evidence, 운영 Auth·Saju Proof evidence 및 operator key lifecycle, 스테이징 rollback/incident 대응.

**2D-4**: 승인된 일회 실행; 2D-3 통과만으로 실행 시작 불가.

```text
A = 코드·부정 테스트
B = 관련 CI와 SHA 고정 통합 CI
C = 최신 HEAD/BASE 확인 후 Squash 병합 및 main 확인
stagingAdmission = HOLD
stagingConnection = NOT_VERIFIED
sourceAuthority = NOT_EVALUATED
releaseAuthorization = NOT_EVALUATED
canRunOnce = false
canExecute = false
canPublish = false
canSell = false
```
