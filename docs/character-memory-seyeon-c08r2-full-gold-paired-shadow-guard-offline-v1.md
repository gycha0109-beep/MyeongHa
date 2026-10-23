# C08-R2 — 축약 3회 Shadow의 기존 Gold·Guard 쌍대 확장 (무과금)

Watchtower-Track: character-memory

## 적용 범위

- 선행 C08-R / [PR #2498](https://github.com/gycha0109-beep/MyeongHa/pull/2498)은 N06 한 건의 구조화 요청 JSON 직렬화와 기존 서버 Guard를 비교했고, 입력/스키마 불변 조건에서 요청 전체 **38,595→32,203 bytes(약 16.6% 감소)**를 기록했다. 이는 **토큰·지연·대사 품질 감소/개선 실측이 아니다**.
- 이 단계는 기존 C07 원본 **36개 Gold**를 변경하지 않고 `baseline`/opt-in `compact_v1` **72개 무료 모의 실행**으로 확대한다. 실모델 Gold 유료 관측은 계속 **6/72**이고, 기존 N06 유료 일회성 실행의 사용량·시간 수치는 바뀌지 않는다.
- **모델 호출/유료 실행 0회**. 가짜 Provider의 적격성/오류 코드/민감 Source 차단 등 **실제 서버 Guard 호출**만 검증한다. **모델 품질을 검증하는 테스트가 아니다.**

## 인수 조건

1. 민감질문 Gold(18건): 기존/compact 모두 첫 번째 unified preflight 후 `FAST_SENSITIVE_PREFLIGHT_REJECTED`. Source Descriptor/Fact/Retrieval **0회**; 대사와 reviewer **0회**, 첫 Census **1회**.
2. 공개 비민감 주장 Gold: 조작된 관계·사건·캐릭터 사실·관리자 권한을 승인하지 않고 기존/compact 모두 **첫 model 단계에서 중단**. 비인가/private read **0회**.
3. 공개 비민감·무주장 Gold: 양 경로 동일 **3 Provider 단계**, **4회 authoritative full-thread census**, 동일 모의 Guard 승인 대사. Candidate/Reviewer **request.input, responseSchema, purpose는 그대로**, `instructions`만 경량화.
4. 양 경로에 대해 비정상 interpretation, private draft, review hash 변조, reviewer 명시적 거절을 주입하면 최종 반환하지 않는다.
5. Census 1/2/3/4 어느 지점에서든 동시 RECEIVE를 모의하면 현재 가능한 모델 단계에서 즉시 중단한다. 저장소 실패 메시지는 외부로 복사하지 않는다.
6. 위 인수는 **모의 Provider의 gold 라벨을 직접 주입한 계약 검증**이며, 기존 모델 Gold 적중률·실제 경합·평균/95백분위 응답시간·10원 예약 상한을 증명하지 않는다.

## 금지·보류

- Gold/Canon/정식 Security·DB/ACL/Grant/Reader/G0~G6/Production 변경 금지. 모든 단계 Shadow-only.
- 모델별 확률적 오류, 한국어 캐릭터 자연스러움, 지연, 실제 가격은 미검증. **유료 호출은 새 Owner 명시적 승인 전 금지**.
- 현재 GLM 3회 N06의 사용량 기준 예상 원가는 약 **1.41원**이지만 과거 보수적 예약 상한은 **약 150원**이었다. 실청구 hard cap 및 **턴당 예약 10원(4,000 microUSD@2,500원/USD)** 보장이 없이 비용 목표 충족이라고 판정하지 않는다.
- 통합 CI 및 정확 HEAD 결과 확인 전 위 회귀를 PASS로 보고하지 않는다.

## 후속 작업

C08-R2 무료 검증 이후 로드맵의 **3회 경로 예약 상한·최대 출력 토큰·추론량 제한에 대한 무료 예산 가능성 평가**를 진행한다. 2회 후보는 신뢰 가능한 사전 분류 대체 검증 전에는 분리 연구 상태로 둔다. 새 모델 유료 비교·운영 승격은 별도 승인 대상이다.
