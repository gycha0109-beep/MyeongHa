# 8C-2B-2D-3-03 — 독립 Target Trust Authority 계약 및 서명 주장 평가

Watchtower-Track: saju-bridge

## 전체 책임 경계

3-03-A PR #1850은 operator/attestor 키 역할을 분리하는 `saju-held-staging-authority-registry-v1.ts`, 엄격한 `saju-held-staging-target-evidence-v1.ts`와 합성 테스트를 추가했다. Ed25519 레지스트리 서명은 **제공된 루트 공개키에 대해 유효**할 뿐, 루트키의 독립적 신뢰·프로비저닝을 증명하지 않는다.

3-03-B에서 `apps/api/src/saju-held-staging-target-trust-v1.ts`는 정책 → Operator Permit V2 → attestor 서명 Evidence → 실제 Plan의 구조적 결속을 zero-I/O로 검증한다. 어떤 검증 결과도 Runner/상용화/배포 경로에 전달하지 않는다.

## 검증 항목

1. 별도 입력으로 공급받은 루트 공개키를 사용해 도메인 분리 Registry 서명 확인. Registry revision 하한·유효기간·environmentId·키 fingerprint/용도/철회 정책 확인.
2. Registry에서 용도 `OPERATOR_APPROVAL`인 키만 Permit V2 Ed25519 검증에 사용. Principal ID, Key ID, Permit issuance TTL, Manifest Digest, Connection Plan Digest, MyeongHa/Saju commit SHA 일치.
3. 별도 `TARGET_ATTESTATION` 키로 evidence 서명 확인. Evidence attestor ID, challengeDigest, freshness(최대 60초), 독립 등록된 키 범위·철회상태 일치. `expectedChallengePermitId`도 **별도 발급된 Challenge의 Permit ID**와 일치시켜 동일 Manifest/Plan을 공유하는 다른 Permit의 Evidence 재사용을 정적 계약 수준에서 차단한다. 이 입력의 신뢰 출처는 3-03에서 증명하지 않는다.
4. Evidence의 관찰 주장에 포함된 Auth project ref/Origin/member-only/Production 분리, Subject/nonce/Admission DB의 서로 다른 클러스터 식별 Digest/실행 Role/로그인/TLS hostname/CA fingerprint/RLS/교차 접근 금지, Saju HTTPS/Bearer/HMAC 독립 주장과 Manifest·Plan을 비교.
5. 잘못된 서명, 만료·키 철회·롤백·SHA/Plan drift, 위조된 Target 관찰 주장, 재사용한 challenge에 대한 잘못된 기대치, 역할·클러스터 혼용은 `BLOCKED`로 처리. 민감한 원본 값이나 signature는 결과에 출력하지 않는다.

## 중요한 미검증 및 보안 경계

- **서명된 관찰 자료의 진위가 증명되어도 관찰 내용이 사실이라고 증명되지는 않는다.** Attestor의 독립 실제 프로브 경로와 관찰 증거는 실환경 3-04에서 입증할 책임이다.
- 루트 공개키·서명 정책·최소 리비전·Challenge expected value/Permit ID·trusted time을 일반 API 입력이나 동일한 evidence bundle에서 공급한다면 독립성이 없다. 별도 고정·관리된 신뢰 Anchor와 anti-rollback durable source, 일회성 challenge 소비 저장소가 필요하다.
- Connection Plan V1의 서로 다른 DB target ID/role 이름은 물리적 격리 증빙이 아니다. 3-03은 3개의 서로 다른 clusterIdentityDigest에 대한 **서명된 주장**만 일치 검사한다. DB에 직접 연결하지 않는다.
- 기존 `StagingTargetAuthorityPortV1.assertIsolatedStagingTarget({sourceProofOrigin})`은 원본 Manifest/Plan/SHA까지 바인딩하지 않는다. 이 모듈은 그 boolean port로 연결/변환하지 않는다. 향후 별도 Target Authority V2 인터페이스와 승인 운영 게이트 필수.
- Saju Proof 서버는 현재 loopback 전용. 공개 바인딩/배포/프록시 Secret 발급을 하지 않는다.
- 기존 Permit V1/V2, DB 소비 어댑터, Supabase 운영 마이그레이션, 역할 GRANT, 서명 키 생성·프로비저닝, Auth 요청, proof 호출, 실제 스테이징 배포, Runner 실행, commerce/release 활성화는 이 작업에서 변경하지 않는다.

## 필수 운영 증빙(3-04 이관)

독립 루트 공개키 고정 및 감사 가능한 custody, 키 폐기/회전·승인자 자격, registry rollback floor·challenge 일회 소비, 실제 staging Auth 프로젝트 분리, DB 3대의 TLS peer/session_user/current_user/PG privilege/RLS/클러스터 정체성, Saju HTTPS reverse proxy와 Bearer/HMAC 격리, 별도 테스트 Member 승인, 운영 승인/취소/인시던트/복구 Runbook.

**암호학적으로 모든 조건이 맞아도 현재 결과는 `SIGNED_ASSERTIONS_UNANCHORED`이고 다음은 불변:**

```text
rootAuthority=NOT_VERIFIED
signerAuthority=NOT_VERIFIED
operationalEvidence=NOT_VERIFIED
stagingConnection=NOT_VERIFIED
stagingAdmission=HOLD
sourceAuthority=NOT_EVALUATED
releaseAuthorization=NOT_EVALUATED
canRunOnce=false
canExecute=false
canPublish=false
canSell=false
```

## 코드 종료 기준

A. 독립 registry/evidence 계약, crypto·plan evaluator, 위조·변조·권한 혼용·미검증 주장 부정 테스트.
B. 관련 TypeScript/unit CI와 SHA 고정 Integration Verify.
C. 최신 HEAD/BASE 확인 후 squash, main 포함 확인.
D. 실환경 입증/실행은 **미수행, HOLD**.
