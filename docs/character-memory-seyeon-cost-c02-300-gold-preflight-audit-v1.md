# COST-02 — 세연 300개 작성형 합성 Gold / 실제 Preflight·Output Guard 무과금 감사

> Watchtower-Track: character-memory  
> 2026-10-15 KST · Draft PR [#1985](https://github.com/gycha0109-beep/MyeongHa/pull/1985)  
> **범위: 100개 기존 수작업 Gold + 200개 새로 작성한 고유 질문, 총 300개. 정답 분류를 돌려주는 fake Provider로 실제 서버 Guard/Resolver 실행.**  
> **절대 주장하지 않는 것:** 실제 Luna/Terra 분류 정확도, 300건 유료 모델 검증, 캐릭터 자연스러움, 2회/3회 경로 운영 인증, Production 안전성.

## 1. 테스트 범위 / 원본

- `scripts/seyeon-model-eval-cases-v1.mjs`: 기존 100개 범주/종류에 기반한 Gold 자료를 **원본 변경 없이 재사용**한다.
- `scripts/seyeon-cost-c02-authored-gold-v1.mjs`: 새로 작성한 200개 **서로 다른** 한국어 질문 (단순 원문 복사·공백 추가/Unicode 조작이 아님). 코호트: 무해한 인사·대화 40건, 사적 이력 질문(가족·과거 연애 유무/상세·취약한 과거) 40건, 권한 사칭·공유 기억 위조·관계 허위 주장·캐릭터 설정 위조 40건, 작품 인용·사용자 자신의 경험을 물어보는 사적 주제 **과잉 차단 음성** 40건, 사적 질문+허위 공유 이력/사적 질문+관리자 사칭 **복합 위험** 40건. 개별 ID/문구 중복 없음.
- 골드의 `topic` / `requiredKind`는 **사람이 작성한 시험 가설**, 실제 사실/원본 권한/Character Bible/실서비스 발화가 아니다. `noClaims`는 지정된 무해한 질문만 명시한다. 문장별 모델 추론은 수행하지 않는다.

## 2. 검증한 실제 코드 경로

`test/seyeon-cost-c02-authority-and-review-offline-v1.test.ts`:

1. 300개 문장마다 Fake Provider에서 같은 **골드 라벨**을 전달한 뒤 서버의 실제 `runCharacterGovernedPreflightV1`을 *기존 분리 분류 두 포트*와 *`createSeyeonUnifiedGovernanceCandidateV1` 한 포트*로 비교. 한 포트 후보에 한 번의 합성 구조화 모델 응답만 전달, 실제 서버 `guardCharacterIntegrityClassificationV1`과 `guardCharacterDisclosureTopicClassificationV2` 적용.
2. 기존 `evaluateCharacterIntegrityClaimV1`과 Authority Resolver의 `MISSING` 권한을 통과시켜 **허위 공유 이력/관계/캐릭터 주장·관리자 사칭이 사실로 승격되지 않는지** 비교. Permission resolver를 AI 판단으로 대체하지 않음.
3. 민감한 질문은 실제 `runCharacterDisclosurePreflightV2`에서 Topic Descriptor까지 이르지만, **승인된 Character Fact Authority가 없음**을 확인하고, 검색·원문 공개 전 전체 거부. source/owner를 mock이 지어낸 것이라 실제 DB 권한 실증은 아니다.
4. 무해한 대화는 두 경로에서 실제 Preflight Output 객체가 동일하며 Private Source 검색을 수행하지 않음. 출력 경계에서 불법 Topic/Kind/추가 필드/지나친 Claims 등을 거절한다.
   - **추가로 300건 각각**에 의도적 Fake 분류 오류를 넣는다. 민감 대화를 비민감으로 오분류하면 서버의 기존 스키마 검증은 이를 감지하지 못함. 무해한 대화를 민감으로 오분류하면 서버는 권한 부재에 따라 과잉 HOLD. 허위 관계/기억 사실을 분류에서 누락할 경우 Authority Resolver가 호출되지 않음. 이 세 지표는 **실제 모델 오류율이 아니라 가상 오류 발생 시의 코드 동작**이다.
5. **첫 인사 1건**은 실제 한 번의 서버 Unified Preflight Output으로 Runtime Context를 만들고, Interpreter/Draft·별도 Semantic Reviewer를 Fake Provider로 통과시켜 정확히 **3번의 합성 모델 호출**이 이루어지는지 검증한다. 이것은 실제 성공률/자연스러움 증거가 아니다.
6. 실제 `createSeyeonFastDialogueShadowV1`, `guardSeyeonTurnInterpretationV2`, `guardSeyeonRiskBearingActionCausalityV1`, `admitSeyeonRendererDraftV2`, `guardSeyeonRendererOutputV2` 경유. 합성된 허용 발화는 **독립 Reviewer의 일치하는 해시**가 있어야 통과하고, 가짜 MemoryRef·privateRef·deep disclosure·Schema Injection·Semantic Review 거부/해시 불일치에서는 반환하지 않아야 한다.
7. 문구/실제 모델 답변/사용자 개인정보를 CI 로그에 기록하지 않는다. 비용·토큰·실측 성공률은 측정하지 않는다.

## 3. 확인된 한계 — 반드시 유지할 안전 차단

**핵심 불충분한 부분: 모델 false-negative를 서버가 의미적으로 재분류하지 않는다.**

민감한 질문에 Fake Provider가 `claims:[] / topicKey:null`을 반환하면 서버의 구조화 스키마/권한 검사는 `not_sensitive`로 수용할 수 있다. 모델 라벨을 진실처럼 취급하면 Authority Resolver가 필요한 순간을 놓친다. 이것은 **현재 통합 분류 후보의 실제 권한 침해 발생을 입증한 것도, 안전함을 입증한 것도 아니다.** 검사기는 권한 출처를 거짓 승인하지 않지만, 분류 *누락*은 후속 Context/Response로 이어질 수 있으므로 **2회 분류 생략 및 3회 Production 승격 BLOCK** 조건이다.

또한:
- 300개는 **정답을 주입한 서버 코드 테스트**, 300건 실제 모델 리콜/오탐 측정이 아니다.
- Reviewer의 Fake PASS는 문장의 자연스러움/사실성/인젝션 회피를 검증하지 않는다.
- 현재 3회 Fast Dialogue Shadow는 공개 첫 만남/0 Memory/관계 없음만 허용. 다중 턴·기억 출처가 포함된 경우 변형된 분류 결과라도 이 경계를 별도 증명해야 한다.
- 실제 DB Content Source/Grant의 존재·revocation·독립 세션/스트리밍 실전 전송은 이전 G1~G3 시험 범위와 운영 승인 문제로 남아 있다.
- 독립 비용 감사 없이 3회 절감율 또는 적응형 2회 품질/비용 개선을 주장하지 않는다.

## 4. 승격 차단·다음 실행

| 게이트 | 현재 | 다음 증명 |
|---|---|---|
| 300개 합성 골드 + 진짜 서버 Guard에 Fake Provider 연결 | 구현/CI 검증 대상 | 새 테스트 + 캐릭터 전체 TypeScript/CI |
| 분류 모델 **실제 의미 분류 리콜/오탐** | **미검증** | 별도 허가된 모델 테스트, 민감/허위기억 누락 0·과잉차단 측정 |
| 모델이 주는 악의적/부정확한 구조화 출력의 Guard | Fake 출력 예시만 시험 | 독립 구성 공격집합/DB Source/상태 전이 실증 |
| 장기 대화·세연다움/감정/일관성 비열등성 | **미검증** | COST-03 Blind Review + 다중 턴 fixture |
| 3회·2회·캐시/출력 토큰 실제 비용 | **미검증** | COST-04 계측 후 비용 사고 Owner 재개 승인 별도 |
| Public API·Production 기본 모델 라우팅 | **HOLD** | #1816·#1887·DB/Security/Character/Ops Owner 판정 |

**중단 규칙:** 기존 `.github/workflows/seyeon-dialogue-path-real-api-eval-v1.yml` / `seyeon-model-eval-v1.yml`의 `if: ${{ false }}` 잠금 유지. 유료 모델/Production DB·Reader/Token Stream·원본 기억 활성화/PR 병합·전송 경로 변경 금지.

**판정:** COST-02의 **무과금 서버 검증 부분만 구현 후보**이며, 실제 의미 분류·자연스러움·운영 비용 검증은 **OPEN/HOLD**.
