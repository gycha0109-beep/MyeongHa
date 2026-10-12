# 세연 G0 D-03 / G1 양수 Memory → G6 상세 실행 로드맵 v1

> Watchtower-Track: ops
>
> **Status: EXECUTION PLAN PROPOSED · DB/Security/Character OWNER SIGN-OFF HOLD**
>
> 2026-10-12 KST. Draft [PR #1985](https://github.com/gycha0109-beep/MyeongHa/pull/1985). 기술 명세: [G0 D-03 → G1 DB Blueprint](../security/SEYEON_G0_D03_G1_POSITIVE_PIN_DB_BLUEPRINT_V1_PROPOSED.md). 상위 판정: [G0~G6 원장](../security/SEYEON_AI_SECURITY_COMPLETION_GATES_V1.md).
>
> 운영 DB baseline은 반드시 [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887)의 최신 read-only 결과로 다시 확인. 오래된 migration 개수 또는 CI SUCCESS를 실제 Production 배포로 간주하지 않음.

## 0. 결론 / 범위

오프라인 Grant Pin/Commit/Reveal, HTTP Controlled Disclosure/History Fail-Closed, 실제 폐기 PostgreSQL/Node Golden은 존재합니다. 하지만 **SRC-25 허용 Positive schema, G0 D-01~D-10 실제 서명, 1640 zero-only trigger와 v2 Commit까지 연결된 검증/ACL, 파생 대화의 모델 재투입 provenance**는 아직 미완료입니다.

단순 후보를 운영 함수로 복사할 수 없으므로 [상세 DB 설계](../security/SEYEON_G0_D03_G1_POSITIVE_PIN_DB_BLUEPRINT_V1_PROPOSED.md)를 먼저 제안하고 아래 단계의 각각에 입력/구현 대상/검증/종료/책임을 분리합니다. 외부 유료 모델 및 운영 DB·public route·positive Projector는 승인 전 OFF.

## 1. Critical Path

**R0:** G0 Authority / D03 + SRC-25 Owner 결정
→ **R1:** Codec / SourceSet test-only 실 DB 검증 (R0 중 병렬 허용)
→ **R2:** Final Provider Input 및 History/Reader/Relationship closure
→ **O0:** Production lineage + 백업/복원 증거 (R0~R2와 병렬)
→ **R3:** Forward-only G1 Positive Attempt Pin + ACL
→ **R4:** Character 실행 경계와 Pin-before-Provider 연결
→ **R5:** G2 실제 v2 Commit / 1640 Trigger XOR / legacy bypass 봉쇄
→ **R6:** G3 First/Replay/History/current-rights + derived model context
→ **R7:** G4 Governor / G5 real 2-session·HTTP·Integration
→ **R8:** G6 운영 DR/Canary/단계적 공개 승인

**강제 경계:** R1의 disposable DB 실험과 R2의 비운영 코드 인벤토리는 공동 서명 전 진행할 수 있습니다. R3~R8에서 운영 DB 마이그레이션 배포·positive 모델/Reveal·route 활성화는 개별 Owner 승인 전 진행하지 않습니다. "Migration PR 코드 작성"과 "실제 운영 배포"도 각각 별도 권한입니다.

## 2. R0 — G0 정책·코덱 Owner 합의

**입력:** G0 제안서, D-03 실측 문서, 신규 DB Blueprint, #1843/#1866/#1887, SRC-25/SRC-22 및 #1827 Reader 권한.

**산출:** D-01~D-10 항목별 APPROVE/REVISE/OUT_OF_SCOPE+FAIL_CLOSED, 정책 버전/적용 Scope/Owner/승인 URL/정확한 SHA. 특히 S0=현재 사용자 발화+공개 Bible+직접 승인 Memory 1건의 실제 recordType/schemaVersion/projectorVersion, 기존 대화/Relationship/Reader/Saju의 제외 방식, D-04 Revoke↔Reveal DB COMMIT / late HTTP bytes 기준을 명시.

**검증:** Character+Source Authority는 SRC-25 1개 타입도 임의로 만들지 않음; DB+Security는 Grant inheritance/revoke와 Codec 상호 비교 방침 결정; Product/Reader/Commerce/Saju/Ops는 자신 범위 제외가 정말 fail closed인지 승인.

**종료:** 모든 activated source class/derived source 처리 정책이 승인되고 버전/최종 경계가 고정됨. **상태: OPEN, Owner 승인 없음.**

## 2.5 R1/R2 실제 구현·자체 재검토 기록 (2026-10-12)

- **R1 목적/변경:** test/db/seyeon_positive_source_set_parent_edge_candidate_v1.sql 작성 및 test/db/seyeon_positive_grant_candidate_real_http.sh에 포함. 기존 실 Attempt+실 Memory/Grant fixture의 0/1/2개 SourceSet, immutable Parent+Edge, original Grant, content digest, revoke/regrant, API 직접 테이블 ACL, **기존 Zero→Positive 방향 거부와 역방향 1640 허점**을 실 PostgreSQL **격리 DB에서만** 검증. 역방향 Zero-after-Positive는 현재 1640 Trigger에서 Parent 존재를 모르므로 양방향 XOR 구현/운영 PASS가 아님. 기존 G2 v2 Commit은 건드리지 않음.
- **R1 자체 보완:** 첫 CI에서 API executor가 금지된 Parent 직접 SELECT를 수행해 권한 오류. 보안 ACL은 그대로 유지하며 fixture 조회를 Owner 테스트 절차로 분리. 수정 커밋 반영.
- **R2 목적/변경:** apps/api/src/seyeon-offline-r2-provider-ingress-audit-v1.ts 및 test/seyeon-offline-r2-provider-ingress-audit-v1.test.ts. Native 분류/Interpreter/Renderer/Reviewer의 실제 request builder를 사용해 구조화된 History/Disclosure/Relationship/Grant 참조의 **Pin 이후 혼입**을 오프라인 합성 Provider 앞에서 차단.
- **R2 자체 보완:** Renderer synthetic fixture에는 실제 responseSchema에 필요한 expressionState가 필수여서 baseline 값을 명시. Provider payload 직렬화에 undefined가 있으면 audit가 HOLD하는 기본값은 변경하지 않음.
- **상세 근거/입력 차이:** [R1 DB Parent/Edge · R2 native Provider ingress 인벤토리](../security/SEYEON_R1_R2_SOURCE_SET_AND_MODEL_INGRESS_PROOF_V1.md) 참고. 단순 구조화 필드 감사는 임의 자연어 속 hidden source/Reader entitlement·signed Bible·full Context closure의 증명이 아님.
- **검증 판정:** 정확한 최종 HEAD CI 성공이 확인되기 전 R1/R2 PASS 선언 금지. G0 Owner 정책 D-01~D-10 OPEN, 운영 G1/G2/G3/HISTORY/유료 AI/공개 ON 아님.

### R1/R2 추가 보완 — 양방향 Pin XOR 후보와 5단계 요청 지문

- **R1 시행:** `test/db/seyeon_positive_source_set_parent_edge_candidate_v1.sql`에서 기존 1640 트리거가 Positive Parent를 인식하지 못하는 **역방향 취약 사례를 먼저 rollback으로 재현**한 뒤, 동일 **시험용 Schema에서만** `reject_zero_after_positive_r1` Guard를 설치합니다. Positive Parent 생성 함수는 Attempt 행을 `FOR UPDATE`로 점유하여 기존 Zero Pin UPDATE와 서로 직렬화합니다. Positive→Zero 변경이 SQLSTATE 23514로 거부되는지, 기존 Zero→Positive도 여전히 HOLD인지 검증합니다.
- **R1 미검증/Owner 의존:** 위 Trigger는 `test/db` 파일에서만 생성되며 운영 1640/실 Commit 함수에 설치되지 않았습니다. **독립 PG 두 세션의 동시 역행 경합 및 운영 동등 Lock Graph·동일 Tx G2 Commit은 별도 증거 필요**. 승인된 Forward-only DB 변경과 legacy EXECUTE 봉쇄도 여전히 HOLD.
- **R2 시행:** `apps/api/src/seyeon-offline-r2-sealed-provider-chain-v1.ts`가 native 분류 2개(순서 무관)→Interpreter→Renderer→Semantic Reviewer의 5개 `Provider Request` 객체를 **instructions/responseSchema/input 포함 전체 직렬화 지문**으로 결속합니다. 진짜 구조화 request 변경·중복/실패 stage·순서 역전은 합성 delegate를 호출하기 전에 HOLD. `test/seyeon-offline-r2-provider-ingress-audit-v1.test.ts`에 정상/공격/실패 회귀 추가.
- **R2 한계:** 이 full-request 지문은 **테스트 harness가 사전에 승인했다고 주장한 synthetic expectedRequests**만 동일한지 확인합니다. DB-signed immutable SourceSet, Provider가 실제 전송한 네트워크 바이트, 유료 모델·Reader/Saju·Worker 파생/기억 재사용에 대한 권한/출처 증명은 아닙니다. Production 경로에 설치/활성화하지 않습니다.
- **검증 로그:** PR #1985의 **최종 정확한 HEAD** CI + PostgreSQL authority + Governance/Web을 확인한 이후만 PASS 판정. 상세 증거 [R1/R2 검증 원장](../security/SEYEON_R1_R2_SOURCE_SET_AND_MODEL_INGRESS_PROOF_V1.md).

## 3. R1 — D-03 및 실제 SourceSet 구조의 격리 검증

**기존 증거:** test/db/seyeon_positive_grant_attempt_bound_candidate_v1.sql, test/seyeon-source-digest-node-postgres-golden-v1.test.ts, 기존 Node/PG real HTTP 4건, 세연 S0 합성 17건. 2026-10-12 정확한 SHA에서 기존 PG/Node Golden 7건 PASS.

**현재 test-only 파일:** `test/db/seyeon_positive_source_set_parent_edge_candidate_v1.sql` 및 실행 진입점 `test/db/seyeon_positive_grant_candidate_real_http.sh`를 기존 db-authority-core 폐기 DB에 포함. 별도 신규 workflow 없음, `supabase/migrations` 변경 0. PG15↔PG17 독립 환경 호환성 실증은 Owner 결재 전 미완료.

**검증:** DB payload hash / Node canonical envelope / projection/selected hash **각각 따로 검증**; 같은 레코드 다른 Grant ID, 다른 Type/Schema, raw content tamper, duplicate source, 0/1/N, cross Subject, invalid parent-edge count, zero-plus-positive 이중 mode 거부, Commit/Reveal revoke race. PostgreSQL 15/17이 다를 수 있으므로 실제 두 버전 golden corpus 및 upgrade strategy는 Owner 별도 확정. 무키 SHA는 권한 아님.

**출구:** D-03-A~D의 특정 codec/name/type/byte encoding과 SourceSet cardinality가 증거와 함께 DB Owner 리뷰용으로 준비됨. **상태: 단일 PG 실증 일부 PASS, N/PG15↔17/Owner approval TODO.**

## 4. R2 — 실제 모델 전송 Input 및 파생 Context provenance

**입력 파일:** apps/api/src/seyeon-production-context-v1.ts, seyeon-production-chat-execution-v1.ts, seyeon-character-runtime-v2.ts, seyeon-exact-model-personal-source-selection-v1.ts, postgres-seyeon-production-context-read-v1.ts, S0 offline gate.

**산출:** 각 출처의 DB identity, record/grant ID, source class, derived parent, authorizing Owner, Reader/Saju entitlement, Provider-boundary stage, request-byte digest, deletion/revoke propagation을 적은 full ingress inventory. 모델 요청을 실제 생성하는 Interpreter/Renderer/Reviewer/Preflight 사이에 출처가 뒤늦게 추가되면 이전 Pin의 출처 closure를 무효 처리할 설계.

**검증:** 합성 old user/assistant, Relationship event/history, Reader/Saju/Preflight/Peer, malformed sourceRef, unsupported Type, top-k cap/order, Bind 직후 context mutation/재시도 → 모델 호출 0/데이터 공개 0. 단순 빈 simulatedOtherIngress는 실제 전체 경로를 증명하지 않음.

**출구:** 안전한 server-owned sealed context와 exact source set이 같다는 테스트 가능한 Port 계약. **상태: S0 일부 구현 PASS, 전체 final Provider ingress/derived closure HOLD.**

## 5. O0 — 실제 운영 DB/DR 준비 (병렬)

**입력:** #1887, docs/operations/SEYEON_POST_RECOVERY_EXECUTION_ROADMAP_20261012.md, 최신 Production read-only catalog.

**산출:** 원격 전용 20261008090417의 출처/동등성·DDL 적용 순서 확인, 1520~후속 migrations 현재 적용 상태 read-only 재조회, recovery 이후 **새 암호화 백업 + 동일 백업의 격리 복원** 증거, 제한 DB 역할과 위험승인. 이전 관측값을 현재 적용 상태로 재사용하지 않음.

**출구:** DB Owner/Ops가 새 forward-only migration 및 Rollback을 승인할 수 있는 DB baseline. **상태: 최신 원격 증거 재확인 전 자동 PASS 금지.**

## 6. R3 — DB G1 Positive immutable Pin (Owner 승인 후)

**입구:** R0의 활성화 Scope와 연관된 **D-01~D-10 전 항목 APPROVE 또는 Owner가 서명한 OUT_OF_SCOPE+FAIL_CLOSED**, O0, R1/R2. 특히 D-04/D-05/D-08/D-09/D-10을 명시 처리하지 않았으면 DB schema PR은 리뷰 후보일 뿐 운영 적용·positive Provider 연동 불가.

**제안 파일:** supabase/migrations/<owner-approved-new-id>_seyeon_positive_source_set_pin_v1.sql (신규 forward-only), test/db/<owner-approved>_seyeon_positive_pin_v1.sql, 앱 postgres-seyeon-production-chat-execution-v1.ts 연결.

**동작:** 기존 1640 0건 Pin 필드 그대로 유지. 별도 Versioned Attempt SourceSet parent + source edges로 Original Grant ID/Record/Subject/Thread/Turn/Attempt/Type/Schema/DB-computed raw payload digest/Node projection digest를 보관. 새 cmd_mark_seyeon_chat_context_ready_positive_pinned_v1 후보가 **같은 PG Transaction** 안에서 active exact Grant와 Record/Attempt를 읽고 락/검사→immutable 삽입→context_ready 처리. Provider 호출 전에 DB transaction 성공 필수.

**검증:** 기존 zero Pin regression, 정확한 Memory 1건, missing source/policy/schema/Attempt, old Grant revoke/regrant, dual zero-positive Pin, duplicate/partial parent-edge, concurrent retries(**Pin 성공 후 Grant revoke→같은 Attempt 재호출시 Provider 재실행 0**), executor direct DML 0 및 browser EXECUTE 0.

**출구:** 실 Owner SQL/G1 durable Pin 증거. 아직 모델/route OFF. **상태: HOLD.**

## 7. R4 — Native Character Chat 실행 결속

**입구:** R2/R3 실제 Owner contract.

**제안 파일:** apps/api/src/seyeon-production-chat-execution-v1.ts, postgres-seyeon-production-chat-execution-v1.ts, production-seyeon-chat-runtime-v1.ts, 관련 회귀 테스트.

**동작:** 기존 0건 context path 보존. Positive S0에서는 최종 selected source/전체 ingress 검증 → G1 DB immutable Pin+context_ready COMMIT → 서버 Governor/Provider 호출; Pin 실패·Schema 미확인·Port 없음은 **유료 모델 0회**. 기존 0건 RPC로 positive fallback 금지. 수락한 SourceSet/Attempt ID를 model→validation→commit까지 결속.

**검증/출구:** actual Provider gate 직전의 sealed context identity와 DB Pin 일치, 응답/비용 regression 없음, 공개 OFF. **상태: HOLD.**

## 8. R5 — G2 실제 Atomic Commit / 1640 Trigger / Bypass

**입구:** D-06 Lock Graph Owner 승인, D-07 revoke/supersede 정책, R3/R4.

**제안 파일:** 또 다른 forward-only migration 또는 DB Owner가 승인한 동일 배포 원자 단위, 앱 current Commit adapter 및 SQL 테스트.

**동작:** 기존 public.cmd_commit_seyeon_chat_turn_runtime_v2(현재 정확한 uuid×7,jsonb,text)를 실제 호출하기 전, **같은 PostgreSQL Transaction**에서 immutable Positive Pin과 current original Grant+Memory 상태를 FOR SHARE 이상으로 검증하고 transaction 끝까지 락 유지. 원래 v2→v1→cmd_commit_chat_turn_v1 및 post-turn Outbox 처리·멱등 반환 보존.

**핵심 발견:** migration/1640의 tr_seyeon_zero_source_pin_immutable_v1은 validated→committed에 zeroProof.records=[]가 필수. Positive sidecar만 추가하면 Commit이 막힘. **1640 이전 파일은 수정하지 않고** 새 forward-only migration에서 Zero 불변/검사와 Positive SourceSet 검사 사이에 XOR 분기 구축. Legacy v1/v2/Core direct EXECUTE의 API executor 우회 경로도 봉쇄. 기존 revoke 함수는 Subject FOR UPDATE가 먼저이므로 Commit/Revoke lock graph를 실제 함수/row-level로 비교.

**검증/출구:** 승인된 *실제* Commit RPC로 PostgreSQL 독립 2-session revoke-first/commit-first, Content mutate, timeout/deadlock, old zero regression, Outbox rollback/idempotence, race중 unauthorized Commit 0. Test-only commit_test_v1 성공은 G2 증거 아님. **상태: HOLD.**

## 9. R6 — G3 DB current-rights Reveal / History / 모델 재투입

**입구:** R5, D-04/D-05/D-09 sign-off, 데이터 출처 closure 승인.

**제안 파일:** DB Owner reveal/history SQL, production-seyeon-turn-send-runtime-v1.ts, production-chat-read-runtime.ts, chat-read-http.ts, Context read adapter와 TEST.

**동작:** conversation_messages→chat_turns.committed_attempt_id→DB SourceSet/Edges를 서버가 역조회. 현재 active original Grant와 원본 Record/Schema/Digest가 모두 유효할 때만 실제 DB 권한 포트가 승인된 assistant text 반환. 최초 응답/committed_replay/History 페이지를 동일 기준으로 검사. Unattributed old transcript, Relationship/Reader/Saju/past model context는 도메인 Owner 별도 전이 승인 전 **FULL HOLD**. Positive 스트리밍 OFF. Reveal DB-Commit vs HTTP late delivery 선형화 기준을 D-04로 확정.

**검증/출구:** revocation/regrant/history/first/replay/negative-identity/legacy/no-port/DB-down, 재시도 유료 재호출 0, 공개 Unauthorized bytes 0. **상태: HOLD.**

## 10. R7 — G4 Governor / G5 전체 보안·비용 검증

**입구:** R0~R6 Owner approvals 및 실제 ACL/DB 함수.

**검증:** 기존 CI의 route-ci-scope + character-memory + db-authority-core + Governance + Web Gates + 정확한 HEAD full Integration. **새 대형 CI workflow 만들지 않음.** 모델/DB/HTTP/Outbox/Worker 전 경로, timeout/crash/commit-reply-loss, 2-session Grant races, real role ACL, cross-subject, negative Reader entitlement, untrusted text injection, no unauthorized cost.

**출구:** 실 Source/권한 유출 0, 무단 유료 호출 0, 정확한 버전의 운영 동등 SQL 테스트 증거. **상태: HOLD.**

## 11. R8 — G6 운영 승인·단계 공개

**입구:** O0 + R0~R7 모두 증명, Owner release go/no-go.

**실행:** 정확한 main/PR SHA 및 원격 applied migrations/DR, prod 신뢰 역할/안전 로그/알림, synthetic/internal limited canary, positive Projector/route/paid flag 개별 가드. 실패 시 public route/positive feature OFF로 되돌리고 raw Record/SourceSet을 임의 파괴하는 down migration 금지. 재진입/취소/잠금·비용 관측 및 별도 운영 승인 이후만 공개 검토.

**출구:** 지정 활성화 Scope의 A(코드)+B(보안 실증)+C(운영 승인) 모두 PASS. **상태: HOLD.**

## 12. 위험 원장 — 치명적 계약 공백

| Risk | 실제 근거·영향 | 필수 대책 |
| --- | --- | --- |
| SRC-25 / D-01 | 실제 positive Memory 타입 미승인 | Type/Schema/Projector Owner signature |
| D-03 | 앱 Node raw envelope hash와 DB jsonb::text payload hash 불일치 | domain-separated codec/version/PG15·17 golden |
| 1640 trigger | Zero-only 조건이 positive Commit 차단 | Zero immutable 유지 + Positive XOR branch forward-only |
| legacy RPC | v1/v2/Core EXECUTE로 lock 우회 가능성 | role/executor ACL, Trigger, route/callsite inventory |
| Revoke Lock Order | 기존 revoke가 Subject FOR UPDATE 우선 | subject-first DB lock graph + 실 2-session |
| derived Context | past assistant/relationship/Reader 개인출처 미연결 | full parent closure / unknown HOLD |
| D-04 | HTTP 승인 후 늦게 도착하는 답변 처리 미선택 | non-streaming + Owner linearization 선택 |
| #1887 | Production remote-only lineage/DR 최신 확인 필요 | Production read-only + backup/restore signoff |
| Governor | API/DB 직행 비용 우회 위험 | existing Ledger/role negative tests |
| main divergence | PR #1985 main 대비 변동 가능 | merge-base 재조회/정확한 SHA tests |

## 13. 수행 기록·검토 방식

각 R 단계마다 **목적/Owner/변경 파일/증거 exact SHA/CI·DB 검증/보완/잔여 리스크/승인 링크/종료 조건**을 이 문서 또는 연결된 PR 원장에 기록합니다. Chat 보고는 **완료 / 문제 / 다음 작업 세 항목만 짧게** 작성합니다.

- A: 실제 코드 구현/검증을 끝냈을 때만 구현 완료.
- B: 중요 이슈 없이 해당 오프라인 범위만 종료. Production Gate 통과 의미가 아님.
- C: Owner 승인 또는 운영 DB·외부 데이터가 필요하여 차단된 상태.

**현재 종료 판단:** 상세 설계·로드맵은 Owner Review 제출 가능; R1 단일 DB 실험 부분 PASS. R0 승인 미완료, R3~R8 운영 구현 미승인. 단독 문서 작성만으로 운영 authority나 Migration을 열지 않습니다.

## 14. 지금 실행 가능한 후속

1. R0: D-01/02/03/04/06/07/09의 **결정 옵션 + 승인/반려 기록**을 해당 owner issue에 제출.
2. R1: 승인 없이 가능한 테스트 전용 SourceSet parent/edge 0·1·N / regrant·tamper / PG15↔17 golden을 disposable DB에서만 보완.
3. R2: 실제 Provider/Preflight/Reader/History source graph 누락점을 API callsite별로 정밀 inventory하고 미결 경로 HOLD 검증.
4. R3 이후 실 DB migration/SourceSet executor/positive runtime은 Owner contract와 O0 DR/lineage 증거가 확인될 때 착수.
