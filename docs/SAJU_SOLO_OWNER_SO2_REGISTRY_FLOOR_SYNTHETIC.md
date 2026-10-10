# SO-2 — 단일 Owner 독립 Registry 서명·단조 Floor 합성 검증

Watchtower-Track: saju-bridge

> **상태:** 코드/CI 단계. 실운영 키·KMS·DB 권한·독립 high-water anchor·Root 출처·Runner 인가는 전부 미검증. 이 문서/CI의 어떤 결과도 `stagingAdmission=HOLD`와 `canRunOnce/canExecute/canPublish/canSell=false`를 변경하지 않는다.

## 1. 배경 — 기존 신뢰 공백

기존 `saju_custody_ci.advance_floor`는 호출자가 Root ID, pin, revision을 전달하면, **외부에서 서명 검증이 선행되어야 한다는 가정하에** 단조 증가만 검사한다. PostgreSQL 함수가 Registry 서명/키 출처를 확인하지 않으므로, floor 역할의 임의 입력을 운영 Root 권한으로 취급하면 안 된다.

SO-2는 **순수 서명 검증 → 별도 검증완료 Receipt 주장 → 원자적 floor·회복 high-water 갱신**을 합성 시험으로 연결한다. 실제 독립 출처와 장애 복구 능력을 확보하는 단계는 여전히 뒤에 있다.

## 2. 검증 경로

```text
서버가 지정한 Environment (API request 지정 금지)
  → 보안 provider에서 pinned Root SPKI SHA256 / Key ID / minimum floor 조회
  → 보안 provider에서 비교 시각 조회
  → canonical Ed25519 Registry signature 검증
  → 환경 / Root ID / fingerprint / signed revision>=floor / 만료 검증
  → 정형 Registry SHA256 digest 및 CAS 기대 바닥 revision 생성
  → 전용 verifier 계정으로 검증완료 Receipt 기록 (CI에서는 주장만 모델링)
  → 별도 consumer 계정이 Receipt+Root+Env+Digest+revision 비교
  → PostgreSQL 트랜잭션: receipt 잠금 → Root pin/철회/저장 floor 확인
                          → recovery high-water 확인 → floor 최고 revision
                          → high-water 증가 → Receipt APPLIED 전환
  → 단 한 번의 ACK 또는 HOLD
```

- `apps/api/src/saju-held-staging-registry-floor-v1.ts`는 포트 기반이고, **현재는 전혀 배포/서비스 실행 경로에 연결하지 않는다.**
- 포트가 제공하는 Root pin, 시간, ACK가 실제로 신뢰 가능한 출처인지 **순수 TypeScript만으로 증명할 수 없다.** 공격자가 세 포트 메서드를 모두 위조하면 결과는 표면상 claim-consistent일 수 있으므로 결과 이름도 `SIGNED_CLAIM_WRITE_ACK_UNVERIFIED_CUSTODY`이며, 운영 Root 권한은 항상 `NOT_VERIFIED`.
- PostgreSQL의 `record_claim`은 verified 역할이 이미 서명을 확인했다는 **주장만 받아들인다**. DB가 Ed25519 서명 자체를 검증하지 않는다. 검증자 서비스 ID/IAM 실제 강제와 함수 호출 연결은 이후 실제 운영 단계의 독립 검토가 필요하다.

## 3. 최소 권한·상태

| 역할 | 허용 | 거부 |
|---|---|---|
| Root pin reader | pinned Root 및 최소 floor, 철회 상태의 인증된 조회(운영 미래) | Root 수정/키 서명 |
| Signature verifier | Ed25519 Registry 검증 후 digest가 결속된 Receipt 발급 요청 | floor 직접 UPDATE, Runner 실행 |
| Floor consumer | 검증 Receipt 하나를 조건부 원자 소비·상향 floor 갱신 | Receipt 발급, Root 변경, 무관한 revision 변경 |
| Revoker | Root의 비가역 revoked=true | sign/복구/승인 우회 |
| 앱/CI/챗봇 | 합성/코드 검증 | Root/운영 DB key·승인 권한 |

- CI는 3개 `NOLOGIN` 역할과 `SECURITY DEFINER` 함수로 테스트하며 실제 GRANT/운영 migration은 **없다**.
- Receipt 상태는 `VERIFIED_CLAIM → APPLIED` 단방향. 같은 UUID/재사용·다른 digest/환경/Root/버전은 거부한다.
- `minimum_revision`은 `highest_revision`보다 작으면 모든 증가 거절. **테스트의 highest revision은 같은 격리 DB의 별도 테이블이므로 오프사이트 WORM/복구 불변 증명은 아니다.**

## 4. 장애·경합·복구

| 상황 | 반응 |
|---|---|
| 서명 위조·pin/Root/환경 위조 | Ledger 호출 없이 HOLD |
| Registry revision 낮음·서명 후 bytes 변형·만료 | Ledger 호출 없이 HOLD |
| concurrent receipt 소비 | 최대 1건 원자 성공, 이후 실패 |
| 후보 서명 검증 후 현재 floor가 변경 | 원자 CAS 거절, 재시도 허가 없음 |
| Root revoked | 이미 발급된 Receipt도 소비 거부 |
| 트랜잭션 rollback | 원장·floor·Receipt 소비 모두 되돌려짐 |
| 백업에서 floor만 낮아진 상태 | 외부 high-water에 해당하는 **합성** anchor보다 낮으면 HOLD |
| 저장소 응답/COMMIT 불명·네트워크 장애 | HOLD, 동일 원장/Permit 자동 재시도 금지 |
| 공격자가 자기 Root + pin + Ledger 포트를 모두 위조 | 비운영 `UNVERIFIED` 주장은 가능해도 rootAuthority/실행 false 유지 |
| 2개 DB의 Challenge/Admission 부분 COMMIT | 여기서 원자성을 주장하지 않으며 후속 감사/HOLD |

## 5. CI 및 인수 기준

- TypeScript: `test/saju-held-staging-registry-floor-v1.test.ts` — Ed25519, expiry, scope drift, 복구 floor, revocation, UPDATE/ACK 불명, 공격자 자기 신뢰 Root.
- PostgreSQL: `test/db/fixtures/saju_so2_registry_floor_ci.sql` + `test/db/saju_so2_registry_floor_authority.sh` — NOLOGIN/ACL, Receipt 역할 분리, 조건부 floor 갱신, 동시 소비, 재생, 롤백, 합성 복구 anchor, revoke.
- 기존 `test/db/run_authority_core.sh` 격리 DB 실행 케이스 재사용. 새 workflow·운영 migration·Cloud 리소스 없음.
- 코드/테스트 성공은 **SO-2 합성 메커니즘 검증**까지만 의미한다. Signed Registry + ACK는 승인된 관리 평면·복구·철회·시간 source attestation의 실제 독립 검증을 뜻하지 않는다.

## 6. 운영화 전 반드시 남은 작업

1. 단일 인간 Owner의 행위별 강인증 및 앱/CI와 분리된 IAM/workload identity 검증.
2. Root 비반출 KMS 또는 이에 준하는 독립 custody, 운영 pin 초기 승인·키 회전·철회·로그.
3. Registry 조회/서명 검증과 Floor Receipt 발급을 **서로 위조 불가능한 신뢰 경계**에 결속. CAS 함수 호출 주체를 operating verifier만으로 강제.
4. 원장 영속성/멀티 노드/백업 복구/외부 immutable high-water/unknown COMMIT 사고 매뉴얼 실측.
5. R01–R14 실제 Auth/DB/HTTPS/Proof·Attestor 독립 관찰과 소유자 승인, Target Authority V2/Runner 별도 gate.
6. 실제 자원/KMS 생성·유료 비용·네트워크 연결은 사용자님의 명시적인 개별 승인 전까지 실행하지 않는다.

## 7. 종료 상태

```text
rootAuthority=NOT_VERIFIED
signerAuthority=NOT_VERIFIED
operationalEvidence=NOT_VERIFIED
stagingConnection=NOT_VERIFIED
stagingAdmission=HOLD
canRunOnce=false
canExecute=false
canPublish=false
canSell=false
```
