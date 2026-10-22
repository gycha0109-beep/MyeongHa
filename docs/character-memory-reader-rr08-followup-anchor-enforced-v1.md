# Reader 대화·메모리 — RR-08 최신 공식 답변 Anchor를 기존 후속 답변 후보에 강제 연결

Watchtower-Track: character-memory

## 앞선 이력과 현행 구현

- **#2440 병합:** Reader의 공식 구매 요약·공식 후속 질문과 일상·고민 의도 분리. Reader 답변 후보는 `publicDisclosureAuthorized:false`로 제한.
- **#2444 병합:** 일반·고민 대화에서 Reader 관계·사용자 동의 Memory의 원본/현재 Grant 후보를 구분. 개인기록 G1 Pin/Provider 양수 승인은 계속 HOLD.
- **#2447 병합:** RR-05의 서버 검증된 Official Answer Anchor와 현재 소유 Thread에 실제로 마지막 발화한 Reader 메시지 ID를 비교하는 `prepareReaderLatestAnchorContinuityV1` 구현.
- **#2451 선행 수정:** 의도와 안전/공격 신호 분리, 안전 검사가 필요한 질문은 사전 출처 HOLD, 구매 요약 문형과 승인된 Saju Domain의 일치 검사. 이 작업 브랜치는 #2451 HEAD를 부모로 사용하며 별도 운영 승인이나 새 범위를 만들지 않음.

## 연결

`prepareReaderConversationResponseCandidateV1`의 `official_followup` 경로는 더 이상 과거 `classifyCharacterStandardFollowupQuestionScopeV1`의 Anchor 선정 결과만으로 렌더링하지 않는다.

1. 서버 발행 RR-05 Preflight/Grounding의 정확한 Subject/Reading/Reader/Content/질문 일치 검사와 #2451 위험 신호 HOLD를 통과한다.
2. 기존 `anchorAuthorityPort` **및** 기존 Reader `recentMessageAuthorityPort.readRecentMessages`가 모두 있어야 한다. 어느 한쪽도 없으면 `unavailable_official_source` HOLD.
3. #2447의 `prepareReaderLatestAnchorContinuityV1`로 서버가 저장한 최신 공식 Assistant의 `assistantMessageId`와 실제 Thread의 최근 Reader Assistant 메시지 ID가 같은지 확인하며, 전후 Transcript metadata drift를 감지한다. RR-05의 도메인·입력 검사/Anchor 선택은 해당 함수에서 **한 번만 실행**한다. 일치하지 않거나 중도 변경되면 `latest_anchor_not_current` HOLD.
4. 반환받은 서버발행 `questionScope`를 기존 RR-06 bounded candidate/Renderer Output Guard에 전달하고, Unit 목록 및 최종 `assistantAnchorMessageId`가 최초 확인된 것과 동일함을 확인한다.
5. 반환 결과에는 공식 Anchor 메시지 ID·본문을 제외한 대화 메타데이터 digest를 담아 이후 RR-09/10 최종 재검사 연계를 위한 **비권한 후보**로 보유한다. 최종 사용자 공개·Commit 권한은 결코 만들지 않는다.

## 회귀 및 한계

- 실제 서버발행 합성 Preflight/Grounding·RR-05 Anchor와 실제 메시지 읽기 포트를 이용한 합성 양성 사례에서 기존 bounded output HOLD로만 도달하는지, Anchor 조회 1회와 Transcript 전후 2회를 검사한다.
- 일반 대화 Reader Assistant가 끼어든 경우, 조회 중 drift, 메시지 읽기 포트 누락, 클라이언트 가짜 Preflight와 Output Guard 불일치는 모두 HOLD. 개인 메시지 본문을 새 후보나 Hash/로그에 포함하지 않는다.
- RR-03/04 DB Owner의 공식 Writer/Anchor, RR-07/P0-AI, RR-09/10 원자 Commit/철회, RR-11/12 HTTP/UI, Security G1 Pin은 **기존 소유 트랙 승인 전까지 보류**. 이 코드는 새 저장 권한·공개 응답·추가 LLM 호출을 만들지 않는다.
- Reader Runtime과 세연 C08 일반 3회 Shadow Provider는 혼합하지 않음. 새로운 상담 제품 모드, 사주 판단, 유료 실험, Production/Public 라우팅 변경 없음.
