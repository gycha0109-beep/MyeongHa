# C08-Y — PostgreSQL 17 실제 공유 예약 경합, 격리 CI 전용

Watchtower-Track: character-memory

## 범위

C08-W는 한 runner의 로컬 fsync 원장이며, C08-X는 두 runner가 공유하는 GitHub ref의 **Fake 저장소** 경쟁 테스트다. 두 단계 모두 실제 여러 PostgreSQL 연결에 의해 직렬화되는 영구 공유 원장 증거는 아니었다.

이번 단계는 **폐기형 GitHub Actions PostgreSQL 17 테스트 데이터베이스**에서만 실행되는 테이블/RPC 스키마를 추가한다. Production Supabase, 운영 DB 스키마·마이그레이션, 실제 GitHub 참조, 평가 Secret, Provider HTTP 요청, 사용자 입력을 변경하거나 호출하지 않는다.

- `test/db/seyeon_c08y_disposable_shared_ledger_pg17.sql`: 테스트 전용 `c08y_offline` 스키마와 batch / reservation / observation 세 테이블. 하나의 고정된 batch ID PK, 정확히 6개 C08-T Gold 슬롯·순서와 슬롯당 3,277 microUSD 모의 예약, 첫 모의 배치 누적 최대 19,662 microUSD. 독립 NOLOGIN / NOINHERIT / NOBYPASSRLS role에 **오직 SECURITY DEFINER 함수 EXECUTE**를 허용하며 테이블 SELECT/INSERT/UPDATE/DELETE를 모두 차단한다.
- `claim_batch_v1`: 데이터베이스 UNIQUE 충돌을 이용한 최초 입장 1회만 true. 같은 run ID의 재실행이나 다른 ID의 중복 입장은 false. 실제 메인 SHA를 자체 검증하는 함수가 아니라 입력 형식만 검사한다.
- `reserve_slot_v1`: 동일 batch row를 `SELECT ... FOR UPDATE`로 잠근 뒤 모든 앞 슬롯 예약과 `BOUNDED_ESTIMATE` 관측의 일치를 확인해야 다음 예약 성공. 중간 실패·UNKNOWN·중복·다른 owner는 false.
- `observe_slot_v1`: 예약이 존재하는 슬롯에 한 번만 결과 적재, 잘못된 금액·문자열·다른 Owner·재기록 거부. `UNKNOWN_OUTCOME_HOLD`가 한번 기록되면 이후 예약 중단. DB 함수는 모델 호출 및 토큰 사용량 검증을 하지 않으며 반드시 상위 모델 응답 경계를 별도 구현해야 한다.
- `test/db/seyeon_c08y_disposable_shared_ledger_pg17.sh`: 동일 테스트 DB로 연결한 **서로 다른 두 PostgreSQL 17 백엔드**를 파일 배리어로 동시 진행하여 1승 1패와 최종 저장 1건 검증. 그 후 같은 run 및 다른 run 재진입 차단, 슬롯 순서·중복·UNKNOWN 후속 예약 거부, 직접 테이블 접근 차단 검증.
- `test/db/run_ci_case.sh`와 `scripts/ci/db-suites.json`에 PG17 테스트 케이스 추가. 실행 게이트는 GitHub Actions / CI / DB_SUITE=postgres17 / PGHOST=localhost / 전용 `myeongha_ci_case_<숫자>` DB / PG17의 교집합만 수용한다. 일반 Supabase 마이그레이션을 호출하지 않는다.

## 판정 경계

성공 시 증명할 수 있는 것: 하나의 **격리 테스트 데이터베이스에 살아 있는 두 세션**이 같은 batch 키에 대해 경쟁할 때 데이터베이스 UNIQUE 제약으로 한 실행만 승리하고, SQL row lock과 DB 영구 트랜잭션 커밋으로 후속 예약을 순차 제어한다는 점.

**여전히 증명하지 못한 것**: 운영 DB에 공유 원장이 배치되었다는 사실, 운영 역할 ACL, Secret 접근 주체, cross-region 복제/복원·DR, 운영 런 간 글로벌 원장 접근, 원장 관리자 삭제 불가, 실제 Provider 청구 불확실성, 프로젝트·키 동일성, USD 1 강제 하드캡, 기존 11회 청구액, 모델의 Gold 적중률/자연스러움. 이 단계의 6개 슬롯은 모의 예약 계약이지 추가 실모델 관측이 아니다.

- 유료 API POST 0회, 과거 실모델 관측 6/72, 66 슬롯 미측정, 사용자 승인 추가 예산 5,000 KRW 미사용.
- `paidDispatchEnabled=false`, `providerHardLimitVerified=false`, `invoiceReconciled=false`, `actualBilledKrw=null`, `globalCrossRunReservationVerified=false` 유지. 운영 G0~G6, Production 배포, 실사용자 데이터 및 기존 Secret 변경 없음.

## 검증·병합

- `npx vitest run test/seyeon-cost-c08y-pg17-shared-ledger-contract-v1.test.mjs`: 분리 및 구조 검사.
- `DB_SUITE=postgres17`의 `seyeon-c08y-disposable-shared-ledger-pg17` 실행: 실제 PostgreSQL 17 동시성/ACL 회귀.
- 정확 PR HEAD 기본 CI·Governance, Full Integration PG17 포함 전체 PASS, mergeable 확인 후 squash, 병합 후 최신 `main` CI·Governance PASS.
- 외부 청구통제·독립적인 운영 공유 원장이 검증되기 전에는 유료 워크플로 신규 생성/활성화·실제 요청 금지.
