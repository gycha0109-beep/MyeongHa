# DB-C5 — R2-BP 후보의 신규 Reader 결속 직렬화 및 잠금 순서 역전 사전 검증

**상태: 격리 PostgreSQL 검증 전용 / DB Owner 정책 미승인 / Reader public OFF**

## 기존 SQL에서 확인한 잠금 그래프

- migration `1220_official_standard_reading_reader_interpretation_authority.sql`의 `cmd_bind_standard_reading_access_v2`: 검증된 **Purchase Intent FOR UPDATE → 정확한 purchase-backed Grant FOR UPDATE → canonical self Birth Profile FOR UPDATE → official/Reader access INSERT** 순서.
- migration `1080_entitlement_effect_apply_v1.sql` Commerce 회수 writer: verified provider event와 정확한 Grant에 대해 행 잠금을 사용. **Birth Profile 참여는 현재 검증되지 않았으며, R2-BP 자체만으로 회수를 직렬화했다고 해석 금지**.
- 기존 `qry_character_standard_reading_access_runtime_v2`는 STABLE metadata 조회. 단독으로 신규 구매/Reader access INSERT phantom을 막지 못한다(#1864).

## DB-C5 격리 테스트

`test/db/official_reader_birth_scope_lock_candidate_preflight.sh`는 완전히 폐기 가능한 synthetic fixture, verified receipt, 별개 B2/B4 purchase Grant, 공식 Reading 1개를 사용한다.

1. **기존 경로를 통한 실제 신규 Reader access INSERT 차단 관측**: B4의 독립 synthetic verified purchase Grant는 준비됐으나 B4 access는 아직 없음. 세션 A가 canonical self Birth Profile `FOR SHARE`를 유지하고 세션 B가 **실제** `cmd_bind_standard_reading_access_v2`로 B4 결속을 시작한다. `pg_stat_activity.wait_event_type='Lock'`을 관측하고 A 보유 중 B4 access 0, 활성 bundle 1을 확인한다. A 종료 후 B4 access가 INSERT되는지 검사한다. 이것은 **이 binder 경로**가 같은 Birth 행을 경유함을 보일 뿐, 전체 Writer나 Commerce의 합의된 공통 잠금 규칙은 아니다.
2. **잠금 순서 역전 위험의 직접 PostgreSQL 재현**: 분리된 두 세션에서 `Grant FOR UPDATE → Birth FOR UPDATE`와 `Birth FOR SHARE → Grant FOR SHARE`를 교차 보유해 PostgreSQL SQLSTATE `40P01`을 관측한다. 이것은 **반대 순서로 잠그는 단순 구현이 교착상태를 만들 수 있다는 SQL 잠금 모형**이지, 현재 운영에서 실제 교착상태가 발생했다는 증거가 아니다.

## DB Owner에 필요한 결정 — 현재 HOLD

- R2-BP를 선택한다면 모든 관련 Writer, refund/revoke, 독립 Grant creation, Reader bind, Subject/Birth revision 및 T2가 동의하는 **전역 lock ordering**과 잠금 mode를 별도로 승인해야 한다.
- 특히 T2에서 무심코 Birth를 먼저 잠그고 기존 Grant를 나중에 잠그면 현재 binder의 Grant→Birth 순서와 충돌 위험이 있다. 단순히 `FOR SHARE` 하나를 추가하는 패치는 승인할 수 없다.
- 대안 R2-NEW라도 Reader×official Reading scope anchor의 권위, INSERT/UPDATE 참여자, privilege/forward-only migration, 교착상태 및 성능을 정의해야 한다.
- 이 검증은 T1→DB 외부 해설→T2 **실제 회수와 공개 선형화/HTTP 전송**, 운영 PortOne webhook, Approved Product 정책 #1828, GRANT role ACL/timeout/rolling upgrade를 증명하지 않는다.

**변경 범위:** 새 격리 SQL race test + DB Core runner 등록 + 본 설계 증거 문서만. 기존 migration/Commerce/Runtime/Offer/가격/권한/public route 수정 없음. 최종 결정은 DB #1827과 모바일 Draft #1823에서 승인 후 별도 forward-only PR로 처리한다.
