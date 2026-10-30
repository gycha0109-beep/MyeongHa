# 분석 비공개 원장 설치 — 2026-10-30

기존 A5의 저장소·권한 계약을 Production에 설치했습니다. 동의 정책 승인·수집 활성화·보존 스케줄 설치를 의미하지 않습니다.

- Project: `cnsfpcdiyofqvhpcegfc`
- 실제 migration: `20261030015201_admin_console_analytics_foundation_v1_20261030`
- 적용 파일: `apps/admin/database/production-analytics-foundation-manual-v1.sql`
- 기존 `analytics-pipeline-offline-v1.sql`의 본문과 동일한 테이블·역할·RLS·보존 제약입니다. 재실행하지 않습니다.

## 설치 결과

동의/이벤트 테이블 2개 모두 RLS/FORCE RLS입니다. 독립 `myeongha_analytics_writer`는 비슈퍼유저·NOINHERIT·NOBYPASSRLS이며 다른 역할을 상속하지 않습니다. 동의·이벤트의 조회/적재/삭제와 동의의 `withdrawn_at` 갱신만 허용합니다. 고객 테이블 권한은 없고 동의의 사용자 연결 변경·이벤트 UPDATE/TRUNCATE는 차단합니다. 로그인 비밀번호는 설정하지 않았습니다.

기존 Reader의 public/관리자 운영 스키마 허용 컬럼은 178개 그대로입니다. 승인된 A5 후보에 있는 분석 전용 필드 23개를 추가했습니다(동의 4개·이벤트 19개). 원문·고객 인증 식별자·출생정보·대화·결제 증빙은 포함하지 않습니다. anon/authenticated의 분석 스키마 접근은 차단합니다.

## 실제 검증

폐기형 PG17.6의 비슈퍼유저 설치와 Production 전체 롤백 검사에서 기존 180일 경계 검증 SQL을 실행했습니다. 180일 초과 이벤트 거부, 만료 이벤트의 Reader 조회 차단, 만료 삭제, 사용자 연결 삭제의 이벤트 연쇄 제거, Reader DELETE 거부를 확인했습니다. 모든 합성 데이터·임시 관리 역할 전환은 롤백했고 Production 동의·이벤트 저장 행은 각각 0개입니다. 이 행 수는 수집 완료·실제 방문자/전환 0의 증거가 아닙니다.

설치 후 Supabase 보안 advisor에서 이 관리자 스키마에 해당하는 항목은 없습니다. 전용 Writer의 실제 비밀번호/TLS 로그인, 서비스 정책 버전·방문 판정·삭제 주입·서버 성공 이벤트·보존 스케줄·공개 라우트의 운영 결속은 남아 있습니다. 공개 Worker·수집 플래그·고객 데이터·스케줄은 변경하지 않았습니다.
