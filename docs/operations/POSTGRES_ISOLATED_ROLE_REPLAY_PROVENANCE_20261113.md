## 2026-11-13 실제 보호된 main 격리 재현 결과

- PR [#3255](https://github.com/gycha0109-beep/MyeongHa/pull/3255) 병합 및 필수 통합 검사 성공. 실제 수동 격리 복구 [#43343813577](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43343813577) **SUCCESS**. 원본은 기존 보호된 수동 백업 #43174606843에서 확보한 원장·PostgreSQL 백업 한 쌍. 비식별 검증 증거 아티팩트 #14000940857, ZIP SHA-256 `009f41101fd0fa388266141ffb181c587a6c3e1e93a6232bc5e985e20f5f8654`.
- 같은 실행의 실제 평가 `isolated-provider-role-replay-provenance.json`: 원본 직접 역할 연결 **48개**, 격리 재현 **48개**, 대상 관측 **48개**; 역할별 권한 옵션·부여자 정보 일치. `directRoleMembershipTargetRehearsalProven=true`. 그와 별개로 원본 `roles.sql`에서 제외된 외부 역할 연결은 48개 그대로이며, 이 파일만으로 Provider 역할을 복구했다고 판단하지 않는다.
- 암호화 원장은 실제 복호화·원문 지문 검증에 재성공했고 242개 version, frontier `20261109071019`, 원문 SQL 누락 12개가 유지됐다. 원장 이력은 격리 대상에 기록하거나 적용하지 않았다.
- 전체 앱 스키마 동등성, 원본 카탈로그와 백업의 단일 MVCC snapshot, Provider 소유권·상속 접근권한, Hosted Auth/Storage와 개인 정보 연속성, 전 서비스 RPO/RTO는 미입증. `fullProviderCompatibleRestoreProven=false`, `drReady=false`, `serviceResumptionAllowed=false` 유지. 재현 세부는 [실측 근거](POSTGRES_ISOLATED_PROVIDER_ROLE_REPLAY_REAL_PROOF_20261113.json)에 보존한다.

# Production Operations — 격리 역할·권한 복원 출처 검증 (2026-11-13)

> 트랙: `ops` · Gate 1 / Phase 8-A·8-B · P0 [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887)

## 검증된 선행 근거

- 원본 Provider 이력 봉인 [#43174606843](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43174606843) 및 같은 백업을 사용한 격리 복구·실제 복호화 [#43179685582](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43179685582) 성공. 원장 242개·frontier `20261109071019`, 원본 SQL 본문이 없는 12개는 그대로 유지된다.
- 격리 원본 카탈로그에 앱↔외부 역할 **직접 연결 48개**가 기록되며, 필터링된 `roles.sql`에는 이 48개가 없다. 이는 데이터가 백업에서 손실됐다는 확정 판정이 아니라, 필터링된 역할 파일 **단독**으로 해당 연결을 복구할 수 없다는 근거다.
- 별도 disposable PG17 재현 절차가 보호된 원본 카탈로그를 기반으로 실제 GRANT를 실행했고, 사후 카탈로그에서 연결 48/48개, 옵션 및 grantor가 비교 대상과 일치했다. 하지만 그 재현은 **독립적인 무료 격리 환경**의 실험이다.
- 같은 카탈로그는 백업 실행 전후 읽기 전용 관측으로 확보했으며, 원본 백업과 동일한 MVCC 스냅샷이라고 보장하지 않는다. 전체 앱 스키마와 Provider 복구 동등성은 아직 미입증이다.

## 이번 구현

- `assess-isolated-provider-role-replay-proof.mjs`가 같은 복구 실행에서 생성된 **봉인 원장 복호화 증거, 역할 GRANT 실행 증거, 대상 역할·옵션·grantor 비교, 원본 역할 파일의 누락 분석**을 교차 검증한다.
- 실제 격리 실행 및 메타데이터가 모두 일치할 때만 `directRoleMembershipTargetRehearsalProven=true`를 기록한다. 48개 연결 중 하나라도 누락되거나 부여 옵션이 다르면 검증 실패 처리한다.
- 기존 `postgres-isolated-restore-drill.yml`의 수동 원장 검증 옵션이 켜진 경우에만 마지막 단계에서 실행하고, 원본 SQL/역할명·개인정보 없이 비식별 JSON을 기존 증거 아티팩트에 포함한다. 정기·push 작업 및 일반 복구 경로는 변경하지 않는다.
- 처음 구현한 검증 단계는 **PR 병합 이후 보호된 main의 새 격리 실행**으로 실증해야 한다. CI 녹색이나 이전 실행 결과를 새 검증 단계의 실제 성공으로 간주하지 않는다.

## 남은 차단 조건

- `roles.sql`의 Provider 경계 누락 48개는 별도 격리 GRANT 재현으로 확인했지만, 실제 Hosted 복구 대상에서 재현 가능한지와 Provider 소유권·상속된 유효 접근권한을 증명하지 못했다.
- migration ledger 대상 복원, 원본 SQL 본문 누락 12개, 전체 schema/권한, Hosted Auth 로그인·갱신·폐기, Storage 바이트, 독립 개인정보 연속성, 전 서비스 RPO·RTO는 기존 로드맵의 미완료 항목이다.
- Production DDL/DML·권한·시크릿 변경, 유료 Hosted 프로젝트 생성, 개인정보 canary 실행은 없다.

**절대 판정:** `NOT_ACCEPTED`, `drReady=false`, `serviceResumptionAllowed=false`, P0 #1887 OPEN 유지. `ROADMAP_COMPLETE` 아님.

Watchtower-Track: ops
