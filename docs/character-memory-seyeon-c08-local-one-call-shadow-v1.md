# 세연 C08 로컬 사전 검증 → LLM 대사 1회 → 로컬 사후 검증 (V1)

Watchtower-Track: character-memory

## 실제 변경 / 범위

- 신규 Shadow 코드: `apps/api/src/seyeon-c08-local-one-call-shadow-v1.ts`
- 신규 회귀: `test/seyeon-c08-local-one-call-shadow-offline-v1.test.ts`
- 기존 `runSeyeonCensusFirstThreeCallShadowV1`, Production, Reader, DB, Canon, 개인 Memory, 관계·Grant, 결제 코드는 **수정하지 않는다**. 기존 3회 경로로 롤백 가능하다.
- 이 구현은 **별도 opt-in 함수**로 호출하는 연구용 Shadow이다. 안전 동등성·정식 응답 라우팅·Production 공개 승인을 제공하지 않는다.
- 기존 `SeyeonDialogueEnvelopeV2`를 반환하지 않는다. 독립 LLM 검토를 했다고 속이는 `failureCodes:[]` 또는 임의 `semanticReviewHash`를 생성하지 않는다.

## 호출 구조

1. **사전 로컬 검증, LLM 0회**: 서버 제공 현재 메시지/과거 모든 메시지, 공개 첫 만남, 무관계·무기억, 단일 최신 user turn, 전체 authoritative Census와 대화 길이 일치 여부를 검사. 현재 입력과 이전 user 입력은 닫힌 문장 문법(인사·대화 시작·가벼운 상태·속도·현재 선호·대화 경계)에 해당해야 한다. 이전 assistant 문장도 보수적 로컬 공개 Guard를 통과해야 한다. 미확인 의미는 `LOCAL_INPUT_NOT_PROVEN`/`LOCAL_CONTEXT_NOT_PROVEN`으로 거부한다.
2. **기존 서버 권한 엔진 재사용**: 분류를 생략하지 않고 로컬이 실제로 증명할 수 있는 닫힌 문법에만 `claims=[]` / `topicKey=null`을 적용한다. 기존 `runCharacterGovernedPreflightV1`·`assembleSeyeonRuntimeContextV2`·`guardSeyeonTurnInterpretationV2`·`guardSeyeonRiskBearingActionCausalityV1`·`buildSeyeonRendererPacketV2` 유지. 개인정보 Source Descriptor, 사실 Resolver 및 Retriever 실행 금지.
3. **대사 생성, LLM 정확히 1회**: 서버가 현재 user move와 공용 reveal/행동 범위를 고정하고 기존 `buildSeyeonRendererRequestV2`를 사용한다. 임의 Memory/관계/사생활을 만들지 말도록 한 공개 첫 만남 지침을 추가. 가격 예약 검증과 출력 토큰 상한 확인이 없으면 호출 전 거부. 예약 한도는 최대 4,000 microUSD ≈ 10 KRW(가정 환율 2,500). 이는 청구서 하드캡 증거가 아니다.
4. **사후 로컬 검증, LLM 0회**: 기존 `admitSeyeonRendererDraftV2`로 스키마/출처 참조/표현/공개 단계 검증. 보수적인 공개 문장·허위 기억/관계/고정 전기/사적 사실/관리자 문구 검출과 입력 의도별 대사 필수 조건 검사. 내용 검증 실패 시 대사 **미반환**, 재생성·추가 LLM 호출·자동 fallback 없음. 결과는 `localGuardedDraft`, `verification=LOCAL_RESTRICTED_NOT_SEMANTIC_PARITY`로만 보고.
5. **경합 검사**: 모델 이전·이후 등 4회 authoritative Census 검사를 유지한다. 모든 검사에 전체 메시지 수(최대 7개)와 최신 user ID/송신자 일치가 필요하다. Census는 DB snapshot/commit lock이 아니며 마지막 검사 직후 레이스를 없애지 못한다.

## 우선 구현 범위 및 한계

- **허용**: 기존 3회 기본 경로와 분리된 공개·무기억·무관계 대화, 메시지 1~7개 전체를 authoritative census와 비교할 수 있는 경우만.
- **보류**: 개인 관계·기억·친밀한 표현, 민감 가족/연애/상처, 공유 과거, 권한 사칭, 안전 동등성이 검증되지 않은 자유형 문장, 전체 Thread 확인 불가, 장기 대화/실제 서비스 라우팅. 예상치 못한 메시지는 기존 경로로 **상위 호출자가 명시적으로 분기**해야 한다(자동 모델 fallback 없음).
- 자연어 정규식은 독립 의미 검토의 범용 대체품이 아니다. 인정 범위를 좁혀 연구 후보로 사용한다. 민감 표현을 변형하거나 은유하면 검사가 누락될 위험이 있으므로 **사용자 대상 배포는 HOLD**.
- 오프라인 테스트의 mock Provider는 실제 지연·비용·캐릭터성·안전 동등성·ZDR·invoice hard cap 증거가 아니다. 실모델 비교는 이번 브랜치에서 수행하지 않는다.

## 검증

- 적격 입력 예시와 C07 원본 Gold 36개에 대한 기본 경로 검사. N01/N02만 닫힌 문법에 적격하며 나머지는 호출 전 HOLD.
- 부적격 사용자 주장·민감 정보·관리자/관계 사칭, 가짜 assistant 과거, 이력 누락/중복, Census 경합, 원장 예약 초과, 출력 JSON/출처 위반 및 대사 행동 불일치: 모델 호출 횟수와 공개 반환 여부 검사.
- 검증이 모두 통과한 뒤에야 별도로 안전 임계값·실모델 p50/p95·한국어 캐릭터성 비교를 준비한다. 유료 호출/Production 승격은 별도 증거와 승인이 필요하다.

## 같은 브랜치 작업 규칙

사용자 지시: 브랜치 하나에서 구조 변경 구현을 끝까지 진행. 작업 완료 전 PR 병합, Full Integration CI, 새 유료 호출 금지.
