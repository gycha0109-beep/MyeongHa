# C08-M — 최초 Census 이후 실제 Commit v2의 오래된 Attempt 거부 검증

Watchtower-Track: character-memory

## 검증 대상과 정본

- 선행 검증: [C08-K PR #2241](https://github.com/gycha0109-beep/MyeongHa/pull/2241), Full Integration [#39026266278](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39026266278) SUCCESS, squash merge `4e50798c67f4b1324dd9e26357c914403614f587`.
- **실제 운영 Commit RPC 계약:** `supabase/migrations/1500_seyeon_post_turn_analysis_runtime_v1.sql`의 `cmd_commit_seyeon_chat_turn_runtime_v2`는 Subject context와 post-turn snapshot을 확인한 다음 `cmd_commit_seyeon_chat_turn_runtime_v1`을 호출합니다. 그 아래의 `cmd_commit_chat_turn_v1`은 Thread/Turn/Attempt 행 잠금과 **current validated Attempt** 조건으로 첫 Commit을 결정합니다(`0220_chat_attempt_commit_commands.sql`).
- **Census 권한:** `apps/api/src/postgres-seyeon-first-turn-census-shadow-v1.ts`는 `READ COMMITTED`의 **읽기 전용** 제한 2건 조회이며, 어떤 durable lock도 확보하지 않습니다.
- **실제 AI 경로:** `apps/api/src/seyeon-production-chat-execution-v1.ts`는 Receive → Attempt → Context Ready → Provider/Guard → Validate → Commit 순서입니다. Census-first 3회 실험은 `seyeon-census-first-three-call-shadow-v1.ts`의 opt-in Shadow이고, 해당 Shadow는 Production에 연결되지 않았습니다.

## 이번 격리 PostgreSQL 17 검증

기존 `seyeon-c08-first-turn-local-pg17`에 연결된 `seyeon_c08k_receive_rpc_two_session_pg17.sh`의 두 실제 PostgreSQL 세션을 그대로 사용하며 별도 Workflow를 생성하지 않습니다.

1. A 세션은 서버 검증 Subject Context와 non-BYPASSRLS `myeongha_api_executor` 역할로 첫 Turn의 메시지 1건 Census를 확인합니다.
2. B 세션은 진행 중 Turn의 두 번째 Receive를 거부한 뒤 정식 Attempt 실패/Retry/Abandon을 거쳐 **실제 `cmd_receive_chat_turn_v1`** 로 두 번째 사용자 메시지를 `COMMIT`합니다.
3. **A는 다시 Census를 실행하지 않은 상태에서**, 자신이 이전에 관측했던 첫 Turn·첫 Attempt를 대상으로 실제 운영 `cmd_commit_seyeon_chat_turn_runtime_v2`를 호출합니다. Snapshot/Subject/Thread 파라미터는 동일하게 결속하고, 허용되지 않는 권한을 추가하지 않습니다.
4. Commit은 정확히 `cmd_chat_commit_not_validated`로 거부되어야 하며, 단순 SQL 권한 누락에 의한 실패는 PASS로 인정하지 않습니다. API executor의 Commit-wrapper EXECUTE 가능/직접 메시지 INSERT 불가 ACL도 먼저 검사합니다.
5. 다음 Census에서 2건 및 첫 대화 불성립을 확인하고, 원래 Turn은 `abandoned`, 새 사용자 메시지 2건, 최초 Turn 관련 assistant 메시지 0건/Commit Outbox 0건, Sequence 불변을 확인합니다.

예상 통과 코드:

```text
PASS_C08M_ACTUAL_COMMIT_V2_DENIES_STALE_ATTEMPT_AFTER_REAL_RECEIVE
PASS_C08M_REAL_COMMIT_V2_STALE_ATTEMPT_NO_ASSISTANT_OR_OUTBOX
C08M_HOLD_NO_POSITIVE_GRANT_PIN_OR_HTTP_REVEAL_LINEARIZATION
```

## 검증의 한계와 후속 차단

- **증명 대상은 취소된 오래된 Attempt의 Commit 거부**입니다. 성공적으로 Validated인 Turn의 정상 Commit 결과나 실제 AI 모델 호출·HTTP 응답은 검증하지 않습니다.
- 서로 다른 연결 간 Receive→Abandon→재수신과 Final Commit 거부를 실제 PostgreSQL에서 시험해도, 이것이 Census의 durable lock 또는 완전한 SERIALIZABLE 처리라는 뜻은 아닙니다.
- 현재 Production 개인기록 Projector는 `[]`, 공개 세연 최초 Reveal은 별도 Security Gate에서 HOLD입니다. 양수 Memory/Life Fact의 exact Grant Pin, G2 원자 Commit↔Revoke, G3 최초 Reveal/replay 권한 선형화, G0 승인·G4~G6 검증은 **모두 미완료**입니다.
- `cmd_commit_seyeon_chat_turn_runtime_v2`의 기존 계약·권한·스키마를 수정하거나, 미승인 Production 마이그레이션 1520 이후를 적용하지 않습니다.
- 데이터: 격리된 합성 Subject/Thread만. 실제 Provider/Production/사용자 데이터/유료 AI 호출 **0회**.
- Windows Docker Desktop에 병합본을 실행한 증거는 아직 별개로 미확인입니다.

기존 명하의 전체 C08 종료/Production Ready 상태를 갱신하는 문서가 아니라, **실제 Commit RPC에 대한 좁은 부정 테스트와 공백 기록**입니다.
