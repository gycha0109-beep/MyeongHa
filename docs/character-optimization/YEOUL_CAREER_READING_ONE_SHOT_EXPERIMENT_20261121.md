# 여울 개인화 사주 해설서 — DeepSeek 단독 실험

목표: 사용자가 검토한 여울 해설서 v0.2를 임시 품질 목표로 삼아, **공식 Saju 근거를 DeepSeek V4.1 Flash 1017이 직접 여섯 장으로 작성하는 경로**만 검증한다.

- Reader: 여울. 공식 해설서 모델 Claude Sonnet 5.5는 이 1차 실험에서 호출하지 않는다.
- 운영/구매/Reader 권한 미연결. 다른 Reader와 기존 공식 Reading에는 영향 없음.
- 실제 공식 Reading은 Saju가 검증·발급한 직업·커리어 자료만 사용한다. 입력의 `sourceKind` 표시 자체는 발급 진위 증명이 아니므로 사용자가 승인된 비식별 fixture를 별도로 준비/검토한다. **가상의 예문으로 실제 사주 정확도를 평가하지 않는다.**
- 공개 저장소에 고객 정보, 사람 검토 원문, 승인 JSON, 모델 출력 원문, 접근키를 추가하지 않는다.

### 사용법

```powershell
node --test scripts/character-optimization/yeoul-career-reading-one-shot.test.mjs
node scripts/character-optimization/yeoul-career-reading-one-shot.mjs --source C:\private\official-career-reading.json --plan-only
```

비식별 개인 PC 전용 입력 JSON:
```json
{"sourceKind":"issued_official_saju_reading","readingId":"<official reading id>","domain":"career","state":"delivered","evidence":[{"id":"career-01","text":"<Saju 공식 해석 근거 원문>","origin":"<official section/source ref>"}],"limitations":[]}
```
3개 이상의 독립 근거 필요. 실제 사주 엔진 결과를 구성·복제·추정해 넣지 말 것.

유료 실험은 동일 경로에 `--live --approval-file <private approved JSON> --out <private result JSON>`과 `YEOUL_READING_PAID_APPROVAL=true`, `OPENROUTER_API_KEY`가 필요하다. 승인 파일에는 `experiment: yeoul-career-one-shot`, 정확한 `readingHash`, `model`, `approved:true`, `maxUsd`, 현행 확인된 `inputUsdPerMillion` 및 `outputUsdPerMillion`을 명시한다. 스크립트는 단 1회 요청, 재시도 없음, 출력 파일 잠금, 토큰 상한과 보수적 비용 사전 검사로 추가 과금을 방지한다.

### 사람 평가

1. 실제 사주 근거의 모든 핵심 조건·불확실성 보존 여부
2. 허위 개인사, 새로운 사주 사실·시기 판단 0건
3. 여울의 빠른 반응, 툭 쏘는 장난, 억지 츤데레가 아닌 관심
4. 같은 말의 반복 없이 여섯 장 분화 및 독서 흡입력
5. 각 장의 서술 밀도와 비용 및 5,000~8,000자 목표

자동 구조 검사는 **의미 보존 합격을 증명하지 않는다**. JSON 실패/중단도 원문을 비공개 저장하고 재요청하지 않는다.
