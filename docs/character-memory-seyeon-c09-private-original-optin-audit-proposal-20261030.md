# C09 개인 학습 Source 원본·명시적 승인·감사 캡처 — 2026-10-30

**상태: Proposal + 일회용 격리 PostgreSQL 17 검증. 운영 DB 미적용, 학습 실행 미활성.**

## 현재 실제 구현

- 기존 운영 원장 5개 / RLS / 읽기 ACL는 2026-10-30 운영 Supabase에 설치 완료. 이번 추가 자료는 운영에 설치하지 않았음.
- `supabase/proposals/seyeon_c09_private_source_capture_PROPOSAL_NOT_APPLIED.sql`
  - `character_learning_private_optin_receipts_v1`: 실제 사용자 원본 메시지 UUID·Subject·해시와 별도로 발행된 명시적 개인 학습 승인 행위 참조를 묶는 **제안** 테이블. 실제 인증된 사용자 액션 영수증 발행기는 아직 없음.
  - `character_learning_source_capture_audit_v1`: 원본 메시지/해시, 사용자 승인 참조, 소유 Subject, 출처와 연결하는 개인 학습 승인 감사 기록.
  - `c09_capture_private_approved_source_shadow_v1`: 기존 Conversation Message가 실존하고 해당 Subject 소유의 unredacted 사용자 발화인지, 원본 해시가 명시적 승인 영수증과 일치하는지, 사용자 지정 Topic이 공개됐는지 DB에서 확인. 검증되면 하나의 DB 트랜잭션에서 C09 Source 승인 원장과 감사 기록을 함께 추가. 공유 지식 승격 기능 없음.
  - `c09_verify_private_source_current_shadow_v1`: Source 승인 행만 믿지 않고 현재 원본 메시지·기존 승인 영수증·감사·Topic·해시를 다시 검증. 개인 동의 철회 또는 원본 삭제 처리 후 FALSE.
  - 함수 SECURITY INVOKER, 스키마 RLS FORCE, PUBLIC/anon/authenticated 기본 차단. 운영 실행 역할에는 어떤 쓰기/함수 실행 권한도 부여하지 않음.
- `apps/api/src/postgres-seyeon-c09-private-approved-source-shadow-v1.ts`
  - 현재 원본 검증 함수를 독립으로 두 차례 확인하고, 기존 PostgreSQL Source Approval Reader의 값이 같은 소유자의 `user_private` / `user_taught_verified`인지 확인하는 Shadow 어댑터.
  - 공유 범위로 전환·승격하거나 사용자 Subject를 바꾸면 실패 차단. Planner는 여전히 `PROPOSAL_SQL_ONLY_NO_EXECUTION`, `mayExecuteInProduction=false`.
  - **운영 API나 기존 Publisher에 자동으로 연결하지 않았음.** 현재 원래 Reader의 전체 출처 진위는 여전히 별도 강화 필요.

## 검증

- `test/fixtures/c09_private_capture_pg17_bootstrap.sql` : 실제 `conversation_messages` 구조를 단순화한 **합성** Subject A/B, CURRENT_USER 고정 역할 및 RLS.
- `test/fixtures/c09_private_capture_pg17_assert.sql` : 실제 PostgreSQL 17 SQL로 원본 소유자/해시 대조, 독립 가상 승인 영수증을 가진 A만 승인·감사 캡처; B의 A 가장, 영수증 누락, 삭제 처리된 원본, 캐릭터 메시지 원본 위조, 중복 캡처 실패를 확인. 캡처 후 동의 철회 또는 원본 삭제 처리 시 현재 검증 실패. 실제 증빙 발행은 테스트에선 관리자 삽입 합성 데이터.
- 실 DB 격리 SQL 결과: `C09_APPROVED_PRIVATE_ORIGINAL_AUDIT_ISOLATED_PASS`.
- 새 독립 Authority 어댑터 Vitest와 타입 검사는 코드 저장소에서 검증.
- 학습 Evidence 원장에는 새 캡처만으로 기록하지 않음.

## 구분 및 미완료

1. **가장 큰 미완료:** 실제 사용자에게 제공할 명시적인 개인 학습 승인 UI·API와 서명/Subject/요청 원본을 검증하여 Approval Receipt를 발행하는 별도 신뢰 경로. 대화 원문이나 기존 Memory Grant를 승인 신호로 절대 추정하지 않음.
2. RLS에 더해 생산용 전용 NOLOGIN 작성자 역할, 추가 테이블의 DML 봉쇄 및 DB 함수 EXECUTE, 감사 기록 불변성 보장/재시도 키, Direct INSERT 우회 방지 필요. 현재 테스트 역할의 DML 권한은 운영에서 재사용 금지.
3. 발행 원자 트랜잭션에서 승인 영수증 및 원본 redaction을 재검증하고, 동시에 진행되는 철회와 직렬화하여 이후 Issue를 차단하는 연결 미완료. 현재 원본 조회 두 번만으로 전 구간 원자성을 보장하지 않음.
4. `character_shared` 학습은 **별도 실제 공유 동의 + 비식별 개인정보 검토**가 없으면 캡처/승격 금지. 이 제안은 개인 학습 전용.
5. 운영 Supabase 기존 5개 테이블은 유지하며 이번 신규 테이블/함수는 **마이그레이션 없이 제안 상태**. 실제 사용자 지식 저장·GLM/Luna 품질 평가 미실시.

이 문서는 운영 서비스가 이미 학습을 시작했다고 주장하지 않음.
