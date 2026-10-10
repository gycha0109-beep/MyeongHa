# D3B2B-3D1 — 레거시 AI 비용 RPC 철회 전 전환 게이트 (HOLD)

Watchtower-Track: character-memory

## 결정

**현재 REVOKE 승인 불가.** 3C는 호출 경로를 분리했지만, 일반 DB 역할 `myeongha_api_executor`에 레거시 Start·Settle·Record EXECUTE가 남아 있어 OFF 호환이 유지된다. 이 권한을 실제로 철회하면 기존 OFF 서버 세대 및 미정산 호출이 차단될 수 있다. 본 PR은 안전한 철회 조건을 측정하고 테스트할 뿐, Production 권한·환경변수·모델 호출을 변경하지 않는다.

추가적인 Production 블로커: [운영 마이그레이션 정합성 #1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887). `docs/operations/SEYEON_PRODUCTION_MIGRATION_LINEAGE_HOLD_20261010.md`에 따르면 Production은 원격 복구 번들 20261008090417의 이력과 저장소가 불일치하고 1520~1640이 미적용 상태다. **CI PostgreSQL에 마이그레이션이 적용되어도 Production 적용 증거가 아니다.** 이 문제가 승인된 방식으로 해결되기 전에는 전환을 시도하지 않는다.

## 제공된 검증 도구

### 1. CI 전용 트랜잭션 시뮬레이션

`test/db/seyeon_ai_legacy_cutover_revoke_simulation_v1.sql`:
- 트랜잭션 시작 전 기존 OFF의 Legacy Start/Settle/Record EXECUTE를 확인한다.
- **폐기 가능한 CI DB에서만** 3개 RPC를 `REVOKE`하는 가상 전환을 단일 트랜잭션 내 시뮬레이션한다.
- 공용 역할이 세 RPC를 호출할 수 없고 Governed-only 역할은 Governed Start/Settle을 유지하는지 실제 함수 호출·권한 매트릭스로 검증한다.
- `COMMIT`하지 않고 반드시 `ROLLBACK` 후 공용 역할의 기존 OFF 권한 복구를 재확인한다.
- `test/db/run_authority_core.sh`에서 실행한다. 운영 DB에 이 파일을 실행하지 않는다.

### 2. 운영 담당자용 읽기 전용 진단

`scripts/operations/seyeon-legacy-cost-revoke-readonly-preflight.sql`:

```bash
psql -X -v ON_ERROR_STOP=1 -f scripts/operations/seyeon-legacy-cost-revoke-readonly-preflight.sql
```

- `BEGIN READ ONLY` 및 `ROLLBACK` 사용. 5초 statement timeout. 스키마 미적용·부분 적용이면 실행을 거부하거나 누락 상태로 집계하고 **0건으로 간주하지 않는다**.
- DB 역할/함수 존재 여부, 공용 역할의 레거시 권한, 전체/레거시/Governed 미정산 호출과 지난 24시간 시작 건수, 운영 예산 행 존재를 요약한다.
- 사용자·Subject·Call ID·원시 모델 응답·비밀값 출력 금지; 집계 지표만 표시한다.
- 결과가 0이더라도 **전환 승인 아님**. 결과의 마지막 줄은 항상 `HOLD_REQUIRES_OWNER_APPROVAL_RUNTIME_DRAIN_INDEPENDENT_LOGIN_AND_MIGRATION_RECONCILIATION`이다.
- 별도로 `scripts/operations/seyeon-production-migration-lineage-readonly.sql`을 실행하여 운영 이력 조사 결과와 연결한다.

## 실제 철회 전 필수 증거 및 승인

1. **운영 DB lineage 정합성**: #1887 원본/이력 소명, 승인된 별도 마이그레이션 계획 및 실제 적용 증거, DR/백업·복구 검증.
2. **서비스 세대 종료**: Chat public turn-send, Post-turn Worker, 재시도/스케줄/배포 Preview 등 모든 AI 호출자 inventory, OFF 사용 금지 확인, 이전 서버 세대 drain과 rollback 기간 검토. 코드상 ENFORCE 존재만으로 OFF 종료를 추정하지 않는다.
3. **비용 원장 마감**: 레거시 `lifecycle_state='started'` 0건 확인 및 미정산 계정 처리·결제/사용량 불명 구간 기록. **시점별 0건은 향후 신규 시작이 없음의 증거가 아니다.** 분산 생성자 차단 이후 별도 재검증이 필요하다.
4. **로그인/권한 실증**: Production 별도 Governed DB LOGIN 생성·비밀관리·회전·실제 독립 세션의 `session_user`, `SET ROLE` 교차 거부, 예산/원장 직접 접근 차단과 Governed RPC 성공. 현재 CI의 임시 LOGIN 시험과 혼동하지 않는다.
5. **비용·동시성·장애**: D4 시작/정산, 재시도/삭제/복구 경합과 글로벌/Subject 예산 정합성; Provider 오류·원장 미정산·Over-ceiling 후속 처리 입증.
6. **정확한 배포 승격**: 승인 Owner, main SHA, 기존 OFF 차단·Drain 후 단계적 전환·회귀/스모크, 수동 롤백 방안(공용 권한 복원만으로 ENFORCE 이전 DB/Provider 상태가 되돌아가는 것은 아님)과 monitoring 기록.
7. **Security G4/G6/D5 승격 승인**: 위 증거가 승인된 뒤에만 별도 마이그레이션/운영 절차를 검토. **본 PR에는 운영용 REVOKE migration이 없다.**

## 종료 상태

- **구현**: 롤백형 ACL 시뮬레이션, 운영 집계형 사전 진단, CI 등록 완료.
- **검증**: exact-head CI / DB Authority Core / 전체 Integration 확인 후 PR 병합.
- **운영**: 별도 LOGIN 자격 없음; Production ENFORCE는 OFF; 레거시 EXECUTE 유지; #1887과 Owner 승인 전까지 D3B2B-3D 철회 HOLD.
