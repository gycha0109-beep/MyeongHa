# M1-19 — 2026-10-08 세연 운영 복구 이력 확인 및 미반영 45개 SQL 영향 분류

> 2026-10-17 · Watchtower-Track: commerce · 기존 운영 DB **SELECT-only**, Draft. 운영 DDL·GRANT·history repair·실결제·유료 Reader 공개 0건.

## 확인 결과와 근거 수준

**복구 마이그레이션의 정체는 기확인·기록된 사실입니다.** 새로운 미확인 변경으로 간주해 이력을 삭제하면 안 됩니다.

- 운영 원격 버전 `20261008090417`의 정확한 이름은 `seyeon_runtime_1460_1510_acl_before_owner_recovery`.
- `supabase_migrations.schema_migrations.statements`에 **SQL Statement 1개**, 정확히 **104,021 bytes**, MD5 `f70776d8c0f6369f6f13484ba9fa2271`가 남아 있습니다.
- 개별 `1460/1470/1480/1490/1500/1510` 버전 여섯 개는 원격 이력에 존재하지만, **SQL statements는 모두 비어 있음**.
- `1520~1640`의 13개 이력은 운영 미설치이며, `chat_turn_attempts`의 SeYeon Personal Source Pin 컬럼 두 개가 없음.
- 기존 합의 및 최초 조사: [PR #1892](https://github.com/gycha0109-beep/MyeongHa/pull/1892), [운영 Owner 이슈 #1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887), [세연 이력 HOLD 문서](../../operations/SEYEON_PRODUCTION_MIGRATION_LINEAGE_HOLD_20261010.md). #1892는 2026-10-10 **병합**됐습니다. 해당 문서의 기존 검사 `scripts/operations/seyeon-production-migration-lineage-readonly.sql`을 **2026-10-17 실제 운영 PostgreSQL17.6에서 재실행**했고, `HOLD_OWNER_RECONCILIATION_REQUIRED` 재현.
- 여기서 확인한 것은 **DB 이력에 보존된 원문 지문 및 의미 영역**입니다. 누가 언제 어떤 세션으로 원격 104KB 복구 SQL을 실행했는지의 외부 배포·승인 로그, 신뢰된 서명, 복구 성공 여부까지 증명한 것이 아닙니다. MD5는 SQL 동일성 참고용 지문이지 무결성 서명 아님.

## 실제 운영과 저장소의 이력 차이

| 항목 | 2026-10-17 관측 |
|---|---:|
| 저장소 `supabase/migrations/*.sql` | 217개 |
| 원격 Supabase 적용 이력 | 173개 |
| **저장소에는 있으나 원격에 없는 버전** | **45개** |
| 원격에만 존재하는 복구 버전 | 1개 (`20261008090417`) |
| 운영 D2 `1820` 발급·결속 RPC | 부재 |
| 운영 `1970` 최소 읽기 RPC | 부재 |
| 현재 생산 컷오버 판정 | **HOLD** |

운영 DB의 기본 Commerce·Reader 테이블 11개와 조사 대상 컬럼 14개는 존재합니다. **테이블이 존재한다는 사실은 발급/취소 함수·권한·실행자와 마이그레이션 이력이 같다는 뜻이 아닙니다.**

## 모든 미반영 SQL 파일 직접 조사 — 분류 표

아래는 단순 파일명만이 아니라 45개 **SQL 원문 내 함수·DDL·역할·GRANT/REVOKE·SECURITY DEFINER·트리거·RLS** 신호를 확인하고 분류한 결과입니다. 자동 분류기는 각 원본 SQL의 SHA-256, 함수 정의, 권한·DDL 존재 여부를 계산하지만, **정적 신호는 마이그레이션이 운영에서 안전하게 실행된다는 증명이 아닙니다.**

| 그룹 | 해당 마이그레이션 버전 전체 | 실질 변경·검토 대상 |
|---|---|---|
| P1 · Account deletion / privacy | 1520 | 계정 삭제 finalizer 및 관계 데이터 동기화; 개인정보 삭제·보존 책임자 검토 |
| P2 · Reading artifact / Saju proof | 1530, 1540 | 영속화 Writer·불변성 트리거·사주 nonce/RLS/역할; 사주 출처 권위 검증 |
| P3 · SeYeon AI cost / governed runtime | 1550, 1560, 1570, 1580, 1590, 1600, 1610, 1620, 1630, 1650, 1670, 1680, 1690, 1700, 1710 | AI 호출 비용 원장, 예산·정산·정책, 런타임 실행 역할, Guest admission·provider queue; 비용·키·작업자 승인 별도 |
| P4 · SeYeon pin / member-reader read | 1640, 1660, 1720 | 개인정보 source pin·기존 thread 조회·상품 범위 조회; Subject RLS·데이터 최소화 검토 |
| P5 · Private D2 Reader issue / lock | 1740, 1750, 1760, 1770, 1780, 1790, 1800, 1810, 1820 | Scope Lock, Verified Receipt D2 최초·추가 구매권 발급/Reader 결속; 해당 단계는 운영 발급자 승인 없이 실행 금지 |
| P6 · Verified cancel / revoke | 1830, 1840, 1850, 1860, 1870, 1880 | 취소·환불 반영, 권한 회수, PortOne Shadow, 검토 승인; 결제 Provider와 원장 무결성 별도 |
| P7 · Writer closure | 1890, 1900 | 구형·새 D2 Writer EXECUTE ACL 회수; 각 마이그레이션 직후 역할 권한 감사 |
| P8 · Cancellation durable operations | 1910, 1920, 1930, 1940, 1950, 1960 | 취소 Inbox/Worker·Ops·Alert·2인 승인·retry, 환불 운영 동작; 생산 Worker/자동 취소 금지 |
| P9 · Approved minimal read | 1970 | 이 대화에서 승인된 최소 상태 조회 RPC EXECUTE만 허용, 원본 SELECT/D2 Writer/유료 공개 금지 |

**개별 버전 누락 없는 검사:** `scripts/operations/m1-19-live-migration-impact.mjs`와 `.test.mjs`는 저장소의 실제 SQL을 읽어 위 아홉 그룹의 정확한 **45개 버전**과 173개 운영 이력의 차이를 대조합니다. 1970도 개발·격리 DB에서는 승인된 최소 읽기 코드일 뿐 **운영 적용·발급·유료 공개 승인 값은 항상 false**입니다. 새로운 미분류 원본 마이그레이션이 등장하거나 원격 이력이 증가하면 자동 승인 대신 HOLD 합니다.

## 운영 전환을 막는 서로 다른 두 잠금

**① 세연 운영 이력/재해복구(SeYeon Owner) 잠금**

기존 원격 104KB 번들 SQL은 `1460~1510` 구성과 역할을 검사한 뒤 19개 안팎의 RPC 정의와 ACL을 복구한 이력으로 관측됩니다. 기존 개별 마이그레이션의 SQL 본문은 비어 있으므로, 원본을 현재 마이그레이션 디렉터리에 복사하거나 `supabase migration repair --status reverted 20261008090417` 명령을 수행해서는 안 됩니다. 먼저 **실제 배포자의 외부 변경 로그, 104KB 원본의 승인된 보존 장소, 개별 1460~1510 SQL 대비 함수·권한 fingerprint, DR 복구 증거, Owner 선택지**를 #1887에서 마무리해야 합니다.

**② Commerce Reader 선행 발급/환불/접근권(Commerce+DB/Security Owner) 잠금**

원격에는 D2 `1820`가 없고 Writer 폐쇄 `1900`와 최소 읽기 `1970`도 없습니다. `1820`의 비공개 발급자와 `1830~1960` 취소·환불/작업자는 **실운영 자격 증명·최종 결제 정책·취소 권위가 미승인** 상태입니다. 1970 RPC의 앱 전용 **EXECUTE** 승인만으로 이들을 한꺼번에 적용할 수 없습니다. 1720, 1740~1820의 함수 호출 경계와 1890/1900 폐쇄 증거를 **동일한 격리 PG17 스키마에서 검증**하되, 미승인 Worker·실제 Provider 결제·환불 실행은 별개 HOLD입니다.

## 권장 적용 준비 순서 — 배포 지시가 아닌 증거 게이트

1. **복구 지문과 코드 이력 일치:** 병합된 #1892를 기준으로 원격 Restore Bundle/개별 빈 Marker를 그대로 보존, #1887 Owner/DR 승인 근거 확인. 원본 104KB SQL을 공개 로그나 PR에 복사하지 않음.
2. **마이그레이션 영향 및 소유자 분리:** 그룹 P1~P4의 개인정보·사주·세연 AI/비용/권한은 Commerce 최소 조회 승인의 범위가 아니므로 **별도 트랙 Owner 승인**. 45개 SQL을 일괄 `db push --include-all` 하지 않음.
3. **격리 PG17 staging parity:** 현재 운영 백업/승인된 복구 이미지를 바탕으로 **출처 불명 실행·고객 데이터 복제 없이**, 복구된 운영 이력과 새 변경의 충돌을 검증. 보안·RLS·Role·SECURITY DEFINER·Writer EXECUTE 차단을 단계별 기록. 실제 비공개 발급자·환불 Worker 양성 실행은 별도 승인 전 금지.
4. **두 개의 독립 게이트:** 원본 이력 진단 `scripts/operations/seyeon-production-migration-lineage-readonly.sql`, M1-18 `test/db/official_reader_m1_18_live_cutover_readonly_gate.sql`; M1-19은 `m1-19-live-migration-impact.mjs`로 모든 원본 영향이 검토됐는지 점검. **게이트가 성공해도 배포 허가가 되지 않음**.
5. **인계와 컷오버:** 실제 운영 백업/DR, 권한 검토, 순서·롤백 계획, 문서화된 배포 SHA, Owner 승인, 실사용자 영향/비용·관제까지 충족한 경우에 한해 별도 운영 반영 승인. M1-17의 최소 읽기만 실제 앱 역할에서 확인하고, 원본 테이블 SELECT/Writer GRANT 및 유료 T2는 별도 금지 유지.

## 검증과 금지 조치

`scripts/operations/fixtures/m1-19-20261017-live-migration-history.snapshot.json`은 운영에서 **SELECT 및 migration list로 추출한 버전·복구 이력의 메타데이터**만 저장합니다. 실제 104KB SQL 원문, 사용자 구매·관계 데이터, DB 비밀은 포함하지 않습니다.

실행 예:
```bash
node --test scripts/operations/m1-19-live-migration-impact.test.mjs
node scripts/operations/m1-19-live-migration-impact.mjs \
  scripts/operations/fixtures/m1-19-20261017-live-migration-history.snapshot.json --summary
```

CLI는 운영에 미반영 변경이 있으면 **프로세스 종료 코드 3/HOLD**가 정상입니다. 읽기 전용으로 실제 SQL·버전/권한을 보고할 뿐 DDL, GRANT, 마이그레이션 복구, 권한 또는 자동 결제·Reader 공개는 실행하지 않습니다.

**M1-19 종료 조건:** 역사적 복구 이력의 정체 확인·변경 영향 45개 분류·격리 코드 검증까지. **운영 마이그레이션 정합성 수리·실제 1970 적용은 아직 종료되지 않았음.**
