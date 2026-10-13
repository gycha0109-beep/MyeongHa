# D1 — 공식 Reader 전역 잠금 진입점과 Writer 잠금 순서 감사 v1

> 기준: #2008 상세 설계, #2006 HEAD `5127e8f` 위 문서 가지 `9e33cee`.  
> 분류: `db-authority-core`. 소유 책임: DB/Commerce/Chat/Reader/Saju.  
> **D1 PRIVATE CANDIDATE / NOT A WRITER CUTOVER / NO PAID T2 / NO PRODUCTION MIGRATION.**

## 1. 감사 결과 및 결론

**P0:** 현재 함수 집합이 서로 다른 진입점으로 동작하고 있으며 Product L0→Reading-Reader L1→원본 행 잠금이라는 통일된 순서가 강제되지 않는다. **S1/S2 synthetic race PASS는 모든 Commerce/Chat Writer가 계약을 따르는 증거가 아니다.**

이번 D1에서는 `1800_official_reader_unified_scope_entry_private_v1.sql`에 source-bound lock entry 두 개만 추가한다. **기존 Writer를 변경하지 않으며**, 실제 Product/Reading/Reader 범위의 권한을 발급하지 않는다.

- `internal_acquire_official_reader_existing_scope_v2(subject, reading, reader)`: authoritative `standard_reading_official_bindings`의 읽기만으로 Product를 유도; `Subject×Product` L0를 확보한 다음 Source/product 변경을 확인하고 `Subject×Reading×Reader` L1 잠금; 다시 Product 일치 검증. 읽기만, COMMIT 시 두 잠금 자동 해제.
- `internal_acquire_official_reader_purchase_scope_v2(subject, purchase_intent)`: verified Purchase Intent/Offer/Role에서 최초 구매냐 추가 Reader냐 정확히 분류한다. 초기이면 기존 1790의 권위 Product 후보 확인 후 L0만 확보. 추가이면 1760의 정확한 Reading/Reader 후보와 `standard_reading_official_bindings` Product 일치를 확인한 후 **L0→L1**. 잠금 대기 후 Role/Product/Reading/Reader 재확인; drift면 전체 오류.
- 두 함수는 `READ COMMITTED` + canonical Subject context 필수, `SECURITY INVOKER`, PUBLIC·API·Commerce runtime 직접 `EXECUTE` 금지. 잠금·동일성만 다루며 **현재 Grant·Product 판매 가능 상태·T2/LLM/HTTP 공개 권한은 판단하지 않는다**.

### 실제 Writer/Reader 잠금 순서 지도

| 경로와 근거 파일 | 현행 원본 함수의 행 잠금/적용 순서 | 기존 후보의 L0/L1 | 결론 및 D2/D3 조치 |
| --- | --- | --- | --- |
| 원본 Receipt issuance, `1090_verified_receipt_capability_fulfillment_batch_v1.sql` | `commerce_receipts FOR UPDATE` → capability aggregate 검증 → `1080` effect | 자체 L0/L1 없음 | Verified Receipt/Offer/Intent 분기 후 공통 진입점으로 라우팅. **원본 영수증 행 잠금 전** L0/L1 |
| 원본 Entitlement Effect, `1080_entitlement_effect_apply_v1.sql` | Receipt/Grant/Provider Event의 다중 `FOR UPDATE` 및 revision/order/CAS, ledger/projection/outbox | 자체 L0/L1 없음 | Source event별 영향을 받는 모든 Product/Reading/Reader 추출. **원본 event/Grant 행 잠금 전** 정렬 |
| 공식 Reading bind, `1220_official_standard_reading_reader_interpretation_authority.sql` | Purchase Intent `FOR UPDATE` → Grant `FOR UPDATE` → Birth Profile `FOR UPDATE` → first Reading 또는 additional Reader 결속 | 자체 L0/L1 없음 | L0→(L1 필요 시) 후 원본 v2 호출. 원본 Binder 안에서 뒤늦은 잠금 취득 금지 |
| 추가 Reader receipt·bind, `1760` | candidate Reading/Reader → **L1만** → 기존 `1090` 또는 `1220` | **L0 누락** | D1 source-bound Purchase entry에서 L0→L1으로 단일화; 구 함수 직접 호출 축소 및 회귀 검증 |
| 기결속 Provider revoke, `1770` | 영수증/Grant lineage preflight → **모든 영향 L1 정렬** → 원본 `1080` | **L0 누락** | 영향 Product 전체 L0 먼저 정렬 후 L1. preflight 범위 drift 및 phantom 확인 |
| verified Provider cancellation bridge, `1780` | 사전 verified event/receipt/Grant → 1770 호출 → 원본 1080. Provider Worker role EXECUTE 없음 | 1770과 같은 L0 누락 | 현재 PortOne callback 실제 wiring 없음. `payment.cancelled` 정규화/부분 취소·중복·역순 정책 + 최소 권한 worker 별도 검토 |
| 최초 Receipt·bind, `1790` | verified Initial Intent→**L0만**→원본 `1090/1220` | Reading UUID 없음; L0만 존재 | 첫 구매에 적합한 잠금 후보. 이후 기존 Reading 생성·Grant 결속과 동일 Product의 추가 Reader 범위를 묶을 D2 필요 |
| 현재 Reader Bundle read, `1750` | **L1만** → `1270` current Grant active time check | **L0 누락** | D5/D6 T2·protected read 모두 L0→L1, Product/Release/Source도 재검증 |
| 일반 Chat commit, `0220_chat_attempt_commit_commands.sql` | Thread `FOR UPDATE` → Turn `FOR UPDATE` → Attempt `FOR UPDATE` → 일반 Message/Memory/Outbox | Product/Reading 잠금 없음 | 유료 전용 writer에서 먼저 L0→L1을 확보. 일반 Chat 원문 body 및 side effects를 유료 경로에 재사용 금지 |
| RR-03 #1960 / RR-04 #1974 Draft | private provenance skeleton / private candidate query | 실 T2 및 source manifest 미구현 | 양쪽 모두 Draft·공개 사용 불가. 1720 migration 번호 충돌 분리 필수 |

**잠금 순서 결과:** (1) L0 Product 전체를 UUID 오름차순 확보 → (2) L1 Reading/Reader 전체를 UUID/text 오름차순 확보 → (3) 원본 Commerce/Grant/Birth/Chat 행 잠금 → (4) 원자 결과 반영/COMMIT. **한 거래가 L1 또는 행 잠금을 먼저 취득했다면 L0를 뒤에 추가로 얻지 않는다.** 역전 감지 시 새 트랜잭션으로 재시작하는 설계가 필요하다.

## 2. 이번 D1 PostgreSQL 증거

`test/db/official_reader_unified_scope_entry_private.sh` (격리 PostgreSQL15, 17 종속 CI)의 검증 범위:

- 원본 합성 공식 Reading 권한 fixture를 적용하고, 최초 Intent에서 L0-only, 추가 Intent에서 정확한 동일 Product+Reading/Reader, 기존 Reading에서 source-bound L0+L1 잠금을 입증.
- 동일 Subject/Product의 L0를 접속 A가 보유한 사이 접속 B의 기존 Reading scope 접근이 **Product 잠금에서 실제 대기**하는지 `pg_stat_activity`와 `pg_locks`로 확인. 같은 Product에서 다른 Reader가 L0를 우회할 수 없는지와 다른 Product L0는 독립적인지 확인.
- 격리 수준 `REPEATABLE READ`·`SERIALIZABLE`, 읽기 없는 Reading, 다른 Subject context, 과잉 runtime SQL role 권한 모두 부정.
- 함수는 실제 Grant 생성·회수, Product 정책 승인, 출처 신뢰 증명, 유료 T2 Commit/Reveal, HTTP 계약을 구현하지 않는다.

## 3. 남은 불변식 증명과 절차

- **D1 추가 범위:** 다중 Product/Reading/Reader의 정렬된 전체 집합 선점, 범위가 잠금 대기 중 변하는 경우 rollback/retry. 이번 구현의 한 Purchase Intent 또는 한 기존 Reading 경로만으로 다중 이벤트 안전성을 주장하지 않는다.
- **D2:** 1760 추가 구매 발급·bind, 1790 최초 발급·bind를 1800 공통 API로 모두 라우팅하되 기존 `1090/1220` 원본 CAS와 멱등성 보존. 미결속 초기 Grant revoke-before-bind 시험.
- **D3:** Provider event/restore와 다중 Product 영향 범위에 L0 전체 선행 잠금, 그 다음 L1 전체. 기존 `1080` 직접 호출 및 관리자/보정 작업의 우회 실행 경로 차단. 실제 verified cancellation ingress/Commerce actor 권한 계약.
- **D4:** Saju-owned source manifest/provenance Unit membership/closure + Output/Semantic guard. RR-03 형식만 맞는 source Unit은 거부.
- **D5:** T2의 L0→L1→fresh Grant/Bundle/Source/Release→원자 paid content/provenance/placeholder. `0220` 일반 generated_body, memory/outbox에는 유료 원문 불허.
- **D6:** RR-04의 일반 placeholder content_hash==paid-body hash 가정 제거, 보호 본문 최신 유효 후보/current rights 재열람 보안 검증.

### 감사 종결 조건

**완료:** 원본 1090/1080/1220/0220과 비공개 1740~1790의 잠금 진입·행 잠금 순서를 확인해 P0 잠금 공백을 기록했고, D1 **읽기 전용 공통 원시 함수 + 경쟁 시험**을 신설했다.

**미완료/금지:** 다중 영향 Product 정렬, 운영 모든 Writer의 통일 Cutover, 환불 미결속·복구, RR-03 source manifest 및 보호 원문, RR-04 follow-up, Commerce/Legal/Privacy/DB Owner 승인, 운영 #1941 복원. 모든 비공개 후보 및 본 문서는 병합·운영 공개 HOLD.

## 4. D1 확장 — 다중 Product / Reading×Reader Lockset (2026-10-12)

**추가 구현:** `1810_official_reader_ordered_multi_scope_lockset_private_v1.sql`

- `internal_acquire_official_reader_product_lockset_v1(subject, products[])`: 중복 UUID 제거·최대 64개·실존 `standard_reading_product_specs` 확인 후 **UUID 순서대로 L0를 전부** 잠근다. 거래는 `READ COMMITTED`·canonical Subject 필수. 입력 Product 자체가 실제 구매·판매 가능·권한을 증명하는 것은 아니다. 이 함수는 **잠금만 위한 원시 함수**이다.
- `internal_acquire_official_reader_reading_lockset_v1(subject, readings[], readers[])`: 길이가 같은 Reading/Reader 쌍들을 중복 제거하고 모든 `standard_reading_official_bindings`의 **정본 Product**를 도출한다. **모든 Product L0를 먼저 오름차순 확보**, 대기 후 전체 source scope 변동을 재확인한 다음 **모든 Reading UUID×Reader text L1을 정렬해서 확보**한다. 이후 전체 mapping 재확인. 입력 Reader는 *잠금 목표*이지 현재 Grant나 Reader 상품 접근 자격이 아니다.
- Product 잠금 인자가 임의 ID여도 Product Spec 존재만 확인한다. 이를 공식 Reading 권한 결정에 사용하지 않고, 공식 Reading 경로에서는 **정본 매핑에서 유도된 Product 배열만** 사용하는 것이 핵심 경계이다.
- **최대 64개** Product / Reader pair를 지원하는 내부 상한을 둔다. 더 큰 회수 이벤트는 임의 분할로 부분 적용하지 말고 영향 집합을 범위별로 재설계하거나 DENY한다.
- 두 함수 모두 `SECURITY INVOKER`, `PUBLIC/anon/authenticated/service_role/API/Commerce/Chat Runtime` 직접 EXECUTE 없음. 구매권 발급·회수·T2·진짜 상담 답변 저장에 연결하지 않았다.

### 독립 PostgreSQL 경합 실증

`test/db/official_reader_multi_scope_lockset_three_session.sh`를 `run_authority_core.sh`에 등록한다.

1. 동일 Subject에 실존하는 Standard Product 2개를 사용하는 **세 연결 A/B/C**: A는 `[높은 Product, 낮은 Product]` 역순 요청으로 두 L0를 보유; B는 정순, C는 역순 요청. B/C가 실제 `pg_stat_activity + pg_locks`에서 advisory lock 대기하며 A COMMIT 이후 각각 완료하는지 검사.
2. 동일 공식 Reading에 두 Reader의 L1을 거꾸로 요청하는 또 다른 세 연결: A/B/C가 모두 기존 정본 Product L0를 선행하고, 쌍 중복을 제거해 정렬한 L1을 보유하는지 검사.
3. 유효하지 않은 UUID·NULL Product·배열 길이 불일치·존재하지 않는 Reading·공백 Reader·다른 Subject·오래된 Snapshot·런타임 role EXECUTE는 거부.
4. 앞선 검사 통과는 **검사 범위 내 동시 실행에서 교착 없었음**을 뜻한다. Postgres 자체의 교착 가능성이 전역적으로 0이라는 수학적 주장이나 이미 운영 중인 직접 Writer의 안전성을 뜻하지 않는다.

### 남은 Cutover 항목

기존 `1080/1090/1220/0220` 및 `1750/1760/1770/1780/1790`은 아직 이 1810 진입점을 호출하지 않는다. Verified Provider 이벤트에 의해 실제 영향을 받는 모든 Product/Reader/Reading 집합을 추출하는 **read-only resolver**, 그리고 L0/L1 잠금 후 **이 집합이 변화하지 않았는지 보장하는 전체 Commerce 연결**이 필요하다. 신규 Grant Insert phantom/미결속 최초 회수와 T2 원자 저장은 별도 D2/D3/D5 검증·승인 범위이다.

## 5. D2 비공개 Writer 참여 후보 — 1820 (2026-10-13)

| 신규 진입점 | 최초 잠금 | 기존 원본 호출 | 뒤따르는 검사 | 미전환 우회 |
| --- | --- | --- | --- | --- |
| `internal_apply_official_reader_unified_receipt_v1` | verified Receipt/Intent의 Product 정본 L0 → 추가 구매에만 L1 | 원본 `1090` (Receipt→Grant/ledger/outbox) | Receipt↔Intent↔Offer 및 Role/Product/Reading/Reader 범위 전후 일치 | 원본 `1090` 직접 호출, `1760/1790` 이전 wrapper |
| `internal_cmd_bind_official_reader_unified_v1` | verified Intent L0 → 추가 구매에만 L1 | 원본 `1220` (Intent→Grant→Birth→Reading/access) | Reader·Bundle·Role·Reading identity와 newly bound Birth Revision | 원본 `1220` 직접 호출, `1760/1790` 이전 wrapper |

**역순 금지:** Wrapper 외부 호출자가 이미 Commerce/Grant/Birth/Chat 행을 잠근 다음 D2 함수에 진입해서는 안 된다. D2 신규 함수는 `SECURITY INVOKER` + 명시적 EXECUTE DENY이고 원본 SQL/Commerce CAS나 권한 허가를 변경하지 않는다. 선행 D1 scope는 lock target일 뿐 active grant가 아니다.

**검증 게이트:** `test/db/official_reader_d2_unified_issue_bind_three_session.sh`는 최초 긍정 issuance/bind, 추가 bind, source-owned scope, 3세션 Product L0 wait와 Reader replay, final row-state 보존을 검사한다. *최신 CI 결과는 각 PR exact SHA로 확인하고 이 문서의 설계 기록과 구분해야 한다.*

**여전히 P0:** Commerce `1080` 및 기존 `1090/1220/1760/1790` 외부 직접 Writer의 전환 미완료. 따라서 concurrent new-Grant INSERT phantom과 verified refund ↔ issue/bind 전역 linearization은 아직 승인할 수 없다. D3에서 전 영향 Product 정렬 L0→L1, 미결속 Grant revoke-before-bind, Provider normalized cancellation/restore를 구현·검증할 것. RR-03 source-owned proof, D5 보호 원문 원자 T2, #1941 복구·상품/결제/보안·법무 승인은 별도.

### D2 최종 CI 확정 (2026-10-13)

PR #2024의 코드 SHA `ea2503e502faac8e659785d22878ab7497975237`, CI run `38333789245`: PostgreSQL15 DB Authority Core / PostgreSQL17 / Content / Work Track / CI Verify PASS. Governance 및 Web PR Domain Gates PASS. 1820 PRIVATE 발급·결속 Wrapper의 신규 독립 Grant INSERT 및 Reader replay의 동일 Product 경합을 별도 PostgreSQL 연결로 검사. **1080/1090/1220 직접 Writer 통합 전환 및 D3 Provider 취소 처리 완료를 의미하지 않음.**

## 6. D3a Verified cancellation 통합 후보 — 1830 (2026-10-13)

기존 `1770`은 기결속 범위의 **L1만** 획득했고 첫 Grant 결속 전 취소를 거절했다. `1780`은 이 1770에 직접 위임하는 미배포 비공개 bridge이므로 완전한 L0→L1 writer 전환이 아니다.

신규 `1830`의 `internal_apply_official_reader_verified_cancel_scope_v2`는 verified provider+production receipt+purchase Grant→정본 Product를 선조회하고 *행 잠금 없이* bound scope 전체를 조사하여, 하나의 Product에 모두 속함을 증명하면 Product L0 **먼저** 취득한다. 실제 bound Reader가 존재하면 그 다음 정렬된 Reading×Reader L1 전체를 잠근다. 최초 Grant 미결속이면 L1을 임의 생성하지 않고 L0만 사용한다. L0/L1 대기 후 연결 범위를 재검증하고 원본 `1080` effect를 호출한다. Unbound 단계에서는 환불 이후 `1220` 신규 공식 사주 생성이 active Grant를 찾지 못해야 한다.

신규 dormant bridge `internal_execute_official_reader_verified_cancel_v2`는 DB-owned verified cancellation에 한정하고 Subject context를 복원한다. **변경되지 않은 구 함수 직접 호출, 미검증 PortOne payload, 복구·부분 취소·다중 Product 영향 집합, D5 T2·Source Proof**는 여전히 P0 차단이며 외부 cutover 미실시. 테스트/CI의 exact SHA를 확인한 이후 결과를 기록해야 한다.

### D3a 검증 종료 — 비공개 구현만 (2026-10-13)

PR #2028 HEAD 코드 `0146a2de2db2a6437cf2b61f93dc8dcbeab20533`, CI `38336400038`: PostgreSQL 15 Core/17/Content/Work Track/CI Verify, Governance, Web PR Domain Gates PASS. 경합 로그에서 기결속 Provider-first/Reader-first 양방향 대기 및 revoked 접근 차단, 최초 Reading 결속 전 환불의 Product L0 실제 대기와 원본 Grant/Event atomic COMMIT, 이후 bind deny를 확인했다. **기존 1080/1770/1780 직접 caller 전환 또는 PortOne cancellation ingress 연결 증거는 아니다.**

## 7. D3b 여러 Receipt/Grant를 아우르는 verified 영향 lockset (2026-10-13)

`1840`의 read-only impact resolver가 서버 검증된 Provider Event/production Receipt/Intent/Offer/Grant에서 정렬된 전체 영향 Product, Reading/Reader를 계산한다. 누락 Grant, 중복·위조 Pair, 다른 Product official Reading 결속, 다른 Subject, READ COMMITTED 위반은 거부한다. Lockset entry는 원본 Commerce event/Grant 행 잠금 **전에** 모든 Product L0를 정렬 취득하고, D1의 정본 Product 재확인을 경유하여 모든 L1을 정렬 취득한다. 대기 후 authority snapshot 불일치 시 오류/rollback. 전역 잠금 계약의 좁은 비공개 원시 기능이며 운영 인입/권한 변이/partial cancellation/restore가 아니다.

**반드시 구분:** 기존 `1830`은 정확한 단일 verified Event↔Grant cancel effect만 수행하며 신규 `1840`은 영향 집합 및 잠금만 수행한다. 외부 webhook/callback·admin·repair·reconciliation·legacy 1080 직접 Writer는 이 lockset에 자동으로 참여하지 않는다. D3b CI 결과는 exact SHA로 확인 후 기록한다.

### D3b PG15/17 검증 증거 (2026-10-13)

PR #2031 code SHA `352791b5c176f3144a13a63e426c2f5300dec01b`, CI run `38337875997` 전체 PASS. PostgreSQL15 로그: verified Event 2건→Receipt→독립 Grant 2개를 완전한 source-owned scope로 도출, cross-source/중복/비인가/오래된 격리 거부, 3개 실제 연결에서 순서가 뒤집힌 event/grant 쌍의 **Product L0 advisory lock wait** 관측 및 terminal Grant 상태 불변. D3b의 1840은 **원본 1080을 실행하지 않는다**. Cross-Product Commerce effect/partial cancel/restore 및 현재 PortOne 서버의 authenticated non-Paid `ignored` 경로는 계속 P0 통합 차단이다.

## 8. D3c 실제 Commerce 1080 원자효과 및 legacy direct-Writer 우회 지도 (2026-10-13)

- **1850 PRIVATE:** trusted verified Event↔Receipt↔Grant full-set resolver `1840` → 전체 Product 정렬 L0 → 전체 Reading×Reader 정렬 L1 → Grant ID 정렬 `1080` original effect를 한 SQL Statement에 실행. 모든 효과는 새 immutable `entitlement_events` 행 필요, 하나라도 CAS 실패 시 전부 ROLLBACK. `1080`의 자체 Provider row lock과 Grant row lock은 L0/L1 다음에만 얻는다.
- **Legacy 직접 효과** `1080`: Commerce Event FOR UPDATE, Grant FOR UPDATE, revision/order CAS, Event INSERT, Entitlement projection, Outbox. 직접 호출에 Product L0·Reader L1 없음.
- **Legacy 발급/결속** `1090`: Receipt FOR UPDATE→`1080`; `1220`: Intent FOR UPDATE→Grant FOR UPDATE→Birth→Official binding. 1760·1790 wrapper 또는 원본 호출이 상존하여 1820을 전면 적용하지 않음.
- **Legacy 환불/조회** `1770`: L1-only, unbound 불가. `1780`: 1770 dormant bridge. `1750`: L1-only runtime read. `0220`: 일반 Thread/Turn/Attempt 행 잠금, paid T2 전용 보호 본문 미분리.
- **현재 PortOne/Webhook 런타임** `apps/api/src/portone-v2-webhook-payment-completion.ts`: 서명 검증→비 Paid 타입 ignored, `portone-v2-webhook-runtime.ts`는 Paid-only path. `commerce-provider-payment-completion-orchestration.ts`: API 조회→Verified payment evidence persistence. `postgres-commerce-internal-execution.ts`: `SET LOCAL ROLE myeongha_commerce_internal_executor`로 BEGIN/COMMIT하나 신규 1850 호출/EXECUTE 권한 없음.
- **최소 권한/정책:** D3c 새 함수는 PUBLIC, anon, authenticated, service_role, API/Commerce/Chat executor 실행권을 거부. 고위 DB Owner 후보 검증 외 구 Writer를 변경하지 않았다. 부분 환불 판단/Provider status ordering/환불 완료 시각/승인 주체·Legal 제공 판단은 본 코드가 단독 결정하지 못한다. Live ingress를 연결하거나 legacy 직접 Writer를 유지하면서 전역 lock 통일 완료로 판정하지 않는다.
- **실행 및 비교 기준:** `test/db/official_reader_d3c_verified_cancel_atomic_batch.sh` isolated 2-Grant second-CAS failure rollback→성공 2-event atomic commit→terminal retry deny를 PostgreSQL15와 PG17/Content CI에서 검증할 것. 미완료면 HOLD.

### D3c 1080 다중 Grant 원자효과 최종 증거 (2026-10-13)

PR #2034 SHA `99fa0bda9c0759fcccaf309fbc6cd3704190bc62` CI run `38339438218`: PostgreSQL15 Core·PG17·Content·Work Track·CI Verify·Governance·Web Gate PASS. DB 로그에서 **두 번째 정렬 Grant의 CAS 실패→첫 번째 상태·revision·불변 이벤트 완전 롤백**, 정상 배치 Grant 2개 회수→Event 2개 COMMIT, terminal replay DENY, runtime/Commerce EXECUTE DENY를 확인. 본 결과는 1850 PRIVATE 신규 경로만 증명하며 1080/1090/1220/1760/1770/1780/1790 직접 호출자 및 current PortOne `Transaction.Paid` 외 `ignored` 콜백의 L0→L1 참여 또는 운영 취소 진실성을 증명하지 않는다.

## 9. D3e2 PortOne Cancellation Shadow와 Writer 안전 경계 (2026-10-13)

새 `1860` 원장은 구매권 또는 환불 Writer가 아니라 verified PortOne candidate 정보를 위한 **별도 비공개 observation ledger**다. 동일 거래별 advisory lock 획득 후 immutable append, webhook identity replay/collision 및 event timestamp 역행 기록을 수행하며 1080 Entitlement Grant/Event/Projection/Outbox, D3b L0→L1, D3c 1850 호출에는 영향을 주지 않는다. 신규 테이블 public RLS=true + anon/authenticated/service_role/API/Commerce/Chat SELECT 및 함수 EXECUTE REVOKE. 운영 webhook path·사후 Settlement·Legal 승인·권한 있는 최소 actor를 추가하고 검증하기 전에는 shadow만으로 `full cancellation` 승인이나 사용자 Reader T2 공개 차단을 수행하지 않는다.

### D3e2 영속 역순 / RLS / 실제 2세션 최종 증거 (2026-10-13)

PR #2039 코드 SHA `4616d336f08a4f827dab516cdc278bd0d65a06f6` 검증 CI [38344545761](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38344545761) PG15/PG17/Content/Work Track/CI Verify PASS, Governance 및 Web Gate PASS. PostgreSQL 15 로그에서 동일 Webhook replay와 상충 데이터 거부, 역순 부분취소 분류, 가짜 full 차단, RLS/runtime ACL 거부, **두 독립 PostgreSQL 세션의 advisory 동일 Payment 대기/직렬 관측**, Entitlement effect 0을 모두 PASS 확인. 스키마 카탈로그 87 tables SHA `4273d61d1c244a44c116abad5a0b45f1b0035a2e8c774644441e05ddf74ca525`.

남은 HOLD: PortOne 실제 verified cancellation → source-owned original Receipt/Offer/Grant/Legal approval → 별도 권한의 Commerce Worker → 기존 1080 CAS/1850 L0→L1 원자 일괄 효과, 구 Writer 직접 경로 차단과 T2. 이 Shadow 기록 자체는 결제 취소 발생·법적 환불 승인·Entitlement 권한 회수의 증거가 아님.
