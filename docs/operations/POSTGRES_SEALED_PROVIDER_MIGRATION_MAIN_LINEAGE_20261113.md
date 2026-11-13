# Production Operations — 봉인 원장과 정확한 main 마이그레이션 파일 대조 (2026-11-13)

> 트랙: `ops` · Gate 1 / Phase 8-A · P0 [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887)

## 확보한 근거와 다음 비교 범위

- Production 원본 migration ledger 242개, 최종 버전 `20261109071019`, 원장 카탈로그 SHA-256 `91f24b544486d2cd9af2ef8694278c80e9a2a40a7e93a3aeedf14250d08e3a47`은 [#43174606843](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43174606843)에 암호화 보존했다.
- [#43343813577](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43343813577)에서는 실제 원본 복호화·242개 이력 지문 검증과 격리 권한 재현이 성공했다. **원장 적용·수정이나 Provider Hosted 복구는 미완료**다.
- 이전 [원격 전용 버전 처분표](POSTGRES_REMOTE_ONLY_MIGRATION_DISPOSITION_20261107.json)는 2026-11-07 기준 **241개 원격 / 276개 파일 / 원격 전용 41개 / 저장소 전용 76개**를 기술한다. 이후 원본 봉인 수집 시점은 242개이므로, 과거의 41개가 새 시점의 전체 불일치 수라고 가정하면 안 된다.

## 이번 구현 — 실제 검증 전

- 기존 `verify_provider_migration_source=true` 격리 복구에 `assess-sealed-provider-migration-file-lineage.mjs`를 추가한다. **이미 암호화 원본을 복호화·검증한 동일 보호된 실행**에서만 원본 `version/name` 쌍과 **정확히 체크아웃한 현재 main 커밋**의 `supabase/migrations/*_*.sql` 파일을 대조한다.
- 원격 전용·저장소 전용·공통 버전 개수와 버전 ID, 같은 이름/다른 버전 쌍, 기존 41개 처분표에 있던 버전의 현재 파일 포함 여부, 새로 나타난 원격 전용 버전만 비식별 결과 JSON으로 저장한다.
- 원본 SQL·작성자·백업 사용자 데이터는 기록하지 않고, 비교가 정상이어도 `appliedSqlAndCurrentDdlEquivalenceProven=false` 및 `serviceResumptionAllowed=false`를 유지한다. `migration repair`나 임의 SQL 적용은 수행하지 않는다.
- 입력 출처, SHA, 과거 처분표의 이름/버전 또는 새 저장소 파일 형식이 달라지면 실패하도록 한다. 합성 테스트 3건과 셸 문법 검사 통과.
- **주의:** 이 문서는 코드 준비 상황만 기록한다. 보호된 main의 실제 원본 대조 결과는 병합 후 동일 백업을 사용하는 수동 격리 실행에서 별도로 확인해야 한다.

## 남은 로드맵 경계

버전 목록 정합성은 객체·함수·정책·RLS·권한·Provider migration target 복원의 대체물이 아니다. 본문 NULL인 이력 12개, Hosted Auth/Storage, 개인정보 독립 연속성 및 전 서비스 RPO/RTO는 기존 미완료 조건이다.

**판정:** `NOT_ACCEPTED`, `drReady=false`, `serviceResumptionAllowed=false`; P0 #1887 OPEN, `ROADMAP_COMPLETE` 아님.

Watchtower-Track: ops
