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
