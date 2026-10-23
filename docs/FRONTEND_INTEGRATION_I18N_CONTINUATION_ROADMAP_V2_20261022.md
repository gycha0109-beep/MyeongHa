# 명하 전체 다국어화 연속 작업 로드맵 v2.2 — 2026-10-23

> Track Key: `frontend-integration`
>
> 이 문서는 2026-10-21 v1 연속 작업 로드맵(`f96dce9f6d2c248404d602c8663fff53c9396831:docs/FRONTEND_INTEGRATION_I18N_CONTINUATION_ROADMAP_V1_20261021.md`)의 현행 후속 실행 기준인 v2를 **2026-10-23 영어·중국어 간체 추가 결정에 맞게 v2.2로 개정**한 것이다. 기존 인계/PR 참조가 끊기지 않도록 파일 경로의 `V2_20261022`는 유지한다. 기존 source authority, 캐릭터 Bible, Reader Runtime/DB/Commerce 계약을 대체하지 않는다.
>
> 상태: **I18N-01~03 기존 3개 UI 로케일 기반 완료; 신규 `en-US`·`zh-CN` UI는 로드맵에 편입(아직 미구현); I18N-04/05 source 승인 대기; I18N-06 계약·표시 기반 부분 구현 / 외국어 AI 생성 HOLD; I18N-07 허가된 UI 부분 집합 진행 중**.
>
> Track 범위: **UI 목표 5개 로케일 `ko-KR` / `ja-JP` / `zh-TW` / `en-US` / `zh-CN`**. 앞의 3개는 기존 구현, 뒤의 영어·간체는 **로드맵 신규 목표(미구현)**다. 번체 대만(`zh-TW`)과 간체 중국 본토(`zh-CN`)는 **독립된 UI 카탈로그**로 취급하며 단순 글자 변환으로 간체 표현 승인 완료를 선언하지 않는다. 공식 사주·관상 표현 및 Reader 출력은 언어별 기존 source·Character·출력 승인에 종속된다. `en-GB` 자동 지원, 범용 `en`/`zh`/`zh-Hans` 자동 승격, `zh-HK`·다국어 출생시간대·역법·해외 결제, 50개 언어 출시는 **현 범위 밖**이다.

## 0. 불변 사항과 명확히 분리할 책임

1. 사용자 명시적 UI 선택이 없으면 `ko-KR`; `Accept-Language` 및 기존 `profile.locale`로 외국어를 자동 선택하지 않는다. `en-US`·`zh-CN`도 **명시 선택 후 UI 수용과 서버 허용값을 함께 갱신했을 때만** 표시 선호로 활성화한다. `X-MyeongHa-UI-Locale`는 **표시 선호 입력**이지 Reader 응답·공식 풀이 언어 허가가 아니다. 기준 문서: `docs/FRONTEND_INTEGRATION_KOREAN_FIRST_UI_REQUEST_LOCALE_CONTRACT_V1_20261021.md`.
2. `gycha0109-beep/Saju` 및 source-owned Claim/Reading/사주 해석 권위와 관상 source-owned 판정·해석 권위를 변경하지 않는다. **공식 Reading은 Reader와 독립적인 결과**이며 Reader는 허용된 source 결과를 해설하는 표현 주체이지 공식 사주·관상 판정 생성자가 아니다.
3. Reader의 canonical Character ID, 공통 바이블·성격·가치관·관계/기억/권한, source grounding, 구매/Grant, session/thread, idempotency, disclosure/limitation 및 원문 보존은 locale과 독립적으로 유지한다.
4. 이전 한국어 공식 Reading, 이전 대화 메시지, 구매 기록을 UI 언어 선택만으로 번역·덮어쓰기·재발급하지 않는다. 새 언어로 말한 내용은 새로운 명리/관상 주장이 될 수 없다.
5. 캐릭터 임시 이름은 승인된 한국어 한글, 일본어 가타카나, 대만 번체의 로마자 표기 정책을 유지한다. 영어·간체 UI를 추가하더라도 **영어 고유명·로마자 표기, 간체 고유명·한자 표기, 직함·개별 인칭을 I18N이 임의 확정하지 않는다**. 전용 승인 표기 전까지 기존 소유자의 이름/직함 원문을 보존한다. 무단 한자·고유명 확정 금지.
6. 실제 source/provider/semantic admission이 없는 다국어 공식 Reading 또는 운영하지 않는 관상 분석을 지원 완료로 표시하지 않는다. 지원하지 않는 locale/캐릭터/제품은 명시적 HOLD/미지원 처리한다.
7. 작업 귀속 CI만 중단 판단에 사용한다. 현재 세션의 커밋·PR과 직접 연결된 통합 CI에서 결과에 의존하는 후속 단계만 남았다면 재조회 없이 중단한다. 다른 트랙/main CI는 중단 사유가 아니다. 브랜치·PR: `frontend-integration`, `Watchtower-Track: frontend-integration`. 원문 정책·운영 규칙 우선.

## 1. 확인된 구현 상태 (과거 스냅샷과 분리)

| 작업 | 현재 결정 | 근거 |
|---|---|---|
| 기초 UI 다국어/캐릭터 표기/사주 명식 표시 | 완료 | #2368, #2373, #2400, #2401, #2403 |
| I18N-01 기록 이름·시각 변경, 원문 보존 | 완료 | PR #2406, 운영 READY |
| I18N-02 UI authored 문구/상태/오류 처리 | **기존 KO/JA/ZH-TW 기반 완료**; `en-US`·`zh-CN` 사전·화면 확장은 신규 작업 | PR #2409, #2412, #2415, #2419 (마지막 PR merged 2026-10-21) |
| I18N-03 웹→API 선택 로케일 전달·검증 | **기존 3개 UI 로케일 완료**; `en-US`·`zh-CN`은 client/server 허용값 확장 필요 | PR #2424, merge `50dae2c96616f89c5403b9c8c5d574eb35cfdc88`, 한국어 우선 ingress |
| I18N-04 공식 사주 JA/ZH-TW/EN-US/ZH-CN 표현 | **각 언어 source 준비도 종속 / 신규 영어·간체 출력 미승인** | 템플릿 선택기만 존재 (`packages/domain/src/claim-narrative-locale-v1.ts`); EN·ZH-CN 각각 별도 source admission 필요 |
| I18N-05 공식 관상 JA/ZH-TW/EN-US/ZH-CN 표현 | **Face source 운영 준비도 종속 / 영어·간체 포함 출력 미승인** | 실제 Face provider/admission 및 언어별 승인 필요 |
| I18N-06 Reader AI JA/ZH-TW/EN-US/ZH-CN 자연어 응답 | **기반 계약 부분 구현 / 캐릭터별 실제 외국어 화법·생성 공개 HOLD** | #2431/32/35 및 #2441 준비 기반; 영어·간체 화법과 출력은 각각 신규 설계·승인 대상 |
| I18N-07 통합·배포 | **기존 3개 UI 언어의 허가된 부분 집합 진행 중**; 영어·간체 UI 수용 신규 계획 | PR #2441의 Reader/Chat UI-only 부분 구현·CI GREEN(최종 커밋 `48fb176a`, 아직 OPEN); 제품 출시 승인과 구분 |

상태 갱신 시 PR, main, CI, production SHA를 신규 근거로 삼되 위 완료 작업을 재수행하지 않는다. 다른 트랙의 새 main 커밋을 덮어쓰지 않는다.

## 2. 사용자 승인 기록과 미확정 항목 (2026-10-22)

**I18N-06 공통 바이블 기반 9인 화법 초안 작성 (2026-10-22)**
- `docs/FRONTEND_INTEGRATION_READER_LANGUAGE_NEUTRAL_VOICE_MATRIX_V1_20261022.md`에 9인 승인 semantic baseline, typed Runtime 화법, 기존 개별 Bible Draft E/인물 정체성의 현재 관계와 상태를 함께 작성했다. **새 인물 정본 또는 Production release approval이 아니다.**
- 기존 출처 간 충돌/방향 차이(특히 **여울/미라/도윤** 외에도 세연/서린/백헌)를 임의 정리하지 않고 Character 소유자 선택 대상으로 표시한다. 바뀌는 것은 이 I18N projection뿐이다.
- 다음 단계는 우선 해당 공통 인물 화법의 source 정합성 채택이며, 그 후 국가/언어별 캐릭터 화법 후보를 만들고 사용자 승인 후에만 sparse exception registry에 등록한다. `ja-JP`/`zh-TW` 실제 캐릭터별 표현값은 여전히 미등록.

**추가 승인 — 바이블 먼저, 언어·국가별 특성 나중 (2026-10-22)**
- 사용자 승인: **공통 캐릭터 바이블의 언어 중립 인물성·화법 기준부터 정리**하고, 언어/국가별 화법 값과 캐릭터별 예외 후보는 그다음에 설계·제안한다. 기존 **A안(필요한 예외만 등록)**은 유지한다.
- `docs/FRONTEND_INTEGRATION_READER_SHARED_BIBLE_BASELINE_V1_20261022.md`를 I18N-06의 첫 작성 기준으로 삼는다. 기존 승인 Bible/published Character Content가 person-level authority이며 별도 새 Canon을 만들지 않는다.
- I18N-06a/b/c의 이미 작성된 인터페이스·공통 언어 규칙·빈 승인 레지스트리는 준비 자산으로 유지하지만, 캐릭터 바이블 정리 전에 **실제 외국어 화법 값을 채우거나 외국어 출력을 켜지 않는다**.
- 현지 화법 조사 및 후보 제시는 다국어화 트랙이 담당한다. 사용자는 언어 문법이나 문화 관습을 직접 작성하지 않고, 제시된 캐릭터성의 적합성과 실제 값만 최종 승인한다.
- 이 승인은 실제 캐릭터×locale 값, `zh-CN`/50개 언어 확대, 공식 Reading 재열람 정책 ②, 상용 출력 공개 승인으로 해석하지 않는다.


**승인된 구현 방향**
- **승인 ①:** 공식 사주·관상의 현지어 명리/관상 용어집 및 의미 보존 기준을 수립하고 source-owned 표현 템플릿·검수 체계를 준비. 이것은 특정 미작성 용어/템플릿을 정답으로 승인하거나 출시 허가한 것이 아니다.
- **승인 ③:** Reader의 언어별 자연스러운 화법 및 출력 보호장치를 설계·구현. **공통 캐릭터 바이블 1개 + 언어 공통 화법 규칙 + 캐릭터×로케일 예외/상황 규칙** 구조를 채택. 모든 캐릭터/언어의 실제 표현이나 공개를 일괄 승인한 것은 아니다.
- 사용자 기존 결정: 한국어 기본, 사용자 명시 선택만 `ja-JP`/`zh-TW`, 원본 대화·Reading 보존.

**보류/추가 source 승인 필요**
- **보류 ②:** 이미 저장된 공식 Reading을 다른 언어로 재열람할 때 같은 source 근거로 재표현할지, 버전된 별도 artifact를 만들지, 또는 원문만 유지할지. UI 언어 선택만으로 기존 Reading을 재생성하지 않는다.
- **Source 승인 대기:** Saju/Face owner의 실제 다국어 ClaimNarrativeProfile·FaceNarrativeProfile, ClaimType/semanticKey/templateKey, 용어집·불확실성/출처·의미 동등성 검수, production admission.
- **Reader 구체 화법 결정 대기:** 각 캐릭터의 일본어 1인칭·호칭·경어 및 번체 화법의 실제 값, 관계/격식 전환 조건. 예시 `태겸=俺`, `윤호=僕`, `세연=あたし`는 설명용 **미승인 예시**이며 캐릭터 설정에 쓰지 않는다.
- 기존 대화 원문 보존은 유지하되, 선택 언어를 바꾼 뒤 **새로 생성하는 턴**과 진행 중 요청에 적용할 로케일 고정·재시도 정책은 I18N-06에서 기존 API 계약 안에서 좁게 결정한다. 과거 메시지 자동 번역/재작성은 금지.
- **과거 결정 범위 명시:** 2026-10-22 당시 `zh-CN` 추가는 HOLD였으나 **2026-10-23 사용자의 신규 UI 범위 결정으로 §2.2·§9에서 UI 목표에 한해 해제**되었다. 이 결정으로 간체 Reader/공식 풀이/중국 본토 운영·해외 상거래/역법/프로필 locale 동기화/50개 언어 출시가 승인되는 것은 아니다.

### 2.1 영어 `en-US` 추가 결정 — 2026-10-23 개정

- **이번 사용자 지시로 확정한 범위:** 기존 `ko-KR`/`ja-JP`/`zh-TW` 국제화 로드맵에 **`en-US` 추가**, 적용 순서는 **영어 UI 우선 → 공통 바이블 이후 영어 Reader 화법 후보 → Source 승인 이후 영어 공식 사주·관상 출력**이다. 이 결정 자체가 영어 구현 완료·영어 AI 생성 허가·상용 출시 승인은 아니다.
- **영어 UI의 우선 구현 범위:** 웹/모바일 사용자 선택기·저장/복원, 일반 메뉴·버튼·입력·로딩·오류·거부·HOLD/접근성·원문 비번역 안내, 기존 원문 보호 화면 및 Reader 상태 UI. 기존 기능/권한·Thread/Reading ID·메시지·계산 사실은 그대로 둔다.
- **영어 요청 경계:** 기존 `SUPPORTED_MOBILE_UI_LOCALES`, 웹 UI locale catalog, API의 명시 헤더 allowlist, locale normalization, 타입/스냅샷·테스트를 서로 맞춰 확장한다. **`en-US` 헤더를 수용하더라도 Reader voice/공식 Reading generation 언어로 자동 승격시키지 않는다.** UI 미배포 구간에는 `en-US`가 아직 기존 Korean-first fallback으로 처리되는 점을 숨기지 않는다.
- **영어 Reader:** approved language-neutral published Bible 확정 및 6인 source 충돌 소유자 결정 후, English common style register(격식·거리감·호칭·유머·문장 리듬)와 필요한 character×locale sparse delta 후보를 I18N이 작성한다. 사용자/Character owner 승인 전 `en-US` 값 등록·실제 답변 생성/출시 금지.
- **영어 공식 사주·관상:** 영어 용어집/표현 자산·근거/불확실성/주의/의미 동등성은 Saju/Face 소유자의 실제 source admission 이후에만 연결한다. `en-US`를 선택해도 원래 한국어 공식 기록/채팅을 자동 번역·재발급하지 않으며, 보류 ②는 그대로다.
- **일정·우선순위:** 영어 UI를 기존 I18N-07 UI-only 작업과 **병렬 우선**으로 진행할 수 있으나, 영어 화법/공식 출력은 승인에 따른 후행이다. 무작정 모든 Reader 기능·언어 출시를 기다리지 않고 승인된 부분 집합만 반영한다.

### 2.2 중국어 간체 `zh-CN` 추가 결정 — 2026-10-23 개정

- **신규 사용자 결정:** 기존 번체 대만 `zh-TW`는 그대로 유지하고, **중국어 간체 `zh-CN`을 다섯 번째 UI 목표 로케일로 추가**한다. UI 국제화를 먼저 수행하고, Reader 간체 화법 및 공식 사주·관상 간체 출력은 기존 승인 게이트를 따르는 후행 작업으로 계획한다.
- **간체 UI 계약:** 웹/모바일 선택기, 저장·복원, UI 문구(메뉴/오류/HOLD/접근성/원문 주의), `X-MyeongHa-UI-Locale`의 명시적 allowlist와 normalization/test를 `en-US`와 함께 확장한다. 미지원 범용 `zh`, `zh-Hans`, `zh-HK` 자동 추론·승격 없음. 미선택 시 KO 우선 유지.
- **번체와 독립 작성:** 간체는 문자 변환뿐 아니라 지역별 자연스러운 UI 표현·호칭·명리·관상 용어가 다를 수 있으므로 `zh-TW`를 무검수로 변환해 공식 지원으로 표시하지 않는다. 제품의 공통 의미와 기존 서버 계약을 보존하면서 **UI 저자 문구만 별도 `zh-CN` 카탈로그**로 작성한다.
- **보류 사항:** 캐릭터 이름/중국어 호칭·고유명, `character×zh-CN` voice delta, Reader 생성 언어, source-owned Saju/Face Claim/용어집/표현, 저장 공식 Reading 재번역(정책 ②), 중국 본토 서비스 운영·결제·현지 규정 검토는 **UI 추가와 별도로 미승인/HOLD**다.
- **일정·우선순위:** 영어와 간체의 UI 기반 계약을 함께 확장하되 번역 자산과 승인·회귀는 로케일별 분리한다. 기존 3개 UI 언어와 Reader 정본/source 결정 진행을 대체하거나 되돌리지 않는다.

## 3. I18N-04 — 공식 사주 출력 (Saju bridge와 책임 분리)

**Source/Saju bridge 책임:** Canonical 사주 계산, T5/T8/기타 승인된 interpretation claim·근거, 정식 ProductReadingResponse, provenance/semantic validity, product readiness 및 공개 계약.

**이 트랙의 책임:** 이미 source-owned 승인된 구조화 의미/프로필을 받아 기존 `ko-KR`/`ja-JP`/`zh-TW` 및 향후 source 승인을 거칠 `en-US`·`zh-CN` 표현을 표시·선택하는 경계만 연결. ClaimType·RuleId·semanticKey 매핑, 공식 용어집과 렌더러 결합은 **Source의 실제 계약이 준비된 뒤** 적용. 같은 사주 엔진을 언어 수만큼 복제하지 않는다.

작업 순서:
1. Saju 측 실제 승인된 claim + provenance + template/renderer availability와 공식 Reading 저장/재열람 경계를 확인한다.
2. Source-owned 명리 용어집/표현 자산과 이 트랙의 표시 경계를 연결한다. 템플릿은 판단 권한이 아니다. LLM을 사용할 경우에도 확정된 의미를 현지어로 표현하는 범위만 허용하고 새로운 주장 생성 불가.
3. locale에 맞는 source 결과·semantic admission이 없으면 명시적 unavailable/HOLD. **`en-US`·`zh-CN` UI 선택만으로 해당 언어 공식 사주가 지원된다고 표시하지 않는다.** 한국어를 외국어 공식 풀이로 오인시키지 않는다.
4. 이전 공식 Reading의 언어 재열람은 **보류 ② 승인 이전에는 구현·출시하지 않는다**.

완료 기준: 실제 source 승인된 locale에서만 공식 읽기 결과가 나오고, 동일 Claim/grounding, epistemic qualifier, limitation, method attribution, entitlement이 유지됨. source 미준비 시 배포 미지원이 정상 동작.

## 4. I18N-05 — 공식 관상 출력 (Face source 준비도 종속)

Face provider/production admission과 source-owned FaceNarrativeProfile·semanticKey·`ja-JP`/`zh-TW`/`en-US`/`zh-CN` 각 언어의 현지어 범위/주의 문구/용어집이 준비된 뒤, 승인된 표현만 연결한다. 엔진 제공 전 사진 준비 UI를 공식 분석 가동으로 표시하지 않는다. 준비 전 HOLD; Reader 화법 구현이 Face source 판정 권위를 대체하지 않는다.

## 5. I18N-06 — Reader AI 다국어 화법 시스템 (핵심 수정)

### 5.1 목표와 비목표

목표: 캐릭터가 언어를 바꿔도 **같은 인물**로 들리도록, 공통 바이블을 복제하지 않고 표현 규칙을 조합한다. 현행 3개 UI locale에 신규 UI 목표 `en-US`·`zh-CN`을 더한 **5개 목표 로케일**로 계약을 확장하되, 실제 영어·간체 Reader 출력은 각각 후행 승인 전 HOLD한다.

비목표: 50개 언어/국가의 지원 선언, 캐릭터당 국가별 바이블 전량 작성, LLM에 캐릭터 판단/사주 claim/메모리/관계/권한 수정 권한 부여, 미승인 캐릭터 공개, Saju/Face renderer 대체.

### 5.2 런타임 구성 — 단일 바이블 + 계층형 화법 프로필

```text
canonical Character Bible + approved relationship/context + allowed Saju/Face grounding
  + request locale (UI targets: ko-KR / ja-JP / zh-TW / en-US / zh-CN; Korean-first; voice output separately approved)
  + locale-common voice conventions (1인칭/2인칭, 경어, 지역형 표현, 상담체)
  + character×locale style deltas (필요한 1인칭/호칭/높임말/말끝/금지 표현)
  + context-conditioned overrides (상대/관계 단계/격식/행동 정책, 승인 범위)
    -> bounded Reader utterance generation
    -> grounded semantic + persona + locale output guard
    -> admitted output OR protected fallback/HOLD
```

우선순위: source/권한/공통 바이블/고정 행동 정책 **절대 우선** > 승인된 사용자 locale > 언어 공통 화법 규칙 > 캐릭터×locale 예외 > 상황별 전환(허용된 조건 한정). 캐릭터 예외가 source 사실·불확실성·금지선을 덮어쓸 수 없다.

작업 항목:
1. **I18N-06a — 계약 분리:** 현재 `seyeon-character-runtime-v2.ts`의 한국어 존댓말 지시를 즉시 치환하지 말고, 상위 source-bound guard/behavior를 그대로 유지하는 언어 입력과 versioned character voice locale profile 인터페이스를 분리. `X-MyeongHa-UI-Locale` 단독으로 비한국어 생성이 허가되지 않게 지원/승인 판정 분리. 미지원은 기존 KO 정책 또는 명시적인 불가 처리하되 **외국어라고 가장하지 않기**.
2. **I18N-06b — 공통 locale 화법 규칙:** 일본어 경어·1/2인칭·상황별 정중도, 번체 `zh-TW`의 호칭/지역어/상담 스타일, 간체 `zh-CN`의 별도 호칭/지역 관용어/정중도, 영어의 격식·호칭·거리감·완곡성·대화 리듬에 대한 *로케일 공통* 규칙을 각 언어로 작성. 영어 규칙도 authoring/guard 준비물이며 캐릭터별 실제 값이나 공개 승인으로 간주하지 않는다. 국가=언어로 가정하지 않으며 이 작업에서 `zh-CN`을 추가하지 않는다.
3. **I18N-06c — character×locale delta:** 기존 바이블을 참조하는 작은 설정만 작성. `en-US`와 `zh-CN`도 필요 시 sparse exception만 사용하며 캐릭터별 영어·간체 바이블 전체를 복제하지 않는다. `characterId`, `locale`, `profileVersion`, `selfReference`, `addresseeStyle`, `politenessRegister`, `sentenceEnding`, `contextConditions`, `prohibitedStyle` 등 필요한 범위의 **선언적 스키마**를 설계. 값과 변동 조건을 승인하지 않은 캐릭터는 임의로 채우지 않고 HOLD. 예: 일본어의 `俺`/`僕`/`あたし`는 단순 한국어 `나` 번역이 아니라 캐릭터별·상황별 선택 대상.
4. **I18N-06d — 합성/guard:** 생성기에게 선택 언어의 voice conventions + 해당 캐릭터 delta만 전달하되 canonical Bible, Reading source refs/claim scope, persona, 관계/기억, 행동·민감 정책 우선. 최종 Output Guard에서 language/script 일탈, persona/style 위반, 잘못된 1인칭/호칭/격식, 언어 섞임, 새로운 명리 확정 주장, qualifier/disclosure 누락, 권한 밖 정보와 원본 오염을 거부 또는 보호된 fallback. LLM 자체를 유일한 guard로 간주하지 않는다.
5. **I18N-06e — 제한 수용/출시:** 우선 실제 지원·승인된 캐릭터×locale에 한해 language switch → 새 턴 → retry/idempotency → 원문 기록 재열람 → protected fallback을 수용. `en-US`·`zh-CN` UI 지원만 완료한 단계에서 실제 영어·간체 Reader 응답은 아직 미지원이므로, 기존 원문 표시와 UI-응답 언어 불일치 안내를 우선 수용한다. 웹/모바일 UI locale과 실제 Reader 출력 locale 간 불일치를 사용자에게 은폐하지 않는다. 지원 밖 캐릭터·locale에 자동 확장 금지.

### 5.3 확장성 원칙

기본 자산은 **캐릭터별 공통 바이블 C개 + 언어 공통 규칙 L개 + 필요한 캐릭터×locale 예외 E개**이다. 목표는 전체 `C×L` 바이블 복제가 아닌 `C+L+E` 관리이다. 예외가 많아지면 `E`도 커질 수 있으며 무검수 50개 언어 완벽 지원을 보증하지 않는다. 지역 차이는 locale 별 차이로 명시하고 기존 지원 범위 밖은 미지원 처리한다.

### 5.4 Reader 완료 게이트

- canonical Character ID/persona/관계·메모리·허용 source grounding/entitlement 불변.
- 지원된 캐릭터×locale에서 승인한 인칭·호칭·경어·말투가 문맥별 일관되게 유지; 같은 캐릭터의 다른 언어는 성격 동일, 다른 캐릭터 간 구별 유지.
- 사주/관상 claim·원문·출처/불확실성 의미 강화/누락 0; 과거 저장된 한국어 발화 재작성 0.
- `ja-JP`/`zh-TW`/`en-US`/`zh-CN`을 포함한 unsupported 또는 unapproved voice profile에서 임의 외국어 공개 0; guard 실패 시 fail-closed.
- 웹/모바일·서버 locale 요청의 허용 범위가 실제 사용 가능 캐릭터/feature별로 일치.

## 6. I18N-07 — 통합 수용·배포

I18N-04/05/06 중 source 승인·운영 준비도·캐릭터×locale 화법 승인·의미/Output Guard가 충족된 **부분 집합만** 수용한다. 전 기능 일괄 출시를 기다리거나 미지원 범위를 완료로 포장하지 않는다.

1. 기존 KO/JA/ZH-TW 및 신규 EN-US/ZH-CN **명시 선택**의 저장·reload·웹/모바일 동기화 경계, 동일 session/thread, 새 응답, 기록 재열람, 오류/거부, locale 변경 중 in-flight/재시도 경계. UI locale가 바뀌어도 이전 source 문장/진행 중 응답을 번역하지 않는다.
2. 캐릭터 정체성·상황별 1인칭/경어·말투 정합성, source-grounding/claim/qualifier, Reading/DB/Commerce 권한, 원문 보존 회귀.
3. Source readiness/HOLD와 Reader 지원 상태를 UI에 분리 표시. 특히 **EN-US·ZH-CN UI 제공**과 **해당 로케일 Reader 응답·공식 사주·관상 미승인**을 독립 표시한다. 미구현 언어 공식 풀이를 공식 지원으로 표시하지 않는다.
4. 정확한 CI 귀속·production SHA 확인 뒤 승인된 subset만 공개; 원래 운영 feature flags·release authority 유지.

## 7. 다음 실제 구현 순서와 중단 조건

**병렬 우선 작업 — `en-US`·`zh-CN` UI 도입:** I18N-02/03의 기존 KO-first UI 계약을 유지한 상태에서 웹/모바일 locale 사전·선택/저장·UI request header allowlist·UI-only 소비 화면·원문 보존 안내를 영어·간체까지 늘리고, 신규 I18N-07 회귀를 추가한다. 기존 진행 중 I18N-06 Reader source 정합성 결정과 독립적으로 진행하지만 영어·간체 생성·공식 출력 승인은 앞당기지 않는다. 영어 상세 절차는 §8, 간체는 §9.

1. **승인된 순서로 전환**: 먼저 `docs/FRONTEND_INTEGRATION_READER_SHARED_BIBLE_BASELINE_V1_20261022.md` 기준으로 캐릭터별 기존 Bible 및 published `speech`/`persona`의 언어 중립 화법 참조를 정리한다. 승인되지 않은 Draft는 명시적으로 HOLD하고 새 Canon을 만들지 않는다. 이후 준비된 **I18N-06a** 인터페이스를 사용한다. **비한국어 출력 공개는 하지 않는다.**
2. **I18N-06b/06c 기반 PR 작성 완료(병합·출력 허가와 별개)**: 공통 언어 규칙 및 sparse 예외 스키마는 유지하고, 먼저 언어 중립 바이블 기준선과 연결한다. **그 후** 언어/국가별 후보를 제시·승인받아 개별 값을 등록한다. 미승인은 HOLD. 기존 KO character persona 변경 금지.
3. 승인된 샘플 캐릭터×로케일만 **I18N-06d/e** 합성·guard 및 수용. 승인 없으면 출력 활성화 없이 인프라까지만 진행.
4. I18N-04는 Saju source 준비도, I18N-05는 Face source 준비도 확보 시 병렬 진행. 공식 Reading의 이전 artifact 재언어화는 ② 보류 해제 후에만 착수.
5. I18N-07은 실제 허가된 경로만 통합·배포. 영어·간체 UI 부분 집합은 각 언어 Reader/공식 출력 승인 없이도 별도 UI 수용 조건을 충족하면 진행할 수 있다.

## 8. 신규 `en-US` 작업 분해·순서·수용 게이트 (v2.2)

| 순서 | 기존 단계 귀속 | 구현 범위 | 수용 기준 및 경계 | 상태 |
|---|---|---|---|---|
| **EN-UI-A** | I18N-02/03 | 웹·모바일 `en-US` 정적 UI 사전, 선택기/타입/normalize, 명시 선택 저장·복원, API `X-MyeongHa-UI-Locale` allowlist 조정 | 선택 전 KO-first, 지원 밖 `en`/`en-GB` 무단 확대 없음; 승인된 `zh-CN` 확장은 §9의 별도 명시 계약으로만 수행; 헤더는 UI preference만 전달 | **미구현 / 우선** |
| **EN-UI-B** | I18N-07 허가된 부분 집합 | Chat/Reading/Reader Picker/기록/프리뷰의 영어 UI 저자 텍스트, 오류·HOLD·접근성, 원문 비번역 안내 | `message.body`, 공식 `step.*`/record, `openingLine`, 식별자·권한·결제/Grant·birth/timezone 불변. 출처/캐릭터 이름·직함은 원문 또는 승인된 표시만 | **미구현 / 우선** |
| **EN-UI-C** | I18N-07 회귀 | 웹/모바일(locale 변경·reload·in-flight·retry·guest/member·HOLD), Korean fallback, UI/source 분리·응답 원문 보존 테스트 | 지원된 UI만 `en-US` 선택 가능, Reader/공식 풀이를 영어 지원으로 오표시 0, 인증/권한 우회 0 | **미구현 / EN-UI-A/B 후** |
| **EN-VOICE** | I18N-06b/c/d/e | 9인 공통 source 기준 확정 뒤 English common voice convention과 필요한 캐릭터별 sparse delta 후보·출력 guard·제한 수용 | 6인 출처 충돌 Character owner 결정, 후보 사용자 승인, runtime source/persona/semantic/output admission 통과 전 실제 영어 대사 생성·출시 **HOLD** | **후행 / 승인 대기** |
| **EN-SAJU** | I18N-04 | source-owned 영어 명리 용어집·표현 템플릿/semantic parity·disclosure 연계 | Saju owner의 실제 영어 Claim/renderer/provenance·공식 출력 승인 전 **HOLD**. 이전 artifact 번역 정책 ② 유지 | **후행 / Source 대기** |
| **EN-FACE** | I18N-05 | source-owned 영어 관상 용어집·표현·주의/출처 안내 연계 | Face provider/admission·영어 source/semantic approval 전 **HOLD**. UI가 Face 분석 제공 여부를 승격시키지 않음 | **후행 / Source 대기** |

### 8.1 의존 관계

```text
현재 KO/JA/ZH-TW UI + 한국어 우선 계약 (기존 구현)
  ├─ [즉시 우선] EN-UI-A → EN-UI-B → EN-UI-C → 영어 UI만 부분 수용
  ├─ [Character owner] 9인 공통 published Bible 참조 및 6인 충돌 결정
  │      → 영어 공통 표현 후보 → 필요한 character×en-US 예외 승인
  │      → Runtime/Output Guard → 승인된 영어 Reader만 별도 출시
  ├─ [Saju owner] EN Claim/용어집/renderer + Source admission → 영어 공식 사주 승인 후 수용
  └─ [Face owner] EN Face provider/source/admission → 영어 공식 관상 승인 후 수용

UI 선택과 Reader/공식 출력/유료 구매 권한 사이에는 자동 승격 경로가 없다.
```

### 8.2 수용·중단 규칙

- **계약 우선:** 현재 `en-US`와 `zh-CN`은 아직 실제 UI 지원값이 아니다. 웹/모바일/API 경계가 동시에 준비되기 전에는 '영어 지원 완료'로 보고하지 않는다. 새 영어·간체 선택은 한국어 기본을 변경하거나 `Accept-Language` 기반 자동 선택을 추가하지 않는다.
- **원문 불변:** 과거 Chat/Official Reading/Reader utterance, 현재 서버가 생성한 한국어 텍스트, 비공개 정보·HOLD·보호 fallback의 내용을 영어 UI 사전으로 재해석·번역하지 않는다. UI-only notice로 원문 언어 유지·지원 범위를 명확하게 알린다.
- **승인 분리:** EN·ZH-CN UI의 구현·CI GREEN ≠ 해당 locale Reader output approval ≠ 해당 locale Saju/Face semantic/source approval ≠ 기존 Reading 재언어화 승인 ② ≠ 상용 release. 승인 책임은 Character/Saju/Face/Reader/UX/Ops 기존 owner에 남긴다.
- **CI/PR:** 기존 작업 브랜치·로드맵을 유지하고 변경 PR은 `Watchtower-Track: frontend-integration`으로 귀속한다. 관련 CI만 확인하며, CI 성공 시에도 자동으로 English production flag를 활성화하지 않는다. 병합은 auto-merge.
- **완료 표기:** 구현한 실제 UI 화면/locale·메시지 원문 보호·미지원 표시·회귀 결과를 각각 보고한다. 영어·간체 Reader/공식 출력은 소유자가 승인한 이후에만 별도 완료 상태로 갱신한다.

## 9. 신규 `zh-CN` 작업 분해·순서·수용 게이트 (v2.2)

| 순서 | 기존 단계 귀속 | 구현 범위 | 수용 기준 및 경계 | 상태 |
|---|---|---|---|---|
| **CN-UI-A** | I18N-02/03 | `en-US`와 공통 웹·모바일 locale 계약 확장. 별도 `zh-CN` 타입·명시 선택·저장/복원·API UI 헤더 allowlist·Korean fallback | `zh-TW`와 식별자 분리; `zh`/`zh-Hans`/`zh-HK` 자동 매핑 금지; 기존 세 언어 선택·저장 호환성 유지 | **미구현 / 우선** |
| **CN-UI-B** | I18N-07 허가된 부분 집합 | 번체 변환본을 무검수 유통하지 않는 간체 UI authored 카탈로그. Chat/Reading/Reader Picker/프리뷰/기록의 메뉴·상태·HOLD·접근성·원문 주의 문구 | Character 이름·직함은 별도 승인 전 기존 원문 보존. `message.body`, `openingLine`, 서버 `step.*`/Official artifact, 진단 코드/출처·권한/Grant 변조 0 | **미구현 / 우선** |
| **CN-UI-C** | I18N-07 회귀 | KO/JA/ZH-TW/EN-US/ZH-CN 선택·복원·reload·in-flight·retry·guest/member·HOLD·원문 보존 테스트 | 번체/간체 UI 분리 및 Korean-first; 간체 UI만으로 Reader/공식 풀이를 간체 지원으로 오표시 0 | **미구현 / CN-UI-A/B 후** |
| **CN-VOICE** | I18N-06b/c/d/e | 9인 중립 화법 source 인계와 6인 충돌 해결 후 간체 공통 화법·필요한 캐릭터별 sparse delta 후보·Output Guard | Character 소유자 정본, 중국어 호칭/인칭·관계 표현 사용자 승인, runtime·semantic·persona·출력 admission 통과 전 실제 간체 생성·공개 **HOLD** | **후행 / 승인 대기** |
| **CN-SAJU** | I18N-04 | source-owned 간체 명리학 용어·서술 자산/semantic parity/qualifier/disclosure 연계 | Saju owner의 `zh-CN` source/renderer/provenance 승인 없으면 공식 풀이 출력 **HOLD**; 기존 artifact 재언어화 정책 ② 유지 | **후행 / Source 대기** |
| **CN-FACE** | I18N-05 | source-owned 간체 관상 용어·해석 표현·주의/출처 안내 연계 | Face provider 및 `zh-CN` source/semantic admission 없으면 간체 관상 공식 출력 **HOLD** | **후행 / Source 대기** |

### 9.1 의존 관계 및 출시 경계

```text
기존 KO/JA/ZH-TW UI + Korean-first 요청 계약
  ├─ [공통 기반] EN-UI-A + CN-UI-A (타입·선택기·UI 헤더 allowlist 일괄 확장)
  ├─ [로케일별 작성] EN-UI-B / CN-UI-B (서로 별도 UI 문구·HOLD·회귀)
  ├─ [부분 수용] EN-UI-C / CN-UI-C → 영어·간체 UI-only 수용
  ├─ [Character owner] 공통 published Bible·6인 충돌 해결
  │       → 간체 공통 표현·예외 후보 승인 → Runtime/Output Guard → 승인된 Reader만
  ├─ [Saju owner] 간체 Claim/용어집/renderer/source admission → 공식 사주 승인 후
  └─ [Face owner] 간체 provider/source/semantic admission → 공식 관상 승인 후

중국 본토 서비스 운영/결제/규제 대응은 locale UI 구현과 별개인 후행 승인 범위.
```

### 9.2 간체 전용 수용 원칙

- UI 카탈로그의 간체 글자 사용만으로 `zh-TW`와 동일한 용어·화법을 승인한 것으로 보지 않는다. **저자 UI 문구는 `zh-CN`으로 별도 검토**, 공식 source 문장은 source 소유자 승인을 별도로 받는다.
- 언어 선택값으로 출생 지역·절기·역법·시간대/계산 기준을 자동 전환하지 않는다. 간체 UI를 중국 본토 사용자에게 노출하는 것과 중국 본토 상품 판매·결제·개인정보 운영 허가는 다르다.
- 기존 캐릭터 프로필, 원본 Chat, 과거 Official Reading, 서버 오류 식별자, source/semantic hash 및 server grant를 변경하지 않는다. `zh-CN` UI 선택은 LLM responseVoiceLocale·ReadingLocale·source admission의 근거가 아니다.
- 영어·간체 양쪽 모두 UI 변경 완료와 실제 공개·운영 완료를 구분하고, 미승인 Reader/사주/관상 언어는 명시적으로 HOLD한다.

PR 별 범위는 최소화한다. CI가 시작되었다는 사실만으로 unrelated 작업을 중단하지 않지만, **현재 작업 PR에 귀속된 CI가 다음 필수 단계인 경우** 결과를 반복 조회하지 않고 세션을 중단한다. 실행 완료 보고는 각각 한 줄: **한 것 / 남은 것 / 다음에 할 것 / 블로커 및 승인사항**.


## 10. 사용자 정책 결정 — 2026-10-23 (최신 결정 우선)

> 이 절은 앞선 문서의 '정책 ② 보류', '외국어 사주·관상 허가 대기', 'Reader 공개 시점/별도 정책 승인' 문구 중 **정책 승인 상태만** 갱신한다. 과거 기록은 의사결정 이력으로 유지한다. 미구현 source·품질·실행 검증을 완료로 간주하지 않는다. 최종 제품 정책 승인권자는 사용자(프로젝트 소유자)이며, 트랙/소유자 구분은 기술 구현·원문 권위의 경계이지 별도 사람의 허가를 요구하는 체계가 아니다.

### 10.1 캐릭터별 문화권 화법 — 설계 방향 유지, 구체값 미확정

- **아직 미승인:** 캐릭터 6인(세연·여울·서린·미라·도윤·백헌)의 Bible/Runtime 사이 의미·화법 불일치와 캐릭터×로케일의 실제 인칭·호칭·말투 값. 무단 통합·승격 금지.
- 기존 승인한 구조(**공통 언어 중립 바이블 + 로케일별 언어 관습 + 필요한 인물별 sparse 예외**)는 유지한다. 일본어 경어·요비스테·1/2인칭, `zh-TW`/`zh-CN` 호칭·어감·관계 거리감, 영어 격식·리듬 등 현지 연구와 후보 작성은 I18N 작업이 담당한다.
- 일괄 수작업 승인표를 사용자에게 요구하지 않는다. 먼저 충돌 6인의 **한국어 인물성 선택지 및 실제 대사 샘플**, 이후 언어별 대표 상황(초면/익숙함/갈등/위로/장난)의 비교 샘플을 제시한다. 사용자는 캐릭터가 동일한 인물처럼 느껴지는지만 판단하고, 필요한 예외만 승인한다.
- 한국어 기준 인물성 자체의 출처 충돌이 풀리기 전에는 해당 외국어 실제 대사 등록·생성 공개를 HOLD한다.

### 10.2 공식 사주·관상 외국어 결과 — 사용자 정책 승인

- 사용자는 **공식 사주·관상 결과를 지원 언어로 제공하는 방향을 승인**했다. 동일 주제에 대한 별도 '사람/트랙의 출시 허락'을 다시 요구하지 않는다.
- 이 결정으로 미작성 언어별 claim/용어집·렌더러·출처, 의미 동등성 검증, 관상 provider 및 실제 인증/보안 조건이 자동 생성되거나 충족되는 것은 아니다. 준비되지 않은 언어의 결과는 명시적 미지원 상태로 유지한다. UI locale 선택은 외국어 해석 가능성의 증명이 아니다.
- 공식 명리·관상 판정은 각 source 엔진이 소유하며, UI/Reader는 새로운 해석 사실을 추론·추가하지 않는다.

### 10.3 저장 공식 해석의 선택 언어 재조회 — 기존 정책 ② 보류 해제

- 공식 Reading의 **정본 계산·판정·해석 근거·기록 ID는 변경하거나 덮어쓰지 않는다**. 처음부터 모든 언어를 일괄 생성하지 않는다.
- 사용자가 해석을 **새로 조회**하는 시점에 해당 요청의 명시적 지원 언어를 사용한다. 동일 공식 Reading에 대한 해당 언어·source/render 버전의 저장된 표현이 있으면 재사용하고, 없으면 같은 정본 의미를 언어별로 **온디맨드 재표현**하여 별도 언어 표현/캐시로 관리한다. 이는 새 사주를 계산하거나 과거 정본 의미를 고치는 행위가 아니다.
- 설정에서 언어만 변경했다고 화면에 이미 표시된 과거 해석, 모든 저장 기록, 구매·Grant 또는 과거 대화를 일괄 번역·재발급하지 않는다. 다음 명시적 조회부터 선택 언어가 적용된다. 미지원 언어/출처 불충분/검증 실패 시 가짜 현지어 결과 대신 미지원 또는 원문 표기와 구분된 안내를 제공한다.
- 과거/현재 **채팅 메시지는 작성·생성 당시의 원문과 언어를 그대로 보존**한다. 언어를 바꾼 뒤에도 과거 사용자·캐릭터 메시지를 번역하거나 덮어쓰지 않는다. 새로운 턴만 새 요청 시점에 지원·허가된 응답 언어로 생성한다. 진행 중 요청과 동일 요청 재시도는 기존 요청의 언어 snapshot/idempotency를 보존한다. 다국어가 섞인 채팅 기록도 정상 상태로 취급한다.
- 기록 저장·언어별 캐시·버전 관리와 Reader 요청은 기존 DB/Reading/Chat 서비스 계약 범위에서 구현한다. 원문과 변환본의 구별, source provenance 및 접근 권한을 유지한다.

### 10.4 Reader/캐릭터 다국어 공개 — 별도 출시일·승인회의 요구하지 않음

- 사용자는 출시 날짜, 캐릭터별 공개 순서, 언어별 상용화 권한을 **미리 모두 결정하지 않고 개발 상황에 따라 점진적으로 판단**하기로 했다. 별도 승인자를 만들거나 근거 없는 '공개 일정 승인'을 신규 블로커로 삼지 않는다.
- 단, **정책적 진행 허용 ≠ 미구현 기능의 운영 활성화**다. 기존 계정·구매/Grant·개인정보·Reader/Character 입장 권한, 실제 source/인물성 정합성, 언어별 품질·오류·회귀 보호는 유지한다. 검증된 부분만 기존 feature gate 내에서 단계적으로 수용하고, 미준비 기능은 HOLD한다.

**이 절 적용 이후 분리한 상태:** (A) 정책 승인 완료 = 공식 외국어 사주·관상 방향, 과거 공식 Reading 선택 언어 온디맨드 재표현, 별도 사전 출시일/승인 의무 없음; (B) 미확정 제품 콘텐츠 = 충돌 6인 캐릭터 인물성·실제 외국어 말투; (C) 기술 미구현/검증 = source provider·언어별 rendering, 언어별 캐시/조회, Reader 품질·권한과 실제 롤아웃. A는 B/C를 완료로 승격하지 않는다.
