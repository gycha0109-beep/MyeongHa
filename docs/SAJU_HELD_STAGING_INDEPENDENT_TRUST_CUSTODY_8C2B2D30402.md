# 8C-2B-2D-3-04-02 — 독립 Root/Key custody 및 영속 Revision·Challenge Authority 설계

Watchtower-Track: saju-bridge

> **단계:** 실제 운영 전 보안 설계 검토. 운영 Root/KMS/DB 준비, Secret 발급, GRANT, 서버 연결, Runner 실행은 **별도 승인 전 금지**. 이 문서 병합은 3-04-02의 **설계 정리**이지 실환경 완료 또는 실행 인가가 아니다.
>
> 선행: [3-03 정적 Target Trust](./SAJU_HELD_STAGING_TARGET_TRUST_8C2B2D303.md), [3-04-01 운영 증빙 R01–R14](./SAJU_HELD_STAGING_OPERATIONAL_EVIDENCE_RUNBOOK_8C2B2D30401.md), [브릿지 완료 로드맵](./SAJU_HELD_STAGING_COMPLETION_ROADMAP_8C2B2D.md).

## 1. 지금의 증명 공백

`assessSajuHeldStagingTargetTrustV1`은 다음 입력을 외부에서 받는다.

- `suppliedRootPublicKey`, `expectedRootKeyId`
- `minimumRegistryRevision`
- `expectedChallengeDigest`, `expectedChallengePermitId`
- `nowMs`, 서명 Registry/Permit/Evidence 및 Manifest/Plan

이 값들이 검증 대상과 같은 호출자/같은 Evidence 묶음에 의해 지정될 수 있는 동안에는 독립 운영 신뢰가 성립하지 않는다. 3-03의 `SIGNED_ASSERTIONS_UNANCHORED`는 **서명 주장에 대한 구조 검증**이며 승인된 관찰/실접속을 의미하지 않는다.

본 단계는 R01–R04의 독립 출처 및 durability를 만드는 운영 설계이며, R05–R14의 실제 탐침과 Runner 연결은 각각 3-04-03/04 및 2D-4에서 별도로 한다.

## 2. 관리 책임/권한 분리

| 영역 | 소유자·권한 | 명시적 금지 |
|---|---|---|
| 신뢰 Anchor/Root | 검증 대상 애플리케이션과 독립된 운영 보안 관리자, 이중 승인 | API request/body, PR, Evidence, 대상 애플리케이션 설정만으로 Root를 교체 |
| Operator signing | 승인 권한자 전용 키·purpose, 키 사용 감사 | attestor key 사용, private key를 API 런타임에 전달 |
| Target attestation | 독립 probe 운영자/Attestor key·purpose | 대상 서비스가 직접 자기 관찰을 서명해 독립 증빙으로 주장 |
| Registry revision floor | 변경 불가/감사 가능한 별도 저장소를 관리하는 보안 운영 역할 | 검증 대상이 floor 감소/삭제/초기화, 노드 로컬 캐시만 신뢰 |
| Challenge ledger | 독립 발급/소비 역할, 강한 난수, 트랜잭션 격리 | 요청자가 임의 Challenge 선택, 대상이 발급·소비, 재사용/자동 재시도 |
| Runtime Runner | 대상·Permit이 일치하는 좁은 실행 권한 | 자체 승인·자체 증빙·자체 실행 또는 V1 boolean 우회 |

운영 승인은 런북에 따른 **2인 이상 분리된 검토 주체**가 담당하며, 역할 분리/승인 기록이 실제로 입증되지 않으면 HOLD다. 임시 예외는 별도 break-glass 절차로 기록하고 자동 승인하지 않는다.

## 3. Root/Registry 운영 Anchor

- environment별 독립 pin: 환경 ID, Root Key ID, SPKI SHA-256 fingerprint, 공개키 신뢰 경로, 핀 버전 및 승인 이력.
- 공급 주체가 다른 자료: Registry 서명 문서, 환경 Manifest, 승인 Permit, Attestor Evidence와 **별도의 저장/읽기 경로**를 적용한다.
- 운영 키 custody: 개인키 비노출, Key ID와 purpose 경계, 생성/활성/회전/폐기 승인, 접근 로그, 긴급 정지 절차.
- Registry의 `revision`은 환경 단위 **독립 durable high-water floor**를 통해 하향 전환 금지. Root 회전 시에도 floor를 재설정하지 않는다. 초기 pin 변경과 복구는 일반 요청/배포 CI가 아니라 별도 이중 승인 변경으로만 허용.
- 공격자 제공 Root와 임의 Registry가 서로 서명 검증에 성공하는 경우도 운영 신뢰 `PASS`로 승격해서는 안 된다.
- 요청 시각 `nowMs`도 검증 대상이 지정하는 원시값을 신뢰하지 않는다. 승인된 서버 시각 소스 및 clock skew/expiry 거부 기준을 정하고 실환경 시험한다.

### Revision 영속 계약 (후속 구현/운영 승인용)

- 저장 키: 안정적인 `environmentId` 및 독립 custody 식별자. 절대 Secret 저장 금지.
- 최소 필드: `minimumRevision`, `pinnedRootFingerprint`, `updatedAt`, `approvalRef`, 불변 감사 이벤트 ID.
- 읽기/갱신: 해당 환경의 승인된 Root pin과 Registry 서명을 확인한 뒤 **조건부 원자적 maximum-only update**. 과거 revision의 동시 갱신/재시작/부분 실패/복구에서 이전 floor를 읽을 수 없어야 한다.
- `revision < floor`, DB unreachable, stale read, ambiguous commit, pin mismatch → **HOLD**.
- Root/key 회전·철회 시 개별 서명 유효성뿐 아니라 Registry floor 및 긴급 revocation 내역을 현재 운영 출처로 재확인한다.

## 4. Permit 전용 일회성 Challenge

**후속 저장소 계약 필드(제안, 기존 Permit/Target Evidence V1/V2의 서명 포맷을 변경하지 않음):**

| 필드 | 조건 |
|---|---|
| `challengeId` 및 `nonce` | 독립 발급자의 암호학적 난수 ≥256비트; 충돌 시 거부 |
| `environmentId`, `permitId` | 발급 순간 정확히 한 환경·한 Permit에 고정 |
| `manifestDigest`, `connectionPlanDigest` | 승인된 불변 snapshot Digest와 결속 |
| `myeonghaCommitSha`, `sajuCommitSha` | 승인/배포 SHA 결속 |
| `challengeDigest` | 명시적 도메인 분리 + 위 필드의 정형 직렬화를 해시한 식별자 |
| `issuedAtMs`, `expiresAtMs` | 운영 검증 시각 기준 단기 만료, Evidence TTL ≤ 60초 제약 유지 |
| `state`, `consumedAtMs`, `revokedAtMs` | `ISSUED → CONSUMED` 또는 `REVOKED/EXPIRED` 비가역 상태 |
| `issuerRef`, `auditRef` | 외부 발급 권한·감사 증빙 참조만 저장 |

- 조회는 Challenge 발급자가 승인한 scoped Ledger에서만 수행하며, `expectedChallengePermitId`와 `expectedChallengeDigest`는 **같은 durable row에서 함께** 확인한다. 클라이언트 제출값을 기대값으로 재사용하지 않는다.
- Challenge 원본, Manifest/Plan, Permit identity, 검증 Evidence의 `challengeDigest` 및 유효 시각을 다시 비교한다.
- 상태 소비: 권한이 제한된 ledger 역할의 **조건부 단일 원자 UPDATE**(`state=ISSUED`, 동일 환경/Permit/digests/SHAs, 시간 유효, 아직 미소비)에서 정확히 1행만 성공. 동시 소비 둘 중 하나는 실패, 두 번째 호출은 거부.
- 서명 검증·독립 probe/증빙 검증에 실패한 Challenge는 정책에 따라 폐기/거부하되, 최초 실패를 성공으로 되돌리거나 자동 재발급으로 우회하지 않는다.
- COMMIT 응답 불명확이면 `UNKNOWN/HOLD`: 외부 감사자가 저장소 상태를 확인하기 전까지 **재시도 및 Runner 진입 금지**.
- **서로 다른 Admission DB에 존재하는 Permit 소비와 Challenge Ledger 소비는 단일 원자 트랜잭션이라고 가정하지 않는다.** 각 저장소의 상태/보상 불가/장애 복구를 기록하고 재실행 금지로 봉쇄한다.
- consumed Challenge를 재사용한 유효 Attestor 서명도 거부. Attestor의 관찰 시각과 검증 순간의 대상 drift/철회 여부를 다시 확인한다.

## 5. 기존 코드에 연결할 때 필수 경계 (현재 연결하지 않음)

1. 승인된 Custody provider가 Root pin·key id·revision floor를 **서버 측 trusted input**으로 제공하고, 기존 `verifySajuHeldStagingAuthorityRegistryV1`의 결과는 여전히 `VALID_FOR_SUPPLIED_ROOT`로만 취급한다.
2. 승인된 Challenge ledger가 Permit-scoped row에서 `expectedChallengeDigest`/`expectedChallengePermitId`를 검증·소비한다. 단순 문자열 일치는 이전 3-03 수준의 주장 검사다.
3. 오직 독립 probe 및 승인된 감사 기록과 연결한 다음 단계에서만 운영 trust status를 독립적으로 판정할 수 있다. **V1 보고서의 `NOT_VERIFIED`/false 상수를 변경하지 않는다.**
4. `StagingTargetAuthorityPortV1.assertIsolatedStagingTarget({sourceProofOrigin})`에 운영 PASS를 boolean으로 주입하지 않는다. Target Authority V2 검토와 실행 승인 이후 별도의 좁은 인터페이스가 필요하다.

## 6. 필수 부정/장애 시험

| 사례 | 기대 |
|---|---|
| Self-owned Root pin, Root ID/Fingerprint drift | BLOCK/HOLD |
| Registry revision downgrade, 동시 상향 갱신, 재시작/백업 복구 롤백 | floor 감소 불가; 불확실 시 HOLD |
| Key purpose 혼용, 만료·철회·회전 직전/후 | BLOCK/HOLD |
| Permit A의 Challenge를 같은 Digest 대상 Permit B에 재사용 | BLOCK/HOLD |
| Challenge nonce 중복, 만료, SHA/Plan 변경, Environment 변경 | BLOCK/HOLD |
| Challenge 원자 소비 동시 경합, 재사용, 폐기 후 재소비 | 성공 최대 1회 |
| Ledger/KMS 네트워크/시계/권한 장애 및 COMMIT 응답 불명 | 자동 재시도 없음; HOLD |
| Attestor가 자체 작성한 Fake DB/Auth/Proof Evidence | 실환경 독립 관찰로 인정하지 않음 |
| Challenge는 소모됐으나 Admission DB Permit이 소모되지 않음(역방향 포함) | 브릿지 실행 실패/HOLD 및 수동 감사, 자동 보상/재시도 없음 |

기존 `test/saju-held-staging-target-trust-v1.test.ts`의 합성 Permit 교차재사용/Root 변경 검증은 재사용한다. 후속 저장소 CI 테스트는 기존 scoped PG15/PG17 CI suite를 **확장**하고 별도 Actions workflow를 만들지 않는다.

## 7. 3-04-02 단계 종료 판정

- **A — 설계:** 신뢰 입력·주체·스토리지 계약·접근 권한·레이스/사고 정책·테스트 매트릭스 문서화.
- **B — 검증:** 위험 반례와 기존 Registry/Permit/Evidence 간 상충 여부 리뷰, 변경 범위 CI 및 필요 시 exact-head integration.
- **C — 기록:** `Watchtower-Track: saju-bridge` 포함 PR 병합과 `main` 반영 확인.
- **D — 운영 준비:** 별도 Root pin fingerprint, custody 경로, 키 관리·durable 저장소·독립 승인자 정보에 대한 실환경 증빙 R01–R04. **아직 NOT_VERIFIED.**
- **E — 실행:** 3-04-03 검증 → 3-04-04 게이트 → 별도 승인 2D-4에만 속함.

**문서 PR의 A/B/C 통과는 D/E가 아니다.**

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
