# COST-04 — 통합 사전 분류 지시문 축약 후보 (무과금 오프라인)

Watchtower-Track: character-memory
Status: **OFFLINE TEST ONLY / COST-02 and COST-05/06 HOLD**.

## 구현
- `scripts/seyeon-cost-c04-preflight-compact-offline-v1.mjs`: 압축된 독립 후보 문자열. Truth-bearing user/Se-yeon/shared-event/status/authority/meta claim 분리, 가족/과거연애 표면·상세/트라우마 공개 질문, 한국어 주어 생략과 허위 과거 연애 구분, 원문 입력 불신 경계를 명시한다.
- `test/seyeon-cost-c04-preflight-compact-offline-v1.test.ts`: **Production 파일을 수정하지 않는 테스트 전용 wrapper**에서만 지시문을 교체한다. 실제 Provider 직렬화 및 서버의 Integrity/Disclosure classification Guards는 동일하게 적용하고 C02의 서로 다른 합성 Gold 300건에서 모델 응답을 사전 정의한 동일 Oracle로 반환한다. 동일 request payload/model/schema/store=false/security boundary 유지와 실제 UTF-8 바이트 감소를 검증한다.

## 해석 제한 및 운영 경계
- **합성 Oracle가 이미 정답을 돌려줍니다.** 300건 서버 Guard 결과 일치는 Compact prompt가 실제 모델에서도 정답을 낸다는 증거가 **전혀 아닙니다**. 모델 분류 누락·오탐·인젝션 저항·캐시/Reasoning/output/실청구·세연 자연스러움의 값은 모두 UNKNOWN.
- 현재 기존 Shadow 지시문 및 운영 5회 경로는 불변. 통합 분류기를 조정/배포하지 않으며 외부 Provider API/Secret `OPENAI_API_KEY2`를 사용하지 않는다. 보호된 두 workflow의 `if: ${{ false }}`는 유지한다.
- 유료 A/B를 수행하려면 **모델 정확한 SKU·단가, 최대 호출 횟수·입출력 토큰 캡·재시도 규칙·총 비용 상한 및 중단 조건**을 승인·확인하고 별도 승인된 평가 경로/영수증 검증이 필요하다. 비용 사고 #1816와 DB #1887 HOLD를 우회하지 않는다.

## 짝지은 평가 결과 판정 — 무료 로컬 검증

- `scripts/seyeon-cost-c04-pairwise-quality-review-v1.mjs`는 C02의 Gold 300개에 대해 기존/축약 프롬프트 별 결과 **600행**을 입력받아 ID 중복·누락·실패를 강제 확인한다. `topicKey`, `claimKinds`, 직렬화 UTF-8 바이트 숫자만 허용하고 원문·비밀키·응답 텍스트는 받지 않는다.
- `test/seyeon-cost-c04-pairwise-quality-review-v1.test.mjs`는 완전한 가짜 예측, 민감 주제 누락, 허위 관계·권한 주장 누락, 일반 대화 과민 차단, 실패/중복/없는 표본, 기존 경로 불량, 역효과 등을 회귀 검증한다.
- `offlineGoldAndByteChecksPass=true`는 단지 **입력된 값의 정합성 확인**이다. 입력이 Gold 답을 복제할 수 있으므로 실제 모델 accuracy, true recall, hallucination, prompt injection safety 또는 billed cost가 확인된 것이 아니다. `verdict=HOLD_REAL_MODEL_AND_OWNER_REVIEW`, `paidEvaluationPermitted=false`, `productionPromotionPermitted=false`로 고정한다.
- 유료 평가에서는 `OPENAI_API_KEY2`를 사용해야 하지만 Model SKU·현행 단가·토큰 caps·횟수·승인된 금액·서버측 강제 상한/영수증 안정성이 선결되어야 한다. #1816/#1887 차단을 임의 해제하지 않는다.

## 보강: 골드에 라벨이 없는 추가 주장도 검토 전 차단

- Gold 300건의 `requiredKind`는 **그 주장 종류가 반드시 포함되어야 한다**는 뜻이지 다른 주장이 모두 허용됐다는 뜻이 아니다. 예: `AUTHORITY_OVERRIDE`를 맞히면서 `SHARED_EVENT_CLAIM`까지 만들어내면 기존 채점은 놓칠 수 있었다.
- 추가로 발견된 종류 또는 Gold에 필수 주장 라벨이 없는 사례의 자발적 주장 분류는 **잘못된 판정으로 단정하지 않고** `unreviewedClaimIds`에 별도 기록하며, `UNREVIEWED_CLAIM_KIND_REQUIRES_OWNER_LABEL`로 자동 통과를 차단한다.
- 단순한 주장 배열 순서 차이는 결과 불일치로 계산하지 않는다. 외부 모델 응답이나 실제 사용자 기록을 저장하지 않고 검증한다.
- 이 강화는 실모델 품질의 증명이 아니라 **기존 오프라인 평가에서의 거짓 성공 가능성 제거**다. 사용자 승인된 유료 키 `OPENAI_API_KEY2`를 사용하지 않았다.

## 초소형 8회 선별 테스트 — 무과금 예비 검증

- 같은 분류 단계의 기존 Unified 지시문 4회 + Compact 지시문 4회를 비교한다. 전체 5단계 기존 대화 경로와 3단계 신규 경로의 품질 비교가 **아니다**.
- 고정 사례: `N14`(드라마 속 전 연인, 오탐 방지), `F01`(세연 가족 내력), `C02_mixed-admin-private_01`(관리자 사칭+깊은 트라우마), `C02_mixed-romance-forgery_01`(허위 공동 경험+이별 상세). 4개 문장으로 4가지 고위험 분류 상황을 선별한다. 300개 중 296개는 실험 대상에서 제외되어 실제 모델의 전체 Recall/Precision 보증 불가.
- `test/seyeon-cost-c04-preflight-compact-offline-v1.test.ts`가 **실제 Provider 요청 직렬화**로 구성한 8개 JSON을 Fake transport로 캡처하며, 결과는 정답을 돌려주는 **Oracle**이다. CI의 `SEYEON_C06_EIGHT_CALL_SCREENING_OFFLINE` 로그에서 요청 바이트를 감사한다. `requestCount=8`, `actualPaidCalls=0`, `actualBilledCostUsd=null`.
- 호출 수만 기준으로 기존 4조건×4사례 64회 대비 87.5% 감소한다. 그러나 첫 테스트는 모델 prompt 2종을 다루는 **탐색 검증**이며 전체 경로·모델·보안·캐릭터 품질 검사와 직접적인 절감률 비교는 불가. 실비 역시 토큰/요금/영수증 없이 추정 금지.
- 현재 `COST-05/#1816` 비용 사고 HOLD, 공식 단가·독립 비용 hard cap·영수증·Owner 별도 검토 및 `OPENAI_API_KEY2` 실행 경로가 마련되지 않았다. 보호된 workflow의 `if: false`를 우회하지 않았으며 **실모델 8회 시험은 아직 미실행**.
