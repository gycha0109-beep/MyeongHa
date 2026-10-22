# Reader 대화·메모리 — 의도 × 위험 신호의 독립 판정, 사전 출처 HOLD

Watchtower-Track: character-memory

## 기존 RR-05/06/08 이어가기

PR #2440의 `classifyReaderConversationIntentV1`은 공식 요약·공식 후속 질문·일상·고민·명확화의 **사용자 의도**와 prompt injection·자해·위협의 **독립적인 위험 신호**를 함께 반환한다. 이 신호는 기존 Security Gate가 최종 판단하는 **보조 관측값**이지 안전 승인이나 정책 판정이 아니다.

기존 `prepareReaderConversationResponseCandidateV1`이 위험 신호가 있는 공식 요약·후속질문에서도 검증 자료 접근을 시도할 수 있는 경로를 막는다.

## 수정

- 응답 후보 생성 함수 초입에서 `intent.securitySignals.length !== 0`이면 `hold('security_gate_pending')`를 반환한다.
- 이 차단은 `input.official` 조회, Reader Saju 근거/Guarded Scene 처리, source closure, Model/Renderer 시도보다 앞선다.
- 고민·일상 의도도 위험 신호를 보유할 수 있다. 의도와 안전을 하나의 단일 분류 결과로 융합하지 않고, 안전 결정을 기존 Security Owner에게 그대로 보류한다.
- **위험 신호가 없다는 것만으로 안전 판정을 PASS하지 않는다**. 후보 전체는 `publicDisclosureAuthorized:false`이고 별도의 Production/security gate가 계속 필수다.
- 새로운 상담 모드·새 권한·제4 LLM 호출·유료 API 호출·DB write·Public/Production route 변경 없음.

## RR-05 구매 요약 도메인 교차 오염 차단

기존 유료 Reader 요약 의도는 문장에 `요약`과 `사주`가 포함돼 있다는 이유만으로 해당 구매 Reading의 사주 근거를 반환해서는 안 된다. 특히 `wealth`만 서버에서 승인된 상태에서 `방금 본 직업 해석을 요약해 주세요`를 현재 wealth 근거로 처리하는 것은 의도-출처 불일치다.

- 기존 RR-05 `DOMAIN_NAMES`를 그대로 재사용하는 `classifyExactOfficialReadingSummaryReferenceV1`을 추가한다. 구매한 사주 자체의 정확한 요약 문형 또는 **동일 승인 Domain**의 `방금 본 … 해석 요약` 문형만 admit한다.
- 다른 Domain, 다른 사람, 새 기간/계산, 지원되지 않는 자유 문형은 clarification/HOLD. Source Grant/Content/Meaning/계산 권한은 여전히 기존 서버 Reader Preflight/Guard가 맡는다.
- 공격·위험 신호가 결합한 공식 요약 문장은 의도/신호를 서로 독립적으로 남기되, 위 `security_gate_pending` 분기에서 출처 접근 전에 반드시 HOLD한다.

## 회귀

`test/reader-conversation-source-routing-v1.test.ts`에서 공격 신호가 포함된 공식 사주 요약, 후속질문, 위험이 있는 일상/고민의 `official` getter가 호출되지 않는지 확인한다. 안전한 일상/고민에서는 기존 비공개 후보 경로를 유지한다.

관련 기존 작업: #2440(의도 분리), #2444(동의 Memory/관계 출처), #2447(RR-08 최신 Answer/Anchor 대조). 현 PR은 #2447의 CI와 독립적인 기존 메서드 내 부정 경계만 수정하며 RR-03/04/09~12 권한/공개 완료를 주장하지 않는다.
