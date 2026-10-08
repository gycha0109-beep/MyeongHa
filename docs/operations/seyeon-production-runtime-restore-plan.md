# 세연 Production 대화 런타임 — 운영 DB 복구 승인 계획

> 상태: **미실행**. 2026-10-08 Production 읽기 전용 감사(run `37731756672`, job `113162237387`)의 증거에 기반한 제한된 복구 설계.
>
> Watchtower-Track: character-memory

## 관찰된 사실

- ContentManifest 조회 `public.qry_content_bundle_manifest_v1(uuid)`: 존재.
- 세연 관계 조회·관계 동기화·개인 기록 조회·관계 이력 조회·대화 상태 처리·커밋·사후 분석: 감사에서 검사한 12개 정확한 시그니처가 확인되지 않음.
- `myeongha_api_executor`, `myeongha_relationship_apply_owner`: 존재.
- `myeongha_seyeon_chat_runtime_owner`, `myeongha_seyeon_post_turn_owner`: 존재하지 않음.
- migration history: `1460`, `1470`, `1480`, `1490`, `1500`, `1510`은 미적용; `20261008043000`은 적용.
- 세연 실제 전송 경로는 `chat_execution` 단계에서 SQLSTATE `42883`. HTTP 200 / DB 커밋 / replay는 **미확인**.
- `to_regprocedure(signature) IS NULL`은 정확한 시그니처 부재를 의미하며, 같은 이름의 다른 오버로드 존재까지 배제하지 않는다.

## 허용되는 변경 범위

이미 리뷰된 파일을 다음 순서로만 적용하는 것이 검토 대상이다.

1. `supabase/migrations/1460_seyeon_production_relationship_runtime_read_v1.sql`
2. `supabase/migrations/1470_seyeon_relationship_sync_outbox_v1.sql`
3. `supabase/migrations/1480_seyeon_production_context_runtime_v1.sql`
4. `supabase/migrations/1490_seyeon_production_chat_execution_runtime_v1.sql`
5. `supabase/migrations/1500_seyeon_post_turn_analysis_runtime_v1.sql`
6. `supabase/migrations/1510_seyeon_production_runtime_composition_v1.sql`

새로운 SQL 정의를 즉석에서 생성하지 않는다. 이들 마이그레이션은 전용 역할 생성, 제한된 GRANT, 공유 테이블에 세연 범위 RLS 정책 추가, SECURITY DEFINER 함수 설치를 포함하므로 단순 함수-only 배포로 표현해서는 안 된다. `1510`의 ContentManifest ACL은 `20261008043000`에서 복구한 상태여서 중복 적용의 의미가 동일한지 다시 확인한다.

**금지:** 전체 `supabase db push --include-all` 실행, 일반 Production 배포의 강제 dispatch, 관계 상태 baseline 생성, 회원 row 또는 대화 row 열람·수정, 다른 트랙의 미적용 migration history 조작, 브라우저 역할에 EXECUTE 확대, RLS 비활성화.

## 실행 전 A 게이트 — 읽기 전용

- Production 프로젝트 ID `cnsfpcdiyofqvhpcegfc` 및 정해진 DB 연결 호스트 확인. 비밀값 출력 금지.
- 6개 버전의 history가 모두 미적용인지 재조회하고, 정확한 함수 시그니처와 *동명 오버로드*가 부분 설치돼 있지 않은지 검사. 변화가 있으면 중단하고 재감사.
- 마이그레이션이 참조하는 기존 테이블·핵심 함수 및 `myeongha_api_executor`, `myeongha_relationship_apply_owner` 권한 검사. 결핍 시 시작 금지.
- 적용할 6개 SQL의 해시가 CI 검증한 커밋과 일치하고, 종속 migration이 실제 Production에 있는지 확인.
- `production` environment 승인·동시 실행 잠금(`supabase-production-migrations`) 및 비밀값 가림.
- 사전 조건이 만족되지 않으면 **DDL/DML·migration repair 모두 0건**으로 종료.

## 실행 B 게이트 — 정확한 원자적 SQL

- 6개 SQL만 순서대로 **하나의 트랜잭션**으로 적용한다. 실행 중 SQL 실패 시 SQL 변경 전체 롤백. 세연 외 대기열에는 손대지 않는다.
- SQL 트랜잭션 성공을 확인한 뒤 **적용한 정확한 6개 버전만** Supabase migration history에 기록한다. SQL 실패 상태에서 history 기록 금지.
- SQL 성공 후 history 기록이 일부 실패하면 즉시 배포 실패로 보고하고, 독립 재감사 전 자동 재실행 금지. SQL 재실행과 migration history 보정을 구분해 복구한다.
- 정책·오너십·함수 EXECUTE의 사후 불변식 검사(브라우저 역할 차단, API executor의 정확한 EXECUTE만 허용). 프로덕션 platform-integrity 읽기 전용 검증도 유지한다.

## 검증 C 게이트 — Production 실제 대화

- 운영 Web/배포 SHA 일치, Member 재인증, 세연 단일 active release 확인.
- `POST /api/chat` 생성 또는 기존 thread 조회 후 `POST /api/chat/:threadId/turns` 전송.
- 첫 응답 HTTP 200 및 AI 답변의 authoritative DB readback 확인.
- 동일 `clientTurnId` + 동일 텍스트 재전송에서 `replayed=true`, 기존 receipt 불변 확인. Member 재인증 후 읽기 유지.
- 성립하지 않으면 Issue #1700 닫지 않음. 스모크 재시도는 같은 사용자/전송 idempotency를 손상하지 않도록 운영.

## 안전 검사 및 현재 제한

전용 Production 복구 워크플로의 저장소 추가가 연결 도구 안전 검사에서 차단되어, 이 계획의 실행은 **승인되지 않았으며 시작하지 않았다**. 차단을 우회하거나 기존 일괄 배포 워크플로로 대체하지 않는다. 재현 가능한 근거와 범위를 리뷰한 후 승인된 운영 경로에서만 수행한다.
