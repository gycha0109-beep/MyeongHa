# CAP-B2 Standard Reader — 실행·이관 로드맵 v1

> 작성: 2026-10-13 · 상태: **실행 계획 / 소유자 승인·운영 공개 미완료**
> Watchtower-Track: applizing
> 원칙: **현재 GitHub/PR/CI 결과가 우선**. 본 문서의 SHA와 완료 판정은 작성 시점의 스냅샷이며, 이어받는 작업자는 반드시 새로 확인한다.
> 상위 로드맵: [명하 공식 사주 해설 × 단일 일반 채팅방 S0~S8](OFFICIAL_READER_PAID_CHAT_INTEGRATION_ROADMAP_20261012_V1.md). 이 문서의 **B2-R0~R7은 그 안의 결속/Commerce 하위 실행 단계**이며, 상위 문서의 S3/S4(출처/원문 격리)와 #2013/#2014의 개발명 S3/S4(잠금/최초 Binder)를 혼동하지 않는다.

## 0. 변경 불가 제품·권위 계약

1. **기존 일반 사주(Standard)**: 공식 Reader 9명은 동일 일반 사주 Product의 *상품 선택 적격성*을 갖는다. 전문 `character_capabilities.can_initiate`와 독립. 그러나 **정확한 Reader별 독립 구매권**, 현재 Purchase Intent·production verified Receipt·Grant·Official Reading·Content Release·Unlock·Saju Source는 각각 검증한다. **1회 구매로 9명 전체 권한 자동 생성 불가**.
2. **미래 Premium**: `premium_character_bound(targetReaderId)`로 *하나의 Product ↔ 한 캐릭터*를 연결한다. 구 `premium_restricted(allowedReaderIds[])`는 이 신규 미병합 모델에서 폐기. 다른 Reader의 일반 사주 접근을 전역 차단하지 않는다. 전용 Premium 판매·실결속·전문 권한은 미승인/HOLD.
3. **읽기/쓰기 분리**: 상품 적격성·사전 조회·과거 `replayed=true`는 현재 구매권이 아니다. 기존 1220 Binder, 공식 Saju 계산, Commerce 원본 Writer, Privacy 삭제/복원 이력은 직접 변경하지 않는다.
4. **최소 권한**: 모든 새 Binder/발급/환불 실험은 disposable PostgreSQL의 private SQL/비공개 API 계약에서 검증한다. Public/anon/authenticated/service/API/Commerce runtime의 신규 SQL EXECUTE, 실제 Checkout, T2 유료 본문 공개, 자동 환불 거부는 Owner/DR/법무·개인정보 승인 전 금지.
5. **잠금**: `READ COMMITTED`, 서버 유도 scope, advisory transaction lock이 Purchase/Receipt/Grant/Birth row lock보다 먼저. Lock 후 fresh read 및 `clock_timestamp()`. 특정 실험의 PASS는 **모든 운영 Writer가 해당 lock에 참여한다는 증거가 아니다**.

## 1. 현재 검증 기준 및 PR 의존 그래프

### 확인된 미병합 스택 (2026-10-13 조회)

| 트랙 | PR 계열 | 검증된 범위/보류 |
|---|---|---|
| DB S1/S2 | #1983 → #1984 → #1987 → #1993 → #1996 → #2001 → #2004 | Reader scope lock, current bundle, additional issuer/Reader 결속, 결속된 Grant의 Provider revoke, dormant verified cancellation bridge. **운영 Provider ingress와 최초 결속 전 환불은 미연결** |
| Product/앱화 | #1999 → #2005 → #2007 | 승인 Rule source, Standard 범용 eligible, Premium 단일 target Reader, B1 preflight. **운영 approved Rule seed/판매 상품 없음** |
| CAP-B2 통합 | #2010 → #2013 → **#2014** | 1790 Product Rule + 1800 additional Binder, 1810 최초 scope/상품 승인·철회 lock, 1820 최초 Binder, 1830 최초 verified Receipt issuer. **비공개 Draft** |
| 별도 RR | #1960(RR-03) → #1974(RR-04) | 출처 저장/후속 조회 후보만. **RR-03의 1720 번호 충돌과 Privacy/T2 계약 미해결** |

- **#2014**: `feat/applizing/cap-b2-initial-binder-private-s4`, 2026-10-13 확인 HEAD `0d857eeb247b3c9d870685c322b7902d1b0955c3`; Draft/open/unmerged. 해당 HEAD의 CI Verify, db-authority-core, 앱화, PostgreSQL 17, Commerce payment/entitlement, Content, Governance, Web, GitGuardian **SUCCESS**. Runtime DB dependency는 route-skipped(성공이라고 주장하지 않는다).
- 실제 DB15 로그: synthetic `seyeon`의 전문 Capability 행 0개에서 첫 Official Reading/Interpretation/Access 각각 1건 생성 **PASS**, historical replay→현재 Grant 승격 거절 **PASS**, 신규 private Binder 및 Receipt issuer ACL **PASS**. DB15 카탈로그 해시 `e59dce38aaa7f9d2534d297825c398b90f6899a7ab46d49402a4c6387b972307` (이 SHA는 1820/1830을 포함한 당시 스키마에만 해당).
- 최신 본선 SHA, PR HEAD, CI 결과, 마이그레이션 번호는 **항상 GitHub에서 재확인**. 상위 S0~S8 로드맵 및 개별 PR의 과거 상태는 현재 결과로 자동 승격하지 않는다.

### 통합 마이그레이션 후보

- `1740` Reader scope, `1750` current bundle, `1760` additional lock, `1770` Provider revoke, `1780` verified revoke bridge.
- `1790` Product approved Rule(**통합 스택에서만** 구 Product PR의 1770 중복을 분리), `1800` additional Standard Binder.
- `1810` 초기 Subject/Product/Birth/Spec scope 및 Product approve/withdrawal 잠금, `1820` 초기 Reader Binder, `1830` 초기 verified Receipt issuer.
- 원본 #1999/#2007 Product PR은 별도로 1770을 사용하므로 **병합 순서·번호 정렬 미완**. RR-03 #1960은 본선 Product의 1720과 충돌. 이미 운영 적용된 번호/해시를 재작성하지 말고 각 소유자가 forward-only numbering·이력·카탈로그를 승인해야 한다.

## 2. 다음 작업 순서 — B2-R0~R7

| 단계 | 착수 작업 | 실제 완료 조건 / 테스트 | 상태 |
|---|---|---|---|
| **B2-R0 현황 동기화** | 본선과 #1983~#2014 최신 Draft/stack/HEAD/CI, S4 실PG 증거, 운영 DR, migration catalog 재조사 | 최신 스냅샷·변경 파일/충돌·실패 원인 기록 | **작성 시점 완료, 매 세션 재수행** |
| **B2-R1 과거 구매 최초 Scope 영구 고정** | 1810의 *현재* Birth/Offer 의존은 환불 시점에 부적합. 검증된 Receipt/initial purchase의 immutable Subject/Product/spec/domain/구매당시 BirthRevision/Reader/Scope identity를 재해석 불가능한 authority pin으로 append-only 보관하는 별도 소유 계약·forward-only migration 제안 | 현재 Birth 수정·상품 retire·Reader release 교체 후에도 verified receipt lineage로 **동일 최초 scope 획득**; 다른 Subject/위조 pin DENY, ACL·개인정보 삭제 계약 | **#2029 격리 PRIVATE 후보 / 실PG·Owner 증거 대기, 운영 미완료** |
| **B2-R2 최초 결속 전 환불·만료·회수** | Provider `payment.cancelled` verified event/receipt→immutable scope pin 조회→초기 scope lock→Product/Grant/CAS locking. **Access 0행이어도 회수**. 기존 1770/1780(이미 결속된 Scope)과 충돌 없이 분기. 임의 직접 Grant UPDATE 금지 | **환불 먼저→발급/Bind 거절**, **발급·Bind 먼저→환불 대기 후 새 접근 차단** 두 연결 PG15/17. Event 중복/순서 뒤집힘·복원·가짜 Receipt DENY; 무교착·Orphan 0 | **미완료 / R1 필요** |
| **B2-R3 전체 Writer 공통 잠금 통일** | 최초/추가 발급·Binder·Refund/Revoke/Expire·Reader 결속·T2 Reader 접근, Product 승인/withdraw, Content retire/Unlock 변경의 *실제 호출 함수*별 Lock order 표·도달성. 서로 다른 scope multi-lock 순서와 policy revision pin 설계 | 모든 쓰기 진입점 scope-first 적용; direct legacy bypass 0(또는 명시적 HOLD), 2-session 양방향 interleaving, READ COMMITTED·wait 이후 최신 Grant·policy·Release 검증 | **부분 구현 / 통합 미완료** |
| **B2-R4 범용 Standard·Premium 제품 검증 완성** | CAP-B2 D-01의 **BIND-01~29**를 실제 PostgreSQL 및 Reader·API 경로로 구현. 구 BIND-08~12 `premium_restricted` 사례를 **단일 `premium_character_bound(targetReaderId)` 의미로 갱신**; Premium 실제 결속은 HOLD | 9×9 Standard 적격성은 상품·공식 Reader 기준, 정확한 Receipt/Grant/Release/Unlock 필요, 전문 `can_initiate` 0/false 허용; Premium target 불일치 DENY·일치만으로 paid access 0; replay/권한 철회·cross-subject·policy withdrawal 음성, PG15/17 | **부분·매트릭스 전체 PASS 아님** |
| **B2-R5 앱 API·Reader 읽기 권한 / T1→T2 경계** | Runtime API selection/admission에서 pinned policy revision + Reader + exact Grant/Source/Bundle 확인, 현재권한 재검증. 별도 유료 해설은 T1 체크→잠금 없는 비공개 생성→T2 현행 권한·출처 검증 후 원자 저장→그 뒤 공개 | refund/expire/retire 후 생성·재열람·AI memory/summary/notification 유출 0; 과거 답변 역사만으로 현재 권한 발급 0; protected output 경계와 Reader/Commerce/Privacy 승인 | **미완료 / 상위 S3~S6에 연결** |
| **B2-R6 운영 준비·스택 정리** | #1983→#2014 순서·마이그레이션 버전·스키마 catalog·owner PR 경계/충돌 정리, RR-03 1720 재번호 Owner 의뢰, production 1400~1450 DR/isolated restore 해결, 권한/RLS/Privacy 삭제·복원·Legal 고지 확인 | 모든 병합 HEAD CI GREEN, PG15/17 full matrix, 실제 DR restore PASS, Product/DB/Commerce/Reader/Privacy/Legal 명시적 승인 | **미완료 / 병합·배포 HOLD** |
| **B2-R7 단계적 유료 공개** | S0~S8 상위 Roadmap의 공개·T2 보호본문·RR-03/04 정식 연계 후 별도 release 판단 | checkout/reader public/T2 disclosure/auto-refund 운영 기능은 출시 승인 별도. 암묵 활성화 0 | **차단 유지** |

**2026-10-13 R1 동기화:** [#2029](https://github.com/gycha0109-beep/MyeongHa/pull/2029)는 #2014 HEAD 위 격리 Draft로 1840 Purchase Intent 사전 pin/verified Receipt 및 cancellation event의 역사적 Scope 조회·동일 1810 잠금, PG 격리 테스트를 신규 추가했습니다. **최신 HEAD DB CI PASS 전에는 R1 검증 완료가 아닙니다.** 운영 Purchase Intent 생성의 원자 capture 연동, Privacy 삭제/복원, Commerce R2 회수 Writer 채택, Production DR은 미완입니다. 늦은 사후 pin은 구매 당시 Birth authority를 입증할 수 없어 의도적으로 거절합니다.

**2026-10-13 R1/R2 실제 구현 갱신:**
- [#2029 R1](https://github.com/gycha0109-beep/MyeongHa/pull/2029) HEAD `76b46c0f4ce9325eccd9efc8332da2ac95443b41`: [CI #38337252515](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38337252515) **SUCCESS** (DB Authority Core, PostgreSQL17, Commerce Payment/Entitlement, Content 포함). 그러나 **Governance #38337252305 FAILURE**: Owner 승인된 P0-PR-01 삭제 처분 정책의 140-edge/59-table/fingerprint와 신규 R1 개인정보 FK 141-edge 그래프 불일치. 이 트랙은 기승인 Privacy 계약을 임의 재서명·재해시하지 않음; Privacy Owner의 신규 테이블 삭제/보존 계약 및 graph fingerprint 정식 변경이 필요. R1 **코드/DB 증명**과 **운영 통합 승인**은 분리.
- [#2032 R2](https://github.com/gycha0109-beep/MyeongHa/pull/2032): 1850 Private verified cancel → immutable initial scope lock → 0-Access 시 원 Commerce CAS/ledger, 결속된 Access 시 원 1770 Reader scope 이후 Commerce effect. 1860 Private event-first/Grant 0행 receipt issuer gate. `refund_first` / `bind_first` / `no_grant` 세 격리 실PG 동시성 테스트를 도입. exact HEAD CI 최종 통과 및 운영 Provider ingress/원자 caller/Privacy Owner 확인 전 **검증·출시 완료 아님**.
- **R3 선행 통합 HOLD:** 기존 1830과 Provider event verification ingress는 새 1850/1860 caller로 cutover되지 않음. 실제 환불 서비스는 여전히 OFF. 운영 writer의 미참여가 확인된 상태에서 병합·신규 EXECUTE grant·T2 유료 공개 금지.

**2026-10-13 R2 최종 CI·R3 착수:** [#2032](https://github.com/gycha0109-beep/MyeongHa/pull/2032) HEAD `299b82505a8c06eb693fa99695ea70d3e893e599` [CI #38338093367](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38338093367) **SUCCESS**, DB15 로그에 `PASS B2-R2/refund_first`, `bind_first`, `zero-Grant event-first`, 정확한 catalog SHA `1f986d97...` 검증. 별도 Governance #38338093025 **FAIL**, Privacy Owner 승인 필요. [#2035](https://github.com/gycha0109-beep/MyeongHa/pull/2035)는 R2 위 신규 Draft R3의 Product 승인 철회 ↔ 최초 Binder 실제 2 연결 순서·Catalog 참여 감사를 구현했습니다. **R3 HEAD CI 결과 대기**; Runtime ingress, Content retire/Unlock, multi-scope deadlock/T2와 Privacy Owner 계약은 계속 HOLD.

**2026-10-13 R3 검증 확정:** [#2035](https://github.com/gycha0109-beep/MyeongHa/pull/2035) HEAD `06605a2da63fa49e2111222d3163bfe401e56fb9` [CI #38341592434](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38341592434) **SUCCESS**, 실PG15 db-authority-core에서 `PASS B2-R3/policy_first`, `bind_first`, `sorted multi-Reader 2-session wait/release`, R2 3경합 회귀 PASS, runtime ingress HOLD inventory **461개 파일/기존 호출 4종/Private Writer 7종 접근 차단** PASS, catalog `1f986d97...` PASS. Web·앱화도 PASS. **DB dependency PG17/Commerce/Content는 해당 HEAD에서 skipped**(R2 이전 HEAD 성공을 현재 HEAD 성공이라고 표시 금지). 별도 [Governance #38341592076](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38341592076) **FAIL**, R1 신규 Privacy FK의 승인된 140-edge P0-PR-01 계약 위반. R3는 SQL private proof 일부만 종료; 운영 ingress/v4 구매 시점 R1 pin 원자성·Provider 검증 도착 잠금·Reader/T2·Content retire·multi-Product deadlock 전체 경로는 **미통합/Owner HOLD**.

**2026-10-13 R4 착수:** [#2041](https://github.com/gycha0109-beep/MyeongHa/pull/2041) 은 #2035 R3 위의 격리 Draft. #2003 D-01의 BIND-01~29를 ID 그대로 추적하고, 폐기된 Premium allowlist 대신 `premium_character_bound(targetReaderId)` 단일 대상을 적용했습니다. PG15 신규 테스트는 Rule 0건 Standard DENY, Premium target 일치여도 Standard Binder DENY, Standard 승인+specialist `can_initiate=false`에서 최초 Reading/Access 생성, REPEATABLE READ DENY에 한정됩니다. **R4 exact HEAD DB CI PASS 전이므로 검증 후보**, 전체 29건·9×domain·PG17·운영 T2/Commerce 통합 PASS라고 선언하지 않습니다. 관련 Owner별 Cutover 미승인, R1 Privacy Governance 및 1400~1450 DR HOLD 유지.

**필수 선행:** R1의 불변 scope authority는 R2 환불과 R3 모든 Writer 경합의 근간이다. R4는 단위별 병렬화 가능하나 실제 권한 공개는 R1~R6 선행. R7을 CI GREEN만으로 허가하지 않는다.

## 3. 우선 착수할 1개 작업 — B2-R1

### 검증할 질문
- 검증된 최초 구매의 **출생정보 개정/상품 규격/공식 Reader/결속 당시 Product 승인 Revision**을 어느 기존 immutable row에서 읽거나 어떤 신규 append-only row에 고정할 것인가?
- **결속 이전** 취소 이벤트에는 `standard_reading_reader_access_grants`가 0행이다. 이 상황에서 결제사 이벤트가 초기 범위를 어떤 verified receipt provenance로 정확하게 조회하는가?
- 상품 retire, Birth revision 변경, 승인 Rule 철회 후에도 **환불은 거절되거나 무한 대기하면 안 된다**. 과거 scope lock 도출과 현재 paid access 결정은 독립적으로 유지되는가?
- 최초/추가 Reader의 서로 다른 advisory-key와 Product lock, Grant row lock 간 전역 순서, 정책/Content 변경 Writer가 그 순서를 침범하는가?

### 작업 산출 순서
1. `#2014` HEAD와 현재 본선/DB migration; 1820/1830/1810/1770/1780, `purchase_intents`/`commerce_receipts`/`entitlement_grants` 및 policy revision provenance를 실제 SQL로 조사한다.
2. DB·Commerce·Product Owner가 변경할 권위 테이블·함수 목록/lock order를 **문서/테스트 계약**으로 확정한다. 승인 없는 mutable product 상태를 immutable pin의 대체물로 쓰지 않는다.
3. 격리 신규 Draft PR, 기존 production migration 비변경·기존 Commerce Writer 비우회 원칙으로 최소 append-only pin + exact source resolver의 private migration과 최소 권한을 작성한다.
4. 합성 verified initial purchase→출생 개정/상품 은퇴→unbound refund intent→같은 scope pin 조회의 **실 PostgreSQL positive/negative**; 별도 연결에서 lock timeout·post-wait fresh check를 증명한다. 이때 환불 효과의 실제 집행은 R2가 준비되기 전 별도 HOLD.
5. PG15/17, commerce-payment/entitlement/content, db-authority-core, Governance/Web/Security/CI Verify를 **최종 HEAD**로 실행·확인하고 PR에 정확한 경계 및 차단 조건을 기록한다.

### 종료/중단 판정
- A: 실증된 단계 범위 내 문제 0, 재검토 통과.
- B: 중요 결함 0, 선택 개선만 남음. 단계 닫고 후속 Rn에 넘긴다.
- C: Owner 결정·외부 실데이터·운영 DR·서명 없이는 안전한 구현 불가. **왜 막혔는지, 완료된 부분, 다음 조치만** 적고 해당 변형을 중단한다.
- 실패 CI를 건너뛰거나 카탈로그 해시를 추측/복사하지 않는다. 실제 PG15 digest에서 재계산한 뒤 전체 의존성 테스트를 확인한다.

## 4. 작업 방식·보고 규칙

- 진실 기준: **GitHub main + 실제 PR HEAD + 새 로드맵 및 migration/run CI**. 이관 프롬프트/과거 요약/SHA는 단서일 뿐 현재 상태의 진실로 승격 금지.
- 소유 트랙을 임의 침범하지 않는다. DB Authority, Product, Commerce, Reader, Saju Source, Privacy, RR-03/04의 승인 결정은 구분. 필요 시 별도 Draft와 교차 PR 코멘트. 승인되지 않은 정책·가격·Product·Reader public route를 seed/활성화하지 않는다.
- 각 작업은 **목적 → 수정 파일 → 자동/실DB 검증 → 자체 재검토 → 남은 리스크 → 다음 단계** 순서로 완료한다.
- 중간 보고는 **완료 / 문제 / 다음 작업**만 짧게. 단순 재질문이나 과도한 진행 설명 없이 바로 다음 구현 가능한 마일스톤으로 간다.
- CI 대형 실행은 결과를 한 번 더 확인하되 무한 대기 금지. 시간 초과·장기 정체·외부 승인 부재는 마지막 정확한 상태를 보고. **최종 HEAD의 통과 전에는 PASS라고 하지 않는다.**

## 5. 참조

- `docs/architecture/OFFICIAL_READER_PAID_CHAT_INTEGRATION_ROADMAP_20261012_V1.md` — 공식 사주 채팅 전체 S0~S8.
- `docs/architecture/CAP_B2_INITIAL_PRIVATE_BIND_ISSUE_REFUND_S4_DRAFT_V1.md` — #2014 private initial Binder/Receipt/Refund gap.
- `docs/architecture/CAP_B2_INITIAL_SCOPE_PRODUCT_POLICY_LOCK_S3_DRAFT_V1.md` — #2013 initial scope + approved policy lock.
- `docs/architecture/CAP_B2_STANDARD_READER_DB_STACK_INTEGRATION_DRAFT_V1.md` — #2010 DB+Product 통합.
- `docs/architecture/STANDARD_PREMIUM_READER_PRODUCT_ASSOCIATION_REMODEL_V1.md` — #2007 현재 Product 모델.
- `docs/architecture/STANDARD_READER_V2_BIND_POLICY_SPLIT_D01_TEST_MATRIX_V1.md` — #2003 BIND-01~29(구 Premium 목록 문구는 새 모델로 갱신 필요).
- 연동 PR: #1983, #1984, #1987, #1993, #1996, #1999, #2001, #2004, #2005, #2007, #2010, #2013, #2014, #1960, #1974.

## 2026-10-14 B2-R0 갱신 / B2-R4 BIND-13 신규 좁은 증거

- 코드 PR [#2041](https://github.com/gycha0109-beep/MyeongHa/pull/2041)은 **Draft/미병합**, R3 Draft [#2035](https://github.com/gycha0109-beep/MyeongHa/pull/2035) 위의 구현 브랜치 `feat/applizing/cap-b2-bind-matrix-r4-real-pg`. 신규 **검증된 코드 HEAD `135435db18fa126f4a872dccb882f5f8d9d6c94b`** 기준 [CI #38528059539](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38528059539) 9/9 SUCCESS, PG15 Authority Core·PG17 각각 `PASS R4/BIND-13 two-session distinct synthetic Provider cancellations S3 WAIT and stale CAS rollback` 로그 존재. Work Track·Commerce·Content·Runtime·Web 역시 PASS. 별도 Governance #38528059562는 P0-PR-01 140-edge 승인 그래프/1840 FK 불일치로 **FAILURE**.
- **진척 정의**: R4/BIND-13은 합성 verified-flag 서로 다른 두 Provider 취소 Event가 동일 초기 Receipt/Grant S3 scope를 경합할 때 stale expected revision/last-order-key CAS 거부와 event+CAS rollback을 실제 두 연결에서 검증. 동일 source replay 이전 증거 유지. **실제 Provider 최신성 판단/역순 유입 정책을 인증한 것은 아님**. BIND-01~29 전체는 PARTIAL.
- **단계 상태 불변**: R1 immutable pin/R2 private revoke 격리 진척, R3 실제 운영 Writer 공동잠금 **HOLD**, R4 검증 계속, R5 T1→T2 paid 공개 **HOLD**, R6 Privacy/DR/Owner·migration 스택 승인 **HOLD**, R7 출시 **OFF**. 별도 소스 결정: distinct Provider ordering-key 의미·no-op status 처리, refund+repurchase Receipt/Grant 독립성은 Commerce/Provider Owner 정책 필요. 기존 회원 병합 SRC-24는 OPEN/BLOCKING.
- 다음 안전한 검증: 새 Receipt/Grant가 생긴 경우 취소 이벤트가 옛 Receipt의 Grant만 취소하고 새 구매권을 건드리지 않는지 실PG15/17 격리 테스트; 의미적 우선순위나 운영 Writer, 정책을 임의 구현하지 않음. 모든 이력과 한계는 #2041 PR에 누적.

## 2026-10-14 B2-R0 갱신 / B2-R4 BIND-19 환불 후 재구매 격리 완료 (앱화 우선순위 복귀)

- **완료된 좁은 검증**: 코드 Draft [#2041](https://github.com/gycha0109-beep/MyeongHa/pull/2041), 검증된 코드 HEAD `5a103a55b46ea1ac3eac8f43a0c4fb7014ffbe04`. [CI #38533318866](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38533318866) **9/9 SUCCESS**, PG15/PG17 양쪽에서 `PASS R4/BIND-19 same-bundle two Receipts/Grants, old synthetic verified cancellation original 1080 CAS, wrong new Grant lineage DENY, new access survives, old replay DENY` 로그 확인. Web·Work Track SUCCESS, **46 total / 43 unique** 사례.
- **증명한 것**: 두 개의 독립 구매 Receipt/Grant가 동일 Reader·bundle을 가질 때 옛 구매의 synthetic verified-flag cancellation은 새 Grant를 가리킬 수 없음(lineage DENY). 원본 Commerce 1080 CAS로 옛 Grant만 revoked 처리 후 새 Grant provenance/ledger와 현재 Reader 권한이 살아 있고 과거 Binder replay가 거부됨. 기존 fixture-only 직접 Grant UPDATE 검증보다 현실적인 Commerce 원본 함수 경로로 좁게 강화함.
- **증명하지 않은 것**: 실제 PortOne 환불 ingress, signed Provider verification, refund payment settlement, 이벤트 간 실시간 최신성/ordering-key 정책, 모든 운영 Writer의 S3 잠금, R5 T2 유료 콘텐츠 오픈. 별도 Governance [#38533318848](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38533318848) **FAILURE**(Privacy 그래프 140/1840 충돌), SRC-24 기존 회원 병합 및 DR/Owner 승인은 **HOLD**.
- **이 트랙의 이번 작업 종료 조건**: BIND-19 신규 테스트 **PG15/17 PASS (A)**, B2-R4 전체 **PARTIAL**, R3 운영 전환/R5~R7 **HOLD**, Draft PR 미병합. 추가로 결제/권한 서브트랙을 파생하지 않고 **원래 앱화 트랙의 제품 UI·사용자 동선 우선순위로 복귀**. 운영 Writer·Provider 정책 추가 구현은 별도 명시적 승인 전 금지.
