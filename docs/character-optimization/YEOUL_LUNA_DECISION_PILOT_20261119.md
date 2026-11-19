# 여울 — GPT Luna 단일 모델 판단/대사 분리 파일럿 (연구용)

상태: **오프라인 판단 단계 구현 / GPT Luna 호출 미연결 / 품질 미검증**. 운영 반영 금지.

## 근거와 문제
기존 117건 비교 스크립트는 `YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md`와 `YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md`를 전달하지 않고, 짧은 단일 PROMPT만 사용했다. 따라서 그 결과는 전체 여울 Runtime의 품질 판정이 아니다.

## 최소 설계
- Character Bible/Runtime 원본은 읽기 전용이며 Canon과 관계·기억을 자동 수정하지 않는다.
- 1단계: 사용자 메시지와 **외부에서 확인된 관계/사건**으로 반응 목적(intent), 태도(stance), 정서(affect)를 구조화한다.
- 2단계: GPT Luna 단일 모델이 그 판단을 대사로 표현한다. 현재 ChatGPT 대화에서 GPT Luna가 대사를 생성하도록 사용할 **수동 실행용 프롬프트 묶음**을 생성한다. 별도 API 모델 ID가 있다고 가정하지 않으며 자동 호출은 연결하지 않는다.
- 3단계: 사람 블라인드 평가로 기존 단일 프롬프트 방식과 비교한다. 동일한 모델, 동일한 캐릭터 정보, 동일한 입력을 사용한다.
- 사주 사실과 보호된 해석은 upstream authority만 결정한다. 이 실험에서는 사주 정보를 생성하거나 변경하지 않는다.

## 현재 실행
`node scripts/character-optimization/yeoul-luna-decision-pilot.mjs '{"message":"오늘 점심을 못 먹었어요.","relationship":"unknown","verifiedEvents":[]}'`

현재 분류는 작은 **규칙 기반 시제품**이다. 여울의 모든 상황을 이해하는 Planner가 아니다. Canon/Runtime에서 직접 근거를 확인한 대표 반응만 다루고, 애매한 경우에는 `ordinary`로 둔다. 감정/관계 상태를 영구 기록하지 않는다.

## 다음 작업과 차단 조건
1. 대상 모델 명칭은 사용자가 지정한 **GPT Luna**로 확정한다. 저장소의 기존 실험에서 정확한 ID `gpt-6-luna`와 OpenAI Responses API 호출 코드가 확인되었다. 임의 대체하지 않는다.
2. Runtime의 더 넓은 행동 규칙을 구조화하고, 실제 근거가 없는 관계/기억 판단을 차단한다.
3. 예산과 청구를 확인한 뒤 기존 500원 누적 상한을 초과하지 않는 범위에서만 별도 실측 실험을 검토한다. 새 유료 호출은 현재 **0회**.
4. 12~16개 대조 상황에서 원본 여울 캐릭터 식별성·자연스러움·비동조성·기억 정확성을 사람 평가로 확인한다.
5. 검증 전 GEPA 최적화·다른 모델 비교·운영 승격 없음.

기존 `docs/character-optimization/ROADMAP.md`의 GEPA 트랙 완료 상태를 변경하지 않는다. CI Integration을 재활성화하지 않는다.

## 2026-11-19 후속 구현
- `scripts/character-optimization/yeoul-gpt-luna-prompt-pack.mjs`가 실제 여울 Runtime의 핵심 섹션을 추출해 6개 수동 대화 실험 입력을 구성한다. 모델 호출이나 결제는 없다.
- `node scripts/character-optimization/yeoul-gpt-luna-prompt-pack.mjs`로 JSON을 표준 출력에 표시하거나, 인자로 새 출력 경로를 지정해 저장한다. 기존 파일 덮어쓰기는 거부한다.
- 판단 시제품은 확인되지 않은 기억 문자열을 근거로 사용하지 않고 `verified:true`인 구조화 사건만 대사 전달에 포함한다.
- 현재 ChatGPT 대화와 저장소 실행기는 직접 연결되지 않는다. 6개 실제 GPT Luna 답변 생성·사람 평가·동일 모델 대조 실험은 아직 하지 않았다.

## 2026-11-19 GitHub 기존 코드 재확인 및 추가 연결
- 기존 `yeoul-luna-one-shot-real-v1.mjs`에서 `gpt-6-luna` 모델 ID와 OpenAI Responses API 기반 선행 구현을 확인했다. 모델 미확인이라는 이전 진술은 정정한다.
- `yeoul-gpt6-luna-ab-plan-v1.mjs`: 동일 모델·동일 원본 Runtime·동일 질문을 쓰는 baseline/decision-first API 요청 페이로드 6쌍을 오프라인 생성한다. `node scripts/character-optimization/yeoul-gpt6-luna-ab-plan-v1.mjs`로 결과를 확인한다.
- 이 계획은 원본 여울 성격과 판단 의도 연결을 실제 코드로 만든 것이지 유료 추론이 아니다. 판단 규칙은 초기 가설이며 사람의 여울다운 판단과 동일하다는 근거가 없다.
- 앞선 500원 파일럿의 누적 청구가 정확히 대사되지 않았으므로 새로운 유료 호출/중복 일회성 워크플로 재실행은 금지한다. 6쌍 답변 품질은 미검증이다.

## 2026-11-19 실측 실행 연결
- 사용자가 기존 예산 대기를 해제하고 실행을 지시했다. 기존 실험의 역사적 청구 기록은 변경하지 않는다.
- `yeoul-gpt6-luna-ab-live-once-v1.mjs`는 `gpt-6-luna`를 OpenAI Responses API로 6개 합성 질문 × 기존/판단우선 각 1회, 최대 12회 호출한다. 실패 시 재시도하지 않는다.
- `.github/workflows/yeoul-gpt6-luna-ab-live-once-v1.yml`는 저장소 소유자만 main에서 수동 실행하고 비공개 검토 전 결과를 7일 보존하는 경로다. API 키는 GitHub Secret에서 읽는다.
- 이 커밋에서는 **실제 실행 미확인**. GitHub Actions 수동 dispatch와 실행 결과 확인이 필요하며 품질 개선 주장은 금지한다.

## 2026-11-19 실측 인증 실패 및 전송 경로 복구
- 첫 실측 Actions [#44463650556](https://github.com/gycha0109-beep/MyeongHa/actions/runs/44463650556)은 OpenAI direct 인증 HTTP 401로 첫 요청에서 실패했다. 실제 대사는 0쌍이며 품질 평가는 미진행이다.
- 유효했던 기존 117개 여울 테스트의 production `OPENROUTER_API_KEY`를 사용하도록 동일 `gpt-6-luna` 요청을 OpenRouter `openai/gpt-6-luna` 라우트로 전환한다. 모델 변경이 아니다.
- 인증 GET 및 모델 목록 확인 후 합성 질문 6개에 기준선 1회, Luna 판단 1회, 판단을 받은 Luna 대사 1회를 실행한다. 개별 요청 오류에서는 자동 재시도하지 않고 확보한 결과를 보존한다.
- 유료 한도 지연 사유는 사용자의 최신 실행 지시로 해제했다. 최초 500원 상한의 역사적 사용 기록을 변경하지 않는다.
- 재실행 완료 및 실제 품질 향상은 아직 확인하지 않았다.
