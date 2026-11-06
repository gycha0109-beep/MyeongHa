# Production Operations — 종료 집중 로드맵

> 기준일: 2026-11-07 KST  
> 트랙: `ops` / 저장소: `gycha0109-beep/MyeongHa`  
> 기준 main: `1609aa879aa63120072b4d21b35f4c469dc650ed`  
> 권위 문서: `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md` §33–§38, `PRODUCTION_OPERATIONS_STATUS_AND_EXIT_20261030.md`, Phase 8 DR 문서 및 Issue [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887)

## 1. 개정 목적과 유지 범위

이 문서는 Production Operations의 기존 13단계 목표·필수 수용 기준을 바꾸지 않고, 2026-11-07 현재 확보된 실증을 재사용해 **남은 차단과 최종 수용 검증에 작업을 집중**하도록 실행 순서를 개정한다.

- 최종 목표는 기존과 동일하다: 명하 Production을 관찰·격리·복구할 수 있고, 실제 용량과 확장 판단 근거를 갖춘 운영 체계.
- Phase 1–13과 Architecture §33의 14개 Production 검증 항목, §34 장애 행렬, §35 필수 Runbook은 그대로 유지한다.
- 이미 통과한 비운영 실증을 이유 없이 반복하지 않는다. 새 배포·구성 변경 또는 기존 증거의 범위 불일치가 있을 때만 해당 검증을 갱신한다.
- Phase 1–7 및 9–10은 새 기능을 다시 구현하는 트랙으로 되돌리지 않는다. 남은 항목은 Phase 13 최종 수용에서 필요한 증거만 보완한다.
- Production SQL/DDL, migration repair/deploy, 계정·토큰·Storage, 비밀, 트래픽, 유료 리소스 변경은 이 로드맵만으로 승인된 것으로 간주하지 않는다.

**현재 판정:** `NOT_ACCEPTED` / P0 [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) OPEN / `dr_ready=false` / `serviceResumptionAllowed=false`.

## 2. 현재 기준점 — 이미 확보한 증거

| 영역 | 현재 확인된 사실 | 수용 범위와 한계 |
|---|---|---|
| Production Worker 익명 E2E | [#42271216975](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42271216975), main `1609aa8…`, Worker `295b9496-795b-44a3-b3f9-141c0b83e47d` | 화면·Health 200, 설정 기반 Readiness 200, 익명 Member/Saju/Preview 401, Cross-origin 403, unknown route 404. 실제 DB/Auth/Saju 연결 증명은 아님. |
| Production DB 현황 | PostgreSQL 17.6, 원격 migration 원장 241개, 최신 `20261105075227` | 읽기 전용 관측. 전체 저장소 SQL/DDL/권한 동등성은 미증명. |
| Migration 비교 | main SQL 276개, 원격 전용 40개, 저장소 전용 75개, 동일 이름 버전 불일치 1개 | 원격 전용 `20261008090417`의 19/19 함수 본문은 대응 코드와 일치하지만 wrapper·ACL·소유권 동등성은 미증명. `20261029012948`과 저장소 `20261029012000`은 최신 byte 비교에서 동일하지 않음. |
| 현재 Frontier 백업 | [#42130737153](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42130737153), frontier `20261105075227`, 241 entries | 암호화 백업·checksum 확인. |
| 격리 PostgreSQL 복원 | [#42247589352](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42247589352), PostgreSQL 17.6, 4초 | DB 복원·선택된 역할/함수/RLS 검사는 통과. Provider 관리 데이터 27개 블록 누락, 3개 투영. 전체 Supabase 복원은 아님. |
| 개인정보 원장 | [#42242496615](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42242496615), 현재 백업에 결합, `eventCount=0` | 비어 있는 스냅샷은 삭제·철회 재생 증거가 아님. 최신 감시 [#42262739511](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42262739511)은 7,828초로 7,200초 기준 초과. |
| Phase 11 제품 경로 | [#42244701347](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42244701347) | 격리 GoTrue JWT + PG18 RLS + 실제 Saju + local workerd, 900초·3,600/3,600 성공, p95 174.231ms / p99 184.088ms, Saju 장애 503·Health 200·복구 4/4. Production Worker admission/Hosted Hyperdrive/Production capacity 증거는 아님. |
| Phase 12 진단 | `OBSERVED_SCALING_REVIEW_PHASE12_20261030.md` | DB pool 2개 조건에서 concurrency 8 실패 및 Saju CPU 제한 압력 신호 확인. 진단 신호이지 Production 임계치나 자동 확장 승인 아님. |

참고: [PR #3092](https://github.com/gycha0109-beep/MyeongHa/pull/3092)의 최신 Worklog에는 현재 main 익명 E2E, 개인정보 원장 노후화, migration source parity 분석이 추가 기록되어 있다. PR 병합 전후에는 반드시 새 main SHA와 최신 관측을 다시 읽는다.

## 3. 종료 실행 순서

### Gate 0 — 기준선 고정

1. 이 로드맵과 최신 운영 Worklog를 main에 반영한다.
2. 병합 직후 main SHA, 최신 Worker version, Production migration frontier, 최신 백업·개인정보 원장·감시 결과, #1887 상태를 다시 읽는다.
3. 과거 성공 결과를 새 배포 버전이나 새 백업 frontier에 자동 승격하지 않는다.

Gate 0은 문서 병합 및 기준선 동기화일 뿐 Production 수용 완료가 아니다.

### Gate 1 — Phase 8: DR 복구 차단 해소 (최우선 P0)

Phase 8은 다음 네 묶음을 모두 닫아야 한다. 백업 생성이나 격리 PostgreSQL 복원만 반복해서는 종료할 수 없다.

#### 8-A. Migration / DB 출처 정합성

1. 현재 Production 원장과 정확한 main migration 파일을 다시 SELECT-only로 대조한다. 기준 관측은 원격 241개 / 저장소 276개, 원격 전용 40개 / 저장소 전용 75개 / 동일 이름 버전 불일치 1개다.
2. 모든 불일치 버전을 다음으로 분류한 처분표를 만든다: 원격 적용 출처·실행 주체·시점, 저장소 대응 파일, 실제 statement/DDL checksum, 객체·함수·정책 영향, owner·role·membership·GRANT/REVOKE, rollback/forward-only 방향.
3. `20261008090417`은 104,021-byte 원격 statement의 wrapper·ACL·ownership·policy와 6개 로컬 migration을 대조한다. 19/19 함수 본문 일치는 범위가 제한된 증거로만 유지한다.
4. `20261029012948` 원격 statement와 `20261029012000` 저장소 파일의 byte 불일치 원인과 의미를 판정한다. 이름이나 함수 본문 유사성만으로 동등성을 확정하지 않는다.
5. 원격 전용·저장소 전용 항목은 각각 적용됨/미적용/다른 트랙/역사적 잔존 등 근거 있는 상태로 모두 처분한다. 저장소 전용 75개를 자동으로 배포 실패로 분류하지 않는다.
6. 전체 schema, function, owner, role membership, grants, RLS/policy 및 provider migration ledger의 복구 동등성을 증명한다.

**금지:** blind `migration repair`, migration history rewrite, 추측에 의한 재적용, Production DDL/DML. 실제 정합화가 필요하면 근거 있는 forward-only 계획을 먼저 제시하고 사용자 승인을 받은 뒤 별도 실행한다.

#### 8-B. 현재 Frontier의 Provider-equivalent 복구

1. 현재 Production frontier를 고정한 암호화 백업과 checksum/catalog fingerprint를 사용한다. 기존 #42130737153은 현재까지의 기준 증거이며, frontier가 바뀌면 새 백업을 확보한다.
2. 기존 격리 복원 #42247589352의 27개 skipped / 3개 projected Provider data block을 제거할 수 있는 Hosted-compatible 복구 경로를 확보한다. 전체 Supabase migration ledger와 Provider-managed data가 실제 복구됐는지 별도로 검사한다.
3. Hosted Auth는 사용자·identity 연결, sessions, refresh-token 관계, JWT signing configuration, MFA/SSO 등 해당 서비스에서 사용하는 상태를 복원하고 로그인·갱신·로그아웃·삭제 계정·폐기 토큰을 검사한다.
4. Hosted Storage는 bucket·metadata·policy와 실제 object bytes를 복원한다. synthetic object checksum, 허용된 다운로드, 비인가 접근 거부, 삭제·철회 후 접근 차단을 확인한다.
5. 복구 대상은 Provider-compatible isolated Hosted target이어야 한다. 현재 확인된 전용 DR target은 없다. 기존 Production `MyengHa` 또는 `Refund_management` 프로젝트를 임의로 재사용하지 않는다.
6. 새 Hosted project나 유료 리소스가 필요하면 생성 전에 비용·대상·부작용을 사용자에게 보고하고 명시적 승인을 받는다. 승인 전에는 프로비저닝하지 않는다.

#### 8-C. 독립 개인정보 연속성과 현재 Frontier Replay

1. 최신 백업과 정확히 결합된 개인정보 원장을 새로 확보하고, 감시기가 7,200초 freshness 기준 안에서 성공했는지 확인한다. 기존 #42262739511 RED를 무시하거나 freshness 한도를 완화하지 않는다.
2. 현재 #42242496615는 `eventCount=0`이므로 non-zero 삭제·철회 replay 증거로 사용할 수 없다. 과거 #40633679630도 다른 backup/ledger pair에 묶여 있으므로 현재 frontier 증거로 재사용하지 않는다.
3. Production disposable privacy canary는 사용자가 정확한 승인 문자열 `RUN_SYNTHETIC_PRODUCTION_PRIVACY_CANARY`를 명시한 뒤에만 실행한다. 해당 canary는 합성 전용 계정·주체를 만들고 기존 삭제 API/worker 경로를 실행한 뒤 정해진 정리 절차를 수행한다. 승인 전 dispatch 금지.
4. 승인된 canary가 만든 non-zero Production event를 현재 backup과 같은 복구 증거 묶음에 결합하고, 격리 복원본에서 authoritative ledger를 재생한다. 2회 재생 idempotency, finalizer 완료, no-resurrection, stale JWT·Auth·Storage 접근 차단, 법적 보존 데이터 유지까지 확인한다.
5. 위 canary는 한 captured window의 replay 증거다. `futureSafePrivacyReconciliation=true`를 위해서는 Primary PostgreSQL 손실 후에도 살아남고 사고 기준 시점까지 누락 구간 없이 삭제·철회 이벤트를 제공하는 독립적인 durable source continuity를 별도로 입증한다. GitHub Actions freshness watcher는 감시 도구이지 독립 이벤트 원장이 아니다.

#### 8-D. 전체 서비스 RPO / RTO와 재개 게이트

- 승인된 목표는 기존 Product Owner 결정 그대로 RPO `PT24H`, RTO `PT6H`다. 값을 새로 만들거나 낮추지 않는다.
- 기존 authoritative isolated procedure의 5,536초 RPO / 67초 RTO 비교는 해당 절차의 목표 비교를 충족한 과거 증거다. Hosted Auth/Storage 전체 복구 동등성을 대신하지 않는다.
- 전체 복구 시험에서 백업 기준 시점부터 실제 복구 가능한 서비스 상태까지의 데이터 손실 구간과 전체 소요 시간을 측정해 각각 PT24H / PT6H 이내인지 확인한다. 4초 DB-only restore 또는 58,508초 synthetic reference interval을 전체 서비스 RPO/RTO로 사용하지 않는다.
- DB·Auth·Storage·Worker·Saju 연결과 삭제/철회·접근권한을 확인한 후에만 recovered-serving admission을 재평가한다.

**Phase 8 종료 조건:** migration/DDL/ACL/provider ledger 정합성, provider-managed full restore, Hosted Auth/Storage 복구, 독립 개인정보 연속성, future-safe replay, 전체 서비스 RPO/RTO가 모두 증거로 확인되고 `dr_ready=true`, `serviceResumptionAllowed=true`가 산출되어야 한다. 하나라도 빠지면 #1887은 OPEN, Phase 8은 BLOCKED로 유지한다.

### Gate 2 — Phase 11: 이미 성공한 실측 재사용 + 부족한 조합만 보완

기존 [#42244701347](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42244701347)의 15분 workerd overlap 제품 경로 실측은 유효한 격리 증거로 인정한다. 동일한 3,600건·4 req/s 시험을 이유 없이 반복하지 않는다.

남은 검증은 기존 증거에 없는 조합으로 한정한다.

1. 현재 제품 경로에서 DB pool acquisition timeout / DB unavailable 또는 slow DB가 발생했을 때 요청이 bounded-fail 되는지, Health가 독립 유지되는지, 복구 후 계산이 회복되는지 확인한다. 이미 통과한 Saju outage/recovery는 반복하지 않는다.
2. 필요한 경우에만 동일한 격리 workerd + GoTrue + PG + Saju 구성에서 DB 압력과 Saju 자원 압력을 구분 측정한다. 동시성·지속시간·성공/503/transport/skipped·p50/p95/p99·DB/Auth/Saju 시간·CPU/memory·복구를 하나의 sanitized evidence로 남긴다.
3. `productionWorkerAdmissionMeasured=false`, `hostedHyperdriveMeasured=false`, `productionCapacityProven=false`를 유지한다. 격리 실측을 Production 처리량이나 실제 Cloudflare/Hyperdrive 한계로 바꾸지 않는다.
4. 외부 Production 부하 주입이나 사용자 트래픽 실험은 하지 않는다.

**Phase 11 종료 조건:** 기존 overlap 실증을 포함해 제품 경로의 DB/Saju 주요 실패·복구 경계와 대표 비운영 자원 한계가 재현 가능하고, 모든 요청·오류·복구·정리 증거가 완전해야 한다. Production capacity claim은 별도 실제 Production 계측이 없는 한 계속 금지한다.

### Gate 3 — Phase 12: 확장 판단 기준 확정

1. Phase 11에서 검증된 DB pool·acquisition latency·Saju adapter latency·CPU throttling·memory·API p95/p99만 입력으로 사용한다.
2. 현재 관측된 concurrency 4의 clean 범위, concurrency 8의 DB pool 실패, Saju 0.01 CPU 압력 결과는 진단 근거이지 Production 확장 임계치가 아니다.
3. 측정된 대표 비운영 구성에서 확장/축소를 검토할 수 있는 지표, 관찰 구간, 지속 조건, 복구 여유, 수동 조치 기준을 명시한다. 숫자는 실제 반복 측정과 기존 서비스 목표에서만 도출한다.
4. `automaticScalingEnabled=false`를 유지한다. 수동 운영 기준과 Production 수치 임계치는 증거·사용자 승인 전까지 미승인으로 둔다. Health 단일 경로에서 degradation이 없었다는 결과로 확장 임계치를 만들지 않는다.

**Phase 12 종료 조건:** 확장·축소를 판단할 측정 지표와 경계, 근거 실험, 수동 대응 절차가 문서화되고 승인되어야 한다. 자동 확장 활성화는 이 로드맵의 목표가 아니다.

### Gate 4 — Phase 13: 최신 배포 버전 최종 수용

현재 Worker `295b9496-795b-44a3-b3f9-141c0b83e47d`의 익명 E2E는 통과했지만 Readiness는 configuration-only다. 다음 14개 항목을 동일한 최신 배포/소스 증거에 연결해 최종 판정한다.

| §33 항목 | 현재 판정 | 최종 종료에 필요한 증거 |
|---|---|---|
| 1–2. 소스 SHA / Provider 배포 | 부분 확인 | 현재 Worker version·100% traffic·build source SHA 및 Saju exact image digest를 같은 시점에 결합 |
| 3. Secret/config preflight | 미수용 | secret 값 노출 없이 필수 설정·rotation 상태·환경 분리 확인 |
| 4–5. Liveness / Readiness | 부분 확인 | Health 외에 실제 dependency/capability 상태와 degraded semantics 확인. config-only readiness를 연결 성공으로 간주하지 않음 |
| 6. Negative auth | 현재 Worker PASS | 익명 Member/Saju/Preview 401, cross-origin 403 등 exact-version 검사 유지 |
| 7–9. Positive auth / dependency / Saju compatibility | 현재 버전 미수용 | 기존 governed synthetic Member 경로를 정확한 최신 Worker version에 묶어 로그인·주체 귀속 DB·Birth revision·계산-only Saju 검증 |
| 10. Private no-store / CDN | 부분 확인 | 성공한 private 경로 전체의 no-store 및 CDN 사용자 간 격리 검사 |
| 11–12. Secret non-reflection / log redaction | 부분 확인 | 최신 버전의 응답·헤더·로그 필드에서 비밀/식별자 비노출 확인 |
| 13. Metrics / alerting | 미수용 | 최신 버전과 DB/Auth/Saju dependency golden signals, 실제 경보 발생·전달·보존 근거 |
| 14. Rollback candidate | 부분 확인 | 정확한 직전 artifact·source·호환성 확인 및 기존 안전 절차에 따른 rollback/recovery 증거 |

추가 규칙:

- [#42271216975](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42271216975)는 익명 운영 ingress 증거로만 사용한다. 같은 main의 [Supabase Production #42271105691](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42271105691)은 `deploy-migrations`가 SKIPPED였으므로 migration 배포 성공으로 간주하지 않는다.
- `inspect-main-operations-acceptance.mjs`는 exact-SHA 증거 수집기이며 `acceptanceDecision=NOT_EVALUATED_BY_COLLECTOR`를 반환한다. 수집기 성공을 14개 항목 자동 PASS로 해석하지 않는다.
- Positive Production smoke에 기존 수동 확인 문자열 또는 승인 절차가 요구되면 임의 dispatch하지 않는다. 사용자 데이터·실결제·실제 Reader/Chat 부작용은 만들지 않고 전용 합성 주체만 사용한다.
- 배포가 바뀌면 그 이전 버전의 live E2E·로그·메트릭·rollback 증거를 최신 버전 수용으로 승격하지 않는다.

**Phase 13 종료 조건:** §33의 14개 항목이 모두 증거 기반 PASS이고, §34 적용 가능한 장애 행렬 및 §35 Runbook이 확인되며, Phase 8 재개 게이트가 열린 상태여야 한다.

## 4. 최종 종료 판정

다음 조건을 모두 충족할 때만 전체 Production Operations를 완료 처리한다.

1. Phase 8 종료 조건 전부 충족, #1887 해결 및 종료 근거 기록.
2. Phase 11 주요 제품 의존성 실패·복구 실측 완료. 이미 성공한 overlap 실험은 재사용하고 미측정 조합만 보완.
3. Phase 12 수동 확장·축소 판단 기준과 근거가 승인됨. 자동 확장은 별도 목표가 아님.
4. Phase 13 §33 14개 항목 PASS, §34 장애 행렬 및 §35 Runbook 종료 조건 충족.
5. 최신 main SHA와 실제 배포 Worker/Saju artifact가 일치하고, 버전별 수용 증거가 유효함.
6. `dr_ready=true`, `serviceResumptionAllowed=true`, `productionCapacityProven` 및 필요한 Phase 12 승인 상태가 실제 evidence에 의해 뒷받침됨.
7. 미해결 차단·승인 대기·증거 만료가 없음.

위 조건을 충족하기 전에는 `ROADMAP_COMPLETE`를 선언하지 않는다. 문서 병합, CI GREEN, 백업 성공, 격리 복원 성공 또는 익명 E2E PASS 하나만으로 전체 종료를 선언하지 않는다.

## 5. 승인·안전 경계

| 작업 | 진행 조건 |
|---|---|
| Read-only migration/source/ACL 조사 | 기존 권한 범위에서 독립적으로 진행 가능 |
| 비운영 격리 부하·복구 실험 | 합성 데이터·루프백/격리 대상·기존 워크플로만 사용 |
| Production privacy canary | 정확한 사용자 승인 `RUN_SYNTHETIC_PRODUCTION_PRIVACY_CANARY` 필요 |
| Production migration repair/deploy 또는 DDL/DML | 원인·영향·forward-only 계획을 먼저 제시하고 사용자 명시 승인 필요 |
| 신규 Hosted DR project / 유료 리소스 | 대상·비용·부작용을 보고하고 사용자 승인 후 생성 |
| Production traffic, secret, IAM, provider configuration 변경 | 별도 명시 승인 없이는 실행하지 않음 |

기존 Production 프로젝트를 테스트 DR 대상으로 전환하지 않는다. 실제 사용자 데이터·토큰·객체 내용을 로그나 산출물에 남기지 않는다. 외부 업체 문의나 로드맵 밖의 기능 추가는 하지 않는다.

## 6. 기존 기준 문서

- [Production Operations architecture](../architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md) — 운영 계약·14개 수용 항목·장애 행렬·Runbook·Phase 정의의 권위 문서.
- [Production Operations status/worklog](PRODUCTION_OPERATIONS_STATUS_AND_EXIT_20261030.md) — 날짜별 실측 및 현재 상태 기록.
- [PostgreSQL DR readiness](POSTGRES_DR_READINESS_STATUS_V1.md), [Hosted Auth/Storage gap matrix](HOSTED_AUTH_STORAGE_DR_GAP_MATRIX_V1.md), [Privacy ledger authority](POSTGRES_PRIVACY_RECOVERY_LEDGER_AUTHORITY_V1.md), [Privacy replay](POSTGRES_PRIVACY_RECONCILIATION_REPLAY_V1.md) — Phase 8 상세 권한·복구 경계.
- [Phase 11 capacity evidence](API_CONTROLLED_CAPACITY_PHASE11_20261030.md), [Phase 12 scaling review](OBSERVED_SCALING_REVIEW_PHASE12_20261030.md), [Phase 13 acceptance evidence](MAIN_OPERATIONS_ACCEPTANCE_PHASE13_20261030.md) — 이미 확보한 실측과 잔여 검증 근거.

Watchtower-Track: ops