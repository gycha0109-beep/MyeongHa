# 공지·배너 비공개 DB 설치 — 2026-10-30

기존 A7의 표현 정보 전용 RPC를 Production에 설치했습니다. 관리자 로그인·Worker 배포·게시 활성화와는 별개입니다.

- Project: `cnsfpcdiyofqvhpcegfc`
- 실제 migration: `20261030014708_admin_console_presentation_foundation_v1_20261030`
- 적용 파일: `apps/admin/database/production-presentation-foundation-manual-v1.sql`
- 기존 Reader/Audit 설치 `20261029071539`는 재실행하지 않았습니다. 본 설치도 재실행하지 않습니다.

## 설치와 권한

강제 RLS 테이블 3개(표현 정보·명령 영수증·변경 이력), 기존 계약과 본문이 같은 함수 5개, 비로그인 최소 권한 소유자와 전용 Command Executor를 설치했습니다. Executor에는 RPC 4개만 허용하며 직접 테이블 쓰기·고객 데이터 조회·공개 투영 함수 실행은 허용하지 않습니다. 비밀번호는 설정하지 않았습니다.

공개 사용자 역할·기존 공개 Worker·Hyperdrive를 변경하지 않았습니다. 공개 투영 함수도 일반 서비스 계정에 부여하지 않아 게시 피드는 미활성입니다. 기존 Reader 허용 컬럼은 178개 그대로입니다.

실제 Supabase 관리 계정은 비슈퍼유저입니다. 소유권 이전에 필요한 일시적 SET ROLE과 CREATE를 트랜잭션 안에서만 허용하고, 함수 ACL은 NOINHERIT 소유자로 명시적으로 전환해 설정합니다. 끝에서 임시 권한을 제거하고 PUBLIC 실행 차단과 계정 격리를 검사한 뒤 커밋합니다. 기존 Reader/Audit와 같은 관리용 ADMIN-only 관계는 유지하되 INHERIT/SET 권한은 없습니다.

## 검증

- 폐기형 PG17.6의 비슈퍼유저·CREATEROLE 관리 계정으로 설치 성공. 기존 게시/예약/수정/이력/중복/버전 충돌·감사 실패 롤백 시나리오 통과.
- 실제 Production에서 임시 역할 전환과 합성 데이터만 사용하는 **전체 롤백** 검사로 저장·재실행·예약·이력·직접 쓰기 차단 확인. 이후 표현 정보/명령 영수증 저장 행은 0개입니다.
- 실제 카탈로그 재조회: 테이블 3개 모두 RLS/FORCE RLS, 함수 5개 모두 전용 소유자, Executor 직접 쓰기·고객 조회 불허, 공개/anon 실행 불허, 로그인 비밀 없음, 관리 계정의 INHERIT/SET 관계 0개.
- 설치 후 Supabase 보안 advisor에서 이 관리자 스키마에 해당하는 항목 없음.

위 DB 역할 전환 검사는 실제 전용 로그인·TLS 또는 Owner 인증의 증거가 아닙니다. 안전한 자격증명 공급 → 전용 Executor 로그인/권한 검사 → 확인 비밀·관리자 Worker 연결 → Owner/감사 검증이 남았습니다. 크레딧·환불·계정 조치 권한은 설치하지 않았습니다.
