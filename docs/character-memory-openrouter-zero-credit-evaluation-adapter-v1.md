# C08 — OpenRouter 초저가 모델 Shadow 어댑터 (2026-10-20)

Watchtower-Track: character-memory

## 목적 및 현재 상태
사용자는 GitHub Actions 환경 Secret \`OPENROUTER_API_KEY\`를 등록했으며 **아직 크레딧 충전은 하지 않았다**고 명시했다. 따라서 이 변경은 **ZERO_PAID_REQUESTS / OFFLINE_IMPLEMENTATION_ONLY**다. 실호출·키 유효성·OpenRouter 잔액·모델 품질은 아직 확인하지 않았다.

기존 2026-10-20 실측 세연 첫 인사 N01의 **5-call Terra 대 3-call Luna/Terra** 데이터, 요금 및 Gold는 전혀 덮어쓰지 않는다. 3-call 경로는 공개 합성 첫 인사 Shadow 전용이며, Production Chat 경로·개인 기억·Canon·관계·DB·Grant·Reveal에 진입하지 않는다.

## 구현
- \`apps/api/src/openrouter-seyeon-evaluation-provider-v1.ts\`는 기존 \`SeyeonStructuredProviderPortV2\`를 구현한다. HTTP \`POST https://openrouter.ai/api/v1/chat/completions\`에 \`response_format.type=json_schema\`, \`strict=true\`, \`provider.require_parameters=true\`, \`zdr=true\`, \`data_collection=deny\`, \`allow_fallbacks=false\`를 강제한다.
- 임의 HTTP origin/URL, 무료 비 ZDR 모델 접미사, Production용 stage를 지원하지 않는다. 허용 stage는 \`unified_preflight_shadow\`, \`turn_interpret_render_shadow\`, \`semantic_review\` 세 개뿐이다. 모델 슬러그는 런타임 서버 config로만 결정한다.
- **실제 POST는 \`fetchImpl\`와 서버 소유 \`beforeDispatch\`(비용 사전 예약) 및 \`afterOutcome\`(성공·실패 원장 기록)을 모두 호출자가 제공해야만 가능하다.** 공급자가 임의로 실운영 요청을 보내지 않는다. 실패·청구 미확인·오류 시 자동 재호출/다른 모델·공급자로 재시도하지 않는다.
- max_completion_tokens 1~1536, 전체 본문 <=24576 bytes, 응답 <=524288 bytes, 타임아웃 <=30초를 강제. 자격증명, 요청 원문, 응답 본문, 유저 정보는 로깅하지 않는다. 추적은 숫자·한정된 상태 코드만 기록한다. 402 크레딧 부족, 비정상 HTTP, 응답 미완료, 모델 불일치, 이상한 구조·사용량, 원장 기록 실패는 모두 HOLD.
- 자체 응답 파싱만으로 최종 안전 승인하지 않는다. **기존 서버 Interpretation/Disclosure/Integrity/Risk/Renderer/Semantic Guards**의 통과가 필수다. OpenRouter의 \`strict=true\`도 엔드포인트마다 완전 보장을 의미하지 않는다.
- \`test/openrouter-seyeon-evaluation-provider-v1.test.ts\`: 네트워크 모의 응답을 3회 실제 세연 Shadow 실행 경로에 공급, 정상 공개 인사 Guard 통과·의미검증 해시 오류 차단·민감 사적 출처 조회 금지·402 및 사용량/응답 오류 차단·후킹 순서·비밀 보호를 확인한다.

## 실측 전 승인 및 남은 차단
1. 사용자가 크레딧 충전을 확인하고 **새 실측 범위·상한 비용·호출 수**를 명시적으로 승인하기 전에는 실 OpenRouter 요청을 실행하지 않는다. 이번 등록된 Secret에 대해서도 자동 인증 확인 요청을 보내지 않는다.
2. 실측 전 실제 ZDR·구조화 출력 지원 엔드포인트(공급자)와 가격, 요청별 모델/엔드포인트 보장, OpenRouter 키/예산 가드레일 설정을 별도로 검토한다. 제공자 라우팅 설정만으로 개인정보 적합성을 입증하지 않는다.
3. 승인 이후 **N01 공개 합성 1건**부터 최대 3회로 시작하며, 전 단계 numeric-only Usage, 응답 시간, 성공률·가격을 원장에 남긴다. 프롬프트/캐릭터 답변은 CI 로그·아티팩트에 쓰지 않는다. 크레딧 미충전 HTTP 402를 확인하기 위해 일부러 호출하지 않는다.
4. 실제 캐릭터 말투와 품질은 기존 C08-S 블라인드 사람 평가로 검토한다. 통과 전 Production 변경은 HOLD.

OpenRouter 공식 참고:
- https://openrouter.ai/docs/guides/features/structured-outputs
- https://openrouter.ai/docs/guides/routing/provider-selection
- https://openrouter.ai/docs/guides/features/guardrails/overview
- https://openrouter.ai/openai/gpt-oss-20b
- https://openrouter.ai/openai/gpt-oss-120b
