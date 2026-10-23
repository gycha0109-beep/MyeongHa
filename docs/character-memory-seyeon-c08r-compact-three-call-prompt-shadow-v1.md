# C08-R — 세연 3회 호출 Shadow 프롬프트 경량화 후보 (2026-10-23)

Watchtower-Track: character-memory

## 목적과 상태

- Owner 목표: 사용자 대화 **1턴 전체 모델 비용 10원 이하(평균 아닌 상한)**, 일상 대화 **최종 Guard 통과 대사 표시까지 약 5초**. 이것은 **달성 결과가 아니라 실험 목표**다.
- **기존 3회 경로와 기본 프롬프트는 그대로 보존**한다. 새 opt-in `promptProfile: 'compact_v1'`은 공개 첫 만남 **Shadow 평가 코드만** 선택 가능하다. Production 채팅/Reader/DB/Canon/관계·기억/Grant/ACL·배포 상태는 변경하지 않는다.
- 신규 유료 모델 호출, provider 네트워크 dispatch, workflow trigger, Secret, Cloudflare Production 배포 **0회**. 이 PR은 실모델 품질/시간의 개선을 입증하지 않는다.

## 실제 3단계 책임과 병목

| 단계 | 현재 실제 책임 | N06 GLM 실측 | C08-R 조치 |
| --- | --- | ---: | --- |
| ① `unified_preflight_shadow` | Integrity 주장과 Disclosure 민감 주제의 독립 분류를 하나의 호출로 통합; 서버 검증 후 민감한 경우 private Descriptor **이전** 차단 | 4,417ms | **불변**: C07 원본 36 Gold/P0 탐지의 재훈련 없는 축약은 허용하지 않음 |
| ② `turn_interpret_render_shadow` | **기존에도 단일 호출**로 interpretation + proposed draft 생성; server interpretation/causality/renderer guards | 9,282ms | 공개 합성 Shadow용 **compact prompt 후보**. 입력/JSON Schema/Guard/행동-권한 vocab 불변 |
| ③ `semantic_review` | 앞서 승인된 초안에 대한 별도 provider의 의미 검토; 최종 server output guard | 8,697ms | 독립 **3번째 호출 자체는 유지**, instructions만 압축. 검토 hash, failureCodes, schema/Guard 불변 |

현재 경로는 N06에서 **23,893ms**였고 총 출력 2,618토큰 중 추론 2,096토큰. ①만 제거해도 5초 달성은 입증되지 않는다. ②+③을 짧게 지시해도 실제 추론시간 및 내용 충실성에 미칠 효과는 **미지수**다.

## 구현 내용

1. `seyeon-shadow-compact-prompts-v1.ts`: 같은 provider request의 `instructions`만 opt-in 변환. Purpose/입력 Context/structured `responseSchema`/추가 권한 금지. Public first-contact / 무기억/무관계/서버 소유 vocab/claim 인증/감정·행동 위험/CANON 및 독립 리뷰 요구를 유지하는 가설적 축약 지침.
2. `seyeon-fast-dialogue-shadow-v1.ts`: 기존 Shadow와 동일한 수신 적격성, interpretation/renderer/output guards, 4회 authoritative Census 확인, 독립 reviewer 호출 구조 유지. 기본값은 이전 지침을 그대로 사용한다.
3. `seyeon-census-first-three-call-shadow-v1.ts`: opt-in profile만 내부로 전달.
4. `test/seyeon-c08r-compact-three-call-shadow-offline-v1.test.ts`: 실제 OpenRouter body 직렬화 구조를 synthetic in-memory Provider로 3회 모사하고 요청 bytes/지침 bytes/input bytes/schema bytes 수치 비교. 실제 API 호출 0. 기존/compact 양 경로 각각 서버 Guard 성공, 검증 전/후 Census 4회, 불법 reveal 초안·잘못된 semantic hash·최종 Census 경합 실패 시 공개 반환 불허. 기존 C07 Gold 36개 사전 분류는 수정하지 않는다.

## 사전 탈락/보류 조건

- **모델 출력 품질/의미 동등성 미검증**: Fake Provider로 최종 Guard PASS해도 실모델이 같은 대사를 만들거나 모든 위험을 검출할 수 있다는 증거가 없다. 기존 원본 Gold를 실모델로 재측정한 것도 아니다.
- **10원 모델 예약 상한 미입증**: 현재 N06 GLM 3회 실측 사용량 추정은 약 1.41원이지만 **기존 GLM 사전 예약 상한은 각 호출 $0.020 × 3 = $0.060 ≈ 150원**(보수적 2,500 KRW/USD). 새 목표의 턴당 총 예약 4,000 microUSD(10원) 이하로 입장 허용하려면 모델 제공 경로의 보수적 가격·요청/출력 상한을 별도 검증해야 한다. 사용량 추정만으로 운영 하드캡 충족 주장 금지.
- **5초 미입증**: 요청 bytes 감소가 추론 토큰 및 E2E 응답시간 감소를 보장하지 않는다. 단일 N06 실행의 p50/p95도 추정 금지.
- 신규 유료 호출은 모델·Provider/ZDR/strict JSON Schema·사례·호출 수·총 예약 금액·실패/재시도 정책을 Owner가 다시 승인한 다음에만 별도 1회성 실험으로 수행.
- 최종 Production Gate/Reader 공개, 개인 데이터 Source/DB Writer, RR-03/04·RR-09/10·RR-11/12, G0~G6/G1 consent는 계속 HOLD.

## 다음 구현

오프라인 byte 감사와 기존 C07 고위험 Guard 회귀에 문제가 없을 경우 **3회 compact 프로필의 안전 제약 유지 여부를 확장 검증**한다. 이후 2회 조건부 fast path 설계는 자체 별도 실험으로 분리하고, 3회 기준선·4회 Census·독립 reviewer를 몰래 제거하지 않는다. 실제 GLM 모델 평가는 Owner 승인 전까지 보류한다.
