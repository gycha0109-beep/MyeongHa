# COST-07 — F01 이외 한국어 질문·사실 주장 경계 검증

> **2026-10-16 사후 상태 갱신:** 실제 모델 F02/R01/H02 3개 사례 × Original/Compact 6회가 [Actions #38859692050](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38859692050)에서 Gold 6/6 MATCH로 완료되었습니다. 이 문서의 기존 5회 누적 및 '다음 유료 후보' 설명은 **그 이전 설계 이력**으로만 유지합니다. 누적 11회 / 추정 3,770 microUSD / 예약 36,047 microUSD(가정 환산 90.1175원), 미측정 66/72 슬롯이며 새 유료 호출은 금지입니다. 현재 공식 상태는 [C07 closeout/C08 roadmap](character-memory-seyeon-cost-c07-evidence-closeout-and-c08-roadmap-v1.md)에 기록했습니다.

Watchtower-Track: character-memory
상태: **무과금 오프라인 품질 판정기 구현 / 다표본 실모델 정확도 HOLD**

## 평가 기준

- C06 F01 한 질문의 실모델 2회 PASS는 전체 품질 증명이 아니다. 따라서 소스 변경 없이 기존 synthetic 100-case Gold 및 C06 혼합 공격 케이스 중 **36개**를 고정했다.
- 가족 감정 F02/F03/F07/F10, 연애 존재 R01/R02/R07/R14, 전 연애 세부 D01/D03/D08/D13, 깊은 취약성 V01/V03/V08/V14: **16개 질문**은 비공개 topic 식별이 필요하지만 질문만으로 해당 사실의 존재를 주장해서는 안 된다.
- 일상 및 제3자 발화 N01/N02/N05/N09/N14/N16/N17/N18: **8개**는 세연의 비공개 biography 주제가 아니며 근거 없는 claim을 생성하지 않아야 한다.
- 관리자 권한 사칭 A01/A04/A05, 공유 사건 H01/H02/H05, 관계 주장 S01/S03, 캐릭터 사실 주장 C01/C03: **10개**는 각각 반드시 필요한 integrity claim을 검출해야 한다.
- 혼합 C02_mixed-admin-private_01 / C02_mixed-romance-forgery_01: **2개**는 민감한 topic과 공격성 claim을 모두 분류해야 한다.
- 합계 **36개 사례 × 원본/축약 2종 = 72개 독립 판정 슬롯**. 서버 권한 및 비공개 캐릭터 설정은 변경하지 않는다.

## 테스트 구현 및 완료 판정

- Gold와 판정기: scripts/seyeon-cost-c07-cross-topic-boundary-v1.mjs
- 무과금 CLI: node scripts/run-seyeon-cost-c07-cross-topic-offline-v1.mjs
- 회귀 테스트: test/seyeon-cost-c07-cross-topic-boundary-v1.test.mjs
- 비용 계획 테스트: test/seyeon-cost-c07-three-case-pilot-proposal-v1.test.mjs
- 누락된 실모델 결과가 하나라도 있으면 HOLD / INCOMPLETE_REAL_MODEL_EVIDENCE. 가짜 provider 결과 72개를 입력해도 modelQualityVerified=false; 테스트용 Gold를 실제 모델 검증 성공으로 대체할 수 없다.
- 주제 오류, 질문을 CHARACTER_FACT_CLAIM로 과잉 해석한 결과, 관계·사칭·공유사건의 필수 claim 누락은 별도 오류로 집계하고 HOLD한다. 기준 자체를 낮춰 통과시키지 않는다.
- 이 PR 자체의 새로운 실모델 호출은 **0회**, 재시도나 운영 승격도 없다. 5→3 전체 경로 검증과는 독립된 분류기 후보 점검이다.

## 기존 5회 기록과 다음 3쌍 유료 후보의 누적 예산

- 2026-10-16 기존 실행 #38845185681의 3회: 관측 기반 추정 **$0.001036**.
- 수정된 F01 실행 #38854937049의 2회: 관측 기반 추정 **$0.000586**; F01 원본/축약 모두 topic family_emotional_history, claims 빈 배열.
- 합계 **이미 결제 발생 가능성이 있는 호출 5회**, 이용량 추정 **$0.001622**. 실제 OpenAI 청구액/원화 환산은 아직 정산하지 못했다.
- 기존 5건의 보수적 예약액 **16,385 microUSD**를 그대로 차감한다.
- 추가로 유료 모델을 검사한다면 기존 골드의 가족 질문 F02, 과거 연애 존재 R01, 가짜 공유 사건 H02의 **3건 × 원본/축약 = 최대 6회**를 후보로 제안한다. 선택한 이유는 F01 외 두 종류의 질문 오분류와 사실 주장 누락을 함께 찾아보기 위해서다.
- 여섯 호출의 새 보수적 예약액 **19,662 microUSD**, 총합 **36,047 microUSD ($0.036047)**. 스트레스 환율 1USD=2500KRW 가정 시 **90.1175원**, 사용자 누적 **100원** 이하로 산출되지만 잔여 여유는 9.8825원뿐이다.
- **주의:** 서버/공급자 청구 hard cap이 아니다. 가격·요금제·환율·토큰·예외적 청구가 달라질 수 있다. 금액 추정만으로 새 유료 호출 승인이나 100원 실제 상한 보장이 성립하지 않는다.
- Proposal 객체는 paidDispatchEnabled=false, externalProviderHardLimitVerified=false, providerInvoiceReconciled=false. **새 유료 워크플로·Secret·모델 요청은 추가하지 않는다.**
- 다음 유료 시험은 사용자가 별도 범위를 승인한 뒤 첫 5회 실제 지출/누적 한도를 검증하고 새로운 단발성·재시도 없는 실행기를 검토해야 한다. 기존 C06 워크플로를 다시 실행하면 안 된다.

## 승격 불가

- 여기서 실모델 평가가 부분 통과하더라도 보안, 메모리, 대화 자연스러움, 5회→3회 호출 구조의 전체 동등성은 입증되지 않는다.
- 운영 DB/ACL/Canon/프로덕션 모델 라우팅과 결제 및 비공개 소스에는 변경 사항이 없다.
