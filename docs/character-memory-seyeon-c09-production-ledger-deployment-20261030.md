# C09 운영 DB 적용 기록 — 2026-10-30

## 승인 범위 및 실행

사용자 승인: 운영 Supabase 학습 원장·ACL·RLS 적용, 기존 conversation_messages C09 조회 권한 복구. 영구 학습 기능의 사용자 공개/HTTP 실행은 별도 검증까지 보류.

명하 Supabase 프로젝트: cnsfpcdiyofqvhpcegfc

1. supabase/migrations/20261030104500_c09_conversation_reader_columns_acl_v1.sql
   - 운영 Migration 성공.
   - 기존 conversation_messages_api_current_select_v1 정책은 유지.
   - 서버 실행 역할 myeongha_api_executor에게 C09 조회에 필요한 열 SELECT 추가.
   - 운영 카탈로그 검사에서 해당 역할에 이번 작업 이전부터 message_payload_jsonb 등 여러 열 SELECT가 존재함을 확인. 이 기존 권한은 호환성 검증 없이 회수하지 않았으므로 **오직 7개 열만 읽을 수 있다고 주장해서는 안 됨**.
2. supabase/migrations/20261030105000_c09_learning_source_authority_read_gated_v1.sql
   - 운영 Migration 성공.
   - myeongha_internal 스키마 신규 생성, Topic / Learning Evidence / Source Approval / Consent / Revocation Approval 5개 테이블 생성.
   - 모두 RLS 활성화 + FORCE RLS. myeongha_api_executor의 SELECT 정책과 테이블 SELECT 권한 부여.
   - 공개 Data API 역할 anon/authenticated에는 신규 테이블/함수 접근 권한 미부여.
   - 발행/개별 철회/공유 동의 철회 함수는 SECURITY INVOKER로 배포됐으나 API 실행 역할에 EXECUTE/INSERT/UPDATE 권한 없음. **운영 학습 발행·철회는 아직 불가**.
   - 신규 학습 테이블 5개는 전부 빈 상태. 실제 승인 Source/Consent/Revocation 발행·감사 파이프라인 미배포.

## 검증

- 격리 PostgreSQL 17에서 두 마이그레이션과 합성 Subject A/B RLS 접근을 시연: C09_PRODUCTION_MIGRATION_ISOLATED_PREFLIGHT_PASS.
- 운영 DB: 5개 RLS 정책 존재, 5개 테이블 SELECT = true, INSERT/UPDATE = false, anon SELECT = false.
- 운영 DB: 3개 C09 원자적 발행·철회 함수 API EXECUTE = false, anon EXECUTE = false.
- conversation_messages: C09에 필요한 body_text SELECT = true, anon SELECT = false, 기존 Subject-Scoped SELECT RLS 정책 유지.
- Supabase Security Advisors는 기존 public 스키마 다수 테이블의 policy_exists_rls_disabled 경고를 반환. C09 신규 테이블에 대한 동일 경고는 확인되지 않음. 이 작업에서 기존 광범위 스키마 변경은 수행하지 않음.

## 남은 작업

- 실제 운영 Source/Consent/Approval/Revocation 권위 원장의 발행·감사 및 최소권한 쓰기 실행기를 구현.
- 운영 role에서 일관된 Auth Subject 바인딩과 철회 경쟁/재시도/중복 처리를 검증한 후 기능 활성화.
- 기존 데이터의 의도치 않은 공통 학습 승격 금지. 현재 학습 활성화 아님.
