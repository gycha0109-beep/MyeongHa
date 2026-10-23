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

### 7.3 후속 구현 — Reader Scene 원문 보존 표시 컴포넌트(미연결)

- `apps/web/src/reader-scene/ReaderScenePanel.tsx` 및 `ReaderScenePanel.css`는 **기존 `createReaderSceneControllerV1`에서 검증·투영한 상태의 UI 소비 컴포넌트**만 제공한다. 웹 앱의 공개 라우트, Reading Detail, Chat에 자동 부착하지 않고 새로운 요청/구매/권한 허용 버튼도 생성하지 않는다.
- `ready`에서는 서버 인증 후 도착한 `segments[].text`를 순서대로 React 텍스트로만 렌더한다. `data-reading-content`를 사용해 기존 전역 UI 정적 번역 사전이 소스 문장을 덮어쓰지 않도록 하며, React 텍스트 escape로 HTML 주입을 실행하지 않는다. `readerCharacterId`는 서버 반환 계약을 유지하고 캐릭터 이름은 이미 허가된 **표시 전용** locale mapping만 적용한다.
- `sourceLanguageNotice`는 **요청 시작 시점**의 `state.uiLocale` snapshot에서 받은 UI 저자 문구를 그대로 표시하며, 현재 화면 설정이 이후 바뀌더라도 기존 응답을 재번역하지 않는다. `contentLanguage=source_unasserted`, `localizedReaderOutput=false`를 DOM 상태에도 명시한다.
- `protected_fallback`은 해석 본문을 표시하지 않는다. `feature_unavailable`/`auth_required`/`access_denied` 등은 안전한 UI 상태만 표시하고, `retryable_error` + 기존 controller `canRetry` + 명시적으로 전달된 재시도 콜백이 모두 있을 때만 재시도 버튼이 나온다. Error/loading 문구의 언어 선택은 **UI 상태 한정**이다.
- `ReaderScenePanel.test.tsx`는 3개 지원 UI locale, 원문/출처 보존, HTML escape, protected fallback, 접근 거부 시 무재시도, **공개 화면 미연결** 상태를 회귀로 보호한다.
- **출시 상태 불변:** 이것은 장차 권한이 확인된 화면에서 호출할 수 있는 inert 소비 부품이다. 기존 `threadId`·`officialReadingId` 확인/Reader feature gate/entitlement/production release는 전적으로 기존 소유자 경계이며, JA/ZH-TW Reader 생성 및 과거 Official 번역 재열람은 HOLD를 유지한다.

### 7.4 후속 구현 — Owner-bound Reader Scene 통합 어댑터(공개 미연결)

- `apps/web/src/reader-scene/ReaderSceneBoundPanel.tsx`는 이미 작성된 `createReaderSceneControllerV1`과 `ReaderScenePanel`을 하나의 UI 생명주기로 연결하는 **공개 미연결 컴포넌트**다. 독자적으로 Reader 런타임을 켜거나 `enabled:true` 클라이언트를 생성하지 않는다. 승인된 소비 owner가 **기존 서버 소유 Thread + Official Reading 입장 조건에 따라** `ownerBinding`을 전달해야만 활성화된 클라이언트의 기존 preview 엔드포인트를 호출한다. 서버는 각 요청의 권한을 독립적으로 재확인해야 한다.
- `ownerBinding=null`이면 idle, `client.enabled=false`이면 feature unavailable을 표시하며 요청하지 않는다. 확인된 owner가 현재 계정/세션/권한 범위에 맞게 갱신하는 `displayScopeRevision`은 **UI 캐시 무효화 토큰**일 뿐 entitlement/source 증거가 아니다. 인물/사주 출력 권한은 생성하지 않는다.
- `client + displayScopeRevision + threadId + officialReadingId`가 바뀌는 즉시 이전 응답을 **렌더 단계에서 가리고**, Effect cleanup에서 기존 요청을 `cancel()`한다. 최신 Effect에 속하지 않은 응답은 콜백에서 버린다. 사용자 재시도 버튼은 기존 `controller.retry()`를 호출할 뿐 새 요청 언어·Reader ID·읽기 ID를 임의로 구성하지 않는다. `myeongha:localechange`는 UI-authored loading/error 안내만 다시 그리며, 이미 도착한 Reader 응답의 요청 시점 locale snapshot이나 원문은 다시 선택·번역하지 않는다. 화면이 다시 그려졌다는 이유만으로 별도의 Reader 요청을 재발행하지 않는다.
- `apps/web/src/reader-scene/ReaderSceneBoundPanel.test.tsx`는 비활성 클라이언트, owner 입장 없음, 렌더 중 미요청, 클라이언트·세션 revision·기록 ID 변경 시 이전 문장 비노출, public Chat/Reading 라우트와 분리를 고정한다.
- **남은 계약:** 운영 Reader Scene의 서버 입장/세션 변경 이벤트와 실제 라우트 binding은 Reader/UX 소유자가 검증한 진입 구조가 제시된 경우에만 수용한다. Records handoff에 Thread ID/Reader 선택 권한을 덧붙이지 않는다. I18N 자체에는 Character voice 승인, JA/ZH-TW 생성, 과거 공식 기록 언어 변경 또는 일반 운영 공개 권한이 없다.

### 7.5 I18N-07 허가된 부분 집합 — 모바일 공식 풀이 원문 재열람 화면의 UI 현지화

- `apps/mobile/src/ui/mobile-official-reading-shell-locale-v1.ts`에서 **이미 열람 권한을 확인한** 저장된 Official Reading 화면의 UI 저자 문구(뒤로 가기, 로딩, 재시도, 오류/권한 한계, Reading 단계, 기록과 Reader의 관계 안내)를 명시 선택된 `ko-KR`/`ja-JP`/`zh-TW`에 맞춰 제공한다. 미지원 locale는 한국어 기본값이며, 이 문구는 `readingLocale`/`responseVoiceLocale` 선언이나 번역 출력의 승인 근거가 아니다.
- `apps/mobile/src/app/reading/[readingId].tsx`는 기존 서버 `readOfficialReading(readingId)`, 계정 변경 epoch 무효화 및 별도 Reader Entry 권한 경계를 그대로 유지한다. `record.display.steps[].title/primary/structure/supporting`, `record.display.notices`, 공식 식별자/계산/날짜는 **서버 원문 그대로** 표시하며, UI 전용 카테고리 이름·Reader 연결 인원 숫자·상태/주의 문구만 새 사전 및 기존 `t()`로 현지화한다.
- `officialReadingArchiveFailureCopyV1`는 이 화면에서 **클라이언트가 작성한 4종 UI 오류 문구**만 번역한다. 외부/임의 오류나 서버 본문은 절대 번역 소스로 사용하지 않고 기존 일반 실패 안내로 수렴한다. 열람 권한을 변경하거나 실패한 아카이브를 가상 번역으로 대체하지 않는다.
- `test/mobile-official-reading-shell-locale-v1.test.ts`는 세 locale, 미지원/누락 locale 한국어 fallback, 4종 오류, UI 전용 Reader 인원 표시, 실제 Archive 소비 화면과 원문 불변 필드 및 공식 Reader Entry 보호를 고정한다.
- **중요:** 이는 기존 한국어 저장된 공식 Reading을 원문으로 다시 읽는 화면의 국제화 UI 수용만 의미한다. 정책 ②의 **과거 한국어 Official artifact를 JA/ZH-TW 언어로 다시 생성/번역하여 열람**하는 것은 여전히 HOLD다. 구매/Grant/Reader 생성/새 외국어 사주 해석 공개는 범위 외다.

### 7.6 I18N-07 부분 집합 — 모바일 Saju Preview 단계·주제 UI 언어 표시

- `apps/mobile/src/features/saju/SajuPreviewReadingView.tsx`와 `apps/mobile/src/app/reading/scene.tsx`의 **클라이언트에서 이미 작성된** 프리뷰 주제명과 읽기 단계 번호만 기존 `useMobileUiLocale().t()`에 연결했다. 선택된 주제/진입 권한/원래 Preview 요청/버튼 행동은 변경하지 않았다.
- `step.title`, `step.primary`, `step.structure`, `step.supporting`, `result.notices`, `currentStep.*` 등 서버가 반환한 사주 원문은 **어느 로케일에서도 번역·재생성하지 않는다**. 미승인 비한국어 Saju/Reader output 호출 및 official 기록 생성 없음.
- `test/mobile-saju-preview-labels-i18n.test.ts`는 기존 UI 사전의 단계 표시 언어와 두 실제 Preview 경로에서 UI labels만 현지화하는 경계를 고정한다. 이 변경은 Saju source approval, Character voice locale approval, Official Reading 재열람 정책 ②의 해제가 아니다.

### 7.7 I18N-07 부분 집합 — 모바일 공식 기록의 Reader 소개·차단 상태 UI 현지화

- `apps/mobile/src/features/reading/mobile-official-reader-entry-locale-v1.ts`는 **UI가 작성한 설명 문구만** `ko-KR`/`ja-JP`/`zh-TW`에서 제공한다. `MobileOfficialReadingReaderEntry`의 인물 선택 안내, 공식 Reading과의 관계, 접근 거부/일시 오류/판매·공개 미승인 등 기존 10가지 **이미 닫힌 해설 상태**를 같은 상태 코드로 표시하며 미지원 UI locale는 기존 한국어로 수렴한다.
- 상태 원천은 그대로 `projectMobileOfficialReadingReaderEntryV1(record, selectedReaderId)`이다. 새로운 Reader release/entitlement/official Reading admission 진입을 생성하지 않는다. UI projection은 `interpretationReleased=false`, `readerOutputLocalized=false`만 나타내고 어떤 Reader response locale도 선언하지 않는다.
- 각 캐릭터의 `name`, `title`, `tone`은 기존 mobile presentation source 그대로 사용한다. 임의 JA/ZH-TW 인칭·캐릭터 화법/소개 번역이나 character-specific delta를 작성하지 않는다. 국문 본문과 source가 섞여 보일 수 있어도 이 UI 적용만으로 Reader 다국어 화법을 지원한다고 안내하지 않는다.
- `test/mobile-official-reader-entry-i18n.test.ts`와 기존 `test/mobile-official-reading-reader-entry.test.ts`를 실제 UI 속성·기존 closed-state 계약에 맞게 연결했다. Node 전용 정적 소스 확인 테스트는 모바일 앱 `src/`가 아닌 루트 `test/`에 유지한다.
- **남은 소유권:** 캐릭터별 의미 충돌 6명과 개별 voice delta 등록은 Character owner 의사결정 전 HOLD. 공개 Reader Scene/paid interpretation, ② 이전 Official Reading 재언어화는 별도 승인 전 불허.

### 7.8 I18N-07 부분 집합 — 모바일 Saju/Face Reader 선택 UI의 3개 로케일

- `apps/mobile/src/features/reading/mobile-reader-picker-ui-locale-v1.ts`에서 실제 사주·관상 화면의 공용 `MobileReaderPicker`가 이미 제공하는 **UI 전용** 선택·닫기/변경·접근성·프리뷰만/준비 중·미공개/권한 안내를 명시 선택 `ko-KR`/`ja-JP`/`zh-TW`로 작성했다. 미지원 locale는 한국어로 돌아간다.
- 원래 `MOBILE_READER_PRESENTATIONS_V1`의 9인 canonical key/name/title/tone과 `isMobileReaderPreviewSelectableV1`의 세연 1인 Preview는 변하지 않는다. 화면 로케일로 새로운 Reader를 선택 가능하게 만들거나 Face 분석/유료 Reader 해설을 열지 않으며, 기존 문구의 `sourceNotice`는 비한국어 UI에서 **캐릭터별 소개 원문이 번역되지 않음**만 안내한다.
- 공식 아카이브의 `MobileOfficialReadingReaderEntry`에도 같은 원문 보존 안내를 연결했다. 일본어/번체 UI가 제공되더라도 기존 캐릭터 소개 문구/톤은 한국어 정본의 표시이며 일본어/번체 음성 프로필, 상품/출력 승인으로 간주하지 않는다.
- `test/mobile-reader-picker-i18n.test.ts`, `test/mobile-official-reader-entry-i18n.test.ts` 및 기존 Reader picker/rollout 테스트에서 Saju·Face 화면 상태·미공개 상태·서버 source 불변·3개 UI 로케일 경계를 다룬다. Node 전용 소스 검사는 루트 `test/`에 배치했다.
- **한계/후속:** Character owner가 인물성 충돌과 locale-specific 화법을 승인하기 전 실제 다국어 캐릭터 대사 생성은 HOLD. I18N-07의 공개 도장은 원래 feature/release owner가 주는 것이며 이번 UI 구현만으로 배포/판매 승인이 아니다.

### 7.9 I18N-07 부분 집합 — 모바일 대화 입력 영역의 차단·준비 상태 UI 로케일

- `apps/mobile/src/features/chat/mobile-chat-compose-ui-locale-v1.ts`는 **클라이언트가 작성한** 입력창 placeholder와 현재 상태에 따른 3종 입력 불가 안내만 `ko-KR`/`ja-JP`/`zh-TW` UI로 제공한다. 지원되지 않거나 미선택된 locale는 한국어로 되돌린다. 이 파일은 Reader/Chat 응답 본문 번역기나 권한 계산기가 아니다.
- 실제 `apps/mobile/src/features/chat/ChatReadComponents.tsx`에서 기존 `snapshot.characterId`, `snapshot.status`로 계산하는 `allowed = ready && seyeon`와 보호된 `isSeyeonHistoryRevealHoldV1(snapshot)` 분기를 **그대로 유지**한다. 허용되지 않은 경우에만 `checking_character`, `waiting_history`, `character_not_ready` 상태의 제목과 안내문을 새 고정 UI 사전에서 표시한다. 입력창이 허용된 경우에는 placeholder만 UI 현지화한다.
- 실제 서버 메시지 `message.body`, Character 원문 소개 `greeting.openingLine`, 저장된 대화·메시지 식별자·전송 payload, 서버 제공 전송 상태 `status`는 그대로다. 사용자 locale에 따라 대화 접근권을 부여하거나 서버 응답의 출력 언어를 요청하지 않는다. 기존 `projectMobileSourceLanguageNoticeV1`는 비한국어 UI에서 원문 보존을 계속 안내한다.
- `test/mobile-chat-compose-ui-locale-v1.test.ts`에서 3개 상태 × 3개 명시 UI locale, 한국어 fallback, 기존 송신/History HOLD gate·원문/공식 상태 불변을 회귀 고정한다. Node 파일 검사는 모바일 TypeScript source tree 외부 루트 `test/`에 둔다.
- **남은 승인/실행:** 세연 이외 인물의 AI 채팅과 JA/ZH-TW 생성형 Reader 응답 공개는 Character·Reader·Security·Release owner 승인 전 HOLD. UI 상태가 현지화돼도 별도 서버 권한·출력 보호 조건을 통과했다는 뜻이 아니다.

### 7.10 I18N-07 부분 집합 — 모바일 Chat 기록·보호 HOLD의 UI 상태 현지화

- `apps/mobile/src/features/chat/mobile-chat-history-shell-locale-v1.ts`는 기존 대화방 읽기 화면의 **클라이언트 작성 UI 문구만** 명시적 `ko-KR`/`ja-JP`/`zh-TW`에 맞춘다. `loading_initial`/idle, 일반 조회 오류, 빈 기록, 끝·다음 페이지·재시도, 에러 코드 앞의 안내 라벨과 초상화 접근성의 `프로필` 문구가 대상이다. 미지원 locale는 한국어로 돌아간다.
- 기존 `isSeyeonHistoryRevealHoldV1(snapshot)` 분기는 **읽기·더 보기·입력(Composer) 모두 그대로 유지**한다. 개인정보 조회 권한 서버 확인 전에는 기록을 표시할 수 없고, 반복 조회/앱 재설치로 제한을 해제하지 못한다는 원래 주의 문구를 UI 사전에서 각 언어로 정확하게 표시한다. 진단 코드 `SEYEON_HISTORY_REVEAL_HOLD` 및 서버 제공 `snapshot.errorCode`는 번역·변경하지 않는다.
- `ChatReadComponents.tsx`의 사용자/캐릭터 `message.body`, 검증된 빈 방의 `greeting.openingLine`, `group.label`/메시지 식별자·시간·redaction과 원래 `const allowed = ready && seyeon` 입력 권한 조건은 변경하지 않는다. UI 언어로 권한이 추가되거나 재시도가 승격되지 않고, 새 LLM/Reader 응답 언어 요청도 발생하지 않는다.
- `test/mobile-chat-history-shell-locale-v1.test.ts`는 3개 UI 로케일·미지원 언어 한국어 fallback·HOLD 문구의 해제 불가 의미·실제 메시지 원문 및 UI 소비 지점을 고정한다. 기존 `test/mobile-seyeon-history-hold-ux.test.ts`, `test/mobile-applizing-chat-reader-fortune-20261016.test.ts`는 원래 한국어 안전 문구를 보존하면서 UI 사전 참조를 검사하도록 정렬했다.
- **남은 승인:** 캐릭터 음성/대사 현지화, Saju/Face 공식 원문 재언어화, 개인정보 기록 공개 및 Reader 상용화는 각 원래 소유자의 서버 증빙과 별도 승인 전 HOLD.

### 7.11 I18N-07 부분 집합 — 모바일 Chat 검증된 대화방 Header UI 문구

- `apps/mobile/src/features/chat/ChatReadComponents.tsx`의 기존 `ChatReadHeader`는 서버가 결정한 `snapshot.characterId`에 대응하는 Character ID/표시 이름과 `resolveMobileChatCharacterPresentationV1`의 `presentation.title`을 **그대로 유지**한다. `apps/mobile/src/features/chat/mobile-chat-history-shell-locale-v1.ts`의 UI 사전에 대화 상대 미확인 대체 표시, 서버 확인 대화방 안내, 기록 섹션 명칭, 초상화 접근성 라벨만 `ko-KR`/`ja-JP`/`zh-TW`로 작성해 연결했다.
- 텍스트 표시에 따른 승인 혼동을 막기 위해 Character 고유명, 고유 직함, `openingLine`, `message.body`, `group.label`, 전송 권한, 개인정보 기록 HOLD, 세션/Thread/Reader ID는 재해석·번역하지 않는다. 특히 `presentation.title`은 `t()` 대상이 아닌 기존 Character 소유 데이터로 취급한다.
- `test/mobile-chat-header-ui-locale-v1.test.ts`는 3개 UI 언어, 원본 캐릭터 목록과 표시 정보 보존 및 실제 화면 소비 지점을 회귀 고정한다. 기존 Chat 기록 UI 회귀 `test/mobile-chat-history-shell-locale-v1.test.ts`에도 새 UI 라벨을 포함했다. 모든 Node 소스 확인 테스트는 루트 `test/`에 둔다.
- 미승인 JA/ZH-TW 생성형 Character 대화, 개별 화법, 공식 Reading 재언어화와 공개 Reader Scene 연계는 여전히 별도 소유자 승인 전 HOLD다.

### 7.12 I18N-07 / EN-UI-A / CN-UI-A 1차 구현 — 영어·간체 비활성 언어 선택 준비

- 사용자 승인 로드맵 v2.2 (PR #2430)는 `en-US`, `zh-CN`을 **신규 5개 목표 UI 언어의 추가 2개**로 정의한다. 그러나 기존 웹/모바일 UI authored 사전 및 API 실제 수용은 아직 `ko-KR`, `ja-JP`, `zh-TW` 3개뿐이다. 미작성 문자열을 영어·간체로 잘못 주장하지 않도록 **첫 구현 단위에서 후보만 UI에 등록하고 실제 선택·저장·요청은 열지 않았다.**
- `apps/web/ui-i18n.js`의 `PLANNED_UI_LOCALES` 및 `apps/mobile/src/ui/mobile-ui-copy.ts`의 `PLANNED_MOBILE_UI_LOCALES`에 정확히 `en-US`/`zh-CN`을 등록한다. 웹 `createLanguagePicker`에는 비활성 `option.disabled = true`를, 모바일 `MyLocaleSelector`에는 `disabled`/accessibility disabled 상태를 표시한다. 기존 3개 언어 선택, storage key, locale normalize, API `X-MyeongHa-UI-Locale` allowlist, Korean-first fallback은 그대로 보존한다.
- `apps/web/ui-i18n.d.ts`에 비활성 후보 타입을 선언한다. `test/i18n-en-us-zh-cn-ui-stage-gates.test.ts`에서 웹/모바일 목표 목록 동등, 신규 후보에서 실제 normalize·API 헤더가 한국어로 닫히는지, 기존 3개 UI 계약 및 Chat/공식 Reader Source·HOLD·출력 미승인을 회귀 고정한다.
- **후속 실제 구현(로드맵 EN-UI-A/B/C, CN-UI-A/B/C):** 영어·간체의 독립 저자 UI 사전, 웹·모바일 각 화면별 문구·접근성 및 오류·HOLD, API 헤더 허용, 저장·재시작 복원, 혼합 원문/진행 중 전환/재시도 회귀를 묶어 실제 선택을 활성화한다. 비활성 후보 등록만으로 영어·간체 언어가 지원되었다고 보고할 수 없다.
- **기존 승인 경계:** Reader `responseVoiceLocale`, Character speech/delta, 공식 Saju/Face 출력·소급 번역 ②, 결제·판매/중국 본토 운영 등은 **각 Source/Character/Reader/Ops 소유자 승인 전 HOLD**이며 이 작업에서 전혀 활성화하지 않는다.

### 7.13 I18N-07 / EN-UI-B / CN-UI-B 1차 — 영어·간체 공통 UI 저자 사전

- 기존 `apps/web/ui-i18n.js` / `apps/mobile/src/ui/mobile-ui-copy.ts`의 **기본 3언어 런타임과 저장·API 요청 경계는 그대로 둔다**. 웹·모바일에 각각 `apps/web/ui-i18n-planned-copy-v1.js`, `apps/mobile/src/ui/mobile-planned-ui-copy-v1.ts`를 추가해 **81개의 고정 UI 표현**을 `en-US`·`zh-CN` 각각 명시 작성했다. 공통 메뉴·계정·명식 입력·상태·읽기/채팅 조작 등 UI-owned 라벨만 포함한다.
- `lookupPlannedStaticUiCopyV1` / `lookupPlannedMobileStaticUiCopyV1`는 **두 목표 언어의 알려진 고정 문구만 반환하고, 없거나 미지원인 값은 `null`**로 닫힌다. 원문 문자열·개인 대화/공식 해석·Character 고유명·서버 오류·출처를 번역하거나 표기 승인으로 위장하지 않는다. 사전은 active UI에 아직 import하지 않았으며 QA·화면 범위 확인 전 언어 선택을 활성화하지 않는다.
- `test/i18n-en-us-zh-cn-planned-copy-parity.test.ts`는 81개 × 2언어 웹·모바일 동일성, 한글 누출 방지, 알 수 없는 원문 값에서 `null`, UI locale/API 허용값의 기존 3언어 유지 및 임의 Reader 응답 언어 호출 금지를 회귀 확인한다.
- 기존 비활성 영어 선택지에 한국어 `준비 중` 문구가 남아 [Web PR Domain Gates #39885508282](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39885508282)에서 일본어 페이지 브라우저 검증이 실패했다. 웹·모바일 비활성 영어 후보 라벨을 한국어가 없는 `English (not available yet)` / `English · Not available yet`으로 바꾸고 테스트 기준도 갱신했다. **통합 CI만 GREEN이어도 웹 도메인 게이트가 RED면 전체 GREEN으로 간주하지 않는다.**
- **다음 실행:** 사전의 실제 제품 화면별 누락·오역 및 보호 안내·기존 로케일 왕복/리로드 수용을 완료한 후 웹·모바일·API `en-US`/`zh-CN` UI 선택을 동시에 활성화한다. 언어 선택에 따른 Reader/Saju/Face 외국어 생성, 기존 Reading 재번역 ②, Character별 이름/화법·구매 권한/운영 공개는 여전히 원래 소유자 승인 전 HOLD다.

### 7.14 I18N-07 / EN-UI-B / CN-UI-B — Chat·Reader 보안/HOLD 상태 문구 준비

- `apps/mobile/src/ui/mobile-planned-protected-shell-v1.ts`는 기존 모바일 Chat History UI **17개 키**, 입력창 차단 안내 **6개 키**, 과거 Chat·Reading 원문 보존 고지 **2개**, 공식 Reader 소개·진입 차단 안내 **13개 키와 10개 서버 승인 상태 코드**를 `en-US`·`zh-CN` 각각 작성한 **비활성 UI 전용 자산**이다. 기존 `projectMobileChatHistoryShellV1`, `projectMobileChatComposeUiV1`, `projectMobileOfficialReaderEntryUiV1`, `projectMobileSourceLanguageNoticeV1`의 3언어 실제 동작은 그대로다.
- 새 `projectPlannedProtectedUiV1(requestedLocale)`는 **두 신규 목표 로케일에서만** 고정 UI 사전을 검사할 수 있고 다른 값은 `null`로 닫는다. `activeUiLocaleAdmitted=false`, `sourceTextTranslated=false`, `chatMessageTranslated=false`, `chatSendAllowedByLocale=false`, `privacyHoldBypassed=false`, `readerOutputLocalized=false`, `interpretationReleased=false`를 유지하며 사용자/공식 기록/LLM/구매 권한을 인수하지 않는다.
- Reader 접근 상태 키는 기존 `MobileOfficialReadingReaderEntryStatusV1` 전체에 **컴파일 시점 전수 체크**를 적용한다. `test/i18n-en-us-zh-cn-protected-shell-v1.test.ts`는 필수 UI 필드·각 locale의 문구·개인정보 보호 반복 조회/재설치 해제 불가·source 원문 보존·미승인 언어 fallback·출력/권한 비승격을 회귀 고정한다. 실제 클라이언트 사용 경로에는 아직 연결하지 않는다.
- **다음 단계:** EN-UI-B/CN-UI-B 각 화면의 나머지 일반 UI·접근성·공식 아카이브 안내 등 누락 없는 자산 작성과 회귀 후, EN-UI-A/CN-UI-A의 웹/모바일/API 동시 명시 선택·저장·재시작 테스트 및 I18N-07 UI-only 수용. Source/Character/Reader의 새 언어 생성·원래 Official artifact 재언어화/운영 공개는 별도 승인 전 HOLD다.

### 7.15 I18N-07 / EN-UI-B / CN-UI-B — 공식 Reading 기록 재열람 보호 UI 준비

- `apps/mobile/src/ui/mobile-planned-official-archive-shell-v1.ts`에 영어 `en-US`·간체 `zh-CN` 각각 저장된 공식 Reading 기록 재열람 화면의 **11개 고정 안내 문구**, 연결 Reader 수/단수·복수 표시, 기존 **4개 오류 유형**별 저자 문구를 작성했다. `projectPlannedOfficialArchiveUiV1` 및 `projectPlannedArchiveFailureV1`는 미승인 로케일에서 `null`로 닫히고, 알 수 없는 서버/보호 오류는 원문을 노출하지 않고 일반 실패 UI로 수렴한다.
- 이 새 문구는 **실제 앱 화면에 아직 연결하지 않은 후보 자산**이다. 기존 `projectMobileOfficialReadingShellV1`, `officialReadingArchiveFailureCopyV1`의 3개 언어 동작 및 서버 검증된 Official artifact/response hash/source unit·기록 조회 경로는 그대로 보존한다. 독립 Reader grant, 원본 풀이 언어 변경, 과거 기록 번역·재발급을 허가하지 않는다.
- `test/i18n-en-us-zh-cn-planned-archive-shell-v1.test.ts`는 EN/ZH-CN 고정 라벨·Reader 수 표시·오류·원문 불변·HOLD 및 기존 실행 화면 미연결을 확인한다.
- 다음 I18N-07 부분 수용 단계는 화면별 영어·간체 고정 UI 키의 누락 및 접근성/상태 보존 테스트를 완료한 뒤 웹/모바일/API 사용자 명시 선택을 함께 활성화하는 것이다. 생성형 Reader 및 공식 Saju/Face 출력, 저장 공식 풀이 재언어화 정책 ②는 여전히 source/owner 승인 전 HOLD다.

### 7.16 I18N-07 / EN-UI-B·CN-UI-B — Reader 선택기와 사주 프리뷰 상태 문구 준비

- `apps/mobile/src/features/reading/mobile-planned-reader-picker-ui-v1.ts`에 신규 영어·중국어 간체의 **Reader 선택 UI 저자 문구 12개씩**을 작성했다. 현재 Reader 표시·프리뷰 선택(세연만 허용)·Face/Saju 준비 화면·원문 보존 안내·구매 및 공식 Reading 접근 권한 경계를 보존한다. 캐릭터 이름의 별도 현지어 표기가 미승인 상태이므로 새로운 영어/간체 이름을 확정하지 않는다.
- `apps/mobile/src/features/saju/mobile-planned-saju-preview-ui-v1.ts`에는 신규 두 언어의 **사주 프리뷰 UI 표제·진행·4종 근거 부족/불가·4종 오류 분류·보호된 일반 실패를 포함한 21개 항목**을 별도 작성했다. 정상/비정상 `responseState` 및 API 오류는 정확한 기존 코드에만 매핑하고, 알 수 없는 오류 문자열/사적 문장은 일반 UI 실패로 닫는다. 명식 산출값이나 `step.title`/`step.primary`/`step.structure`/`step.supporting`/`notice`를 번역하지 않는다.
- `test/i18n-en-us-zh-cn-planned-reader-picker-saju-ui-v1.test.ts`는 기존 Picker 필드 전수 동등, 신규 두 로케일 문구 한글 잔존 방지, source/권한 분리, 서버 미지원/오류 보호 fallback, 실제 Picker/Saju 코드가 신규 준비 사전을 아직 import하지 않는 점을 검사한다.
- 현재 **지원된 실제 UI 3개(`ko-KR`/`ja-JP`/`zh-TW`)는 변경 없음**, `en-US`/`zh-CN`는 미활성 후보 상태다. UI 준비 자산의 추가 = 해당 언어의 Reader 발화/공식 풀이/구매/릴리스 승인 아님. 다음은 EN/CN-UI-B 각 화면별 저자 문구 완전성 및 접근성 수용을 마친 뒤 EN/CN-UI-A/C 요청·저장·재실행 계약을 활성화하는 것이다.

### 7.17 I18N-07 / EN-UI-C·CN-UI-C — 현행 고정 UI 사전 누락 실측과 수용 게이트

- `scripts/i18n/planned-ui-copy-coverage-v1.mjs`은 **웹의 기존 `COPY`와 모바일의 native-only `MOBILE_UI_NATIVE_COPY` 저자 UI 문자열 키만 읽어** 신규 `PLANNED_STATIC_UI_COPY_V1`과 대조한다. 외부 API·개인 대화/저장 공식 풀이/Reader 출력은 조회하지 않는다. 실행: `node scripts/i18n/planned-ui-copy-coverage-v1.mjs`.
- 2026-10-23 코드 스냅샷 기준 웹 authored 642행 + 모바일 native-only 264행, 중복 제거 **887개 정적 UI 키**이다. 이 중 기존 신규 사전(81행)과 일치한 것은 **80개**, 아직 저자 사전 대응이 확인되지 않은 키는 **807개**다. 이 수치는 로케일별 번역 완성률이 아니며, 여기에는 캐릭터 이름·용어/source 근거·원문 보존 이유로 **의도적으로 번역하지 않아야 하거나 별도 소유자 승인이 필요한 키**도 포함될 수 있다. 개별 키의 번역 대상 여부를 분류하기 전 '807개 전부 번역 필요'로 해석 금지.
- 실행 결과는 `authoredKeys`, `stagedKeysWithinAuthoredCatalog`, `unclassifiedOrUnauthoredKeys`, `readyForRelease:false`를 돌려준다. **숫자를 맞추는 것만으로 locale 지원을 활성화하지 않는다**. 기존 3개 언어가 계속 실제 허용값이며 두 새 언어는 비활성이다.
- `test/i18n-en-us-zh-cn-static-copy-coverage-audit.test.mjs`는 키 중복 제거, malformed input 실패, 실제 사전 분류 누락 노출, 출시 readiness 비승격을 확인한다. 뒤이어 고정 UI 키를 화면/authority owner별로 분류하고 EN/CN 각 locale의 고정 문구·읽기/Chat/Reader 접근성 및 항목별 경계를 수용해야 한다.

## 8. 다음 구현 작업 및 승인 위치

1. **캐릭터 설계 owner:** 위 6명 차이를 실제 Bible/typed Runtime 간에 해결하고 authoritative source/version을 확정. 이 I18N 트랙은 제안·인계만, 원본 수정 금지.
2. **I18N (현재 담당):** #2430/31/32/35 기존 PR Auto-merge 유지. 9인 중립 화법 projection과 Source 인계 계약을 Reader·UX 소비 경계에 **허가된 방식으로** 연결. 이후 `ja-JP`/`zh-TW` 관습 및 소량 예외 후보는 이 트랙이 작성하여 사용자에게 제시, 사용자 승인 전 프로필 실제 값 등록 금지.
3. **Saju / Bridge / DB:** 각 Official 소스 범위/Qualifier/Condition/semanticHash·artifactHash/provenance·정확한 Reader Grant를 기존 scope에서 서버 인수; 기존 12메뉴 A/B/C/D+E를 병렬 유지. 새 해석 문장은 이 I18N 트랙에서 생산하지 않는다.
4. **Reader/Memory/Security:** 지금은 등록된 출처 정보만 기존 guard의 인수 자료로 제공. 후속 실제 장문/요약/채팅의 보호된 자연어 검토는 원래 owner, 새 LLM 호출이나 권한 변경 없이 진행.
5. **Ops/Commerce:** public/paid/source readiness, 캐시·생성 시점, 저장/삭제/환불 권한은 소유자 승인 및 실제 production evidence 전 HOLD.

**정확한 완료 표기:** 이번 PR은 read-only projection + metadata parity boundary + 테스트 + 인계 계약의 구현이다. 캐릭터 개인 바이블 확정, 일본어/번체 Reader 실제 응답, 공식 Reading 재번역/저장, 새 유료 판매/서비스 운영은 완료하지 않았다.

### 7.18 사용자 캐릭터 화법 결정 — 2026-10-23

- **서린·미라:** 이전 typed Runtime에는 기록용 후보가 남아 있지만, 현행 새 Chat/Reader 화법 입력으로 사용하지 않는다. `resolveAdmittedCharacterChatVoiceAuthoringV1`은 두 캐릭터에 `null`, `prepareReaderLanguageNeutralVoiceHandoffV1`은 `character_voice_cleared` HOLD를 반환한다. 캐릭터 ID, 이전 게시 콘텐츠, 저장된 메시지 자체를 삭제하거나 소급 변조하지 않는다.
- **도윤:** 기존 '신속한 결정 코치' Runtime 스타일은 신규 채팅 화법에서 폐기하고 승인된 캐릭터 기획/Bible 의미만 보존한다. 버전·출처를 확인할 수 있는 도윤의 개별 발행 Bible이 없어 현재 voice handoff는 `bible_source_not_available` HOLD. 임의의 새 도윤 대사를 생성하거나 기존 typed runtime을 바이블로 둔갑시키지 않는다.
- **세연·여울·백헌:** 각각 `SEYEON_CHARACTER_BIBLE_DRAFT_V0_2`, `YEOUL_CHARACTER_BIBLE_DRAFT_V0_3`, `BAEKHEON_CHARACTER_BIBLE_DRAFT_V0_2`의 인물·E 표현·관계 진전 경계를 기준으로 `runtime-authoring-v1.ts`의 대화 말투, 심리·질문, 관계 모드를 정렬했다. 캐릭터별 외국어 호칭·인칭을 채우거나 운영 콘텐츠를 자동 교체하지 않는다.
- `READER_VOICE_ALIGNMENT_DIAGNOSTICS_V1`와 보호된 voice composition/최종 output boundary 회귀에서 사용자 선택을 고정했다. **9인 구성 유지**는 9인 전원의 대화 설정 수용을 뜻하지 않는다. 기록용 후보 배열의 과거 항목은 새로운 대화의 승인값이 아니다.
- 세 캐릭터의 실제 운영 발행 버전과 새로운 바이블 정렬 draft의 일치는 별도 콘텐츠 릴리스 검증이 필요하다. 한국어 기존 게시물·원문·권한·현재 지원 3개 UI locale는 변경하지 않는다.

### 7.19 EN/CN-UI-B — 홈·대화·계정·사진 준비 고정 UI 추가 (2026-10-23)

- 기존 웹/모바일 한국어 UI 저자 문구 **40개**를 비활성 영어 `en-US`·간체 `zh-CN` 사전에 추가하고 동일 번역·키 패리티 및 대표 실제 화면 라벨을 테스트한다. 대상은 홈/포춘쿠키·대화/채팅 UI·계정/도움말·사주 명식 단순 제어·관상 사진 준비다.
- 새 영어·간체 언어는 여전히 **사용자 선택/저장/API 사용 불가 상태**로 둔다. 서버 결과·개인 대화/공식 해석·캐릭터 원문·계산 정보, 권한, 실제 AI 생성/판매/공개는 변경하지 않는다.
- 남은 정적 UI 목록의 화면별/소유권 분류, 접근성 및 locale 왕복/새로고침 수용, UI 선택 동시 활성화는 후속 EN/CN-UI-B/C 범위다.

### 7.20 EN/CN-UI-C — 실제 웹 화면 6곳의 정적 문구 소스 대조 (2026-10-23)

- `scripts/i18n/planned-ui-web-screen-review-v1.mjs`으로 홈·채팅 허브·대화방·마이·사주 읽기·기록 **6개 실제 웹 화면 파일**에서 명시적으로 고른 고정 UI 문자열이 존재하고 비활성 영어/간체 사전에 반영되어 있는지를 검증한다. 임의/동적 데이터나 Reader/공식 해석 본문은 읽지 않는다.
- `test/i18n-en-us-zh-cn-web-screen-review.test.mjs`는 소스와 후보 사전의 일치, 누락/중복 감지, **화면 렌더·접근성·전체 화면 검수·릴리스 미완료**를 검증한다. 원문 문자열 포함 여부는 완전한 화면 로컬라이제이션 증거가 아니므로 `readyForRelease=false`/ `pageRouteClassificationComplete=false`를 유지한다.

### 7.21 EN/CN-UI-B — 인증·계정·입력·접근성·보호 상태 UI 추가 (2026-10-23)

- 웹·모바일 `en-US`/`zh-CN` 비활성 사전에 한국어 UI 저자 문자열 **87개**를 추가하여 총 402개의 동일한 키·영어·간체 문구를 맞췄다. 인증/로그인·계정 상태, 출생정보 입력/달력 사용 안내, 채팅 입력·접근성, 얼굴 사진 준비/미지원 표시, 기록/풀이 오류·원문 계산 사실만 표시하는 보호 문구가 대상이다.
- 신규 한국어 원문은 웹 UI `COPY` 또는 모바일 `MOBILE_UI_NATIVE_COPY`에 존재하는 고정 저자 행에서만 선별했다. 캐릭터 이름/발화·고유 칭호, 사주/관상 계산 결과, 개인 대화·서버 오류 원문은 번역하지 않는다. 기존 3개 UI 로케일과 API 헤더 허용 범위 및 EN/ZH-CN 비활성 상태 유지.
- 기존 패리티 테스트에 입력·보호 안내 실례를 추가했다. 모든 화면의 포괄적 접근성/렌더 QA와 EN/CN-UI-A/C 허가 게이트는 여전히 미완료.

### 7.22 EN/CN-UI-C — 웹 화면별 정적 UI 소스-사전 검증 확대 (2026-10-23)

- 기존 웹 화면별 검토 행렬을 로그인/회원가입 화면까지 포함한 **7개 화면**으로 확장하고, 실제 React 컴포넌트에 등장하는 **101개 화면-문구 연결**을 영어·간체 비활성 사전과 대조한다. 같은 키의 다중 화면 사용은 각각 명시 검토한다.
- 검증은 웹 UI 저자가 작성한 *literal 존재성*과 번역 후보의 source-key 일치에 한정한다. 사용자 메시지·서버 공식 풀이·Reader 화법을 변환하지 않고, 렌더링 시나리오·접근성/전체 라우트 정합·새 언어의 실제 출시는 계속 `false` / HOLD다.
- `test/i18n-en-us-zh-cn-web-screen-review.test.mjs`에서 7개 화면·101개 검토 연결과 source/staged 누락 실패를 고정한다.

### 7.23 EN/CN-UI-C — 실제 모바일 6개 화면 고정 저자 문자열 검증 (2026-10-23)

- `scripts/i18n/planned-ui-mobile-screen-review-v1.mjs`에서 마이·사주·관상·기록·채팅 허브·출생정보 등록의 **6개 실제 TSX 화면**을 검토하고, **37개 화면별 고정 문자열**을 EN/CN 예정 사전의 source 키와 명시 연결했다. 모바일 사전과 웹 사전의 키/번역 parity를 독립 테스트로 유지한다.
- `test/i18n-en-us-zh-cn-mobile-screen-review.test.ts`는 화면/키 누락·중복·사전 parity 및 `readyForRelease=false` 경계를 검증한다. 화면 파일에 정적 문자열이 존재한다는 사실은 **실제 EN/CN 렌더/접근성·전 화면 완료·고객 공개 승인**이 아니다.
- 개인 메시지, 공식 Reading, 원시 계산·캐릭터 의미·구매/Grant를 읽거나 변경하지 않는다. EN/CN 실제 선택·API 헤더 허용과 화면별 런타임 검증은 아직 미완료.

### 7.24 EN/CN-UI-B — 서비스 안내·보호 문구 및 화면 설명 62개 확장 (2026-10-23)

- 기존 웹/모바일 고정 UI source catalog에서 명시 선별한 62개 한국어 저자 문구를 영어 `en-US` 및 간체 `zh-CN` 각각 작성하고 **웹·모바일 동일 464개 사전 키/번역**을 맞췄다. 범위는 홈·온보딩·계정·대화 탐색, 저장 기록·개인정보 안내, 사주 프리뷰 제공 범위·공식 기록 비저장 주의, 관상 브라우저 사진 미리보기·분석 미연결 고지이다.
- 사주·관상 결과 원문, 사용자 개인 대화, 캐릭터 이름/발화, server-owned error/code, Birth factual source와 결제/권한은 수정하지 않는다. 두 신규 UI 언어는 **준비용 사전일 뿐 실제 선택/API 출력 언어로 활성화하지 않는다**.
- `test/i18n-en-us-zh-cn-planned-copy-parity.test.ts`는 원문 보호 고지 대표 5개를 정확한 EN/CN 쌍으로 검증한다. 미완료 UI source 검토, 화면 렌더/접근성, 언어 전환/저장/헤더 계약은 EN/CN-UI-A/C 후속 단계다.

### 7.25 EN/CN-UI-C — 실제 웹 보호 안내·프리뷰 문구 24개 수용 출처 추가 (2026-10-23)

- `planned-ui-web-screen-review-v1.mjs`의 기존 홈·채팅 탐색·마이·사주 읽기·기록 5개 화면에 직접 확인된 **24개 고정 UI 문구**를 추가하여 7개 웹 화면의 선택 검토 연결을 **101개에서 125개**로 확대한다. 모두 실제 JSX 컴포넌트의 원문이며 영어/간체 비활성 UI 사전에 등록되어 있다.
- 비공식 사주 프리뷰의 제한 안내, 관상 사진 분석 미연결 상태, 계정·기록 개인정보 경계 등 위험도가 높은 UI 고지를 포함한다. 원문 계산/저장 Reading/캐릭터 화법은 건드리지 않는다. JSX 렌더·접근성·전체 화면 완성·새 언어 출시 상태는 계속 미검증/HOLD.

### 7.26 EN/CN-UI-C — 모바일 화면 원문 검토 27개 추가 (2026-10-23)

- 기존 6개 모바일 TSX 소스의 고정 UI 문자열 27개(마이·사주·관상·대화·출생정보)를 영어/간체 비활성 후보 사전과 대조하여 실제 화면 검토 연결을 **37개에서 64개**로 확대했다. 검증된 중복 없이 각 라우트의 직접 저자 문구만 등록한다.
- 이는 source literal/번역 후보 존재 증거이지 전체 렌더·접근성·언어 선택/저장·공식 Saju/Face/Reader 응답 공개 승인이 아니다. `readyForRelease=false` 및 관련 출력·개인정보·계정/권한 보호 상태는 그대로 둔다.
 
### 7.27 EN/CN-UI-C — 개발 환경의 실제 React 화면 미리보기 2곳 (2026-10-23)

- `apps/web/src/home/HomePage.tsx`와 `apps/web/src/chat-hub/ChatHubPage.tsx`에 **개발용 미리보기 입력**을 연결하고, 검토한 정적 UI 저자 라벨만 `lookupPlannedStaticUiCopyV1` 기반 영어·간체로 렌더한다. Home과 Chat Hub의 구체적인 헤더·버튼·보호 안내·접근성 라벨을 포함하며, 동적 대화/저장 기록·Reader 답변·생년월일·캐릭터 이름 및 출처를 번역하지 않는다.
- 개발 서버에서만 `?ui-preview=en-US` 또는 `?ui-preview=zh-CN`을 명시한 경우 JSX preview props를 전달한다. 비개발 빌드에서는 항상 `null`이며 기존 한국어/일본어/번체 선택기, 로케일 저장/복원, API `X-MyeongHa-UI-Locale`, 공식 해석/Reader voice 허용 범위는 변경하지 않는다. 미번역 영역(예: 포춘쿠키 원문·동적 월 표기)은 그대로 남아 있어 **서비스에서 영어·간체를 지원한다고 표시하지 않는다**.
- `apps/web/src/ui/planned-ui-screen-preview-v1.test.tsx`는 두 실제 React 화면의 SSR 출력, 한국어 기본, 영어·간체 문구, 탐색 및 데이터 대상 DOM 보존, 개발 환경에만 허용되는 명시적 QA query를 검증한다. 이 작업은 **부분 화면 QA**이며 전 라우트 번역, 스크린샷/접근성 실제 브라우저 및 새 언어 운영 출시 승인은 EN/CN-UI-A/C의 미완료 항목이다.

### 7.28 EN/CN-UI-C — 기록 화면 개발용 영어·간체 미리보기 (2026-10-23)

- `RecordsPage`의 기록 내비게이션·상태·개인정보 고지와 접근성 속성을 개발 환경의 명시적 `ui-preview` query에서만 영어/간체 JSX로 렌더한다. 운영 UI/헤더/저장/Reader locale 허용은 변경하지 않는다.
- SSR 회귀는 기존 기록 렌더 socket ID와 탐색 경로, 한국어 기본 출력의 보존을 확인한다. 사람별 개인 기록/공식 Reading은 변경하거나 번역하지 않는다. 일부 출처 승인 미완료 문자열은 한국어 그대로 남고 릴리스 허가는 HOLD다.

### 7.29 EN/CN-UI-C — 사주 화면 영어·간체 개발 전용 미리보기 (2026-10-23)

- `ReadingPage`의 40개 고정 한국어 UI 저자 문구와 7개 aria 라벨, 사주 주제의 기존 정적 제목·설명에 비활성 EN/CN 사전 조회를 적용한다. 실제 사주 계산값·출생정보 저장·공식 해석·Reader 응답·캐릭터 발화는 변환하지 않는다.
- `reading/main.tsx`는 `import.meta.env.DEV` 및 단일 `ui-preview` 요청에서만 JSX 미리보기를 허용한다. 기존 지원 3개 UI 언어, 저장/복원/API 헤더 계약, 출시 금지 게이트는 그대로 유지한다.
- SSR 회귀에 한국어/영어/간체 고정 UI, 계산 결과 삽입 DOM 소켓, 폼 입력값 및 링크 불변 조건을 추가한다. 실제 브라우저·접근성·모든 화면 검증은 별도 미완료.

### 7.30 EN/CN-UI-C — 모바일 사주 개발용 라벨 미리보기 (2026-10-23)

- 모바일 `(tabs)/reading/index.tsx`에서 Expo 개발 모드와 단일 `uiPreview` 파라미터가 일치할 때에만 기존 비활성 영어·간체 사전의 **6개 정적 안내/상태/버튼 UI 라벨**을 사용한다. 운영에서는 이전 `useMobileUiLocale().t`와 `MobileUiText`가 지원하던 3개 로케일을 유지한다. 미등록 문구는 기존 활성 로케일 번역으로 유지하며 조작/권한/출처를 새로 만들지 않는다.
- 새 순수 함수 `mobile-planned-ui-screen-preview-v1.ts` 및 `test/i18n-en-us-zh-cn-mobile-preview-route.test.ts`가 개발-only 게이트, 사전/fallback, 읽기 계산·라우팅 코드의 불변성을 검증한다. 실제 Android/iOS 앱 스크린샷·접근성·새 언어의 공개 승인은 포함하지 않는다.

### 7.31 EN/CN-UI-C — 모바일 관상 사진 준비·캐릭터 탐색 개발용 미리보기 (2026-10-23)

- 기존 `mobile-planned-ui-screen-preview-v1.ts`의 Expo 개발 전용 단일 `uiPreview` 파라미터를 `(tabs)/reading/face.tsx`와 `(tabs)/chat/index.tsx`에도 연결했다. 인증·사용 권한·출력 헤더·지원 3개 로케일은 변경하지 않고, 화면에 실제 작성된 일반 정적 UI 제목·버튼·접근성 문구만 staged 영어/간체 사전으로 렌더한다.
- 관상 사진의 실제 URI·메타데이터·권한 요청·카메라/앨범 기능·에러 원문과 캐릭터 ID/이름·사용자 대화/접근 상태·공식 Reading 원문은 번역하거나 변조하지 않는다. 아직 번역이 미확정인 관상 안내 문장은 기존 한국어/활성 UI 언어 표현이 남는다.
- `test/i18n-en-us-zh-cn-mobile-preview-route.test.ts`에 두 실제 Expo 화면의 개발 전용 gate, 원문/상태·권한 처리 불변과 웹·모바일 사전과 동일한 선택 고정 UI의 영어/간체 출력 확인을 추가했다. 실제 iOS/Android 레이아웃·접근성·로케일 전환·출시는 여전히 미완료다.

### 7.32 EN/CN-UI-B — 마이·회원 인증 안내 원문 기반 사전 확장 (2026-10-24)

- 실제 모바일 화면 및 MyEditorialWelcome/MyMemberAuthCard에 작성된 고정 한국어 UI 안내 **8개**의 영어/간체 카피를 웹·모바일 비활성 사전에 동일하게 추가해 **472개** staged 항목으로 맞췄다. 특히 신규 가입 시 게스트 주체 승격과 기존 회원 계정과의 기록 병합 미지원, 이메일 확인 뒤 앱 복귀를 명확히 설명한다.
- 서버 인증·계정 주체·실제 이메일/비밀번호·개인 기록·검증 메시지·출생정보/공식 Reading 데이터는 변환하지 않으며 신규 언어 운영 선택·저장/API 헤더를 활성화하지 않는다.
- `test/i18n-en-us-zh-cn-planned-copy-parity.test.ts`에 8개 정확한 2언어 쌍과 언어 게이트를 검증한다. 실제 화면 적용·접근성·출시 검증은 후속 단위다.

### 7.33 EN/CN-UI-C — 모바일 마이·계정 인증 개발용 미리보기 (2026-10-24)

- `(tabs)/my/index.tsx`에 `__DEV__` + 단일 `uiPreview` 게이트를 연결하고, 실제 고정 제목·설명·정보 로딩·계정 상태를 영어/간체 후보 사전으로 렌더한다. `MyEditorialWelcome`과 `MyMemberAuthCard`에도 선택적 previewLocale prop을 추가하여 로그인·소셜 버튼·계정 관리 안내·이메일/비밀번호 입력 라벨 등 **정적 저자 UI만** 개발 환경에서 미리볼 수 있다. 기존 `t`와 `MobileUiText`의 한국어/일본어/번체 처리는 fallback으로 보존한다.
- 회원/게스트 판별, 계정 주체 전환·기록 병합 제약, 실제 이메일·비밀번호·서버 오류·회원 인증 상태·소셜 공급자 및 모든 클릭/입력 핸들러는 번역·변경하지 않는다. 기존 언어 선택과 저장, API 헤더, 사주/관상·Reader 원문/권한은 불변이다. 미등록 고정 UI와 실제 프로필/출생 기록은 기존 활성 언어 그대로 남는다.
- 테스트에 Expo 개발 전용 게이트·원문 메시지/인증 값 보호·정적 사전·기존 로케일 fallback을 확인하며 실기기/전체 접근성/새 언어 운영 출시 게이트는 계속 HOLD다.

### 7.34 EN/CN-UI-B — 출생정보·기록 화면 고정 원문 5건 확장 (2026-10-24)

- 기존 웹/모바일 한국어 저자 UI 원문 사전에서 근거가 확인된 출생정보 등록 설명, 기록 화면 제목/시각적 소제목, ‘기억’ 탭 등 5개 고정 문구를 영어/중국어 간체 후보 사전에 동기 반영하여 **477개** staged 항목으로 맞췄다.
- 사용자 출생 데이터·명식 계산 결과·서버 기록/기억 본문은 번역 대상이 아니며, 실제 운영 언어 선택·저장·API 헤더 및 공식 Reading/Reader 음성 출시는 여전히 비활성이다.

### 7.35 EN/CN-UI-C — 모바일 출생정보·기록 개발용 화면 미리보기 (2026-10-24)

- `app/birth/index.tsx`와 `(tabs)/records/index.tsx`에서 Expo `__DEV__` + 단일 `uiPreview` 통과 시에만 영어·간체 후보 UI를 렌더한다. 출생정보 고정 입력·윤달·성별·액션 라벨 및 기록 화면 제목·로딩 안내와 `RecordsEditorialHeader`의 고정 문구만 대상이며, 누락 문구는 활성 3개 로케일의 기존 번역으로 fallback한다.
- 사용자 입력 날짜·시각·윤달·성별 값, 서버 Birth 요청/검증, 기록 본문·공식 풀이·개인 기억·서버 error, 기록 탭·페이지네이션/조회는 수정하지 않는다. 신규 두 UI 언어의 운영 선택/저장/헤더 공개는 비활성 상태 유지.
- `test/i18n-en-us-zh-cn-mobile-preview-route.test.ts`에 실제 Expo UI 경계와 변경하지 않은 Birth 저장·Records 로더/식별자 계약 및 staged 사전 출력을 추가했다. 실기기 브라우저/앱 접근성·전 라우트 번역/릴리스 확인은 아직 미완료.

### 7.36 EN/CN-UI-C — 모바일 출생 달력·시간 하위 모달 개발 미리보기 (2026-10-24)

- 모바일 BirthInputScreen에서 기존 개발 전용 `previewLocale`를 `BirthDateCalendar`와 `BirthTime12HourField`에 선택적 prop으로 전달하여 이미 출처 확인한 달력/시간 모달 제목·버튼·접근성 라벨·고정 안내만 영어/간체 후보 사전으로 표시한다. 기본 prop은 `null`, 기존 활성 3개 UI 로케일의 `t` fallback을 보존한다.
- 실제 생년월일·음력 유효일·연월일 선택·출생시각·초/분 입력값·저장/검증·계정 정보는 번역/변경하지 않는다. 날짜 포맷·단위 및 사전에 아직 없는 안내는 기존 활성 로케일로 남아 **개발용 일부 화면 검토**이지 출시 가능한 전면 국제화가 아니다.
- 원문 검사 회귀에 모달 개발 전용 prop 전파, 번역된 접근성 라벨, 날짜/시간 입력 핸들러/기본 로케일 계약 불변을 추가했다.

### 7.37 EN/CN-UI-C — 모바일 기록 하위 UI 개발용 미리보기 (2026-10-24)

- 기록 `RecordsScreen`이 `previewLocale`를 기록 탭/빈 목록/일부 실패/더 불러오기, 저장 풀이 다시 읽기 버튼, 기억 카드의 일반 고정 라벨로 전달한다. `RecordsEditorialHeader`의 정적 탭명 역시 영어/간체 후보 사전으로 표시한다. 기본 `null` prop과 기존 3개 언어 번역 `t` fallback을 유지한다.
- 실제 LifeFact/Memory/Reading item의 개인 내용·표제·Reader 이름·계약 상태는 기존 계약대로 노출하고, 저장/철회·페이지네이션·권한 및 archive openability 로직을 변경하지 않는다. 미번역 서버 상태·시간 정보와 계수 표현은 기존 언어 그대로이며 출시 가능한 완전 번역으로 승격하지 않는다.
- 기존 records 소스 회귀와 EN/CN 개발 미리보기 검증은 추가 prop 전파와 원문 보호를 확인하며 접근성·실기기·서비스 언어 선택은 여전히 HOLD다.
