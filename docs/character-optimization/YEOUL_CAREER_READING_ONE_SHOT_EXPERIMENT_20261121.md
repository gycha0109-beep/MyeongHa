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

### 2026-11-21 — Saju 공식 렌더러 기반 연구 자료 수집

Saju `main@b46a09c3`에서 독립 체크아웃·빌드 후, 동일한 엔진 경로(명식 계산 → Career Natal Claim registry → Interpretation → Composition Evidence → Canonical Semantic Bundle → Official Renderer)를 통해 **서로 다른 합성 명식 2건**을 수집했습니다. 공식 렌더러 출력이더라도 Production 발급 기록이 없으므로 연구 자료로만 분류합니다.

| 구분 | Case A | Case B |
|---|---:|---:|
| Career semantic units | 7 | 6 |
| Rendered sections | 4 | 3 |
| reportHash prefix | `4636628935af` | `9150d5a26eac` |
| production issuance | false | false |
| paid product eligibility | false | false |

실험 입력 파일과 원본은 개인 PC의 `Documents/MyeongHa-Yeoul-Reading-Results-20261121/`에 저장. GitHub에는 원본 JSON이나 특정 개인의 생년월일·출력 원문을 게시하지 않습니다. 연구 결과의 `sourceKind=saju_engine_derived_research_only`는 발급 공식 Reading으로 업그레이드하지 않습니다.

`collect-yeoul-career-source.mjs`가 Saju 원본의 단위별 `canonicalText`, `claimId`, `sourceRefs`, `reportHash`를 추출하여 별도 Reader 연구 입력으로 변환합니다. 모델의 출력 길이 또는 서술 역량은 아직 검증하지 않았으며, 6–7개 근거만으로 5,000~8,000자를 충분히 채울 수 있다는 보장은 없습니다.

기본 모델의 고객용 운영 경로나 공식 사주 해석 엔진·권한은 변경하지 않습니다.

### 2026-11-21 — 동일 명식의 직업 시기 근거 통합 및 DeepSeek 실측 v2

- 원천: Saju `d01aa0c7`, 합성 여성 명식(2001-11-30 15:30), 동일한 `snapshotId`와 `calculationHash` 검증.
- 입력: 타고난 직업 해석 7개, 2026~2030년 연도별 경향 5개, 2026-11~2027-04 월별 절입 구간 경향 18개, 대운 계산 구간 2개. 총 32개.
- 생성: `deepseek/deepseek-v4.1-flash-1017` 실제 호출, 6장 6,273자, 구조 검증 통과; 연도 2026~2030 및 월 2026-11~2027-04 명시.
- 비교: v1 5,714자 / 근거 7개 / 시기 미제공 → v2 6,273자 / 근거 32개 / 시기별 차이 제공. 두 버전 모두 합성 명식 연구용으로, 공식 발급·판매 대상 아님.
- 비용: 실제 완료된 v2 재시도 `$0.004764952` (OpenRouter reported usage.cost); v2 앞선 중단 요청은 처리·과금 여부 별도 확인 필요.
- 범위: 대운은 날짜 경계 계산 결과일 뿐 길흉 해석이 아니며, Career 연월운은 연구용 경향이다. 취업·이직·승진·퇴사 이벤트는 예언하지 않는다.
- 개인 PC 결과: `Documents/MyeongHa-Yeoul-Reading-Results-20261121/case-a-yeoul-career-v2.html` 및 `.md`. 결과 본문 및 API 키는 저장소에 포함하지 않음.