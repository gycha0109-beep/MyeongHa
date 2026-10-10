# MyeongHa 1인 운영 보안 거버넌스 — Solo Owner / Segregated Authority 설계 v0.1

Watchtower-Track: saju-bridge

> 상태: **설계 확정 후보 / 운영 적용 전 HOLD.** 이 문서는 현재 3-04-01/02의 사람 2인 승인 정책과 충돌하는 부분을 해결하기 위한 **1인 운영 대체 정책 설계**다. 문서/PR 병합 자체로 기존 실운영 조건을 우회하지 않는다. KMS·운영 루트·Cloud 계정·Secret·DB GRANT·실환경 probe·Runner·판매·릴리스 활성화는 수행하지 않는다.
>
> 관련 문서: SAJU_HELD_STAGING_INDEPENDENT_TRUST_CUSTODY_8C2B2D30402.md, SAJU_HELD_STAGING_OPERATIONAL_EVIDENCE_RUNBOOK_8C2B2D30401.md, SAJU_HELD_STAGING_EVIDENCE_INDEX_8C2B2D30403A.md, SAJU_HELD_STAGING_COMPLETION_ROADMAP_8C2B2D.md.
>
> 의사결정: **최종 책임과 업무상 승인 주체는 인간 Owner 1인**이다. 다만 서비스 계정/자격증명/키 사용 주체/검증·감사 기록의 신뢰 경로를 분리한다. **두 개의 서비스 계정이나 두 AI 에이전트를 2명의 사람으로 취급하지 않는다.**

## 1. 범위, 기존 정책과의 차이

| 축 | 기존 3-04-01/02 표현 | 1인 운영 대체 설계 | 거짓으로 주장하면 안 되는 것 |
|---|---|---|---|
| 인간 최종 책임자 | 관리 주체 2인 이상 | 단일 인간 Owner | 2인 독립 심사 완료 |
| 승인자 | 사람 두 명의 이중 확인 | Owner의 피싱 저항 인증 + 행위별 의도 확인, 위험도별 지연/복구 절차 | 운영자가 서로 독립 |
| Root custody | 앱 외부 운영 보안 관리자 | 앱 외부 전용 보안 계정·하드웨어/관리형 키 보관, Owner 최종 소유 | Root가 어떤 IAM 권한으로도 변경 불가 |
| Operator signing | 승인 역할 분리 | 독립 Operator 키·전용 서명 서비스; Owner 승인 이벤트 없이는 서명 불가 | 앱 자체 발행이 진짜 Owner 서명 |
| Attestor | 독립 관찰 운영자 | 앱 런타임 밖 제한된 read-only 검증 워커·다른 워크로드 신원 | 다른 사람이 실제 증빙을 검토함 |
| Registry/floor/challenge | 독립 관리 저장소 | 보안 계정 내 독립 DB/원장·단조 floor·일회성 ledger, 서비스별 권한 최소화 | 단일 클라우드 관리자 탈취를 견딤 |
| 실행 | 별도 승인 후 Runner | 향후 별도 Target Authority V2 + 단발 소모 토큰, 단계별 HARD HOLD | 이 문서만으로 Runner 실행 가능 |
| 감사/복구 | 독립 운영자 | 외부 append-only/WORM 로그 + 별도 복구 자격증명·Owner 수동 판정 | Owner를 포함한 모든 공격자에 대한 불변성 보장 |

위 표는 **기존 2인 승인 조항을 즉시 비활성화하는 변경 명령이 아니다.** 실운영 정책 교체, 보안/운영 계정 보호 실증, acceptance gate 통과 및 별도 명시적 실행 승인이 완료될 때까지 기존 실행 HOLD를 유지한다.

## 2. 위협 모델 및 허용 범위

### 보호 자산
- Root의 신뢰 지문, Root 및 Operator/Attestor 개인키, key purpose와 revocation.
- 고정된 Manifest/Connection Plan digest 및 MyeongHa/Saju 두 commit SHA.
- Registry 최고 승인 revision 및 철회 목록, Permit V2, Challenge nonce/소비 이력, Admission 원장.
- 스테이징 Auth·Subject DB·Nonce DB·Admission DB·Saju Proof 경계, R01–R14 운영 증빙, 감사 이벤트.
- Production 사용자 정보·결제·배포 권한은 별도 Authority이며 이 브릿지의 승인 범위 밖이다.

### 반드시 방어할 공격
- CI/GitHub PR·챗봇 출력·API 요청의 가짜 승인자가 Root pin이나 revision floor를 지정.
- 서명이 수학적으로 유효하지만 공격자가 자체 발급한 Root/Registry/Attestor/Permit.
- 서비스 계정 탈취로 인한 서명용 키 직접 호출, Operator와 Attestor purpose 혼용, 임의 Root 변경.
- 기록 삭제·백업 복구로 revision 감소, key revoke 무시, 오래된 Evidence/Challenge 재생.
- 두 DB 사이의 부분 COMMIT, 결과 미확인, 재시도 경합, 승인 후 배포 drift.
- 보안 담당자인 단일 Owner의 피싱·기기 분실·자격증명 탈취·Cloud 최상위 권한 탈취.

### 명시적인 한계와 보완
- **한 명의 인간으로 사람 2명의 상호 견제를 재현할 수 없다.**
- 동일 Owner가 보안 계정의 최고 권한까지 갖고 있다면, 모든 계정 경계는 최종적으로 동일 개인의 탈취·실수에 영향을 받는다.
- 완화: 패스키/하드웨어 인증기, 2개 이상의 독립 접근 수단, 보안 계정과 앱 운영 계정 분리, Root 비반출, 지연 적용, 강제 로그·경보, 오프라인 복구, 운영 변경 최소화. 이는 위험을 줄이지만 위 한계를 제거하지 않는다.
- 외부 법적·규제·계약상 실질적 2인 통제가 요구되는 단계라면 **정책 예외가 아니라 실제 외부 공동 승인자를 도입**하거나 해당 기능을 계속 HOLD한다.

## 3. 논리 아키텍처: 사람 1인, 신원과 신뢰 경로 다중 분리

~~~text
[OWNER (인간 1명)]
  | 패스키/하드웨어 인증 + 행위별 확인
  v
[OWNER CONTROL PORTAL / 정책 관리 평면] --감사--> [변경 방지 감사 저장소]
  | 서명된 Owner 승인 의도 기록
  v
[SECURITY/CUSTODY PLANE — 별도 계정/신뢰 도메인]
  |  Root pin + Registry high-water floor + revoke registry
  |  Operator signing key (non-exportable) + 승인 기록
  |  Attestor signing key (다른 purpose, 별도 호출자)
  |  Permit-scoped one-time Challenge ledger
  |  승인 상태·발급 내역·감사 포인터
  v
[VERIFIER / ATTESTOR — 독립 읽기 전용 신원]
  |  관리 평면 + Auth/DB/Proof 실제 관찰
  |  R01–R14 근거, Manifest/Plan/SHAs, 신뢰 시각 재확인
  v
[TARGET AUTHORITY V2 — 향후 설계; 현재 미연결]
  |  실증된 신뢰·Owner 의도·Permit·Challenge·revocation·drift
  v
[ONE-SHOT RUNNER — 향후 별도 승인; 현재 비활성]
  |
[MyeongHa + Saju Staging — 별도 계정/자격증명/데이터]
  |
[Production / Commerce — 별도의 독립 출시·결제 승인; 자동 승격 금지]
~~~

### 신뢰 경계 원칙

1. 앱 API/브라우저 요청/GitHub PR/CI/AI 에이전트에는 **Root pin 교체, floor 초기화, Operator·Attestor 개인키 다운로드, RunOnce 발급 권한이 없다.**
2. Root 공개키의 fingerprint는 애플리케이션이 제출한 같은 Evidence 번들에서 읽지 않는다. 별도 보안 계정의 **허용 목록 고정/읽기 전용 경로**에서만 읽는다.
3. Owner의 허가 의도는 인증된 행동의 조건이다. 단순 로그인 세션, 채팅 지시 또는 코드 병합을 운영 실행 승인으로 간주하지 않는다.
4. Operator 서명 서비스와 Attestor 증빙 워커는 **서로 다른 서비스 identity, 키, 권한, 실행 환경**을 사용한다. 인간 Owner는 같아도 기술 주체와 감사 이력은 다르다.
5. 별도 클라우드 프로젝트나 DB 이름만으로 물리적 독립·RLS·TLS·역할 분리의 실증을 대신하지 않는다.
6. 현재 V1 Trust/Root preflight의 SIGNED_ASSERTIONS_UNANCHORED 및 PINNED_SIGNED_CLAIM_UNVERIFIED_CUSTODY는 끝까지 **비운영 주장**이다.

## 4. 권한 및 키 소유 매트릭스

| 주체 | 허용 | 금지 | 자격증명 배치 |
|---|---|---|---|
| Owner-Human | 정책 수립, 위험도별 승인, 긴급 중지, 수동 감사 결론 | API 키로 자동 운영 실행·결제 우회 | 피싱 저항 패스키 + 분실 대비 보조 인증기/오프라인 복구 |
| Owner-Control-Portal | Owner 의도 확인, scope·SHA·TTL·행위 해시 동결, 요청 접수 | Root private key read, 직접 Runner 실행, 자체 승인 | 별도 admin origin 및 최소 권한 |
| Root-Custody | Root pin·Registry trust anchor 보호, 거부 목록, 고수위 revision 유지 | 앱 트래픽 처리, 임의 target 관찰 | 독립 보안 계정; Root 비반출·오프라인/비대칭 KMS 정책 |
| Operator-Signer | 승인된 정확한 Permit V2 digest에 대해서만 서명 | 임의 환경/SHA로 서명, Attestor purpose 사용 | Owner event 재검증 후 제한된 sign 전용 identity |
| Attestor-Worker | read-only 실제 대상 관찰, Challenge 결속 Evidence 서명 | Owner 승인, Root 수정, Permit 발급, 앱 자기증빙 대리 | 별도 workload identity/네트워크 정책 |
| Custody-Reader/Verifier | 최신 pin/floor/revoke 읽기, Registry Ed25519 검증 | floor 감소, pin 교체, KMS sign | 최소 권한 read-only identity |
| Floor-Writer | 검증된 상향 revision으로만 조건부 원자 갱신 | floor 삭제·감소·초기화 | 서명 검증 완료를 강제하는 제한된 서비스 |
| Challenge-Issuer | 전용 ledger에서 256비트 이상 난수/Permit 결속 challenge 발급 | ledger row 위조, consumed/revoked 재발급 | 별도 발급 credential |
| Challenge-Consumer | 정확한 scope가 일치하는 ISSUED 행 원자 소비 | 발급·수정·삭제·재발급 | 별도 소비 credential |
| Admission-Consumer | 해당 Permit의 독립 DB 상태 원자 소비 | Challenge 재발급, 다른 Permit 소비 | 기존 Admission V2 제한 역할 |
| Audit-Writer | 비밀 아닌 서명/결과 참조와 오류 이벤트 append | 삭제, 과거 이벤트 수정 | write-only credential/retention |
| Runner | 별도 실행 승인 후 지정 대상 단 한 번 사용 | KMS sign, 원장 rewrite, Production publish/sell | 추후 Target Authority V2를 통한 단회 권한 |
| CI / GPT / GitHub / Vercel | 코드·합성 테스트·배포 후보 검증 | Root/Operator/Attestor private key, 실환경 Permit 소비·Runner 승인 | 운영 보안 계정 credential 없음 |

**소유자 1명은 허용하지만 모든 역할을 동일 자격증명·서비스 계정으로 구현하는 것은 금지.** Owner가 root IAM 최고 관리자일 경우 잔여 단일 실패 지점을 감사/복구 계획에 표시한다.

## 5. 사용자 작업 승인 등급

| 등급 | 대상 | 요구 승인 | 자동 처리 범위 | 결과 |
|---|---|---|---|---|
| P0 무권한 | 문서·합성 테스트·CI·PR | 코드 변경·병합에 대한 기존 작업 승인 정책 | 테스트·검사·문서 갱신 | 운영 HOLD 불변 |
| P1 저위험 운영 | 읽기 전용 상태 점검·사용량/로그·증빙 인덱스 | 최초 read-only 계정 연결 시 Owner 승인 | 기간 내 수집·비밀 마스킹·알림 | 권한 승격 없음 |
| P2 제한된 Staging | 승인된 환경과 scope의 읽기 전용 probe, 제한된 검증 자원 준비 | Owner의 **행위별 패스키 재확인** + 정확한 환경/예산/기한/폐기 정책 | 스냅샷 고정, 검증, 로그, 실패 차단 | 검증 PASS는 실행 승인 아님 |
| P3 실행권 | 격리 Staging 2D-4 단일 리허설, 단발 Permit | Owner의 행위별 재인증 + 실제 Root/키/증빙/R01–R14·V2 및 replay/드리프트 검증 | 일회성 scope·challenge 소비·감사 | 모든 필수 증빙 충족 전 HOLD |
| P4 고위험 | Root 교체·최상위 IAM·복구·키 폐기 정책 변경·Production/Commerce 공개 | Owner의 별도 강인증 + 변경 내용 독립 재확인 + 사전 경보/기본 지연·복구 경로 테스트 | 자동 차단·변경 기록·이상 탐지 | 위험 통제가 불충분하면 보류 |
| P-STOP | 사고 시 실행 중지·키 철회·원장 차단 | Owner 또는 제한된 자동 kill-switch 조건 | 즉시 차단, revoke, 감사 경보 | **절대 실행 허가로 바뀌지 않음** |

- 등급은 **새 정책 제안**이며 현재 코드가 P2/P3 권한을 구현했다는 의미가 아니다.
- P4의 지연·별도 인증 수단은 실제 보안 계정에서 정책을 구현·검증한 후 적용한다. 긴급 차단은 지연시키지 않는다. 외부 승인 2인 요구사항이 계약상 필수라면 P4를 사용자 1인만으로 실행하지 않는다.
- Owner의 1회 웹 로그인, GitHub 승인/병합, 채팅의 “진행”은 P2/P3/P4의 행위별 운영 허가가 아니다.
- 예산 초과·자원 증설·유료 관리형 서비스 생성은 별도 비용 확인까지 STOP/HOLD.

## 6. Owner 의도 토큰 및 Permit 연결

**Owner 의도 기록의 최소 필드(제안):**

~~~text
intentId, ownerSubject, actionClass(P0..P4/P-STOP), environmentId,
permitId?, manifestDigest?, connectionPlanDigest?,
myeonghaCommitSha?, sajuCommitSha?,
requestDigest, issuedAtMs, expiresAtMs,
authMethod, authEventRef, policyRevision, revokedAtMs?,
auditEventRef
~~~

- 암호학적 난수 challenge를 가진 **행위별 확인**으로 Owner 인증을 재검증하고, 요청/환경/대상 SHA·Permit 범위의 해시를 표시·고정한다. 확인 이후 값 변경 시 새 승인이 필요하다.
- 패스키/WebAuthn은 *Owner가 원문 scope를 확인하고 인증했다는 이벤트*를 증명한다. WebAuthn 자체를 기존 Permit V2 Ed25519 서명으로 치환하지 않는다. Permit은 별도의 Operator sign 전용 키로 발급한다.
- 로그인·리프레시 토큰은 승인 토큰이 아니다. Owner intent는 짧은 TTL, 재사용 금지, 별도 audit reference를 갖는다. 단일 scope 허가를 다른 Permit/환경에 재사용하지 않는다.
- Owner 승인 로그와 Operator 서명은 서로 다른 감사 단계로 기록하되, 같은 사람이 Owner/관리자인 사실을 숨기지 않는다.
- 기존 Permit V2·Target Evidence V1의 wire 계약은 유지. 신규 Owner intent는 독립 제어 평면에 두고 **추후 별도 authority 규약**으로 바인딩한다. 기존 V1 boolean 포트에 연결 금지.

## 7. Root·Registry·Floor의 신뢰 체인

1. **초기 핀:** 보안 계정에서 승인된 Root 공개키 SPKI SHA-256, keyId, environmentId, pinVersion, custodySourceRef를 독립 기록. Private key는 비반출 보관. 등록 이벤트에 Owner 강인증·감사 해시가 남아야 한다.
2. **조회:** 읽기 전용 인증된 custody provider가 pin/floor/revocation을 반환. API/Evidence/PR/Target app 제공값은 trusted 입력이 될 수 없다.
3. **검증:** canonical Registry byte 서명과 Root purpose·환경·시간·키 유효성·철회 확인. 현재 V1 검증기는 제공된 Root만 확인하므로 custody provenance를 보증하지 않는다.
4. **단조 인상:** 검증된 revision을 floor보다 작게 쓰거나 floor를 감소/리셋할 수 없다. 조건부 update와 외부 감사 event는 반드시 성공·확인 가능해야 한다.
5. **실패/불명확:** old snapshot, stale read, DB 장애, 재시작·백업 복구 불일치, Root rotation 중 race, unknown commit은 **HOLD**. 임의 재인상·캐시 우회·silent 재시도 금지.
6. **교체:** 새 Root anchor는 P4. 기존 revocation 확인, 유지/상향된 floor, 교체 전후 키 지문 및 감사 참조, rollback 방지를 전부 검증. Root pin 교체를 일반 deploy/CI에 맡기지 않는다.
7. **복구:** 최신 외부 immutable/audit anchor와 복원된 floor를 대조하고 Owner가 수동 판정한다. 감사 신뢰도가 낮으면 새로운 P3 이상 승인 거절.

**불변식:** rootAuthority는 실제 출처·custody·지문·서명·revision 최신성·재해복구까지 실증하기 전 **NOT_VERIFIED**.

## 8. Challenge·Admission·Runner의 분산 실패 규칙

- Challenge는 environment + Permit ID + Manifest/Plan digest + 두 SHA + nonce(256비트 이상) + 만료·상태에 결속, 별도 ledger에서만 발급.
- DB 단일 UPDATE는 같은 Challenge를 두 번 소비하지 못하게 하지만, **Challenge DB 소비와 Admission DB 소비를 하나의 분산 트랜잭션으로 증명하지 않는다.**
- 최소 결과 상태(제안): DRAFT → OWNER_INTENT_CONFIRMED → SNAPSHOT_FROZEN → VERIFIED_CLAIMS → CHALLENGE_ISSUED → EVIDENCE_REVIEWED → CONSUMPTION_PENDING → CONSUMED_RECONCILED → [별도 실행권 심사].
- 실패 상태: REVOKED / EXPIRED / BLOCKED / CONSUMPTION_UNKNOWN / CROSS_DB_PARTIAL_HOLD / RECOVERY_HOLD. 모두 실행 금지.
- 분산 소비 중 하나만 완료했거나 응답을 알 수 없다면 **성공으로 보정하지 않는다.** 양측 원장을 최소권한 독립 조회해 결과를 남기고 원 Permit은 종결/폐기한다. 무조건 동일 Permit 재시도 금지.
- 추후 실제 Runner에는 **단일 실행 권한 원장(Execution Admission source-of-truth)의 원자 CLAIM**이 필요하다. 한번 CLAIM에 성공하면 재실행할 수 없고, 프로세스 crash 후에도 자동으로 새로운 Permit을 만들어 재진입하지 않는다. 정확히 한 번의 외부 효과까지 보장한다고 주장하지 않는다.
- 현 단계는 서명/저장소 합성 증명만 수행. 실제 Runner 및 Target Authority V2는 **미연결** 유지.

## 9. Attestor와 증빙 R01–R14: 동일 인간, 독립 기술 증거

- R01–R04: 보안 계정의 Root pin·Registry floor·Operator 권한/서명 감사·Challenge 원장에 대한 별도 read-only 조회. 앱 코드/Evidence 제출물을 진실의 원천으로 쓰지 않음.
- R05–R09: 분리된 Auth 프로젝트, Subject/Nonce/Admission DB 각 실제 TLS peer/클러스터/권한/RLS를 제한된 신원으로 검사.
- R10–R13: Proof TLS·Bearer/HMAC custody, 배포 두 SHA, 폐기형 Member/Birth 사용, 독립 배포/관리 평면 증빙.
- R14: revoke, kill-switch, key loss, recovery, Root rotation, 전원 중단/불명확 COMMIT의 리허설 기록.
- **분리된 서비스 ID/키/계정과 서명**은 관찰 경로를 분리할 수 있어도 2인 인간 검토는 아니다. 증빙에는 humanOwnerId(동일), collectorPrincipalId, reviewerPrincipalId, collectionSystemRef, reviewSystemRef, securityDomain, independenceLimit 기록을 추천한다.
- 기존 3-04-03A의 collectorId != reviewerId는 **문자열 불일치만 확인한다.** 실제 사람 2명이나 인프라 독립의 증명으로 승격하지 않는다. 기존 wire format을 바꾸지 않는 이 문서 설계 단계에서는 실제 independence를 평가하지 않는다.
- R01–R14의 각 Rxx가 증빙에 존재하더라도 INDEXED_UNVERIFIED이며 Owner 동의만으로 VERIFIED로 자동 승격하지 않는다.

## 10. 사고 중단, 인증기 분실 및 복구

| 사고 | 자동 반응 | Owner 조치 | 복구 전 요구 |
|---|---|---|---|
| API/Runner/CI key 누출 | 영향 role disable/세션 차단/서명 불허 | 노출 경로 확인, 필요한 키 회전 | audit + 키 목적·scope·배포 재검증 |
| Owner passkey 분실 | 신규 중요 승인 일시 HOLD | 별도 보관한 보조 인증기·사전에 정해진 계정 복구 | 기존 기기 철회, Owner 소유 증거·최신 감사 확인 |
| Owner 계정 탈취 의심 | 모든 P2–P4 신규 허가 거절 | 안전한 보조 수단에서 보안 계정 잠금 | 세션/인증기/키 전체 점검 + 서명/감사 재검증 |
| Root pin mismatch/Registry rollback | 즉시 HOLD | 변경 기록·외부 감사 anchor 비교 | 외부 참조로 올바른 키/최저 revision 회복 |
| Audit 저장소 불능/불변성 위반 | 중요 신규 승인 거절 | 보관·복원 체인 조사 | 감사 지속성 및 재해복구 재시험 |
| Challenge/Admission 부분 COMMIT | 양측 실행 금지, 자동 재시도 금지 | 독립 조회 후 원 Permit 폐기 판정 | 새 scope/새 승인/새 Challenge 검토 |
| Production 오배선/데이터 혼입 | 즉시 kill-switch 및 key revoke | 범위 격리·비밀 회전·사고 기록 | Production 안전 검증 후 신규 계획 |

- **긴급 중지는 언제나 실행 허가보다 낮은 권한/쉬운 절차로 허용**한다. kill-switch 권한은 publish/sell/runner 허가로 변환할 수 없다.
- 오프라인 보조 인증·복구 코드는 CI/코드/챗봇에 저장하지 않으며, 물리적으로 분리하여 보관한다.
- 기본 복구 정책: 안전한 보조 인증 없는 강제 key 재설정, 감사 원장 삭제, floor 초기화로 복구하는 행위는 금지. 복구 불가능한 시점은 가용성 손실로 기록하고 수동 재설계를 요구한다.

## 11. 감사 이벤트·관측 가능성·비용

모든 행위마다 비밀 아닌 감사 envelope를 기록한다.

~~~text
eventId, occurredAtTrusted, actorPrincipalId, ownerSubject?,
eventType, actionClass, environmentId, targetDigest,
registryRevision, pinVersion, permitId?, challengeId?,
result(ALLOWED_CLAIM/BLOCKED/HOLD/UNKNOWN), reasonCode,
previousEventDigest, eventDigest, externalAuditReceipt?
~~~

- append-only hash chain만으로 Owner/관리자에 의한 과거 로그 삭제를 차단할 수 없다. 별도 보안 계정의 변경 불가 보관 정책과 접근 로그/retention 및 외부 기준점을 실제로 입증해야 한다.
- 실패 이유는 reasonCode 중심. 민감한 DB URL, JWT, 개인키, 원문 Member/Birth, Secret, 비밀번호, 민감 Evidence는 GitHub Actions·Issue·PR·대화 로그에 기록하지 않는다.
- Watchtower에는 **검증 PASS/FAIL/HOLD + run/PR/commit SHA + 추적 링크**만 보고. 비용·쿼터·키 회전·권한 변경은 별도 경고한다.
- 무권한 설계·합성 CI는 기존 비용 통제 범위에서 수행. KMS·Audit/Object-lock·독립 프로젝트/DB·Auth 유료 플랜 등 과금 가능 서비스는 **예산/가격/사용량 상한을 확인한 사용자 사전 승인**까지 프로비저닝 금지.
- Provider 선택은 중립으로 유지. GitHub, Vercel, Supabase를 동일 신뢰 루트로 오인하지 않으며 선택 시 서비스 계정/IAM·WORM·키 비반출·복구 가능성의 실제 지원 범위를 검증한다.

## 12. 기존 계약의 변경·비변경 경계

**현재 그대로 유지:**
- Permit V2, Signed Registry, Target Evidence, Manifest/Plan 정형화 및 기존 signed domain.
- V1 Trust 보고서의 SIGNED_ASSERTIONS_UNANCHORED, Root preflight의 PINNED_SIGNED_CLAIM_UNVERIFIED_CUSTODY.
- rootAuthority/signerAuthority/operationalEvidence/stagingConnection의 NOT_VERIFIED.
- stagingAdmission=HOLD, canRunOnce/canExecute/canPublish/canSell=false.
- Evidence Index 03A의 INDEXED_UNVERIFIED, Runtime Runner V1의 모든 운영 boolean false.
- 기존 Auth/Subject/Saju/Nonce/Admission 독립 데이터/권한 경계와 별도 Commerce 출시 gate.

**다음 코드에서만 다룰 변경:**
- Owner intent·보안 계정 principal·독립 custody snapshot 출처 확인 인터페이스.
- trusted clock 및 revocation 조회, revision floor의 검증과 원자 인상을 결속한 storage adapter.
- 승인·증빙·Challenge 별도 source-of-truth 및 상태 머신. 오류/timeout/unknown commit 비가역 HOLD.
- 재검증된 R01–R14 실제 증빙을 입력받는 Target Authority V2 (Runner와 연결 금지 상태부터 구현).
- 기존 2인 승인·Collector/Reviewer 구분의 **출처·신원 모델**을 단일 인간 Owner + 다중 시스템 주체로 명시 변환. 기존 계약을 silent rewrite하여 잘못된 2인 독립 증빙을 생성하지 않는다.

## 12A. SO-1 합성 Owner Intent / 기술 보안 신원 계약 (운영 비인증)

- `apps/api/src/saju-held-staging-solo-owner-intent-v1.ts`: `P2_STAGING_READ_ONLY`와 `P3_STAGING_SINGLE_REHEARSAL` 두 가지 **주장된** Owner 의도만 정형화한다. P4 Root 변경·Production/Commerce 권한은 지원하지 않는다.
- Intent는 단일 환경·Manifest/Plan digests·MyeongHa/Saju commit SHA·정확한 request digest·Permit ID(P3에서만 필수)·인증 이벤트 참조·정책 revision과 최대 60초 기한에 묶인다.
- `authenticationEvent`, `expectedScope`, 여섯 개 기술 주체(`OWNER_PORTAL`, `ROOT_CUSTODY`, `OPERATOR_SIGNER`, `ATTESTOR_WORKER`, `CHALLENGE_CONSUMER`, `RUNNER`)를 각각 검사한다. 서로 다른 principal ID가 필요하며 Root/Owner/Attestor 도메인이 Runner와 분리되어야 한다. 여섯 주체의 `humanOwnerSubject`는 동일한 **한 사람**으로 명시한다.
- **모든 필드는 호출자가 제출한 합성 주장**이다. 실제 패스키 서명, 인증 이벤트의 저장소 출처, workload IAM, Root KMS custody, 감사 원장 불변성, 안전한 서버 시간은 이 함수에서 증명하지 않는다. `CONSISTENT_UNVERIFIED_ORIGIN`은 형식 일치일 뿐 승인·실행권이 아니다. 소유권·신원 검증을 오인하지 않도록 `humanReviewersVerified=0`, `ownerAuthentication=NOT_VERIFIED`, `stagingAdmission=HOLD`, 실행/판매 플래그 모두 false를 반환한다.
- 허용되지 않는 principal 결합, 잘못된 환경·Permit·SHA·digest, 만료/변조·P4 주입, 악의적 getter·prototype/secret injection은 `BLOCKED`. 기존 Registry/Permit V2·Evidence/Runner 코드와 **연결하지 않는다**. 테스트는 `test/saju-held-staging-solo-owner-intent-v1.test.ts`.

## 13. 단계별 마이그레이션 및 종료 게이트

| 단계 | 내용 | 통과 조건 | 미통과 시 |
|---|---|---|---|
| SO-0 설계 정책 | 본 문서 + 3-04-01/02 충돌 문구 명시 + 변화 영향표 | Owner 1인 책임·독립 principal·인간 독립성 한계·기존 HOLD가 명확 | 변경 적용 보류 |
| SO-1 합성 신원·권한 계약 | Owner intent→signer/attestor/custody provider 타입 및 부정 테스트 | 권한 교차 사용·비밀 유출·원문 요청 승인·시각 위조 전부 차단 | HOLD |
| SO-2 신뢰 저장소 합성 검증 | Registry signature→revision floor 단조 갱신, 예외·rollback·restore·unknown commit | 독립 DB/계정 권한, 공격자 pin/타 환경 SHA/nonce replay, 동시성/재시작 부정 검증 | HOLD |
| SO-3 운영 관리 평면 준비 | provider 후보·IAM·키 custody·백업/복구·비용·계정 장치 검토 | 별도의 **명시적 사용자 승인**, 비용 통제, Root 비반출·감사 지속성 증빙 | HOLD |
| SO-4 3-04-03B | R01–R14 실제 관찰·수집·Attestor 서명 | 출처/권한/환경 분리 및 위조 불가 증빙, 별도 승인 | HOLD |
| SO-5 3-04-04 | Target Authority V2와 실행 전 gate | 동작 도중 서명/Root/재사용/철회/드리프트·불명확 COMMIT 완전 차단 | HOLD |
| SO-6 2D-4 | 격리 스테이징 단일 리허설 | 별도 행위별 승인, 일회 실행·로그·폐기/복구 | HOLD |
| SO-7 Production/Commerce | 별도 제품·사주·결제 출시 심사 | 각 domain Authority·법/운영 책임 및 보안 독립 확인 | 계속 차단 |

**SO-0 문서 병합은 SO-3~SO-7 허가가 아니다.** 비용이 없고 실제 운영 권한을 생성하지 않는 구간까지만 사전 구현할 수 있다.

## 14. 검증 매트릭스 (설계 및 후속 테스트)

| 부정 시나리오 | 필요한 반응 |
|---|---|
| GPT/PR/CI가 Owner 동의 없이 KMS 서명 요청 | DENY + 감사 |
| API caller가 pin/floor/nowMs를 제출 | trusted custody/clock과 일치할 때만 비운영 검증, 출처 미확인=HOLD |
| 하나의 workload credential로 Root 변경 + Permit sign + attestation | 권한 거부 |
| 다른 목적 키로 Permit/Attestor 서명 | 서명 거부 |
| 공격자 Root로 위조된 self-owned Registry·pin | 독립 custody 승인으로 승격 불가 |
| Registry 낮은 revision·backup rollback·동시 update | 높은 floor 유지, 불명확 시 HOLD |
| Owner가 2개 서비스 신원으로 스스로 발급·검토 | 2인 인간 승인으로 기록 금지 |
| Owner 승인 후 Manifest/Plan/commit SHA 변경 | 기존 intent/Permit/Evidence 무효 |
| 만료·철회·동시 Challenge 소비 | 소비 성공 최대 1, 이후 재사용 차단 |
| Challenge DB는 소비, Admission DB는 미소비(또는 반대) | CROSS_DB_PARTIAL_HOLD, 자동 재시도 금지 |
| 서명/ledger/audit provider 장애나 clock 이상 | 안전 상태 HOLD |
| Root key/Owner passkey 분실·Cloud 최고 권한 탈취 | 제한된 복구 경로 외 신규 실행 거절 |
| 증빙 14개 모두 채워진 fake index | INDEXED_UNVERIFIED 유지 |
| SO-0~SO-2 CI 성공 또는 PR squash | rootAuthority=NOT_VERIFIED, Runner·판매 false 유지 |

## 15. 적용 승인과 남은 결정

**결정됨(본 설계):** Owner 1인, 사람 수가 아니라 역할·키·계정·관리 평면을 분리, 사용자에게만 고위험 운영 승인 요청, 자동 검증/감사/긴급 차단, 기존 대상 브릿지 HOLD 유지.

**현시점 미결정(실제 운영 투입 전):**
1. 사용 가능한 보안 관리 계정/클라우드/키 비반출 서비스와 실제 분리 수준.
2. Owner가 보유할 피싱 저항 인증기와 오프라인 복구 방식.
3. Audit retention/보관 비용과 서비스 허용 예산.
4. P4 위험 작업의 별도 인증·지연 정책을 지원하는 공급자/구현.
5. 사람 2인 독립 심사가 외부 계약상 필수인 작업이 실제 존재하는지.

결정되지 않은 값은 가정으로 채워 운영 허가로 간주하지 않는다. Owner에게 별도 승인이나 설정 조작이 필요한 때만 요청하고, 그 전까지 설계·합성 검증을 계속한다.

## 16. 코드/문서 완료 조건

- A 설계: Owner 1인 + 신원/키/증빙/감사 분리, 책임·위협·잔여 리스크, 등급·사고·비용·데이터 경계를 명시.
- B 재검토: 기존 3-04-01/02/03A·Permit V2·Target Trust V1의 인간 2인/역할 분리 표현과 충돌을 명시하고, 정적 검증에서 권한 상승하지 않음을 확인.
- C 저장: 범위 CI → (필요한) 고정 HEAD 통합 CI → squash → main 확인.
- D 운영: 별도 준비·실증·인증·예산/정책 승인 없으므로 **NOT_VERIFIED**.
- E 실행: 3-04-03B/04/2D-4 및 Production/Commerce 모두 **HOLD**.

~~~text
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
~~~
