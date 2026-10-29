# C09 학습 Source Authority·원자적 발행/철회 — 미적용 제안 및 격리 실증

일자: 2026-10-29
상태: **코드 구현 및 격리 PostgreSQL 17 실증 완료. 운영 DB 미적용 / 운영 API 미연결.**

## 문제와 변경

기존 C09 발행/철회 계획은 앱에서 공유 동의와 승인 Source를 두 차례 확인하더라도 실행 순간에 원본이 바뀔 수 있었으며, 직접 INSERT/UPDATE SQL을 반환했습니다. 이번 작업은 **같은 DB 트랜잭션 안에서 출처 승인·동의·철회 근거 행을 잠근 상태로 발행 또는 철회를 수행**하는 구조를 추가했습니다.

1. `supabase/proposals/seyeon_c09_learning_source_atomic_PROPOSAL_NOT_APPLIED.sql`
   - 검증된 출처 승인 `character_learning_source_approvals_v1`, 공유 동의 `character_learning_sharing_consents_v1`, 개별 철회 승인 `character_learning_revocation_approvals_v1` 세 테이블 **적용 전 SQL 제안**.
   - 강제 RLS / 기본 허용 정책 없음 / 익명·인증 사용자 테이블 및 함수 권한 없음.
   - `c09_issue_learning_evidence_shadow_v1`: Source 승인 `FOR UPDATE`, 해당 지식 정책 `FOR SHARE`, 공유 Consent `FOR UPDATE` → 동의 상태·revision·privacy/de-identification 검증 → 같은 트랜잭션에서 학습 기록 INSERT. 위조 Subject, 오래된 Consent revision, 철회된 동의는 실패.
   - `c09_revoke_learning_evidence_shadow_v1`: 철회 승인·Source·Evidence 행 잠금 → 원본 일치·승인 버전 확인 → 기록 철회.
   - `c09_revoke_sharing_consent_shadow_v1`: Consent 잠금 → 철회·revision 증가와 해당 공유 학습 Evidence 전부 무효화를 동일 트랜잭션에서 처리.
   - 세 함수는 **SECURITY INVOKER**이며 권한을 새로 부여하지 않습니다. 실제 배포 시 함수 호출자의 테이블 ACL/RLS 정책을 별도 승인/설계해야 합니다.
2. `apps/api/src/postgres-seyeon-c09-publication-source-shadow-v1.ts`
   - 기존 서버 canonical Subject PostgreSQL Scope를 사용하여 제안된 출처 승인·공유 동의·철회 승인 원장을 **독립 SELECT**하는 read-only Source Authority Adapter.
   - Subject/Source/Topic/Consent/승인 근거·시점/Revocation 버전 불일치, 미존재 테이블 및 읽기 권한 부족 시 fail-closed. 사용자에게 공개된 API 라우팅 없음.
   - 검증 근거의 **원본 생성기·소유자 동의 원장 기록 파이프라인** 자체를 만들었다는 뜻은 아닙니다. 승인된 원장 행이 있어야만 Reader가 정상 반환합니다.
3. `apps/api/src/seyeon-c09-learning-evidence-publication-shadow-v1.ts`
   - `prepareIssue`/`prepareRevoke`의 계획 SQL을 직접 INSERT/UPDATE에서 **잠금 기반 원자적 함수 호출**로 변경.
   - 반환 계약의 `scope=PROPOSAL_SQL_ONLY_NO_EXECUTION` 및 `mayExecuteInProduction=false` 유지. 동의·승인 Source 재조회 후에도 DB 함수가 Commit 전에 독립 검증.
   - 동의 검증 시간은 원래 학습 사실의 검증 시점보다 반드시 빨라야 한다는 잘못된 가정을 제거. 검증보다 나중에 동의한 경우도 정상이며, 동의는 DB 현재 시각 기준 유효해야 함.

## 격리 PostgreSQL 17 및 테스트 결과

- `test/fixtures/c09-learning-source-atomic-isolated-postgres17.sql`은 제안 SQL을 일회용 PG17에 적용한 후 승인 Source+Consent 기반 발행, private 학습 분리, 위조 Subject/오래된 버전 거부, 개별 철회 및 동의 철회 시 공유 학습 일괄 무효화를 검증.
- 실제 SQL 결과: `C09_ATOMIC_SOURCE_ISSUE_REVOKE_ISOLATED_PASS`.
- `test/fixtures/c09-learning-source-reader-live-postgres17.sql`로 격리 Source/Consent 행을 준비하고, `test/postgres-seyeon-c09-publication-source-live-pg17.test.ts`에서 **실제 PostgreSQL 드라이버 + 신규 Read Adapter + 승인 계획 생성기 + DB 원자적 함수**까지 연결한 1개 통합 테스트 PASS.
- `test/postgres-seyeon-c09-publication-source-shadow-v1.test.ts`는 가짜 DB와 승인·동의·철회 원본의 부재 및 교차 사용자 접근 차단을 검증.
- 로컬 빌드 TypeScript PASS. C09 관련 Vitest 10개 파일의 기본 회귀는 **76 PASS, 실 DB 조건부 테스트 1 SKIP**; 격리 DB 연결 환경변수로 별도 실행한 조건부 실연결 테스트는 **1 PASS**.
- 실 DB 테스트의 연결은 일회용 **로컬 Docker PostgreSQL**이며, 운영 Supabase/실사용자 데이터 대상이 아닙니다. 로컬 superuser 연결 시험은 Production RLS/권한 검증이 아닙니다.

## 명시적 제한

- **운영 DB Migration/RLS/ACL/함수 배포 미실시.** SQL은 `supabase/proposals/*PROPOSAL_NOT_APPLIED.sql`에서만 관리.
- 서버가 검증한 Subject를 함수 인자로 전달해야 하며, 브라우저나 모델의 임의 Subject는 승인 근거가 될 수 없습니다. 아직 운영용 인증·RLS 게이트가 미설치.
- Source 승인·공유 동의·원본 검증·철회 승인 **행을 신뢰 가능하게 발행·감사·철회하는 실제 운영 파이프라인은 미구현**. 이 제안은 위조 승인 발행을 원천 차단하는 완성된 운영 보안 체계가 아닙니다.
- 여러 세션이 동시에 발행/철회할 때의 잠금 순서·데드락/재시도·감사 로그·권한 회수는 격리 동시성 실험과 정상 Production 권한 설계에서 추가 검증 필요.
- 기존 `conversation_messages` direct SELECT 권한 부족, GLM/Luna 장기 다중 턴 품질 평가, 실제 모델·메모리 Commit은 기존 미완료 항목.

## 후속

기존 명하 승인 게이트에 따라 DB Migration, Canonical Subject 실행 역할·ACL/RLS, Source/Consent/Revocation 감사 원장 승인 후 **격리된 최소권한 실행 역할**로 동시 발행·철회 실험과 원자적 Commit Gate 검증. 그 전에는 Production 호출 경로를 연결하지 않습니다.
