# D-01 / CAP-B — v2 Standard vs Specialist DB Binder 검증 매트릭스 v1

> 상태: PLAN ONLY / PostgreSQL 실행·Source Rule 승인·구매/결속 정책 변경 없음 / PUBLIC OFF
> Watchtower-Track: applizing
> 본 문서와 `STANDARD_READER_V2_BIND_POLICY_SPLIT_D01_DESIGN_V1.md`는 실행 전에 Product·DB·Commerce·Reader Owner 검토가 필요하다.

## 검증 전제

- disposable PostgreSQL 15 및 17에서만 합성 Subject·Purchase Intent·Production-flag synthetic verified Receipt·exact purchase Entitlement Grant·Reader selection을 구성한다. 실제 결제·운영 Product·고객 개인정보를 사용하지 않는다.
- Source: 1220의 기존 v2 bind 원본, 1720 Product scope, 미병합 #1999의 1770 private approval rule source, #1983~#1996의 S2 잠금 계열. 마이그레이션 충돌/누락 여부는 isolated replay에서 별도 검증한다.
- 1770은 실제 policy approval을 seed하지 않는다. 합성 테스트 승인은 test-only fixture이며 Transaction rollback/ephemeral DB에만 존재한다.
- 각 DENY에서 새 official Reading/session·Reader interpretation/access·Receipt/Grant·Saju Source 접근 0을 확인한다. 변경 전 카운트와 immutable provenance 비교.
- 승인된 Standard의 일반 해설과 premium Specialist 행동은 별도 endpoint/guard로 구분한다. 테스트에서 Specialist Capability를 임의 true로 변경해서 Standard를 통과시키지 않는다.
- S2 공동 잠금 관련 테스트는 **실제 운영 Commerce writer와 동일한 내부 명령/권한**이 변경에 참여하도록 작성하기 전엔 통합 PASS로 분류하지 않는다.

## A. 분류·정확한 정책·Content

| ID | 실행 조건 | 기대 |
|---|---|---|
| BIND-01 | unseeded Product/approved rule 0건 | DENY, 신규 결속 0, can_initiate=true여도 DENY |
| BIND-02 | active Standard Rule 한 건 + canonical Reader + 유효 exact Receipt/Grant + published bundle/unlock + Saju domain + can_initiate 행 없음 | **일반 Standard에 한해 결속 후보 ALLOW**; specialist 권한 발급 0 |
| BIND-03 | BIND-02와 같지만 can_initiate=false 출판된 기존 capability 행 | BIND-02와 동일. 기존 capability row UPDATE/DELETE 0 |
| BIND-04 | active Standard Rule이어도 unpublished/disabled/coming_soon Reader, bundle mismatch, inactive default release 또는 unlockable 미해제 | DENY, mutation 0 |
| BIND-05 | Product ID/spec/domain/policy revision mismatch, Product disabled/retired, non-Reading Product | DENY, 상품 문자열 fallback 0 |
| BIND-06 | effective window 만료/미래/철회, 동시 active 승인 revision 두 개, 잘못된 clock, DB error | fail-closed DENY |
| BIND-07 | 공식 9 Reader×모든 Saju domain 합성 적격성 | Product eligibility와 DB binder가 같은 approved rule revision 하에 일치할 것; inactive Product/domain은 DENY |
| BIND-08 | active premium_restricted + Reader allowlist 제외 | DENY even can_initiate=true |
| BIND-09 | premium allowlist 안 + specialist can_initiate false/행 없음 | DENY; Standard fallback 불가 |
| BIND-10 | premium allowlist 안 + true specialist Capability | 상품/가격/전문 행동 owner 승인 전 HOLD; 실제 결속·공개 성공 주장 금지 |
| BIND-11 | malformed Reader ID/duplicate premium allowlist/unrecognized ID | DENY, TypeScript·SQL 양측 부정 |
| BIND-12 | Reader ID·approvedPolicyRevision·policy_kind를 client가 forge | payload 무시 또는 DENY; DB-backed 원본만 사용 |

## B. 구매·공식 Reading·재생 및 이력

| ID | 실행 조건 | 기대 |
|---|---|---|
| BIND-13 | pending/expired/other Subject Purchase Intent, unverified/sandbox Receipt, wrong Offer role, missing/ambiguous independent Grant | DENY; 신규 access/Reading 0 |
| BIND-14 | initial_reading verified Intent, exact Receipt/Grant, eligible Standard 정책과 정식 Release | 단 한 개 Reader-independent official Reading + exact Reader Interpretation/Access; Saju 생성은 공식 source 책임 |
| BIND-15 | additional_reader_interpretation, 기존 committed Reading + 별도 verified Receipt/Grant | Reading 증가 0, 새 Reader Interpretation/Access만 +1, Saju 재계산 0 |
| BIND-16 | additional_reader_interpretation인데 committed official Source 없음, birth revision 또는 domain Capability 버전 다름 | DENY; 새 Reading 생성 0 |
| BIND-17 | 동일 Purchase Intent/hash 재실행이 현재 revoke/expire/disabled Product인 경우 | historical replay 반환을 현재 access 승인으로 해석 0, 새 권한/결제 0 |
| BIND-18 | 동일 Purchase Intent/다른 request_hash, 같은 Reader 다른 bundle, 두 상이한 현재 유효 bundle | conflict/ambiguity DENY; 역사 덮어쓰기 0 |
| BIND-19 | one current Grant revoked but same exact bundle에 다른 independent active Grant가 있음 | 다른 Grant의 독립 권한은 유지, 취소된 Grant가 access 증빙으로 복귀 0 |
| BIND-20 | cross-Subject/cross-Reading/cross-Reader, Guest→Member 합법 병합 계보 및 위조 계보 | 허용 계보는 보존, 교차 접근/임의 소유자 변경 DENY |
| BIND-21 | legacy 1170 Reader-bound 기록과 새 v2 official identity의 교차 | 역사 재작성 또는 자동 권한 승격 0 |

## C. 경합·잠금·시간

| ID | 독립 PostgreSQL 두 연결 Interleaving | 기대 |
|---|---|---|
| BIND-22 | T2 current Reader scope lock 선점 → 합법 새 verified Receipt/Grant 발급·결속 | Writer가 동일 키에서 대기. 선행 T2는 새 Grant를 중도 관측하지 않음 |
| BIND-23 | revoke/refund writer scope lock 선점 → binder 또는 T2 | 후행 측이 대기 후 fresh 조회, revoked Grant로 신규 bind/reveal 0 |
| BIND-24 | withdrawal writer와 binder가 겹침 | Product 승인 revision 철회 순서/시간 계약대로 한 결론만 허용; 어느 순서에도 미승인 bind 0 |
| BIND-25 | `READ COMMITTED` 잠금 대기 뒤 Grant valid_until 경과 | 잠금 이후 clock_timestamp로 만료 평가, DENY |
| BIND-26 | 기존 `REPEATABLE READ` / `SERIALIZABLE` 낡은 snapshot으로 current entitlement 사용 시도 | 최신 조회 증거 전 DENY |
| BIND-27 | 여러 official Reading×Reader lock 키/Grant row와 초기 Reading identity 생성/경쟁 | 모든 writer의 동일 순서; deadlock, duplicate Reading, orphan Access 0 |
| BIND-28 | scope lock caller 참여 vs 기존 direct v2/API/Commerce Refund writer 우회 | 실제 writer 미이행이면 HOLD; 경합 예제만으로 PASS 금지 |
| BIND-29 | Product approve→withdraw 새 Revision 동시 변경, Content release 회수, Reader bundle 교체 | 정책·Content authorizing read와 최종 write/Reveal 간 시간 차이 안전성 검증; 불명확하면 DENY |

## D. 검증 경로와 인수 판정

| 절차 | 산출·소유 |
|---|---|
| 코드 레벨 proof | exact `cmd_bind_standard_reading_access_v2` 및 #1760 wrapper, #1999 policy source를 호출하는 실제 SQL 경로; mock-only로 대체 금지 |
| DB15/DB17 | ephemeral migration 순방향 실행/카탈로그 SHA, 각 BIND 테스트 증빙과 T2/revoke 독립-접속 waiting 관측 |
| API/Reader | exact current Grant/Policy/Source/Bundle/Release와 9 Reader×domain proof 일치; unauthorized raw artifact 0 |
| Commerce/DB | verified Receipt issuance/revoke/refund/replay/initial Reading의 모든 writer scope lock 참여 여부 별도 owner 승인 |
| Governance/Privacy | SQL EXECUTE/RLS/append-only/audit, Production policy approvals 0, 개인정보 삭제·restore 증거 |
| Release | paid checkout/Reader public/auto refund reject OFF, 실제 DR readiness 및 isolated restore 성공 기록 |

**현재 PASS가 아닌 것:** BIND-01~29는 새 결속 gate 구현 전의 *목표 테스트*다. #1838은 구 v2의 missing Capability 거절 사례, #1999는 unseeded approved policy source 및 isolated DB readback을 검증한 것으로, 본 매트릭스 통과를 의미하지 않는다.

**개발 시작 승인 조건:** DEC-1~6 소유자 협의와 DB 잠금 writer 경로 정렬, 1770 revision 저장 계약 확정. 이전에는 기존 v2 can_initiate gate와 Public/Checkout OFF 유지.