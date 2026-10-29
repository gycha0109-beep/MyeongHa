# C09 검증 학습 발행·철회 사전 승인 Shadow (2026-10-29)

**상태:** 승인 검증과 SQL 계획 구현, 격리 PostgreSQL 17 검증. **운영 DB 기록/삭제/권한 변경 없음.**

## 구현

- `apps/api/src/seyeon-c09-learning-evidence-publication-shadow-v1.ts`
  - 서버 소유 `sourceAuthority`가 원본 학습 검증, 명시적 발행 승인, 공유 동의, 비식별화, 개인정보 검토 결과를 별도 조회하도록 요구합니다.
  - Subject ID/출처/지식 주제/수준/시점/개인 또는 공유 범위가 불일치하면 SQL 계획을 반환하지 않습니다.
  - `prepareIssue`: Parameterized INSERT 명령 + 고유 Evidence ID를 **계획으로만** 생성합니다. 유저 개인 학습은 원래 Subject에만, 공유 학습은 승인·동의·개인정보 검토가 모두 확인된 경우에만 가능합니다.
  - `prepareRevoke`: 해당 Evidence ID/출처/Subject에 대한 독립 철회 승인 증빙이 있는 경우에만 Parameterized UPDATE 계획을 생성합니다.
  - 결과의 `scope=PROPOSAL_SQL_ONLY_NO_EXECUTION`, `mayExecuteInProduction=false`는 변경하지 않습니다. SQL은 **어떤 DB에도 자동 실행되지 않습니다**.
  - 이 모듈만으로 모델이 학습하지 않으며, 실제 sourceAuthority의 운영 구현도 아직 없습니다.

- `supabase/proposals/seyeon_c09_learning_ledger_schema_PROPOSAL_NOT_APPLIED.sql`
  - `sharing_consent_ref`를 기록하도록 제안을 보강했습니다.
  - 사용자로부터 배운 학습을 캐릭터 공통 지식으로 공유할 때 동의 참조가 없는 INSERT를 DB 제약조건이 거부합니다.
  - 실제 운영 Migration/RLS/ACL 추가는 **전혀 수행하지 않았습니다**.

- `apps/api/src/postgres-seyeon-c09-learning-ledger-shadow-v1.ts`
  - 읽기·재검증에서 공유 동의 참조 존재 여부를 검사합니다. 승인/철회 모델의 실제 원본 진위 검증은 독립 소스 권한에 남아 있습니다.

## 검증

- TypeScript 빌드 및 모의 Source Authority를 통한 유효/무효 승인·공유/개인 범위·철회 계약 테스트 수행.
- `test/fixtures/c09-learning-ledger-isolated-publication-postgres17.sql`은 일회용 PostgreSQL 17.6에서 공유 학습 발행, 공유 동의 누락 삽입 거부, 승인된 출처의 철회 UPDATE 실행을 확인합니다.
- 실제 SQL 결과: `C09_LEARNING_PUBLICATION_CONSENT_REVOCATION_ISOLATED_PASS`.
- 기존 격리 SQL RLS 테스트 결과도 `C09_ISOLATED_POSTGRES17_PROPOSAL_PASS`.
- 격리 DB의 역할/정책은 합성 시험용으로 운영 보안 승인을 대신하지 않습니다.

## 미완료

1. 운영용 검증 Source Authority, 공유 동의의 실제 원본/철회 상태 조회, 학습 기록의 원자적 발행·철회 API는 아직 미구현입니다. SQL 계획을 API 실행기로 자동 연결하지 않습니다.
2. 실제 마이그레이션·권한·RLS 정책은 사용자 승인 게이트를 따르며, 세연이 영구 학습했다는 주장은 하지 않습니다.
3. 기존 `conversation_messages` SELECT 권한 제약 및 실제 GLM/Luna 품질 실측은 미완료입니다.
4. 같은 승인 참조의 동의 철회·변경을 즉시 반영하는 신뢰 가능한 별도 Consent 원장/Revocation 조회는 추가 구현해야 합니다. 현재 Reference 존재 여부만으로 철회까지 증명하지 않습니다.

**다음:** 실제 canonical Subject/Consent/Approved Source 읽기 계층을 연결하고, 권한 승인 이후 격리 DB의 실행 트랜잭션과 운영 통합을 검증합니다.
