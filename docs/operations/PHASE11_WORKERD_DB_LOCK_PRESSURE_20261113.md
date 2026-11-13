# Phase 11 — 실제 workerd 제품 경로의 격리 DB 지연·회복 검증

> 2026-11-13 · `ops` · Gate 2 / Phase 11 · 비운영 격리 실험만 허용

## 기존 근거 재사용

- GoTrue + PostgreSQL18 + 고정 Saju 계산 엔진의 기존 실제 `workerd` DB **완전 중단·복구** 실증 [#42402515024](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42402515024)은 성공했다. 12/12 기본 요청 성공, DB 프로세스 중지 후 요청 4/4 unavailable, 독립 Health 200, 재시작 후 동시 4/4 성공. 추가 중복 측정은 하지 않는다.
- 위 실증은 **DB가 아예 없을 때**의 제한된 실패·회복이다. 느린 DB 쿼리나 `workerd` 쿼리 지연 경계는 별도로 측정해야 한다. 기존 isolated PostgreSQL18 연결 풀 압박 실증은 Node 측 로컬 측정이며 Cloudflare Hosted Hyperdrive 동등성이 아니다.

## 이번 구현

- 기존 수동 `.github/workflows/postgres-isolated-rls-capacity-acceptance.yml`의 `experiment=workerd_db_pressure` 선택으로만 실행한다. 정기·push 트리거의 새로운 자동 실행 경로는 없다.
- 제품 경로에서 실제 `workerd`+고정 Wrangler 4.152.0, Disposable GoTrue 사용자 4명, Disposable PostgreSQL18 RLS, 고정 Saju 엔진의 정상 요청 **12/12**를 먼저 확인한다.
- 같은 **폐기형 DB**에서 별도 관리자 트랜잭션으로 실제 `public.ops_phase11_birth` 테이블에 `ACCESS EXCLUSIVE` 잠금을 건다. 애플리케이션 요청 4건을 동시에 보내 정상 완료를 기대하지 않고 `503/unavailable`로 제한되는지, 잠금 유지 중 독립 Health가 200인지 확인한다.
- 반드시 `finally`에서 트랜잭션을 `ROLLBACK`해 잠금을 해제한다. 그 후 같은 제품 경로에서 동시 4건 모두 정상 계산으로 회복하는지 확인한다. 종료 후 GoTrue·DB·Saju·workerd·Docker 자원을 정리하고 개인 ID·JWT·SQL 오류 문구 없이 비식별 관측만 업로드한다.
- `dbPressure.kind=disposable-table-lock-query-stall`, `actualDatabaseLockInjected=true`는 **해당 폐기형 DB의 잠금으로 지연을 재현했다는 근거**로만 사용한다. 쿼리 타임아웃과 연결 획득 타임아웃 중 특정 원인의 단독 인과성은 별도 지표 없이 추정하지 않는다(`exactPoolAcquisitionTimeoutCauseProven=false`).
- 초기 구현·셸/JS 문법 검사는 통과했으나, **보호된 main의 실제 수동 실험 성공 전에는 DB 지연·회복 실증 완료로 표시하지 않는다.**

## 수용 경계

`productionWorkerAdmissionMeasured=false`, `hostedHyperdriveMeasured=false`, `productionCapacityProven=false`, `productionScalingThresholdApproved=false`, `drReady=false`, `serviceResumptionAllowed=false`.

비운영 RLS fixture 및 로컬 위조가 아닌 실제 PG18 테이블 잠금만 사용한다. Production DB·토큰·트래픽·배포·시크릿·권한 또는 유료 Hosted 자원은 변경하지 않는다. 새 실험의 증거는 완전한 실행 결과와 원본 artifact가 확인된 후 별도로 기록한다.

Watchtower-Track: ops
