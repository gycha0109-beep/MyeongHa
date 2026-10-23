# C08-T — 사용자 추가 5,000원 승인 범위 / 첫 유료 6호출 실행 경계

Watchtower-Track: character-memory

## 상태 (2026-10-18)

**추가 누적 유료 평가 예산 최대 5,000 KRW는 승인됨. 실제 모델 호출은 0건이며, 공급자 하드캡·지난 11회 실제 청구·프로젝트 키 격리가 미검증이므로 PAID DISPATCH HOLD.** 이 승인은 Production/G0~G6, 개인 사실/양수 Grant, 배포, 실사용자 데이터, 자동 재시도, 모델 평가 범위 무제한 확대를 포함하지 않는다.

기존 C07 원장의 `actualBilledKrw=null`, `invoiceReconciled=false`, `providerHardLimitVerified=false`를 진짜 0원 또는 인증된 true로 덮어쓰지 않는다. 별도의 Owner 추가 5,000원은 과거 11회의 예약 100원 장부를 리셋하거나 소급해서 대체하는 것이 **아니다**.

## 근거·예산 (공급자 인보이스가 아님)

| 항목 | 값 | 의미 |
| --- | ---: | --- |
| 과거 실모델 호출 | 11회 | C06 3, F01 V2 2, C07 6 |
| 과거 사용량 추정 | 3,770 microUSD | 실제 청구 미확인 |
| C07 Gold 전체 | 36건 × Original/Compact = 72 슬롯 | 기준 Fixture 불변 |
| C07 실측 완료 | F02/R01/H02 × 2 = 6 슬롯 | 66 슬롯 미관측 |
| 이번 첫 배치 | A01 / H01 / C02_mixed-admin-private_01 × 2 | **최대 6 요청** |
| 요청당 보수적 예약 | 3,277 microUSD | 기존 Luna 상한: 입력 8,192 / 출력 1,024 / 본문 6,144 Bytes |
| 첫 배치 6회 보수적 예약 | 19,662 microUSD = **49.155원** | 가정환율 2,500 KRW/USD |
| 나머지 전체 66회 같은 가정 | 216,282 microUSD = **540.705원** | 66회 분류기만; 5↔3 E2E·재시도·재실행 불포함 |
| 승인된 **추가 총합** | **5,000원** | 최초 일괄 청구 아님; 신규 평가 전체에 적용 |

**주의:** 실제 API 모델별 가격·환율·세금·공급자 청구 및 계측 지연에 따라 추정과 청구가 다르다. `$0.003770`는 기존 **11회**의 총 사용량 기반 추정이고 원화 3,770원이 아니다. E2E 5회 대 3회 검증은 다른 모델·긴 출력·후속 호출이 있으므로 위 66회 비용을 그대로 적용하면 안 된다.

## 필요한 외부 보안 확인 (Owner/프로젝트 관리자)

1. 기존 OpenAI Platform Billing/Usage에서 11회 발생일에 해당하는 **실제 API 사용·청구원장 및 이번 달 누적 사용량**을 대조한다. 외부 사용이 섞이면 분리한다. 인보이스를 확인하기 전에는 `actualBilledKrw`를 추정값으로 채우지 않는다.
2. 새 평가만 사용할 **격리 API Project + 그 프로젝트 전용 API Key**를 준비한다. 기존 Production/API 키 `OPENAI_API_KEY`와의 혼용·별도 비용 분산을 방지한다. 키 값 자체는 문서·PR·채팅·로그에 공유하지 않는다.
3. OpenAI Platform의 **Project settings → Limits → Spend → Edit spend limit → Enforce a hard limit**를 실제 ON으로 설정했는지, 기존 이달 사용량을 포함한 프로젝트 월 누적 상한 및 적용 프로젝트/키를 확인한다. 단순 Budget Alert는 자동 중지가 아니다. 공급자 hard limit도 실시간 절대 정지 보장은 아니고 약간의 초과 가능성이 있으므로 로컬 예약 게이트·소규모 배치·중복 방지가 필요하다.
   - 공급자 문서: https://developers.openai.com/api/docs/guides/spend-limits
4. 5,000원 이하의 추가 누적 한도를 실제로 다룰 수 있는지 (원화 아닌 USD 한도, 이달 기사용액, 승인된 환율 기준, 세금 포함 여부) 확인한다. 검증 불가 시 **유료 호출 없이 HOLD**.
5. 이후 별도 Reviewed PR에서 기존 1회성 C07 Job 재사용 금지, 정확 Main HEAD·G0~G6 HOLD·Provider 사전 계측/요청 상한·월간 사용량 check·외부 하드캡 및 키 동일성·단발성 Action 실행 admission을 추가해야 한다. **이번 PR은 유료 워크플로 또는 비밀키를 생성·연결·작동시키지 않는다.**

## 첫 배치의 판정·중단 정책

- 명세: `scripts/seyeon-cost-c08t-owner-budget-pilot-v1.mjs`. 실제 실모델 호출 없이 Gold 원본 36건과 과거 6개 슬롯을 고정하고, 66개 미관측 슬롯 및 첫 배치 6요청에 대해 deterministic 원장·거부 테스트를 제공한다.
- 최대 입력 8,192 Tokens·출력 1,024 Tokens·요청 본문 6,144 Bytes·첫 배치 6회 고정. **추가 재시도 없음**, 요청 이전 예약 + 순차 처리. 각 요청의 성공·토큰 수 관측 전 다음 호출 금지.
- 모델이 주장 분류를 놓치거나 불필요한 개인정보 토픽을 만들어도 Gold/Guard 완화 금지. 이후 요청은 중단하고 `HOLD`로 보고. A01 가짜 관리자, H01 거짓 공유 사건, C02 혼합 관리자+민감 질문이 첫 번째 P0 배치다.
- `estimateMicroUsd`는 사용량에 근거한 추정이며 실제 Invoice/Provider Hard Spend 게이트를 대체하지 않는다. 요청 실패/응답 손실/사용량 부재/중복 시 비용을 0으로 간주하지 않고 신규 호출 금지.
- 사람 평가 전용 C08-S의 블라인드 A/B 패킷과 이번 C08-T 분류 Gold 실측 슬롯을 혼동하지 않는다. `modelQualityVerified=false`, `productionPromotionPermitted=false` 유지.

## 검증 완료 조건

무료 계약 검사 `npx vitest run test/seyeon-cost-c08t-owner-budget-pilot-v1.test.mjs` 통과 및 정확 HEAD Full Integration/DB/PG17/mergeable clean + squash + `main` 사후 CI 통과까지 기술적 완료 조건이다. **이후에도 비용/청구 확인과 별도 실제 평가 워크플로 검토 없이는 유료 호출 승인 상태를 열지 않는다.**
