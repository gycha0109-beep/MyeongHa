# Reader 대화·메모리 — RR-08 최신 실제 Answer Anchor → 기존 후속 Renderer 연결

Watchtower-Track: character-memory

## 적용 경로 및 기존 소유권

- PR #2440으로 구현한 `prepareReaderConversationResponseCandidateV1`의 **공식 후속 질문 분기**에 PR #2447의 `prepareReaderLatestAnchorContinuityV1`을 실제 연결한다. 일반·고민 대화 분기와 공식 짧은 요약 분기는 기존 계약을 유지한다.
- PR #2451에서 구현한 질문 위험 신호 사전 `security_gate_pending` 및 구매 요약의 RR-05 정확한 Domain 검사는 이 분기보다 먼저 시행되어야 한다. 본 브랜치는 그 PR의 HEAD `e7951425...`에 기반하므로 #2451 자동 병합 이후 main으로 합류할 때 해당 변경을 보존한다.
- 기존 DB 소유 `ValidatedStandardFollowupAnchorAuthorityPortV1` 외에 이미 존재하는 `ReaderContextNonMemoryReadAuthorityPortV1.readRecentMessages` 포트를 공식 후속 질문에만 요구한다. 새 SQL 권한/조회 함수는 추가하지 않는다.

## 실제 변경

1. 서버가 발행한 `preflight`와 `grounded`, Reader의 최근 메시지 조회 포트 및 가장 최근 검증된 Official Anchor 조회 포트가 모두 필요하다.
2. `prepareReaderLatestAnchorContinuityV1`는 기존 RR-05 질문 범위와 보안 신호 부정 필터를 적용하고, 실제 Thread의 **가장 최근 Reader Assistant 메시지 ID**와 DB 검증 공식 Anchor의 `assistantMessageId`를 대조하며, 조회 전후 메시지 메타데이터 변경 여부를 확인한다.
3. 검증된 `continuity.questionScope` 객체를 기존 `prepareCharacterStandardReaderBoundedCandidateV1` → `guardCharacterStandardReaderFinalOutputV1`에 그대로 인계한다. **같은 Anchor를 중복 조회하거나 모델 분류 호출을 늘리지 않는다.**
4. 실제 Reader 메시지 조회 포트가 없는 기존 호출자, 오래된 Official Anchor, 검증 실패, 위조된 객체, 범위 변경 등은 `official_latest_anchor_not_admitted` HOLD를 반환한다. **과거 직접 RR-05 조회로 fallback하지 않는다.**
5. 기존 Guard의 최종 결과는 계속 `official_followup_output_hold`이며 `publicDisclosureAuthorized:false`, `addedModelCalls:0`. Renderer 후보를 실제 Assistant 공개 답변, 공식 원본 또는 기록 저장 성공으로 승격하지 않는다.

## 미해결 선행 조건

- RR-03/04 DB Owner의 불변 Official provenance Writer 및 실제 latest validated Anchor 쿼리, RR-07 P0-AI 표현 정책, RR-09/10 최종 원자 Commit/철회 경합, RR-11/12 인증 HTTP/UI/Records.
- 현재 대화 순서 검사는 DB의 원자 transaction Pin이 아니며, 최종 RR-09 검증을 대체하지 않는다. G1 개인정보 Pin 및 Security Owner의 긍정 사용 결정 없음.
- Reader Runtime과 세연 일반 Chat/C08 실모델 3-call Shadow는 계속 별도 경로다. 네 번째 LLM 호출, 새로운 사주 결론, 상담 제품 모드, 유료/운영 공개 활성화 없음.

## 테스트

`test/reader-conversation-source-routing-v1.test.ts`는 위조 preflight/grounding과 빠진 최신 메시지 조회 경계를 HOLD하고, 구현이 실제 `continuity.questionScope`를 기존 Renderer/Guard로 전달하는지 검사한다. 기존 `test/reader-conversation-latest-anchor-continuity-v1.test.ts`는 순서 뒤바뀜, 다른 Reader, 동일 Anchor가 아닌 최근 일상 답변, 개인정보 본문 배제 등 부정/연속성 사례를 유지한다.

본 구현은 **공개 불가 내부 호출 연결**에 한정된다. 완전한 Reader Chat E2E 합격이나 모든 최신 Anchor positive E2E 실행을 주장하지 않는다.
