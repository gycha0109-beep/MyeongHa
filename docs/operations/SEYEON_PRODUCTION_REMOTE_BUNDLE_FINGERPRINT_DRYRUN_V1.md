# 세연 원격 전용 복구 이력 — SHA-256 고정·임시 CLI 사전 점검

Watchtower-Track: ops
참조: [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) / [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866)

## 이 작업이 해결하는 문제

운영 Supabase의 `20261008090417_seyeon_runtime_1460_1510_acl_before_owner_recovery`는 저장소에 없는 104KB 복구 SQL이고, 운영 DB에는 **이미 적용된 이력**으로 남아 있습니다. 그래서 일반 `supabase db push --include-all --dry-run`에서 **remote migration versions not found in local migrations directory** 오류가 발생합니다.

`scripts/operations/seyeon-production-history-fingerprint-dryrun.sh`는 이력을 삭제하거나 로컬 정식 마이그레이션에 위장해 추가하지 않습니다. 대신 **운영 DB에 저장된 원본 Statement를 정확히 검증한 후**, 한시적인 별도 작업공간 안에서만 대응 버전 파일을 구성하고 Supabase CLI의 **list + dry-run**만 실행하도록 설계했습니다.

이는 DB Authority의 결정에 필요한 진단 도구이지, 정식 배포의 자동 우회 경로가 아닙니다.

## 원격 DB 원본 증거 (2026-10-10, 읽기 전용 확인)

| 근거 | 지문 |
| --- | --- |
| Production ID | `cnsfpcdiyofqvhpcegfc` |
| 기존 버전 | `20261008090417` |
| 기존 이름 | `seyeon_runtime_1460_1510_acl_before_owner_recovery` |
| 원격 `statements` | 정확히 1개 |
| UTF-8 바이트 | `104021` |
| SHA-256 | `4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894` |

SHA-256은 **관측된 본문과 동일한지 확인**하는 지문이지, DB 이력 작성의 권위 있는 서명이나 Owner 승인 대체물이 아닙니다.

## 보안 경계

- 대상 Supabase 프로젝트 ID를 고정하고 session-pooler 호스트명 형식을 검증합니다.
- 필요한 환경변수는 기존 Production 운영 스크립트와 동일한 세 가지로 제한합니다. 자격증명은 CI Secret이나 승인된 비밀 관리 경로에서만 주입합니다.
- DB SELECT는 정확한 `version/name/1 Statement/bytes/SHA-256`를 모두 충족할 때만 원본을 반환합니다.
- HEX 전송과 SHA-256 로컬 재검증으로 **SQL 원본 바이트를 보존**합니다. SQL 본문을 로그·Git·이슈에 인쇄하지 않습니다.
- `umask 077`의 임시 작업공간에만 `config.toml`, `supabase/migrations`, 검증된 원격 SQL을 복사하고 종료 시 삭제합니다.
- `PGOPTIONS=-c default_transaction_read_only=on`을 사용하며, CLI는 `migration list` 및 `db push --include-all --dry-run` 두 호출뿐입니다.
- **정식 `supabase/migrations`에 이력 파일을 추가하지 않습니다.**
- 버전이 현재 저장소에 생겼거나 해시·길이·명칭이 변했다면 **즉시 HOLD**합니다.
- `run-supabase-production-migrations.sh` 및 `.github/workflows/supabase-production.yml`에는 연결하지 않습니다. 따라서 해당 브랜치 병합으로 운영 배포가 자동 실행되지 않습니다.

Supabase CLI `--dry-run` 동작은 [공식 CLI 문서](https://supabase.com/docs/reference/cli/supabase-db-push)에 근거합니다. 옵션 동작이 바뀌면 실행 전 CLI 버전과 계약을 다시 검증해야 합니다.

## 사용법: 승인된 운영자 환경에서만

PostgreSQL client, Supabase CLI, Python 3, sha256sum이 필요합니다. 스크립트에 실계정/비밀번호를 직접 기록하지 마십시오.

```bash
# 인증정보는 기존 승인된 운영 Secret을 통해 미리 주입해야 합니다.
bash scripts/operations/seyeon-production-history-fingerprint-dryrun.sh
```

출력의 `READ_ONLY_DRYRUN_PASS`는 **원격 SQL 지문과 CLI dry-run 호출이 정상적으로 완료됐다**는 뜻입니다. Pending migration 목록, 전후 권한·데이터의 전체 동등성이나 Production 배포 승인은 뜻하지 않습니다. 실제 SQL 적용은 여기서 실행되지 않습니다.

## 검증·잔여 블로커

- 원격 지문(`version/name/bytes/SHA-256`)은 명하 Supabase Production에서 **실제 SELECT 검증**했습니다.
- 코드 검증: `test/ops/seyeon-production-history-fingerprint-dryrun.test.ts`는 배포 스크립트와의 비연결, dry-run 명령만 존재하는지, 잘못된 프로젝트 및 위조 원격 데이터를 fail-closed 처리하는지 검사합니다.
- **실제 운영 DB에 대한 Supabase CLI dry-run 실행은 아직 수행하지 않았습니다.** GitHub/Supabase 커넥터만으로 CI 실행 환경의 비밀 자격증명과 로컬 CLI 작업공간을 동시에 사용할 수 없으므로, 별도 승인된 운영 환경에서 실행해야 합니다.
- 다음 단계에서는 임시 dry-run의 실제 결과와 pending `1400~1450`, `1520~1640` 의존성·부작용·복원가능성 및 영향 범위를 DB Authority가 검토해야 합니다.
- **금지:** 이 스크립트를 Production deploy job으로 자동 연결, 승인 없는 `migration repair`, 일반 `db push`, historical bundle의 상시/local migration 위장 보관, DR 준비성 검사 우회.

최종 판정: **읽기 전용 호환성 진단 도구만 제공. 운영 이력 정합화, 1640 Pin 적용, 실운영 백업·복원 및 #1866 G6 모두 HOLD.**
