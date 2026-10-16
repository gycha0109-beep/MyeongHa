# 세연 R2-G 2026-10-08 관리 API SQL 로그 상관관계 — 2026-10-16 읽기 전용 감사 (Owner HOLD)

Watchtower-Track: ops

이 문서는 **원격 전용 마이그레이션 20261008090417의 승인·원본·성공적 적용을 증명하는 문서가 아니다.** 기존 [R2 읽기 전용 계보 패킷](SEYEON_MIGRATION_LINEAGE_R2_READONLY_PACKET_20261013.md) 및 [Owner 결정 핸드오프](SEYEON_R2_OWNER_DECISION_HANDOFF_20261015.md)에 추가되는 **실제 역사 로그의 제한적 메타데이터 상관관계**다. Production PostgreSQL/로그에서 SELECT만 실행했으며 원격 SQL·로그 원문·Role graph·개인정보·비밀키를 GitHub에 반출하지 않았다.

## 1. 감사 범위와 자료 구분

- 재검토 날짜: **2026-10-16 KST**. 대상 역사 구간: **2026-10-07T15:00:00Z ~ 2026-10-08T15:00:00Z**, 특정 연결 상세는 **2026-10-08T08:25:00Z ~ 09:15:00Z**. Supabase 통합 로그의 read-only ClickHouse SQL 집계만 사용. 24시간을 초과하는 로그 요청은 하지 않았다.
- 해당 24시간 로그 집계: \`postgres_logs\` **2,816**, \`postgrest_logs\` **13,477**, \`auth_audit_logs\` **32**. \`postgres_logs\` 중 SQL 로그 **\`schema_migrations\` 문자열 포함 20**; 로그의 어디에도 원격 버전 **\`20261008090417\` 직접 문자열은 0**(검사한 3개 source 한정).
- \`schema_migrations\` 포함 20건 중 6건은 04:16/04:35 UTC의 \`Supavisor\` 연결, 14건은 08:31~09:04 UTC의 \`mgmt-api\` 연결. 아래 시간대는 \`parsed.timestamp\`이고 GitHub 시각, 사람의 승인 시각, 커밋 시각과 동일하다고 가정하지 않는다.

## 2. 신규 역사 PostgreSQL SQL statement 로그 관측

| UTC 분 단위 | \`mgmt-api\` 로그 건수 | 구분 |
| --- | ---: | --- |
| 2026-10-08 08:31 | 2 | 동일 분의 짧은/긴 statement 로그 |
| 08:33 | 2 | 동일 |
| 08:34 | 2 | 동일 |
| 08:36 | 4 | 두 차례 연결 |
| 09:03 | 2 | 동일 |
| **09:04:17** | **2** | 버전 이름의 시각과 일치하는 초 단위 근접 기록 |

- 위 14건의 DB 인증 역할은 **\`postgres\`**, \`parsed.application_name\`은 **\`mgmt-api\`**, \`parsed.error_severity\`는 **\`LOG\`**였다. 이는 **DB 측 연결·로깅된 statement의 역할/애플리케이션 식별자**로, Supabase Console 이용자·배포 승인자·GitHub Actor의 인증된 실명 증명이 아니다.
- 총 7쌍 중 각 쌍의 \`length(event_message)\`는 **754/80,003 bytes**였다. 모두 \`statement:\` 접두부 및 추출된 첫 SQL 동사 \`BEGIN\`이 발견되었다. 80,003-byte 로그 7건에는 \`ALTER FUNCTION\`, \`GRANT EXECUTE\`, \`assert_seyeon_chat_thread_runtime_v1\`, \`cmd_receive_seyeon_chat_turn_runtime_v1\` 문자열이 각각 존재했고, \`qry_content_bundle_manifest_v1\`은 그중 2건에서 탐지되었다. **원문 문법 분석이 아니라 문자열 유무 검사**이고, 반복 SQL이 같은 논리 작업이었는지·어느 실행이 성공했는지·배포 SQL 전체와 일치하는지 입증하지 못한다.
- 특히 **09:04:17.490Z / 09:04:17.569Z**에 위 두 종류의 로그가 관측되었다. 원격 전용 버전 \`20261008090417\`과 UTC 초 단위가 맞지만, **버전 문자열은 로그에서 직접 검출되지 않았다.** 시간의 일치는 출처 동일성·승인·커밋 성공의 증거가 아니다.
- 긴 로그 본문 길이가 80,003 bytes로 일정해 **104,021-byte 원격 SQL과 전량 동일성을 입증할 만큼 충분한 원문 증거가 아니다.** 로그의 해시·원문·미인증 작성자 ID·고객행은 공개 PR/Issue에 저장하지 않는다.

## 3. GitHub Actions 및 Production 현재 상태의 독립 교차검사

- GitHub Actions API로 2026-10-08 **09:00~09:10 UTC**에 생성된 run 4개를 조회했다. CI/Governance/Web PR Domain Gates(09:07) 및 PR Integration(09:09)이었으며 **이 범위에서 Supabase Production run은 없었다**. **08:25~08:40 UTC** 생성 run도 0. 이는 GitHub Actions에서 생성된 run에 관한 좁은 관측일 뿐 Supabase 관리 API·수동 SQL 실행·기타 작업 경로 부재의 증명이 아니다.
- 2026-10-16 현재 Production SQL **SELECT-only** 재확인: 1400~1510 **12/12**, 1520~1720 **0/21**, 원격 전용 버전 20261008090417 **1건**. 원격 이력 \`statements\` **1 statement, 104,021 bytes, MD5 \`f70776d8c0f6369f6f13484ba9fa2271\`**, \`created_by\` 메타데이터 비어 있지 않음. 이름/원문은 가져오지 않았고, MD5/created_by는 실행자·원본 승인 서명의 증거가 아니다.
- 보안 RPC \`assert_seyeon_chat_thread_runtime_v1(uuid,uuid)\`: 존재 **1**, \`service_role\` 유효 EXECUTE **1**, 그중 명시적 직접 EXECUTE Grant **1**, \`anon\`/ \`authenticated\`/ \`myeongha_api_executor\` 유효 EXECUTE **0**. 이는 2026-10-13/14 R2-D/R2-F의 보안 관측과 동일 범주로 유지됨. 별도 불필요 Grant 승인/제거 근거가 되지는 않는다.
- 기존 [R2-G §14](SEYEON_MIGRATION_LINEAGE_R2_READONLY_PACKET_20261013.md)에 기록된 원격 SQL의 ContentManifest/ACL lexical overlap, timestamped \`20261008043000\`, 저장소 1460~1510과의 교집합이 있어도 SQL AST·최종 DDL·실제 실행 경로까지 동등하다고 추정하지 않는다.

## 4. Security/DB/Operations Owner에게 필요한 비공개 결정 증거

1. 원격 전용 \`20261008090417\` **원본 SQL의 비공개 저장 위치, 전체 바이트 SHA-256/서명, 생성·변경·승인 주체 및 감사 식별자**를 별도로 확보한다. 로그의 80,003-byte 표시를 원본 104,021 bytes 전체와 같다고 간주하지 않는다.
2. \`mgmt-api\` 세션 시간대의 **Supabase 관리 평면 요청·SQL Editor 감사**, 호출 인증 주체와 요청 ID, 승인 기록, 명시적 성공/실패 및 **트랜잭션 Commit/Rollback 결과**를 연결한다. PostgreSQL의 DB role \`postgres\`만으로 실제 인간/자동화 계정의 정체를 확정하지 않는다.
3. 번호형 1460~1510 및 timestamped 2개와 원격 전용 SQL의 적용 순서, 중복 DDL/ACL, 19 RPC의 DDL/Owner/ACL 지문 차이를 비공개에서 교차 대조한다. \`service_role\` 보조 RPC 직접 EXECUTE의 목적과 권한 최소화 여부는 Security/DB Owner가 판단한다.
4. 승인과 복구/롤백 계획 전 **Production 마이그레이션 이력 수리·DROP/REVOKE/Role 변경·원격 SQL 재실행·1520~1720(21건) 배포를 하지 않는다.** 1730/1740/1750 비배포 제안도 Owner HOLD다. \`authorizedForProduction=false\`, \`originEstablished=false\`, \`drReady=false\`, G0~G6/paid/public OFF.

## 5. 재검증 쿼리의 공개 가능한 범위

통합 로그에서 \`event_message\` 본문, DB 연결 ID, 원본 SQL 텍스트를 반환하지 않고 \`source\`, 시간·애플리케이션·역할·일치 여부·길이·건수만 집계한다. **역사 로그 보존 기간이 변할 수 있으므로 향후 조회 가능성을 보증하지 않는다.** 운영 DB에서도 \`schema_migrations.statements[1]\` 원문 대신 \`octet_length\`·\`md5\`·건수만 조회한다. 이 패킷은 2026-10-16의 제한된 관측 증거이며 이후 실행 또는 Owner 결정을 자동으로 변경하지 않는다.

**최종: \`HOLD_R2_G_HISTORICAL_ACTOR_AND_SOURCE_NOT_ESTABLISHED\`, \`authorizedForProduction=false\`, \`drReady=false\`.**
