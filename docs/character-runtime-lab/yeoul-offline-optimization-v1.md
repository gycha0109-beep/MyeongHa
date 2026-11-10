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

- 예를 들어 여울 DeepSeek 단일 모델 × 비공개 홀드아웃 신규 상황 10개 × 프롬프트 후보 4개 × 반복 2회면 **80개 신규 응답**이 필요하다. 기존 DeepSeek 72개 공급자 보고 비용 합계 `$0.00691712`를 단순 환산한 값은 매우 거친 참고치일 뿐 **비용 한도/승인 금액이 아니다**.
- 실제 유료 호출 전에는 사용자가 별도로 상한 금액·모델·교사/채점 호출 포함 여부·중단 조건을 승인해야 한다. 이번 실행에서 유료 호출은 없음.

### 비공개 결과 실행 예

```sh
node --test scripts/character-runtime-lab/yeoul-quality-offline-v1.test.mjs scripts/character-runtime-lab/yeoul-offline-optimizer-v1.test.mjs
node scripts/character-runtime-lab/yeoul-quality-offline-v1.mjs --input /private/yeoul-evaluations-all-288-clean.json --out /private/yeoul-quality-output
```

리뷰된 신규 대사의 결과가 별도로 생성되기 전에는 `summarizeReviewedComparisons`가 검증용 프레임일 뿐 성공 결과가 아니다. `sealed_holdout_results`는 후보 수정에 재사용하지 않는다.
