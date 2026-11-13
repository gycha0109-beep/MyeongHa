# Production Operations — 봉인 원장과 정확한 main 마이그레이션 파일 대조 (2026-11-13)

> 트랙: `ops` · Gate 1 / Phase 8-A · P0 [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887)

## 확보한 근거와 다음 비교 범위

- Production 원본 migration ledger 242개, 최종 버전 `20261109071019`, 원장 카탈로그 SHA-256 `91f24b544486d2cd9af2ef8694278c80e9a2a40a7e93a3aeedf14250d08e3a47`은 [#43174606843](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43174606843)에 암호화 보존했다.
- [#43343813577](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43343813577)에서는 실제 원본 복호화·242개 이력 지문 검증과 격리 권한 재현이 성공했다. **원장 적용·수정이나 Provider Hosted 복구는 미완료**다.
- 이전 [원격 전용 버전 처분표](POSTGRES_REMOTE_ONLY_MIGRATION_DISPOSITION_20261107.json)는 2026-11-07 기준 **241개 원격 / 276개 파일 / 원격 전용 41개 / 저장소 전용 76개**를 기술한다. 이후 원본 봉인 수집 시점은 242개이므로, 과거의 41개가 새 시점의 전체 불일치 수라고 가정하면 안 된다.

## 이번 구현 및 실제 검증 결과

- 기존 `verify_provider_migration_source=true` 격리 복구에 `assess-sealed-provider-migration-file-lineage.mjs`를 추가한다. **이미 암호화 원본을 복호화·검증한 동일 보호된 실행**에서만 원본 `version/name` 쌍과 **정확히 체크아웃한 현재 main 커밋**의 `supabase/migrations/*_*.sql` 파일을 대조한다.
- 원격 전용·저장소 전용·공통 버전 개수와 버전 ID, 같은 이름/다른 버전 쌍, 기존 41개 처분표에 있던 버전의 현재 파일 포함 여부, 새로 나타난 원격 전용 버전만 비식별 결과 JSON으로 저장한다.
- 원본 SQL·작성자·백업 사용자 데이터는 기록하지 않고, 비교가 정상이어도 `appliedSqlAndCurrentDdlEquivalenceProven=false` 및 `serviceResumptionAllowed=false`를 유지한다. `migration repair`나 임의 SQL 적용은 수행하지 않는다.
- 입력 출처, SHA, 과거 처분표의 이름/버전 또는 새 저장소 파일 형식이 달라지면 실패하도록 한다. 합성 테스트 3건과 셸 문법 검사 통과.
- **실증:** 아래 보호된 수동 복구 실행에서 원본 전체 버전 식별자 대조를 완료했다. 대상 Provider 원장 재생이나 SQL 효과 동등성은 여전히 미완료다.

## 2026-11-13 현재 frontier 실측 확정

- [격리 실행 #43350367171](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43350367171) SUCCESS, 작업 커밋 `9a5f903d8c3498a18363286000525f8114671b9e`; 증거 artifact #14002903484, ZIP SHA-256 `9432441c41030f0702c93d570b3514e3c43798ac2bfdeb49c16cad61c3329e9f`.
- 원본 242개와 정확한 main SQL 파일 276개에서 버전 공통 **200개**, 원격 전용 **42개**, 저장소 전용 **76개**, 같은 버전명 불일치 **0개**. 이름이 양측에 고유하게 일치하는 다른 버전 쌍은 **1개**(`20261029012948`↔`20261029012000`). 이전에 별도 SQL 비교한 8개 쌍을 이 1개로 덮어쓰지 않는다.
- 2026-11-07 기준 원격 전용 41개는 **41개 모두** 신규 봉인 원장에 존재하고 정확한 버전 파일이 여전히 없다. 새 원격 전용 버전은 `20261109071019` **1개**다. SQL 원본 누락 12개는 이전과 동일하다.
- 같은 날 Production에서 추가로 `BEGIN TRANSACTION READ ONLY` 관측: 총 242개/frontier `20261109071019` 유지. 신규 버전명 `admin_a4_reading_ai_cost_binding_reader_rls_off_managed_v1_20261109`, 보존 statement 1개/5,512바이트/SHA-256 `974840e6f7ef77717983ed2baec7e2f08712b9ea2048456f2f907f06388992e8`. 생성자 메타데이터는 존재하나 **인증된 실행자 입증은 아니며**, rollback·idempotency key는 없다. SQL 원문은 열람 결과로 반환하거나 공개하지 않았다.
- 이전 [41개 원격 전용 처분표](POSTGRES_REMOTE_ONLY_MIGRATION_DISPOSITION_20261107.json)는 **역사적 스냅샷으로 유지**하고, [42개 현재 frontier 증분 처분표](POSTGRES_REMOTE_ONLY_MIGRATION_DISPOSITION_DELTA_20261113.json)에서 새 Admin A4 항목을 별도 HOLD로 분류했다. Admin 소유 기능·Production SQL을 변경하지 않는다.
- **권한·객체 효과, 실제 적용 SQL의 저장소 등가성, Provider target 원장 복원은 입증되지 않았다.** 이 비교는 오로지 버전·파일 출처 인벤토리다.

## 남은 로드맵 경계

버전 목록 정합성은 객체·함수·정책·RLS·권한·Provider migration target 복원의 대체물이 아니다. 본문 NULL인 이력 12개, Hosted Auth/Storage, 개인정보 독립 연속성 및 전 서비스 RPO/RTO는 기존 미완료 조건이다.

**판정:** `NOT_ACCEPTED`, `drReady=false`, `serviceResumptionAllowed=false`; P0 #1887 OPEN, `ROADMAP_COMPLETE` 아님.

Watchtower-Track: ops
