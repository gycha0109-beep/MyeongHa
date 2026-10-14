# M3-β-2b D-02 — Reader Grant revoke/refund × 해설 결과 공개 동시성 설계 v1

> Status: DESIGN PROPOSAL / OWNER APPROVAL HOLD / PUBLIC OFF
> 기준: main 474db9371abd6b8cd83fbae8ef5e6f3c02e43727, 2026-10-10
> 책임: DB Authority, Commerce Entitlement, Reader Runtime, API/Security, Saju/QA
> Issues: #1827 (DB refund/revoke), #1823 (umbrella), #1831 (replay/current-access regression merged)
> 코드/DB migration 변경, LIVE 정책 승인, 운영 배포는 이 문서 범위 밖
> 세부 잠금·선형화 실행 계획: MOBILE_READER_FINAL_AUTHORIZATION_LOCKING_D02_V1.md (T2 commit 정책 L1, R0~R3 대안, 신규 Grant phantom, DB-C1~C4 실제 Postgres 검증)

## 1. 확인된 동작과 미보장 성질

| 구간 | 현재 확인된 사항 | 보장할 수 없는 사항 |
| --- | --- | --- |
| v2 bind | migration 1220은 verified purchase Intent/Receipt/Grant에서 immutable Reader access 생성, existing binding replayed marker 지원 | bind replay 자체가 현재 Grant 유효성을 보증하지 않음 |
| runtime metadata | migration 1270 qry_character_standard_reading_access_runtime_v2는 active purchase-backed Grant status/effectiveAt를 조회 | 쿼리 반환 후/LLM 호출 중 revoke된 Grant의 공개 제어 |
| source | migration 1240 raw artifact wrapper는 서버 내부 exact Reader access를 확인 | 한번 읽은 raw source가 이후 권한 소멸 시 자동 소멸하지 않음 |
| A2 | official-reading-reader-admission-v1.ts: Thread → exact Reader metadata → Product rule → source → Thread recheck, one-use proof | 이 검증이 결과 공개 시점까지 권한을 잠근다는 뜻 아님 |
| A3 V2 | reader-interpretation-preview-runtime-v2.ts: A2 2회+standard A3 proof+grounding/renderer/semantic guard, guarded fallback | 두 A2 재검증이 모두 **같은 effectiveAt**로 실행되고, 외부 grounding 이후 별도의 fresh DB revoke 검증 없음 |
| Production Preview | reader-interpretation-preview-postgres-execution.ts는 executePostgresSubjectTransactionV1 내부에서 runReaderInterpretationPreviewHttpV1 호출 | runReaderInterpretationPreviewHttpV1는 현재 **V1 Preview**; 내부 A3 V2 Preview는 public HTTP에 자동 연결되지 않음. 외부 await 포함 장시간 transaction 가능성 검토 필요 |
| Postgres wrapper | postgres-subject-execution.ts는 BEGIN / SET LOCAL ROLE / canonical subject / awaited execute / COMMIT / release | 원격 provider 호출이 긴 경우 DB connection·transaction lifetime, refund/revoke 상대 transaction lock/snapshot 경합과 공개 전 관찰의 정확한 계약 |
| DB test #1831 | revoked Reader A의 bind replay는 과거 provenance로 남고 runtime metadata/raw artifact는 DENY. Reader B 보존·다른 hash conflict 확인 | 환불과 provider rendering이 동시에 일어나는 실시간 interleaving을 테스트한 것은 아님 |

**핵심:** 재실행 과거 이력, 최초 조회, 원본 접근, 해설 생성, 결과 공개는 서로 다른 시점의 사실이다. 과거 승인만으로 최종 공개 허가를 만들면 안 된다.

## 2. 필수 정책 질문: 공개 선형화 지점

임의로 '환불 즉시 이미 전송된 텍스트를 되돌린다'고 주장하지 않는다. Owner가 다음을 명시적으로 정해야 한다.

1. 권한의 취소/환불 effectiveAt과 서버가 결과를 공개했다고 간주할 **선형화 지점**(최종 승인+durable commit 또는 response handoff)의 정의.
2. 이미 시작한 Provider/LLM 유료 호출의 비용과 결과 폐기 기준. Provider 요금 발생과 사용자 결제·Grant 지급은 별개.
3. 해설 생성 완료 직후 revoke가 먼저 commit되면 해설/기록을 차단하는지, 실제 결과를 어떻게 안전하게 폐기하는지.
4. 최종 승인 commit 이후 응답 네트워크 전송 전에 revoke가 commit되면 어떤 일관성 보장을 약속할지. **서버는 이미 송신된 내용의 회수를 보장할 수 없다.** 엄밀히 네트워크 전송 순간까지 거부가 필수라면 제품·API에서 추가 프로토콜/출력 스트리밍 금지·원자적 reveal 정책 합의 필요.
5. Preview(비저장)와 Paid(영속 결과)의 서로 다른 idempotency/refund/re-read 처리를 구분.

Owner의 명시적 결정 전에는 운영 Reader 공개 OFF.

## 3. 조건부 추천: 짧은 두 DB 트랜잭션 + DB 밖 보호 렌더

**현재 실행 코드의 구조적 변경 제안이며 아직 구현되지 않았다.** 단일 transaction에서 await를 통한 원격 Saju 호출은 connection 점유와 revoke 경합 검증을 어렵게 할 수 있다.

Phase A — PREPARE (짧은 Subject transaction T1):
- 인증된 canonical Subject를 DB에서 결정. backend rollout OFF/cohort 검증 → 정확한 owned single Reader Thread 및 release/bundle revision.
- 최신 DB 시간으로 exact current Reader Grant + Source Reading 상태/해시, approved Product rule/version, A2 admission 검사. 클라이언트 입력은 threadId/officialReadingId만.
- 한 번 사용 가능한 실행 컨텍스트를 **서버 내부에만** 구성. Subject, Reading, Reader, bundle, Thread revision, source hash, policy revision, revocation-sensitive provenance / execution idempotency digest 결속.
- T1이 종료되면 transaction-local subject와 row locks는 해제. 데이터를 모바일에 전달하지 않는다.

Phase B — EXECUTE (DB transaction 밖):
- 승인 source를 기준으로 A3+Saju grounding+bounded rendering+semantic guard 수행. 미검증 출력/보호 fallback은 모두 임시 상태.
- 외부 호출의 timeout/retry/cost cap/idempotency를 사용. Provider 결과나 임시 utterance를 응답으로 조기 스트리밍하지 않는다.
- 이 단계에서 revoke가 발생하면 pending 결과는 다음 Phase C에서 폐기할 수 있다. 원본 공식 Reading row를 수정하지 않는다.

Phase C — FINAL AUTHORIZATION (새 Subject transaction T2):
- **새로 검증한 canonical Subject**, fresh DB clock/권한 상태, 동일 owned Thread+Reader bundle/release revision, current Product policy revision 및 Reader rollout을 다시 점검.
- 정확한 Reading committed artifact/version/hash, active purchase-backed **exact Grant**와 revocation/refund effective time을 다시 조회한다. 초기 T1의 effectiveAt을 복사해 검증하면 안 된다.
- 다시 읽은 scope/source hash와 임시 결과 provenance가 동일하지 않거나, 다른 bundle 중복/정책 철회/로그인 소유자 전환이 발생하면 DENY/보호 실패. 어떠한 텍스트도 내보내지 않는다.
- Paid 결과의 durable commit/idempotent result identity가 승인됐다면 권한 최종 확인과 commit의 transaction atomicity를 DB/Records owner가 정의한다. 현재 Preview는 paid persistence로 자동 전환할 수 없다.
- 공개 허가가 성공적으로 선형화된 경우에 한해 versioned response를 돌려준다.

Phase D — RESPONSE / DEVICE BINDING:
- 응답은 source/Reader/Reading/domain/responseHash identity가 클라이언트 binding 검사와 일치해야 한다.
- 클라이언트 subject-session 변경·화면 이탈·재진입 시 이전 response를 표시하지 않도록 별도 mobile race 방어.
- 네트워크 유실 시 Paid/Preview별 재호출 및 결과 재사용 정책은 승인된 idempotency 계약을 사용한다. 중복 결제/Grant 발생 금지.

위 각 단계에 임의의 새 public endpoint, nonce, Client Grant token을 만들지 않는다. T1과 T2의 권한 비교 정보는 server-only다.

## 4. 트랜잭션·DB 격리 결정 기록표

| 항목 | 추천/질문 | Owner 승인 필요 |
| --- | --- | --- |
| T1 isolation | 기존 기본 isolation으로 실행 가능하되 mutable 권한 버전과 SOURCE snapshot의 consistency 검증 | DB |
| T1 effectiveAt | server-owned DB clock, 유효기간 경계 포함 (valid_from <= now < valid_until) | DB |
| T2 isolation | 새 transaction을 통한 fresh read. revoke와 최종 공개 승인 사이 경쟁을 제어할 잠금 순서 또는 별도 atomic compare-and-commit 필요 | DB+Commerce |
| 두 트랜잭션 사이 | Long-lived DB transaction 없음. Remote provider 호출은 pooled connection 밖 | API+Saju |
| Revoke vs final commit | revoke transaction과 final commit의 선형화 순서/lock 충돌 처리 및 재시도 기준 | DB+Commerce |
| Subject merge | direct merged Guest lineage 정책 보존. 새 canonical Subject가 다른 경우 stale response DENY, 역사적 source rebind 금지 | DB+Auth |
| 두 independent Grants | 동일 Reader/bundle에 유효한 다른 Grant가 있다면 정책에 따라 접근 유지. 단일 revoke를 aggregate deny로 확대하지 않음 | Commerce+DB |
| 서로 다른 bundles | 동일 Reader/Reading에 현재 active 다른 bundle provenance면 exact-one mismatch DENY | DB+Reader |
| Policy/release 변경 | T1 및 T2 exact revision/Release/content bundle mismatch면 abort. 과거 권한을 현재 정책으로 강제 유지하지 않음 | Product+Reader |
| 앱/Provider 타임아웃 | 진행 중 결과 전송 0; orphan temporary output persistence/비용·재시도 처리 승인 | Runtime/Operations |

**주의:** READ COMMITTED의 2회 조회만으로 'revoke가 언제든 앞설 수 있는 최종 송신'의 완전 원자성을 자동 보증하지 않는다. Revoke/final commit 간 명시적 직렬화 프로토콜이 필수인지 정책에 따라 결정하고 테스트한다.

## 5. 시간 순서 테스트 (아직 실행 전 설계)

| ID | interleaving (왼쪽이 먼저 발생) | 기대 |
| --- | --- | --- |
| RACE-01 | T1 approved → Refund/Grant revoke COMMIT → Provider done → T2 | T2 DENY, 결과/로그/응답 원문 공개 0 |
| RACE-02 | T1 approved → Provider done → revoke lock acquired → T2 attempt | 승인 lock order에 따라 T2 기다림/재검증 뒤 DENY; 잘못된 stale allow 없음 |
| RACE-03 | T1 approved → Provider done → T2 final commit → revoke COMMIT | owner가 정한 선형화 기준에 따라 이미 완료된 결과 처리; 미래 호출 차단 |
| RACE-04 | A와 B 같은 Reader/bundle에 독립 Grant, A revoke | B active이면 현재 정책대로 허용, B까지 revoke 시 거부 |
| RACE-05 | 다른 bundle에 active Grants 2개 | T1 또는 T2 exact-one metadata ambiguity DENY |
| RACE-06 | revoked Intent에 v2 binding replay | replay된 binding은 historical. T2 current access DENY (#1831 회귀 범위 재사용) |
| RACE-07 | Reading source hash/release/contentRevision이 T1-T2 사이 변함 | T2 mismatch DENY, 기존 해설 텍스트 노출 0 |
| RACE-08 | Product policy approved→withdrawn/stale, T1-T2 사이 | T2 DENY. Product rule lookup fail-open 금지 |
| RACE-09 | mobile Guest→Member 또는 로그아웃/다른 Subject 로그인 | 결과는 이전 Subject로 표시되지 않음; T2의 canonical Subject 새 검증 |
| RACE-10 | Saju timeout/renderer exception → fallback | fallback도 최종 fresh authorization 없이 공개하지 않음 |
| RACE-11 | T1 통과 이후 Saju 요청 2회 중복 | 승인된 idempotency/dedupe/비용 경계; 공식 Reading 재생성 0 |
| RACE-12 | T2 이후 response delivery 유실, 재시도 | Paid persist 정책 없는 한 Preview를 paid 기지급으로 합성 금지 |
| RACE-13 | effectiveAt T1 값을 그대로 T2에 전달 | 테스트가 stale timestamp로 통과하면 실패로 판정 |
| RACE-14 | 미승인 Product rule/Grant/bundle 또는 rollout OFF | T1에서 Provider 호출 0, raw artifact 0 |
| RACE-15 | DB await 원격 Provider 20초, max connection 1 | 구조 변경 후 T1/T2 이외 DB 커넥션 점유 없음, pool 회수 정상 |
| RACE-16 | 중간 서버 크래시 → 재시작 | 미승인 임시 산출물 노출 0, durable 결과·과금 원자성 정책 준수 |

실행은 PostgreSQL 17 격리 테스트에서 두 독립 커넥션·barrier/advisory synchronization·controlled fake Saju/LLM를 사용해 순서를 결정론적으로 재현. 단순 Promise mock 통과만으로 DB revoke interleaving PASS 금지. 외부 원가/포트원 LIVE는 별도 QA 환경에서 검증.

## 6. 구현 PR 권장 분할

1. DB-R1: revocation/grant metadata fresh read와 다중 grant/bundle ambiguity/merged Guest 격리 회귀 (기존 migration 재작성 없이). #1831은 revoked replay 부분만 완료.
2. API-R2: transaction을 짧은 T1/T2로 분리할 수 있도록 backend internal server-only context/proof + fresh second-stage DB validation 설계/구현. 운영 HTTP 공개 전, V1 Preview와 V2 내부 계약 사이 전환 범위 승인.
3. Runtime-R3: verified A3 result/fallback의 **최종 공개 게이트**, fixed hash/policy/release scope 비교, idempotent/timeout safe handling.
4. Records-R4: Paid results의 durable persist/re-read/Chat admission은 별도 승인된 자료·권한 정책으로만.
5. QA-R5: RACE-01~16 실제 PostgreSQL·controlled upstream delay, kill switch, rollback, 성능 측정, 이후 staging 한정 검증.

각 PR은 기존 Watchtower 트랙 책임을 확인하고 독립 병합·기본 CI·통합 CI로 검증한다. Public Reader OFF는 QA/Release 소유자와 실제 Commerce/Product/Saju 권한이 승인될 때까지 유지.

## 7. 종료 조건

- **A (설계):** DB/Commerce/Reader/API가 revoke linearization point, T1/T2 isolation, client-visible 결과 정책을 서명한 계약으로 확정. 현재 A OWNER HOLD.
- **B (구현):** 실제 final authorize/deny, 여러 exact Grant/ambiguous bundles, deterministic Postgres interleaving과 API/Runtime/DB CI, 병합 후 main PASS. 현재 B HOLD.
- **C (운영):** 실판매 Offer/verified receipt/Grant/Saju Production/Product rule/public admission/rollback/staged E2E 승인. 현재 C HOLD.

이 문서에 적힌 RACE 테스트는 **아직 실행되지 않았다**. 합성 A3 81조합 및 #1831 재실행 검증 성공과 중복 계산하지 않는다.
