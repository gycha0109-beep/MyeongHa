# CAP-B2/R3 — 운영 Writer 공통 잠금 Cutover 계약 및 소유자 승인 매트릭스 v1

> 2026-10-14 · Watchtower-Track: applizing · **설계/검증 핸드오프만 수행, 운영 Cutover 금지**

## 0. 범위와 판정

이 문서는 `docs/architecture/CAP_B2_R4_STATUS_V1.md`의 개별 실DB PASS를 운영 Writer 통합 승인으로 확대하지 않기 위한 **실제 저장소 소스 기반 점검표**입니다. 승인 전까지 PR #2041은 Draft/unmerged이고, 최초 Reading/추가 Reader 유료 결속·PG 콜백·환불·T2 공개 경로를 private 1740–1860으로 전환하지 않습니다. **R3 운영 연동은 HOLD**입니다. 공개 API·DB EXECUTE 확대, 새 checkout, 실제 Provider 호출은 본 문서의 산출물이 아닙니다.

## 1. 실제 운영 진입점 → 필요한 전환 계약

| Lane | 현재 소스/DB 호출 (확인된 사실) | 전환 전 반드시 입증할 계약 | 책임 및 상태 |
|---|---|---|---|
| C1 최초 Purchase Intent | `apps/api/src/postgres-standard-reading-purchase-intent-v4.ts` → `public.cmd_create_standard_reading_purchase_intent_v4` | DB 확정 Subject/Product/Birth/Source 및 Reader 선택으로 **동일 트랜잭션**에서 1840 immutable initial purchase pin 캡처. S3 초기 Scope, Product 정책 잠금이 최초 Intent 생성·pin 불변성까지 직렬화. replay/실패는 orphan pin·Intent 0 | DB + Commerce + Product **HOLD** |
| C2 Provider 인증/검증·evidence 영속화 | `apps/api/src/commerce-provider-payment-completion-orchestration.ts`, `commerce-subject-payment-completion-orchestration.ts` → `commerce-verified-payment-evidence-persistence.ts` → `public.cmd_persist_verified_payment_evidence_v1`; Webhook은 `portone-v2-webhook-payment-completion.ts` | 검증된 server-owned event/receipt→purchase pin으로 Scope를 **row lock 전에** 확정. provider verify/replay/환불 이벤트 순서, 중복 webhook, no-Grant event-first cancellation을 같은 lock/DB-CAS·ledger에서 검증. 인증된 ingress ≠ Reader 유료 접근 승인 | Commerce + DB + Provider **HOLD** |
| C3 초기 verified Receipt→Grant | staged `1830 internal_apply_initial_official_reader_receipt_locked_v1`, `1860 internal_apply_b2_r2_initial_receipt_cancel_guarded_private_v1` 존재; 운영 ingress 미접속 | C1 pin을 근거로 S3→Product→기존 Receipt/Grant row 순서, DB wall-clock, 부정 상태 no Grant, event-first cancel/replay 2세션 검증. 결제 증거와 Entitlement effect는 **원자적**이어야 함 | DB + Commerce **HOLD** |
| C4 첫 Standard Reader 결속 | `apps/api/src/postgres-standard-reading-access-bind-v2.ts` → `public.cmd_bind_standard_reading_access_v2`; staged `1820 internal_cmd_bind_standard_reader_initial_policy_locked_v1`는 별도 | **초기 Scope를 DB provenance에서** 재계산하고 S3→Product→row locks; 승인 Standard Rule·정확한 Reader/Release/Unlock·현재 verified Receipt/Grant·committed Saju Source 확인. idempotent replay=이력만, **현행 권한**으로 재사용 금지. 최초 Official Reading 한 건 | DB + Reader + Product/Saju **HOLD** |
| C5 추가 Reader Receipt/결속 | staged `1760 internal_apply_additional_official_reader_receipt_locked_v1`, `1800 internal_cmd_bind_standard_reader_additional_policy_locked_v1` | committed Official Reading의 정확한 Reader scope S2→Product→row locks, 별도 verified Intent/Receipt/Grant, bundle/cardinality, Birth/Saju domain revision drift, 삭제/취소 경합, 정렬된 복수 key. 기존 1220 운영 추가 Binder 그대로라면 우회가 남음 | DB + Commerce + Reader **HOLD** |
| C6 Provider revoke/expire/refund | staged `1770 internal_apply_official_reader_provider_revoke_locked_v1`, `1780 internal_execute_official_reader_verified_provider_revoke_v1`, `1850 internal_execute_b2_r2_initial_verified_cancel_effect_private_v1` | validated event sequence/receipt provenance/subject, 초기 unbound에는 S3; bound Reader에는 S2. 동시 발급·재구매·복수 Grant의 CAS + entitlement ledger + projection 원자성. **영 권한 event-first refund**를 포함한 실제 Provider 경로 증빙 | Commerce + DB **HOLD** |
| C7 레거시 1170 | `apps/api/src/postgres-standard-reading-unit-bind-v1.ts` → `public.cmd_bind_standard_reading_unit_v1` | 1170 구매/Binding을 공식 v2 Source/Grant로 자동 승격 금지; 운영 분기·이력 보존·멱등성 검토. R4/BIND-21은 **실DB 기록 격리만 검증**, cutover 아님 | Reader + DB/Privacy **HOLD** |
| C8 Content·Product 변경 | `0980 cmd_activate_content_release_v1`는 자체 Content lifecycle advisory lock; `1790/1810` Product 승인 철회는 Product-wide lock 트리거 | Content retire/default switch/Unlock/Reader publish 정책을 C4/C5/T2의 **정확한 Reader 범위**와 직렬화할 Writer 참여 계약; 기존 Content 단독 lifecycle lock은 S2/S3 Reader lock 참여 증명이 **아님** | Content + Product + DB **HOLD** |
| C9 T1→T2 최종 보호 본문 | `apps/api/src/official-reader-held-t1-t2-preflight-v1.ts`는 T1 commit → private generation → T2 새 DB admission, 결과는 `publicDisclosureAuthorized:false` | T2 **실제 공통 Reader scope lock** + 새 DB 시간과 verified Receipt/current Grant/Product Rule/Release/Unlock/Thread/Source/Bundle cardinality를 단일 DB 트랜잭션에서 재검증. 원자적 보호 본문 저장·commit/send 순서. 출력 유출·로그·에러·stream 캐시 차단 및 rollback negative. 전부 승인 전 공개 **금지** | Reader + DB + Commerce + Content + Security/Privacy **HOLD** |

## 2. 공통 락·가시성 계약

1. **READ COMMITTED + DB-provenance scope**. 사용자 제공 Reading/Reader UUID만으로 잠금 범위 선택 금지. 첫 Reading이 없을 때는 C1의 pin을 기반으로 S3 `internal_acquire_official_reader_initial_purchase_lock_v1`; 이미 committed Official Reading이 있을 때는 S2 `internal_acquire_official_reader_scope_lock_v1`. 잠금 후 `clock_timestamp()`와 **새 statement snapshot** 재평가.
2. **예상 lock order**: server-derived S3/S2 Reader scope → Product-wide 승인 정책 → Purchase Intent/verified Receipt/Entitlement Grant/Birth/Reader projection row. 다중 Reader는 정렬·재진입 순서 명시. 모든 소비자가 **동일 순서**를 지켜야 하며 개별 PG 테스트 통과로 전역 무교착 인증 불가.
3. **출시 직전 권한 원본**은 current verified Receipt, active exact Grant, purchase-specific Reader/Bundle, committed Official Source, current Product rule revision, Content Release/Unlock, Subject lineage, fresh Thread revision. `replayed=true`, 오래된 T1 ticket, 원본 Bundle 2개 current는 허가가 아닌 **DENY/HOLD**.
4. **성공 판정 단위**는 함수 내부 단독 테스트가 아니라 `HTTP ingress → authenticated verification → one transaction → DB effect/outbox → event replay/refund → protected response` 전 경로에서 2-connection 교착/취소/순서 뒤집힘까지 재현한 **exact HEAD** evidence.

## 3. 확인된 부분 증거 (운영 승인 아님)

- **R4/BIND-13·16·17·18·19·20·21·23–27·29**의 검증 상세/미실증 범위는 `CAP_B2_R4_STATUS_V1.md`가 정본. 특히 BIND-18의 두 valid current Bundle 충돌은 PG15/17에서 잠금 조회 `ambiguous_bundles`로 DENY, 앱 API/T1→T2 비공개 회귀 PASS ([CI #38505790959](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38505790959)).
- R3 정적 ingress **HOLD 검증** `scripts/verify-cap-b2-runtime-writer-ingress-hold.mjs`는 알려진 옛 호출을 식별하고 private 호출 금지를 검증하는 **부분 정적 관측**입니다. 동적 JavaScript/HTTP/DB 전체 call graph 또는 실제 Writer 동기화 증명이 아닙니다.
- BIND-29에서 검증하는 **합성 Content Writer의 Reader 잠금 수동 참여**와 실제 `cmd_activate_content_release_v1` 호출은 Content 운영 Writer가 S2/S3를 자동 취득한다는 의미가 아닙니다.
- **Privacy Governance**: 1840 새 FK와 승인된 P0-PR-01 140-edge graphRef canonical mismatch. Privacy 승인 변경이나 graph fingerprint 재작성 금지; DR 1400–1450 실복구 검증 전 production migration 불가.

## 4. 책임자 결재/종료 기준

| Gate | 필요한 책임자 산출물 | 충족 전 금지 |
|---|---|---|
| G1 DB/Commerce Writer | 상기 C1–C7 전 경로 트랜잭션·CAS 계약, exact 함수 시그니처, 모든 Provider ingress/legacy cutover·replay 및 rollback 증거 | 운영 구매/영수증/Grant/환불 Writer 전환 |
| G2 Product/Reader/Content/Saju | Reader×domain 승인표, Content retire/default/Unlock 경합, 현재 권한과 공식 Saju Source/Reader body 버전 정합성, T2 원자 저장+응답 동의 | 공식 Standard/Premium 유료 본문 공개 |
| G3 Privacy/DR/Security | FK 삭제 disposition, 승인된 graphRef 보존/수정 절차, DR 1400–1450 실제 복구와 삭제/병합 권한 경계, 누출/로그 통제 증거 | 운영 DB 이행·공개 SQL EXECUTE·T2 release |
| G4 Release/QA | 위 G1–G3 승인 기록 + all-writer exact-HEAD CI, PG15/17 DB 경합, 실제 HTTP 결제/webhook/refund/최종 T2 negative, PR 병합 전략 | PR merge 및 서비스 출시 |

**판정:** 현재 G1–G4 모두 HOLD. 검증 코드·문서 작성 가능, **운영 활성화/무승인 병합/기존 승인 Privacy 계약 대체 불가**.
