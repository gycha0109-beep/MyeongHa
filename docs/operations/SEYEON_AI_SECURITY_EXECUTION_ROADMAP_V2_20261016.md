# 명하 세연 — 개인정보·AI 채팅·운영 적용 실행 로드맵 v2 (2026-10-16)

> Watchtower-Track: security
>
> **현재 실행 기준선**: [AI 보안 종료 원장 #1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866), [P0 Grant/Commit/Reveal #1843](https://github.com/gycha0109-beep/MyeongHa/issues/1843), [운영 DB/DR #1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887), [G0~G6 계약](../security/SEYEON_AI_SECURITY_COMPLETION_GATES_V1.md).
>
> **개정 이유**: 10월 12일 사후복구 로드맵의 당시 HOLD 및 1730 미검증 서술을 **2026-10-16까지의 실증 결과로 갱신**하고, 역사적 로그 추적을 반복하지 않고 실제 개인정보 보호·서비스 통합·안전한 운영 적용으로 전진한다. 옛 문서의 과거 실행 기록은 보존한다.

## 1. 확인된 현재 상태

| 구분 | 확인된 결과 | 아직 주장하면 안 되는 것 |
| --- | --- | --- |
| R2-G 과거 실행자 조사 | [위험 수용·조사 종료](SEYEON_R2_G_OWNER_RISK_ACCEPTANCE_20261016.md): `CLOSED_RISK_ACCEPTED`, **개발 차단 아님** | 인증된 역사적 actor/COMMIT·전량 SQL/ACL 동등성 확인·DR 준비 완료 아님 |
| 1710/1730/1760 비용 영수증 | [#2167](https://github.com/gycha0109-beep/MyeongHa/pull/2167), [#2173](https://github.com/gycha0109-beep/MyeongHa/pull/2173), [#2181](https://github.com/gycha0109-beep/MyeongHa/pull/2181): 격리 PG17 정상 Store→Claim→Settle→Ack, 잘못된 영수증 8종 거부, 거부 전후 원장·예약 예산 불변, CI·통합 검증 완료 | 운영 데이터나 유료 Provider 호출을 통한 실제 과금 검증 아님. 후보 1730/1760은 **비배포** |
| G1 0건 Pin | 서버 0건 증명 및 1640 후보의 모델 호출 전 DB Pin 경계가 코드·테스트에 존재 | **양수 Memory/Life Fact의 exact Grant Pin과 실제 운영 승인은 아직 없음** |
| G2/G3 | Atomic Commit/Controlled Reveal 후보와 제한적 실험이 존재 | `cmd_commit_seyeon_chat_turn_runtime_v2`의 exact Grant 동시 잠금, HTTP 최초 Reveal/committed replay 보호 **미완료** |
| 운영 DB | 1400~1510 복구 이력 존재; 1520~1720 **21개 미적용**, 원격-only `20261008090417` 보존 | 기존 DB history 자동 repair 또는 21개 일괄 push 승인 아님 |
| G0~G6 종료 | 세연 공개/개인기록 양수 Projector/유료 평가 기본 OFF | A(구현)+B(실DB)+C(운영 승인) 최종 PASS **아님** |

실제 상태가 바뀌면 각 증거를 확인해 상태를 수정한다. 단위 테스트·Shadow·후보 SQL 병합만으로 운영 GREEN을 기입하지 않는다.

## 2. 개발 원칙 및 우선순위

**P1 개인정보 접근·취소(최우선) → P2 실제 AI 채팅 통합 → P3 운영 DB/DR 사전검증 → P4 별도 승인 후 제한적 활성화** 순서.

- 신규 Workflow나 R2-G 역사 실행자 추적 업무를 되살리지 않는다. 기존 `CI`, `Governance`, `Full Integration`을 재사용한다.
- 현재 `SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1 = []`, 공개 세연 Route OFF, 개인기록 출처가 양수이거나 모호하면 Provider/Commit/Reveal로 진행하지 않는다.
- 개발 중 Production DB에 **DDL/DML/Role/ACL/migration history 변경 금지**. `authorizedForProduction=false`, `drReady=false`, `paidAi=false`, `publicReader=false`.
- 위 상태값은 운영 범위별 Owner가 별도 인가하기 전까지 PASS로 바꾸지 않는다.

## 3. 작업 큐 (완료 조건까지 고정)

| 단계 | 우선순위/책임 | 실행 작업 | 증거와 완료 조건 | 이번 기준 |
| --- | --- | --- | --- | --- |
| **S1 0건 출처 무결성** | P1 Security/API | 0건 proof/Pre-Model HOLD에 개인기록 Projector **candidate가 남거나 구조가 잘못된 경우 차단**. 서버 최종 선택에 없는 후보도 0건으로 위장하지 못하게 함 | 후보 누락/양수/비배열·지원 안 되는 Schema/정상 빈 배열, Provider 이전 HOLD 테스트·exact-head CI | **이 로드맵 개정 PR에서 착수** |
| **S2 G0 권한 모델 확정** | P1 Security+DB+Character | `recordId/grantId` 원본, 새 Grant 발급은 기존 Grant를 복원하지 않음, Record revoke/supersede, Context/파생 메시지, Streaming OFF 권고의 각 선형화 정책 결정 | 버전 있는 승인 계약 + revoke 직후/재승인/과거 문맥 테스트 케이스. 승인 없는 규칙은 PROPOSED | **G0 후보 규칙·Shadow 음성 검증 PR 진행, 공동 승인 미완료** |
| **S3 G1 양수 출처 선행 Pin** | P1 DB+Character | 모델에 실제 들어가는 Memory/Life Fact 및 파생 출처의 서버 생성 exact Record/Grant/Schema/Raw/Projection digest, Subject/Thread/Turn/Attempt 결속. **모델 호출 전** DB 불변 저장; 0건/누락/미지원/불명을 구분 | 원본 SQL 검토, 격리 PG17 Owner/ACL, 변조·누락·재발급/중복부여 음성, Provider 호출 0회 증명. 기존 1640 원본/1740 후보 기술 결함 독립 해결 | 0건 일부, 양수 미완료 |
| **S4 G2 원자적 Commit** | P1 DB+Security | 기존 Production Commit `cmd_commit_seyeon_chat_turn_runtime_v2`의 **동일 트랜잭션**에서 exact Grant/Record/Pin lock+validate+Commit. 별도 SELECT-before-COMMIT 금지 | 두 독립 PG 세션 Commit↔Revoke, 신규 Grant ID로 구제 실패, Subject/Character/Thread 교차 격리, deadlock/timeout, DB 최소권한 | 후보·격리 실험만, 실제 경로 미완료 |
| **S5 G3 최초 공개·Replay 보호** | P1 API+Security | HTTP 최초 Reveal, `committed_replay`, 과거 대화/Relationship Event/Reader 지식, worker 공개 직전에 현재 권한 재검증. 미확정 파생 출처·취소 시 **본문 0바이트** | API+DB 계약/무인가 Reveal 0회, 취소↔Reveal 독립 세션 경합, non-streaming 결정. 이미 전송된 바이트는 회수 불가 | 미완료 |
| **S6 G4 실제 비용/모델 통합** | P2 Character+DB+Security | 기존 영수증·예약·Worker 테스트를 실제 서버 Governor→Persist→Commit→Reply 경로에 연결. 레거시 RPC·직접 Provider 우회·중복 비용 방어 | 비용 없는 합성 E2E, 크래시/재시도/다중 Worker, 역할 ACL, 원장 idempotency. **유료 호출은 Owner 별도 승인** | 비용 하부 구조 부분 PASS, 종단 미완료 |
| **S7 G5 보안 종합/서비스 흐름** | P2 Security+QA | 1 사용자↔타 사용자, Grant 취소·재승인, 이전/현재 Context, Commit/Reveal/replay, 재시도·비용·장애·로그 인젝션 전수 매트릭스 | 테스트 대상=실제 서비스 경로, PG 2세션/HTTP, exact head CI+Full Integration → 병합 main CI. 유출·무단 비용·무단 공개 **0건** | 미완료 |
| **S8 DB 이력/배포/복구** | P3 Ops+DB | 남은 1520~1720 21개를 의존 순서·권한·기존 데이터·잠금/재시도·forward-only rollback 분류; 원격-only를 재실행·임의 repair하지 않음. 복구 후 새 암호화 백업→동일 백업 격리 복원 | 버전별 manifest/diff·격리 PG17 replay, 운영 dry-run 차단 여부, 백업/복원 artifact digest·Frontier/실제 함수 검증·RPO/RTO 승인. **과거 actor 신원 제출 요구 없음** | 미완료 |
| **S9 G6 제한적 운영** | P4 Integration Owner | G0~G5 증거/DR·보안 로그·알림·되돌리기 기준 승인 후, 내부 synthetic smoke→제한적 공개/유료 판단 | 범위, Owner, SHA, run URL, 사고 중단·권한 회수·비용 상한. 전단계 승인 없는 PUBLIC/PAYMENT 불가 | HOLD |

### S1 세부 수락 기준 (가장 먼저 실행)

1. 서버가 조립한 출처 스냅샷에 `personalRecordProjectionCandidates`가 `[]` 또는 지원된 레거시 생략 상태이면 현재 0건 계약을 유지한다.
2. `personalRecordAdmissions=[]`와 `retrievedMemories=[]`이더라도 candidate **양수/비배열/불명**이면 0건 proof 및 모델 전 HOLD가 **실패**해야 한다. Unsupported-only와 후보 없음은 기존 계약대로 처리한다.
3. 정상 0건 증명의 digest·Attempt 결속·기존 출력 형식이 달라지지 않아야 한다. 보안 음성 테스트, 리그레션, PR head CI·통합/병합 후 main 검증.
4. **S1 통과는 G1 양수, G2 Commit, G3 Reveal의 승인으로 간주하지 않는다.**

## 4. 의존성·중단 기준

```
S1 → S2(G0 공동 승인) → S3(G1 모델 전 양수 Pin)
                          ↓
                   S4(G2 DB 원자 Commit)
                          ↓
                   S5(G3 HTTP Reveal/Replay)
                          ↓
                   S6(G4 비용·AI 연결)
                          ↓
                   S7(G5 실제 경로 경합/보안 통합)
                          ↓
S8(운영 이력/동일 백업 복원 검증) ───┬→ S9(G6 운영 승인)
                                    └→ paid/public 여부 별도 의사결정
```

S8의 **비파괴/격리 검토는 S2~S7과 병렬 진행 가능**하며, S8 Production 쓰기·실배포는 항상 별도 권한으로 분리한다. 사용자 승인 없이 운영 정책 확정, 배포, 유료 AI 호출, 공개 Route 활성화를 수행하지 않는다.

**Fail-closed 조건:** 잘못된/불명 provenance·Grant, 분리 트랜잭션 Commit, 정확한 Replay 공개권한 미확인, 예산 미승인, 소유자/권한 불명, 오래된 DR 증거, 실제 production 데이터 위험 → 해당 기능 HOLD 및 회귀 테스트 추가.

## 5. 증거 관리·다음 작업

- 기존 [보안 완료 계약](../security/SEYEON_AI_SECURITY_COMPLETION_GATES_V1.md)의 A/B/C 판정 및 [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866) 체크리스트를 변경 없이 존중한다.
- 각 PR은 `{stage, scope, owner, exact_head_sha, CI/Full Integration, merge_sha, post-main CI, negative/positive cases, hold_reason, production_writes=0}`을 명시한다.
- 순서가 바뀌거나 차단 사유를 해결하면 이 **현재 로드맵의 해당 단계 상태를 실제 증거로 갱신**한다. 이슈에 작업 로그만 누적하고 로드맵을 옛 상태로 방치하지 않는다.
- **즉시 작업 S1:** 0건 출처 후보 위장/누락을 모델 이전에 차단하는 코드와 회귀 테스트를 작성하고 CI 통과 후 병합. 이후 S2+S3의 실제 exact Grant/Pin 설계를 처리한다.

## 6. 2026-10-16 S1 병합 후 S2 G0 진입 기록

- **S1**: [PR #2186](https://github.com/gycha0109-beep/MyeongHa/pull/2186) 병합 `5194395e4068dab1cf752a8f60da6e75ce6732dc`. `personalRecordProjectionCandidates`가 양수/비배열일 때 서버 ZERO 증명 및 모델 전 HOLD, security CI + Full Integration 성공. **이는 G1 양수 승인과 무관**.
- **S2 G0 후보**: [동의 취소·재승인·과거 Context·Reveal 계약](../security/SEYEON_G0_REVOKE_REGRANT_REVEAL_POLICY_CANDIDATE_V1.md)에서 exact Grant ID/원본 digest/과거 파생 lineage/non-streaming 후보/Commit-Revoke 선형화를 결정표로 제시. `seyeon-personal-record-publication-shadow-v1` **비운영 검사**에 raw content 변경·Grant 교체·중복·과거 유래 미확인 HOLD를 추가하고 before_commit/before_reveal 테스트를 연결한다.
- **정식 운영 상태:** S2는 **PROPOSED/검증 중**이며 Security+DB+Character 공동 승인 전까지 G0 APPROVED 아님. G1/G2/G3 결합이나 route/paid ON 없음. 구체적 CI/PR/병합 증거는 검증 후 원장 #1866에 기록한다.

## 7. 2026-10-16 S2-A 병합 및 S2-B 파생 출처 Census 방어

- **S2-A 병합 증거**: [PR #2195](https://github.com/gycha0109-beep/MyeongHa/pull/2195), exact head `b56f8f372df3c89e1b1107b820d5050b64bb7583`, squash main `843caec69ce1d2e6f5221738deb37e178358342d`. [Full Integration #38870682516](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38870682516) SUCCESS. 이는 G0 운영 승인이나 G2/G3 PASS가 아니다.
- **S2-B 현재 작업**: 기존 Shadow-only 검사에서 `relationshipHistoryRecords` 타입 누락·불명, `historyThroughRevision`과 Turn Revision 불일치, 활성 Event 수/Revision만 남고 실제 텍스트는 비어 있는 **숨은 파생 개인정보 흔적**을 HOLD. 지원되지 않는 `retrievedMemories.kind`도 단순 0건으로 오인하지 않고 HOLD. before_commit/before_reveal 음성 테스트를 추가한다.
- **남은 S2 결정**: G0-D1~D5 Security/DB/Character/API/Product 담당자 기술 승인과 실제 출처 폐쇄 범위·취소/공개 선형화 정책. Shadow가 성공해도 G0 APPROVED 아님. S3 양수 모델 입력 DB Pin, S4 동일 DB 트랜잭션 Commit, S5 최초 공개/Replay는 아직 미완료. 양수 Projector=[], public/paid OFF, Production DB 쓰기 0 유지.

## 8. S2-C — G0 미확정 파생 출처의 실제 Pre-Model 진입 차단 (개발 후보)

- **S2-B 결과:** [PR #2201](https://github.com/gycha0109-beep/MyeongHa/pull/2201), head `ca47a6cb81543043931100eacfce2b77ed61c6d8`, [Full Integration #38873621056](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38873621056) SUCCESS, main merge `0da7b19d99cb896943b939515d0d62c68621d987`. Shadow 검사가 제거·손상된 관계 이력 표식을 HOLD한다.
- **S2-C 실경로 안전 기본값:** 생산 Chat의 기존 `assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1`을 확장하여 아직 출처 폐쇄가 승인되지 않은 과거 User/Assistant 메시지, Relationship Event/원장, 양수 Revision 및 손상된 역사 메타데이터를 **Context Ready DB Pin/Preflight/Provider 이전**에 HOLD한다. 기존 정상 zero-personal + zero-derived 0건 경로만 통과한다.
- **의도적 기능 제한:** 기존 개별 대화 이력이 있는 내부 Chat은 이 정책 하에서 실행 불가할 수 있다. G0 파생 출처 검증 및 사용자 범위 승인 전까지 임의로 제외·우회하지 않는다. 이 경로는 `publicRoute=null`, `routeMounted=false`, Projectors=[] 및 유료 AI HOLD 그대로. S2-C 통과도 G0/G1 양수/G2/G3/G5 운영 PASS가 아니다.

## 9. 2026-10-17 S2-C 병합 및 S2-D `committed_replay` Reveal 기본 차단 (개발 후보)

- **S2-C 병합:** [PR #2206](https://github.com/gycha0109-beep/MyeongHa/pull/2206), exact head `4ec9fba58dfd905d0940d3c6d1e6a6cbf4a95b15`, [Full Integration #38876236891](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38876236891) SUCCESS (11/11 Job), main squash `2d86ea3bbecdd57a18d762fdac690dec553ac87a`. Governance SUCCESS; Supabase Production SUCCESS이며 `deploy-migrations` 및 `governed-seyeon-relationship-backfill-1400-1450`은 SKIPPED. G0 공동 승인이나 양수 개인기록 권한은 여전히 없다.
- **S2-D 위험:** 기존 `resolveSeyeonProductionCommittedReplayV1`은 Commit/Delivered의 assistantText를 오래된 저장 상태만으로 반환했다. `runSeyeonProductionChatExecutionV1`은 Model 이전 S2-C HOLD보다 먼저 재생 분기로 진입하므로 과거 파생 내용에 대한 새 권한 확인 없이 외부 Reveal할 위험이 있다.
- **S2-D 안전 기본값:** 현재 정확한 원본 Record/Grant 및 파생 lineage의 재생 시점 권한 확인/취소 경합 선형화가 구현되지 않았으므로 Commit/Delivered `committed_replay`를 전부 FAIL-CLOSED한다. 이미 저장된 assistantText를 오류/응답에 싣지 않고, 기존 비재생·종결 재시도 구분은 유지한다. 정상 재생과 후속 재생 복구 작업까지 임시 중단될 수 있다.
- **남은 실제 S5/G3:** 동일 권한을 HTTP 최초 공개, committed replay, worker 출력에 연결하고 두 PG 세션의 revoke↔reveal 경합을 검증해야 한다. 이번 코드·음성 테스트만으로 G3 PASS를 주장하지 않는다. Projectors=[], public/paid OFF, Production DB 쓰기 0 유지.

## 10. G1 S3-A — Governed Preflight 후 비공개 출처 차단 (2026-10-17)

- S2-D: [PR #2211](https://github.com/gycha0109-beep/MyeongHa/pull/2211), head `bfb181be338c0c20b4f521db1461f7d3c6e70c84`, [Full Integration #39010875270](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39010875270) SUCCESS, main `f6fac0cb4b4fe0e0a57438ca25919ff18c666622`; [main CI #39011269777](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39011269777) SUCCESS. Supabase Production migration/backfill SKIPPED.
- G1 출처 결손: 1640 zero Pin 이전에 모델 입력 출처는 0건이어도, 후속 Governed Preflight의 별도 `retrievedPrivateSources`는 원래 Pin에 없다. 신규 S3-A 검사에서 Production 실행이 이 배열의 누락·손상·양수 값을 Interpreter/Renderer/Reviewer 이전에 HOLD하도록 연결한다.
- **여전히 HOLD:** G0 Security/DB/Character 공동 승인, 양수 original Record/Grant DB Pin, Preflight 단계별 Provider Receipt, G2 atomic Commit 및 G3 HTTP 최초 Reveal. 이 검사 자체는 Provider 시작 전 DB 양수 Pin을 구현하지 않으며 Preflight classifier 동작까지 소급 차단하지 않는다. Projectors=[], public/paid OFF, Production DB writes=0 유지.

## 11. 2026-10-17 S5-A — 공통 Chat GET의 미승인 세연 History Reveal 차단

- **S3-A 완료 증거:** [PR #2216](https://github.com/gycha0109-beep/MyeongHa/pull/2216), exact head `6556a916a2a5a9c97b6238f6c539f7c778fdfdde`, [Full Integration #39012428980](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39012428980) SUCCESS, main squash `1a761c2f71f1bceaa6ea5d3f43f8991ee2be66fd`. Preflight에서 비공개 Source를 추가할 경우 Interpreter 이전 HOLD, 아직 G1 positive Pin 아님.
- **새로 확인된 S5 공개 우회 후보:** 공통 `GET /api/chat/:threadId`는 DB Thread Binding의 정렬된 참가 Character 조회 후 `qry_chat_thread_stream_v2`로 assistant 본문/메시지 Payload 및 `qry_character_relationship_v1` 관계 상태를 읽는다. 과거 세연 발화의 정확한 원본 Grant/derived provenance와 현재 권한을 검사하는 DB Owner Reveal 경로는 미구현이다.
- **S5-A 거부 우선 방어:** DB-authoritative Participant 목록에 `seyeon`이 포함된 경우 Primary/Secondary에 상관없이 Stream/Relationship 조회 전 503/no-store로 HOLD. 본문/모델 추출 값이나 Caller Character ID로 허용하지 않으며 기존 타 Character Chat GET은 유지한다. 긍정 Proof나 승인된 Scoped Reveal이 없는 한 사용자 이력 열람이 제한될 수 있다.
- **다음 조건:** G0 D-04/D-05/D-09 등 Owner의 과거 응답·Revoke 선형화 결정과 실 PostgreSQL 2세션 current-rights HTTP 최초 Reveal/Replay/History 검증. 이 PR만으로 G3 PASS나 운영 공개 허가를 주장하지 않는다. Projectors=[], public/paid OFF, Production DB writes=0.

## 12. 2026-10-17 S3-B — 양수 비공개 Retriever 조회 이전 Zero-Only 차단

- **S5-A 완료:** [PR #2219](https://github.com/gycha0109-beep/MyeongHa/pull/2219), head `19ddce596b1ad831f593db18120405861ef3d977`, [Full Integration #39013758297](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39013758297) 재시도 2차 SUCCESS, squash main `3bce2f7e9bb7214f7a1e2320b32e28b13a9324db`, post-main [CI #39014493234](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39014493234) SUCCESS, Governance/Production SUCCESS (migrations/backfill SKIPPED). 최초 Full Integration의 `concurrent attempt retry dedupe` 실패 이력은 보존하며 G2 PASS 증거로 승격하지 않는다.
- **S3-B 발견 공백:** [S3-A/#2216](https://github.com/gycha0109-beep/MyeongHa/pull/2216)는 Governed Preflight가 `retrievedPrivateSources`를 반환한 **후** 검사했다. 미승인 양수 출처를 이미 Retriver에서 읽은 것은 모델 이후 HOLD로 소급 방지할 수 없다.
- **S3-B 구현 후보:** Producer Production 경로에서 Disclosure Preflight 판정 직후, private-source `retriever.retrieve` 이전에 `beforePrivateSourceRetrieval` 검증을 실행한다. `not_sensitive` + source/factAuthority/decision=null 또는 `sensitive` + `retrievalScope={depth:none,sourceRef:null}`만 통과. 범위 양수/불명/손상 시 읽기 전에 HOLD. Post-Preflight 검사는 독립 유지. 범용 Character 호출은 옵트인하지 않으면 기존 동작 유지한다.
- **제한/다음:** Disclosure classification, `sourceDescriptor` 및 `factAuthorityResolver` 조회는 이 검사 이전에 일어날 수 있다. 실제 양수 original Grant/Record DB Pin과 2세션 revoke↔retrieval/commit/reveal, 모델 호출 단계별 source receipt는 G0 기술 승인 후 별도 진행한다. 미승인 양수 Projectors, public/paid, Production DB writes 모두 0 유지.

## 13. 2026-10-17 S3-C — 민감 Source Descriptor/Fact Authority 조회 전 차단

- **S3-B 기술 완료:** [PR #2226](https://github.com/gycha0109-beep/MyeongHa/pull/2226), exact head `0030c72e6b10995e00107dd128d2b4435abfe1bf`, [Full Integration #39016030445](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39016030445) 11/11 SUCCESS, main squash `059d5c3c7595bbcedf90df3ebbc399794533d94a`. [병합 후 Governance](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39017444001)와 [Supabase Production](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39017443970) 성공, Production migrations/backfill SKIPPED. [병합 직후 main CI #39017444102](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39017444102)는 후속 main 업데이트로 CANCELLED; 사후 main CI 성공으로 기재하지 않는다.
- **잔여 S3-C 취약 윈도:** S3-B는 `retriever.retrieve` 이전에 차단하나, 민감 주제인 경우 `sourceDescriptor.readDescriptor` 및 `factAuthorityResolver.resolve`가 먼저 호출된다. G0 승인 없는 Character/Fact 관련 비공개 메타데이터 접근이 이 순서에 남아 있다.
- **S3-C 작업 후보:** Disclosure Topic Classification이 민감 주제를 식별하는 즉시, descriptor 읽기 전 Production-only `beforeSourceDescriptorRead`에서 HOLD한다. `topicKey=null`로 검증된 일반 질문만 통과. 범용 Character 호출 시에는 옵트인하지 않으므로 기존 메타데이터 읽기 동작을 유지한다. S3-B Retriever 이전 및 S3-A Retriever 이후 차단도 독립 유지한다.
- **남은 경계와 제한:** Topic/Integrity Classifier 및 Integrity Authority Resolver는 해당 Hook 전에 실행될 수 있다(병렬 Preflight). G0 없이 Positive Grant/Record Pin이나 G2 Commit, G3 최초 공개/Replay/History를 승인한 것이 아니다. 모델 비용·읽기 자체의 권한 증명/선형화, 전체 단계별 source receipt는 별도 작업. Positive Projectors=[], paid/public OFF, Production DB write=0 유지.

## 14. 2026-10-17 S5-B — HTTP 최초 Reveal의 미승인 송출·비용 호출 사전 차단

- **S3-C 병합:** [PR #2231](https://github.com/gycha0109-beep/MyeongHa/pull/2231), exact head `d018d6a94fa7296c5044cb8c577a5e973d9b29a0`, [Full Integration #39017876487](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39017876487) SUCCESS (11/11), main squash `d45c68f4aca11f91dd06a9b92ea70430d69241a8`. 해당 main SHA의 [CI #39018881312](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39018881312)는 이후 타 트랙 main 병합으로 CANCELLED, Governance [#39018881261](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39018881261), Supabase Production [#39018881244](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39018881244) 성공이며 deploy-migrations/backfill SKIPPED.
- **새로 검증한 S5-B 우회 위험:** `handleSeyeonChatTurnSendRequestV1`의 `POST /api/chat/:threadId/turns`는 member 인가 및 Production 실행 후 `projectResult`로 모델 신규 `runtimeResult.envelope.utterance` 또는 replay `assistantText`를 바로 성공 HTTP JSON으로 공개했다. 이 지점에는 원본 Record/Grant와 Derived Source의 현재 권한/취소 경합 선형화 검증이 없었다.
- **안전 구현:** 정식 G3 Reveal DB Owner 계약 전까지 이 서버 측 세연 전용 POST에서는 검증된 Member+정상 Body 이후에도, 비용 있는 Production Runtime/Provider 호출 전에 **503/no-store, opaque `SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE`** 로 실패시키고 assistant 본문·Payload 0바이트를 보장한다. 다른 캐릭터 API, Auth 실패/invalid 요청과 구조적 입력 검사까지 봉쇄하지 않는다. 기존 S2-D committed replay, S5-A history GET 차단을 유지한다. 기존 internal dogfood Chat POST는 이 사전 차단으로 503을 받을 수 있으므로 정상 동작과 혼동하지 않는다.
- **G0/G3 미승인 유지:** 임시 부정권 검사는 정식 current exact Grant/Record+derived lineage, 최초 공개/replay/이력 Reader/Worker 및 2세션 Revoke↔Reveal 선형화, 유료 AI/공개 Route 활성화를 구현하거나 승인하지 않는다. G1 Positive DB Pin, G2 atomic Commit, G3 PASS 미완료, Projectors=[], Production DB writes=0.

## 15. 2026-10-17 R0 — G0 기술 승인 요청과 양수 Projector 생성·실행 경계 차단

- **S5-B 완료:** [PR #2236](https://github.com/gycha0109-beep/MyeongHa/pull/2236), head `8d84cc083fe7236b9bda80f2fef6ac3a808e58f9`, [Full Integration #39019410071](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39019410071) SUCCESS (11/11), main squash `bdc1a15f5a79f9a90a21caab8b64be54d94f762e`; post-main [Governance #39020008042](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39020008042), [Production #39020008036](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39020008036) SUCCESS, migrations/backfill SKIPPED. [main CI #39020008045](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39020008045)는 진행 중 결과 또는 후속 SHA에 따라 재검증 필요; **SUCCESS 미확인 상태에서 PASS로 기재하지 않는다**.
- **R0 서명 요청:** [G0 3개 기술 승인 요청서](../security/SEYEON_G0_OWNER_TECHNICAL_SIGNOFF_REQUEST_20261017.md)를 새 문서로 작성. 기존 [Product Owner 정책 방향 승인 기록(미병합 Draft #1985)](https://github.com/gycha0109-beep/MyeongHa/blob/feat/seyeon-offline-granted-turn-consent-gates-v1/docs/security/SEYEON_G0_PRODUCT_OWNER_POLICY_APPROVAL_2026-10-13.md)은 재승인 요청하지 않는다. D-01 SRC-25 타입/Provenance, D-03/06 DB Original Grant+zero XOR positive/Commit, D-04/05/09 Security/API Reveal 경합의 **실제 Owner 서명**은 여전히 OPEN.
- **방어 코드:** `createProductionSeyeonChatRuntimeV1` 초기화 시점과 매 `run` 직전 **등록된 Projector가 빈 배열인지 검증**하여, G0/SRC-25/G1 승인 전에 실수로 양수 Memory Projector를 등록하더라도 DB Subject 처리/Provider 실행 전 HOLD. 서버 소유 범용 직접 테스트 seam과 차별화한다. 본 검사는 **Positive DB Pin 구현이 아니며**, 소스 권한을 부여하지 않는다.
- **실행 제한:** Draft #1985의 합성 양수 Pin/Commit/Reveal 코드는 재현 자료로만 참고. 전체 병합·승인된 Provider/HTTP 권한으로 승격하지 않는다. 양수 DB SourceSet/Edge·Stage Receipt·1640 Commit 트리거/ACL/실 운영 DB 쓰기와 유료/공개 활성화는 정식 Owner 결정 + 각각의 Gate 전까지 HOLD. [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) Production 이력/DR도 미완료.


## 16. 2026-10-17 R1 — 양수 SourceSet/Edge·1640 XOR 격리 회귀 검증

- **작업 성격:** Draft #1985의 전체 병합이 아니라, 최신 main의 DB Authority CI에서 원본 Attempt와 original Grant에 묶인 test-only Positive SourceSet Parent/Edge 및 1640 zero-only Pin 양방향 XOR를 독립 PostgreSQL 세션으로 재검증하는 테스트 경로만 채택합니다.
- **범위:** `test/db/seyeon_positive_grant_attempt_bound_candidate_v1.sql`, `test/db/seyeon_positive_source_set_parent_edge_candidate_v1.sql`, `test/db/seyeon_positive_source_set_exact_attempt_race_v1.sh`, 격리 runner 및 기존 `run_authority_core.sh` 연동. PostgreSQL DB 이름과 `CI=true`, `PGHOST=localhost`를 모두 강제합니다.
- **검증 목표:** 실제 Chat Attempt 결속, 중복·교차·조작 Pin 거부, 원 Grant 취소 후 다른 Grant 재발급에 의한 기존 Attempt 재사용 거부, positive-first/zero-first의 실 DB lock-wait 후 상대 Pin 거부. 잘못된 영속 Positive 인가를 허용하지 않습니다.
- **성격 제한:** 테스트 SQL은 disposable DB에서만 실행하며 **Production migration·기존 1640 trigger·API executor 실제 운영 권한·Projector·Provider·HTTP Reveal을 수정하지 않습니다**. 이 테스트가 성공해도 `G0=OPEN`, `G1 positive=HOLD`, `G2/G3=HOLD`입니다. Draft #1985의 G2/G3 Owner 후보는 본 변경에 포함하지 않습니다.
- **작업 PR:** [#2245](https://github.com/gycha0109-beep/MyeongHa/pull/2245) (`Watchtower-Track: security`); 최초 테스트 코드 commit `3714364b92f835a8954c9c72cccd7516ab70285f`.
- **첫 검증 (최초 코드 commit의 정확한 HEAD):** [CI #39029430475](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39029430475)의 `db-authority-core`, `Work Track · security`, `CI Verify` SUCCESS; [Governance #39029430572](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39029430572) SUCCESS; [Web #39029430458](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39029430458) SUCCESS. 실패·재시도 0건 (첫 검증 기준). DB R1 검증은 기존 `run_authority_core.sh`의 `myeongha_seyeon_positive_pin_candidate_test` 격리 테스트에서 실행됐습니다.
- **최종 HEAD 및 Full Integration:** 문서 증거 commit 이후 새 HEAD로 CI/Governance 및 Full Integration을 별도 확인합니다. 성공하지 않은 결과를 미리 PASS로 기록하지 않습니다. exact SHA·Full Integration Run·병합 결과·후속 main 증거는 PR #2245 및 #1866 원장에 추가합니다. `G0 OPEN`과 운영 DDL/Positive 권한/공개 HOLD는 변하지 않습니다.


## 17. 2026-10-17 R2 — 실제 v2 Commit과 Original Grant 취소 경합의 격리 검증

- **목적:** G0 기술 승인 없이 진행 가능한 R2 실증. Draft #1985 전체를 병합하지 않고 **실제 기존 `cmd_commit_seyeon_chat_turn_runtime_v2` → v1 → core + 두 Outbox**를 격리 PostgreSQL에서 호출해, 정확한 Original Grant 취소와 Commit의 2세션 선형화·원자성을 검증합니다.
- **범위:** R1의 Parent/Edge/XOR 테스트 기반을 동일 이름의 **새 disposable clone**에서 재사용. 기존 운영 1640 트리거 함수 및 v1/v2 ACL은 **오직 격리 DB에서** 실제 후보로 교체/취소하며 운영 마이그레이션 파일은 변경하지 않습니다. G1 context_ready만 분리하여 G3 Reveal/History SQL을 설치하지 않습니다.
- **필수 증거:** revoke-first에서 상대 세션이 실제 잠금 대기 후 Commit/메시지/두 Outbox/Admission 0건; commit-first에서 취소 세션이 잠금 대기 후 기존 v2 Commit + 두 Outbox가 정확히 1회 기록되고 Original Grant는 철회됨; 위조된 Proof·새 Grant 대체·후반 Outbox 충돌 시 전체 롤백. 실행 조건은 `CI=true` + `PGHOST=localhost` + 정확한 scratch DB 이름.
- **금지:** G0 미서명인데도 실제 양수 Projector·Production G1/G2/G3·양수 모델 전달/최초 Reveal·Legacy 운영 ACL 변경·운영 DB DDL/DML/백필을 활성화하지 않습니다. 코드·테스트 준비 및 격리 PASS는 **운영 승인과 별개**이며 `G0 OPEN`, `G1 positive/G2/G3 HOLD`입니다.
- **실제 코드 PR:** [#2250](https://github.com/gycha0109-beep/MyeongHa/pull/2250), 최초 10-test 구현 `b93839981ba69bdaf34bbfe8ff668d10c884e64e`, 최초 TypeScript suite 수정 HEAD `1313cc654ff982542722ef33f2be8fa142ff98e4`. 최초 요청 Run [CI #39031240720](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39031240720), [Governance #39031240610](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39031240610), [Web #39031240704](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39031240704). 최초 HEAD의 [CI #39031336229](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39031336229) **Work Track security FAILED**: `test/seyeon-g2-atomic-original-grant-race-disposable.test.ts`에서 원본 Draft 분리 과정 중 `actualCommit` 테스트 helper 누락(`TS2304`), `TS18046`은 종속 타입 오류. 보안 검사 약화 없이 정확한 original v2 호출 helper를 복원해 **새 SHA**에서 재검증합니다. [Governance #39031336258](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39031336258) 및 [Web #39031336266](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39031336266)은 SUCCESS; 이 성공은 변경 후 재사용하지 않습니다.
- **최종 검증 규칙:** 문서 변경 후 **새 HEAD**의 정확한 CI·Governance·Web와 Full Integration 전체 성공만 병합 허용. PR과 [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866)에 실제 HEAD SHA·Run URL·성공/실패/재시도·병합/사후 main 증거를 추적합니다. G0 및 운영 DDL/ACL/Reveal 승인으로 승격하지 않습니다.


## 18. 2026-10-17 R3 — DB JSONB 원본 Digest와 Node 투영 Digest의 직렬화 계약 확인

- **근거:** Draft #1985의 `test/seyeon-source-digest-node-postgres-golden-v1.test.ts` 7개 실증 케이스를 선별하여 새 스키마·별도 운영 권한 없이 기존 R2 격리 DB runner에 연결합니다. 동일한 실제 Attempt/Original Grant를 확인하고, 키 순서·공백·Unicode·중첩 JSON 사례에서 PostgreSQL `jsonb::text`와 Node `canonicalJson`의 **서로 다른 바이트 표현을 각각 정확하게 해시**하도록 검사합니다.
- **음성 핵심:** `sha256:pg-jsonb:v1:`로 저장된 DB 원본 digest를 `sha256:v1:` Node 투영 해시로 취급하거나, 해시 자체를 Grant 승인/신뢰 서명으로 승격하지 않습니다. 원본 SHA와 투영 SHA는 별개 계약이며 Provider 실제 wire bytes는 **추가 검증 미완료** 상태입니다.
- **환경/범위:** `CI=true`, `PGHOST=localhost`, scratch DB `myeongha_seyeon_positive_pin_candidate_test`만; 운영 DB DDL/DML/ACL/Positive Projector, API/G3 Reveal, 새 Workflow 없음. 해당 R3 결과는 G0 권한 정책·Codec 승인이나 G1/G2/G3 Production PASS를 뜻하지 않습니다.
- **실제 PR·첫 증거:** [PR #2253](https://github.com/gycha0109-beep/MyeongHa/pull/2253), 최초 commit `dc7da7c4880426b8fa9df4b2b12ed5cc75f70a2d`, 최초 요청 [CI #39032505352](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39032505352), [Governance #39032505286](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39032505286), [Web #39032505441](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39032505441); 현재 수행 중이므로 PASS는 별도 결과 확인 후 기록합니다.
- **최종 규칙:** 본 문서 evidence 수정 후 exact 새 HEAD에서 CI/Governance/Web/Full Integration을 다시 확인하고, 병합/병합 후 main Run 링크·SHA·실패/재시도는 PR과 #1866 원장에 기록합니다. G0 실제 Owner 승인 없음.


## 19. 2026-10-17 R4 — 실제 OpenAI Adapter 요청 바이트와 DB Owner Stage Receipt의 격리 실증

- **범위:** #1985 Draft에서 **격리 전용** `provider_stage_receipts_r2`와 `claim_owner_dispatch_r2`만 선별하고, 현재 main의 실제 `createOpenAiSeyeonStructuredProviderV1`가 직렬화한 본문을 `meteredBeforeDispatch`에서 DB로 제출해 **DB가 직접 `sha256:utf8:v1`과 바이트 길이**를 계산하는 것을 검증. 기존 R1 Original Grant / SourceSet과 정확한 Attempt를 확인.
- **테스트:** 2종 Preflight classifier + Interpreter/Renderer/Reviewer 등 5종 Stage 순서·중복 차단, 취소된 original Grant의 새 Grant 재발급으로 옛 Attempt 구제 불가, Adapter `fetchImpl`에서 실제 동일 바이트 확인. Synthetic fake fetch만 사용하며 외부 API와 유료 모델 호출은 0건.
- **제한:** Stage DB RPC는 운영 기능·DDL로 배포하지 않습니다. DB 세션이 Commit한 뒤 실제 HTTP 바이트 송출까지의 **revoke 경쟁·암호학적 서명·transport attestation은 보장되지 않음**. G0 D-03/D-04/D-06 승인 및 G1 positive/G2/G3 Production은 여전히 HOLD. Zero Projector, no public/paid, no existing workflow changes.
- **첫 검증 증거:** [PR #2255](https://github.com/gycha0109-beep/MyeongHa/pull/2255), 최초 테스트 코드 HEAD `c049fbd8cb8ed5fd80f4ef6e3daafe28f9935f40`. [CI #39034090088](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39034090088) SUCCESS: `db-authority-core`의 **3개 실제 OpenAI adapter → DB exact UTF-8 Stage Receipt 검사 PASS** + 보안 트랙 및 R1/R2/R3 회귀. [Governance #39034089993](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39034089993), [Web #39034089992](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39034089992) SUCCESS. 실패·재시도 0건 (첫 검증 기준).
- **완료 조건:** 이 문서 증거 수정 뒤 **최종 HEAD**의 CI/Governance/Web, exact-head Full Integration 11/11, squash main SHA·main CI/Production skips 확인. 실행 기록은 [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866)과 PR에 추가합니다. G0/G1/G2/G3 운영 승인은 계속 HOLD.

## 20. 2026-10-17 R5 — 실제 v2 Commit 이후 Current Original Grant의 DB 공개 경합 격리 검증

- **선행 R4:** [#2255](https://github.com/gycha0109-beep/MyeongHa/pull/2255), exact HEAD `4ec36cbe3039c535e005aabeedb1a3bb1003844c`, [Full Integration #39035023626](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39035023626) 11/11 SUCCESS, main squash `35ab8ae365b420d96186cb933dd2f1b40c84fdaa`. [병합 후 main CI #39036400952](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39036400952) SUCCESS가 이번에 추가 확인되었습니다.
- **새 R5 범위:** Draft #1985의 G3 SQL에서 **읽기 검증 함수 부분만** 선별, 실제 v2 Commit으로 저장된 Assistant의 최초 공개/Replay/History Page를 exact original Grant+Record, SourceSet/Pin, validated provenance 및 현재 DB 잠금 아래 검사. 단일 사용/변조 ID/취소 후 재동의/Redaction/독립 두 세션 revoke-first·read-first 경합의 테스트. 기존 `test/db/seyeon_r2_disposable_actual_v2_revoke_race.sh`에만 연결하고 **폐기용 단일 이름의 CI PostgreSQL clone에서 실행**.
- **권한 구분:** 이는 DB 쿼리의 COMMIT 선형화 시험이며 이미 읽어 버퍼된 답변의 **늦은 HTTP 전송 바이트**까지 안전하다는 증거가 아닙니다. 기존 Production POST/Replay/GET 차단 유지. G0 실제 Security/DB/Character Owner 기술 서명 미확보, G1 양수/G2/G3 운영 권한과 Public/Paid 여전히 HOLD. 운영 migration·ACL·Provider 호출·실제 출처·History 복구 0건.
- **R5 코드·검증 PR:** [#2263](https://github.com/gycha0109-beep/MyeongHa/pull/2263), 첫 HEAD `85d36137b877b91b77589273b28e83ab2d6bb511` → 테스트 격리·redaction fixture 보수 HEAD `877007730acfeb05ca8c7bd293fc583d8aa1204d`. [첫 CI #39038108767](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39038108767)는 기존 R4 합성 fixture ID 충돌로 실패, [두 번째 CI #39038330247](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39038330247)는 redaction_reason 누락으로 **5/6 PASS 및 1 실패**. 테스트 자체/권한 검사 완화 없이 fixture ID 71~76과 정규 `conversation_delete` 사유로 수정했습니다.
- **수정 코드 HEAD 실 PostgreSQL 검증:** [CI #39038489513](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39038489513)의 `db-authority-core` SUCCESS, **R5 6/6 실제 DB 테스트 PASS**, `Work Track · security` SUCCESS. [Governance #39038489406](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39038489406) SUCCESS, [Web #39038489503](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39038489503) SUCCESS. **CI Verify/전체 CI 완료 상태와 통합 검사 11/11, merge/post-main은 검증 전이므로 PASS로 기록하지 않습니다.**
- **최종 승인 조건:** 마지막 코드·문서 HEAD로 CI/Governance/Web을 다시 검증, `ci-integration-ready` 후 같은 HEAD Full Integration **11/11** 및 squash 이후 main CI/Production skips를 별도 확인합니다. G0/Production G1~G3/Hold는 병합 여부와 무관합니다.


## 21. 2026-10-18 R6 완료 / R7 — DB Read COMMIT → 지연 HTTP 송출의 비승인 경계 확인

- **R6 병합 검증:** [PR #2268](https://github.com/gycha0109-beep/MyeongHa/pull/2268) exact HEAD `7a9604b1a2fdc90d0b41edf8bc296e29c8d38281`, [Full Integration #39041348640](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39041348640) **11/11 SUCCESS**; squash main `e2c816aa0872b3cb1abad4e6f298f89c84f87b9f`. 사후 [CI #39059645565](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39059645565), [Governance #39059645530](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39059645530), [Supabase Production #39059645557](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39059645557) **SUCCESS**; deploy-migrations 및 관계 backfill **SKIPPED**.
- **R7 추가 검증 범위:** 이름이 고정된 폐기용 CI PostgreSQL에서 실제 G1 positive Pin→기존 v2→v1→core Commit/2 Outbox→R5 Owner-style HTTP Read COMMIT이 정상적으로 반환한 합성 Assistant bytes를 별도 버퍼에 유지한 채 원본 Grant 철회를 확정합니다. 이후 fresh DB Read는 거부되지만 **과거 버퍼에는 본문이 남는 사실**을 확인합니다. 그 사이 async Member 검증을 대기 중인 실제 Production 세연 HTTP 핸들러는 기존 first Reveal interlock 때문에 503/no-store, Runtime 호출 0회, Assistant wire bytes 0건이어야 합니다.
- **해석 제한:** 기존 Production HTTP 경로는 최초 공개 전체를 HOLD하므로 R7은 **현재 HOLD 안전 회귀**와 **DB Read COMMIT만으로 실제 뒤늦은 전송 안전성을 증명할 수 없다는 반례**입니다. G3 정식 긍정 공개가 가능하다는 증거가 아니며, 미래 락/epoch/취소 완료 응답/송신 경계 계약(D-04)은 DB+Security+API 기술 서명이 필요합니다.
- **변경 금지:** Production migration/ACL/DML, 양수 Projector, 실 Provider, Runtime 공개 연결, 유료/공개 전환 0건. 실 G0 Character/Source D-01·DB+Security D-03/D-06·Security/API/DB D-04/D-05/D-09 기술 승인은 여전히 OPEN. Product Owner 기존 정책 승인 재요청 금지. 본 R7 PR의 exact-head CI/Governance/Web/Full Integration 및 병합 증거는 #1866 원장으로 별도 추적합니다.

## 22. 2026-10-18 R8 — D-04 로컬 실제 HTTP 송출 지연 경합 (승인 전 부정 테스트)

- **목적:** R7의 DB→Node 버퍼 반례 및 PR #2277의 Web Response/라우터 시험 다음에 실제 `127.0.0.1` HTTP 소켓에서 `Response` 구성과 클라이언트 수신 사이의 시간 분리를 검증합니다.
- **추가 코드:** `test/seyeon-d04-loopback-http-revoke-race-v1.test.ts`. 실제 Node HTTP 서버를 통해 Vercel 정규화 함수와 Production 세연 최초 POST 핸들러를 호출하고, 서버가 `Response`를 만든 뒤 소켓 쓰기를 보류합니다. 합성 취소 이벤트 이후 전송해도 현재 HOLD 경로에서 503/no-store, Runtime 0회, 비밀 Assistant canary 0바이트를 요구합니다. 원본·재작성 두 경로를 모두 검사합니다.
- **실패 계약 실증:** 별도의 **고의로 불안전한 합성 서버**에서는 취소 이전에 생성한 `Response.json`을 취소 이후 실제 소켓으로 보낼 수 있음을 보여줍니다. Production 핸들러에 양수 공개 분기를 추가하지 않습니다.
- **증거 한계:** 이는 loopback Node bridge이고 실제 Vercel Edge/Proxy, 실제 DB 취소 COMMIT과 네트워크의 분산 원자성, 이미 전송된 잔여 바이트 제어, Worker/History 권한을 입증하지 않습니다. 따라서 G0 D-04 미승인, G1 양수/G2/G3/G6 HOLD입니다.
- **검증 규칙:** 정확한 PR HEAD의 CI·Governance·Web와 Full Integration 11/11, squash 후 main CI/Governance/Production 및 migration/backfill SKIPPED가 확인될 때만 이번 격리 회귀 작업 완료로 기록합니다. Owner 기술 서명이나 실제 전송 허가로 승격하지 않습니다.

## 23. 2026-10-18 Product Owner 기억·철회·과거대화 선택 승인 (기술 게이트는 HOLD)

- **제품 선택 승인 기록:** [세연 개인기억·철회·과거대화 Product Owner 결정문](../security/SEYEON_PRODUCT_OWNER_MEMORY_REVOKE_HISTORY_DECISION_20261018.md). 사용자가 저장·캐릭터별 공유를 직접 정하며, 철회가 확정되면 미래 개인기억 활용·미송출 공개를 막고 진행 중 작업 중단을 시도합니다. 이미 네트워크로 전송된 바이트는 회수 불가합니다.
- **과거 기록:** 철회와 일괄 대화 삭제를 동일시하지 않습니다. 하지만 보존된 메시지의 AI 재활용/검색/요약, 파생 출처, History GET·replay/Worker의 새로운 공개는 별도 현행 권한 검사가 없으면 HOLD합니다. 명시적 삭제 요청과 법률상 삭제 의무는 별도로 준수합니다.
- **기술 승인 미완료:** G0의 exact Grant/Record, 최초 recordType/schema/projectorVersion, Digest/DB 잠금/ACL 및 D-04 `R/V/S/ACK` 취소-송출 선형화 계약은 Character/Source, DB/Security, API 기술 Owner 서명 및 실제 경합 테스트 전까지 PROPOSED입니다.
- **절대 비승격:** 이번 승인은 G0 APPROVED, G1 양수/G2/G3/G5/G6 PASS, Production migrations/ACL/DB writes, real Provider, 유료/공개 활성화가 아닙니다. Projectors=[]·public/paid OFF·Production writes=0 유지합니다.

## 24. 2026-10-18 R9 — 실제 PostgreSQL original Grant 철회 + 실제 HTTP 소켓 송출 경합 격리 시험

- **승인된 제품 기준:** [2026-10-18 Product Owner 정책](../security/SEYEON_PRODUCT_OWNER_MEMORY_REVOKE_HISTORY_DECISION_20261018.md). 사용자의 기억 범위 선택 유지, 철회 후 새로운 기억 활용/미송출 공개 차단, 기송출 바이트 회수 불가, 과거 대화 보존과 AI 재사용/삭제 분리. 운영 G0 기술 서명은 여전히 별개.
- **실제 테스트 추가:** 기존 전용 CI PostgreSQL 17 클론에서 `seyeon_positive_candidate.reveal_http_r5`의 실제 original Grant/Record/Attempt/Commit으로 정상 읽은 합성 Assistant text를 Node에 버퍼링. HTTP 송출이 아직 없는 `127.0.0.1` 서버에서 Vercel 원본/alias 경로의 Production 세연 POST 응답을 준비한 후, **별도 실제 PostgreSQL 트랜잭션으로 original Grant 철회 COMMIT**. 그 다음 원본 DB current-rights 조회/History는 거부되고, 실제 socket 송신에서도 503/no-store·Runtime 0회·합성 Assistant text 0바이트를 요구.
- **반례 추가:** 같은 격리 DB 실증에서 실 DB 읽기 성공 후 철회하고 **고의로 안전하지 않게 구현한 합성 HTTP 소켓 서버**가 버퍼된 응답을 철회 후 보내는 반례를 검증. 이는 위험 재현이지 Production positive Reveal이 아니다.
- **기술 계약 구체화:** [D-04 철회 ACK·송출 경계 기술 후보 v1](../security/SEYEON_D04_REVOKE_ACK_HTTP_SEND_CONTRACT_CANDIDATE_V1.md). `P/C/V/R/S/ACK`의 시점을 구분하고 `V→R→ACK→S` 위험, 원본 Grant·derived lineage, 비스트리밍, 송출 측 fence/lease·proxy·재시도 검증 필요를 Security/API/DB 기술 승인 후보로 기록.
- **실행 경계/CI 누락 방어:** 기존 `test/db/seyeon_r2_disposable_actual_v2_revoke_race.sh`가 호출하는 `test/seyeon-r5-current-reveal-disposable.test.ts`에 시험만 추가. 최초 CI 분류에서 DB 검사가 SKIPPED되는 공백이 발견돼 `scripts/ci/db-pr-router.mjs`가 이 실제 PostgreSQL 의존 테스트 변경을 `postgres17`로 배정하고 **`scripts/ci/pr-gate-router.mjs`도 DB authority-core 실행을 강제**하도록 둘 다 수정해 `tests/ci-pr-scope.test.ts`로 회귀 고정. **최종 HEAD에서 `db-authority-core`가 실제 R9 테스트를 실행·성공한 로그가 확인되어야만 통과**. 운영 SQL·role·ACL·provider·positive Projector·HTTP 양수 공개 코드는 추가하지 않음. CI/Governance/Web/Full Integration 및 main 완료 증거는 PR과 #1866에 기록.
- **미해결:** G0 technical signoff, 실제 Production positive pre-model source Pin 및 atomic Commit, 실제 Node/Proxy 송출과 철회 ACK의 보장, 최초 positive HTTP/History/Replay/Worker, G5/G6·DR 모두 HOLD. Production DB writes=0, public/paid OFF.


## 25. 2026-10-18 R10 — original Grant DB-lock → 실제 Node HTTP send 순서 후보 (격리 전용)

- **선행 R9:** PR #2292 exact HEAD 6387361f7dd583e6b6343ca684893c6fe146af99, Full Integration #39113983792 **11/11 SUCCESS**, head-guarded squash main 67fc8fab9897ec3c0eb3c1f8cccdfc7f20f15962. 소스 CI #39113403528는 DB authority-core의 원본 Grant/실 DB→HTTP 테스트 **10/10 PASS**, Governance #39113403527, Web #39113403522 SUCCESS. 병합 후 main 점검은 별도 완료 증거를 #1866에 기록.
- **R10 이번 개발 범위:** 기존 격리 PostgreSQL clone 내 실 original Record/Grant·R5 current-rights DB 함수와 Node 127.0.0.1 HTTP Server를 연결. **Send-first**에서는 DB Subject/Grant SHARE 잠금을 가진 동일 트랜잭션에서 Node ServerResponse.end()/finish를 완료한 뒤 DB 잠금을 해제하고 별도 revoke 트랜잭션이 COMMIT하도록 두 세션 잠금 경합을 재현. **Revoke-first**에서는 별도 트랜잭션이 먼저 original Grant를 철회하고, 대기 중인 DB read가 NULL을 반환하며 실제 HTTP body는 503/no-store 외 0 protected bytes. 양쪽에서 기록 보존·철회 후 History/Replay 거부.
- **기술 검토:** [D-04 R/V/S/ACK 후보](../security/SEYEON_D04_REVOKE_ACK_HTTP_SEND_CONTRACT_CANDIDATE_V1.md) §6. Node finish는 네트워크 인계일 뿐 실제 Vercel/Proxy/클라이언트 수신 보장이 아니고, DB 잠금을 HTTP 완료까지 지속하면 느린 클라이언트·자원 고갈 위험이 있으므로 운영 채택/positive Reveal에는 여전히 Owner 계약과 후속 검증이 필수.
- **검증:** 동일 격리 CI database에서 R5/R9 기존 10개 + R10 2개 (총 12개) 실행. 정확한 PR HEAD의 db-authority-core·PG17·CI/Governance/Web 및 Full Integration 11/11 성공 뒤에만 병합. 실패 시 테스트·권한 검사를 완화하지 말고 격리 원인 수정. 실패/재시도/head/main 증거는 #1866 기록.
- **절대 변경 금지:** Production migration/DDL/DML/ACL/history, real Provider, positive Projector, Production 첫 Reveal/Replay/History/Worker 허가·public/paid ON. G0 technical signoff 여전히 OPEN, G1 positive/G2/G3/G5/G6 HOLD.


## 26. 2026-10-18 R11 — Node 송출 제어 모듈 구현, Vercel 기존 HOLD 유지

- **실제 코드:** `apps/api/src/seyeon-node-original-grant-send-boundary-v1.ts`: 서버 소유 original Grant 잠금/권한 포트에서만 Node `ServerResponse` 단일 본문 송출 허용. `finish`까지 DB 권한 잠금 유지, 연결 해제·취소/제한 시간 초과 시 소켓 파기와 후발 송출 거부. `null` 권한은 503/no-store, 개인정보 본문 0바이트. **현재 Vercel Fetch `Response` 경로와 실제 Provider/운영 DB에는 연결하지 않는다.**
- **최소 검사:** 실제 로컬 Node socket에서 정상/거부/취소 3건만 추가. R10 기존 실제 PG 양방향 경쟁 테스트는 재사용; 같은 케이스 증식 금지. G0 D-04 계약과 실제 Vercel 프록시 송출 보장은 여전히 미해결.
- **승인/운영 상태:** Product Owner 정책은 기존 승인 유지. 기술 Owner 서명 전 G0=PROPOSED, G1 positive/G2/G3/G5/G6 HOLD, Projectors=[], Provider/공개/유료 OFF, Production DB writes=0. 정확한 HEAD CI 및 저장소 병합 필수 게이트 외 불필요한 반복 검증 금지.


## 27. 2026-10-18 R13 — 원본 Grant DB 조회와 Node 소켓 송출을 하나의 트랜잭션으로 연결

- 코드: `apps/api/src/seyeon-original-grant-pg-send-adapter-v1.ts`. 서버가 검증한 Member를 기존 Subject DB resolver에 바인딩하고, original Grant/Record/Attempt/Message를 DB 함수에서 현재 잠금/검사한다. DB 트랜잭션은 Node 응답 `finish` 이후 COMMIT; Abort/오류는 ROLLBACK. 기존 R10 **실제 DB/HTTP 송출 우선** 시험에 새 Adapter를 적용하고 중복 DB 경합 테스트를 신설하지 않는다.
- 보안 수정: 기존 Vercel 외곽 응답 가드의 4xx 무조건 통과를 폐지. `chat-turn-send-http.ts`가 직접 만든 고정 4xx 오류만 허용, 위조 401/403+보호 본문은 503으로 교체.
- 운영은 불변: candidate G3 SQL은 named disposable PG만, Production G0 기술 Owner OPEN/G1+G2+G3+G5+G6 HOLD, Projectors=[], 첫 공개/Provider/public/paid OFF, Production DDL/DML/migration/ACL 0. Vercel/Proxy 마지막 홉의 안전한 양수 공개는 아직 기술 승인 전 미연결.
- 검사: 신규 최소 모듈 테스트 3개, 기존 R10 실 DB 테스트 재사용, 저장소 필수 CI·통합 검사만 수행. 추가 불필요한 회귀 확장은 하지 않는다.


## 28. 2026-10-18 R15 — 사용자 기억동의 철회 ACK와 원본 Grant 전송 잠금 연결

- **코드:** `apps/api/src/seyeon-original-grant-revoke-ack-v1.ts`: 검증된 Member만 canonical Subject DB 트랜잭션에서 `cmd_revoke_memory_character_grant_v1`으로 세연의 정확한 Memory Grant 철회 가능. 성공 ACK는 DB COMMIT 이후만 가능; 손실/모호성 시 성공 주장 금지, 재시도는 DB 원장 기반 replay 사용.
- **검증 변경 최소화:** 기존 R10 실제 PG 두 세션 전송/철회 경합에서 테스트용 직접 `UPDATE` 대신 **이미 존재하는 진짜 권한 철회 RPC** 사용. 새로운 DB fixture/시나리오 증식 없이 신규 모듈 테스트 3건만 추가.
- **운영 HOLD:** Production Executor의 기존 SECURITY INVOKER 철회 명령 ACL 및 실제 사용자 HTTP Route는 별도 검증·승인 전 미연결. 현재 Vercel/Proxy 개인기억 최초 공개 불허, Projectors=[], Provider/public/paid OFF, 새 Production migration/DDL/DML 0.


## 29. 2026-10-18 R16 — 본인 동의 철회 HTTP 후보와 운영 DB 권한 실측

- **실측:** Supabase 명하 운영 pg_catalog(데이터 읽기 없이) 확인 결과 `myeongha_api_executor`의 기존 `cmd_revoke_memory_character_grant_v1` EXECUTE=false, 필요 테이블 SELECT/UPDATE=false. 코드만 배포해서 실제 철회가 된다고 주장 금지.
- **구현:** `apps/api/src/seyeon-memory-grant-revoke-http-v1.ts`의 검증된 Member 전용 POST 철회 후보, 본인 원본 Memory ID 이외 추가 입력 불허, 권한 승인 기본 OFF=503/no-store/DB 호출 0. 정상 권한 구성 시 이미 작성된 R15 COMMIT 뒤 ACK 사용. `production-seyeon-memory-grant-revoke-runtime-v1.ts`에는 실제 인증/DB composition만 준비하고 운영 Vercel route 미탑재.
- **다음 개발:** 광범위 테이블 UPDATE/SELECT GRANT 없이 좁은 비공개 DB 철회 권한을 명시적으로 설계하고, 검토된 Owner/실제 역할 분리로 연결한 뒤 제한된 운영 활성화 결정. 그전까지 G0 기술 Owner OPEN, 첫 개인정보 기반 Reply HOLD, Production DDL/DML/ACL 0.
- **검증 축소:** 이번 변경은 기본 OFF/정상 Member 매핑/COMMIT 불명확 시 실패의 작은 HTTP 테스트 4개, 운영 카탈로그 읽기 전용 조회, 저장소 필수 CI만.

## 30. 2026-10-18 R17 — 비공개 최소 권한 원본 Grant 철회 후보 (코드 검증·병합 완료, 운영 미설치)

- **다음 미완료 의존성 해결 후보:** `scripts/operations/seyeon-private-memory-grant-revoke-r17-candidate.sql`은 `seyeon_private` 비공개 스키마에 **활성 canonical Member의 본인 Memory + 고정 세연**만 철회하는 `SECURITY DEFINER` 경계를 추가한다. 기존 `cmd_revoke_memory_character_grant_v1`의 원본 Subject 잠금/Grant 변경/재호출 no-op을 그대로 재사용한다.
- **ACL:** **정식 Supabase 마이그레이션에 포함하지 않으며**, 격리된 CI 복제 DB에서만 수동 적용해 검증한다. 기존 `myeongha_api_executor`의 광범위 테이블 SELECT/UPDATE 및 public 원본 RPC EXECUTE 권한은 추가하지 않는다. `anon`/`authenticated`/`service_role` 직접 실행 및 schema USAGE 거부. 실제 설치 전 Owner·소유권·역할·미노출 Schema 검토 필요.
- **연결:** R15 트랜잭션/COMMIT→ACK 코드를 변경 없이 재사용하되, R16의 운영 미탑재 구성에서만 private 명령을 선택하도록 연결. `approvedDbWriteAdmission` 미공급 상태는 그대로 503/no-store이며 SQL 파일 작성·PR 병합만으로 운영 DB에 실행하지 않는다.
- **검증 기준:** 기존 CI가 새로 생성해 폐기하는 격리 PostgreSQL의 실제 restricted role에서 정확한 본인 세연 Grant 철회/재호출/타 사용자 거부/타 캐릭터 권한 보존을 확인하고, 기존 R15 COMMIT/ACK 회귀, CI/Governance/Web/Full Integration, 병합 후 main 확인. **검사 전 PASS 주장 금지**.
- **미해결:** G0 Security/DB/API/Character 기술 승인, 실제 운영 DB 미적용 ACL/DDL·DR, R16 공개 라우트 admission, 최초 개인기억 답변·History·Replay·Vercel 프록시 송출 G3 HOLD. Projectors=[], Provider/public/paid OFF, Production DB writes=0.


## 31. 2026-10-19 R18 — G0 기술 계약·R17 최소권한 운영 적용 준비 (승인 전 차단)

- **선행 완료 확인:** R17 [PR #2316](https://github.com/gycha0109-beep/MyeongHa/pull/2316)의 HEAD `4f4c4a34ec0c0eea73bc536eb56613628a5e0652`, Full Integration [#39142314457](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39142314457) **11/11 SUCCESS**, squash main `16671989f050ca13d071e4c3c2ab1aaa1bb5b027`, 사후 [main CI #39144195981](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39144195981) / Governance #39144195999 SUCCESS 및 [Production #39144195975](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39144195975) SUCCESS(마이그레이션·백필 SKIPPED). 이는 **후보 코드 증거만** 확보했다는 뜻이다.
- **이번 소스 산출물:** [R18 기술 결정·운영 권한 핸드오프](../security/SEYEON_R18_G0_TECHNICAL_AUTHORITY_HANDOFF_20261019.md)와 [R17 비공개 RPC/ACL 읽기 전용 카탈로그 조회](../../scripts/operations/seyeon-private-revoke-r18-readonly.sql). PostgreSQL `pg_catalog`/유효 권한만 조회하며 사용자 기억 테이블 행을 읽거나 DDL/DML/GRANT/REVOKE를 수행하지 않는다. 실제 운영 적용권한을 생성하지 않는다.
- **진행 조건:** Security/DB/API/Character 실제 Owner가 G0-D01/D03/D04/D05/D06/D08/D09 등의 범위·코덱·송출/ACK 계약을 검토해 **명시적 승인**하기 전 `G0=PROPOSED`. R17 SQL 운영 설치/마이그레이션 역사 수정/역할 ACL 및 공개 HTTP 마운트 금지. Owner 승인 기록은 Product Owner 기존 정책 승인을 대체하지 않으며 재요청하지 않는다.
- **다음 실제 구현:** 계약 승인 후 제한된 G1 양수 원본·파생 Source Pin → G2 동일 DB 트랜잭션 Commit → G3 신뢰 가능한 Node/Proxy 송출·History/Replay 차단 → G5 실제 경합/보안 검증 → #1887 DB/DR 및 G6 별도 운영 승인 순서. 구현 준비용 후보가 먼저 작성되더라도 Production 기능 승격/허가로 취급하지 않는다.
- **유지:** `Projectors=[]`, 세연 공개/실 Provider/유료 OFF, R16 revoke HTTP 미탑재, `writeAdmission:'DENY'`, 실제 Production DB 변경 0, G1 positive/G2/G3/G5/G6 HOLD.


## 32. 2026-10-19 R19 — G1 양수 개인기억 모델 전 DB 출처 저장 어댑터 (격리 후보)

- **개발 범위:** `apps/api/src/seyeon-positive-model-pre-model-db-pin-r19-candidate.ts`는 서버의 최종 선택 `SeyeonExactModelPersonalSourceSelectionV1`(현재 허가되지 않은 양수 출처)을 받아 검증된 Member→PG canonical Subject를 확인한 후 **오직** `myeongha_seyeon_positive_pin_candidate_test` 폐기 DB의 `seyeon_positive_candidate.pin_source_set_r1` Owner 후보를 실행한다. 실제 Record/Grant 최신 상태, Attempt·Thread·Turn 결속 및 1640 zero/positive XOR는 기존 R1 데이터베이스의 원본 행 잠금·불변 Parent+Edge 계약으로 검증한다. 새 SQL 마이그레이션을 생성하거나 Production 함수를 호출하지 않는다.
- **모델 이전 COMMIT:** 한 Subject 트랜잭션 내 DB 이름·현재 원본 Grant/Memory 검증 → Parent/Edge 영속 저장 → **COMMIT 성공 뒤에만** `disposable_source_set_committed` 후보 영수증을 반환한다. DB 무권한/Grant 불일치/잘못된 원본 ID/후속 COMMIT 응답 유실은 전부 `HOLD`. 후보 영수증의 `permitsProvider=false, permitsAtomicCommit=false, permitsHttpReveal=false`는 바꿀 수 없다.
- **격리 검증:** 기존 R1 클론(원본 두 Memory/Grant 및 immutable Parent/Edge) 위에 실제 새 Turn/Attempt를 생성해 API Member identity→PG 역할→DB Owner 함수→COMMIT 후 원장 조회를 검증. 최종 선택 변경/원본 Grant 교체·이종 Schema/비Member/잘못된 DB·RPC 거부·COMMIT 불명확 시 차단. 기존 `test/db/seyeon_r2_disposable_actual_v2_revoke_race.sh`의 R1 직후 기존 DB에 연결하며 새 중복 마이그레이션/테스트 클론 생성 금지.
- **남은 정확한 차이:** 현재 합성 R1 Owner 함수는 source`recordId/grantId`와 PostgreSQL JSONB digest만 신뢰하며 Node projected/raw digest를 DB 원본과 **동등 비교하지 않음**. 최종 실제 모델 입력 전체 파생 출처(History/Relationship/Reader/Preflight), Owner 승인 타입·Codec, 생산용 positive 1640/XOR·비공개 RPC 역할, G2/G3 Commit/송출은 아직 없음. 따라서 R19은 **격리 DB Pin 연결 후보**일 뿐 G1 Production PASS 아님.
- **불변:** 기존 Runtime `assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1` 및 positive pre-model HOLD, `Projectors=[]`, 공개/유료/Provider OFF, Production DB DDL/DML/ACL/migration/history 0, `G0=PROPOSED`, G1 positive/G2/G3/G5/G6 HOLD. Owner 실제 기술 서명을 이 PR로 대체하지 않음.


## 33. 2026-10-19 R20 — 실제 DB 원본 JSONB ↔ 서버 최종 투영의 출처 해시 연결 (격리 후보)

- **정확한 취약 지점 수정:** 기존 R19은 Memory/Grant ID와 `selectedSourcesDigest`의 형식만으로 영속 Pin을 작성하며, 서버 제공 `rawRecordDigest`·`projectedMemoryDigest`가 DB의 원본 내용·최종 모델 선택과 동일한지를 검증하지 못했다. 운영 승격/인가로 오인하지 않으면서 이 결속을 격리 PostgreSQL에서 추가한다.
- **구현:** `test/db/seyeon_positive_r20_payload_digest_owner_candidate_v1.sql`의 비공개 Owner 읽기 함수는 현재 canonical Member Subject, 동일 Thread/Turn/Attempt, 기존 불변 SourceSet/Edge 및 `FOR SHARE` Original Grant/Record를 확인한 뒤 **합성 테스트 JSONB만** 반환한다. `apps/api/src/seyeon-positive-raw-projection-digest-bind-r20-candidate.ts`는 서버 최종 `selectSeyeonExactModelPersonalSourcesV1`을 독립 재계산해 투영 digest·정렬·cap·선택 집합을 고정하고, 한 트랜잭션에서 R1 원본 Pin 실행 → R20 DB 원본 읽기 → 서버 `canonicalJson({kind,recordId,grantId,recordType,schemaVersion,payload})`의 SHA-256을 `rawRecordDigest`와 비교 → **DB COMMIT 성공 뒤에만** 오프라인 영수증을 반환한다.
- **코덱 차이 보존:** DB에서는 `sha256:pg-jsonb:v1` 해시를 현재 원본 및 Edge와 비교하고, 서버는 **동일한 DB JSON 값**에 대해 별도 `sha256:v1` canonical digest를 재계산한다. 두 직렬화 결과의 바이트/해시가 같다는 거짓 가정을 하지 않는다. DB 원본 payload는 이 격리 트랜잭션에서만 제한 역할로 노출하고 외부 응답·모델·로그에는 기록하지 않는다.
- **실증:** 기존 격리 PostgreSQL 1곳의 R19 테스트 **다음**에 R20 SQL과 검증을 삽입한다. 새로운 독립 synthetic Thread/Attempt에서 변조된 서버 raw digest가 DB Pin 이후 COMMIT 전에 실패해 Parent/Edges 모두 롤백되는지, 올바른 두 원본은 정확한 순서로 영속화되는지 검증한다. SQL/ACL이 Production 마이그레이션에 포함되지 않는다.
- **절대 남는 HOLD:** Node 재계산은 해당 서버 스냅샷 결속 증거이며, 아직 모든 History/Relationship/Reader/Preflight/비조회 파생 출처의 폐쇄를 증명하지 않는다. S0 실제 사용 가능한 `recordType/schemaVersion` 및 코덱의 Owner 승인 없음, Production positive Projector·Owner RPC·XOR·Provider G1·동일 트랜잭션 G2·G3 신뢰 송출 미연결. `G0=PROPOSED`, `G1 positive/G2/G3/G5/G6=HOLD`, `Projectors=[]`, positive Provider/public/paid OFF, R16 `writeAdmission=DENY`, 운영 DB DDL/DML/ACL 0.


## 34. 2026-10-19 R21 — 양수 후보의 과거 대화·관계·Preflight 미고정 파생 출처 차단 (격리 전용)

- **직전 완료:** R20 [PR #2333](https://github.com/gycha0109-beep/MyeongHa/pull/2333), exact head `b1522d2d94652985d1cfed46b318b0cd5aabaa84`, [Full Integration #39188140653](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39188140653) **11/11 SUCCESS**, main `38aac99c2a0f102a680ccde95a5ea1b8912e6035`. 이 증거는 운영 양수 공개 승인이 아니라 합성 원본·투영 일치 후보의 코드 검증이다.
- **문제:** R20 격리 트랜잭션은 합성 원본 Memory/Grant의 `rawRecordDigest`·최종 선택 투영은 결속하지만, **그 외 모델 입력의 과거 User/Assistant 메시지·Relationship 이벤트/이력·Reader/Worker 요약·Preflight/Disclosure 유입**이 있더라도 R20 호출이 이를 선언하지 않으면 식별하지 못한다. 기존 운영 zero-personal 선차단을 우회하거나 R20 후보 영수증을 전체 모델 출처 권한으로 해석하면 안 된다.
- **구현:** `apps/api/src/seyeon-r21-offline-derived-source-closure-v1.ts`는 R20에서 필수로 공급해야 할 **서버 생성 Snapshot+독립 private ingress envelope**를 검증한다. Snapshot의 최종 `retrievedMemories`와 `personalRecordProjectionCandidates`가 R20이 실제로 사용할 목록과 정확히 같고, 개인 Record admission이 원본 후보와 1:1인지 확인한다. `recentMessages`, `relationshipHistoryRecords`, `activeRelationshipEventCount`, `historyThroughRevision`, 관계 회차, Relationship retrieved kind, Preflight 이미 실행, Disclosure/Reader/Worker/External Tool private 출처, 알 수 없는 envelope/snapshot 필드가 있으면 **DB Pin 수행 전 HOLD**한다. `apps/api/src/seyeon-positive-raw-projection-digest-bind-r20-candidate.ts`의 필수 입력으로 연결한다.
- **격리 검증:** 기존 R20 보안 테스트와 실제 named-disposable PostgreSQL 테스트에 음성 경로를 더한다. **과거 메시지/관계 이력/이벤트/비인가 Reader·Worker·Preflight 출처가 생기면 DB 접속 자체를 시작하지 않아야 한다**. 정상 synthetic 두 원본 Memory/Grant만 DB COMMIT 뒤 후보 영수증을 받을 수 있다. 새 SQL·마이그레이션·운영 ACL은 추가하지 않는다.
- **남은 실제 권한:** R21 envelope는 **선행 단계**에서 서버가 제공한 음성 증거이지 모든 모델·공개·Worker/History 경로의 완전한 실제 Source Pin이 아니다. Preflight 사후 양수 파생 출처·실제 Reader/Relationship/SRC-25 타입/codec·다중 Attempt·G2/G3 송출 취소 보장은 여전히 Owner 기술 계약 및 DB 원장 구현 필요. 이 후보가 G1 positive PASS, Provider 송출, G2/G3/G6 또는 Product Owner 제품 정책 재승인을 의미하지 않는다.
- **유지:** `G0=PROPOSED`, `G1 positive/G2/G3/G5/G6=HOLD`, Production `Projectors=[]`, `writeAdmission='DENY'`, Provider/public/paid OFF, Production DDL/DML/ACL/history/migration 0, 기존 zero-personal/preflight Production HOLD 불변.


## 35. 2026-10-19 R23 — G1 최종 입력 확인을 G2 실제 원자 Commit 어댑터에 연결 (격리 후보)

- **독립 R22 검증 단계 없음:** G1 완료 조건인 **모델에 실제 전달할 최종 Memory 출처 집합 = 모델 전 DB 영속 Pin 집합**을 G2 입구의 필수 비교로 통합한다. 새 검증 체계·워크플로·테스트 DB를 만들지 않고 R21 Snapshot 음성 차단 및 이미 존재하는 원본 R3 G2 실DB 회귀를 재사용한다. 이 비교는 Provider 실행 후 임의의 숨겨진 메타데이터를 증명하지 않으며 운영 G1 PASS 아님.
- **R23 구현:** `apps/api/src/seyeon-g2-atomic-exact-final-source-commit-r23-candidate.ts`는 verified Member → canonical DB Subject, final Memory 1건 선택·투영 digest 재검증, R21 과거 메시지·Relationship·Reader·Worker·Preflight 미고정 출처 거부, 모델 전 G1 `pin_and_context_ready_r4` 영수증의 exact Attempt/Record/Grant/SourceSet digest 매칭을 통과해야만 기존 격리 `seyeon_positive_candidate.commit_actual_v2_r3` 명령을 호출한다. **이 G1 영수증은 사용자 제공 권한이 아니며** 실제 Grant/Record/SourceSet·검증 stage는 DB Owner 함수가 다시 검증한다. DB 이름이 폐기용 `myeongha_seyeon_positive_pin_candidate_test`가 아니면 0개 Commit; 불명확/실패/Replay 영수증은 전부 HOLD.
- **실제 원자성:** 이미 격리 PostgreSQL에서 존재하는 R3 비공개 DB 함수는 verified Subject→Thread→Turn→Attempt→original Grant/Record 잠금 및 불변 Pin·Validation 출처 일치를 검사하며 실제 `public.cmd_commit_seyeon_chat_turn_runtime_v2`로 assistant 메시지와 Chat/Post-turn 두 Outbox를 **하나의 DB 트랜잭션**으로 생성한다. JS는 RPC 결과 후 DB `COMMIT`이 확인될 때만 synthetic-only 영수증을 반환한다. legacy API 직통 Commit 허용 없음.
- **검증:** 새 격리 DB나 새 전용 SQL을 추가하지 않고 기존 `test/seyeon-g2-atomic-original-grant-race-disposable.test.ts`에서 생성된 synthetic 단일 Memory/Grant·stage/validation을 R23 API 어댑터로 통과시킨다. 실제 모델 입력 digest 변경·G1 Grant 영수증 바꿔치기는 G2 DB 접근 전 거부, 정상은 1개 Message/2개 Outbox, Replay는 재Commit 금지. 기존 revoke-first/commit-first 경합과 두 번째 Outbox 충돌 rollback 테스트 계속 활용한다.
- **Production 계속 HOLD:** 본 시험은 **실제 모델/사용자 데이터/운영 DB 연결이 아니고**, S0 `shared_detail/memory-v1`은 합성 fixture일 뿐 SRC-25 승인된 운영 타입 아님. 추가 Preflight/History/Relationship derived source 전체 출처 폐쇄, Provider 호출 뒤 최종 프롬프트 증빙, G0 실제 기술 서명, Production DB Owner RPC 및 ACL, G3 HTTP Reveal/Proxy 신뢰 송신선형화, #1887 운영 DB/DR, G5/G6 미완료. `Projectors=[]`, positive Provider/public/paid OFF, `writeAdmission='DENY'`, Production DDL/DML/migration/ACL=0, G1 positive/G2 Production/G3/G5/G6 HOLD.

## 36. 2026-10-19 R21 DB 보완 — 합성 개인기억 두 원본의 모델 전 원자 Pin/ContextReady 후보

- **병행 관계:** 34절 R21의 서버 파생 출처 선차단과 구분되는 격리 PostgreSQL 트랜잭션 원자성 실증이다. 양쪽 증거는 서로 대체하지 않으며 함께 존재해도 운영 G1/G2 승격을 의미하지 않는다.

- **구현 범위:** 이름 고정 폐기용 PG17에서 Subject/Thread/Turn/Attempt 잠금, 두 원본 Grant·Memory의 R1 불변 Parent/Edge Pin, 첫 원본의 기존 Attempt Pin과 대조, 두 원본의 현재 Grant/Schema/PG JSONB digest 재검증, 실제 cmd_mark_chat_turn_context_ready_v1까지 **같은 DB 트랜잭션**으로 실행. 원본 콘텐츠는 반환하지 않는다.
- **검증 계획:** 동일 R1/R20/R3/R5 격리 DB에서 실제 2건 성공 및 두 번째 Grant 교체·누락·중복 시 DB 원장 전체 롤백. 새 CI Workflow나 운영 SQL migration은 만들지 않는다.
- **제한:** 기존 Attempt Pin의 단일 원본 필드는 첫 Edge 결속만 담당. 2건 전체의 실 G2 Atomic Commit, 파생 출처 closure, 실제 SRC-25 Codec/타입, 최종 Wire/HTTP/Replay/Worker는 미완료. Owner 기술 서명과 운영 권한을 생성하지 않는다.
- **불변:** G0 PROPOSED; G1 positive/G2/G3/G5/G6 HOLD. Projectors=[], 공개/유료/실 Provider OFF, Production DB DDL/DML/ACL/History 0건. 후보 receipt는 Provider/AtomicCommit/HTTPReveal 모두 false.


## 37. 2026-10-19 R24 — G2 Commit 후 최초·재시도 G3 원본 Grant 잠금 기반 Node 송출 연결 (격리 후보)

- **선행 완료:** R21 [#2336](https://github.com/gycha0109-beep/MyeongHa/pull/2336) / Integration [#39190997339](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39190997339) 11/11 PASS; R23 [#2338](https://github.com/gycha0109-beep/MyeongHa/pull/2338) / Integration [#39194604912](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39194604912) 11/11 PASS, squash `fd0c9c45098409ecf20e509df08b3fed978c1638`, post-main CI/Governance/Production 성공(Production migrations/backfill **SKIPPED**). 기술·운영 승인이나 공개 활성화를 뜻하지 않는다.
- **실제 빠진 연결:** R23은 합성 원본 Grant를 확인해 **실제 v2 Commit/두 Outbox**를 원자화한다. R5 DB Owner는 현재 원본 Grant/Attempt/Message를 잠가 최초·Replay·History를 재판정하고 R10/R13은 Node 소켓 `finish`까지 DB 원본 잠금을 유지하지만, **R23 Commit 영수증→R13 현재 원본 DB 조회→R10 Node 소켓**의 직접 합성 진입점은 없다. R24는 이 구간만 구현하며 새 SQL/테스트 DB/워크플로를 만들지 않는다.
- **코드:** `apps/api/src/seyeon-r24-offline-committed-node-reveal-v1.ts`에서 서버가 받은 R23 G2 receipt의 `turnId/attemptId/assistantMessageId`를 현재 요청의 서버 메타데이터와 일치시키고, 최초/committed_replay를 명시한다. 익명/손상된 receipt는 DB 접속 전 HOLD. **재시도마다 새 R13 원본 Grant 읽기 트랜잭션을 생성**해 기존 `seyeon_positive_candidate.reveal_http_r5`가 현재 원본 Grant/Record, 불변 원장, committed Attempt/Message를 다시 확인하도록 한다. R13에는 단 한 가지 선택적 `expectedDisposableDatabase` 검사를 추가해 R24가 **`myeongha_seyeon_positive_pin_candidate_test` DB 이외의 권한조회/송출을 거절**하도록 한다. 유효 시 DB SHARE 잠금을 Node 송출 완료(`finish`)까지 유지; 취소 먼저면 503/no-store + 원문 0바이트. 이미 송출된 바이트의 프록시/클라이언트 최종 도착은 증명하지 않는다.
- **검증:** 새로운 E2E 셋업 대신 기존 `test/seyeon-r5-current-reveal-disposable.test.ts`의 합성 실제 v2 Commit Fixture 및 HTTP 루프백에 R24를 한 사례 추가. **최초 200 → 새로운 R5 재판정 Replay 200 → 원본 Grant 취소 및 새 Grant 재발급 후 Replay 503/원문 0바이트/History HOLD**, forged G2 receipt는 DB 연결·HTTP 헤더 0. 기존 R10 2세션 send-first/revoke-first, R7/R9 stale-buffer 우회와 G2 두 Outbox 원자/철회 경합 검사 재사용.
- **중요한 정확한 한계:** **Node `finish`는 OS 전송 버퍼 handoff이지 Vercel/Edge/Proxy/클라이언트 수신 보증이 아니다.** D-04 전송 취소 선형화 실제 Owner 계약 미승인, Vercel Fetch 503 가드 제거 금지. R24는 URL/라우트 미탑재·합성 테스트 데이터만; 실제 SRC-25 타입/Codec 미승인, Reader/History 전체 파생 lineage 미해결, 실제 공개·Provider·유료 OFF, G0 OPEN/G1-positive/G2-production/G3-production/G5/G6 HOLD, `Projectors=[]`, `writeAdmission='DENY'`, Production DB DDL/DML/ACL/migrations 0.


## 38. 2026-10-19 S6/G4 — 비용 영수증 미저장 성공 응답의 Chat Commit 선차단 (비운영)

- **R24 사후 main CI 정확한 상태:** [CI #39217429606](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39217429606)는 R24 merge SHA `6209bcec9dae9201b5d7a275b52a684ffe3a741f`에서 **CANCELLED**, 실패가 아님. 후속 main SHA `19395d77df85c61e9391ef5a87321f71fb33eb6f`의 [CI #39217959360](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39217959360), [Governance #39217959411](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39217959411), [Web #39217959164](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39217959164), [Supabase Production #39217959287](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39217959287)는 모두 SUCCESS. R24 머지 직후 취소된 CI를 SUCCESS로 바꾸거나 R24 코드 실패로 오인하지 않는다. #1866에도 동일 종료 증거 기록.
- **S5/G3 결손 분리:** R24의 합성 G2 Commit→DB 현재 original Grant 잠금→Node 소켓 `finish` 연결은 완료. 다만 `finish` 이후 Vercel/프록시/클라이언트 실제 송신 및 취소 ACK의 분산 선형화는 D-04의 기술 Owner 미승인 범위다. 실제 G3 운영 구현/공개 활성화는 보류하고, 동일한 G2/R5/R10/R13 기능을 다시 만들지 않는다.
- **독립 S6 실제 결손:** 기존 `createPersistingSeyeonAiProviderV1`는 ENFORCE 예약 후 Provider 응답이 정상인데 **원본 사용량/비용 영수증 DB 저장 콜백이 실패해도 성공한 AI 결과를 상위 Chat Commit으로 반환**했다. 정산 재시도용 원장 보존은 타당하지만 영수증이 없는 성공 답변을 공개·Commit할 권한을 부여하지 않는다.
- **구현 범위:** 이미 있는 비용 adapter의 ENFORCE 분기에서 **원본 Provider outcome 영수증이 실제 DB에 저장된 경우에만 정상 모델 응답을 Chat Commit 호출자에게 반환**한다. 저장 실패 시 현재 사전 예약을 남겨 나중에 조사·정산할 수 있도록 하고, 자동 재추론·재과금 없이 예외로 막는다. 기존 비용 adapter 테스트의 `admit → fake fetch → store failure` 사례를 승인된 응답에서 **Commit 전 차단**으로 보정한다. 저장 성공/별도 정산 실패의 기존 보수적 처리와 OFF 호환 경로는 변경하지 않는다.
- **범위 한정:** 합성·비운영 코드와 기존 테스트만, 별도 SQL/DB/Workflow/운영 Provider 호출 없음. S6/G4 종단 전체 통합/Owner 비용 한도 및 D-04 계약 PASS가 아님. G0 OPEN, G1 양수/G2 Production/G3 Production/G4 Production/G5/G6 HOLD, `Projectors=[]`, `writeAdmission='DENY'`, Production DDL/DML/ACL/마이그레이션/유료 Provider/공개 0건 유지.
- **검증·병합 규칙:** 이 변경의 exact PR HEAD에 대한 CI/Governance/Web, Full Integration 11/11 SUCCESS 확인 후에만 HEAD 고정 병합. merge 후 main CI/운영 skip은 별도로 기록. S8 운영 DB/DR은 기존 #1887과 격리·읽기 전용 범위에서 병렬 후속 검토.

## 39. 2026-10-19 S6/G4 — 최종 Governor 정산 영수증 누락·상한 초과 시 Chat Commit HOLD (비운영)

- **발견:** 기존 S6/G4 방어는 Provider 원본 영수증 저장 실패만 차단했다. 성공 응답과 Provider 영수증 저장 뒤 최종 governed settle DB 오류 또는 overCeiling=true 상태에서도 성공 결과가 상위 Chat Commit에 반환될 수 있었다.
- **수정:** ENFORCE Governor 성공 응답은 정확한 callId의 Provider 영수증 DB 저장, 최종 비용 정산 DB ACK, overCeiling=false가 모두 있어야 반환한다. 오류 시 원본 예약·영수증을 유지하고 응답을 HOLD한다. Provider 재호출/자동 재과금, 새로운 운영 SQL·ACL·DDL·DML 없음. 레거시 비-Governor 동작과 비성공 Provider 정산 보존.
- **검증:** 기존 합성 fake Provider/DB 테스트에 정산 DB 오류 및 상한 초과 부정 사례를 더한다. 정상 admit→fetch→store→settle 및 timeout 보수적 정산을 유지한다.
- **운영 게이트:** 이 테스트만으로 S6/G4 종단 PASS 아님. G0 기술 승인, positive G1, Production G2/G3/G4/G5/G6 HOLD. Projectors=[], writeAdmission=DENY, 공개·실 Provider·유료 OFF, Production DB 변경 0. PR exact HEAD/Full Integration/병합 후 main 증거는 원장에 후속 기록.
