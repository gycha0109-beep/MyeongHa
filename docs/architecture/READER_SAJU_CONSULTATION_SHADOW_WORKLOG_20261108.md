# Reader 사주 상담형 AI 비공개 평가 — 구현 워크로그 (2026-11-08)

> 상태: **IMPLEMENTED CANDIDATE / PUBLIC OFF / PAID-LIVE HOLD**
>
> Watchtower-Track: reader-runtime
>
> 공식 범위: [Reader Runtime V2 종료 로드맵](READER_RUNTIME_V2_TRACK_CLOSEOUT_ROADMAP.md)의 Reader×Saju Grounding, 제한적 SP-2 구현·평가 경계. 승인되지 않은 의미/상품/AI 공급자 권한은 이 문서가 부여하지 않는다.

## 사용자 목표

- 실제 숙련된 사주 상담자가 고객의 팔자를 풀어주듯, **핵심 판정 → 삶의 구체적인 의미 → 명리 근거 → 유리·불리한 조건 → 공식적으로 허가된 시간 흐름**으로 전달.
- Saju가 의미·근거·시기를 소유, MyeongHa 캐릭터가 발화 순서·말투를 소유. AI 두 단계를 거쳐 명리 내용을 바꾸지 않음.
- 동일한 공식 판독으로 백헌·세연의 차이를 비교하되 없는 명리 판단을 창작하지 않음.

## 실제 코드

1. `apps/api/src/character-saju-consultation-shadow-v1.ts`: 공식 Reader 접근·Source·Semantic Guard 통과 뒤에만 첫 번째 해석 단위 1개를 상담형 후보로 생성, SP-2 의미 보존 검토 후 검증 성공/실패와 무관하게 **고객 출력 변경 없음**.
2. `apps/api/src/openai-saju-consultation-shadow-port-v1.ts`: OpenAI Responses API의 structured output 요청 2회(상담문 생성 + 독립 의미 검토) 구현. `store:false`, 고정 최대 출력 토큰, 응답 크기/시간 제한. 서버 비용·호출권한 확인 콜백/결과 정산 콜백이 없으면 연결 불가.
3. `apps/api/src/reader-saju-consultation-budget-gate-v1.ts`: 공식 Reading 참조·원본 해시·평가 세션에 묶인 **원자적 예약 권한 어댑터**. 모델별 서버 제공 단가, 요청 크기·출력 토큰 상한을 적용해 최악 비용을 선예약. 실제 비용이 확인되지 않으면 예약 비용을 유지한다. **진짜 비용/접근권한 DB는 이 파일에서 만들지 않는다.** 제공자가 아니라 DB Authority가 예약·정산을 보장해야 한다.
4. `apps/api/src/reader-saju-consultation-editorial-evaluation-v1.ts`: 동일한 공식 첫 판독 단위를 풀어낸 두 Reader에 대해 **의미 보존(모델 가드)과 상담 품질(사람의 명시적 판단)을 분리**한다. 초반의 개별 판단, 질문에 대한 구체적 답, 근거-실생활 연결, 자연스러운 캐릭터 말투, 반복 없는 내용의 5항목을 각 캐릭터에 평가. 리뷰가 없으면 점수/합격을 만들어 내지 않으며, 두 캐릭터가 모두 통과해도 `single_official_unit_only`/공개 불가/유료 상품 전체 합격 아님.
5. `apps/api/src/reader-saju-private-pair-comparison-v1.ts`: 같은 공식 판독 단위와 같은 원문을 백헌·세연이 어떻게 풀었는지 **서버 내부에서만** 나란히 검토하는 메모리 기반 수집 기능. 비공개 원문·결과는 브라우저/운영 로그에 출력하지 않음.
6. `apps/api/src/reader-interpretation-preview-runtime-v1.ts`: 기존 공식 풀이가 통과한 다음 shadow 평가를 선택 호출. 원래 반환 구조·기존 고객 해석 유지.

## 검증 파일

- `test/reader-interpretation-preview-runtime-v1.test.ts`: 접근 불가면 모델 미호출, 공식 결과 동일, 두 Reader 같은 Unit 비교, 내부 evidence만 별도 수집.
- `test/openai-saju-consultation-shadow-port-v1.test.ts`: 가짜 OpenAI 응답으로 실제 API 요청 형식·별도 리뷰·토큰 계량·서버 예산 어댑터 연결.
- `test/reader-saju-consultation-budget-gate-v1.test.ts`: 비용 예약, 모델 미승인, 한도 초과, 외부 승인 실패, 카운터 미확인 시 과금 보수적 보류.
- `test/reader-saju-consultation-editorial-evaluation-v1.test.ts`: 사용자가 실제 평가하지 않은 문장을 자동 합격 처리하지 않고, 불명확한/불리한 판정, 잘못된 캐릭터, 이전 후보의 평가를 거부. 해당 품질 판정은 전체 상품 품질과 고객 공개 권한이 아님.
- `test/saju-character-grounding-cross-service.e2e.test.ts`: 인증된 실제 Saju 호스트의 공식 Grounding 반환값을 새 상담형 후보·검토 경로로 넘기는 E2E 추가. 기존 Reader 결과 불변·Grant 회수 시 모델 미호출을 확인. **사주 입력은 합성 테스트 Reading이고 AI 응답은 가짜**, 실명식/실모델 품질 증거가 아님.
- `test/reader-saju-private-pair-comparison-v1.test.ts`: 출처 불일치·캐릭터 중복·권한 없는 비교 차단.

## **아직 하지 않은 일**

- 실제 제공자 API 키를 사용한 과금 모델 네트워크 호출 **0회**. 위 모델 테스트는 모두 가짜 응답.
- 서버 실행 환경에서 **실제 승인된** 모델 단가·예산/정산 DB 권한 객체·공식 Reading 실행 ID 연결 미완료. `beforeDispatch` 구현만으로 예산 집행 승인을 가장하지 말 것.
- 현재 비교와 상담 품질 평가는 공식 판정 **첫 단위 1개**. 실사주 전체 상담문·분야별 실제 품질 비교·상용화 검증 미완료.
- Saju Career의 일부 심화 방법론/해석 소스 권위가 아직 미충족이므로, 없는 Career 결론·시기·상품 가치를 만들어내지 않음.
- 기존 로드맵 `P0-AI-01`(모델/실패 정책) 및 공급자 승인, 최종 Reader Chat 근거 DB 계약, 구매/Reader 권한 등 출시 전제는 그대로 유지.

## 다음 구현 단계 및 조건

1. Reader 트랙의 승인된 가격·모델·실패 정책, 실생산비용 전용 권한이 확인되면 **전용 원자적 DB 예산 예약·영수증 저장 기능**을 위 어댑터에 연결한다. 운영 환경 직접 계량 전에는 내부 오프라인 평가만 허용한다.
2. Saju 공식 Grounding과 해당 구매 분야가 검증되면 실제 원본 자료를 사용하여 동일 판독의 캐릭터별 후보 전문·근거 추적·좋음/불리함·불확실성 보존을 비교한다. 연구/테스트 결론을 Production 승인으로 격상하지 않는다.
3. 관측된 품질·비용·타임아웃·fallback 증거를 충족하면 기존 로드맵에 규정된 별도 제한적 노출 절차를 적용한다. 임의 공개·패키지 추가·새 모델 채택 금지.

## 최신 API 확인

[OpenAI Responses API 참조](https://developers.openai.com/api/reference/resources/responses/methods/create) 및 [Structured Outputs 가이드](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)의 `text.format` 엄격 JSON 스키마 구조 기준. 스키마 준수는 명리 의미 보존을 자동 보장하지 않으므로 기존 Semantic Guard 및 별도 검토를 필수로 한다.

**종료 판정:** 완료 아님. PR 필수 CI 통과 및 실비용·공식 명리 근거·실제 상담 품질 증거가 필요함.
