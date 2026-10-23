# 세연 R2-G 2026-10-08 관리 API SQL 로그 상관관계 — 2026-10-16 읽기 전용 감사 (Owner HOLD)

Watchtower-Track: ops

이 문서는 **원격 전용 마이그레이션 20261008090417의 승인·원본·성공적 적용을 증명하는 문서가 아니다.** 기존 [R2 읽기 전용 계보 패킷](SEYEON_MIGRATION_LINEAGE_R2_READONLY_PACKET_20261013.md) 및 [Owner 결정 핸드오프](SEYEON_R2_OWNER_DECISION_HANDOFF_20261015.md)에 추가되는 **실제 역사 로그의 제한적 메타데이터 상관관계**다. Production PostgreSQL/로그에서 SELECT만 실행했으며 원격 SQL·로그 원문·Role graph·개인정보·비밀키를 GitHub에 반출하지 않았다.

## 1. 감사 범위와 자료 구분

- 재검토 날짜: **2026-10-16 KST**. 대상 역사 구간: **2026-10-07T15:00:00Z ~ 2026-10-08T15:00:00Z**, 특정 연결 상세는 **2026-10-08T08:25:00Z ~ 09:15:00Z**. Supabase 통합 로그의 read-only ClickHouse SQL 집계만 사용. 24시간을 초과하는 로그 요청은 하지 않았다.
- 해당 24시간 로그 집계: `postgres_logs` **2,816**, `postgrest_logs` **13,477**, `auth_audit_logs` **32**. `postgres_logs` 중 SQL 로그 **`schema_migrations` 문자열 포함 20**; 로그의 어디에도 원격 버전 **`20261008090417` 직접 문자열은 0**(검사한 3개 source 한정).
- `schema_migrations` 포함 20건 중 6건은 04:16/04:35 UTC의 `Supavisor` 연결, 14건은 08:31~09:04 UTC의 `mgmt-api` 연결. 아래 시간대는 `parsed.timestamp`이고 GitHub 시각, 사람의 승인 시각, 커밋 시각과 동일하다고 가정하지 않는다.

## 2. 신규 역사 PostgreSQL SQL statement 로그 관측

| UTC 분 단위 | `mgmt-api` 로그 건수 | 구분 |
| --- | ---: | --- |
| 2026-10-08 08:31 | 2 | 동일 분의 짧은/긴 statement 로그 |
| 08:33 | 2 | 동일 |
| 08:34 | 2 | 동일 |
| 08:36 | 4 | 두 차례 연결 |
| 09:03 | 2 | 동일 |
| **09:04:17** | **2** | 버전 이름의 시각과 일치하는 초 단위 근접 기록 |

- 위 14건의 DB 인증 역할은 **`postgres`**, `parsed.application_name`은 **`mgmt-api`**, `parsed.error_severity`는 **`LOG`**였다. 이는 **DB 측 연결·로깅된 statement의 역할/애플리케이션 식별자**로, Supabase Console 이용자·배포 승인자·GitHub Actor의 인증된 실명 증명이 아니다.
- 총 7쌍 중 각 쌍의 `length(event_message)`는 **754/80,003 bytes**였다. 모두 `statement:` 접두부 및 추출된 첫 SQL 동사 `BEGIN`이 발견되었다. 80,003-byte 로그 7건에는 `ALTER FUNCTION`, `GRANT EXECUTE`, `assert_seyeon_chat_thread_runtime_v1`, `cmd_receive_seyeon_chat_turn_runtime_v1` 문자열이 각각 존재했고, `qry_content_bundle_manifest_v1`은 그중 2건에서 탐지되었다. **원문 문법 분석이 아니라 문자열 유무 검사**이고, 반복 SQL이 같은 논리 작업이었는지·어느 실행이 성공했는지·배포 SQL 전체와 일치하는지 입증하지 못한다.
- 특히 **09:04:17.490Z / 09:04:17.569Z**에 위 두 종류의 로그가 관측되었다. 원격 전용 버전 `20261008090417`과 UTC 초 단위가 맞지만, **버전 문자열은 로그에서 직접 검출되지 않았다.** 시간의 일치는 출처 동일성·승인·커밋 성공의 증거가 아니다.
- 긴 로그 본문 길이가 80,003 bytes로 일정해 **104,021-byte 원격 SQL과 전량 동일성을 입증할 만큼 충분한 원문 증거가 아니다.** 로그의 해시·원문·미인증 작성자 ID·고객행은 공개 PR/Issue에 저장하지 않는다.

## 3. GitHub Actions 및 Production 현재 상태의 독립 교차검사

- GitHub Actions API로 2026-10-08 **09:00~09:10 UTC**에 생성된 run 4개를 조회했다. CI/Governance/Web PR Domain Gates(09:07) 및 PR Integration(09:09)이었으며 **이 범위에서 Supabase Production run은 없었다**. **08:25~08:40 UTC** 생성 run도 0. 이는 GitHub Actions에서 생성된 run에 관한 좁은 관측일 뿐 Supabase 관리 API·수동 SQL 실행·기타 작업 경로 부재의 증명이 아니다.
- 2026-10-16 현재 Production SQL **SELECT-only** 재확인: 1400~1510 **12/12**, 1520~1720 **0/21**, 원격 전용 버전 20261008090417 **1건**. 원격 이력 `statements` **1 statement, 104,021 bytes, MD5 `f70776d8c0f6369f6f13484ba9fa2271`**, `created_by` 메타데이터 비어 있지 않음. 이름/원문은 가져오지 않았고, MD5/created_by는 실행자·원본 승인 서명의 증거가 아니다.
- 보안 RPC `assert_seyeon_chat_thread_runtime_v1(uuid,uuid)`: 존재 **1**, `service_role` 유효 EXECUTE **1**, 그중 명시적 직접 EXECUTE Grant **1**, `anon`/ `authenticated`/ `myeongha_api_executor` 유효 EXECUTE **0**. 이는 2026-10-13/14 R2-D/R2-F의 보안 관측과 동일 범주로 유지됨. 별도 불필요 Grant 승인/제거 근거가 되지는 않는다.
- 기존 [R2-G §14](SEYEON_MIGRATION_LINEAGE_R2_READONLY_PACKET_20261013.md)에 기록된 원격 SQL의 ContentManifest/ACL lexical overlap, timestamped `20261008043000`, 저장소 1460~1510과의 교집합이 있어도 SQL AST·최종 DDL·실제 실행 경로까지 동등하다고 추정하지 않는다.

## 4. Security/DB/Operations Owner에게 필요한 비공개 결정 증거

1. 원격 전용 `20261008090417` **원본 SQL의 비공개 저장 위치, 전체 바이트 SHA-256/서명, 생성·변경·승인 주체 및 감사 식별자**를 별도로 확보한다. 로그의 80,003-byte 표시를 원본 104,021 bytes 전체와 같다고 간주하지 않는다.
2. `mgmt-api` 세션 시간대의 **Supabase 관리 평면 요청·SQL Editor 감사**, 호출 인증 주체와 요청 ID, 승인 기록, 명시적 성공/실패 및 **트랜잭션 Commit/Rollback 결과**를 연결한다. PostgreSQL의 DB role `postgres`만으로 실제 인간/자동화 계정의 정체를 확정하지 않는다.
3. 번호형 1460~1510 및 timestamped 2개와 원격 전용 SQL의 적용 순서, 중복 DDL/ACL, 19 RPC의 DDL/Owner/ACL 지문 차이를 비공개에서 교차 대조한다. `service_role` 보조 RPC 직접 EXECUTE의 목적과 권한 최소화 여부는 Security/DB Owner가 판단한다.
4. 승인과 복구/롤백 계획 전 **Production 마이그레이션 이력 수리·DROP/REVOKE/Role 변경·원격 SQL 재실행·1520~1720(21건) 배포를 하지 않는다.** 1730/1740/1750 비배포 제안도 Owner HOLD다. `authorizedForProduction=false`, `originEstablished=false`, `drReady=false`, G0~G6/paid/public OFF.

## 5. 재검증 쿼리의 공개 가능한 범위

통합 로그에서 `event_message` 본문, DB 연결 ID, 원본 SQL 텍스트를 반환하지 않고 `source`, 시간·애플리케이션·역할·일치 여부·길이·건수만 집계한다. **역사 로그 보존 기간이 변할 수 있으므로 향후 조회 가능성을 보증하지 않는다.** 운영 DB에서도 `schema_migrations.statements[1]` 원문 대신 `octet_length`·`md5`·건수만 조회한다. 이 패킷은 2026-10-16의 제한된 관측 증거이며 이후 실행 또는 Owner 결정을 자동으로 변경하지 않는다.


## 6. 2026-10-16 세션 결합 및 Dashboard Actor 주석 — 검증 범위 확장, 적용 성공 미확정

- 조사 창 **2026-10-08 09:03:00~09:20:00 UTC**의 통합 `postgres_logs`를 `parsed.session_id`로 **DB 내부 로그 집계에서만 묶고**, 세션 ID·SQL 원문·사용자 UUID를 응답 및 GitHub에 노출하지 않았다.
- `09:03:23.400Z`의 **80,003-byte** `schema_migrations` 관련 `mgmt-api` statement 로그와 `09:03:23.622Z`의 **DO / SQLSTATE 42501 / 권한 오류**는 **동일 PostgreSQL 세션**이었다. 이 세션에서 `ERROR` 1건 확인. 적어도 해당 시각의 한 작업은 권한 문제를 겪었다. 다만 원격 전용 104,021-byte SQL 전체가 그 실패 작업과 동일하다는 증거는 아직 없다.
- `09:04:17.569Z`의 **80,003-byte** `schema_migrations` 관련 로그는 **별도 DB 세션**이다. 조사 창에서 이 세션과 결합되는 `ERROR` 기록은 **0**, 명시적 `COMMIT` 또는 `ROLLBACK` `parsed.command_tag` 기록도 **0**. 오류 로그 부재 및 statement 본문에 나타난 `COMMIT;` 문자열은 **트랜잭션 커밋 성공 증명이 아니다**. 앞선 실패 뒤 재시도했을 가능성은 있어도 확증되지 않는다.
- 08:31~09:04 UTC의 짧은 **754-byte 로그 7건 모두**에 `-- user:` 및 `-- date:` 주석이 존재한다. 주석 내부 UUID 형식 값 7개가 **모두 같은 값(고유 UUID 1개)**임을 서버 집계에서 확인했다. 실제 UUID·세션 키는 반출하지 않았다. 이 754-byte statement 세션과 80,003-byte 긴 statement 세션은 서로 다르므로 **그 UUID를 긴 SQL의 인증된 실행자로 승격하지 않는다**. 긴 로그에서 동일한 사용자 주석은 확인되지 않았다.
- Production `supabase_migrations.schema_migrations.created_by`는 비어 있지 않고 **이메일 형식 문자열**이지만 `postgres` 또는 `mgmt-api`와 문자 그대로 같지 않다. 원문은 반출하지 않았으며, 이 값은 유효한 사용자 인증·역사적 승인·실행자의 증거가 아니다.
- 원격 이력에 저장된 SQL은 **104,021 bytes / SHA-256 `4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894`**와 SELECT-only로 정확히 일치했다. 이는 기존 원격 이력 내용이 변경되지 않았다는 정합성 확인이지 외부 원본의 provenance 증명은 아니다.

## 7. 실제 관리 평면 감사 접근 경로 — Owner 비공개 실행 전용

- Supabase 공식 [Dashboard SQL 실행자 식별 지침](https://supabase.com/docs/guides/troubleshooting/tracking-postgres-role-activity-to-specific-dashboard-users-8d3715)은 `-- user: UUID` 주석을 **조직 멤버 식별자와 매핑**하도록 안내한다. 단, 본 사건의 짧은 로그 UUID가 긴 SQL의 실행자임을 증명하는 동일 요청/세션 키가 현재 없다. 실제 멤버 매핑은 관리자 승인된 비공개 환경에서만 수행하며 계정 식별값을 PR, Issue, 일반 CI에 기록하지 않는다.
- 공식 [Platform Audit Logs 안내](https://supabase.com/docs/guides/security/platform-audit-logs)에 따르면 조직 단위 감사는 **Team/Enterprise** 전용이며, 각 계정은 **자기 계정의 Account Audit Logs**를 확인할 수 있다. 현재 연결된 명하 조직의 요금제는 해당 조직 단위 감사 기능을 제공하지 않음이 읽기 전용으로 확인됐다. 일반 프로젝트 `postgres_logs` / `auth_audit_logs`를 조직 Platform Audit Logs로 대체해서는 안 된다.
- Owner가 보존된 **Account Audit Logs / 기존 Audit Log Drain / Supabase 지원 채널의 보존 감사**에 접근할 수 있다면, 2026-10-08 **09:03:23 / 09:04:17 UTC** 요청의 플랫폼 인증 주체, 요청·응답 ID, 대상 프로젝트, 요청 경로 및 성공/실패를 비공개 대조한다. **과거 기록 존재 여부 자체는 미확인**이고 로그 보존·현재 멤버십이 과거 승인 증명을 대체하지 않는다.
- 외부에서 승인·보관된 **원본 104,021-byte SQL**이 확보된 경우, 이미 존재하는 `test/db/seyeon_remote_bundle_pg17_isolated.sh`의 **격리 PG17 / SHA-256 pin / SQL 로그 비노출** 경계를 따라 검증한다. 이 절차도 원본의 작성·승인 경위를 스스로 증명하거나 Production 적용을 허가하지 않는다. 외부 SQL 원문을 GitHub·대화·일반 Actions 아티팩트로 반출하지 않는다.
- **Owner 결정 최소 조건**: (1) 원본 출처와 승인된 전체 서명, (2) 관리 평면 **인증 주체**와 구분되는 DB `postgres` 실행 Role, (3) 정확한 플랫폼 요청·응답/감사 ID와 실제 `COMMIT` 또는 실패·Rollback 결과, (4) 1460~1510/두 timestamped 버전의 적용 순서, (5) 19 RPC 및 추가 `service_role EXECUTE` 1건의 인가 의도·최소권한, (6) 별도 서명된 DB/Security/Ops Owner 승인. 하나라도 빠지면 **`HOLD_R2_G_HISTORICAL_ACTOR_AND_SOURCE_NOT_ESTABLISHED`**.
- `1520~1720` 21건 / 1730·1740·1750 후보 모두 Production HOLD, 이력 수리/권한 변경/SQL 재실행/유료 AI/공개 Reader/G0~G6/DR Ready **금지 유지**. `authorizedForProduction=false`, `originEstablished=false`, `drReady=false`.

**최종: `HOLD_R2_G_HISTORICAL_ACTOR_AND_SOURCE_NOT_ESTABLISHED`, `authorizedForProduction=false`, `drReady=false`.**
