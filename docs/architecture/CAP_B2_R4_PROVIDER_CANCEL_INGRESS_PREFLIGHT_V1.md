# CAP-B2/R4 — Provider Cancellation 공통 잠금·트랜잭션 계약 및 운영 연결 전 차단표 v1

> 2026-10-14 · Watchtower-Track: applizing · **소스 감사 + 격리 검증 계약만. R3 운영 Writer cutover HOLD.**

## 1. 실제 운영 호출 경로와 빈 연결부

| 경로 | 현재 실제 소스 또는 DB | 확인된 처리 | 운영 연결 전 차단 조건/소유자 |
|---|---|---|---|
| P1 PortOne V2 웹훅 | `apps/api/src/portone-v2-webhook-runtime.ts` → `portone-v2-webhook-http.ts` → `portone-v2-webhook-payment-completion.ts` | 서명·유효 이벤트 검사 뒤 **`Transaction.Paid`만** `executeAuthenticatedCommerceProviderPaymentCompletionV1`로 보냄. 그 밖의 이벤트는 `kind:'ignored'`. **취소/환불 이벤트 Writer 없음** | Provider + Commerce: 정식 cancellation event authenticate/verify, replay, event ordering/latency 계약 없으면 활성화 금지 |
| P2 Provider 결제 완료 오케스트레이션 | `commerce-provider-payment-completion-orchestration.ts` → `commerce-payment-verification-execution.ts` → `commerce-verified-payment-evidence-persistence.ts` | DB 소유 Payment Attempt/Intent Product·금액 문맥 → provider 검증 → 별도 DB 트랜잭션 `cmd_persist_verified_payment_evidence_v1` | provider verification와 DB 저장 사이 변경 재검증. 아래 P4 취소 CAS와 **같은 트랜잭션이라는 증거 없음** |
| P3 최초 Paid Receipt 저장 | `supabase/migrations/1050_commerce_verified_payment_evidence_persistence.sql` | 초기 verified persistence는 `p_current_state='active'`만 허용. Receipt/Provider Event 저장과 replay를 관리하나 **취소 효과 함수 호출 근거 아님** | Receipt→purchase pin→Scope/Grant row 권한 및 event-first cancellation 포함 다중 Writer 순서 계약 필요 |
| P4 기존 Commerce Effect | `1080_entitlement_effect_apply_v1.sql` | Provider Event/Grant CAS: expected revision 및 provider ordering 비교, 원장·projection·outbox 원자 처리 | 시간/ordering 정규화 및 stale CAS 실패 때 새 이벤트만 남기지 않는 트랜잭션 원자성 필요 |
| P5 미연결 R2 초기 cancellation private | `1850_standard_reader_initial_verified_refund_private_v1.sql` | exact verified production Event/Receipt/Grant lineage 확인 → R1/S3 lock → bound Reader는 S2 추가 → 기존 1080 Commerce Effect. READ COMMITTED 요구 | **공개 EXECUTE 금지**. Provider Event 자체가 S3 lock 취득 후 VERIFIED로 영속화돼야 event-first 누락 방지 |
| P6 미연결 R2 초기 Receipt issuer private | `1860_standard_reader_initial_receipt_cancel_guard_private_v1.sql` → `1830_standard_reader_initial_receipt_locked_private_v1.sql` | R1 immutable scope pin으로 S3 lock, 취소 이벤트 존재 시 발급 DENY; 없으면 기존 Commerce 발급 | 모든 verified event 저장 Writer가 S3에 참여하지 않으면 event-after-check 경합 안전성 보장 불가 |
| P7 Paid Reading/R5 T2 | R3 문서 C4/C9; `official-reader-held-t1-t2-preflight-v1.ts` | 기존 유료 공개 사전 검증 HOLD | Reader 접근은 immutable Binding만으로 허가 불가; current Grant·Product·Content 새 잠금 증거와 Owner 승인이 필요 |

## 2. 최초 구매 cancellation의 제안된 논리적 트랜잭션 계약

**운영 승인 전의 필수 조건**이며 이미 구현된 호출 경로라고 주장하지 않습니다.

1. **웹훅 인증·Provider 사실 검증**: 서명, event type, environment, external transaction, original transaction, event identity, provider ordering, 중복 재전송을 서버 측에서 검증. 사용자 전달 Subject/Grant/Reader ID를 신뢰하지 않음. 불완전하거나 비검증 event는 `DENY`; 단순 `ignored` 반환을 취소 처리 성공으로 취급 금지.
2. **동일 구매 범위 산정**: 서버 권위 Receipt·Purchase Intent·R1 immutable checkout pin으로 `scope_identity`와 Subject를 **읽기 전용**으로 복원. 최초 Reading 이전에는 S3/R1 잠금, binding 이후 S2가 필요할 수 있음. Receipt/Grant `FOR UPDATE`보다 먼저 S3를 획득하고 READ COMMITTED로 대기 후 재조회.
3. **한 DB 트랜잭션에서만 검증 완료를 확정**: event identity dedupe→검증 상태 `verified` 저장→exact Receipt/Grant 재조회→`1850` private cancellation CAS(기존 `1080`)→Grant revision/ledger/projection/outbox COMMIT을 원자화. 외부 Provider HTTP 조회/서명 API 호출은 DB 락 트랜잭션에 포함하지 않음.
4. **Grant가 아직 없는 event-first 취소**: `1850`은 no-Grant 정산이 불가능. R1/S3 아래 verified event 선커밋 후 `1860` issuance gate가 이를 읽어 새 Grant를 발급하지 못해야 함. provider cancel 기록의 운영 멱등/재처리 정책은 Commerce 소유자 승인 전 미확정.
5. **서로 다른 순서의 직렬화**: (a) Event FIRST→`1860` DENY (기존 PG15 R2 synthetic test), (b) Issuer FIRST→cooperating event writer S3 WAIT→`1850` CAS revoke (R4 PG15/17 synthetic). 양쪽의 잠금 순서와 transaction-safe retry를 **실제 운영 Writer에 연결한 증거는 아직 없음**.

## 3. 차단해야 하는 검증/권한/실패 조건

| 분류 | 차단·원자성 규칙 | 검증/잔여 |
|---|---|---|
| Provider status | `received`/미검증, sandbox, `payment.cancelled` 아닌 유형 | 신규 PG15/17 negative |
| Provider lineage | `resolution_source_type!='receipt'`, wrong external transaction, 다른 Receipt/Subject/Grant | 신규 PG15/17 negative (일부 wrong-Receipt 유형은 기존 FK/Lineage 테스트와 중복) |
| CAS/replay | stale Grant revision/provider ordering은 원본 Commerce `internal_entitlement_effect_cas_mismatch` 거부; 재조회/ordering 재결정 필요 | 신규 PG15/17 stale revision negative; **실 Provider ordering convergence는 미증명** |
| context/isolation | caller-injected Subject mismatch, REPEATABLE READ는 거부 | 신규 PG15/17 negative |
| DB 실패 | event 저장과 CAS 같은 트랜잭션에서 CAS 실패 시 해당 event 포함 전부 rollback | 신규 PG15/17 **합성 원자성**; 현재 operating event ingress에 자동 적용 안 됨 |
| 권한 | `1850`, `1860` PRIVATE, runtime/API/Commerce roles EXECUTE 없음 | PG role ACL·Work Track 정적 guard |
| 권한 유출 | revocation 뒤 최초 Reader/Reading 새 발급/Access 금지, current paid T2 공개 불가 | 기존 R2·R4 DB 분기 증거, R5 운영 최종 응답/stream 미증명 |

## 4. 실행 등록·판정

- 격리 DB: `test/db/standard_reader_r4_b13_provider_cancel_contract_denials_real_pg.sh`, PG15 `run_authority_core.sh`, PG17 `cap-b2-r4-provider-cancel-denials`. **실제 1850 함수 + 1080 CAS** 호출, provider event는 테스트용 synthetic verified flag.
- 소스 회귀: `tests/cap-b2-r4-provider-cancel-operating-ingress-hold.test.ts`에서 PortOne Paid-only 라우팅, 최초 결제 active-only persistence 및 private cancellation ACL 경계 검사.
- Suite manifest: **44 total / 41 unique**. **정확한 HEAD의 CI와 개별 PG15/17 PASS를 확인하기 전에는 증명 완료로 기록하지 않음.**
- 원본 R3 `docs/architecture/CAP_B2_R3_OPERATIONAL_WRITER_CUTOVER_CONTRACT_V1.md` C2/C3/C6 및 G1–G4 HOLD 우선. Privacy P0-PR-01 canonical 140-edge vs 1840 FK / DR 1400–1450 불일치 해결은 **권한 있는 Owner의 별도 결정**, 임의 재해시/우회 금지. PR #2041 Draft·미병합.

**결론:** Verified Cancellation의 최초 운영 ingress, R1/S3 lock을 취득하는 Provider Event 저장 Writer 및 1850 CAS의 원자적 접속은 **미구현/미승인**입니다. 현재 확보 가능한 증거는 DB PRIVATE 함수를 호출하는 결정론적 negative/concurrency 경계에 국한됩니다.

## 5. 검증 기록 갱신 및 동일 취소 이벤트 재전송 계약 (2026-10-14)

- [PR #2041 HEAD `acf25309` CI #38521923071](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38521923071): **PostgreSQL15 Authority Core·PostgreSQL17 명시 사례·Work Track 모두 SUCCESS**, Web PR Domain Gates SUCCESS. 이 검증의 개별 실DB PASS는 **원본 0930 DB trigger가 sandbox/manual resolution/거래 계보 위반 이벤트를 INSERT 단계에서 거부**하고, 그 밖의 `received`/wrong type/foreign Grant/forged Subject/READ COMMITTED 요구/낡은 CAS를 **1850 private effect가 거부**함을 분리해 확인한 결과입니다. 서로 다른 계층의 거부를 모두 1850 증거로 표기하지 마십시오.
- 신규 `test/db/standard_reader_r4_b13_cancel_replay_semantics_real_pg.sh`: 이미 verified-flag 합성 취소 이벤트로 한 번 `1850→1080` CAS한 후 **같은 원본 Event ID + 동일 효과 시각/Reason/원 Grant 이력**으로 재시도. `result_replayed=true`와 같은 원장 이벤트 UUID, Grant revision/provider-order/원장/Outbox 불변을 요구. 동일 Event ID에 다른 Reason을 부여하면 `internal_entitlement_effect_source_semantic_conflict`로 DENY, 별도 Event 행으로 중복 `provider + external_event_id`를 삽입하면 기존 유니크 제약에서 DENY. 폐기된 구매가 Reader Access를 생성하지 않아야 함. **이 신규 사례는 exact HEAD의 PG15·PG17 CI 전에는 PASS 미선언**.
- Suite `45 cases / 42 unique`. 이는 **원본 이벤트의 정확한 멱등성**과 영속성 불변에 대한 검증이며, **서로 다른 Provider 이벤트의 시간순/ordering-key 우선순위 정책을 입증하지 않음**. `1080`은 기대 revision/order를 CAS하고 exact source replay를 확인하지만, `provider_ordering_key`의 의미적 비교·최신성 판단은 호출자 계약으로 남습니다.
- 여전히 P1–P7 운영 연결·Provider 검증 서명·실환불·R3 cutover·R5 paid 공개는 HOLD. 별도 Privacy Governance 불일치 해결 전 production migration 및 공개 EXECUTE 금지.
