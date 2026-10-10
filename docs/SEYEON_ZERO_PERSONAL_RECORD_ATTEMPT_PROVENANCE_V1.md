# #1843 — 세연 서버 소유 0건 Provenance 영속 결속 v1

Watchtower-Track: security

## 실제 운영 변경

세연 Production Chat에서 정상적인 Context Assembly 직후 기존 `assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1`가 개인 Memory/Life Fact 사용을 차단한 뒤, `createSeyeonAttemptZeroPersonalProofV1`가 다음 항목을 **서버에서 생성**합니다.

- canonical Subject / Thread / Turn / Attempt / `characterId='seyeon'`
- 현재 모델 Context의 개인기록 0건에 대한 `explicit_zero_admitted` 명시 상태
- Projector가 지원하지 않아 제외된 레코드 **건수만** (ID/원문 없음)
- 정형화된 검증 자료의 `sha256:v1` 무키 체크섬

증명은 **모델 호출 전에** 생성되고, 기존 `persistValidated`의 `validationResult.personalRecordProvenance`로 전송되어 `chat_turn_attempts.validation_result_jsonb`에 저장됩니다. 기존 `cmd_validate_chat_turn_attempt_v1`와 진행 상태 Trigger는 검증 이후 `validation_result_jsonb` 변경을 금지합니다. 기존 `cmd_commit_seyeon_chat_turn_runtime_v2`는 변경하지 않았습니다.

따라서 DB 신규 테이블, 직접 DML 권한, Public HTTP Route, 별도 워크플로는 필요하지 않습니다. 기존 검증 명령의 Subject/Turn/Attempt 결속과 검증 뒤 불변성을 재사용합니다.

## 안전 한계

**이것은 개인기록 사용에 대한 운영 승인이나 임의 Grant의 진실을 증명하지 않습니다.**

- `explicit_zero_admitted`는 실제 모델 Context에 개인 Memory/Life Fact가 포함되지 않았다는 서버의 보수적인 관측입니다. `UNSUPPORTED_SCHEMA` 기록은 모델에 투입되지 않아 0건으로 취급합니다.
- 새로운 positive Projector 활성화는 여전히 HOLD입니다. Memory/Life Fact가 발견되면 기존 사전 차단 및 신규 Proof 모두 모델 이전에 실패합니다.
- 미등록 Provenance가 있어도 기존 v2 Commit DB 함수는 지금 이를 의무화하지 않습니다. 따라서 이미 만들어진 과거 턴의 권한이나 `committed_replay`의 공개를 승인하지 않습니다.
- 무키 SHA-256은 위변조 감지용 자료일 뿐 서명이나 신뢰 가능한 DB Grant 증명이 아닙니다.
- 모델의 개인기록과 무관한 다른 Context, 최근 메시지에 남아 있는 과거 개인정보, Relationship/Reader 지식 등에 대한 권한 정합성은 별도 검토가 필요합니다.
- 서버 생성 시점은 Context Assembly 이후/모델 이전이나 **영속 저장은 Output Guard 검증 시점**입니다. 모델 실행 중 중단된 Attempt에는 검증 결과가 존재하지 않습니다. DB Owner의 선행 Pin 구조는 별도 필요합니다.

## 다음 Owner 작업

1. Character-memory / DB Authority Owner 승인 후 **raw payload/type/schema 정확한 Digest와 Grant/Record ID의 불변 Attempt Pin**을 원천 Context Read 단계에 추가. 제출 텍스트/모델 응답으로 증명 생성 금지.
2. 전진 전용 Migration에서 위 불변 데이터를 최종 `cmd_commit_seyeon_chat_turn_runtime_v2`의 트랜잭션과 결속하여 exact Grant/Memory/Life Fact를 잠근 뒤 Commit.
3. 실제 PostgreSQL 두 세션 취소 경쟁, `committed_replay` 및 HTTP Reveal 직전 권한 조회 수행. Reader 구매 권한 #1827과 분리.

## 불변

비용사고 HOLD, 유료 AI 추가 호출 0회, V1 보안 지시문, 모델 호출 라우팅, 비활성 개인기록 Projector 및 공개 경로를 유지합니다.

완료 판정: **Zero-record Attempt Provenance persistence = 구현; positive Grant atomic Commit·Reveal = HOLD**.
