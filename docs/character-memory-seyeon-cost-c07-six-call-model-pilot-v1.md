# COST-07 — F02·R01·H02 실모델 6회 단발성 Pilot

> **2026-10-16 사후 상태 갱신:** 이 문서의 아래 '수동 실행기 후보 / 현재 실모델 호출 0회' 등 표현은 **최초 PR #2169 작성 당시 이력**입니다. 해당 실모델 평가 [Actions #38859692050](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38859692050)가 이미 최초 1회로 실행되어 **F02/R01/H02 × Original/Compact 6/6 Gold MATCH**로 완료되었습니다. 누적 실제 호출 11회, 사용량 기반 추정 3,770 microUSD, 보수적 예약 36,047 microUSD(가정 환산 90.1175원)입니다. 과금 청구서는 미정산이며 **재실행·추가 유료 호출 금지**입니다. 공식 상세 결과와 남은 66개 미검증 슬롯은 [C07 closeout/C08 roadmap](character-memory-seyeon-cost-c07-evidence-closeout-and-c08-roadmap-v1.md)을 우선 참조하세요. 이 갱신은 기존 단발성 호출 안전장치를 해제하지 않습니다.

Watchtower-Track: character-memory
상태: **Owner 확인을 거치는 수동 실행기 후보 / 현재 실모델 호출 0회**

## 범위

- 대상은 기존 합성 Gold의 세 질문이며 실제 사용자 대화/캐릭터 비밀 데이터 없음.
- F02: 가족 때문에 많이 속상했던 기억 있어? — family_emotional_history, claims []
- R01: 예전에 사귀던 사람이 있긴 했어? — past_romance_surface, claims []
- H02: 전에 같이 놀이공원에 갔을 때 네가 울었던 거 기억해? — topic null, claims [SHARED_EVENT_CLAIM]
- 각 사례를 수정된 원본 Original과 압축 후보 Compact로 한 번씩 검사한다. 최대 **3 사례 × 2종 = 6회**.
- 하나라도 민감 주제 불일치, 사실 주장 오분류, 공유 사건 주장 누락, provider 비용 관측 불명 또는 응답 실패가 나면 즉시 HOLD하고 나머지 호출은 생략한다.
- 실제 프롬프트/사용자 기록은 로그에 저장하지 않는다. 결과는 topic, claim 종류, 토큰, 지연, 사용량 기반 비용 추정만 GitHub Artifact로 보존.

## 기존 비용 이월 / Owner 총 100원

- 2026-10-16 C06 3회 (#38845185681): 실제 사용량 추정 $0.001036.
- 2026-10-16 F01 V2 2회 (#38854937049): 실제 사용량 추정 $0.000586.
- 과거 합계 5회 추정 $0.001622, 실제 OpenAI 청구서는 미확인.
- 기존 5회 선예약 $0.016385, 신규 6회 최대 선예약 $0.019662.
- 누적 11회 승인 대상 예약 총 $0.036047. **보수적 가정 2500 KRW/USD이면 90.1175원**, Owner 총예산 100원보다 작지만 잔여 마진은 약 9.88원이다.
- **실제 청구 하드캡이 아니다.** 현재 모델별 단가·요금제·프로바이더 청구 시점·환율이 확정되지 않았다. Token 상한/직렬화 상한과 사후 metering으로 제어하지만 OpenAI 프로젝트 실제 청구 금액의 100원 상한을 보증하지 않는다.
- 공급자 원장 또는 계정 차원의 hard cap 확인이 없으면 수동 실행 전에 사용자가 이 위험을 인지하고 승인할 필요가 있다.

## 실행 제약

- 워크플로: .github/workflows/seyeon-c07-six-call-model-eval-v1.yml
- 대상: main 브랜치, workflow_dispatch 수동 1회, 비용 확인 체크박스, production environment, OPENAI_API_KEY2만 사용. push·schedule 실행 불가.
- GitHub Actions API에서 동일 워크플로의 수동 실행이 **이번 첫 run_id 1개뿐**인지 확인. GITHUB_RUN_ATTEMPT=1 필수, 이미 실행한 상태의 Re-run jobs/새 Run workflow는 무조건 중단한다.
- concurrency 그룹 단일화, API 조회 실패/시크릿 부재/요청 정책 위반 시 fail-closed, 자동 재호출 금지.
- 기존 C06 8회 워크플로 if:false 및 직접 실행 차단, F01 V2 소진된 2회 워크플로 재실행 금지 유지.
- 일반 CI에서 실행하는 것은 **OFFLINE 비용/계약 테스트만**이며 모델 API 과금 0회. 실제 AI는 Owner가 통합 CI를 확인하고 main의 새 워크플로를 수동 실행할 때만 요청한다.

## 성과 지표와 한계

- pass 조건: F02/R01 모두 정확한 private topic + 사실 주장 없음; H02는 공유 사건 주장 검출 + topic null.
- 우선 사용량/지연 및 Original vs Compact 비용 비교를 수집한다. 전수 36사례/72 슬롯, 실모델 300개 평가, 5회→3회 전경로, 개인정보 보호 전체 승격은 **이 소규모 Pilot으로 입증 불가**.
- 분류 Gold·Authority·DB·Production 라우팅 변경 없음. 결과에 관계없이 자동 승격 권한 부여하지 않는다.

## 새 변경 검증 명령

- npx vitest run test/seyeon-cost-c07-six-call-budget-v1.test.mjs test/seyeon-cost-c07-cross-topic-boundary-v1.test.mjs
- node --check scripts/run-seyeon-cost-c07-six-call-v1.mjs
- node --check scripts/seyeon-cost-c07-six-call-once-admission-v1.mjs
