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
