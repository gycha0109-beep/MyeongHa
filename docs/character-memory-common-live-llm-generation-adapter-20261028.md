# 명하 C1 공통 캐릭터 — 실제 구조화 LLM 생성 연결 (연구용)

**트랙:** character-memory / C09 공통화  
**브랜치:** `feat/character-memory/c08-local-one-call-shadow-v1` / Draft PR #2575  
**작업 성격:** 생성·대사 연결 구현. 유료 호출·Production 변경 없음.

## 구현한 연결

- `packages/domain/src/character-dialogue-continuity-shadow-v1.ts`: 기존 캐릭터 `speech/persona/behavior`에서 말투뿐 아니라 **질문 우선순위·도움 우선순위·상황별 행동 규칙·피해야 하는 행동**까지 공개 연구용 `decisionProfile`에 포함한다. 사적인 Canon `hiddenMotivation`, 영구 기억, 사주 결과, 존재하지 않는 현재 생활을 모델 입력으로 넣지 않는다. 공개 데이터의 행동 규칙은 상황→고정대사 매핑이 아닌 판단 기준으로 사용한다.
- `apps/api/src/character-dialogue-live-model-shadow-v1.ts`: 기존 OpenAI Responses **실제 구조화 모델 호출 전송기** `createOpenAiSeyeonStructuredProviderV1`를 연구용 통신 호환 계층에서 재사용한다. 이 전송기의 이름은 과거 세연용으로 남아 있지만 공통 캐릭터 성격 선택은 하지 않는다. 전송기 자체의 명칭·메트릭도 세연용이므로 **운영 다중 캐릭터 메트릭으로 승격해서는 안 된다.**
- 생성 모델 **한 번의 호출**에서 현재 캐릭터의 `notice/want/tension/action/rationale`과 **대사**를 함께 구조화 생성한다. 기존 `runCharacterDialogueMultiturnOfflineShadowV1`의 DB 원문 재확인을 거친 후 대사를 단 한 번 소비하게 연결한다. 숨겨진 대사를 재호출하거나 다른 대화로 옮길 수 없도록 `WeakMap`의 동일 plan 객체 및 정확한 decision fingerprint를 검사한다.
- **독립 검토**는 별도 모델 identity에 두 번째 호출로 수행한다. 검토에는 판단·대사·이전 대화·검토 기준과 생성물이 검토받은 대상임을 확인하는 지문이 들어가며, 최종 admit/reveal은 기존 공통 검증기에 맡긴다.
- 실제 연구용 실행 진입점 `runCharacterDialogueLiveModelShadowV1`은 기존 Subject/DB/C1 Runtime을 전달받아 한 번의 생성 호출과 한 번의 독립 검토 호출을 조립한다. 네트워크는 유효한 서버 Scope와 승인 훅이 전달된 경우에만 시도한다.
- 기존 생성/검토 전송기의 `beforeDispatch`(서버 소유, 비용 승인/예약)과 `meteredAfterOutcome`(사용량 및 실패 기록) 연결을 **필수**로 강제한다. 훅이 없으면 모델 호출기가 생성되지 않는다. **주의:** 기존 OpenAI 전송기는 `meteredAfterOutcome` 자체가 실패할 때 로그만 남기므로, 영속 기록 성공을 보증하지 않는다. 최종 운영 비용 원장 계약으로 간주하지 않는다. 런타임은 `NODE_ENV=development|test`로 제한된다.
- 결과는 **Shadow 후보**로만 반환. `mayCommit=false`, `mayReveal=false`, Memory/Relationship/DB 쓰기·Production 라우팅 없음. 기존 `CharacterRuntimeContextV1`, Subject DB 권한·출처·Revision 및 독립 Output Guard를 우회하지 않는다.

## 검증 기준과 상태

- `test/character-dialogue-live-model-shadow-v1.test.ts`: 9명 기존 Authoring의 공개 행동 규칙을 각각 모델 생성 입력에 반영하는지, 한 번의 생성 호출+한 번의 독립 검토가 유지되는지, 이전 Assistant 발화가 정확한 자료로 전달되는지, 잘못된 검토 판정이 HOLD되는지, 생성 초안 재사용/동일 reviewer 모델을 거부하는지, 비용 훅 없이는 네트워크를 시작하지 못하는지 검사한다.
- 실제 OpenAI Responses 형식의 POST·응답 파싱 경로까지 `fetchImpl`로 가로채어 비용 승인·요청·독립 검토·사용량 콜백 2회를 확인하는 무료 테스트를 추가했다. 이는 **네트워크를 모의한 구조/경계 테스트**이며, 실제 모델이 캐릭터마다 다른 고유 인격·자율성·자연스러움을 보이는지 입증하지 않는다. 테스트에서 제공되는 개성 있는 결정도 Synthetic 값이다.
- 실제 비용 발생 실험을 위해서는 별도 승인 및 검증된 비용 상한·독립 Reviewer 모델·Key와 유효한 서버 DB 조회 권한이 선행되어야 한다. 기존 API 실행자 `myeongha_api_executor`의 `conversation_messages` 직접 SELECT 부족은 이 Shadow의 DB 접근 블로커다.
- 동일 모델/컨텍스트로 반복 턴의 사용자 체감 판단·맞장구/거짓 사건/대화 지속성/차별성을 실제 출력으로 비교하기 전에는 **C09 인격 구현 완료라고 표시하지 않는다.**
- 이번 구현은 기존 Runtime의 `canon` 전체 또는 비공개 Profile을 모델에 사용하지 않는다. 운영 Canon 공개 결정은 별도 권한 경계다.

## 다음 실제 작업

비용 승인 전까지 기존 분리된 C09 Shadow와 공통 LLM 호환성을 연결·검증하고, 실제 허용된 서비스 권한에서 스레드/콘텐츠 Pin이 해결되면 소액 한도 안에서 세연·여울·서린 등 서로 다른 캐릭터의 **동일 질문 3~5턴 실모델 평가**를 수행한다. 평가 기준은 실제 고유 의사결정, 근거 있는 입장 유지·변경, 허위 기억 금지, 일관된 말투·관계 거리, 모델 비용 및 지연이다.

**현 시점 완료 판정:** 실제 LLM 호출 가능한 어댑터 코드 구현 후보 / 실모델 검증·Production 통합 **미완료**.


## 2026-10-28 세연·여울·태겸 5턴 실모델 비교 실행 기록

- 실행 대상은 `seyeon`, `yeoul`, `taegyeom` **세 명만**이다. `seorin`은 실제 운영 Runtime 준비 상태가 확인되지 않아 제외했다.
- 별도 실험은 기존 `CHARACTER_RUNTIME_AUTHORING_V1`의 공개 `speech/persona/behavior`를 직접 추출한다. 이는 실제 운영 DB Snapshot을 읽는 것이 아니므로 **게시된 Production Runtime 전체 검증**과 혼동하지 않는다.
- 동일한 사용자 5턴(선택 존중 / 개입 반박 / 서운함 / 무조건 내 편 압박 / 이전 입장 질문)을 독립 스레드로 진행하며, 첫 질문 이후에는 각 캐릭터의 **실제 생성 대사**를 다음 입력으로 연결한다.
- 고정 모델: OpenRouter `openai/gpt-4.1-mini` 후보 생성, `openai/gpt-4.1-nano` 독립 검토, **최대 15+15=30 호출, $0.30 상한**. 유료 실행은 모델 카탈로그, 토큰 예상 최대 비용, 저장 전 사전예약, 결과 사용량, 실패 시 즉시 중단, 재실행 금지로 제한된다.
- 신규 `scripts/character-c1-three-five-paid-eval-20261028.mjs`와 공개 Authoring 번들, 전용 1회 GitHub workflow 및 합성 대화 결과 리포트 출력 기능을 구현했다.
- 유료 1회 실행 시도: [GitHub Actions #40633034128](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40633034128) `failure`. GitHub job의 `steps=[]`, 시작 직후 실패. **모델 호출 전에 중단되어 0회/비용 $0**. 인증·Environment 보호 규칙의 구체적 차단 메시지는 현재 API에서 확인할 수 없어 원인을 단정하지 않는다. 보호 조건을 회피하는 다른 Secrets 진입점으로 재호출하지 않는다.
- 별도 **비용 0원** 코드 검증: [GitHub Actions #40633178279](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40633178279) `success`; TypeScript, 두 C1 모델/멀티턴 테스트, 실행 스크립트 `node --check`, C1 정확한 3인 Authoring 번들, 5턴 Dry-run 모두 통과.
- 미완료: **실제 모델의 15개 응답과 독립 검토 15개는 아직 0개**. 캐릭터성·자율성 성공을 선언할 근거 없음. Main-only secret-bearing Actions trust boundary 등 승인된 실행 위치에서 정확한 동일 스크립트를 수행할 수 있는지 먼저 확인해야 한다. 운영 배포·Production DB/ACL/Memory/Relationship 변경 없음.
