# Reader 결제 취소: 실제 연결 계정 및 공용 서비스 권한 격리 (2026-10-15)

**운영 전환 상태: HOLD. 운영 DB·키·고객 정보 변경 없음.**

## 1. 배포 서비스의 연결 설계 vs 실제 비밀 설정

- Vercel의 myeongha 프로젝트가 GitHub gycha0109-beep/MyeongHa 저장소에 연결되어 있음을 확인했다. 저장소 vercel.json은 main 브랜치 자동 배포만 허용한다.
- api/me.ts는 production-user-data-runtime-config.ts의 설정을 통해 node-postgres-subject-pool.ts의 전용 PostgreSQL 연결 풀을 구성한다. API는 MYEONGHA_DATABASE_URL, MYEONGHA_DATABASE_PRINCIPAL, MYEONGHA_DATABASE_TLS_PEER_MODE, MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM을 요구한다.
- 해당 코드에서 일반 API 연결은 postgres, service_role, supabase_admin과 같은 관리자/공용 사용자명을 거부하며 실제 current_user가 지정된 로그인 계정인지, myeongha_api_executor 역할을 사용할 수 있는지 매 연결마다 확인한다.
- Supabase 배포 작업은 별도 .github/workflows/supabase-production.yml에서 SUPABASE_DB_PASSWORD와 관리용 세션 풀러를 사용한다. 일반 API와 DB 마이그레이션의 경로는 **코드상 분리**된다.
- **Vercel 환경변수 목록 조회는 403 Forbidden으로 차단되었다.** 따라서 실제 배포된 DB URL, 로그인명, 일반 API 키의 권한 수준, 환경별 비밀 설정 여부는 **미확인**이다. 비밀키 값을 조회하거나 우회하려고 하지 않았다. 코드 설정 검증은 실제 운영 설정 검증의 대체물이 아니다.

## 2. 연결된 Supabase MyengHa의 읽기 전용 역할 실사

실제 PostgreSQL의 pg_roles, pg_has_role, has_table_privilege, has_function_privilege만 사용했다. 고객·주문·이용권 행은 열람하지 않았다.

| DB 역할 | LOGIN | entitlement_events 직접 SELECT / INSERT / UPDATE / DELETE | internal_apply_entitlement_effect_v1 EXECUTE | postgres 역할 회원권 |
|---|---|---|---|---|
| myeongha_runtime | 가능 | 네 가지 모두 불가 | 불가 | 없음 |
| myeongha_worker_runtime | 가능 | 네 가지 모두 불가 | 불가 | 없음 |
| myeongha_api_executor | 불가 | 네 가지 모두 불가 | 불가 | 없음 |
| myeongha_commerce_internal_executor | 불가 | 네 가지 모두 불가 | 불가 | 없음 |
| service_role | 직접 LOGIN 불가 (API 역할) | **네 가지 모두 가능** | 불가 | 없음 |
| postgres | 가능 | 네 가지 모두 가능 | 가능 | 관리자·소유 경로 |

- 두 전용 로그인 계정이 존재한다고 해서 현재 Vercel 서비스가 해당 계정으로 접속 중이라는 증거가 되는 것은 아니다.
- 서비스키가 Supabase Data API를 통해 service_role 권한으로 사용될 수 있으므로 NOLOGIN만으로 테이블 직접 수정 권한이 안전하다고 간주하지 않는다.
- postgres, service_role의 실제 비밀키 사용처·접근 권한·사용 이력은 별도의 배포/비밀 저장소 권한이 있어야 확인 가능하다.

## 3. 기존 이용권 처리를 깨뜨리지 않기 위한 복제 DB 실험

- test/db/official_reader_d3e21_service_role_ledger_containment_clone.sh
- test/db/run_authority_core.sh의 run_isolated_case가 전용 폐기형 PostgreSQL 복제 DB를 만들고 시험 종료 시 제거한다. 운영 SQL 마이그레이션이나 운영 GRANT/REVOKE는 없다.
- 실제 운영에서 관찰된 service_role의 entitlement_events SELECT/INSERT/UPDATE/DELETE 권한을 복제본에서 재현하고, **복제 DB에 한해** INSERT/UPDATE/DELETE를 REVOKE한다.
- 별도 서비스 역할 세션으로 직접 INSERT/UPDATE/DELETE가 각각 SQLSTATE 42501로 거부되는지, SELECT는 허용되는지 검증한다.
- 기존 protected entitlement effect 함수의 소유자 EXECUTE 권한이 유지되는지 확인하고, 가짜 Subject ID를 사용하는 기존 test/db/entitlements_current_query.sh 전체를 재실행한다.
- 이 시험은 기존 조회 기능의 **한정적인 회귀 검증**이다. 결제사 환불, 새 Entitlement Grant 발생, 실 고객 상태, 모든 Commerce 호출자, Supabase Data API, 백업 및 실제 운영 서비스 트래픽 무결성을 입증하지 않는다.

## 4. 실제 운영 전환에 필요한 조건

1. Vercel Production/Preview/Development 환경변수 **이름/범위/존재 여부**를 허가받은 담당자가 확인한다. 비밀번호, 토큰, API 키의 실제 값은 출력하거나 문서화하지 않는다.
2. API·Worker의 데이터베이스 로그인 계정이 승인된 전용 계정이고, 관리자용 postgres 및 범용 service_role 권한을 보유하지 않았음을 실제 실행 환경/연결 풀과 독립 감사로 확인한다. MYEONGHA_SUPABASE_API_KEY의 실제 권한 수준도 확인한다.
3. 공용 서비스 키를 이용한 직접 Ledger 쓰기, 데이터 API·백엔드 런타임·관리용 접속 경로의 모든 의존성을 목록화하고 제거/격리 계획과 롤백 방법을 증명한다.
4. 환불, 이용권 생성, 부여, 회수, 구매, 복원, 중복 처리, 일반 조회 및 장애 복구 기능을 실제 권한 구성을 반영한 **격리 환경**에서 검증한다.
5. DBA/보안/Commerce/Legal/Privacy/Ops가 권한 변경, 관리자 비밀키 수탁, 감사 로그, 정상 동작·롤백 결과와 배포 범위를 각자 확인하고 **명시적으로 승인하기 전에는 운영 권한 변경·코드 병합·배포·실결제 실행 금지**.

**현재 결론: 전용 로그인 계정의 존재와 코드상 연결 정책은 확인. 실제 Vercel 환경변수 접근은 403으로 미확인. service_role 운영 DML 격리와 실서비스 무손상 보증은 HOLD.**

## D3e23 보충 실사 — 단일 원장 외의 공용 계정 쓰기 경로

연결된 MyengHa PostgreSQL의 읽기 전용 pg_catalog 실사에서 `service_role`의 직접 INSERT/UPDATE/DELETE 유효 권한을 가진 7개 중요 테이블을 확인했습니다. `commerce_account_links`, `commerce_provider_events`, `commerce_receipts`, `entitlement_events`, `entitlement_grants`, `entitlements`, `purchase_intents`입니다. 각 테이블은 현재 RLS 비활성화 상태입니다. REST API 노출 여부와 실제 키 사용자는 미확인입니다. **이용권 기록 1개 테이블의 권한만 축소해선 전체 우회 경로가 차단되지 않습니다.**

자세한 실측과 3개 독립 구매·취소 복제 시험 계획: [OFFICIAL_READER_CANCEL_SEVEN_TABLE_SERVICE_ROLE_ACL_READINESS_20261015_V1.md](OFFICIAL_READER_CANCEL_SEVEN_TABLE_SERVICE_ROLE_ACL_READINESS_20261015_V1.md). 테스트 환경에만 적용하며, 실제 운영 설정과 DB 권한은 변경하지 않습니다.

## 2026-10-15 후속 정정 (D3e24)

기존 위의 Vercel 환경변수 접근 **403 Forbidden** 사실은 ChatGPT Vercel 연결 도구에 한정됩니다. 이후 프로젝트 소유자가 직접 **Production 설정 이름 7개와 `MYEONGHA_DATABASE_PRINCIPAL=myeongha_runtime`을 확인**했습니다. 단, 실제 배포 로그인/키 권한의 실행 증거는 아닙니다.

또한 **`SUPABASE_DB_PASSWORD`는 원래 Vercel Production에 없었습니다.** 잘못된 안내 때문에 일시 추가되었다가 사용자가 삭제했습니다. 기존부터 배치된 관리자 비밀번호가 발견되었다는 해석은 틀렸습니다. GitHub Actions에 별도 지정되는 동일 이름의 마이그레이션 시크릿과 혼동하면 안 됩니다. 자세한 정정 및 보호 검사: [OFFICIAL_READER_CANCEL_PRODUCTION_ENV_EVIDENCE_AND_ADMIN_PASSWORD_FENCE_20261015_V1.md](OFFICIAL_READER_CANCEL_PRODUCTION_ENV_EVIDENCE_AND_ADMIN_PASSWORD_FENCE_20261015_V1.md).
