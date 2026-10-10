# 8C-2B-2D-3-04-03A — 독립 실환경 증빙 R01–R14 접수 계약 (코드/합성 검증)

Watchtower-Track: saju-bridge

> **1인 운영 전환 설계:** [1인 Owner·분리된 보안 권한 설계 v0.1](./MYEONGHA_SOLO_OWNER_SEGREGATED_AUTHORITY_ARCHITECTURE_V0_1.md). 기존 본문의 사람 2명 승인·이중 확인은 **기존 구상**이며 단일 Owner·행위별 재인증·보안 계정/키/서비스 신원 분리 설계로 교체한다. 실제 관리 평면의 강제 정책·복구·증빙이 검증되기 전 운영 허가는 그대로 HOLD. 서비스 ID가 2개라도 인간 2인 검토로 주장하지 않는다.

> **범위:** 오직 합성·비밀 아닌 참조 메타데이터의 완전성 검사. 실제 Staging 네트워크 접근, Auth/DB/Saju probe, 키 또는 Secret 발급, Operator/Attestor 승인, 서명 생성, Runner 실행, DB Migration/GRANT, Production/Commerce 변경 **없음**. 문서/코드/CI 성공은 R01–R14 사실 증명이나 권한 부여가 아니다.

## 1. 목적

3-04-01 런북의 R01–R14를 실제 운영 환경에서 취합할 때, 누락·중복·다른 환경/Manifest/Connection Plan/배포 SHA·잘못된 종류의 증빙 참조를 **접수 시점에 차단**한다.

서버 전용 순수 함수 `assessSajuHeldStagingEvidenceIndexV1`:
- 기존 `parseSajuHeldStagingTargetManifestV1`, `parseSajuHeldStagingConnectionPlanV1`, `assessSajuHeldStagingConnectionPlanV1`를 재사용.
- 14개의 정확한 ID(R01~R14)와 런북 단계별 `sourceKind`를 요구.
- 환경 ID, Manifest/Plan digest, MyeongHa/Saju 두 SHA를 검증된 비밀 아닌 목표 계약과 일치 비교.
- 증빙 원본 대신 SHA-256 참조값, 감사 식별자, 수집자·심사자 ID, 주장된 수집 시각만 접수. 원문 Secret/URL/토큰/개인정보를 결과로 절대 반환하지 않음.
- 수집자 ID와 심사자 ID가 같거나, 원본/감사 참조가 중복되거나, 미래 시각/모르는 필드/비정상 객체이면 거부. **ID가 다르다고 인간 2명 또는 독립 관찰이 입증되는 것은 아니다.** 인간 Owner가 1명인 경우 분리된 시스템 principal/키·증빙 출처를 별도 실증해야 한다.
- 14개가 모두 일치해도 결과는 **`INDEXED_UNVERIFIED`**, `evidenceProvenance=NOT_VERIFIED`, `operationalEvidence=NOT_VERIFIED`, `stagingAdmission=HOLD`, 모든 실행·발행·판매 boolean은 false.
- 이는 정적 참조 인덱스이며 **증빙 내용·진실성·서명·독립 관찰·실제 존재/보관·관리자 권한·trusted clock을 검증하지 않음**. 검사 결과를 Target Authority V1/V2 Runner에 전달하지 않음.

## 2. R01–R14 접수 출처 코드

| ID | 접수에 요구할 sourceKind | 실제 출처를 독립 입증해야 하는 후속 단계 |
|---|---|---|
| R01 | `ROOT_CUSTODY` | 독립 Root pin·키 custody |
| R02 | `REGISTRY_ROLLBACK_LEDGER` | revision floor·철회/복구 |
| R03 | `OPERATOR_APPROVAL_LEDGER` | 실제 Operator 권한·Permit |
| R04 | `CHALLENGE_LEDGER` | 발급·원자 소비·재사용 금지 |
| R05 | `AUTH_MANAGEMENT_PLANE` | Auth Project/Member 분리 |
| R06 | `SUBJECT_DB_TLS_PROBE` | Subject DB TLS/cluster |
| R07 | `SUBJECT_DB_PRIVILEGE_PROBE` | Subject DB role/ACL/RLS |
| R08 | `NONCE_DB_ISOLATION_PROBE` | Nonce DB |
| R09 | `ADMISSION_DB_ISOLATION_PROBE` | Admission DB |
| R10 | `PROOF_INGRESS_PROBE` | Saju HTTPS ingress |
| R11 | `PROOF_KEY_CUSTODY` | Bearer/HMAC 회전·분리 |
| R12 | `DEPLOYMENT_ATTESTATION` | 두 배포 SHA·Manifest/Plan |
| R13 | `TEST_MEMBER_ACCESS_PROBE` | 폐기형 Member/Birth 접근 |
| R14 | `ROLLBACK_DRILL_RECORD` | 사고/철회/복구 리허설 |

`sourceKind`는 **입력값인 문자열**일 뿐 출처의 독립성을 보장하지 않는다. 수집·승인 평면 분리 및 실제 증빙 검증은 별도 운영 승인 후 실행한다.

## 3. 부정 테스트와 연결 규칙

- 합성 인덱스 완전성, R01–R14 각각 누락/출처 치환, hash·audit 재사용, 다른 Permit이 아니라 다른 배포/환경 digest/SHAs 혼입, 동일 collector/reviewer, 시각 조작, 구문 필드 주입, 임의 prototype, 예상치와 다른 plan 등.
- 변경 경로: `apps/api/src/saju-held-staging-evidence-index-v1.ts`, `test/saju-held-staging-evidence-index-v1.test.ts`와 본 문서 및 로드맵 진행 표시만.
- 기존 scoped `saju-bridge` CI 및 SHA 고정 통합 CI 사용. 새 워크플로 금지.
- **운영 미완료 조건:** 실제 R01–R04의 Root·Revision·Challenge 연결, R05–R14 독립 probe와 attestor 서명, 독립 관리 평면 감사·승인, 실제 스테이징 결과 및 회수.
- 정확한 계약 서명과 Target Evidence V1 구조 검증은 기존 3-03 모듈 책임이며 여기에서 재구현하지 않는다.

## 4. 종료 판정

- A: R01–R14 정확한 키/출처 유형, immutable target binding, redacted fail-closed 인덱스 코드.
- B: 합성·부정 테스트, scoped CI, exact-head Integration.
- C: HEAD/BASE 확인, squash merge, `main` 포함 확인.
- D: **독립 실환경 수집과 검증은 NOT_VERIFIED**.
- E: **Runner·Production·Commerce는 HOLD**.

다음: 3-04-03B 실제 Auth/DB/Proof probe는 3-04-02의 독립 관리자·신뢰 루트 및 실환경 접근 승인 후 진행. 단순 인덱스 자체를 실환경 검증 완료로 대체하지 않는다.
