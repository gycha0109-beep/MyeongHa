# SO-3B — Solo Owner provider readiness / 신뢰 출처 계약 (운영 미연결)

Watchtower-Track: saju-bridge

> **범위: 무료·무권한 P0 선행 구현.** SO-3B는 SO-3 `#1950`의 Challenge/Admission 읽기 전용 대조를 운영 허가로 승격하지 않도록 관리 평면 요구조건을 문서·합성 주장 검사로 고정한다. 실제 계정, Provider 선택, KMS, Root, Secret, IAM GRANT, Staging/Production DB, Runner, 감사 저장소, 유료 자원은 생성·접속·수정하지 않는다.

## 1. 기준 및 비권한 경계

- 기존 아키텍처: `MYEONGHA_SOLO_OWNER_SEGREGATED_AUTHORITY_ARCHITECTURE_V0_1.md` 4~5, 10~13절.
- 기존 Trust/Floor: `SAJU_SOLO_OWNER_SO2_REGISTRY_FLOOR_SYNTHETIC.md`; 기존 소비 결과: `SAJU_SOLO_OWNER_SO3_CROSS_DB_RECONCILIATION_CLAIM.md`.
- 현재 SO-3B: `apps/api/src/saju-held-staging-solo-owner-provider-readiness-v1.ts` 순수 함수 `assessSajuSoloOwnerProviderReadinessClaimV1` 및 합성 부정 테스트만. `SajuSo3bUnconnectedReadOnlyProviderPortsV1`은 미래의 읽기 전용 포트 형태일 뿐 구현·호출 없음.
- 모든 일치 판정은 **CONSISTENT_UNVERIFIED_ORIGIN**. 입력 scope, Root anchor 참조, trusted clock 참조, witness 참조를 **호출자가 자유롭게 위조할 수 있다.** 실제 Identity·키 보관·서명·time·floor·WORM·복구·예산을 증명하지 않는다.
- 독립 서비스 principal ID는 **인간 2인의 상호 견제나 관리 평면의 실제 분리 증명 아님**.

## 2. 역할별 최소 권한 계획 (선언 비교, IAM 정책 아님)

| Role | 허용 선언(정확히 일치) | 키 purpose | 금지·실제 요구 |
|---|---|---|---|
| OWNER_PORTAL | INTENT_RECORD | OWNER_INTENT | Root read/sign, Runner 거부. 실제 passkey/행위별 재인증 별도 |
| ROOT_CUSTODY | ROOT_ANCHOR_READ | ROOT_ANCHOR | 키 export·앱 자기 Root 교체 거부, 검증된 독립 pin 필요 |
| OPERATOR_SIGNER | PERMIT_SIGN | PERMIT_V2 | Attestor 겸임·임의 사인 차단, 실제 purpose-bound key·Owner 이벤트 검증 필요 |
| ATTESTOR_WORKER | TARGET_READ, ATTEST_SIGN | EVIDENCE_ATTESTATION | Permit 발급/소비 금지, read-only 관찰 실제 workload identity 필요 |
| CHALLENGE_CONSUMER | CHALLENGE_CONSUME | CHALLENGE_CONSUMPTION | 재발급/삭제/Admission 쓰기 금지 |
| RUNNER | **없음** | DISABLED | 본 단계에서 실행권 없음. future V2/별도 P3 승인 전 절대 연결 금지 |

모든 역할별 principal ID·security domain은 중복 불가로 **주장 형식** 검사. Root/Signer/Attestor 비반출을 `keyExportable=false`로 선언하더라도 실제 KMS key policy·호출자·보관 주체는 증명되지 않는다. 동일 인간 Owner는 허용하되 2인 독립 승인이라고 주장하지 않는다. 실제 설정 시 CUSTODY_VERIFIER, FLOOR_WRITER, CHALLENGE_ISSUER, ADMISSION_CONSUMER, AUDIT_WRITER 등 기존 설계의 **세분화된 별도 credential**이 필수다. 본 6역할 합성 모델을 실제 IAM policy에 그대로 배포하면 안 된다.

## 3. 신뢰 바운더리와 운영 게이트

1. **Scope 동결:** environment, Permit UUID, Manifest/Plan SHA-256, MyeongHa/Saju commit SHA, request digest를 동시에 결속. 형식·문자열 동등성만 검사하므로 expectedScope도 운영에서는 신뢰 저장소에서 로드해야 한다.
2. **Custody/Signer:** Root SPKI pin과 외부 revision high-water, revocation은 앱·CI·PR·같은 Evidence bundle이 아닌 별도 read-only 보안 계정으로부터 독립 재조회. purpose-bound Operator/Attestor 서명 검증·키 철회 상태·Owner 강인증 이벤트가 필요.
3. **Witness/Clock:** attestor, Challenge, Admission, audit, trusted-clock의 **참조 문자열만** 검사. 문자열 불일치 = 물리적 독립·서명 검증이 아님. 별도 IAM, TLS peer, signed envelope, monotonic floor, 원장 transaction receipt·신뢰 시각·철회 재검증 필요.
4. **Audit:** immutable 외부 audit receipt·write-only actor, 보관 정책 및 복구 실측 필요. `auditRetentionDays`는 계획 값(30~3650)일 뿐 WORM 또는 영속 보장 아님.
5. **비용:** 본 선행 트랙의 `maxIncrementalCostUsdCents`는 **0만 허용**. 실제 Provider·계정·KMS·WORM·DB·Auth·호출량·리전별 가격표/무료 한도/월간 사용량/상한/알람을 비교한 후 **사용자 별도 명시 승인** 필요. 실제 비용을 USD 0으로 보장하지 않는다.
6. **부분 COMMIT/복구:** SO-3의 `CONSUMPTION_UNKNOWN`, `CROSS_DB_PARTIAL_HOLD`, `RECOVERY_HOLD`는 자동 재시도·강제 수정·Runner 연결이 불가. 양 원장의 서명된 read-only 독립 확인 + Owner 수동 판정 + 외부 감사 후 새 scope 승인/Challenge 필요.
7. **긴급 중지:** 사고·Owner passkey 탈취 의심·Root rollback·time/audit outage·revocation은 새 실행 **HOLD**. kill-switch는 RunOnce grant로 재해석 금지.

## 4. 이어질 구현/운영 단계

| Gate | 필요한 아티팩트 | 조건 |
|---|---|---|
| **SO-3B P0 (본 PR)** | 타입/순수검사/합성 부정 테스트/R01~R14 + T01~T40 설계 대응표 | CI/PR 병합으로 **코드 계약만** 완료 |
| SO-3 운영 인프라 준비 | 공급자 비교·월 비용·최소 IAM/Root 비반출·외부 high-water·WORM·복구, Owner 강인증 | **별도 명시 승인 없으면 HOLD** |
| SO-4 / 3-04-03B | R01~R14 실환경 독립 probe/서명·감사 provenance | 출처별 signed attestation, 실제 분리 실측 |
| SO-5 / 3-04-04 | 운영 V2 preflight와 Runner 사이 fail-closed gate | 반복/드리프트/unknown COMMIT 부정 검증 + 별도 승인 |
| SO-6 / 2D-4 | 폐기형 격리 Staging 단발 리허설 | 개별 Owner 재인증·일회 실행·복구/폐기 증빙 |
| SO-7 | Production/Saju/Commerce 출시 | 각 domain Authority 독립 승인 |

## 5. 불변 판정

```text
rootCustodyAuthority=NOT_VERIFIED
workloadIdentityAuthority=NOT_VERIFIED
signerAuthority=NOT_VERIFIED
attestorAuthority=NOT_VERIFIED
trustedClockAuthority=NOT_VERIFIED
revisionDurability=NOT_VERIFIED
auditDurability=NOT_VERIFIED
evidenceProvenance=NOT_VERIFIED
budgetAuthority=NOT_VERIFIED
stagingAdmission=HOLD
mayRetryConsumption=false
canRunOnce=false
canExecute=false
canPublish=false
canSell=false
```

합성 검증의 `CONSISTENT_UNVERIFIED_ORIGIN`을 3-04-03B 실제 증빙 통과, 권한 승인, 운영 IAM 적용, Runner 허가 또는 결제 활성화에 연결하지 않는다. 실패·증빙 누락 시 BLOCKED/HOLD.
