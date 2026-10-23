# C08-K — PostgreSQL 17 실제 Receive RPC / Census 2세션 경합

Watchtower-Track: character-memory

## 범위와 연결

- 선행 증거: C08-I/J 실제 PG17 Census/RLS 및 직접 합성 INSERT 경합. C08-K는 별도 **두 번째 synthetic Subject/Thread**에서 실제 `cmd_receive_chat_turn_v1`을 실행합니다.
- 실행 경로: 기존 `seyeon-c08-first-turn-local-pg17` 안에 `test/db/seyeon_c08k_receive_rpc_two_session_pg17.sh`을 연결합니다. 기존 C08-J 데이터와 테스트 결과는 수정하지 않습니다.
- 데이터베이스: 네트워크 미노출 Docker scratch DB 또는 자동 폐기되는 GitHub Actions PostgreSQL 17 DB만 허용. 운영 DDL·ACL·Migration/Production 변경 없음.

## 순서와 증명 범위

1. **실제 Receive RPC**가 synthetic 사용자 메시지 1개를 수신하고 `sequence_no=1`을 영속화합니다. 관리자가 테스트용 메시지를 직접 INSERT하지 않습니다.
2. 세션 A는 `myeongha_api_executor` RLS와 정확한 Subject context 아래 **같은 READ COMMITTED 트랜잭션**에서 제한된 Census 조회를 시작합니다. 첫 결과 `active|seyeon|1|t`를 파일 배리어로 확인합니다.
3. 독립 세션 B는 실제 Receive RPC로 두 번째 clientTurnId 수신을 시도합니다. 첫 Turn이 `received`인 동안 `cmd_chat_receive_turn_in_flight` 거부를 기대합니다.
4. 첫 Turn의 실제 Attempt 생성 및 `failed_retryable` 전환 뒤에도 두 번째 Receive가 거부되는지 확인합니다. 실제 Retry Attempt 생성·실패와 정식 `cmd_abandon_chat_turn_v1` 후에만 다음 Receive RPC로 `sequence_no=2` 메시지를 COMMIT합니다.
5. B의 COMMIT이 끝난 다음에만 A가 다시 조회합니다. 결과는 `active|seyeon|2|f`; 이전 first-contact 판정을 재사용하면 안 됩니다.
6. 서로 다른 `pg_backend_pid()`, 동일 clientTurnId+hash replay, 다른 hash 충돌, 다른 Subject/Thread 거부, 실패한 Receive의 sequence 비소모, 정확히 2개 Turn/메시지 및 2개의 첫 Turn Attempt를 확인합니다.
7. 선행 C08-J는 redacted 이력 포함 2개 Census와 기존 Shadow read-only 범위를 그대로 검사합니다.

## 필수 안전 경계

- 실제 DB command 경쟁 검증이지만 **실제 HTTP/Production Chat 수신 또는 `cmd_commit_seyeon_chat_turn_runtime_v2` 완료를 시험하지 않습니다.** RPC는 격리 DB의 관리 세션에서 호출하며 Production의 최종 managed-principal 인증/E2E를 입증하지 않습니다.
- 서술된 경쟁에서는 두 번째 Receive가 **진행 중인 Turn 때문에 거부되는 것이 올바른 결과**입니다. 첫 Turn을 정식 종료한 후 2번째가 확정되면 READ COMMITTED Census 재조회에서 보이는지만 확인합니다.
- 마지막 Census 이후 모델 호출·Commit·Reveal 시점의 TOCTOU 창은 그대로 있습니다. **Census는 durable lock이 아닙니다.**
- G0~G6, Grant 철회 경쟁, exact Pin, G2 원자적 Commit, G3 최초 HTTP Reveal/replay, 유료 공급자 모델 동등성 및 5→3 Production 활성화: 전부 HOLD.
- 정상 결과와 실패 코드는 실 DB CI가 통과한 경우에만 기록합니다. Mock 성공을 PG17 PASS로 승격하지 않습니다.

## 실행

```powershell
git switch main
git pull origin main
node scripts/run-seyeon-c08-local-docker-pg17.mjs --disposable-only
```

**Windows 재검증:** #2234에 병합된 최종 Postgres 초기화 수정이 로컬 Docker Desktop에서도 통과했는지 새 사용자 실행 증거는 아직 없습니다. GitHub CI와 Windows 실행 결과는 독립적으로 기록합니다.

**신규 유료 AI 호출 0회 / Provider·Production 호출 0회 / 운영 DB 변경 0건.**
