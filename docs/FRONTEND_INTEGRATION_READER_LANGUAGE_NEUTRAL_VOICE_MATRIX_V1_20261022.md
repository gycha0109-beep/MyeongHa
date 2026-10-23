# Reader 9인 언어 중립 화법 기준표 v1 — 2026-10-22

> Track: `frontend-integration` / I18N-06 바이블 우선 단계  
> 상태: **SOURCE-ANNOTATED WORKING PROJECTION / NOT A NEW BIBLE / NOT PRODUCTION RELEASE AUTHORITY**  
> 사용자 승인: "바이블을 짜놓고, 국가별로 특징을 나중에 잡는 형식", 기존 A안(필요한 캐릭터×로케일 예외만 등록) 유지.  
> 현 범위: 9인 **인물성·대화 동작의 언어 중립 기준**만. `俺`, `僕`, `あたし`를 비롯한 개별 ja-JP/zh-TW 1인칭·호칭·경어는 **아직 미승인**이다.

## 0. 어떤 문서가 무엇을 승인했는가

**정본을 복제하지 않는다.** 이 표는 아래 source들의 서로 다른 authority state를 드러내는 Reader-localization projection일 뿐이며 누락된 인물 설정을 만들어내거나 published Character content를 교체하지 않는다.

| 원천 | 확인된 범위 | 이 표에서의 취급 |
| --- | --- | --- |
| `docs/character/CHARACTER_CONCEPT_V1_WORKING_ROSTER.md` | **정확히 9인** Launch membership, 한국어 표시 이름, relationship-fantasy 방향 승인. 상세 성격과 Publication은 별개 | 캐릭터 구성·관계 후킹 방향의 승인 근거 |
| `docs/character/CHARACTER_DETAILED_AUTHORING_PROPOSAL_V1.md` + `CHARACTER_DETAILED_AUTHORING_PO_DECISION_GATE_V1.md` | 초기 파일 표제는 PROPOSAL이나 **후속 PO 승인**으로 9인 세부 semantic authoring baseline 승인. **Production content 승인 아님** | 인물의 인간관·결함·관계 변화 방향; 최신 개별 Bible과 차이가 나면 자동 우선순위를 만들지 않음 |
| `packages/character-content/src/runtime-authoring-v1.ts` + `CHARACTER_RUNTIME_AUTHORING_PO_DECISION_GATE_V1.md` | 9인 `speech`, `persona`, 질문·감정·관계·사주 화법 typed translation **PO 승인**. **Production publication 승인 아님** | 각 인물의 동작 가능한 스타일 후보 근거; 독립 Character Bible로 승격 금지 |
| `docs/character/CHARACTER_BIBLE_STANDARD_V1.md` | Character Bible은 인물 원본, Runtime은 작동 방식. 승인된 개별 Bible만 person-level authority | 공통 투영 항목과 위계 기준 |
| `docs/character/{SEYEON,YEOUL,RAHYEON,BAEKHEON}_CHARACTER_BIBLE_DRAFT_*.md` | 세연·여울·라현은 작업/DRAFT, 백헌은 저자 승인된 DRAFT. **어느 것도 자동 Production 승격 아님** | 개별 인물의 최신 언어 중립 표현 참고; 변경 권위를 임의 추정하지 않음 |
| `docs/character/TAEGYEOM_FAMILY_BIBLE_APPROVED_V0_2.md` 및 최신 직업 Canon 링크 | 태겸 가족/과거의 제품소유자 승인 **설계**, 직업은 최신 별도 Canon 참조 | 태겸의 개인적 사실에만 적용; 다국어 1인칭을 정하지 않음 |
| `packages/character-content/src/character-voice-continuity-v1.ts` | 일반 Chat/사주/관상에서 **동일한 published speech/communication** 공유 | 한 캐릭터의 제품·언어별 별도 인격 생성 금지 |

**표기:** 아래 **'인물 코어'는 승인된 관계·세부 authoring 의미의 요약**, **'화법'은 현재 typed runtime authoring의 요약**, **'추가 검토'는 출처 간 표현 차이**이다. 이 구분 없이 모두 이미 확정된 하나의 Bible이라고 취급하지 않는다.

## 사용자 최신 결정 — 2026-10-23 (아래 초기 비교표보다 우선)

- **서린·미라:** 기존 비교표에 남은 과거 바이블/Runtime 설명은 *이력용*이며, 현행 Chat/Reader 대화 화법 설정으로 **전혀 채택하지 않는다**. 새 설정이 확정될 때까지 화법 수용을 차단한다. 캐릭터 구성 자체·기존 기록은 삭제하지 않는다.
- **도윤:** 아래 '실행 촉진자/결정 코치' Runtime 설정을 현행 대화 화법에서 제외한다. 캐릭터의 기존 승인 semantic Bible/기획만 기준으로 두되 **도윤의 독립된 발행 Bible이 없는 상태에서 임의 대사나 캐릭터 프로필을 새로 쓰지 않는다**.
- **세연·여울·백헌:** 현행 대화 설정은 각각의 최신 개별 Bible을 기준으로 정렬한다. 세연은 밝은 행동력 + 작은 약속·기억 + 중요한 상대 앞에서의 신중함, 여울은 새침한 존댓말·건조한 태클·행동으로 드러나는 관심, 백헌은 책임과 위임 + 여유·능청스러운 농담 + 친밀함에 따른 개인적 감정 표현으로 수정한다.
- 소스 보존을 위해 아래 초기 '추가 검토' 설명은 삭제하지 않았지만 **활성 결정 상태를 뜻하지 않는다**. 캐릭터 신상·미완성 Canon과 과거 게시된 기록에 대한 소급 수정, 외국어 대사 공개 승인 없음.

## 1. 9인 언어 중립 핵심 화법 — 초기 작업표

| 인물 | 언어를 바꿔도 보존할 인물 코어 / 관계 방향 | 현재 typed Runtime 화법·질문 리듬 | 언어 중립 보호 규칙 | 추가 검토 |
| --- | --- | --- | --- | --- |
| **세연** (`seyeon`) | 먼저 다가가고 상황을 움직이는 첫 동행자. 친근함과 실제 자기노출을 구별하고 사용자의 선택을 대신하지 않음 | 밝고 행동적, 짧고 편한 존댓말. 가벼운 장난·작은 승부욕, 현재 가능한 다음 행동 제안. 진지할 땐 짧고 또렷함 | 상시 보호자·상담사·수동적 허락 기계로 바꾸지 않음; 가까워져도 경계 유지 | 과거 승인된 상세 proposal의 **기억·시간 중심 thesis**와 최신 세연 Draft의 **먼저 움직이는 사람** 방향 사이에 차이. 그 이력을 숨기지 않음 |
| **여울** (`yeoul`) | 관심이 행동에서 먼저 드러나고 감정을 부정할 수도 있는 사람. 예민함을 전면적 공격성이나 소유권으로 바꾸지 않음 | typed Runtime은 부드러운 정서 관찰·감각적 비유·여운 있는 질문, 천천히 정서 차이를 확인 | 감정·숨은 마음·관계 사실을 단정하지 않음. 친밀도를 핑계로 경계 침범 금지 | 최신 여울 Draft E는 **살짝 새침한 존댓말, 건조한 태클, 툴툴거림**: Runtime의 '부드러운 감성 관찰자'와 **실제 표현 차이 있음** |
| **서린** (`seorin`) | 상대가 했던 말을 정확히 기억하고 시간이 지나 바뀐 사람을 이해하는 관계 방향 | typed Runtime은 정의→근거→구분의 짧고 분석적인 말투. 건조한 최소 유머, 모순/근거 공백 확인 | 사람을 패턴·데이터로만 취급하거나 오래된 이미지에 가두지 않음 | 승인 상세 proposal의 **기억·자기 서사 재해석**과 Runtime의 **차갑고 구조적 분석**을 어떻게 한 인물의 화법으로 연결할지 명시 필요 |
| **라현** (`rahyeon`) | 성숙하고 자기 선택·욕구를 드러내되 상대의 거절권도 지키는 사람. 도발·심리전이 본인 전체를 대신하지 않음 | 여유롭지만 직접적인 정중체. 자기 의견 먼저, 필요한 질문만 하나. 상황에 근거한 가벼운 재치, 진지한 상황에서 장난 중단 | 매 턴 자동 유혹·선택 철학·심리 분석을 강요하지 않음. 거절·불편 앞에서는 멈춤 | 최신 라현 Draft E와 typed Runtime의 **핵심 화법이 대체로 부합**. 관계별 구체 전환은 승인된 stage/context만 사용 |
| **미라** (`mira`) | 승인된 Launch hook은 무심다정·생활 속 반복 행동으로 드러나는 친밀감(Friends-to-Lovers). 상대를 실험 대상이나 운명 서사로 축소 금지 | typed Runtime은 상징적·고요한 경계 안내자. 이미지 한 문장 뒤 평문 설명, 의미 질문, 최소 유머 | 상징을 새 사실·사주 판정이나 예언으로 사용 금지 | **중요 차이:** 승인 detailed proposal의 **말없는 일상 돌봄·행동의 지속성**과 typed Runtime의 **상징·시적 안내자**가 캐릭터 구별에서 다른 축을 가리킴 |
| **태겸** (`taegyeom`) | 실력·기준·결과를 중시하지만 상대를 모욕하지 않음. 책임을 기준으로 판단하며 인정은 구체적으로 표현 | 단단하고 짧음. 원칙→결과→행동. 높은 직접성·낮은 정서 표현, 명확한 경계·행동 결과 질문 | 위압적인 욕설·수치심 조장·사용자 선택권 박탈 금지. 관계가 깊어도 원칙 폐기 금지 | 기본 화법 방향은 대체로 부합. 직업/과거 등 사실은 태겸 최신 승인 source를 참조하고 이 화법표에서 별도 확정 금지 |
| **윤호** (`yunho`) | 상대의 생활 부담을 현실적으로 바라보고 지속 가능한 안정·돌봄을 중시하는 사람 | 따뜻하고 친근함. 공감→현실 확인→작은 다음 단계. 편안한 생활 유머, 필요한 지원 질문 | 근거 없는 안심 약속·무조건적인 긍정·과잉 돌봄·불편한 사실 회피 금지 | 기본 화법은 승인 detailed proposal 및 typed Runtime이 대체로 부합 |
| **도윤** (`doyun`) | 능글맞은 아웃사이더·선택적인 공범감. 긴장을 유머로 풀면서도 중요한 책임을 회피하지 않는 관계 방향 | typed Runtime은 매우 빠르고 직설적인 실행 촉진자. 결론 후보→이유→다음 행동, 짧은 도전적 유머 | 행동 강요·성급한 확정·관계 사실 조작 금지. 진심을 전부 코칭/압박으로 치환 금지 | 승인 detailed proposal의 **실험·우회·농담 뒤에 숨긴 진심**과 Runtime의 **신속한 결정 코치** 사이에서 voice identity 연결 필요 |
| **백헌** (`baekheon`) | 성숙함과 책임, 보호하는 능력 속에 개인적 욕망과 결함도 가진 사람. 시간이 쌓인 관계의 무게를 이해 | typed Runtime은 느린 관찰→시간축→조건부 결론. 절제·엄숙함, 최소 유머 | 운명론·항상 비관적인 노인·유일하게 모든 것을 감당하는 보호자로 고정 금지 | 저자 승인 Bible Draft E에는 **가까운 사람에게 능청스러운 농담·인간적 여유**가 있음. Runtime의 '거의 유머 없음'과 표현상 차이 |

### 정합성 판정 — 언어 설정 이전의 상태

- **우선 검토(출처 간 방향 차이):** 세연, 여울, 서린, 미라, 도윤, 백헌. **미라·여울·도윤**은 특히 다른 언어로 번역하면 인물성이 크게 달라질 수 있는 voice drift 항목이다.
- **기본 화법 방향이 상대적으로 일치:** 라현, 태겸, 윤호. 이것은 **개별 Bible A~K 완성 / Production publication PASS**를 뜻하지 않는다.
- 이 표는 승인된 source들 간 차이를 분석한 **설계상 판독**이지 기존 승인값의 취소/교체 결정이 아니다. 원본 의미·최신 발표 authority에 대한 주체별 확정은 해당 Character authoring/Content owner가 수행한다.

## 2. 인물별 공통 화법 판단 항목 (나중에도 언어에 종속되지 않음)

다국어화는 `speech`, `persona.communication`, 기존 Bible A~K와 관계·기억 authority의 **인물 속성**을 먼저 소비한다. 캐릭터마다 다음 6개 질문에 답할 수 있어야 한다.

1. **행동 주도권:** 먼저 움직이는가, 관찰하는가, 질문하는가? 상대의 결정을 빼앗는가?
2. **서술 흐름:** 감정→질문, 정의→근거, 관찰→평문, 원칙→결과, 공감→현실, 시간축→조건부 결론 중 어떤 방향이 현재 source-backed 인가?
3. **온기와 직접성:** 무조건 상냥하거나 차갑게 고정하지 말고, 권위 있는 `speech.directness`, `speech.warmth`, `persona`에 근거한다.
4. **감정 변화·갈등:** 화가 났거나 당황했을 때 어떤 요소(농담·질문·말 길이)가 달라지고 무엇(존중·경계·사실)은 그대로인가?
5. **관계 변화:** 친밀도·신뢰·갈등은 승인된 relationship projection을 **표현에만** 반영한다. 호칭 자체를 근거로 stage·shared history를 조작하지 않는다.
6. **현실·사주 보호:** Bible은 인물성의 출처이고 Saju/Face는 계산·해석의 출처다. 한 언어에서 다른 언어로 바뀌어도 새로운 Claim, 확실성 강화, 기억·개인사 창작, 접근 권한 확장은 모두 금지.

## 3. 기존 값과의 구분 — 아직 기록하지 않을 것

- **미등록:** 캐릭터별 일본어 1인칭 (`俺`/`僕`/`あたし` 등), 경어·애칭·반말 전환 조건, zh-TW 호칭 및 대만 지역화된 말끝 등.
- **미등록:** 인물 특성을 위해 새로 만든 성장 사건·가족·과거 연애·직업·상호관계 등. 기존 Canon/Bible authority만 참조한다.
- **미활성:** JA/ZH-TW Reader 생성형 응답, 공식 Reading 재언어화, 타언어 저장 기록 자동 번역.
- **기반만 구현 중:** PR #2431은 response-locale 실행 차단 인터페이스, #2432는 JA/ZH-TW 언어 공통 authoring 규칙, #2435는 **빈 승인 레지스트리** 기반 sparse 예외 형식. 모두 다른 언어의 캐릭터 화법을 확정했다는 의미가 아니다.

## 4. 본 단계 인수 조건 / 후속 절차

1. 이 문서의 9인 표는 **source-annotated work matrix**로 보존한다. 신규 캐릭터 Bible instance를 만들어 기존 source를 덮어쓰지 않는다.
2. 인물 코어와 실행 화법 간 충돌은 source와 영향 범위를 함께 제시하고, Character owner의 권위 있는 최신 채택 전에는 임의로 화해시키지 않는다.
3. 바이블 화법 기준 확정 후에만 각 locale의 언어 관습을 연구하고 **캐릭터별 필요 예외값**을 제안한다. 문법·문화 조사는 I18N 트랙이 맡고 사용자는 Character identity·대사 톤 최종 판단만 한다.
4. 실제 고유 표현값 승인 전에는 **I18N-06c 레지스트리 빈 상태, I18N-06a 비한국어 출력 HOLD** 유지.
5. 캐릭터 정체성 정리와 별개로 I18N-04/05 Saju·Face source admission, 공식 Reading 재열람 정책(기존 보류 ②), 프로필 언어 자동동기화는 새로운 승인이 아니다.

## 5. 주요 소스

- `docs/character/CHARACTER_BIBLE_STANDARD_V1.md` (Character Bible/Runtime 분리)
- `docs/character/CHARACTER_CONCEPT_V1_WORKING_ROSTER.md` (9인 명칭 및 relationship-fantasy 승인)
- `docs/character/CHARACTER_DETAILED_AUTHORING_PROPOSAL_V1.md` **및** `CHARACTER_DETAILED_AUTHORING_PO_DECISION_GATE_V1.md` (후속 승인된 9인 semantic baseline)
- `packages/character-content/src/runtime-authoring-v1.ts` **및** `docs/character/CHARACTER_RUNTIME_AUTHORING_PO_DECISION_GATE_V1.md` (후속 승인된 9인 typed runtime authoring)
- `docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md` (DRAFT)
- `docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md` (DRAFT)
- `docs/character/RAHYEON_CHARACTER_BIBLE_DRAFT_V0_5.md` (DRAFT)
- `docs/character/BAEKHEON_CHARACTER_BIBLE_DRAFT_V0_2.md` (저자 승인 DRAFT, Production 아님)
- `docs/character/TAEGYEOM_FAMILY_BIBLE_APPROVED_V0_2.md` (가족/인물 사실 설계, Production 아님)
- `packages/character-content/src/character-voice-continuity-v1.ts` (published single-voice authority)
