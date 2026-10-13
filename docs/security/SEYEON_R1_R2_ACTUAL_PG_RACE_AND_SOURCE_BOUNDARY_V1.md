# 세연 R1 실제 PostgreSQL 2세션 XOR / R2 실제 Attempt-Grant-모델 입력 결속 검증 v1

> Watchtower-Track: security
>
> **OFFLINE INTEGRATION / G0 OWNER APPROVAL HOLD** · 2026-10-13 · [Draft PR #1985](https://github.com/gycha0109-beep/MyeongHa/pull/1985)
>
> 이 문서는 [G0 권한 계약 제안](./SEYEON_G0_PERSONAL_SOURCE_AND_DERIVED_DISCLOSURE_CONTRACT_V1_PROPOSAL.md), [R1/R2 상위 경로·입력 인벤토리](./SEYEON_R1_R2_SOURCE_SET_AND_MODEL_INGRESS_PROOF_V1.md), [G0 D-03→G1 DB Blueprint](./SEYEON_G0_D03_G1_POSITIVE_PIN_DB_BLUEPRINT_V1_PROPOSED.md), [R0~R8 로드맵](../operations/SEYEON_G0_D03_G1_TO_G6_IMPLEMENTATION_ROADMAP_V1.md)의 **시험 전용 증거**입니다.

## 1. R1: PostgreSQL 두 독립 세션의 실제 잠금 대기 관측

**작업 파일**
- `test/db/seyeon_positive_source_set_exact_attempt_race_v1.sh` 신규
- `test/db/seyeon_positive_grant_candidate_real_http.sh` 기존 격리 실행기에 호출 추가
- 사전 준비: `test/db/seyeon_positive_grant_attempt_bound_candidate_v1.sql`의 실제 `chat_turn_attempts` fixture, `test/db/seyeon_positive_source_set_parent_edge_candidate_v1.sql`의 SourceSet/Edge + **test-only** 양방향 XOR Trigger
- **데이터베이스 가드**: CI=true, PGHOST=localhost, PGDATABASE=myeongha_seyeon_positive_pin_candidate_test. 운영 RLS/ACL/DDL, 공개 라우트, 모델 API 호출 없음.

**Case R1-P (Positive-first):**
1. Session A: PostgreSQL Backend A가 기존 Positive SourceSet의 정확한 original Grant를 `pin_source_set_r1`로 재검증하고 **Attempt FOR UPDATE** 및 해당 원본 Grant/Memory의 FOR SHARE 잠금 아래 Transaction 유지.
2. Session B: PostgreSQL Backend B가 같은 Attempt의 Zero field UPDATE 수행.
3. 테스트 실행자는 `pg_stat_activity.application_name`과 `wait_event_type='Lock'`로 **실제 분리된 DB Backend가 기다리는 상황을 관측**한 경우에만 Session A 해제.
4. Session B는 시험용 `reject_zero_after_positive_r1`에 의해 SQLSTATE 23514 / `seyeon_offline_r1_zero_positive_xor` 차단; Zero field는 여전히 NULL, 기존 Positive Parent 보존. 예기치 않은 SQLSTATE/데드락/타임아웃을 PASS로 간주하지 않음.

**Case R1-Z (Zero-first):**
1. 기존 DB owner의 `cmd_receive_chat_turn_v1` 및 `cmd_allocate_chat_turn_attempt_v1`로 같은 Subject/Thread의 **다른 실제 신규 Running Attempt** 생성. 첫 Attempt/Parent 데이터를 격리하여 관측값 혼합 금지.
2. Session A: 신규 Attempt에 합성 Zero field UPDATE 후 Transaction 유지(운영 Zero-proof RPC 통과 주장 아님).
3. Session B: 실제 `myeongha_api_executor` 역할과 canonical Subject 컨텍스트로 **그 신규 Attempt에 positive `pin_source_set_r1`를 요청**하고 Attempt row 잠금에 대기.
4. `pg_stat_activity`에서 실제 Lock 대기를 확인하고 Zero Tx Commit을 해제. Positive 함수는 변경된 동일 Attempt 상태/Zero 필드를 관측하여 false/HOLD. Positive Parent/Edge가 0건임을 DB로 검증.

**이 검증의 엄격한 상한:** 기존 1640 운영 Zero Pin의 *실제 유효한 JSON 증빙·context_ready 명령*과 positive Native Provider/Commit v2의 실제 state transition을 재현한 것은 아닙니다. 일반 UPDATE/테스트 RPC의 Lock Graph를 본 것이며, Owner 승인한 Production-equivalent G1/G2 경합 또는 3세션 revoke/commit/reveal 원자성 증거도 아닙니다. 운영 함수/마이그레이션 수정 없음.

## 2. R2: 같은 PostgreSQL Attempt·Original Grant를 실제 모델 요청 후보에 결속

**작업 파일**
- `apps/api/src/seyeon-offline-r2-db-source-set-binding-v1.ts` 신규; `permitsProductionProvider=false`, `permitsProductionReveal=false`만 반환
- `test/seyeon-offline-r2-real-db-source-boundary-v1.test.ts` 신규
- `test/db/seyeon_positive_grant_candidate_real_http.sh`의 기존 disposable PG Vitest 목록에 추가

**시험 경로:** 동일한 실제 폐기 DB에서 신규 Chat Turn/Attempt를 서버형 DB 명령으로 생성(모두 하나의 롤백 가능한 테스트 Transaction) → 기존 원본 `memory_items`와 원본 `record_access_grants`의 **정확한 한 건**을 `pin_source_set_r1`로 저장 → 테스트 관리자 DB 조회에서 parent `attempt_id/subject_id/thread_id/turn_id/source_count/selected_sources_digest`, Edge `ordinal/record_id/original_grant_id/type/schema/granted_at/PG digest`, 현재 Grant/Record 변경 여부 조회 → 별도의 Node S0 `selectSeyeonExactModelPersonalSourcesV1` 결과 및 `buildSeyeonTurnInterpreterRequestV2` 실제 native 모델 입력과 대조합니다.

**반례:** 원본 Grant 교체, 다른 Attempt ID, 선택 집합 해시 변경, source_count/ordinal 변경, DB payload hash 변경, 원본 Grant 취소, 원본 Memory content 변경. 변경된 원본 Grant 또는 Memory를 테스트용 PG `SAVEPOINT`에서 확인하고 ROLLBACK; 유료 Provider·출력 공개·post-turn worker 없음.

**인증되지 않은 부분을 분리해서 명시:**
- Node `SeyeonOfflineR2DbSourceObservationV1` 객체는 조회기가 만들어 넘기는 **호출자 제공 관측값**입니다. DB owner의 signed immutable receipt, secure transport, role-bound *Proof*가 아닙니다. 완벽한 ID/hash 문자열도 원본 Grant의 권한을 생성하지 않습니다.
- `selectedSourcesDigest`는 Native Node `canonicalJson` 기반, `pinnedPayloadDigest`와 `currentPayloadDigest`는 DB `jsonb::text` 기반. **서로 다른 대상·codec을 일치시킨 것처럼 비교하지 않음**.
- 사용한 Memory type `shared_detail/memory-v1`은 기존 격리 SQL fixture에만 존재하는 **시험용 규격**, SRC-25 production schema 승인 근거 아님.
- 정확한 1 Memory 직접 사용만 구조화해 대조. History/Reader/Relationship/Preflight/Renderer/Reviewer의 *실제* 전체 source closure, Model Provider wire bytes, 유료 호출 적법성, G2 동일 Transaction Commit 및 G3 HTTP First/Replay/History/current-rights의 권한 검증은 아직 미완료.

## 3. 자체 리뷰 및 다음 Gate

- **R1 race 종료:** 두 종류의 PG 잠금 실제 대기, 이후 기대 HOLD, 0 source leakage, no deadlock/timeout 검증 후에만 격리 PASS 기록.
- **R2 actual-record 결속 종료:** DB가 반환한 단일 원본 Grant/pinned raw digest와 Native Node Selected Memory/Request 일치, 원본 revoke/payload tamper HOLD 후에만 격리 PASS 기록.
- **G0 Owner OPEN:** D-01~D-10 및 SRC-25/Source ACL/Reader/DR와 production-grade locking/transaction/Request signing 승인 없으면 운영 마이그레이션·positive Projector·Provider/public route/PR merge 모두 HOLD.
- **다음 구조적 구현:** G1 실제 Owner-approved SourceSet schema + Positive Pin atomic same-Tx/context-ready, 1640 트리거/Legacy RPC lock graph 및 최소권한 RLS + G2 v2 Commit 경쟁. 그 전에 필요하면 R2 after-Preflight/request-seal에서 출처가 새로 유입되는 구간의 재검증 경계 별도 추가.

**검증 증거 규칙:** GitHub Actions는 오직 **해당 PR 정확한 마지막 HEAD**의 `db-authority-core`, `Work Track · character-memory`, `CI Verify`, `Governance`, `Web PR Domain Gates`가 모두 SUCCESS일 때만 PASS로 표시. SQL/Vitest의 하위 결과는 CI 로그 링크를 함께 기록. 현재 문서 자체는 테스트 통과나 Owner 승인이 아닙니다.
