# C08-J — PG17 독립 2세션 최초 대화 Census 재확인 경합 테스트

Watchtower-Track: character-memory

## 검증 대상

C08-G/I에서 실제 로컬 Docker PostgreSQL 17·컬럼별 RLS·첫 대화 단일 조회와 redacted 메시지 포함 건수 판정이 통과했습니다. 그러나 **두 검사 사이에 다른 트랜잭션이 메시지를 확정할 경우** 1건이라는 예전 판정이 계속 사용될 위험은 별도 검증 대상입니다.

이번 C08-J는 별도 `test/db/seyeon_c08_two_session_census_race_pg17.sh`를 원래의 C08 첫 대화 PG17 실측 스크립트에 연결합니다.

## 실제 검사 순서

1. 격리 DB에 사용자 첫 메시지 1건이 있는 상태에서 **Reader A**가 독립 PostgreSQL 세션으로 연결. `READ COMMITTED` 트랜잭션을 시작하고 `myeongha_api_executor` 역할과 서버가 검증한 Subject Context를 적용한 후, **C08-E와 동일한 제한 2건 Census SQL 구조**로 `active|seyeon|1|t` 확인.
2. Reader A가 **실제 첫 조회 결과를 기록한 이후** 로컬 파일 배리어로 대기. 단순 `sleep`만으로 순서를 추정하지 않습니다.
3. 별도 **Writer B PostgreSQL 세션**에서 redacted/tombstone 형식의 합성 과거 메시지 1건을 새 트랜잭션에 삽입·**COMMIT**. 두 실제 `pg_backend_pid()`가 다름을 검증.
4. Writer B의 성공적인 COMMIT 이후에만 Reader A 배리어를 해제. 같은 `READ COMMITTED` 트랜잭션 안에서 다시 조회한 결과가 **`active|seyeon|2|f`**인지 확인.
5. 이후 기존 C08-G/I 조회도 2건·최신 사용자 메시지 아님을 확인하고, 운영 권한에 대한 변경 없이 샘플 DB를 폐기.

예상 신규 통과 코드: `PASS_C08J_TWO_PG17_BACKENDS_READ_COMMITTED_RECHECK_BLOCKS_STALE_FIRST_CONTACT`.

## 안전성과 한계

- GitHub Actions PostgreSQL 17은 기존 `postgres17` 스위트의 자동 파기되는 `myeongha_ci_case_*` 전용 DB. 로컬 실행은 `--network none`, 외부 포트 비공개, 읽기 전용 소스 마운트, 삭제되는 `myeongha_c08_local_case_1` Docker DB로 제한.
- Writer B의 `INSERT`는 테스트용 PostgreSQL 관리자 세션에서 수행한 **redacted 합성 이력 직접 삽입**입니다. 실제 `cmd_receive_chat_turn_v1` 동시 수신·검증·Commit 경합은 검증하지 않습니다.
- 이것은 `READ COMMITTED` **두 SELECT 사이에 이미 COMMIT된 변경이 보이는지** 증명하는 테스트입니다. 최초 조회와 **모델 호출/커밋/최초 사용자 노출(Reveal)** 사이를 선형화하거나 잠금으로 보호한다고 주장하지 않습니다.
- **마지막 Census 이후에도 새로운 메시지와 권한 철회가 가능**합니다. `SERIALIZABLE` 트랜잭션 보장, 실제 Message Receive/Commit, Memory/Life Fact Grant pin/revoke, G0~G6 재검증은 여전히 HOLD입니다.
- 실제 AI 공급자 호출·운영 라우팅·API key·유료 사용·운영 DB DDL/ACL 변경 없음.

## 실행

기존 C08 Docker 명령을 그대로 사용하면 C08-J도 포함됩니다. Windows PowerShell 저장소 루트에서 (PR이 전체 CI 통과 후 `main`에 병합되면):

```powershell
git switch main
git pull origin main
node scripts/run-seyeon-c08-local-docker-pg17.mjs --disposable-only
```

이 단계에서는 **새로운 유료 AI 테스트를 실시하지 않습니다**. 로컬 검증 성공 및 CI 정확한 PR HEAD 통합 검사 통과 이후 다음 후보로 실제 채팅 수신과 Census 검증 간 경쟁 조건을 설계합니다.
