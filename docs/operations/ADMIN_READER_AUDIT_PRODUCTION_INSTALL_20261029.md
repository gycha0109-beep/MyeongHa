# Admin Console Reader/Audit Production 설치 기록 — 2026-10-29

이 문서는 Admin Console의 기존 A0–A3 읽기 전용 운영 연결에 필요한 DB 기반 설치와 실제 조회 결과를 기록합니다. 신규 로드맵·활성화 승인이 아닙니다.

## 설치 정본

- Production Supabase project ref: `cnsfpcdiyofqvhpcegfc`
- Supabase migration: `20261029071539_admin_console_reader_audit_foundation_v1_20261029`
- 적용 SQL: `apps/admin/database/production-reader-audit-foundation-manual-v1.sql`
- 적용 범위: 독립 `myeongha_admin_reader` / `myeongha_admin_audit_writer`, 비공개 `myeongha_admin_ops.admin_audit_events_v1`, Admin 전용 SELECT/INSERT 정책
- 위 SQL은 이미 Production에 적용됐습니다. 재실행하지 마십시오. 변경이 필요하면 기존 설치 이력과 실제 권한을 먼저 대조해야 합니다.

## 설치 후 실제 검증

- 역할 2개: `LOGIN`, `NOINHERIT`, `NOBYPASSRLS`, 비슈퍼유저, 다른 역할 멤버십 없음
- 관리자 감사 테이블: RLS 활성화 및 `FORCE ROW LEVEL SECURITY`
- 관리자 전용 RLS 정책: 29개
- Reader 조회 가능 컬럼: 실제 178개 / 승인된 178개, 누락 0개, 추가 0개
- Reader 금지 컬럼 예: `subjects.auth_user_id`, 출생일, 결제 증빙 JSON 등 접근 불가
- Audit Writer: 감사 INSERT 허용, 감사 SELECT 및 `public.subjects` SELECT 불허
- `auth.users` Reader 조회 불허
- SQL 마이그레이션 이력 존재 확인
- 이 검증은 PostgreSQL 카탈로그의 실제 권한 조회입니다. 별도 Reader/Audit Writer로 TLS 로그인한 실검증을 대신하지 않습니다.

## 운영 개통 전 미완료

- 두 전용 DB 역할 모두 비밀번호 미설정. 외부 로그인 자격증명 없음
- Reader/Audit Writer 각각의 전용 Hyperdrive 미생성; 기존 고객/세연 Hyperdrive 재사용 금지
- 전용 PostgreSQL 연결에서 `verify-full`, 역할·컬럼 제한·감사 쓰기/읽기 차단 검증 미완료
- `myeongha-admin` Worker 미배포; 기존 `myeongha` 공개 Worker는 변경하지 않음
- GitHub 배포 환경의 Admin 전용 자격증명과 Secrets 준비 확인 필요
- 비활성 Worker 스테이징은 해당 DB 로그인·Access 정책 사전 검증을 통과한 후에만 수행
- 읽기 전용 활성화 이전까지 `MYEONGHA_ADMIN_PRIVATE_ENABLED=false` 유지. Command Executor나 A4/A5 완성을 읽기 전용 개통의 필수 선행조건으로 만들지 않음

## 경계

- 기존 Offline SQL과 Production 적용본을 별개 설계로 취급하지 않음
- 공용 `service_role`, 일반 고객용 Hyperdrive, 관리자 아닌 DB 역할을 대체 사용하지 않음
- 비밀번호·연결 URL·Owner 이메일·JWT·API 키는 이 문서에 기록하지 않음
- 실 DB 역할 접속 및 배포 완료를 추정하여 보고하지 않음
