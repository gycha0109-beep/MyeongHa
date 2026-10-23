# Reader 다국어 공통 바이블 기준선 v1 — 2026-10-22

> Track: `frontend-integration` / I18N-06
>
> 상태: **작업 순서 승인 / 언어 중립 기준선 설계**. 실제 캐릭터별 일본어·대만 번체 표현값 및 외국어 출력 승인이 아니다.
>
> 사용자 결정: **"일단 바이블을 짜놓고, 국가별로 특징을 나중에 잡는 형식"**. 앞선 A안(필요한 예외만 등록) 승인을 유지한다.
>
> 정본 중복 금지: 새 캐릭터 정본을 만드는 문서가 아니다. 기존 `docs/character/CHARACTER_BIBLE_STANDARD_V1.md`와 승인된 개별 Character Bible / published Character content에서 **국가·언어와 독립적인 Reader 화법 기준**을 추출할 때 사용할 projection 형식이다. Draft, hypothesis, author-undefined, not-production 자료를 승인된 Canon으로 승격하지 않는다.

## 1. 먼저 확정할 대상 — 언어 중립 인물성

캐릭터마다 하나의 원본 성격·화법만 유지하고, 다음 항목을 **기존 권위 자료에서 참조**한다.

| 기준 항목 | 원래 소유자/출처 | 언어 불변 조건 |
|---|---|---|
| canonical `characterId` 및 `contentVersion` | 게시된 Character Content / release | 어느 언어에서도 동일한 인물/동일한 버전으로 연결 |
| 인물의 정체성·가치·욕망·결함·선택 방식 | 개별 승인 Character Bible의 A/B/C 및 publisher | 번역으로 다른 인물이나 다른 동기를 만들어내지 않음 |
| 기본 화법 및 리듬 | Bible E, published `speech`, `persona.communication` | 직설성·온기·유머·비유·길이·질문 방식 등 근본적 성향 보존 |
| 상황별 행동·감정·갈등·관계 변화 | Bible F/G/H 및 `persona`의 questioning/emotion/conflict/intimacy | 경어·호칭이 달라도 실제 관계 단계·행동 선택·경계는 불변 |
| 사실·비공개·안전·출처 | 별도 World / Memory / Relationship / Source·Product authority | 다국어 표현이 사실, 기억, 접근 권한, 사주·관상 주장 생성 불가 |
| 발행/승인 상태 | 기존 캐릭터 출처별 authority 및 content release | Draft·설계 승인·Production 공개 승인을 혼동하지 않음 |

**작성 규칙**: 실제 값을 미리 지어내지 않고 각각 `sourcePath`, `sourceVersion`, `authorityState`, `contentVersion`, `fieldRef`를 연결한다. 외국어 렌더러는 동일 출처에 연결되어야 하며 `general_chat`, `saju_product`, `face_product`에 별도 인격을 만들 수 없다. `packages/character-content/src/character-voice-continuity-v1.ts`의 단일 화법 권위를 보존한다.

## 2. 공통 바이블 추출 카드 (각 캐릭터에 재사용)

```yaml
characterId: <기존 published canonical Character ID>
source:
  bibleRef: <기존 승인 바이블 경로/버전; 미승인은 명시>
  contentVersion: <현재 고정된 실제 발행 버전>
  authorityState: <실제 source authority 상태>
languageNeutralVoice:
  characterCompassRef: <BIBLE A/approved fieldRef>
  valuesAndChoicesRef: <BIBLE C/approved fieldRef>
  speechRef: <published speech fieldRef>
  communicationRef: <published persona.communication fieldRef>
  behavioralRef: <published persona questioning/emotion/conflict/intimacy fieldRef>
  boundaryAndDisclosureRef: <기존 보호 정책/공개 허용 경계>
localization:
  currentCharacterVoiceExceptionValues: NOT_AUTHORED
  localeRuleSelection: DEFERRED
  foreignLanguageRelease: HOLD
```

이 카드는 **정본 복제나 화법값 확정이 아닌 참조형 기준선**이다. 실제 없는 필드·바이블은 `UNDEFINED` 또는 원본의 상태를 보존하고 임의로 보완하지 않는다. 발행 전 캐릭터는 별도 승인 없이 운영 Character가 되지 않는다.

## 3. 이후에만 처리할 언어·국가별 특징

공통 기준선을 캐릭터별로 정리한 **이후** 현행 2개 외국어 로케일부터 화법 특성을 설계한다.

1. **언어 공통 규칙**: `ja-JP`의 1인칭·호칭·경어, `zh-TW`의 자연스러운 호칭·정중도·지역 관용어. 기존 PR #2432는 **규칙 인프라/authoring-only**이며 캐릭터의 실제 값이 아님.
2. **캐릭터별 필요한 예외만**: 이미 승인된 A안에 따라 `characterId + locale + contentVersion + profileVersion` 기반으로 1인칭·호칭·말끝·상황별 전환 중 꼭 필요한 필드만 지정. 기존 PR #2435는 빈 승인 레지스트리/구조를 제공하며 실제 개별 값은 미등록 상태.
3. **현지 표현 추천**: 이 I18N 트랙이 기존 승인 바이블·언어 관습에 근거해 후보/선택 이유/상황별 변형/위험한 오역을 제안하고, 사용자는 캐릭터 정체성과 맞는지만 승인한다. 사용자에게 50개 언어 관습 조사를 전가하지 않는다.
4. **승인값만 적용**: `태겸=俺`, `윤호=僕`, `세연=あたし`는 미승인 설명용 사례다. 추천 후보도 승인을 받기 전에는 캐릭터 설정으로 저장하거나 실제 대화로 공개하지 않는다.
5. **지역 코드와 언어를 구분**: 현 범위는 `ko-KR`, `ja-JP`, `zh-TW`. 향후 50개 국가를 언급했다는 이유만으로 50개 locale/별도 바이블 지원을 선언하지 않는다.

## 4. 로드맵 적용 순서 및 승인 경계

- **I18N-06 기본 순서**: ① 공통 바이블의 언어 중립 화법 참조 기준선 정리 → ② locale 공통 규칙과 스키마 결합 → ③ 캐릭터×locale 실제 예외 추천 및 사용자 승인 → ④ 승인된 예외만 등록 → ⑤ locale/persona/semantic/output guard + feature admission → ⑥ 제한 출시.
- PR #2431(I18N-06a), #2432(I18N-06b), #2435(I18N-06c)는 **이미 작성된 기반 코드**이며 되돌리거나 새 캐릭터 값이 채워졌다고 오인하지 않는다. 기준선 정리가 완료되기 전까지 이 스키마를 실제 외국어 생성 권한으로 연결하지 않는다.
- 구체 프로필 값 미승인 시 `HOLD` 유지. 한국어 기본 응답은 그대로. 기존 저장 Reading·메시지 원문 무변경.
- 사주/관상 공식 풀이의 원천 주장 및 근거는 이 프로젝트의 Bible이 아니라 source-owned 권위에 속함. 저장된 공식 풀이의 새 언어 재열람 정책(승인 보류 ②)은 이 결정으로 해제되지 않는다.

## 5. 이 단계의 완료 범위

이 문서의 완료는 **공통 기준선 및 구현 순서가 명시되었음**을 뜻한다. 모든 캐릭터별 바이블의 작가 승인·source readiness, 개별 외국어 화법의 확정 또는 실제 Reader 다국어 생성의 운영 승인을 뜻하지 않는다.
