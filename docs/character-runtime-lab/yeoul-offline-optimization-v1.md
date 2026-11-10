# 여울 AI 품질 개선 — 오프라인 실험 준비 v1

> 2026-11-10 · Character Runtime Lab · 연구 전용 · Production OFF · Watchtower-Track: character-runtime-lab

## 목적과 기존 실험

- 기존 OpenRouter/DeepSeek 경로, 운영 모델과 비용 정책, Character Bible/Runtime, 기억·관계·사주·결제 권한은 변경하지 않는다.
- 4모델 × 3조건 × 12질문 × 2반복의 288개 평가를 그대로 재사용한다. 실험 실행: https://github.com/gycha0109-beep/MyeongHa/actions/runs/42572722295
- 평가 원본 `yeoul-evaluations-all-288-clean.json`은 저장소에 공개하거나 덮어쓰지 않는다. 이전 원본 export의 자동 변별력 입력은 평가로 보지 않는다.
- 확인된 원데이터: 288건, 중복 0, 사용자 `good` 94건, 부정 평가 194건, 의견 117건, `good` 중 추가 메모/플래그 11건. 즉 깨끗한 긍정 **후보** 83건(승인된 대사 83건이라는 뜻이 아님).

## 실행

```sh
node --test scripts/character-runtime-lab/yeoul-quality-offline-v1.test.mjs
node scripts/character-runtime-lab/yeoul-quality-offline-v1.mjs --input /private/yeoul-evaluations-all-288-clean.json --out /private/yeoul-quality-output
```

입출력은 사용자가 선택한 비공개 경로로 지정한다. **현재 작업 디렉터리(저장소) 내부로 결과를 쓰는 것은 거부한다.** 출력: `summary.json`(입력 SHA-256), `records.jsonl`(모든 원본 행·평가·메모·상세플래그를 원형 보존한 구조화 자료), `example-candidates.jsonl`(검토 전 우수 사례 후보), `pairwise-candidates.jsonl`(동일 질문/조건의 관찰적 선호 쌍), `teacher-inputs.jsonl`(교사 호출 전 검증 대기 자료). 온라인 호출, 가중치 학습, 운영 수정은 일어나지 않는다.

## 라벨과 승인 경계

- 원본 `evaluation.rating`, 자유 의견, 세부 플래그는 그대로 둔다. `questionDiscrimination=null`과 그룹 변별력 공란을 검증한다.
- 진단 태그는 `user_rating`, `user_detail`, `note_heuristic_unconfirmed`로 출처를 구분한다. 노트의 표현으로 자동 추출한 태그는 확정된 사용자 판정이 아니다.
- `good`이면서 노트나 플래그가 있으면 `positive_with_caveat`, 그렇지 않으면 `clean_positive_candidate`다. 후자는 추가 Canon/한국어 검토 전에는 여전히 사용 금지다.
- 두 다른 생성 응답 간 `pairwise`는 관찰된 선호 후보일 뿐 프롬프트 우열의 인과 증거가 아니며 DPO 학습용 정답으로 승격하지 않는다.
- 예시 검색은 `reviewStatus='approved'`와 실제 관계 단계, 과거 사용 가능 여부, 별도로 승인된 사실의 일치를 모두 요구한다. 기본 산출물에는 승인된 예시가 없으므로 실제 검색 결과는 0건이다.
- 연구 프롬프트의 `baseline/language_rules/conversation_examples/hybrid`는 기존 런타임으로부터 별도 핀된 인격 anchor를 받는다. 생성물은 `offline_candidate_only`, 모델 라우팅 `unchanged_no_routing`이며 사용 전 별도 오프라인 검토가 필요하다.

## 품질 평가와 홀드아웃

- 기존 Y01~Y12는 **개발/회귀 분석용**이며 향후 실제 품질 개선 주장 근거가 아니다.
- `docs/character-runtime-lab/yeoul-holdout-scenarios-v1.json`은 신규 평가 설계 전용으로 두며 변환기와 프롬프트 교사 입력에서 불러오지 않는다.
- 새 평가축: 한국어 자연스러움, 여울의 행동 선택, 주도성, 대화 흐름, 장황함·반복, 관계 단계, 비용/지연. 허위기억·Canon/권한 위반은 가산점이 아니라 **필수 실패 조건**이다.
- 교사 모델 산출물은 반드시 `pending_teacher_and_human_review`를 거치고, 홀드아웃으로 검증될 때도 모델 호출 수·예산·비용 한도에 대한 별도 승인이 필요하다.

## 근거 우선순위와 미완료

1. 현재 공개/승인된 불변 Character Content 및 Relationship/Memory 권한이 최우선이다.
2. `docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md`, `docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md`는 내용 근거지만 헤더는 DRAFT다. 그것만으로 Production 승인 또는 새로운 캐릭터 사실을 만들지 않는다.
3. `packages/character-content/src/runtime-authoring-v1.ts`의 현재 여울 행동 프로젝션과 2026-11-08 Worklog의 **옛 부드러운 인격 요약 수정**을 확인한다.
4. 프론티어 교사 실행, 최적화 실행, 288건 원본에 대한 실제 파일 변환기 재실행(현재 샌드박스 원본 바이트 마운트 불가), 대사 승인, DeepSeek 재실험, 신규 평가셋 실측, 운영 승격은 아직 미완료다.

GEPA/DSPy는 자체 reflective LM과 평가용 LM 호출을 반복하는 구조이므로 허가 없는 자동 실행 대상이 아니다. 공식 자료: https://github.com/gepa-ai/gepa , https://dspy.ai/api/optimizers/GEPA/overview/ . 추가 상시 서버나 GPU 학습을 요구하지 않는다.

## 2026-11-10 후속 오프라인 구현 — 진단 반영 및 자동 검증 준비

- `yeoul-offline-optimizer-v1.mjs`가 기존 **사용자 원라벨/부가 플래그**와 **미확인 자유 의견 추출**을 별도로 계수한다. Canon/Runtime을 대체하지 않는 정해진 행동 개선 문구 후보를 만들지만, 모든 문구는 `pending_character_owner_review`이며 모델 품질을 입증하지 않는다.
- 기존 변환기를 실행하면 비공개 출력 폴더에 `feedback-revision-proposals.json`, `optimization-preflight.json`, `approval-estimate.json`도 생성한다. 첫 파일은 행동 규칙 제안, 둘째는 4개 기존 프롬프트 형태의 비실행 계획, 셋째는 신규 평가의 호출 수 및 역사적 호출당 비용을 이용한 참고치다. **교사 모델 호출·실험 승인·프롬프트 배포는 모두 0건이다.**
- `retrieveReviewedExamples`는 캐릭터 소스 두 개의 리뷰 근거, 관계 단계, 허용 기억 여부, 승인된 사건 목록을 검증한다. 문맥이 완전히 다른 예시는 억지로 채우지 않는다. `buildResearchPromptPlan`에도 동일한 이중 검증을 둬 직접 예시를 끼워 넣는 우회를 차단한다.
- 비공개 변환기 출력 경로는 현재 실행 위치뿐 아니라 코드가 설치된 실제 Git 저장소 루트도 검사한다. 위반 시 입력·출력을 처리하지 않는다.
- `summarizeReviewedComparisons()`는 향후 **실제 인간이 별도 검토한 신규 응답 결과**만 접수해 품질 다섯 축, 사실/사생활/관계의 필수 실패 세 축, 지연·비용을 나란히 보여준다. 홀드아웃을 개선 규칙의 재료로 사용하지 않고, 자동 최종 우승자를 고르지 않는다.
- 로컬 Node 실행 결과: 수정 전 6개 테스트 + 후속 5개 테스트 = **11개 PASS**. 실제 288 원본 JSON의 파일 바이트 경로는 이 세션에서 도구가 제공하지 않아 실제 CLI 입력 실행은 별도 대기한다. 기존 수동 평가는 이미 검증된 원본을 변경하지 않는다.

### 라이브러리 호환성 확인과 현재 선택

- [DSPy 공식](https://dspy.ai/)에서 3.4.1 공개 안내 및 `dspy.GEPA` 방식 확인. [GEPA 공식 저장소](https://github.com/gepa-ai/gepa)의 `optimize_anything`는 실제 평가 함수와 생성 모델을 연결하는 별도 실험 도구다. GEPA를 단순 로컬 점수표로 위장하지 않는다.
- [Promptfoo 공식](https://www.promptfoo.dev/docs/usage/node-package/)은 Node.js 22.22.0+를 요구하고 24 LTS를 권장한다. 저장소는 Node 24를 요구하므로 런타임 방향은 맞지만, [평가 실행](https://www.promptfoo.dev/docs/configuration/guide/)에 provider를 연결하면 비용이 발생할 수 있다.
- 따라서 현재 구현은 **의존성 추가 없는 Node 오프라인 평가/피드백 준비**를 선택한다. GEPA/Promptfoo 설치나 유료 자동 탐색·프론티어 교사 생성은 승인 이후 별도 진입한다. 역사적 288개 사용자 라벨의 차이는 새 프롬프트의 인과적 개선 근거가 아니다.

### 승인 전 실험 계획 참고치

- 여울 DeepSeek 단일 모델 × 신규 홀드아웃 상황 10개 × 프롬프트 후보 4개 × 반복 2회는 **80개 시나리오 실행**이다. 그러나 신규 상황 H02/H05/H09는 각 2턴이며 매 사용자 턴에 실제 모델 응답을 생성해 대화 흐름을 검증하므로 **최소 104회 모델 호출(상황 내 총 13턴 × 4후보 × 2회)**이다. 이전의 80회 API 호출 추정은 불충분하여 정정한다. 기존 DeepSeek 72개 공급자 보고 비용 합계 `$0.00691712`를 단순 환산한 값은 매우 거친 참고치일 뿐 **비용 한도/승인 금액이 아니다**.
- 실제 유료 호출 전에는 사용자가 별도로 상한 금액·모델·교사/채점 호출 포함 여부·중단 조건을 승인해야 한다. 이번 실행에서 유료 호출은 없음.

### 비공개 결과 실행 예

```sh
node --test scripts/character-runtime-lab/yeoul-quality-offline-v1.test.mjs scripts/character-runtime-lab/yeoul-offline-optimizer-v1.test.mjs
node scripts/character-runtime-lab/yeoul-quality-offline-v1.mjs --input /private/yeoul-evaluations-all-288-clean.json --out /private/yeoul-quality-output
```

리뷰된 신규 대사의 결과가 별도로 생성되기 전에는 `summarizeReviewedComparisons`가 검증용 프레임일 뿐 성공 결과가 아니다. `sealed_holdout_results`는 후보 수정에 재사용하지 않는다.


### 실제 정제 JSON 비용 차이 확인과 파서 수정

2026-11-10 이 세션에서 개인 파일 보관함의 `yeoul-evaluations-all-288-clean.json` 전체 7,596줄을 다시 파싱하여 다음을 확인했다.

- `responses.length = 288`; `(model, variant, id, repeat)`의 고유 조합 `288`; 메모 `117`; 긍정+주의사항 `11`; 질문 변별력 전건 미평가.
- 실험 메타데이터 `sourceExperiment.providerReportedCostUsd = 0.04236847`.
- `responses[*].providerReportedCostUsd` 합계 `0.04232348479999998` (수치 오차를 무시하면 `0.0423234848`).
- 합계 차이 `(실험 총액 - 개별 응답 합계) = 약 0.0000449852 USD`. **원인은 미확인**이며 재청구, 누락, 재시도 등 특정 원인을 임의로 단정하지 않는다.
- 초기 파서는 이 둘이 일치하지 않으면 거부했으나 정제본 실제 내용과 충돌한다. 수정한 파서는 메타데이터 비용, 개별 합계, 차이, 미정 원인 상태를 별도로 유지한다. `costReconciled = false`는 보존하며 원본 JSON에 쓰지 않는다.

### 교사 모델 출력의 오프라인 접수 계약

- 교사 API를 **호출하지 않고**, 출력이 나중에 제출될 경우 `stageTeacherSuggestion({teacherInput, teacherOutput})`가 입력 출처·기존 12개 개발 질문·여울 Runtime에 정의된 행동 ID·허용 사실·공유 기억 사용·관계 진전 여부를 확인한다.
- 출처 불명, 허가되지 않은 사실 ID, 존재하지 않는 여울 행동, 관계 증거 없는 공동 기억·연애 상태 승격, 홀드아웃 입력을 거부한다.
- 형식 검사를 통과해도 문장 내부의 숨은 사실/말투 오류를 자동으로 증명할 수 없으므로 결과는 `pending_character_owner_review`에 머무르며 Production으로 자동 승격하지 않는다.
- 신규 테스트 추가 후 로컬 Node 13개 PASS. 이번 단계에 새로운 유료 교사·DeepSeek 호출은 없다.


### 2026-11-10 — 반복·멀티턴 홀드아웃 준비 수정 (유료 호출 0건)

- **실제 검출한 결함:** 기존 사람 평가 집계는 동일 후보·상황의 2회 반복을 중복으로 간주해 기각했다. 이제 상황+반복 회차 키로 10개 신규 상황 × 4후보 × 2회를 정확하게 집계한다. 후보마다 20개가 모두 있어야 하며 빠진 반복·임의 추가 후보·중복·미평가 셀을 검증한다.
- 기준 후보 `baseline`과 상황·반복 회차를 맞춘 품질 축별 차이와 허위기억/권한 위반의 신규 발생 건수를 **관찰 통계**로만 계산한다. 자동 우승자 선정이나 실제 향상 선언은 없다.
- 홀드아웃 평가축 이름을 코드와 일치시켰다: `initiative_and_flow`, `brevity_and_repetition`. 이 파일은 평가 실행 이전의 설계 파일이며 평가 사용자 응답을 수정하지 않았다.
- 사전 확인 스크립트 `scripts/character-runtime-lab/yeoul-benchmark-preflight-v1.mjs`는 실행 계획만 만든다. 공개 설계 파일을 입력으로 받으며 비공개 대사·질문 문장, 실제 서비스 사용자 데이터를 출력하지 않는다. SHA-256을 고정하여 향후 검토된 평가 결과가 다른 홀드아웃 버전에서 왔는지 확인 가능하다. 이 해시는 작성자/평가자의 진위 증명은 아니다.
- **80회는 시나리오 실행 수이지 API 호출 수가 아니다.** 3개 2턴 시나리오가 있으므로 시나리오마다 모든 턴의 AI 대사를 실제로 생성하는 계획의 학생 모델 호출은 **104회**다. 요청 실패, 재시도, 교사, 자동 채점, 답변 교정 호출은 제외한 수치다.
- 기존 DeepSeek 72응답의 보고 비용 `$0.00691712`에서 단순 외삽하면 학생 호출 104회의 참고 비용은 약 **$0.00999140**이나 **지출 상한·결제 승인으로 사용할 수 없다**. 추가 모델 호출·프롬프트 길이·재시도가 변수를 만든다.
- 실행 전 조건은 별도 사용자 승인 모델/공급자·총 USD 상한·최대 호출 수·중단 조건·교사/채점 예산·비공개 연구 입력·검토된 후보 프롬프트이다. 본 PR 코드는 `status=approval_required_not_executable`, `externalCalls=0`만 생성한다.
- 실행 예(외부 호출 없음):

```sh
node scripts/character-runtime-lab/yeoul-benchmark-preflight-v1.mjs docs/character-runtime-lab/yeoul-holdout-scenarios-v1.json
node --test scripts/character-runtime-lab/yeoul-quality-offline-v1.test.mjs scripts/character-runtime-lab/yeoul-offline-optimizer-v1.test.mjs scripts/character-runtime-lab/yeoul-benchmark-preflight-v1.test.mjs
```

- 검증 19개 로컬 PASS(Node.js 22 도구 환경). 저장소 CI는 Node 24를 기준으로 별도 검증한다. 최종 배포/실험 품질은 확인되지 않았다.

### 검토된 DeepSeek 프롬프트 4종의 실제 조립 — 오프라인 후보만

- `scripts/character-runtime-lab/yeoul-reviewed-prompt-bundle-v1.mjs`의 `compileReviewedPromptBundle()`는 기존 288회 실험에서 사용한 `PERSONA_CORE` 문자열을 **별도 검토·해시 고정한 원본**으로 받아 연구용 프롬프트를 조립한다. 이 도구 자체가 Character Bible/Runtime의 승인/배포 권한을 만드는 것은 아니다.
- 언어 규칙은 `RULE_CATALOG`에 있는 문구와 동일하며 명시적 캐릭터 책임자 검토 기록·기존 두 문서 출처가 있는 것만 허용한다. 관련 출처 없는 새 Canon, 프롬프트 문구 임의 변경, 중복 규칙은 거부한다.
- 대화 예시는 **기존 Y01~Y12 개발 평가 출처**, 관계 단계·기억 사용·승인된 사실·주제 유사도, 별도 대사 검토 기록을 만족할 때만 선택한다. 사용자 이력 없는 상황에서 친밀 관계 예시를 가져오지 않는다. 홀드아웃 질문(H01~H10)은 개선 후보 검색/조립에 사용하지 않는다.
- `baseline / language_rules / conversation_examples / hybrid` 네 후보를 조립하되, 검토된 규칙이나 예시가 없으면 해당 후보는 `blocked_pending_review`가 되고 프롬프트 텍스트는 `null`이다. **현재 승인된 실제 288개 예시 수가 확인되지 않았으므로 네 후보 모두 준비되었다고 주장하지 않는다.** 테스트의 검토 기록과 대사는 합성 예시이며 사용자 승인으로 간주하지 않는다.
- 생성한 프롬프트는 `offline_candidate_only` 상태, 해시 기록, 기존 DeepSeek 선택·JSON 출력·OpenRouter 보안 옵션 유지, `externalCalls=0`, `productionEligible=false`이다. 리뷰 표시는 서명/권한 증명이 아니며 실제 사용자 검토, 예산 승인과 독립 성능 측정은 별개 조건이다.
- 로컬에 비공개 평가 JSON 결과를 저장할 때는 출력 디렉터리를 가능한 한 권한 `0700`, 파일은 `0600`으로 생성한다. 이미 파일이 존재하면 덮어쓰지 않으며, 출력 디렉터리가 저장소 안을 가리키는 심볼릭 링크인 경우 저장을 차단한다. 사용자의 원본 평가 JSON과 기존 출력은 덮어쓰지 않는다.
- 신규 의존성·GPU·유료 API 호출·서비스 라우팅·운영 프롬프트 변경은 없다.

### 2026-11-10 — 실제 288건 오프라인 변환 및 우수 대사 검토 큐
- 개인 파일 보관함의 정제 JSON을 줄 단위 텍스트 추출로 7,596줄 복원해 288행/288개 조합의 구조·원사용자 평가를 유지한 채 기존 `runOffline`을 **실제로 실행**했다. 사용자 평점을 수정하거나 생성·재채점하지 않았다.
- 비공개 폴더에서 83개 깨끗한 긍정 대사 **검토 후보**, 205개 교사 수정 입력 **미승인 후보**, 386개 관찰적 비교쌍을 출력했다. 비용 메타데이터/행별 합계 차이는 원인 미확인 상태로 각각 보존된다.
- **출처 정밀도 제한:** 원본 raw-file 바이트를 직접 취득한 것은 아니다. 개인 보관함의 텍스트를 8개 구간으로 복원한 파일로 실행했으므로 `sourceSha256`은 **복원 텍스트**의 해시이지 원본 첨부파일 자체의 검증된 원본 해시가 아니다. 값이나 줄 단위 자료 구조의 재검증과 바이트 동일성 검증을 구분한다.
- `yeoul-example-review-queue-v1.mjs`: 12개 기존 개발 질문마다 최대 2개씩, 우선 DeepSeek에서 후보를 고르되 사용 가능한 경우 다른 모델도 포함하여 사람 검토용 24개 후보를 **비공개 파일** `example-review-queue.json`으로 생성한다. 표본 추출 순위는 품질 우열이 아니며 모두 `pending_canon_and_language_review`, 승인 0건이다.
- 검토 공백: **Y07에는 DeepSeek의 주의사항 없는 긍정 대사 후보가 0개**이므로 다른 모델의 후보를 넣더라도 DeepSeek의 Y07 개선을 증명할 수 없다.
- 전체 83개 원본 긍정 후보는 그대로 별도 보존. 사용자 검토 없이 프롬프트 예시 승격/운영 적용하지 않는다. 관련 27개 로컬 테스트 PASS(Node 22); 저장소 CI는 Node 24. 외부 유료 호출 0건.
