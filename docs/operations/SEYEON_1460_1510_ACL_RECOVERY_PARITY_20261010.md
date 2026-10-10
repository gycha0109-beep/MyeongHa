# 세연 1460~1510 운영 복구 SQL: 의미 비교·권한 사후검증

Watchtower-Track: ops
기준일: 2026-10-10
Owner / P0: [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887)
보안 종료 원장: [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866)
앞선 이력/Pin 조사: [SEYEON_PRODUCTION_MIGRATION_LINEAGE_HOLD_20261010.md](SEYEON_PRODUCTION_MIGRATION_LINEAGE_HOLD_20261010.md)

## 결론

1. 운영 `supabase_migrations.schema_migrations`의 `20261008090417` Statement는 **104,021 UTF-8 byte**입니다. 식별용 MD5 `f70776d8c0f6369f6f13484ba9fa2271`. 기존 저장소의 1460~1510 마이그레이션을 그대로 이어 붙인 SQL과는 다릅니다.
2. Statement 안에서 각 원본 파일 시작부를 발견한 위치는 (1-based) `1460=639, 1470=5520, 1480=21552, 1490=31006, 1500=67421, 1510=98893`입니다. **1510 원본 전체는 완전히 포함**되며, 나머지 다섯 파일은 전체 문자열이 다릅니다.
3. 실제 행 단위 diff에서 1460~1480은 **Function COMMENT 및 권한 작업의 순서 변경**, 1490~1500은 **소유권 이전 전에 서버 전용 EXECUTE의 REVOKE/GRANT를 실행하도록 변경**한 것이 확인됐습니다. 원본 함수 정의부는 차이가 시작되기 전까지 동일합니다. 이번 비교에서 **수정된 함수 본문은 발견되지 않았습니다.** 단, 현재 카탈로그의 모든 저장 함수 정의를 byte-for-byte 원본과 대조한 것은 아닙니다.
4. 1510 뒤에는 `supabase_migrations.schema_migrations`의 개별 1460~1510 버전을 기록하는 SQL과 Server-only 함수 ACL postcheck가 이어집니다. 그래서 **이 번들은 권한 오류를 피해 기존 런타임을 한 번에 복구하려는 용도**로 해석됩니다. SQL 내용 및 현재 상태로 뒷받침되는 기술적 추론이며, 당시 운영 실행 절차·행위자·승인 기록을 입증한 것은 아닙니다.

## 차이의 성격

| 마이그레이션 | 원본과의 차이 | 함수 본문 | 판정 |
| --- | --- | --- | --- |
| 1460 | `COMMENT`와 `REVOKE PUBLIC/anon/authenticated/service_role`, API `GRANT EXECUTE`를 Owner 이전으로 이동 | 비교된 본문 변경 없음 | 기존 동작 보존 의도로 판단 |
| 1470 | Relationship Sync 3개 함수에 동일 ACL 선행 배치; `COMMENT` 이동 | 비교된 본문 변경 없음 | 기존 동작 보존 의도로 판단 |
| 1480 | Relationship History 조회 함수 ACL 선행 배치; `COMMENT` 이동 | 비교된 본문 변경 없음 | 기존 동작 보존 의도로 판단 |
| 1490 | Chat Runtime 7개 RPC의 `REVOKE/GRANT`를 Owner 이전으로 이동 | 비교된 본문 변경 없음 | 기존 동작 보존 의도로 판단 |
| 1500 | Commit v2 및 Post-Turn 5개 RPC의 `REVOKE/GRANT`를 Owner 이전으로 이동 | 비교된 본문 변경 없음 | 기존 동작 보존 의도로 판단 |
| 1510 | 전체 원본과 일치; 이후 별도 운영 복구 postamble | 전체 일치 | 동일 |

**주의:** DDL 순서 변경은 그 자체로 의미 있는 실행 차이입니다. 최종 권한/Owner가 일치한다고 하여 원본을 운영 DB에 재실행해도 안전하다거나 모든 보안 속성이 동등하다는 뜻은 아닙니다.

## 현재 운영 DB 카탈로그 검증

명하 Supabase Production `cnsfpcdiyofqvhpcegfc`에서 **읽기 전용 SELECT**로 [`scripts/operations/seyeon-production-acl-recovery-readonly.sql`](../../scripts/operations/seyeon-production-acl-recovery-readonly.sql)을 검증했습니다.

| 확인 | 현재 결과 |
| --- | --- |
| 지정 함수 | 18/18 존재 |
| 함수 Owner | 18/18 지정 역할과 일치 |
| 함수 실행 속성 | 17개 SECURITY DEFINER, Manifest 1개 SECURITY INVOKER 예상과 일치 |
| 내부 `myeongha_api_executor` EXECUTE | 18/18 가능 |
| `anon`, `authenticated`, `service_role` 직접 EXECUTE | 18/18 거부 |
| 전용 역할 | 4/4 NOLOGIN, SUPERUSER/BYPASSRLS/CREATEROLE/CREATEDB/Public CREATE 없음 |
| 위반 | **0건** |
| 최종 판정 | `ACL_PARITY_PASS_RECONCILIATION_STILL_HOLD` |

재실행 예시 (승인된 읽기 전용 DB 연결에서만):

```bash
psql -X -v ON_ERROR_STOP=1 -f scripts/operations/seyeon-production-acl-recovery-readonly.sql
```

SQL은 이력/데이터/권한을 **전혀 수정하지 않으며**, 검증 결과는 현존 18개 함수의 Owner/실행 가능 여부에 한정됩니다. 간접 Role Membership, RLS 전체, SQL 함수 본문 전체, 런타임 Grant 취소 경합, 비용 Governor까지 증명하지 않습니다. `PASS` 접두사는 이 한정된 ACL 항목의 검사 통과를 뜻하며 운영 적용 승인 신호가 아닙니다.

## 남은 운영 복구 결정

**A — 자료 수집/정합성:**
- 원격 `20261008090417` Statement를 권한이 통제된 기록 저장소에 보존하고 정확한 원본 hash/작성·실행 이력 및 전체 diff 결과를 첨부합니다. 일반 GitHub 이슈에 SQL 전체를 공개하지 않습니다.
- 저장소 원본과 운영 복구본의 **Function DDL 본문 및 COMMENT/ACL/Owner 변경 순서**의 동등성/차이를 DB Owner + Security가 공동 승인합니다.
- 기존 개별 1460~1510 이력은 존재하지만 각 `statements`가 비어 있으므로 **복구 번들/개별 marker를 삭제하거나 덮어쓰지 않습니다.**

**B — 이력 정합화 방식(Owner 승인 필요):**
- 자동 배포 도구가 인지할 **동일 버전 `20261008090417`의 합법적 재현·보존 방법**을 설계하고, **fresh DB, 기존 복구 완료 DB, Pending 1520~1640 상태** 모두에서 중복 실행·잘못된 Applied Mark를 차단하는지 검증해야 합니다.
- 로컬 migrations에 서로 다른 SQL을 동일 버전으로 위장하거나 본 복구 번들을 조건 없이 복사하는 방법은 **불허**입니다. 이미 한 번 적용된 DDL을 재적용하지 않고 보존하는 승인된 *history compatibility* 작업이 필요합니다.
- Owner 승인 없이 `supabase migration repair --status reverted 20261008090417`, `supabase db push --include-all`, 수동 ACL/Role 변경을 하지 않습니다.

**C — 실제 Production Release 및 G6:**
- DB Authority가 실제 배포 전 적합한 복원 지점·실행 순서·필요한 대기시간/비용을 승인합니다.
- Pending 1520~1640에 대해 적용 전후 함수 권한·Dependency·데이터 변경 영향과 성공/실패 재시도·복구 대책을 수립합니다.
- 실제 최신 Production 스키마 기준 governed 백업, 격리 복원, PostgreSQL DR Readiness 및 Sec/DB Owner 명시적 승인이 완료되기 전에는 G6 **HOLD**.

## 정리

**달성:** 운영 복구 번들의 변경 범위 식별, 살아 있는 18개 RPC 및 4개 Role의 제한적 권한 PASS 확인, 재현 가능한 읽기 전용 감사 SQL 작성.

**잔여:** 버전 이력 충돌 해결, 전체 배포 영향 분석, Production 배포·백업·복구·Owner 승인. 현 PR에서 원격 DB 변경 0건, 유료 LLM 호출 0건.
