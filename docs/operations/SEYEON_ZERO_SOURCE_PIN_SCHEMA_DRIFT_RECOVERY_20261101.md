# 세연 기억 0건 첫 답장 장애 — 증명 항목 규격 불일치 복구

Watchtower-Track: security

## 확인된 장애

- 운영 Worker 신규 세연 대화방의 전송 2회에서 PostgreSQL 오류 `23514 / seyeon_zero_source_pin_invalid` 발생. 두 요청 모두 `chat_execution` 단계에서 중단됐으며 GLM 모델 호출·비용 정산 전.
- 새 대화방은 정상 생성됐고 사용자 원본 메시지 1건이 보존됨. 해당 Chat Turn은 `failed_retryable`, Attempt 2건도 실패 상태이며 사전 모델 출처 증명이 저장되지 않음.
- 운영 DB `cmd_mark_seyeon_chat_context_ready_pinned_v1`의 기존 1640 버전은 `exactModelSourceSelection`을 **8개 항목**으로 제한. 현재 서버 `selectSeyeonExactModelPersonalSourcesV1`는 원본 출처 검증 확대를 위해 `selectedUnpinnedDerivedSources`와 `selectedModelSourceCensusDigest`가 추가된 **10개 항목**을 생성한다.
- 이는 크레딧·OpenRouter 설정 오류가 아니라 **서버/DB 원본 증명 스키마의 버전 불일치**다.

## 실제 운영 복구 (2026-11-01)

- 기존 고정 마이그레이션 `supabase/migrations/1640_...`을 수정하거나 재실행하지 않음.
- `scripts/operations/seyeon-security-s0/production-17-zero-source-selection-census-pin-20261101.sql`을 별도 원자적 운영 변경으로 적용. Supabase 운영 DB `apply_migration` 성공.
- 기존 DB-owner 함수의 나머지 본문과 상태 전이·시도 잠금은 유지한 채 정확히 8 → 10개 항목만 수정.
- 추가된 원본 출처 감시 필드 2개는 **존재만 허용하지 않고**, `selectedUnpinnedDerivedSources=[]`, 선택된 기억 0개, 원본 선택 digest와 전체 출처 집계 digest가 실제 빈 출처의 `canonicalJson` SHA-256과 동일해야 통과. 임의의 파생 기억·거짓 digest를 허용하지 않음.
- 기존 DB 보안 소유자 `myeongha_seyeon_chat_runtime_owner`와 SECURITY DEFINER 유지. 익명/일반 사용자 실행 금지, `myeongha_api_executor`만 EXECUTE 유지.
- 한시적 역할 SET 및 public schema CREATE 권한은 트랜잭션에서 복원하고 사후 검증: 운영자 역할 원래 관리자격/비상속/역할전환 불가, schema CREATE 미부여 확인.

## 남은 실제 검증

- 오류 후 남은 안정된 `clientTurnId`의 정상 재시도를 사용자 브라우저에서 **한 번만** 실행. 기존 사용자 메시지를 삭제하거나 임의로 새 `clientTurnId`를 발급하지 않음.
- 그다음 운영 Cloudflare 로그에서 `seyeon_zero_source_pin_invalid` 재발 여부, 운영 DB에서 정확한 pre-model Pin·최종 Assistant/ACK, OpenRouter GLM 모델 호출 및 governor 비용 예약/정산을 확인해야 함.
- 이 DB 함수 복구가 이후 모델 실행·검토·HTTP 수신 단계의 성공을 보장하지 않는다. 새로운 단계 오류가 발생하면 그 오류를 근거로 추적한다.

## 회귀 검사

- `test/seyeon-zero-source-census-production-contract-v1.test.ts`: 실제 서버 선택 결과(10개 항목), zeroProof(14개 항목), 빈 출처 SHA-256, 역할 복원 및 운영 SQL 보안 계약 검증.
- 실 사용자 개인 대화 본문을 fixture/로그에 사용하지 않으며, 추가 유료 호출을 자동 실행하지 않는다.

## 2026-11-01 후속 보정 — 최신 12개 선택 항목

- CI #41241214634 / `Work Track · security`에서 `uses the currently generated exact ten-key selection shape` 1건 실패. 런타임은 `selectedCurrentUserSource`, `selectedUnpinnedRecentSources`를 추가한 **12개** 선택 항목을 생성하며, 기존 운영 DB는 10개만 수용한다.
- 신규 독립 적용 스크립트: `scripts/operations/seyeon-security-s0/production-18-zero-source-current-user-pin-20261101.sql`. 먼저 설치된 10개 계약, 함수 소유자·실행 권한·역할 상태를 확인한 후 12개 계약으로 한정 교체한다.
- 기존 기억 0건/파생 출처 0건의 제한 유지. 새 `selectedUnpinnedRecentSources`는 정확히 빈 배열이어야 하고, `selectedCurrentUserSource`는 같은 Subject·Thread·Turn의 미삭제 사용자 메시지 하나를 가리켜야 한다. PostgreSQL에서 원문 정규화 SHA-256과 전체 모델 출처 집계 SHA-256을 독립 재계산하고 두 값 모두 서버 선택 증명과 일치해야 한다.
- 기존 1640 migration과 이미 적용된 production-17 스크립트는 수정하지 않는다. 임시 스키마 CREATE/역할 전환은 단일 트랜잭션에서 복원되고 운영 메시지·비용 원장은 변경하지 않는다.
- **상태:** 코드 브랜치 반영. 실제 Production SQL 적용, 보안 CI 통과, GLM 첫 답장, HTTP ACK 및 정산 결과는 별도 증거가 나올 때까지 미확정.
- **범위 제한:** 기존 과거 메시지가 포함된 연속 대화는 아직 허용하지 않는다. 이후에는 과거 User/Assistant 메시지도 원본 DB·접근권한과 정확하게 대조하는 별도 승격이 필요하다.
