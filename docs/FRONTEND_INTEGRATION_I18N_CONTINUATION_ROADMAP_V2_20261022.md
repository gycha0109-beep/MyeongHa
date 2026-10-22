# 명하 전체 다국어화 연속 작업 로드맵 v2 — 2026-10-22

> Track Key: `frontend-integration`
>
> 이 문서는 2026-10-21 v1 연속 작업 로드맵(`f96dce9f6d2c248404d602c8663fff53c9396831:docs/FRONTEND_INTEGRATION_I18N_CONTINUATION_ROADMAP_V1_20261021.md`)의 **현행 후속 실행 기준**이다. v1은 현재 main에 없는 과거 스냅샷이므로 main에 v2를 신규 기록한다. 기존 source authority, 캐릭터 Bible, Reader Runtime/DB/Commerce 계약을 대체하지 않는다.
>
> 상태: **I18N-01~03 완료; I18N-04~06 승인·원천 준비도에 따른 분리 진행; I18N-07 후행**.
>
> Track 범위: 웹/모바일 UI의 `ko-KR`, `ja-JP`, `zh-TW` 및 승인된 범위의 공식 사주·관상 표현, Reader의 동일 캐릭터 정체성을 보존하는 다국어 화법. 중국어 간체 `zh-CN`, 다국어 출생시간대/역법/해외 결제, 50개 언어 출시는 **현 범위 밖**이다.

## 0. 불변 사항과 명확히 분리할 책임

1. 사용자 명시적 UI 선택이 없으면 `ko-KR`; `Accept-Language` 및 기존 `profile.locale`로 외국어를 자동 선택하지 않는다. `X-MyeongHa-UI-Locale`는 **표시 선호 입력**이지 Reader 응답·공식 풀이 언어 허가가 아니다. 기준 문서: `docs/FRONTEND_INTEGRATION_KOREAN_FIRST_UI_REQUEST_LOCALE_CONTRACT_V1_20261021.md`.
2. `gycha0109-beep/Saju` 및 source-owned Claim/Reading/사주 해석 권위와 관상 source-owned 판정·해석 권위를 변경하지 않는다. **공식 Reading은 Reader와 독립적인 결과**이며 Reader는 허용된 source 결과를 해설하는 표현 주체이지 공식 사주·관상 판정 생성자가 아니다.
3. Reader의 canonical Character ID, 공통 바이블·성격·가치관·관계/기억/권한, source grounding, 구매/Grant, session/thread, idempotency, disclosure/limitation 및 원문 보존은 locale과 독립적으로 유지한다.
4. 이전 한국어 공식 Reading, 이전 대화 메시지, 구매 기록을 UI 언어 선택만으로 번역·덮어쓰기·재발급하지 않는다. 새 언어로 말한 내용은 새로운 명리/관상 주장이 될 수 없다.
5. 캐릭터 임시 이름은 승인된 한국어 한글, 일본어 가타카나, 대만 번체의 로마자 표기 정책을 유지한다. 무단 한자·고유명 확정 금지.
6. 실제 source/provider/semantic admission이 없는 다국어 공식 Reading 또는 운영하지 않는 관상 분석을 지원 완료로 표시하지 않는다. 지원하지 않는 locale/캐릭터/제품은 명시적 HOLD/미지원 처리한다.
7. 작업 귀속 CI만 중단 판단에 사용한다. 현재 세션의 커밋·PR과 직접 연결된 통합 CI에서 결과에 의존하는 후속 단계만 남았다면 재조회 없이 중단한다. 다른 트랙/main CI는 중단 사유가 아니다. 브랜치·PR: `frontend-integration`, `Watchtower-Track: frontend-integration`. 원문 정책·운영 규칙 우선.

## 1. 확인된 구현 상태 (과거 스냅샷과 분리)

| 작업 | 현재 결정 | 근거 |
|---|---|---|
| 기초 UI 다국어/캐릭터 표기/사주 명식 표시 | 완료 | #2368, #2373, #2400, #2401, #2403 |
| I18N-01 기록 이름·시각 변경, 원문 보존 | 완료 | PR #2406, 운영 READY |
| I18N-02 UI authored 문구/상태/오류 처리 | 완료 | PR #2409, #2412, #2415, #2419 (마지막 PR merged 2026-10-21) |
| I18N-03 웹→API 선택 로케일 전달·검증 | 완료 | PR #2424, merge `50dae2c96616f89c5403b9c8c5d574eb35cfdc88`, 한국어 우선 ingress |
| I18N-04 공식 사주 JA/ZH-TW 표현 | **source 준비도 종속 / 출력 미승인** | 템플릿 선택기만 존재 (`packages/domain/src/claim-narrative-locale-v1.ts`) |
| I18N-05 공식 관상 JA/ZH-TW 표현 | **Face source 운영 준비도 종속 / 출력 미승인** | 실제 Face provider/admission 필요 |
| I18N-06 Reader AI JA/ZH-TW 자연어 응답 | **설계 방향 승인 / 구현·개별 화법 승인 대기** | `apps/api/src/seyeon-character-runtime-v2.ts`의 한국어 존댓말 출력 지시 |
| I18N-07 통합·배포 | 후행 | 지원 승인된 기능만 수용 |

상태 갱신 시 PR, main, CI, production SHA를 신규 근거로 삼되 위 완료 작업을 재수행하지 않는다. 다른 트랙의 새 main 커밋을 덮어쓰지 않는다.

## 2. 사용자 승인 기록과 미확정 항목 (2026-10-22)

**승인된 구현 방향**
- **승인 ①:** 공식 사주·관상의 현지어 명리/관상 용어집 및 의미 보존 기준을 수립하고 source-owned 표현 템플릿·검수 체계를 준비. 이것은 특정 미작성 용어/템플릿을 정답으로 승인하거나 출시 허가한 것이 아니다.
- **승인 ③:** Reader의 언어별 자연스러운 화법 및 출력 보호장치를 설계·구현. **공통 캐릭터 바이블 1개 + 언어 공통 화법 규칙 + 캐릭터×로케일 예외/상황 규칙** 구조를 채택. 모든 캐릭터/언어의 실제 표현이나 공개를 일괄 승인한 것은 아니다.
- 사용자 기존 결정: 한국어 기본, 사용자 명시 선택만 `ja-JP`/`zh-TW`, 원본 대화·Reading 보존.

**보류/추가 source 승인 필요**
- **보류 ②:** 이미 저장된 공식 Reading을 다른 언어로 재열람할 때 같은 source 근거로 재표현할지, 버전된 별도 artifact를 만들지, 또는 원문만 유지할지. UI 언어 선택만으로 기존 Reading을 재생성하지 않는다.
- **Source 승인 대기:** Saju/Face owner의 실제 다국어 ClaimNarrativeProfile·FaceNarrativeProfile, ClaimType/semanticKey/templateKey, 용어집·불확실성/출처·의미 동등성 검수, production admission.
- **Reader 구체 화법 결정 대기:** 각 캐릭터의 일본어 1인칭·호칭·경어 및 번체 화법의 실제 값, 관계/격식 전환 조건. 예시 `태겸=俺`, `윤호=僕`, `세연=あたし`는 설명용 **미승인 예시**이며 캐릭터 설정에 쓰지 않는다.
- 기존 대화 원문 보존은 유지하되, 선택 언어를 바꾼 뒤 **새로 생성하는 턴**과 진행 중 요청에 적용할 로케일 고정·재시도 정책은 I18N-06에서 기존 API 계약 안에서 좁게 결정한다. 과거 메시지 자동 번역/재작성은 금지.
- `zh-CN` 추가, 새로운 국가/언어 50개 확대, 프로필 locale 동기화, 국가별 해외 상거래/역법은 추가 사용자 범위 결정 전 HOLD.

## 3. I18N-04 — 공식 사주 출력 (Saju bridge와 책임 분리)

**Source/Saju bridge 책임:** Canonical 사주 계산, T5/T8/기타 승인된 interpretation claim·근거, 정식 ProductReadingResponse, provenance/semantic validity, product readiness 및 공개 계약.

**이 트랙의 책임:** 이미 source-owned 승인된 구조화 의미/프로필을 받아 `ko-KR`/`ja-JP`/`zh-TW` 표현을 표시·선택하는 경계만 연결. ClaimType·RuleId·semanticKey 매핑, 공식 용어집과 렌더러 결합은 **Source의 실제 계약이 준비된 뒤** 적용. 같은 사주 엔진을 언어 수만큼 복제하지 않는다.

작업 순서:
1. Saju 측 실제 승인된 claim + provenance + template/renderer availability와 공식 Reading 저장/재열람 경계를 확인한다.
2. Source-owned 명리 용어집/표현 자산과 이 트랙의 표시 경계를 연결한다. 템플릿은 판단 권한이 아니다. LLM을 사용할 경우에도 확정된 의미를 현지어로 표현하는 범위만 허용하고 새로운 주장 생성 불가.
3. locale에 맞는 source 결과·semantic admission이 없으면 명시적 unavailable/HOLD. 한국어를 외국어 공식 풀이로 오인시키지 않는다.
4. 이전 공식 Reading의 언어 재열람은 **보류 ② 승인 이전에는 구현·출시하지 않는다**.

완료 기준: 실제 source 승인된 locale에서만 공식 읽기 결과가 나오고, 동일 Claim/grounding, epistemic qualifier, limitation, method attribution, entitlement이 유지됨. source 미준비 시 배포 미지원이 정상 동작.

## 4. I18N-05 — 공식 관상 출력 (Face source 준비도 종속)

Face provider/production admission과 source-owned FaceNarrativeProfile·semanticKey·현지어 범위/주의 문구/용어집이 준비된 뒤, 승인된 표현만 연결한다. 엔진 제공 전 사진 준비 UI를 공식 분석 가동으로 표시하지 않는다. 준비 전 HOLD; Reader 화법 구현이 Face source 판정 권위를 대체하지 않는다.

## 5. I18N-06 — Reader AI 다국어 화법 시스템 (핵심 수정)

### 5.1 목표와 비목표

목표: 캐릭터가 언어를 바꿔도 **같은 인물**로 들리도록, 공통 바이블을 복제하지 않고 표현 규칙을 조합한다. 3개 현행 UI locale을 대상으로 구현하고 향후 언어 추가 시 구조를 재사용 가능하게 한다.

비목표: 50개 언어/국가의 지원 선언, 캐릭터당 국가별 바이블 전량 작성, LLM에 캐릭터 판단/사주 claim/메모리/관계/권한 수정 권한 부여, 미승인 캐릭터 공개, Saju/Face renderer 대체.

### 5.2 런타임 구성 — 단일 바이블 + 계층형 화법 프로필

```text
canonical Character Bible + approved relationship/context + allowed Saju/Face grounding
  + request locale (explicit ko-KR / ja-JP / zh-TW; Korean-first)
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
2. **I18N-06b — 공통 locale 화법 규칙:** 일본어 경어·1/2인칭·상황별 정중도, 번체 중국어 호칭/지역어/상담 스타일의 *공통* 규칙을 작성. 국가=언어로 가정하지 않으며 이 작업에서 `zh-CN`을 추가하지 않는다.
3. **I18N-06c — character×locale delta:** 기존 바이블을 참조하는 작은 설정만 작성. `characterId`, `locale`, `profileVersion`, `selfReference`, `addresseeStyle`, `politenessRegister`, `sentenceEnding`, `contextConditions`, `prohibitedStyle` 등 필요한 범위의 **선언적 스키마**를 설계. 값과 변동 조건을 승인하지 않은 캐릭터는 임의로 채우지 않고 HOLD. 예: 일본어의 `俺`/`僕`/`あたし`는 단순 한국어 `나` 번역이 아니라 캐릭터별·상황별 선택 대상.
4. **I18N-06d — 합성/guard:** 생성기에게 선택 언어의 voice conventions + 해당 캐릭터 delta만 전달하되 canonical Bible, Reading source refs/claim scope, persona, 관계/기억, 행동·민감 정책 우선. 최종 Output Guard에서 language/script 일탈, persona/style 위반, 잘못된 1인칭/호칭/격식, 언어 섞임, 새로운 명리 확정 주장, qualifier/disclosure 누락, 권한 밖 정보와 원본 오염을 거부 또는 보호된 fallback. LLM 자체를 유일한 guard로 간주하지 않는다.
5. **I18N-06e — 제한 수용/출시:** 우선 실제 지원·승인된 캐릭터×locale에 한해 language switch → 새 턴 → retry/idempotency → 원문 기록 재열람 → protected fallback을 수용. 웹/모바일 UI locale과 실제 Reader 출력 locale 간 불일치를 사용자에게 은폐하지 않는다. 지원 밖 캐릭터·locale에 자동 확장 금지.

### 5.3 확장성 원칙

기본 자산은 **캐릭터별 공통 바이블 C개 + 언어 공통 규칙 L개 + 필요한 캐릭터×locale 예외 E개**이다. 목표는 전체 `C×L` 바이블 복제가 아닌 `C+L+E` 관리이다. 예외가 많아지면 `E`도 커질 수 있으며 무검수 50개 언어 완벽 지원을 보증하지 않는다. 지역 차이는 locale 별 차이로 명시하고 기존 지원 범위 밖은 미지원 처리한다.

### 5.4 Reader 완료 게이트

- canonical Character ID/persona/관계·메모리·허용 source grounding/entitlement 불변.
- 지원된 캐릭터×locale에서 승인한 인칭·호칭·경어·말투가 문맥별 일관되게 유지; 같은 캐릭터의 다른 언어는 성격 동일, 다른 캐릭터 간 구별 유지.
- 사주/관상 claim·원문·출처/불확실성 의미 강화/누락 0; 과거 저장된 한국어 발화 재작성 0.
- unsupported 또는 unapproved voice profile에서 임의 외국어 공개 0; guard 실패 시 fail-closed.
- 웹/모바일·서버 locale 요청의 허용 범위가 실제 사용 가능 캐릭터/feature별로 일치.

## 6. I18N-07 — 통합 수용·배포

I18N-04/05/06 중 source 승인·운영 준비도·캐릭터×locale 화법 승인·의미/Output Guard가 충족된 **부분 집합만** 수용한다. 전 기능 일괄 출시를 기다리거나 미지원 범위를 완료로 포장하지 않는다.

1. KO/JA/ZH-TW 명시 선택, reload, 동일 session/thread, 새 응답, 기록 재열람, 오류/거부, locale 변경 중 in-flight/재시도 경계.
2. 캐릭터 정체성·상황별 1인칭/경어·말투 정합성, source-grounding/claim/qualifier, Reading/DB/Commerce 권한, 원문 보존 회귀.
3. Source readiness/HOLD와 Reader 지원 상태를 UI에 분리 표시. 미구현 언어 공식 풀이를 공식 지원으로 표시하지 않는다.
4. 정확한 CI 귀속·production SHA 확인 뒤 승인된 subset만 공개; 원래 운영 feature flags·release authority 유지.

## 7. 다음 실제 구현 순서와 중단 조건

1. 현재 main의 `apps/api/src/seyeon-character-runtime-v2.ts`, Character Bible 읽기 계약, output/semantic guard 및 요청 locale 입력 지점을 기준으로 **I18N-06a**에 필요한 좁은 interface 경계를 구현한다. **비한국어 출력 공개는 하지 않는다.**
2. **I18N-06b** 공통 로케일 규칙·최소 스키마 작성; **I18N-06c** 캐릭터별 실제 항목은 승인된 값만 기록하고 미승인은 HOLD. 기존 KO character persona 변경 금지.
3. 승인된 샘플 캐릭터×로케일만 **I18N-06d/e** 합성·guard 및 수용. 승인 없으면 출력 활성화 없이 인프라까지만 진행.
4. I18N-04는 Saju source 준비도, I18N-05는 Face source 준비도 확보 시 병렬 진행. 공식 Reading의 이전 artifact 재언어화는 ② 보류 해제 후에만 착수.
5. I18N-07은 실제 허가된 경로만 통합·배포.

PR 별 범위는 최소화한다. CI가 시작되었다는 사실만으로 unrelated 작업을 중단하지 않지만, **현재 작업 PR에 귀속된 CI가 다음 필수 단계인 경우** 결과를 반복 조회하지 않고 세션을 중단한다. 실행 완료 보고는 각각 한 줄: **한 것 / 남은 것 / 다음에 할 것 / 블로커 및 승인사항**.
