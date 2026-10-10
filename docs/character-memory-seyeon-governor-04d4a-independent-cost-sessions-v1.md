# D4A — 세연 Governed 비용 독립 PostgreSQL 세션 검증

Watchtower-Track: character-memory

## 구현 범위
- `run_isolated_case`가 생성하는 `myeongha_seyeon_d4a_test` DB에서만 실행한다. 다른 DB에서는 테스트 스크립트가 즉시 거부한다.
- 이미 검증된 Chat Commit 고정 fixture를 새 격리 DB에 구축하고, 네트워크/유료 AI 호출 없이 `myeongha_seyeon_d4_login_ci` 임시 LOGIN + `myeongha_seyeon_governed_executor`로 서로 독립된 `psql` 세션을 구성한다.
- 첫 세션이 일별 글로벌 예산 행을 잠근 상태에서 두 번째 세션의 비용 예약이 실제 `lock_timeout`으로 거부되는지 확인한다.
- 첫 세션 COMMIT 이후 동일 글로벌 예산을 초과한 두 번째 호출을 거부하고 비용 원장/예산 점유가 `1|3700|3700`으로 일치하는지 확인한다.
- 정산 후 예약 금액 3700에서 실제 300으로 조정되고, 독립 세션의 동일 이벤트 정산 재시도가 추가 차감/환급을 일으키지 않는지 확인한다.
- 신규 호출의 예약 뒤 COMMIT 전에 해당 PostgreSQL **백엔드를 실제 종료**하여 SQL 원장 INSERT와 예산 UPDATE가 함께 ROLLBACK되는지 확인한다. 존재하지 않는 예약에 대한 정산이 거부되고 새 세션에서 예약이 다시 가능한지 검증한다.
- 별도 임시 LOGIN이 공용 `myeongha_api_executor`로 `SET ROLE`하는 행위가 거부되는지 확인한다.
- 임시 DB 및 테스트용 로그인은 테스트 종료 시 정리하며 운영 DB 객체/권한에는 영향을 주지 않는다.

## 결과 해석과 제한
- 증명 범위는 PostgreSQL **두 독립 backend 세션**에서의 예산 잠금·충돌·재시작(연결 상실) 후 트랜잭션 롤백·재예약이다.
- `SET SESSION AUTHORIZATION`은 테스트 superuser가 합성 LOGIN을 흉내 내는 방식이다. 실제 Production 비밀번호 로그인/ TLS 계정 분리를 입증하지 않는다.
- 삭제 경합(`chat_turn_attempts` DELETE), Guest/다중 Subject 동시성, 삭제 중 원장/예산 생존 정책, 실제 DB 노드 장애·네트워크 분할은 **D4B 후속 게이트**이며 이 PR에서 PASS로 주장하지 않는다.
- 운영 마이그레이션 이력 불일치 [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887), 실운영 전용 LOGIN 미발급, Production ENFORCE OFF, D3B2B-3D2 실제 REVOKE HOLD는 그대로 유지한다.
- 전체 CI PASS는 운영 DB 스키마 동기화, 유료 추론 비용 정책 승인 또는 G4/G6/D5 완료를 의미하지 않는다.

## 검증
`test/db/seyeon_governed_cost_d4a_fixture.sql`, `test/db/seyeon_governed_cost_d4a_race.sh`, `test/db/run_authority_core.sh`의 독립 데이터베이스 단계.
