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
- 새 staging 실행기는 Git blob ID 여섯 개와 원문 SQL 구문을 정확히 검사하고, **각 파일 마지막의 `REVOKE myeongha_relationship_apply_owner FROM current_user` 문장만 기존 마지막 `COMMENT ON FUNCTION` 뒤로 이동**한 비공개 임시 사본 6개를 생성합니다. 주석 본문/함수 정의/ACL/Owner/SQL 내용은 변경하지 않고 문장의 순서만 바뀝니다.
- staging 내용에는 원래 위치 이후 `COMMENT ON FUNCTION`만 존재해야 하며 그 외 DDL/DML이 하나라도 있으면 즉시 HOLD. 원문 SHA 불일치도 즉시 HOLD.
- Production에서 기존의 **단일 트랜잭션/정확한 여섯 개 파일/마이그레이션 이력 6건/Owner·ACL 및 역할 membership 불변/브라우저 실행 권한 0/관계 레코드 0/rollback** 검사는 완전히 유지합니다.
- `test/db/seyeon_remote_bundle_pg17_isolated.sh`는 실제 remote-only 정확본 104KB를 로컬 PG17에 적용한 뒤 **postgres 역할을 NOSUPERUSER로 강등**하고 Production과 같은 staged 6개 SQL 및 동일한 pre/post 검증을 수행합니다.
- 별도의 부정 테스트는 원문 공백 1자 변경만으로도 staging이 거부되는 것을 확인합니다. staging SQL 원문은 로그·artifact에 저장하지 않고 임시 디렉터리 종료 시 자동 삭제합니다.

## 허용 기준

1. 이 수정 PR의 일반 CI, Governance, 전체 Integration을 통과해 본문만 `main`에 병합합니다. **이 PR에는 운영 DB 재적용 트리거가 없습니다.**
2. 병합 후 새 exact-main `[WT:character-memory]` Production read-only audit + private 104KB PostgreSQL 17 **비-superuser 재현 PASS** 확인.
3. 이후에도 실제 Production 재적용은 본 PR과 별개의 신규 검증된 백업/복원 증거 및 **새로운 일회성 보호 PR**을 요구합니다. 기존 실패한 one-shot 제목을 다시 사용하는 재실행은 허용하지 않습니다.
4. Supabase 연결 확인에 추가 결함이 나오면 데이터에 접근하거나 보호를 우회하지 않고 HOLD.

G0~G6/G6, 세연 공개 경로, 유료 AI, 개인 Projector는 기존대로 HOLD.
