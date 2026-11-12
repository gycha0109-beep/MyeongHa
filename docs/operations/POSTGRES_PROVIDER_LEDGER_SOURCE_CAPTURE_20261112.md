# Production Operations — Provider 마이그레이션 원본 봉인 수집 경로 (2026-11-12)

> 트랙: `ops` · Gate 1 / Phase 8-A·8-B · P0 [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887)
> 성격: 기존 Production 백업에 대한 **선택적 읽기 전용 원본 이력 수집 구현**. Production/Provider 복구나 운영 수용 완료 기록이 아님.

## 확정된 실제 사실

- PR #3239 병합 후 격리 실측 [#43158737963](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43158737963): 원본 migration 242개 / frontier `20261109071019` / 봉인 원장 fingerprint `91f24b544486d2cd9af2ef8694278c80e9a2a40a7e93a3aeedf14250d08e3a47`; 무료 Supabase CLI 3.1.0/PG17 격리 대상 `supabase_migrations.schema_migrations` 테이블 **부재**. 대상 count/frontier/digest는 모두 **null (관측 불가)**.
- **NULL 본문 12개의 정확한 버전:** `1400`–`1510` (10단위 연속). 원격 메타데이터의 이름과 같은 12개 SQL 파일이 현재 저장소에 존재하고, 각 파일에 주석 외 SQL이 포함되어 있음을 확인했다. 그러나 **저장소 SQL 파일이 실제 Production에서 실행된 SQL과 같다는 증거는 없다**. 자세한 비식별 목록은 [POSTGRES_PROVIDER_LEDGER_NULL_STATEMENT_DISPOSITION_20261112.json](POSTGRES_PROVIDER_LEDGER_NULL_STATEMENT_DISPOSITION_20261112.json) 참조.
- 2026-11-12 Supabase Production에서 현행 `production-migration-catalog-fingerprint-readonly.sql`과 동등한 집계 SQL을 **직접 SELECT-only 실행**: 버전 242개, frontier `20261109071019`, 위 원본 catalog fingerprint **완전 일치**. 이 시점의 원격 history metadata만 입증하며 사용한 기존 봉인 파일의 실제 동일 MVCC 백업 시점 증명은 아니다.
- 같은 Production의 `pg_catalog`/집계만 읽어 현행 원장 필드 **6개** (`version`, `statements`, `name`, `created_by`, `idempotency_key`, `rollback`)를 확인. 242개 행 모두 숫자 버전, `statements IS NULL` **12개**, `created_by IS NOT NULL` **46개**, idempotency/rollback populated **0개**. `created_by` 필드 존재는 인증된 배포 실행자 증거가 아니다. 12개는 원본 SQL 문장이 보존되지 않은 이력으로 별도 정합화가 필요하다.
- 현재 봉인 백업은 Provider migration ledger **원본 행을 제외**하고 hash/count/frontier만 저장한다. 해당 백업으로는 누락된 이력 row들을 복원할 수 없다. 기존 Provider COPY 93/93행 및 Auth 참조 검증은 독립된 성공이며 반복하지 않는다.

## 승인된 범위에서 추가한 코드

- `scripts/operations/production-provider-migration-ledger-sealed-source-readonly.sql` — 기존 Production 원장에서 6개 필드와 전체 catalog hash를 동일 READ ONLY 트랜잭션 내 확보. **본문을 표준 출력·일반 artifact·Git 커밋으로 내보내는 실행을 금지**.
- `scripts/operations/assess-production-provider-migration-ledger-source.mjs` — 메타데이터와 **전체 원본 SQL 텍스트에서 계산한 statement SHA-256을 원본 fingerprint와 대조**. 6개 필드·개수·frontier·중복·null SQL을 검증하고 실제 본문, 작성자, SQL 오류 메시지는 출력하지 않음. source SQL이 비어 있는 버전의 수를 별도 기록.
- `scripts/operations/capture-provider-migration-ledger-source-encrypted.sh` — 기존 백업의 엄격 TLS 접속/암호화 패스프레이즈를 **재사용**해 별도의 AES-256-CBC/PBKDF2 암호화 artifact를 생성. 원문과 임시 로그는 업로드하지 않고, 실행 후 임시 디렉터리 삭제. 공개 manifest에는 count/hash/복구 차단만 보존.
- `.github/workflows/production-postgres-backup.yml` — 기존 워크플로를 재사용. `workflow_dispatch`의 `capture_provider_ledger=true` 선택 시에만 별도 원본 봉인 수집 수행. **기본값 false**이며 정기 `schedule` 및 기존 `push` 백업에서는 원장 SQL 본문 수집을 실행하지 않음. 기존 봉인 백업의 archive 멤버·파일 형식·수동/정기 경로는 유지.
- 기존 운영 Governance 검증과 Node 합성 테스트에 관련 안전 경계 및 null 진단 추가. 별도 신규 워크플로는 만들지 않음.

## 2026-11-12 보호된 실제 수집·격리 복구 결과

- 보호된 `main` 수동 백업 [#43174606843](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43174606843) SUCCESS. 공개 원장 아티팩트 #13923871638에 암호화 파일·체크섬·비식별 manifest만 포함됐고 실제 SHA-256 검증이 일치했다. 원장 **242개**, frontier `20261109071019`, 원장 SHA `91f24b544486d2cd9af2ef8694278c80e9a2a40a7e93a3aeedf14250d08e3a47`, SQL 본문 누락 12개, created_by 메타데이터 46개로 확인. 같은 실행의 별도 SQL 백업은 #13923088346. [실측 증거](POSTGRES_PROVIDER_LEDGER_SEALED_CAPTURE_REAL_RUN_20261112.json).
- 같은 실행 백업의 독립 격리 복원 [#43176401912](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43176401912)은 SUCCESS. 다만 전체 애플리케이션 스키마 동등성 `false`, 복구된 migration history `false`, 외부 역할 권한 증거 `HOLD`, serving admission `BLOCKED`. [실측 증거](POSTGRES_CURRENT_FRONTIER_ISOLATED_RESTORE_20261112.json).
- **후속 구현 중:** 기존 격리 복구 워크플로에 선택적 `verify_provider_migration_source`를 추가해 동일 백업 실행의 암호화 원장만 내려받고 임시 공간에서 복호화·원문 지문 확인 후 비식별 HOLD 보고를 남기는 경로를 준비했다. 이 경로의 실제 실행 성공은 병합 이후 별도로 확인해야 하며, Provider 원장 복구나 SQL 적용으로 간주하지 않는다.

## 실측 및 복구 한계

1. 이 파일들은 선택적 원본 수집 경로를 준비한 것이다. **새 암호화 migration ledger 아티팩트가 실제로 생성됐는지는 보호된 main 수동 실행 결과로 별도 확인**해야 한다. PR 검사 성공을 실제 Production 원본 수집 성공으로 간주하지 않는다.
2. 암호화한 이력 기록이 존재해도 **원본 12개 SQL 본문 NULL**은 복원되지 않는다. 원본 원장의 서면 이력 일치는 현재 객체·함수·정책·권한과의 DDL 정합성 입증이 아니다.
3. 이 경로는 SQL/History의 `CREATE TABLE`, `INSERT`, `migration repair`를 실행하지 않는다. 원격 버전/파일 출처 차이(원격 전용 42, 저장소 전용 76, 공통 200) 및 Hosted Auth/Storage 복구는 별도 잔여 작업이다.
4. 명시 승인 없이는 Production 쓰기/권한·Secret 변경, 신규 유료 Hosted DR, 실제 개인정보 Canary 수행 금지.
5. Provider 93행 실제 격리 복원, Auth FK 무결성 성공 증거는 유지하되 서비스 로그인/토큰 폐기/Storage 파일 바이트/current frontier/개인정보 독립 연속성/RPO PT24H·RTO PT6H는 여전히 **미증명**이다.

**절대 판정:** `NOT_ACCEPTED`, `drReady=false`, `serviceResumptionAllowed=false`, P0 #1887 OPEN, `ROADMAP_COMPLETE` 아님.

Watchtower-Track: ops
