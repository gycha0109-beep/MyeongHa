# 세연 Production 1400~1450 재적용 전 소유권 차이 교정 — 2026-10-11

Watchtower-Track: ops

## 실제 장애

- 보호된 일회성 복구 PR #1949는 전체 CI/Integration PASS 후 `main` 커밋 `b4a426849b3e70c2997ee89054c1fa2a5793b98f`에 병합됐습니다.
- `Supabase Production` 실행 [#38091514560](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38091514560)은 외부 배포 job SKIPPED, 전용 이력 1400~1450 job만 진입했습니다. 백업 `38088591661`과 같은 백업의 격리 복원 `38090483306`을 통과한 후 단일 트랜잭션 SQL 시작.
- `1400_relationship_apply_context_v1.sql:602`: `ERROR: must be owner of function public.cmd_lock_relationship_apply_context_v1`. 기존 SQL은 함수 Owner를 `myeongha_relationship_apply_owner`로 이전한 뒤 `REVOKE ... FROM current_user`를 수행하고 **그 후** `COMMENT ON FUNCTION`을 실행합니다. 실제 Supabase `postgres`는 superuser가 아니므로 Owner 역할 membership이 사라진 뒤 주석을 수정할 수 없습니다.
- 트랜잭션 전체 롤백 확인. 같은 직후의 Production READ ONLY catalog: 선행 이력 **0/6**, 선행 함수 **0/11**, 후행 이력 **6/6**, 관계 이벤트/스냅샷 **0/0**. 운영 데이터/이력을 부분 적용하지 않았습니다.
- 기존 exact remote PG17 재현은 stock `postgres:17.6` 컨테이너의 `postgres`가 **superuser**였으므로 이 소유권 문제를 숨긴 false positive였습니다.

## 수정

- 기존 `supabase/migrations/1400..1450_*.sql` 6개 파일은 전혀 변경하지 않습니다.
- 새 staging 실행기는 Git blob ID 여섯 개와 원문 SQL 구문을 정확히 검사하고, **각 파일 마지막의 `COMMENT ON FUNCTION` 블록만 해당 파일의 `GRANT myeongha_relationship_apply_owner TO current_user` 및 `ALTER FUNCTION OWNER` 앞에 이동**한 비공개 임시 사본 6개를 생성합니다. 이로써 실제 `postgres`가 소유권을 이전하기 전 함수 생성자 자격으로 주석을 설정합니다. `GRANT`/`REVOKE` 역할 membership DDL·함수 정의·ACL/Owner 구문은 원본 그대로 보존합니다.
- staging은 원래 마지막 `REVOKE ROLE` 뒤에 `COMMENT ON FUNCTION`만 존재할 때만 성공하며, 그 외 DDL/DML이 하나라도 있으면 즉시 HOLD. 원문 SHA 불일치도 즉시 HOLD.
- Production에서 기존의 **단일 트랜잭션/정확한 여섯 개 파일/마이그레이션 이력 6건/Owner·ACL 및 역할 membership 불변/브라우저 실행 권한 0/관계 레코드 0/rollback** 검사는 완전히 유지합니다.
- `test/db/seyeon_remote_bundle_pg17_isolated.sh`는 실제 remote-only 정확본 104KB를 로컬 PG17에 적용한 뒤 **postgres 역할을 NOSUPERUSER로 강등**하고 Production과 같은 staged 6개 SQL 및 동일한 pre/post 검증을 수행합니다.
- 별도의 부정 테스트는 원문 공백 1자 변경만으로도 staging이 거부되는 것을 확인합니다. staging SQL 원문은 로그·artifact에 저장하지 않고 임시 디렉터리 종료 시 자동 삭제합니다.

## 허용 기준

1. 이 수정 PR의 일반 CI, Governance, 전체 Integration을 통과해 본문만 `main`에 병합합니다. **이 PR에는 운영 DB 재적용 트리거가 없습니다.**
2. 병합 후 새 exact-main `[WT:character-memory]` Production read-only audit + private 104KB PostgreSQL 17 **비-superuser 재현 PASS** 확인.
3. 이후에도 실제 Production 재적용은 본 PR과 별개의 신규 검증된 백업/복원 증거 및 **새로운 일회성 보호 PR**을 요구합니다. 기존 실패한 one-shot 제목을 다시 사용하는 재실행은 허용하지 않습니다.
4. Supabase 연결 확인에 추가 결함이 나오면 데이터에 접근하거나 보호를 우회하지 않고 HOLD.

G0~G6/G6, 세연 공개 경로, 유료 AI, 개인 Projector는 기존대로 HOLD.

**추가 운영 권한 확인:** Production `postgres`는 `rolsuper=false`, `rolcreaterole=true`이고 `myeongha_relationship_apply_owner` 직접 membership은 `admin=true`, `inherit=false`, `set=false`, 기존 grantor는 `supabase_admin`입니다. 따라서 단순히 `REVOKE` 앞에 주석을 두는 방식도 유효하지 않을 수 있습니다. 주석을 `GRANT`/소유권 이전 **이전**으로 이동해야 하며, 사후 역할 membership의 정확한 원장 fingerprint는 계속 불변 검사합니다. 소유권 양도 자체나 membership 변화가 비슈퍼유저 검증에서 실패하면 Production 재시도는 하지 않습니다.

## 2026-10-11 — PG17 bootstrap superuser 별도 생성 (격리 테스트 전용)

- PR #1953 병합본의 exact-main [read-only + isolated run #38096222680](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38096222680)에서 원격 원본 SQL 104021바이트/SHA 확인은 PASS했으나 `HOLD_SEYEON_PG17: Unable to reproduce Production non-superuser postgres role`로 격리 트랜잭션이 중단됐습니다. 임시 SQL은 삭제됐고 Production DB 변경은 없습니다.
- **원인:** 표준 `postgres:17.6` 컨테이너는 `POSTGRES_USER=postgres`를 PostgreSQL 클러스터의 **bootstrap superuser**로 생성합니다. PostgreSQL 17은 이 최초 슈퍼유저의 `SUPERUSER` 특성 변경을 금지하므로, 격리 역할 전환이 원천적으로 거부됩니다. 이 제약을 해제하지 않습니다.
- **수정 방향:** 격리 서비스의 최초 관리자는 `seyeon_cluster_admin`, 테스트 대상 `postgres`는 두 번째 `LOGIN SUPERUSER`로 별도 생성합니다. 기존 migration bootstrap·정확한 104KB 번들·관리 owner 역할 설치까지 `postgres`로 진행한 다음, 격리 보조 관리자 `seyeon_fixture_demoter`로 `postgres`를 `NOSUPERUSER`로 전환하고 `current_user=postgres`, `rolsuper=false`를 확인합니다.
- 별도 관리 계정/자격증명은 동일한 GitHub Actions 일회성 로컬 컨테이너에만 있습니다. Production SQL/자격증명·배포 작업·원격 migration ledger는 수정하지 않습니다. 해당 컨테이너는 GitHub Actions 종료 시 폐기됩니다.
- 변경 검증은 전체 CI/Integration → 병합 후 `REMOTE_BUNDLE_SHA256_PASS`, 실제 비슈퍼유저 역순 재현 `PASS_PG17_EXACT_BUNDLE`, `TEMP_PRIVATE_SQL_REMOVED`로 단계별 판정합니다. 이 결과가 확인되지 않으면 재적용 HOLD입니다.

## 2026-10-11 — 비슈퍼유저 로깅 옵션 수정

- [격리 테스트 #38097196211](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38097196211): `DISPOSABLE_NONBOOTSTRAP_POSTGRES_CREATED` 성공, 원격 원문 104021 bytes/SHA 확인 PASS. 역할 비슈퍼유저 전환 SQL 이후 PostgreSQL 새 연결에서 `FATAL: permission denied to set parameter "log_min_messages"`가 발생했습니다. 테스트가 이를 `Disposable PG17 executor is unexpectedly superuser`로 잘못 진단했습니다.
- 원인은 로그인 단계 `PGOPTIONS`가 슈퍼유저 전용 로깅 GUC를 강제했던 것입니다. 비슈퍼유저 DB 역할에는 해당 변수를 세션에서 설정할 권한이 없습니다. 원격 SQL·스키마·권한 적용 이전에 남겨 둔 자체 보안 설정 충돌입니다.
- 격리 PG17 관리자 권한이 유효할 때, disposable shadow 데이터베이스 자체에 `ALTER DATABASE ... SET log_min_messages=panic, log_min_error_statement=panic, log_statement=none`을 각각 지정합니다. **비슈퍼유저 전환 직후에만** `PGOPTIONS`를 제거해 새 연결이 데이터베이스 수준 안전 로깅 정책을 물려받도록 하고, SQL로 세 값을 재검증합니다.
- 안전한 로깅 기본값을 확인하지 못하면 원격 SQL 재현 없이 즉시 HOLD. 원격 운영 DB의 로깅 설정/Role/마이그레이션은 변경하지 않고, GitHub Actions disposable DB만 조정합니다.
