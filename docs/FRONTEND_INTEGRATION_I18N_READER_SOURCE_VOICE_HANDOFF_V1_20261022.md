# I18N-06 — 9인 공통 화법·Official Reading 원문 의미 보존 인계 v1

> Track owner: `frontend-integration` — 화면 로케일, 언어 중립 화법 참조, 언어별 표현 계약
>
> 상태: **I18N 계약 구현 및 교차 트랙 인계 / actual Reader generation & public release HOLD**.
>
> 이어받은 소유 로드맵: [I18N v2 작업 브랜치(PR #2430)](https://github.com/gycha0109-beep/MyeongHa/blob/frontend-integration/i18n-reader-voice-roadmap-v2-20261022/docs/FRONTEND_INTEGRATION_I18N_CONTINUATION_ROADMAP_V2_20261022.md). 통합 진행 참고: [14개 GPT 통합 로드맵 작업 브랜치(PR #2437)](https://github.com/gycha0109-beep/MyeongHa/blob/docs/master-track-roadmap-gpt14-20261022/docs/roadmaps/MYEONGHA_GPT_TRACK_MASTER_ROADMAP_20261022.md). Saju 참고: [12메뉴 로드맵 작업 브랜치(PR #2679)](https://github.com/gycha0109-beep/Saju/blob/docs/myeongha-roadmap-alignment-20261022/docs/ROADMAP.md). 이 문서는 이 소유자들을 대체하거나 새 permission/LLM/source authority를 만들지 않는다.

## 1. 전제: 현재까지 유지한 작업

- I18N-01~03: `ko-KR` 기본, 명시적 `ja-JP`/`zh-TW` 화면 선택과 `X-MyeongHa-UI-Locale` 수용; `Accept-Language`/profile.locale로 외국어 자동 선택 금지. 기존 UI 설정과 기록 원문 불변.
- PR #2430: 9인 언어 중립 화법 비교, 실제 source 간 차이·승인 상태. **기존 Bible 인물 정본 생성/수정이 아닌 source-annotated 작업표.**
- PR #2431: Reader `responseVoiceLocale` 준비 및 미승인 외국어 출력 차단.
- PR #2432: `ja-JP`/`zh-TW` **언어 공통 표현 원칙**, character-specific pronoun/호칭 미확정.
- PR #2435: 소량의 character×locale delta를 등록할 빈 승인 레지스트리. 실제 캐릭터별 예외값 0개.
- 모두 기존 실행 PR과 Auto-merge를 유지한다. 이번 변경은 새 소스·LLM 호출, Reader/DB runtime 활성화, Master 로드맵 재작성 작업이 아니다.

## 2. 이번 구현: 정본 화법 참조와 차이 관리

구현: `packages/character-content/src/reader-language-neutral-voice-handoff-v1.ts` 및 단위 테스트.

`prepareReaderLanguageNeutralVoiceHandoffV1({selectedCharacterId,voiceAuthority})`

- canonical Character ID는 기존 9인 approved roster에서만 수용.
- `source='published_character_content'`, 같은 선택 인물의 `characterId`, 실제 `contentVersion`, `speech`와 `persona.communication`의 필수 필드가 없으면 `hold`.
- 결과는 정확히 **입력된 published voice 객체를 그대로 참조**한다. `general_chat` / `saju_product` / `face_product`에서 다른 인격·말투 정본을 만들지 않는다.
- 차이 진단은 자료 취합용 **비권위 상태**이며 인물의 속성에 자동 적용되지 않는다. `foreignLanguageRelease='hold'`, `localeStyle='not_authored'` 고정. 어떤 `ja-JP`·`zh-TW` 인칭도 생성하거나 선택하지 않는다.
- 보완 필요(캐릭터 소유자 판단): **세연·여울·서린·미라·도윤·백헌**. 현재 자료에서 큰 불일치가 표시되지 않은 인물: **라현·태겸·윤호**. 이는 Production 승인이나 A~K 바이블 완결 판정이 아니다.

### 캐릭터 설계 트랙 인계 — source 충돌의 처리 순서

| 인물 | 상충하는 근거/음성 | 요구되는 결정(캐릭터 설계 owner) |
|---|---|---|
| **세연** | 상세 초기 semantic proposal의 기억·시간 지향과 최신 세연 Bible Draft / Runtime의 행동 주도형 밝은 동행자 | 동일 인물의 기본 행동축 vs 과거 승인 방향을 구분해 source 우선순위 확정 |
| **여울** | Bible Draft E의 살짝 새침한 존댓말·건조한 태클 vs typed Runtime의 부드러운 정서 관찰자 | 기본 경어·장난/감정 관찰을 어느 상황에서 쓰는지 저자 결정 |
| **서린** | 승인 상세 proposal의 기억·개인의 변화에 대한 관심 vs typed Runtime의 냉정한 구조 분석 | 기억을 대하는 태도가 실제 질문·답변 리듬에서 어떻게 나타나는지 결정 |
| **미라** | 승인된 생활형 무심다정/Friends-to-Lovers vs typed Runtime의 상징적·시적 경계 안내자 | **가장 우선** 기본 인물성·화법 정합화. I18N이 임의로 의미를 선택하지 않음 |
| **도윤** | 승인 관계 방향의 능글·공범감·실험/우회 vs typed Runtime의 빠른 실행 결정 코치 | 능글함과 행동 촉진의 비중·상황별 전환을 결정 |
| **백헌** | 저자 승인 Bible Draft E의 여유·능청스러운 사적 유머 vs typed Runtime의 엄숙·거의 무유머 | 기본/친밀/갈등 상황에 따른 여유·유머 노출 조건 결정 |

출처: `docs/FRONTEND_INTEGRATION_READER_LANGUAGE_NEUTRAL_VOICE_MATRIX_V1_20261022.md` (PR #2430), `docs/character/CHARACTER_BIBLE_STANDARD_V1.md`, `docs/character/CHARACTER_DETAILED_AUTHORING_PO_DECISION_GATE_V1.md`, `docs/character/CHARACTER_RUNTIME_AUTHORING_PO_DECISION_GATE_V1.md`, `packages/character-content/src/runtime-authoring-v1.ts` 및 각각의 최신 개별 Bible Draft. 이 표의 상충 판단은 Character Bible 자체를 변경하는 권한이 아니다.

## 3. Official Saju → UX / Reader / 기록: 하나의 source 의미만 전달

구현: `packages/domain/src/reader-official-locale-continuity-v1.ts` 및 단위 테스트.

`compareReaderOfficialLocaleContinuityV1({channel,requestedLocale,officialSource,presentedSource})`

- 대상 기존 채널: `purchase_summary`(구매 직후 짧은 Reader 전달), `reader_follow_up`(필요할 때 Official Reading 조회), `record_detail`(기존 Official 장문 기록).
- 양쪽은 **서버 검증된 동일 공식 원본의 식별자 증빙을 기존 소유자로부터 받아야 한다**. 웹/모바일·LLM·캐시에서 가져온 임의 `witness`를 Source Truth로 간주하면 안 된다.
- `readingRef`, `officialArtifactResponseHash`, 있는 경우 `sourceSemanticHash`가 같아야 한다.
- 이미 선택된 `scopedSourceUnitRefs`의 전체 집합이 같아야 한다. 사용자에게 보여주는 문장 분량·읽기 화면이 짧아지는 것 자체가 Source Unit을 새로 선택/생성하도록 허가하지 않는다. **요약용 Unit 선택과 grounding scope 결정은 기존 Reader/Source 소유자**가 수행한다.
- 기존 Source의 필수 `requiredQualifierRefs`(가능성/불확실성), `requiredConditionRefs`(기간·적용 조건), `requiredAmbiguityRefs`(미결정 의미), `requiredDisclosureRefs`(한계/방법론/주의) 전체가 일치해야 한다.
- 누락·교체·추가·중복은 명시적 `hold`. 일치해도 `metadata_aligned_hold`이며 **실제 일본어/번체 문장의 의미 동등성, 표현 품질, 소비자 안전, entitlement, 공개 승인을 인증하지 않는다**. LLM 호출·문장 생성·DB 저장 없음.
- 이 인터페이스는 새로운 Saju Claim schema가 아니다. `required*Refs`는 **이미 Source에서 요구한 보호 조건의 참조**만 담는다. Source에 없는 qualifier·기간·결론을 여기서 만들어 넣으면 안 된다.

### 기존 3개 제품 경로별 인수

| 경로 | Source/DB/Reader 측 기존 계약(이 트랙에서 수정 금지) | I18N가 전달하는 조건 |
|---|---|---|
| 구매 직후 요약 | 공식 `ProductReadingResponse` / immutable Reading / verified Receipt→Grant→Reader bind, sourceUnit 범위는 Reader Scene·Semantic Guard가 통제 | 구매 요약은 장문을 새 해석으로 재생성하지 않고 승인된 근거/조건만 전달. 새 로케일이 미승인이면 요약도 비한국어 공개 HOLD |
| Reader 후속 대화 | `OfficialReadingReaderAdmissionScopeV1`, `CharacterStandardChatGroundingV2`, RR-03/04 anchor 및 A2/A3/final DB 정책, 동의한 기억·관계는 별도 권위 | 사주가 필요한 질문에서만 정식 source Unit 참조. 일반 대화 모든 턴에 RAG 강제 금지. 현재 grant/철회/민감 데이터 보호가 우선 |
| 기록 열람 | `OfficialReadingRecordReadAuthorityPortV1` 등 원래 artifact/responseHash/원본 본문 보존 계약 | UI 저자 문구만 언어 선택을 따름. **기존 저장 Reading의 새 언어 재열람 정책(미승인 ②)을 열지 않음**. 원문 덮어쓰기·선택 언어로 새 Official 만들기 금지 |

### 로케일·Source 권한 분리

- **화면 `uiLocale`**: 사용자 명시 선택만 `ko-KR` / `ja-JP` / `zh-TW`. `X-MyeongHa-UI-Locale`는 표시 preference이지 공식 Reading 생성 허가가 아니다.
- **공식 Reading `readingLocale`**: Saju E의 내부 우선순위/On-Demand Renderer 계약은 Saju 소유; language catalog는 공개 허가가 아니다. E-1/E-2의 `internal_preview_only`는 MyeongHa `ProductReadingResponse`로 바로 유통 불가.
- **Reader response locale**: Character Bible/published voice·승인된 character×locale value·언어 보호·Semantic Guard·release flag의 독립 gate. 현재 KO만 기존 경로, `ja-JP`/`zh-TW` 출력 보류.
- **Birth / timezone / region**: 언어 전환만으로 출생시간대·절기·사주 계산 규칙·두 사람 입력·적용 시기를 바꾸지 않는다.
- **Saju source identity**: 기존 Saju `CanonicalReadingSemanticBundleV1.semanticHash`는 의미 재계산·재생성을 막는 기준이지만 실제 MyeongHa official artifact 필드와 동일하다고 가정하지 않는다. MyeongHa의 `officialArtifactResponseHash`와 둘을 잇는 기존 Bridge 근거가 있어야 한다.

## 4. I18N-06a/b/c 공통 화법·로케일 프로필 조합 — A안

구현: `packages/character-content/src/reader-voice-locale-composition-v1.ts` 및 단위 테스트.

`prepareReaderVoiceLocaleCompositionV1({selectedCharacterId,voiceAuthority,requestedVoiceLocale})`는 **운영에서 이미 확인된 published voice**를 전제로 세 개의 기존 contract 함수를 실제로 조합한다.

1. I18N의 `prepareReaderLanguageNeutralVoiceHandoffV1`로 9인 identity + source/contentVersion + 정본 speech/communication 참조를 먼저 고정한다.
2. I18N-06a의 `resolveCharacterVoiceLocaleV1`로 `ko-KR`은 정확히 기존 한국어 voice만 반환한다. 임의 국가 코드나 `Accept-Language`, `X-MyeongHa-UI-Locale`가 Reader response locale로 자동 승격되는 경로는 **새로 만들지 않는다**.
3. `ja-JP` 또는 `zh-TW`는 I18N-06b `inspectCharacterVoiceCommonConventionsV1`에서 **공통 authoring 규칙**을 참조한다.
4. I18N-06c `prepareCharacterVoiceSparseLocaleV1`에서 버전·인물·source-owner 승인·중복 검사된 소량 예외를 확인한다. **등록된 예외가 없는 캐릭터에는 빈 예외 프로필을 억지로 생성하지 않는다(A안)**. 공통 rulebook은 조회 가능하되 `common_rules_only / release: hold`.
5. 등록된 승인값이 나중에 생기면 그 entry를 I18N-06a로 다시 대조하고 `approved_delta_prepared / release: hold`만 반환할 수 있다. 반환값은 **승인된 참조 식별자**이며 말투 문장·프롬프트·실행 허가가 아니다. 애초에 source authority 없는 입력은 HOLD.

**실제 등록값 0개 유지:** `APPROVED_CHARACTER_VOICE_LOCALE_EXCEPTIONS_V1 = []`. 일본어 `俺`/`僕`/`あたし` 등의 사례를 특정 인물에게 배정하지 않는다. 번체 중국어의 특정 호칭도 미등록. **KO 기존 경로만 유지**하며 비한국어 Reader 출력과 공식 사주 재언어화는 HOLD.

현재 다른 PR들이 `main`에 미병합된 상태이므로 #2431(06a), #2432(06b), #2435(06c)의 이미 작성된 **동일 소스 모듈을 내용 변경 없이 이 작업 PR에 포함**하여 직접 import 테스트를 가능하게 했다. 원래 PR/Auto-merge는 유지한다. 각 PR이 `main`에 반영되면 파일 추가 diff가 GitHub 병합 기준에 따라 중복 반영되는지 확인하고, 구성 요소들의 authoring authority는 각 기존 PR에서 계속 추적한다. 공개 시점에는 단일 모듈 경로만 사용한다.

**호출 소유권 경계:** `requestedVoiceLocale`는 *현재 UI locale 값이 아니라* 미래의 서버 소유 Reader 출력 로케일 입력이다. 웹 Reader Scene은 기존 `uiLocale` snapshot/원문 보존 기능만 사용한다. 외국어 Reader 실제 문장 생성·Guard admission·대화/기록/구매 공개는 각 운영 소유 트랙에 남긴다.

## 5. 실제 웹 Reader Scene 소비 지점과 UI 로케일 분리

구현: `apps/web/reader-scene-locale-presentation-v1.js`, `reader-scene-controller.js`, 각 `.d.ts`, 단위 테스트.

- 기존 `createReaderSceneControllerV1`의 `load()`는 **요청 시작 시점**의 UI 로케일(`getUiLocale()`)만 캡처한다. 재시도나 다음 요청에서는 그때의 UI 로케일을 다시 캡처한다. 늦게 도착한 동일 응답에 최신 UI 선택을 뒤섞지 않는다.
- 기존 `projectReaderSceneViewModelV1`로 검증·투영된 `ReaderScene`만 `projectReaderSceneLocalePresentationV1`에 전달. `segments`의 문장·`officialReadingId`·`interpretationHash`·실제 서버 `readerCharacterId`를 그대로 유지한다.
- `uiLocale`, `sourceLanguageNotice`는 **UI 저자 문구 전용 메타데이터**다. 현행 브라우저 DTO는 source output locale을 담지 않으므로 `contentLanguage='source_unasserted'`, `localizedReaderOutput=false` 고정. 서버의 언어 승인 정보가 없는 상태에서 '일본어/번체 Reader 본문'이라고 주장하지 않는다.
- 원문 보존/언어 변경 안내 문구는 `ko-KR`, `ja-JP`, `zh-TW` UI 표현만 작성. 이 문구를 실제 DOM에 표시하려면 기존 Reader 화면의 UI 바인딩이 필요하며 **화면에서 노출 완료로 주장하지 않는다**.
- `protected_fallback`은 표시 문구 때문에 보통 `ready`로 승격되지 않는다. 기존 Reader transport feature enabled/config, 세션·권한·기록·외국어 출력 상태는 그대로.
- UI 헤더는 사용자 표시 선호를 보내는 기존 `reader-runtime-client.js` 경로를 유지하며, 외국어 생성 필드를 Reader 요청 body에 신규 추가하지 않는다.

## 6. I18N-06d 출력 보호 **인계 계약** — 최종 출력 승인 아님

구현: `packages/domain/src/reader-voice-locale-output-boundary-v1.ts` 및 단위 테스트.

`inspectReaderVoiceLocaleOutputBoundaryV1(...)`는 기존 소유 트랙이 **서버에서 검증한 자료**를 전달한다는 전제에서 다음 항목을 엄격히 비교한다.

- Character source: published 9인 바이블 기반의 `characterId`, `sourceContentVersion`, general/Saju/Face surface가 지정된 voice authority와 동일해야 한다. 기존 `validateCharacterVoiceContinuityV1`의 구조화된 사실/무대지시/사주 고유 화법 금지 검사를 함께 사용한다.
- Output locale: 실제 Reader 응답의 **서버 소유 locale**과 `responseLocale`가 일치해야 한다. **UI locale 헤더를 본 함수의 응답 로케일로 사용하지 않는다.**
- 캐릭터별 표현: `appliedStyleRefs`는 현재 approved sparse profile에 실제 존재하는 참조만 사용한다. **상황별** `contextRules`에서 정한 표현은 기존 관계·상황 owner가 현재 조건을 확인한 `activeContextRuleRefs`와 일치하는 경우에만 사용할 수 있으며, 임의 조건·중복·미등록 표현은 HOLD. A안에 따라 미등록 프로필은 새로운 1인칭/애칭/반말 등을 임의로 작성할 수 없다.
- Official Saju에만 `compareReaderOfficialLocaleContinuityV1`를 호출하여 원본 `readingRef`/hash/선택 unit과 필수 Qualifier·Condition·Ambiguity·Disclosure ref 집합의 변화·누락·추가를 HOLD. 비사주에서 사주 witness를 내세우거나 사주인데 근거가 없으면 HOLD.
- `ko-KR`의 정상 결과는 `korean_existing_unchanged / existing_owner_guards_only`로 **기존 보호·권한 검사를 계속 사용해야 한다는 의미**이며 새로운 Reader 출력 권한이 아니다.
- `ja-JP`, `zh-TW`는 증빙이 전부 일치하더라도 무조건 `non_korean_release_not_admitted` HOLD. `zh-CN`·미지원 언어도 HOLD. 캐릭터별 실제 1인칭·호칭 승인값 0개 유지.

**한계 명시:** 이 계약은 텍스트 자체의 번역 품질·의미 동등성을 분석하거나 비한국어 확정 인용을 검출하는 언어 모델이 아니다. 특히 메타데이터 parity와 structured voice evidence는 사용자·브라우저·LLM의 자유로운 self-report를 신뢰해서는 안 된다. Saju/Face source renderer/semantic guard, RR-06 final Output Guard, 최신 DB/소비자 권한/상태 재확인, Character owner의 persona 승인 및 운영 publication/reveal은 **기존 각 소유 트랙의 필수 작업**이다. 이 함수를 통과했다는 이유로 실제 대사 생성·저장·판매·번역 공개를 수행하면 안 된다.

- 테스트 범위: 9인 × general/Saju/Face KO 기존 경로, 9인 × JA/ZH-TW HOLD, 본문 밖 새 style ref/현실 사실/행동 지시, 캐릭터·버전·surface 불일치, 공식 Reading 필수 epistemic 조건·보호 문구 누락·변조, 미지원 locale.
- **실제 Reader 런타임에는 직접 부착하지 않음:** 해당 생성/전송/저장/커밋은 Reader/Memory owner 책임이며 이 트랙이 동작을 임의 변경하지 않는다.

## 7. I18N-06e 부분 수용 — 웹 대화 원문 안내 및 Scene 요청 경계

**현장 적용:** `apps/web/src/chat/ChatPage.tsx`에 화면 전용 안내 슬롯을 연결하고, `apps/web/chat-runtime-client.js`에서 기존 locale-change 이벤트에 따라 안내만 갱신한다. `apps/web/chat-output-language-notice-v1.js`가 고정된 한국어/일본어/대만 번체 UI 안내 상태를 제공한다.

- 화면 `ko-KR`: 별도 안내 숨김. `ja-JP`·`zh-TW`: **화면 언어만 바뀌며 대화 내용은 서버 원문으로 표시되고 자동 번역되지 않음**을 해당 언어의 고정 UI 문구로 표시. 미지원 언어는 KO 표시 정책 유지.
- 안내 요소는 `data-chat-source-language-notice`로 채팅 메시지 스트림 외부에 위치한다. **기존 `message.bodyText`·메시지 ID·발신자·시간·전송/재시도·기록을 변경하지 않는다**. Source Text를 임의의 `translateStaticUi`에 전달하지 않는다.
- 로케일 변경 이벤트는 동일 DOM 안내 문구만 갱신한다. 새 LLM·번역 엔진·Reader response-locale header/body·사용자 언어별 대사 모드 추가 없음. 실제 Reader 응답은 여전히 미승인 비한국어 출력 HOLD.
- 별도 `test/web-chat-output-language-notice.test.ts`는 지원/미지원 로케일, 원문 보존 및 실제 DOM 결속을 다룬다.
- `test/web-reader-scene-locale-presentation.test.ts`에는 **retry 시 새 UI 로케일 snapshot**, **이전 in-flight 응답이 새 UI 로케일 상태를 덮어쓰지 않음**을 추가했다. `officialReadingId`와 전송 경로의 읽기 식별자는 변하지 않으며, Source Unit/본문을 재번역하지 않는다.

**수용 범위의 한계:** 위 사항은 **웹 Chat UI와 Reader Scene presentation controller의 표시 계약**이다. 실제 브라우저의 유료 Reader Chat 생성/내부 장문 Records 재언어화 출시, 모바일 parity, 개별 화법 프로필 공개, 법적 공개 허가는 포함하지 않는다. Reviewer 및 운영자에게 KO/JA/ZH-TW 인터페이스 지원과 다국어 Character 생성 지원을 동등하게 표시하지 않는다.

### 7.1 후속 구현 — Reader Scene UI 헤더 snapshot 및 실제 사주 Reading 원문 안내

- `apps/web/reader-scene-controller.js`의 요청 시작 시점 `uiLocale`를 기존 `reader-runtime-client.js`의 `X-MyeongHa-UI-Locale` **표시 선호 헤더**와 함께 고정한다. 인증 bearer 확인 도중 UI 로케일이 바뀌어도 현재 요청의 헤더·화면 presentation에 서로 다른 snapshot을 사용하지 않는다. Retry는 기존 controller에서 새 요청으로 취급되어 그 시점의 UI locale를 사용한다. Reader 출력 언어를 선택하거나 승인하는 새 header/body는 추가하지 않는다.
- 기존 `apps/web/src/reading-detail/ReadingDetailPage.tsx`의 프리뷰 및 저장된 Official Reading 화면에 `data-reading-source-language-notice` 슬롯을 추가했다. `apps/web/reading-detail-ui-locale.js`의 고정 UI 저자 문구만 `myeongha:localechange` 시 교체한다. `ko-KR`에서는 안내를 숨기며 `ja-JP`/`zh-TW`에서는 **원문이 자동 번역되지 않음**을 표시한다. 기존 문장·공식 record·Reader 관계/권한을 변경하지 않는다.
- `data-reading-step-title`, `data-reading-step-body`, `data-reading-structure-body`에 `data-reading-content`를 적용하여 기존 정적 UI 사전 재도색이 Source-owned 읽기 문장으로 침범하지 않도록 했다. Source-owned 텍스트는 기존 `reading-character.js`에서 원문을 그대로 `textContent`로 표시한다.
- 관련 회귀: `test/web-reader-runtime-client.test.ts`, `test/web-reader-scene-locale-presentation.test.ts`, `apps/web/src/reading-detail-ui-locale.test.ts`.
- **변경 없는 HOLD:** 독립 Reader Scene의 실제 화면 소비/실제 생성형 `ja-JP`·`zh-TW` 답변, 이전 Official Reading의 번역 재열람 ②, 모바일 사용자 노출 및 Production/Sale 공개는 이 변경에서 활성화하지 않았다. Reading Detail 원문 안내는 현재 Saju Preview/기록 표시 경계이며 Reader 생성 엔진 연결로 해석하지 않는다.

### 7.2 후속 구현 — 실제 모바일 Chat·Reading 화면의 원문 안내

- `apps/mobile/src/ui/mobile-source-language-notice-v1.ts`는 기존 웹에서 승인 없이 사용해 온 것과 같은 **고정 UI 안내 문구**만 반환한다. `ko-KR`에서는 숨기고, 명시적으로 선택된 `ja-JP`·`zh-TW`에서는 대화 및 사주 Reading 원문이 자동 번역되지 않는다고 알린다. 지원 범위 밖 locale는 한국어 기본값으로 처리한다. 실제 응답 언어를 판단하거나 생성·저장하지 않는다.
- 소비 중인 모바일 화면: `apps/mobile/src/app/(tabs)/chat/[threadId].tsx` (원문 대화 메시지), `apps/mobile/src/app/reading/scene.tsx` (기존 세연 사주 Preview Reader 연출), `apps/mobile/src/features/saju/SajuPreviewReadingView.tsx` (사주 Preview 결과), `apps/mobile/src/app/reading/[readingId].tsx` (저장된 Official Reading 원문). 채팅과 Reading의 데이터·권한·세션/재시도 로직에 변경 없음.
- `test/mobile-i18n-source-text-notice.test.ts`는 실제 소비 화면 결속, 원문 텍스트 비번역, 웹 안내 문구 동일성 및 미지원 locale 한국어 fallback을 고정한다.
- **구분:** 모바일 Preview 연출은 공식 Reader Scene 생성 출력과 동일하지 않다. 웹 독립 `createReaderSceneControllerV1`는 서버 입증된 `threadId` 및 `officialReadingId`로 호출해야 하고, 운영에서 검증된 실제 Reader Scene 화면 진입 경로는 아직 연결되지 않았다. 이를 임의의 기록→Reader 진입 또는 프리뷰의 UI reader hint로 대신 연결하지 않는다. 실제 생성형 외국어 Reader 출력·기록 재번역·Production 게이트는 HOLD.

## 8. 다음 구현 작업 및 승인 위치

1. **캐릭터 설계 owner:** 위 6명 차이를 실제 Bible/typed Runtime 간에 해결하고 authoritative source/version을 확정. 이 I18N 트랙은 제안·인계만, 원본 수정 금지.
2. **I18N (현재 담당):** #2430/31/32/35 기존 PR Auto-merge 유지. 9인 중립 화법 projection과 Source 인계 계약을 Reader·UX 소비 경계에 **허가된 방식으로** 연결. 이후 `ja-JP`/`zh-TW` 관습 및 소량 예외 후보는 이 트랙이 작성하여 사용자에게 제시, 사용자 승인 전 프로필 실제 값 등록 금지.
3. **Saju / Bridge / DB:** 각 Official 소스 범위/Qualifier/Condition/semanticHash·artifactHash/provenance·정확한 Reader Grant를 기존 scope에서 서버 인수; 기존 12메뉴 A/B/C/D+E를 병렬 유지. 새 해석 문장은 이 I18N 트랙에서 생산하지 않는다.
4. **Reader/Memory/Security:** 지금은 등록된 출처 정보만 기존 guard의 인수 자료로 제공. 후속 실제 장문/요약/채팅의 보호된 자연어 검토는 원래 owner, 새 LLM 호출이나 권한 변경 없이 진행.
5. **Ops/Commerce:** public/paid/source readiness, 캐시·생성 시점, 저장/삭제/환불 권한은 소유자 승인 및 실제 production evidence 전 HOLD.

**정확한 완료 표기:** 이번 PR은 read-only projection + metadata parity boundary + 테스트 + 인계 계약의 구현이다. 캐릭터 개인 바이블 확정, 일본어/번체 Reader 실제 응답, 공식 Reading 재번역/저장, 새 유료 판매/서비스 운영은 완료하지 않았다.
