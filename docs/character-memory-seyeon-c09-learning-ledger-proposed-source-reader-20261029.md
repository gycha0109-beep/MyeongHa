# C09 캐릭터 학습 이력 원장 — DB 적용 전 SQL 제안 + PostgreSQL 독립 조회 Shadow

날짜: 2026-10-29
상태: **코드/테스트 완료, DB Migration 승인·실제 적용 대기. 운영 기능 아님.**

## 기준

명하 세연 챗봇 로드맵 v0.3의 단계 1(현재 대화 중 이해) 및 단계 3(장기 보존은 승인된 기억만)을 구분한다. 사용자에게 설명을 들은 사실은 **사용자가 그 설명을 했다는 사실**이지 객관적 내용이 검증됐다는 뜻이 아니다. 기존 memory_items, memory_proposals, record_access_grants는 사용자별 기억/권한이며 타 사용자에게 자동 공유되는 캐릭터 일반 지식 원장이 아니다.

## 구현

- supabase/proposals/seyeon_c09_learning_ledger_schema_PROPOSAL_NOT_APPLIED.sql
  - 자동 적용 경로가 **아닌 proposal**. 내부 비노출 스키마의 topic-policy 원장과 출처·승인·개인정보 검토·철회 이력 기반 learning-evidence 구조 제안.
  - User-private: 정확한 Subject에만 국한. Character-shared: 개인정보 검토와 명시적 공유 승인이 동시에 있어야 하며 공개 projection에서는 원본 사용자 식별자를 제공하지 않는다.
  - RLS 활성, 기본 접근권한 없음. 아직 접근 정책/발행 검증/Revocation 권한·SQL 마이그레이션 승인 및 실제 운영 DB 생성 없음.
- apps/api/src/postgres-seyeon-c09-learning-ledger-shadow-v1.ts
  - 미배포 제안 테이블에 대한 읽기 전용 SQL 3개(Topic Policy, 검증된 학습 근거, 개별 근거 재검증).
  - 기존 canonical Subject DB Scope만 인자로 받으며 사용자/모델의 임의 Subject·Topic을 권한으로 사용하지 않음.
  - 필드·일시·sharing/review·유효 기간·재검증 근거를 검사하고, 자료 또는 스키마 권한이 없을 때 C09_LEARNING_LEDGER_UNAVAILABLE로 fail-closed.
  - createPostgresSeyeonC09ApprovedLearningAuthorityShadowV1가 서버 소유 current-turn topic classifier와 위 SQL reader를 합쳐 기존 C09 Epistemic Port에 공급한다. Topic classifier 자체의 Production 분류/승인 파이프라인은 별도 미구현.
- test/postgres-seyeon-c09-learning-ledger-shadow-v1.test.ts
  - 승인된 공유 자료, Subject 전용 자료 격리, 원본 revocation, 누락 검토/동의, 미래 시간·무효 출처 차단, 미배포/무권한 DB 실패, 계약 연동 검증.
  - 모든 DB 결과는 모의 데이터. 실제 Supabase 테이블 생성·RLS 검증·실제 학습 자료 읽기 없음.

## 권한/운영 제한

1. **DB Migration 및 Production 배포는 별도 승인 필요**: 이 문서는 적용 명령이 아니며 실제 Supabase에 테이블이나 권한을 생성하지 않았다.
2. C09 기존 multi-turn Census의 conversation_messages 직접 SELECT 권한 부재는 이번 SQL reader와 별개로 남아 있다. 임의 권한 확대 또는 SECURITY DEFINER 변경 없음.
3. 서버가 검증한 학습 이벤트의 작성·검증·비식별화·승인·철회 흐름은 미구현이며, 새 SQL 원장을 자동 활성화할 수 없다. 캐릭터가 실제로 장기 학습했다는 주장은 금지.
4. 모델의 독립 판단·한국어 몰입 품질/비용·영구 기억 commit은 별도 평가/게이트를 필요로 한다.

## 다음 구현

승인된 DB Migration 경계에서 스키마/ACL/검증 이벤트 발행을 정합하게 확정한 후, 안전한 isolated DB에서 실제 RLS·철회·공유 차단을 검증한다. 그 이전에는 기존 공개 대화 C09 Shadow 기능과 개인 메모리 승인 체계를 유지한다.
