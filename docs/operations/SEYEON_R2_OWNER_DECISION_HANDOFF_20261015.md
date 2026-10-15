# 세연 R2 Owner 결정 핸드오프 — 읽기 전용 운영 스냅샷 (2026-10-15)

Watchtower-Track: ops

이 문서는 **프로덕션 배포 승인서가 아닌 미승인 결정을 Owner에게 반환하는 증거 인덱스**다. 원본 `supabase/migrations/1520_*.sql`부터 `1720_*.sql`까지 **21건 모두 `HOLD_OWNER_REVIEW`**다. 별도 Owner 승인 없이 migration history repair, SQL/Role/ACL/DML, 실 Provider/비용 호출, 공개 Reader, DR GREEN을 수행할 수 없다.

정본: [R2 읽기 전용 계보 패킷](SEYEON_MIGRATION_LINEAGE_R2_READONLY_PACKET_20261013.md), [복구 후 실행 로드맵](SEYEON_POST_RECOVERY_EXECUTION_ROADMAP_20261012.md). Owner 이슈: [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887), [AI Security #1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866).

## 1. 운영 SELECT-only 새로 확인된 사실

2026-10-15 KST 명하 Supabase **연결된 운영 프로젝트**에서 `supabase_migrations.schema_migrations`, `pg_roles`, `pg_proc`에 대한 **읽기 전용 집계만 수행**. SQL DDL/DML, migration repair/remote SQL 본문 복사, 고객 행 조회는 0. 이 결과는 새 스냅샷이며 장래 적용/권한 상태를 보증하지 않는다.

| 항목 | SELECT-only 실측 | 판정 |
| --- | ---: | --- |
| 1400~1510의 12개 정수형 migration history | **12/12** | 이력 존재만 확인 |
| 1520~1720의 21개 정수형 history | **0/21** | 여전히 전부 Production HOLD |
| 원격 전용 `20261008090417` | **1/1** | 출처 미해결 |
| `myeongha_seyeon_governed_executor`, `myeongha_seyeon_settlement_worker` | **0/2** | 미설치 |
| `pin_seyeon_governed_reservation_receipt_v1`, `cmd_store_seyeon_provider_receipt_v1`, `qry_standard_reading_product_scope_v1` | **0/3** | 미설치 |

원격 전용 버전은 **1 statement / 104,021 bytes / MD5 `f70776d8c0f6369f6f13484ba9fa2271`**. 2026-10-13 R2 패킷 및 2026-10-10 포렌식과 일치한다. **문장 수·길이·MD5 일치는 출처/서명/작성자/승인/재현 가능성의 증거가 아니다.** 원문을 이 문서에 기록하거나 수동으로 이력에서 삭제해서는 안 된다.

재검증 가능한 SELECT-only 집계 예시 (운영 DB를 수정하지 않음):

```sql
select
 (select count(*) from supabase_migrations.schema_migrations
  where version in ('1400','1410','1420','1430','1440','1450',
    '1460','1470','1480','1490','1500','1510')) as applied_frontier_count,
 (select count(*) from supabase_migrations.schema_migrations
  where version in ('1520','1530','1540','1550','1560','1570','1580','1590','1600',
   '1610','1620','1630','1640','1650','1660','1670','1680','1690','1700','1710','1720'))
   as applied_held_count,
 (select count(*) from supabase_migrations.schema_migrations
  where version='20261008090417') as remote_only_count;
select version, coalesce(array_length(statements,1),0) as statement_count,
 octet_length(statements[1]) as statement_bytes, md5(statements[1]) as statement_md5
from supabase_migrations.schema_migrations where version='20261008090417';
```

## 2. 기술 검증 병합 — 운영 승인과 엄격히 분리

| 원본 단계 | 독립 CI 증거 / merged PR | 아직 남은 Owner HOLD |
| --- | --- | --- |
| 1670 | [#2093](https://github.com/gycha0109-beep/MyeongHa/pull/2093), fixture 후속 [#2094](https://github.com/gycha0109-beep/MyeongHa/pull/2094) | 보안 함수 Owner/실 운영 승인, 실제 예약·비용 경계 |
| 1680 | [#2096](https://github.com/gycha0109-beep/MyeongHa/pull/2096) | 보안 함수 Owner, 실 funded admission E2E |
| 1690 | [#2100](https://github.com/gycha0109-beep/MyeongHa/pull/2100), [Integration #38668230447](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38668230447) | Worker credentials/최소권한/양수 예약 정산 E2E |
| 1700 | [#2104](https://github.com/gycha0109-beep/MyeongHa/pull/2104), [Integration #38685929021](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38685929021) | SQL CHECK nullable 비교로 무효한 Receipt shape 수용 — TEMP 동형 CHECK에서 재현. 실제 Browser INSERT exploit 증명 아님 |
| 1710 | [#2108](https://github.com/gycha0109-beep/MyeongHa/pull/2108), [Integration #38688202446](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38688202446) | 누락한 `outcome`/`costStatus`의 `NOT IN` 결과 UNKNOWN 진단. 실제 malformed Store RPC 영속화 재현 아님, Claim/Ack 경합 E2E 없음 |
| 1720 | [#2114](https://github.com/gycha0109-beep/MyeongHa/pull/2114), [Integration #38693317122](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38693317122), main `b58954caee0c28c81bd4ef5f5b7ff0eb6ccb965b` | SECURITY DEFINER Owner 최소권한. CI 생성자 `postgres` ≠ 운영 생성자 검증. 활성 Product·Reader/Offer/Grant 양수 E2E 없음 |

1720의 원본 `has_function_privilege('public', …)`가 실패할 것이라는 초기 가설은 **PG17에서 기각**되었고, 정본 §31.1~31.2에 정정했다. 이를 신규 취약점으로 취급하지 않는다.

**1720 병합 후 확인:** [Supabase Production run #38693883787](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38693883787) SUCCESS, `deploy-migrations=SKIPPED`, `governed-seyeon-relationship-backfill-1400-1450=SKIPPED`. CI에서 원본 SQL이 성공적으로 재생되었다는 사실은 원격 운영 이력 적용 0/21 및 Reader/paid OFF와 양립한다.

이 표는 **1520~1660 전체의 기술적 심사가 완료됐다고 주장하지 않는다.** 해당 구간 및 특수 위험은 기존 R2 계보 문서·Owner 검토 단위에서 각각 승인해야 한다.

## 3. 다음 Owner 결정 매트릭스 — 단순 CI PASS로 해제할 수 없음

| 결정 Owner | 필요한 최소 증거/작업 | 실행 조건 |
| --- | --- | --- |
| **Production DB Authority / Operations (R2-G)** | 원격 전용 20261008090417의 원본·Digest/서명·적용자·승인 경로·Object/ACL diff를 비공개 증거로 확보. 저장소 파일·원격 이력 간 deterministic parity와 승인된 정합성 방침 | **승인 전 migration history repair 및 원격 DDL 0** |
| **Character/Security DB Owner** | 1530 Creator 멤버십; 1640 JSONB SQL NULL 경계; 1650/1670/1680 SECURITY DEFINER Owner·게스트 경합; 1690 Worker 역할/키 보유·실 정산 제한 및 DR | 증거 확인·범위별 명시 승인 전 HOLD |
| **Governor/Cost Owner** | 1700 NULL-safe Receipt CHECK와 INSERT/UPDATE 권한·RLS 보호, 1710 Required Enum NULL-safe 수신 Guard, 확정 Provider Cost Source/Replay 충돌·정산·Claim/Ack 경쟁. 필요한 forward-only 수정은 별도 승인 | **원본 SQL 임의 rewrite 금지**, 유료 Provider 호출 OFF |
| **Reader Product DB / Security Owner** | 1660 및 1720 Owner 최소권한, 실제 활성 Product 버전/Reader 규칙, Offer/Grant/Purchase 인가 E2E와 공개 API 권한 | Reader 공개·구매/Grant 활성화 OFF |
| **Security G0~G6 / DR Owner** | 모델 입력 전 Pin, Commit/reveal/revoke 경쟁, crash/replay, 예산/실비, 실제 DR 복원 증거와 운영 승인 | [G0~G6 #1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866) 미승인, `drReady=false` |

## 4. 후속 허용 절차

1. **안전한 다음 작업:** Owner가 제공한 원격 이력 출처/원문/감사 증거를 **비공개**로 검증하고 계보 재현 여부만 read-only 판단. 결과는 R2 패킷과 #1887에 판정·미확정 구분하여 기록한다.
2. 각 위험은 기존 R2 승인 단위에 별도 Owner 판정과 실 PostgreSQL 17/동시성 증거를 추가한다. 소프트웨어 검증 PASS를 운영 적용 승인으로 승격하지 않는다.
3. 명시 승인 이후에만 변경 범위를 정해 신규 forward-only SQL/CI·rollback 검증 및 Production Owner 실행 창을 계획한다. 승인 없는 실행/배포/데이터 복제/이력 조작/Reader public 또는 Paid AI 전환 없음.
4. 출처 불명 원격-only 이력과 불합격 DR 복원 상태를 해결하기 전 `DR Ready=true` 및 21/21 운영 승인 표기를 금지한다.

**최종 현재 판정: `HOLD_OWNER_RECONCILIATION_REQUIRED`, `authorizedForProduction=false`, `drReady=false`, `paidAi=false`, `publicReader=false`.**

## 5. Owner 승인 후 분리 착수 — 1730 NULL-safe 보안 수정 후보 (2026-10-15, 여전히 배포 HOLD)

- 사용자 승인 범위는 **읽기 전용 출처 조사, 코드상 결함 수정안, 일회용 PG17 CI 검증, 안전한 PR 병합**까지다. **Production DDL/DML/ACL/Role 변경, migration history repair, 유료 Provider, 공개 Reader, DR Ready 전환은 승인하지 않았다.**
- 운영 `supabase_migrations.schema_migrations`의 **컬럼 정의만** 추가로 조회하고 `20261008090417`의 `version/name/created_by` 메타데이터를 운영 SELECT-only로 비교했다. 원격 전용 이력에는 `created_by` 값이 존재하고, 비교한 `1510` 및 `20261008043000`에서는 NULL이다. **해당 값은 작성자로 기록된 문자열일 뿐 인증된 실제 실행자·작업 원본·서명·Owner 승인 증명이 아니다.** 이메일/원문/고객 데이터는 저장소에 기록하지 않는다. R2-G 계보 HOLD를 해제할 수 없다.
- **1730 신규 forward-only 후보:** `supabase/migrations/1730_seyeon_receipt_null_safe_constraints_v1.sql`. 원본 1700 및 1710의 Git blob을 그대로 보존하고, 1700 Receipt shape CHECK를 `IS NOT NULL`을 명시한 검증된 조건으로 교체한다. 1710 Provider Queue에는 필수 `outcome`/`costStatus`에 대해 누락·JSON NULL·비문자열·허용 외 enum을 막는 별도 CHECK를 추가한다. **실제 큐 저장 경계의 안전장치**이며 원본 Store RPC 코드의 `NOT IN` 자체를 수정했다고 주장하지 않는다.
- 신규 SQL은 트랜잭션과 `lock_timeout`을 사용하며 두 테이블의 기존 행을 CHECK로 검증한다. 위반 행/권한/잠금 문제가 있으면 전체 실패해야 한다. 기존 자료를 고치거나 무시하는 `NOT VALID` 우회가 없다. **실제 운영 데이터 규모, 기존 위반 행, 롤아웃 lock 영향은 배포 전에 별도 검증해야 한다.**
- 새 PostgreSQL 17 독립 테스트 `seyeon-r2-h-1730-forward`는 기존 1510+원본 1690/1700/1710 선행 후 원본 1730을 일회용 DB에서 실행하고, **설치된 실제 CHECK 정의**를 복제한 합성 테이블에서 정상/NULL/누락/JSON NULL/잘못된 enum을 검증하도록 구성한다. 원본 함수 Owner·ACL·RLS의 보존과 재실행 fail-closed를 검증한다. 실제 CI 결과는 GitHub Actions 관측 전까지 PASS로 표기하지 않는다.
- 상태: 기존 1520~1720 **21건 전부 HOLD**, 1730도 **신규 Owner HOLD 수정 후보**. 코드 병합·PG17 PASS는 보안 Owner 또는 Production DB Authority 배포 승인, 예약 정산/Claim/Ack 양수 E2E, 원격 이력 재조정이나 DR 승인과 구별한다.
