
### 검토된 DeepSeek 프롬프트 4종의 실제 조립 — 오프라인 후보만

- `scripts/character-runtime-lab/yeoul-reviewed-prompt-bundle-v1.mjs`의 `compileReviewedPromptBundle()`는 기존 288회 실험에서 사용한 `PERSONA_CORE` 문자열을 **별도 검토·해시 고정한 원본**으로 받아 연구용 프롬프트를 조립한다. 이 도구 자체가 Character Bible/Runtime의 승인/배포 권한을 만드는 것은 아니다.
- 언어 규칙은 `RULE_CATALOG`에 있는 문구와 동일하며 명시적 캐릭터 책임자 검토 기록·기존 두 문서 출처가 있는 것만 허용한다. 관련 출처 없는 새 Canon, 프롬프트 문구 임의 변경, 중복 규칙은 거부한다.
- 대화 예시는 **기존 Y01~Y12 개발 평가 출처**, 관계 단계·기억 사용·승인된 사실·주제 유사도, 별도 대사 검토 기록을 만족할 때만 선택한다. 사용자 이력 없는 상황에서 친밀 관계 예시를 가져오지 않는다. 홀드아웃 질문(H01~H10)은 개선 후보 검색/조립에 사용하지 않는다.
- `baseline / language_rules / conversation_examples / hybrid` 네 후보를 조립하되, 검토된 규칙이나 예시가 없으면 해당 후보는 `blocked_pending_review`가 되고 프롬프트 텍스트는 `null`이다. **현재 승인된 실제 288개 예시 수가 확인되지 않았으므로 네 후보 모두 준비되었다고 주장하지 않는다.** 테스트의 검토 기록과 대사는 합성 예시이며 사용자 승인으로 간주하지 않는다.
- 생성한 프롬프트는 `offline_candidate_only` 상태, 해시 기록, 기존 DeepSeek 선택·JSON 출력·OpenRouter 보안 옵션 유지, `externalCalls=0`, `productionEligible=false`이다. 리뷰 표시는 서명/권한 증명이 아니며 실제 사용자 검토, 예산 승인과 독립 성능 측정은 별개 조건이다.
- 로컬에 비공개 평가 JSON 결과를 저장할 때는 출력 디렉터리를 가능한 한 권한 `0700`, 파일은 `0600`으로 생성한다. 이미 파일이 존재하면 덮어쓰지 않으며, 출력 디렉터리가 저장소 안을 가리키는 심볼릭 링크인 경우 저장을 차단한다. 사용자의 원본 평가 JSON과 기존 출력은 덮어쓰지 않는다.
- 신규 의존성·GPU·유료 API 호출·서비스 라우팅·운영 프롬프트 변경은 없다.
