# Production 관계 런타임 마이그레이션 역전 차단 (2026-10-11)

Watchtower-Track: ops
연계: [P0-OPS #1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) · [AI Security #1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866)

## 확인된 운영 상태 (읽기 전용 SQL)

명하 Supabase Production `cnsfpcdiyofqvhpcegfc`의 `supabase_migrations.schema_migrations`와 `pg_catalog.pg_proc`를 직접 조회했습니다.

- Relationship `1400, 1410, 1420, 1430, 1440, 1450`: **이력 6/6 없음**, 각각이 정의하는 총 **11개 함수 11/11 없음**.
- Se-yeon `1460,1470,1480,1490,1500,1510`: **이력 6/6 존재**; 18개 공개 스키마 RPC는 [기존 ACL 패리티 감사](SEYEON_1460_1510_ACL_RECOVERY_PARITY_20261010.md)에서 현재 권한 PASS.
- 복구 Bundle `20261008090417`이 원격 이력에 존재하며, 동일 버전의 정식 SQL 파일은 저장소에는 없습니다.
- 현재 운영 DB에 `1520~1640`은 미적용. 1520에는 계정 삭제 finalizer, 1530에는 Reading Artifact, 1540에는 사주 Replay Proof, 1550~1630에는 AI 비용·Governor, 1640에는 G1-B2 zero-source Pin이 포함됩니다.

이 상태는 단순한 원격 이력 표시 오차가 아닙니다. Production에서 1400~1450에 해당하는 핵심 함수 자체가 없고, 후행 1460~1510이 존재합니다. `supabase db push --include-all`은 이 중간 누락분을 일반적인 forward history로 처리하기에 적합한지 **승인 전 불확실**합니다.

## 적용한 배포 안전장치

읽기 전용 `scripts/operations/seyeon-production-history-admission-readonly.sql`은 기존 이력과 함수 카탈로그를 읽어서 단일 verdict를 반환합니다.

| Verdict | 의미 / 조치 |
| --- | --- |
| `HOLD_OUT_OF_ORDER_RELATIONSHIP_HISTORY` | 후행 Se-yeon 버전 존재 + 1400~1450 이력 누락. **일반 배포 중단** |
| `HOLD_UNRECOGNIZED_REMOTE_INCIDENT_HISTORY` | 원격 복구 Bundle 이름/bytes/SHA-256 불일치. **일반 배포 중단** |
| `HOLD_REMOTE_ONLY_INCIDENT_BUNDLE_REQUIRES_OWNER` | 원격-only Bundle 존재. Owner 정합화 승인 전 **배포 중단** |
| `HOLD_RELATIONSHIP_MIGRATION_CATALOG_DRIFT` | 1400~1450 적용 이력은 모두 있지만 함수 실물이 일부 없음. **일반 배포 중단** |
| `ALLOW_PRELIMINARY_HISTORY_CHECK` | 이 네 가지 특수 장애는 발견되지 않음. **그 자체로 배포 승인이 아니며** 이후 CLI의 원래 dry-run/검증 및 운영 승인 필요 |

일반 `scripts/operations/run-supabase-production-migrations.sh` 경로는 *모든 마이그레이션 수리와 배포 명령보다 먼저* 해당 SQL을 `default_transaction_read_only=on`으로 실행합니다. verdict가 정확히 `ALLOW_PRELIMINARY_HISTORY_CHECK`가 아니면 실패로 종료합니다.

기존 승인된 두 개의 **한정 SQL 함수/ACL 복구 전용 모드**는 별도 기존 경계로 유지했습니다. 일반 backfill·AI Provider 경로로 확장되지 않습니다.

## 재현 검증

운영 DB 실제 SELECT의 응답은 **`HOLD_OUT_OF_ORDER_RELATIONSHIP_HISTORY`**이었습니다. 어떤 원격 DDL·DML·Grant/Role 변경도 실행하지 않았습니다.

- SQL 자체는 SELECT-only입니다.
- 회귀 테스트 `test/ops/seyeon-production-migration-history-admission.test.ts`는 순서 보장, 6개 early/6개 late 버전 및 원격 복구 Bundle 검사, 가짜 `psql`의 HOLD일 때 Supabase CLI 호출 **0회**를 확인합니다.
- 정식 Production Workflow는 코드 변경을 감지하면 `deploy-migrations`를 실행하려 하지만, 현재 운영 상태에서는 **역사 정합성 선행 검사에서 의도적으로 실패**합니다. 예상되는 결과는 **차단된 CI/Production Workflow**이며 운영 DB에 쓰기를 한 결과가 아닙니다. 빨간색 실행을 성공으로 위장하거나 비활성화하지 않습니다.

## 정합화 Owner 결정 전 금지 작업

1. `20261008090417` 이력 삭제·가짜 정식 로컬 마이그레이션 등록 금지.
2. 1400~1450 retroactive 적용/임의 `supabase db push --include-all` 금지.
3. `1520~1640`을 G1/G2/G6 완료로 선언하거나 AI Route/Personal Projector 활성화 금지.
4. 이 검사에 `ALLOW_PRELIMINARY_HISTORY_CHECK`를 만들기 위한 임의 Version Marker 삽입 금지.

다음 단계는 DB Owner 승인 하에 **실제 Supabase CLI read-only dry-run** (SHA-256 고정 [독립 진단 도구](SEYEON_PRODUCTION_REMOTE_BUNDLE_FINGERPRINT_DRYRUN_V1.md)), 1400~1450의 독립 격리 환경 forward-only 검증, 최신 스키마 DR Restore, 정확한 배포 영향·복구 시점·Gate Owner 서명을 확보하는 것입니다.

**종료 조건:** 일반 Production 경로 Fail-closed 장치와 회귀 테스트만 구현. Production DB 이력 정합화 및 #1866 G6는 **HOLD** 유지.
