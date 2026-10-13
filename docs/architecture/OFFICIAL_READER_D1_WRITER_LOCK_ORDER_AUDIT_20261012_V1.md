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
