# 세연 실대화 G0 원본 검증 함수 누락 — 운영 복구 경계

Watchtower-Track: security

## 확인된 장애

- 운영 Cloudflare `POST /api/chat/:threadId/turns` 로그: 2026-10-31 17:54 UTC, PostgreSQL `42883`. 생성된 시도는 `failed_retryable`, GLM의 유료 호출·정산 성공 근거는 없음.
- 운영 PostgreSQL 17에서 `qry_seyeon_g0_current_source_%`와 `assert_current_original_%` 함수가 조회되지 않음. 현재 코드 `postgres-seyeon-production-context-read-v1.ts`는 두 공개 조회 함수를 호출하므로 운영 실행과 DB 설치 상태가 불일치.
- 이 문제는 OpenRouter 비밀키나 관리자 채팅 크레딧 면제와 독립적임.
- 요청 실패를 503으로 바꾸는 기존 G3 경계를 해제하거나, 과거 메시지를 임의로 지우거나, 임시 무원본 응답을 내보내지 말 것.

## 즉시 적용된 코드 보호

`seyeon-first-positive-memory-fetch-delivery-v1.ts`는 인증된 Subject, receipt readiness 확인 후 아래 4개 검증 함수의 정확한 signature, SECURITY DEFINER, 고정 owner, 공개 역할의 EXECUTE 차단과 앱 실행 역할의 허용/차단 여부를 검사한다. 하나라도 불일치하면 **새 Chat Receive/Attempt 생성 및 모델 호출 전** 503으로 HOLD하고, 운영 로그에 고정 키 `MYEONGHA_SEYEON_G0_READINESS_HOLD`만 남긴다.

## 운영 SQL 설치 조건 — 기존 스테이징 SQL의 독립 운영 검토 필요

다음 파일은 원래 `scripts/operations/seyeon-security-s0/`에 들어 있는 **격리 S0 전용** 변경으로, main 병합만으로 운영 DB에 설치되지 않는다. 보호 절차를 무시하고 자동 마이그레이션에 추가하지 않는다.

1. `15-g0-original-member-user-message.sql`: 커밋된 원본 사용자 메시지 검증. 기존 owner/role, 참조 테이블, private schema 존재 확인
2. `13-g0-current-original-lineage-context.sql`: 승인된 기억 원본과 과거 세연 메시지 검증 및 최근 메시지 접근. `lock_positive_source_registry_v1`, `lock_original_memory_grant_v1`, `lock_memory_subject_v1` 등의 권한과 RLS 확인
3. `14-g0-relationship-event-original-lineage.sql`: 관계 이벤트 원본 증명과 행 수준 접근 정책. `qry_production_relationship_history_runtime_v1` 및 3개 관계 테이블의 정책·권한 확인

위 순서는 호출 의존 관계 기준이며, **운영에 적용해도 된다는 승인이 아니다.** 사용자가 운영 변경을 진행해 달라고 요청한 것은 작업 허용이지만, 스테이징 전용 SQL이 운영 안전 조건을 충족하는지는 별도로 검증해야 한다.

운영 SQL 읽기 전용 사전/사후 확인:
`scripts/operations/seyeon-security-s0/production-g0-original-lineage-readiness-readonly.sql`

모든 `installed`, `approved_owner_and_definer`, `executor_boundary`, `restricted_public_roles`가 true인지 확인해야 한다. 기존 `anon`, `authenticated`, `service_role`에 새 실행 권한을 부여하지 않는다.

## 메시지 재시도 경계

실패한 Chat Turn을 자동 폐기하지 않는다. 기존 `failed_retryable` User 입력, Client Turn ID, DB Attempt 및 개인 정보 출처를 임의로 변경하지 않는다. 원본 검증 함수 설치 후 같은 attempt의 재시도/재전송 가능성을 **idempotency·receipt 계약에 따라** 별도 확인한다. 새 Client Turn ID 발급으로 회복 불가능한 중복 처리 가능성을 만들지 않는다.

## 종료 기준

- 운영 DB에서 4개 original-lineage 함수 및 최소 권한 확인
- 운영 요청에서 `42883` 미재현, 검증되지 않은 역사 출처는 그대로 HOLD
- 해당 사용자에게 허용된 1회 응답의 receipt 발급·ACK·결제 governor reservation/settlement 모두 증거로 확인
- 문제가 없는 경우에만 실대화 완료로 보고
