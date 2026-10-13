# CAP-B2/R3 — Writer lock-order 통합 감사·경합 검증 PRIVATE 초안

> 2026-10-13 · Watchtower-Track: applizing · STATUS: **R3 PARTIAL, Draft, NO CUTOVER**

## 1. 신규 확인된 통합 경계

최초 Reader 구매의 공유 자물쇠는 Subject/Product/Birth/spec을 인코딩한 1810 scope identity와 `hashtextextended(scope_identity,1830)`입니다. Reader가 아직 결속되지 않아도 적용됩니다. 결속 후 개별 Reader T2 보호는 별도의 1740 Reader scope key(`1827`)를 사용합니다. Product 승인/철회의 1810 coarse policy key는 `1828`입니다.

| 실제 진입 함수/경로 | 획득 순서 · 소유자 | 현재 판정 |
|---|---|---|
| 1840 최초 구매 시점 immutable pin | INITIAL(1830) → Product(1828) → Birth/Intent 검증 | Private; trusted 구매 Intent 생성 경로 미연결 |
| 1830 기존 최초 Receipt issuer | INITIAL(1830) → Product(1828) → 기존 Commerce Receipt/Grant | Private; 원본 Commerce Writer 직접 실행을 전역적으로 차단하지 못함 |
| 1860 취소 차단 최초 Receipt issuer | 역사적 INITIAL(1830) → 기존 1830 → Product → Commerce | Private; operational issuer cutover 없음 |
| 1820 최초 Binder | INITIAL(1830) → Product(1828) → Purchase/Grant/Birth row | Private; R3 양방향 Product 철회 경합 추가 |
| 1800/1760 추가 Reader Binder | Reader(1827) → Product(1828, 1800) → Purchase/Grant/Birth | Private; 초기 INITIAL key와 서로 달라 공통 단일-key 취급 금지 |
| 1760 추가 Receipt issuer | Reader(1827) → Commerce Receipt/Grant | Private; 전체 승인·철회와의 통합 필요 |
| 1770/1780 결속된 Provider revoke | 결속된 Reader scope(1827) 정렬 → Commerce Effect/CAS | Private; 초기 PRIMARY와 다른 lock namespace |
| 1850 최초 구매 취소 | 역사적 INITIAL(1830) → (Access=0) Commerce Effect, 또는 (Access>0) Reader(1827) → Commerce Effect | Private; Provider verified event ingress 미참여 |
| Product Approval/Withdrawal INSERT | trigger가 Product(1828) → 신규 규칙 기록 | Trigger 증명·실DB 경합; 승인 철회가 이미 발급된 Grant 자체를 소급 revoke한다고 주장하지 않음 |
| Content Release retire / Unlock mutation | 현재 호출/잠금 참여를 전체 검증하지 않음 | **HOLD** |
| T1 preflight / T2 Reader paid final reveal | 운영 Writer/lock caller 도달 경로 검증되지 않음 | **HOLD / NO DISCLOSURE** |
| 1220 원본 Binder / 기존 Commerce прям격 효과 Writer | R3 보호 wrapper를 호출한다고 증명되지 않음 | **LEGACY BYPASS GAP / HOLD** |

**전역 순서 초안:** 한 결제/Reading과 연결된 거래에서 *서버 유도 최초 INITIAL key → (필요한 경우) Reader scope key(Reading ID, Reader ID 고정 순서) → Product policy key → Receipt/Purchase/Grant/Birth row*를 사용하고, 조회 시 반드시 `READ COMMITTED`/잠금 후 fresh state를 적용합니다. 다만 현행 1800은 Reader→Product, 1820은 INITIAL→Product, 1850은 INITIAL→Reader→Commerce로 각 단일 호출 내에는 동작해도, **복수 Product/Scope를 한 트랜잭션에서 섞는 전역 deadlock-free 순서는 아직 증명되지 않았습니다.** 자동으로 글로벌 lock 획득 순서 PASS로 승격하지 않습니다.

## 2. 신규 R3 실DB 테스트

`test/db/standard_reader_policy_withdrawal_initial_bind_r3_real_pg.sh`를 실제 `run_authority_core.sh` PG15의 **서로 다른 격리 데이터베이스 2개**로 실행합니다.

- `policy_first`: Product withdrawal INSERT transaction A가 Product lock을 잡고 미커밋 보유. 실제 1820 최초 Binder transaction B가 같은 Product lock을 **실제 PostgreSQL pg_stat_activity Lock 대기**. 철회 COMMIT 뒤 즉시 정책을 재조회하여 Binder 거절/Access=0.
- `bind_first`: 실제 1820 Binder A가 INITIAL→Product lock 보유 중, 정책 철회 INSERT B 대기. A가 커밋한 이력은 1건 유지, B 철회 확정, 현재 approved rule 조회 0.
- `pg_get_functiondef` catalog에서 실제 최초 Binder/Receipt가 Initial→Product lock을 호출하는지, 1850/1860이 로드되었는지, 실제 BEFORE INSERT Product lock trigger 2개가 활성 상태인지 확인. 테스트 mock PASS 대체 불가.
- R2 #2032의 `refund_first`, `bind_first`, `no_grant` 세 실DB 테스트를 계승합니다.
- **실DB 경합 성공은 SQL 운영 연결, Privacy 정책, Reader Release/T2 경계의 승인 근거가 아닙니다.**

## 2.1 실행중인 코드에서 확인한 Writer 진입점 — R3 보강

- `apps/api/src/postgres-standard-reading-access-bind-v2.ts`: **원본** `public.cmd_bind_standard_reading_access_v2` 호출. 1820/1800 staged Binder에 cutover되지 않았습니다.
- `apps/api/src/postgres-standard-reading-purchase-intent-v4.ts`: **원본** `public.cmd_create_standard_reading_purchase_intent_v4` 호출. 구매 트랜잭션 내 1840 pin 원자 capture의 실제 채택 증거가 아닙니다.
- `apps/api/src/commerce-verified-payment-evidence-persistence.ts`: **원본** `public.cmd_persist_verified_payment_evidence_v1` 호출. Provider Event verified 도착 시 1810 INITIAL lock을 획득하지 않습니다.
- `apps/api/src/official-reader-held-t1-t2-preflight-v1.ts`: `R2_SCOPE_AND_FINAL_DISCLOSURE_OWNER_HOLD`; 해당 리허설이 운영 T2 긍정 허가가 되지 않도록 유지합니다.
- 신규 `scripts/verify-cap-b2-runtime-writer-ingress-hold.mjs`: `api/`, `apps/api/src/`, `packages/`의 배포 소스에서 private Writer 7개 SQL invocation/바인딩 유입을 감지하면 CI를 실패시키며 위 4가지 **known legacy/HOLD 경계**의 우발적 제거도 검출합니다. 테스트/문서/마이그레이션을 읽기 전용 서비스 경로로 오인하지 않습니다. **완전한 동적 caller reachability 분석은 아닙니다**.

## 2.2 다중 Reader Scope 결정적 잠금 테스트

- `test/db/standard_reader_multiscope_lock_order_r3_real_pg.sh`: 기존 1740의 `internal_acquire_official_reader_scope_lock_v1`을 실제 두 PostgreSQL 연결에서 동일 순서(Reader `seyeon` → `test-unlockable-reader`)로 획득합니다. B가 A의 잠금에 PostgreSQL Lock 대기 후 순서대로 이어서 성공해야 합니다.
- 기존 1770 내부 `order by a.official_reading_id, a.reader_character_id` 및 원 Commerce CAS/Effect 위임을 실제 설치된 `pg_get_functiondef`로 확인합니다. 다중 Reader lock이 **원본 Provider Effect까지 언제나 직렬화된다**고 주장하는 테스트는 아닙니다. 실제 Provider Event가 1770/1850에 유입되는 컷오버는 별도 Owner 승인 필요.
- PostgreSQL은 식별자를 최대 63바이트로 저장합니다. 1850 함수의 소스 식별자가 64바이트이므로 검증 코드에서 실제 catalog 이름 `left(name,63)`을 조회하도록 보정했습니다. 운영 정식 도입 전 Source 명칭을 63바이트 이하로 소유자 승인을 받아 정규화해야 합니다.

## 3. 보류 기준

- R1 구매시점 capture의 trusted 원자 호출, Receipt 및 Provider verified ingress의 INITIAL lock 참여, 레거시 우회 차단을 Commerce/DB Owner가 확인하기 전에는 R3 최종 PASS 선언 불가.
- Product 승인 정책 revision은 구매 당시 pin과 현재 Rule을 구별해야 합니다. 상품 철회가 자동환불·기존 Entitlement 사후 삭제를 뜻하지 않습니다.
- 1740 Reader scope를 여러 개 획득하는 Receipt와 개별 scope 결속 함수의 deterministic ordering, Content release/retire·Unlock 쓰기, T2 current rights / memory / output side effects 검증 미완.
- 1840 개인정보 FK로 P0-PR-01 승인 그래프(140 edges/59 tables)가 깨졌습니다. Owner 승인 없이 기존 정책/fingerprint 수정 금지.
- 기존 1720/1770 migration 충돌 및 Production DR, full PG15/PG17 BIND-01~29·T1/T2 UI 경로 미완. 병합, public role EXECUTE, live checkout/환불 및 paid 본문 공개 금지.

## 4. 다음 증명

1. 실제 Writer 전체 reachability(REST/server RPC/DB trigger)를 도식화한 테스트 계약 및 Legacy bypass 차단 증거.
2. 동일 INITIAL↔Reader↔Product에 걸친 multi-scope reverse lock-order concurrency, retry/serialization failure 실DB 검증.
3. Content retire/Unlock mutation과 현재 T2 권한 재검증, 정확한 PG15/17 matrix, Privacy/DB/Commerce/Reader owner gates.
