# 여울 GPT-6 Luna · Runtime JSON · GEPA 오프라인 비교 연결 v1

> 2026-11-17 · 연구 전용 · 실제 API 호출 0회 · Canon/Bible/Runtime 변경 없음 · 운영 승격 금지

## 변경 결정

- 여울의 **신규** 학생 모델은 OpenAI 공식 모델 ID `gpt-6-luna`로 고정한다. 이전 임시 `gpt-5.6-luna`는 잘못된 설정으로 교체한다.
- 제공자: `openai` / 직접 API 경로 프리뷰 `openai-direct`. 해당 문자열은 실제 공급자 라우팅·ZDR 보증이 아니다.
- GPT-6의 `reasoning.effort=low`에서 `temperature`를 보내지 않는다(`settings.temperature=null`). 파라미터 부적합한 조합을 사전에 거절한다.
- 공식 모델 명세: https://developers.openai.com/api/docs/models/gpt-6-luna
- 기존 DeepSeek 288건·72건·검토 자료의 출처와 식별자를 재명명하지 않으며, 신규 Luna 점수에 혼합하지 않는다.

## 오프라인 컴파일러

`scripts/character-optimization/yeoul-luna-runtime-plan-v1.mjs`

1. **A**: 서명된 연구 매니페스트의 핵심 성격 + JSON 문맥, 관계/기억 조작 금지 문구. 사용자 발화는 별도 user 역할이다.
2. **B**: A의 동일 맥락에 실제 여울 Runtime Draft v0.1에서 추출한 규칙만 추가한다. 문서 원본 SHA-256, 원문 발췌 및 문장별 해시를 보존하며 출처 불일치 시 중단한다.
3. **C**: B에 GEPA의 `character_expression` 1개만 추가한다. 기존 `intakeFrozenGepaResult` 검증을 통해서만 연결한다. 사람 승인·안전성·품질 확인이 완료되었다고 주장하지 않는다.

규칙 선택은 말의 주제에 따른 **검색 힌트**이며 감정이나 관계의 사실 판정이 아니다. 관계 이력 없는 연구 질문(Y01~Y12)만 지원하고, 애착·기억·사실을 창작하지 않는다. 반드시 필요한 R2/R7/R10/R14 경계를 유지하고, 상황별 R6 또는 R8을 참조한다. 원본 Runtime의 핵심 문구를 다시 쓰거나 문서에 없는 행동을 추가하지 않는다.

컴파일러는 OpenAI Responses API용 **미발송 요청 미리보기**만 작성한다. 추론 설정과 JSON 스키마는 제시하지만 API 키를 읽지 않고 HTTP 클라이언트를 포함하지 않는다. `requireParameters`, ZDR, 데이터 수집 금지 및 fallback 방지는 연구 정책 요구 사항이며 실제 네트워크 경로의 집행 근거가 아니다.

## 비교·평가 조건

| 군 | 고정 | 다른 요소 |
|---|---|---|
| A | 모델, 사용자 발화, 핵심 성격, 출력 JSON, 토큰 상한 | Runtime 규칙·GEPA 표현 없음 |
| B | A와 동일 | 원문 근거가 확인된 Runtime 조각 |
| C | B와 동일 | 동결된 미검토 GEPA 표현 후보 |

- 기존 12개 문항은 **legacy development only**. 봉인된 최종 품질 평가나 독립성 증거로 승격하지 않는다.
- 승인된 비공개 개발/검증 자료가 확보되면 독립 8차원, 하드 실패, 비용·지연, 사람 블라인드 평가를 진행한다.
- 기존 전체 GEPA 로드맵의 500원 상한 및 불명 청구 전역 중단을 그대로 유지한다. 이번 구현에서 유료 API, 자동 충전, 실서비스 배포는 일절 실행하지 않는다.

## 현재 구현과 한계

- 기존 `yeoul-real-response-pilot-v1.mjs`에서 `prepareYeoulLunaRuntimeAB`와 `prepareFrozenGepaYeoulLunaABC`를 제공한다.
- 기존 비교 쌍도 `gpt-6-luna`로 변경한다. 모델 설정의 파라미터 조합 오류를 수정한다.
- 실측 대사, 모델 호출 권한/잔액, 가격 인증, 네트워크 송신 게이트, 독립 홀드아웃, 사람 평가, 운영 승격은 **미구현/미확인**.
- 해당 구현은 A/B/C 프롬프트 생성 경계에 한정하며 운영 Runtime을 교체하지 않는다.

## 최소 검증

`node --test scripts/character-optimization/yeoul-real-response-pilot-v1.test.mjs scripts/character-optimization/yeoul-luna-runtime-plan-v1.test.mjs`

기존 사용자 미커밋 파일은 수정하지 않는다. 실제 LLM 호출은 승인·비용 장부와 응답 진위 검사 경로가 갖추어진 이후에만 별도 단계로 진행한다.

## 2026-11-17 — 최신 행동 우선 GEPA 후보 통합

- 현재 상위 여울 브랜치(기존 PR #3343 반영)에 이미 존재하는 `prepareBehaviorGepaYeoulPilot`의 엄격한 입력 검사를 그대로 이용해, 행동 중심 GEPA v2 연구 후보를 GPT-6 A/B/C의 C군으로 연결했다.
- `prepareBehaviorGepaYeoulLunaABC`는 후보의 원본·해시·불변 설정·아직 검증되지 않은 상태를 확인한 뒤 **요청 미리보기만 생성**한다. 실제 Luna 응답이나 품질 개선을 뜻하지 않는다.
- 여울 Runtime Draft 바이트는 SHA-256 `5a5a483aa86190d8c20d3e43fe89dab9dd6ec2fd093135f9b02080e9c323cacc`로 고정했다. 다른 문서를 전달해 호출 규칙을 바꿀 수 없고 원문 변경은 명시적인 재고정 전 차단된다.
- 이전 GPT-6 A/B/C 문서/코드는 상위 연구 상태에 맞춰 새 별도 브랜치에 보존한다. 실모델 호출·유료 사용·운영 권한 변경은 없다.