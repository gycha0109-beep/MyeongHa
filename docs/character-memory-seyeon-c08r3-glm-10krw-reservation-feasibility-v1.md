# C08-R3 — GLM 3회 Shadow의 10원 상한 사전 예약 가능성 (무료)

Watchtower-Track: character-memory

## 기준 및 결론

- 사용자 조건: **대화 한 턴의 모든 모델 호출 총비용 10원 이하**. 첫 토큰이 아니라 **최종 Guard 통과 대사 표시 5초 내외**는 별도의 실측 목표.
- C08-R [PR #2498](https://github.com/gycha0109-beep/MyeongHa/pull/2498)의 검증된 N06 공개 합성 **compact 요청 직렬화 바이트**: `unified_preflight_shadow` 5,425 B, `turn_interpret_render_shadow` 14,041 B, `semantic_review` 12,737 B. 총 32,203 B. 기본 프롬프트 38,595 B 대비 약 16.6% 감소.
- 기존 GLM 유료 실험의 입력/출력 사용량 추정 **약 1.41원**은 청구액과 **10원 hard cap 보장이 아니다**. 기존 N06 파일럿 예약은 GLM 세 호출 각각 **20,000 microUSD**로 총 **60,000 microUSD = 150원**이었다.
- 기존 `seyeon-openrouter-glm53flash-paid-preflight-v1.mjs`의 **허용 최대 단가**(100만 입력 토큰 $0.15 / 100만 출력 토큰 $0.40), **최대 출력 1,536토큰/호출**, 기존 N06의 **본문 요청 UTF-8 바이트 수를 입력 토큰 보수적 상한으로 취급하는 스트레스 가정**, 환율 2,500원/USD를 적용하면 다음과 같다.

| Stage | 요청 바이트 | 최대 출력 토큰 | 계산 예약 microUSD |
| --- | ---: | ---: | ---: |
| 통합 사전 분류 | 5,425 | 1,536 | 1,429 |
| 해석+대사 | 14,041 | 1,536 | 2,721 |
| 독립 의미 검토 | 12,737 | 1,536 | 2,525 |
| **총액** | **32,203** | **4,608** | **6,675 = 16.6875원** |

**판정: 현재 보수적 최대 단가·최대 출력 상한을 그대로 적용하는 3회 경로는 10원 사전 예약 목표를 증명하지 못한다(HOLD).** 16.6875원은 **오프라인 스트레스 시나리오 값**이며 실제 billed amount가 아니다. Provider의 실제 토큰 산정, 고정 요청 수수료, hard cap, 서버측 추가 토큰 등도 정산·검증되지 않았다.

## 구현

- `scripts/seyeon-c08r3-10krw-reserve-scenario-v1.mjs`: 공개 합성 3단계 각각의 실제 body bytes, 별도 출력 cap, 단가, 재시도/추가 요청 수를 명시하지 않으면 Fail Closed. stage 순서·중복·최대 19,200B·출력 cap 1..1,536·입/출력 최대 단가·추가 과금 요청 0·추가 요청 수수료 0 조건 검사. 각 단계 올림 예약을 합산해 턴당 4,000 microUSD (10원) 이내인지만 시나리오로 판정한다.
- `test/seyeon-c08r-compact-three-call-shadow-offline-v1.test.ts`: 기존 **OpenRouter 실제 직렬화 구현의 fake-fetch 인자**에서 얻은 N06 compact 3단계 요청 바이트를 시나리오 계산기에 직접 입력해 위 숫자를 고정한다. API 네트워크 호출 0.
- `test/seyeon-c08r3-10krw-reserve-scenario-v1.test.mjs`: 잘못된 단계 수·순서·중복, byte/cap 초과, 단가 미확인/상한 초과, 유료 재시도·수수료 등장 시 Fail-Closed.
- 더 낮은 가격을 가정하는 계산은 **수학적 예시**일 뿐이며, 그 가격을 실제 GLM/provider가 제공한다고 주장하지 않는다.

## 다음 조건부 작업

1. 기존 API 공급자 경로의 **실제 현재 ZDR·strict JSON Schema·입출력 단가·수수료**를 읽기 전용으로 별도 검증한다. 가격이 낮은 모델/경로라고 해서 기존 보안 요구를 완화하지 않는다.
2. 단계별 출력/추론 토큰 상한을 줄일 경우 완전한 JSON 출력/최종 Guard/대사 품질의 탈락 위험을 먼저 **무료 실패 테스트**로 검증한다. 임의로 `max_completion_tokens`를 줄여 실제 추론량도 줄었다고 주장하지 않는다.
3. 실제 공급자 hard cap을 확인할 수 없다면 예약 합계가 10원 이내여도 **실청구 10원 보장으로 승격 금지**.
4. 성능·자연스러움·5초 목표는 비용 산식과 별도. 새 유료 GLM 평가, 모델 전환, Production Chat/Reader/DB/Grant/G0~G6 변경은 **별도 Owner 승인 전 HOLD**.

## 범위

이번 PR은 **순수 오프라인 시나리오 계산기와 테스트/문서**만 추가한다. 선행 3회 기본 프롬프트 경로, 독립 의미 검토, 4회 전체 이력 Census, 최종 Guard, Gold/Canon, 운영 보안·데이터·배포 권한은 변경하지 않는다.
