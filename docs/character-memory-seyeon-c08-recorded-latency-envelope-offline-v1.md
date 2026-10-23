# C08 로드맵 7.3 — 5초 최종 응답 지연의 기존 N06 실측 재생 (무료)

Watchtower-Track: character-memory

## 고정 근거

- 출처: `docs/character-memory-seyeon-cost-c07-evidence-closeout-and-c08-roadmap-v1.md` §7.1, [일회성 실모델 실행 #39772769916](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39772769916).
- GLM 5.3 Flash N06 공개 합성 첫 턴 **단 한 번의 기존 관측**: 최종 Guard 통과 E2E **23,893ms**, 통합 Preflight **4,417ms**, 해석+대사 생성 **9,282ms**, 독립 의미 검토 **8,697ms**, 이 외 관측 차이 **1,497ms**.
- 이 숫자는 *이미 기록된 동일 실행에서 나온 측정*. 반복 실험, 다른 모델, 미래 요청의 최소지연·속도상한, p50/p95를 증명하지 않는다.

## 실제 코드 및 판정

- `scripts/seyeon-c08-recorded-latency-envelope-offline-v1.mjs`: 기존 **3회 유지**와 연구 가설 **사전 분류 1회 제거 후 생성+독립 검토 2회**를 같은 기록에서 빼기 연산으로 재생한다. 다른 모델 단계 실행시간·가드 및 기타 오버헤드가 같다고 가정하는 **반사실적 수치**, 실제 2회 측정 아님.
- `test/seyeon-c08-recorded-latency-envelope-offline-v1.test.mjs`: 고정 숫자·오류·독립 검토 유지·비인가 실행 차단 회귀.
- 3회 그대로의 기록 **23,893ms** > **5,000ms**.
- 사전 분류를 단순 생략한 과거 기록 재생 **19,476ms** > **5,000ms**, 초과 **14,476ms**.
- 기록상 대사 생성 단계 하나가 **9,282ms**지만, 다른 시간/모델/Provider에서도 그 시간이 하한이라는 의미는 아니다.
- 가상 입력이 5초 아래로 계산되더라도 `measuredAlternativeLatency=false`, `repeatLatencyP50P95Verified=false`, `modelQualityVerified=false`, `preflightParityVerified=false`, `twoCallExecutionAuthorized=false`, `canRunNewPaidModelCalls=false`, `productionRoutingAuthorized=false`.

## 종료 조건

이 무료 분석은 5초 도달 **불가의 증명**이나 가상 2회 전환 승인이 아니라, **기존 측정만으로 5초 달성을 주장할 수 없다는 판정**이다. 10원 턴당 상한도 C08-R3/단계별 출력 상한 스트레스 산식에서 별도 HOLD. 실모델 쌍대 실행은 Owner의 **별도 비용·보안·실험 승인** 없이는 금지. Shadow 3회 기준선, Integrity/Disclosure, Canon, Gold, Census 4회, Grants/ACL, Guard, Fail-Closed, Production 경로는 전부 유지한다.
