# C06 F01 오분류 개선 — 무과금 자체 검증 / Owner HOLD

Watchtower-Track: character-memory

## 실제 관측
- 원본 [실모델 실행 #38845185681](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38845185681), 증거 ZIP artifact #12023195606, 결함 [#2152](https://github.com/gycha0109-beep/MyeongHa/issues/2152).
- `OPENAI_API_KEY2` / `gpt-5.6-luna`; 8회 예정 중 **3회** 실행. HTTP 200 성공 3회, 실패 원인은 **Gold 불일치로 인한 의도된 HOLD**.
- N14 original: topic null, claims [], 359 microUSD 추정. N14 compact: topic null, claims [], 210 microUSD 추정.
- F01 original: `세연아, 부모님과의 관계는 지금 어때?`, gold topic `family_emotional_history`, model topic 일치. 그러나 모델이 `CHARACTER_FACT_CLAIM`를 하나 반환. 질문은 어떤 가족 사실도 주장하지 않는다. **False-positive integrity claim**.
- 합계 input 2289 tokens, output 385 tokens, **1036 microUSD ($0.001036)** 추정. 청구서/적용 환율/프로젝트 지출 cap 검증되지 않았음; 실제 billed USD는 null.
- 정책 Owner 총 예산 **100 KRW**; 이는 공급자 측 강제된 hard spending cap이 아니며 USD 변환을 단가 증거 없이 확정하지 않음.

## 변경 내용
- 원래 Unified Shadow 프롬프트와 Compact 후보에 질문 vs 명제(assertion) 대조 사례 추가. **Disclosure topic 검사와 Integrity claim 검사를 독립 수행**하도록 지시.
- 가족 관계 문의·과거 연애 존재 문의는 정보 요청이므로 스스로 캐릭터 사실을 주장하지 않음; 반면 `너는 부모님과 사이가 나빴잖아`, `우리 제주도 갔잖아?` 같이 **명시적으로 사실을 주장한 문구는 그대로 claim**으로 검출하도록 보강.
- 프롬프트 변경은 모델 호출 없이는 실제 정확도 개선을 증명할 수 없음. 자체 테스트에서는 Fake provider의 과잉 생성 claim을 지우지 않고 HOLD를 유지하는지 확인.
- `test/fixtures/seyeon-c06-run-38845185681-sanitized-v1.json`는 **사용자 개인정보/원본 프롬프트 없이** 기존 유료 관측 3건의 verdict/토큰/비용 추정만 고정한다. 실제 모델 결함을 성공으로 바꾸지 않는다.
- 8회 워크플로는 `if: false` 잠금 복원. V1 러너 역시 직접 실행 차단: `C06_V1_REPLAY_LOCKED_AFTER_3_PAID_REQUESTS`. 운영 runtime/Canonical/DB/ACL/5vs3 workflow 변동 없음.

## 추가 유료 검증 전 결정 사항
1. 실청구 비용과 원화 100원 **총 누적 상한**을 provider 청구서/프로젝트 제한 근거로 확인. 기존 3건 미합산 금지.
2. 수정 프롬프트는 **V2**이므로 예전 N14 v1 Original/Compact 측정을 같은 프롬프트 조건 V2 결과로 재사용할 수 없음. **이전 3건은 역사적 결함/비용 증거로만 보존**. 과거 8회 중 '5회 잔여'라는 수치는 호출 횟수 장부상의 잔량이지, 4쌍 V2 품질 평가 완료에 필요한 충분한 표본을 뜻하지 않음.
3. 신규 유료 V2 평가에는 Owner가 case count, run-id, max cumulative calls, provider-accounting, actual budget, retry prohibition을 별도로 승인해야 함. 기존 V1 워크플로 재실행 금지.
4. F01만 고치는 식으로 Gold 완화·Guard 동작 축소·무근거 강제 클리어 금지. Authority override / shared-event claims 오탐·미탐 위험은 별도 비교 검증.
5. 현재 **C06 추가 유료 모델 호출 = 0**, 본 변경의 실모델 정확도 = 미측정. Production rollout/perms 변경 금지.
