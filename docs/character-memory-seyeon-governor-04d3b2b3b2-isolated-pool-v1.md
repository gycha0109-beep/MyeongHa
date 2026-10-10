# PR-04D3B2B-3B2 — 격리된 Governed DB 연결·비용 전용 Runner

Watchtower-Track: character-memory

## 이번 구현 (비활성 / Production 영향 없음)
- `seyeon-governed-postgres-pool-v1.ts`에 Governed 전용 DB URL/로그인 principal 파서, 엄격한 TLS CA 검증과 전용 pg Pool 생성기를 추가.
- 운영 일반 DB principal, 비밀번호, 목표 호스트/포트/DB와의 교차 검증: 별도 로그인과 **서로 다른 비밀번호** 필수. 잘못된 설정/불완전한 TLS는 즉시 거부.
- 전용 연결 체크아웃마다 PostgreSQL `session_user/current_user`가 `myeongha_seyeon_governed_login`인지 검증. 로그인 권한: LOGIN, NOINHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE, NOCREATEDB. Member 관계가 Governed 전용 역할 이외에 존재하면 거부.
- Gov 역할로 `SET ROLE` 가능해야 하고 일반 `myeongha_api_executor` 및 cost owner와는 membership/SET ROLE 불가능해야 함. 레거시 Start/Settle/Record `EXECUTE`, 원장·예산·가격 테이블 직접 접근권 모두 없어야 함.
- `seyeon-governed-cost-transaction-v1.ts`에 고정 역할 `SET LOCAL ROLE myeongha_seyeon_governed_executor`, 기존 Subject Member/Guest Resolver, canonical Subject 결속/ASSERT, 트랜잭션 ROLLBACK/connection release 포함한 전용 Runner 추가.
- 일반 Subject Runner의 `SET LOCAL ROLE myeongha_api_executor`는 변경 없음. 외부 Role parameter injection 불가.
- 단위·시뮬레이션 테스트에서 잘못된 DB 자격, 역할 승격, 레거시 EXECUTE, 원장 직접 접근, Subject 불일치, 트랜잭션 실패 시 operation 0회와 ROLLBACK 확인.
- `test/db/seyeon_governed_login_boundary_v1.sh`에서 테스트 전용 LOGIN 역할을 임시 생성하고 **서로 다른 psql 백엔드 연결 2개**에서 세션 권한 전환·실제 `SET ROLE` 거부·OFF 보존을 검증. 검증 후 DROP ROLE, 운영 계정/비밀번호 발급 없음.

## 시크릿 계약 (운영 적용 HOLD)
- `MYEONGHA_SEYEON_GOVERNED_DATABASE_URL`: 별도의 `myeongha_seyeon_governed_login` PostgreSQL 자격. 현재 **발급되지 않은 별도 자격**.
- `MYEONGHA_SEYEON_GOVERNED_DATABASE_PRINCIPAL=myeongha_seyeon_governed_login`
- 루트 CA는 SEC-01에서 승인된 `MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM` 재사용.
- Governed 전용 Login 역할 provisioning/GRANT/secret manager 주입은 운영 Owner 승인과 배포 Runbook/롤백 준비 후 별도 수행. **이번 PR에는 LOGIN ROLE 생성 마이그레이션이나 secret 값 없음.**
- B1의 `myeongha_seyeon_governed_executor`(NOLOGIN)에만 SET 권한을 부여하며 `myeongha_api_executor`, cost owner에 절대 membership을 부여하지 않는다.

## 정확한 미완료 범위
- 코드 레벨의 연결 Preflight와 트랜잭션 Runner만 구현. 실제 Production 별도 LOGIN 연결/DB host 접속 실증은 아직 HOLD.
- 이 Runner를 Chat 네 역할 및 Post-turn Provider에 결속하는 작업은 3C 별도 PR이다.
- 현재 레거시 OFF 실행권 회수와 Production ENFORCE 전환은 3D/D5 명시적 승인 이전까지 금지.
- Security G4 최종 PASS가 아니다. 이후 D4 실제 독립 세션/동시성/크래시, 운영 인증·시크릿 교체/보안 감사를 통과해야 한다.
- 비용 계측 우회가 있을 수 있으므로 OFF 운영의 기존 런타임·DB 권한·Provider 모델 요청 경로는 변경하지 않는다.
