# 명하 Character Chat × Saju Reading — 2026-11-20 구현 인계

> 기준 저장소: `gycha0109-beep/MyeongHa`
> 최초 검토 main: `f68cf815d2bb66cb87821a48e6da2e04f4c0ed55`
> 후속 문서 반영 main: `c3a7fca7117c4c582c5b71b5da35950a3a2e0037` (PR #3391)
> Track: `character-runtime-lab`
> 성격: 기존 사실·사용자 결정·남은 검토 지점의 기록. 신규 API 호출, 모델 실측, 운영 활성화, 해석 권한 변경 없음.

## 1. 확정된 것과 확정되지 않은 것

- **챗봇 기본 모델 선정 결정:** OpenRouter `deepseek/deepseek-v4.1-flash-1017`.
- Kimi K3, GLM-5.3, GPT-6 Luna는 **기본 챗봇 모델 후보 재비교 대상에서 제외**한다. 사용자 요청 없이 순위 비교 반복 금지.
- 이 결정은 **모델 선택**이며 실제 Production 라우팅 적용·캐릭터 콘텐츠 공개·GEPA 최적화 성공이 아니다. 운영 배포는 별도 확인/승인에 따른다.
- **장문 사주 보고서 작성 모델은 미선정**이다. DeepSeek과 Gemini Flash 계열은 보고서용 비교 후보일 뿐 우열이 입증되지 않았다.
- 새로운 유료 API 호출은 사용자별 별도 지출 승인 전 금지한다. 이전 실험의 승인·예약액을 새 실험 승인으로 재사용하지 않는다.

## 2. 기존 실측 — 재실행하지 않음

| 실험 | PR / Actions | 범위와 관찰 |
|---|---|---|
| GLM-5.3 vs DeepSeek 단발 | [#3387](https://github.com/gycha0109-beep/MyeongHa/pull/3387) / [run](https://github.com/gycha0109-beep/MyeongHa/actions/runs/44690417818) | 248자 공통 여울 프롬프트로 각 9회, 총 18/18 성공. 9회 비용 GLM $0.001707 / DeepSeek $0.001330 |
| DeepSeek 다중 턴 | [#3388](https://github.com/gycha0109-beep/MyeongHa/pull/3388) / [run](https://github.com/gycha0109-beep/MyeongHa/actions/runs/44694617531) | 합성 사용자 메시지 10턴×3, 총 30/30 성공. 비용 $0.00301038 |
| Kimi K3 단발 | [#3389](https://github.com/gycha0109-beep/MyeongHa/pull/3389) / [run](https://github.com/gycha0109-beep/MyeongHa/actions/runs/44696519721) | 공통 9개 상황, 9/9 성공. 비용 $0.0810864 |

- 단발 총비용 간 비율은 동일 토큰 사용량에서의 단가 차이가 아니다.
- DeepSeek은 장난→진지함, 사과, 확인된 호감·선호 변경의 문맥 연결이 유망했으나 **없는 과거 직장 관계를 사실처럼 만들었고**, 상투적 건강 걱정/츤데레 반응이 반복됐다.
- 합성 사용자 대화 기반이므로 실제 자유 대화, 장기간 관계 기억, 사람의 최종 문체 선호를 검증한 것은 아니다.
- 사용자 비공개 목표 대사/사람 평가 원문/원본 파일은 GitHub·CI·공개 아티팩트로 옮기지 않는다.

## 3. 캐릭터 품질 및 운영 경계

여울은 단순 츤데레 지침이 아니라 자존심·장난·경쟁심·자연스러운 한국어 카톡식 존댓말을 상황에 따라 드러내는 캐릭터다. 상담사식 위로, 과장된 연극, 억지 비유, 반복 말버릇, 근거 없는 관계·기억·사주 사실 생성은 실패 조건이다.

현재 로드맵: `docs/character-optimization/ROADMAP.md`.
- 공통 규격 / 평가·권한 / GEPA 오프라인 / 여울 파일럿 준비: **각 부분 구현**.
- 유료 GEPA 파일럿 / 다른 캐릭터 확대 / 운영 승격: **미착수**.
- 비공개 사람 검토·독립 봉인 평가·네트워크 비용 승인·운영 승격의 미완료 조건 유지.
- 캐릭터 기억의 승인된 오프라인 읽기 구현 완료와 실제 Provider/Production 활성화는 별개다. `docs/character-memory-context-engineering-roadmap-v1.md`와 `docs/operations/CHARACTER_MEMORY_WORKLOG.md`를 따를 것.
- 완결 근거가 없으므로 **ROADMAP_COMPLETE 미선언**.

## 4. 확인된 사주 공식 Reading → Reader 실행 경로

Saju 원천 저장소: `gycha0109-beep/Saju`. 이 문서 작성 시 확인 main: `b46a09c3bd0f2390becf868b71dab74d2e2c9e45`.
해당 커밋은 공식 재물운 한국어 해석의 근거 기반 설명을 보강했다. 이것이 새로운 LLM 보고서 모델을 선정했다는 뜻은 아니다.

기존 authority 흐름은 다음과 같다.

```text
Birth Input / Calculation Policy
→ Canonical Saju Snapshot
→ governed T0~T8 (필요한 요청에 한하여 T9/T10/T11)
→ Interpretation Claim Graph
→ ReadingIntent / DomainReadingProfile / Authorization
→ Evidence Selection / Governed Narrative
→ Official ProductReadingResponse / immutable Reading record
→ Saju-owned CharacterGroundingBundle admission
→ Character perspective/plan/rendering
→ Semantic Preservation Guard / Output Guard
→ authorized Reader Scene & post-Reading conversation
```

- 공식 사주 의미 생성은 **Saju 엔진만** 수행한다. MyeongHa의 제품·Reader·LLM은 없는 claim, 운의 시기, 사건, 자산 규모, 수익률, 투자 판단을 만들지 않는다.
- 공식 Reading은 캐릭터와 독립적이며 재사용 가능. Reader마다 권한/지식 범위를 따로 갖고 같은 공식 결과를 서로 다른 표현으로 해설할 수 있다.
- 관련 설계: `docs/READER_INTERPRETATION_RUNTIME_V1.md`, `docs/OFFICIAL_STANDARD_READING_READER_INTERPRETATION_V1.md`, `docs/MyeongHa_UX_Reading_Reader_Knowledge_Spec_v1.1.md`.
- Product DB에 원본 사주 Claim Graph를 복제하거나 별도 의미 생성 엔진을 두지 않는다.
- Reader Production 공개 활성화는 별도 통제 대상. `apps/api/src/reader-production-rollout-policy-v1.ts`의 public 활성화 상수는 검토 당시 `false`이고, `docs/PRODUCTION_READER_INTERPRETATION_ACTIVATION_GATE_V1.md`의 모드는 `off` / 제한된 `internal_preview`뿐이다.

## 5. 이미 존재하는 장문 보고서/보충 해설 구현

MyeongHa에는 다음 **태겸 전용 재물운 보충 서술** 코드가 있다.

- `apps/api/src/official-wealth-luna-reader-v1.ts`: 공식 발급 Reading에서 장별 근거·제약을 추출하고, sourceAnchor, 장 제목·순서, 반복/금지 표현, 근거 없는 재정 미래 예측을 검사한다.
- `apps/api/src/openai-official-wealth-luna-writer-v1.ts`: 기존 GPT-6 Luna 기준 챕터 JSON Schema, Source 기반 지시문, 모델 응답 검증, 비용 예약 및 durable write 경계.
- `apps/api/src/openrouter-official-wealth-luna-writer-v1.ts`: 해당 보충 서술 경로의 OpenRouter 모델은 `openai/gpt-6-luna`로 고정. **DeepSeek 챗봇 선정 결정으로 이 보고서 경로를 몰래 교체하지 않는다.**
- 기존 코드의 source anchor와 문자열 금지 검사는 모든 문장의 명리적 의미 보존을 완전히 증명하지 않는다.

Saju 쪽 `docs/product/37-official-reading-detailed-material-authority-contract.md`는 공식 `standard`를 지원하며, 공식 `detailed`는 현재 미승인 상세 의미 재료가 부족할 때 `standard`로 안전 대체하는 경계를 유지한다.
따라서 **검증된 공식 Reading의 장별 Reader 보충 해설 후보 평가**와 **공식 상세형 해석 엔진 준비**를 혼동하지 않는다.

## 6. 보고서용 모델 비교 — 미실행 계획

1. 이미 발급·검증된 동일한 공식 재물운 Reading을 사용한다. 실제 고객 정보 대신 승인된 합성/비식별 입력을 사용한다.
2. 동일한 source chapters/semantic units, 명리 제약, 공식 claim·모호성·금지 확장, 요구 JSON 구조를 DeepSeek 및 Gemini Flash 후보에 제공한다.
3. 모델이 바꿀 수 있는 것은 독자 친화적인 서술과 캐릭터별 표현뿐이다. 공식 원문과 근거는 불변이다.
4. 공통 품질축: 새 claim 발생 여부, 근거 누락, 모호성/한정 손실, 한국어 장문 가독성, Reader 화법 적합성, 구조화 출력 통과율, 실제 입력/출력/재시도 비용.
5. 실제 모델 ID, 공급자, JSON Schema 지원 범위, 현행 요금 및 최악 비용은 **실행 직전 최신 공식 공급자 자료로 검증**한다. 이 기록에 임의 단가/승인 상한을 고정하지 않는다.
6. 동일 근거를 Reader별로 재사용한다. 후속 대화는 기존 챗봇 선정과 각 Reader 읽기 권한을 별도로 따른다.
7. 여울 전용 유료 보고서는 여울의 발표/권한/표현 계약을 확인한 뒤 연결한다. 기존 태겸 전용 `source`와 model type을 임의 치환하지 않는다.
8. 사용자 **새 유료 모델 실험 승인 전 호출 0회**. 결과를 보지 않고 최선 모델을 확정하거나 새 운영 라우팅을 열지 않는다.

## 7. 다음 작업의 순서

1. 최신 MyeongHa/Saju main 및 기존 로드맵/Worklog를 재확인하고 실험 전용 실행과 운영 라우팅을 분리한다.
2. 이미 존재하는 공식 Reading 발급·Reader Knowledge·Report writer의 실제 입력/출력 및 재사용 가능 범위를 읽는다.
3. 검증된 동일 공식 근거와 모델 중립적 출력 검증 기준을 정한다. 새로운 semantic source/DB를 만들지 않는다.
4. 사용자가 보고서 모델 비교를 지시하고 비용 승인 시 제한된 실측을 진행한다. 대신 기억 개선을 선택하면 기존 Character Memory/GEPA 로드맵 미완료 항목부터 진행한다.
5. 모든 운영/판매 활성화는 별도 승인·기존 authority gate를 따른다.

## 8. 금지 및 검토 메모

- 공개 저장소에 사용자 작성 목표 대사, 개인 평가 원문, 비공개 대화, 자격 증명, 개인정보를 넣지 않는다.
- 종전 실험을 재실행하거나, 챗봇 기본 모델 선정과 장문 보고서 모델 선정·운영 배포를 동의어로 취급하지 않는다.
- 로컬 Windows 체크아웃의 작업 트리/미푸시 상태는 이 문서가 확인한 사실이 아니다. GitHub 원격 상태와 로컬 파일은 별도 확인한다.
- 이 문서는 **기존 코드/설계 확인의 handoff**이며 새 제품 로드맵, 신규 검증·권한 체계 또는 모델 승격 권한이 아니다.
