# 명하 전체 다국어화 연속 작업 로드맵 v1 — 2026-10-21

> Track Key: `frontend-integration`
>
> 범위: 웹/모바일 UI 및 사용자가 보는 사주·관상·Reader 결과를 `ko-KR`, `ja-JP`, `zh-TW`로 일관되게 제공.
>
> 상태: **신규 연속 작업 로드맵**. 기존 아키텍처의 새로운 authority가 아니며, 사주/관상 엔진·구매 권한·캐릭터 정책을 재정의하지 않는다.
>
> 기준: 2026-10-21 현재 GitHub 확인. 후속 세션에서 항상 최신 `main`/PR/CI를 조회해 상태를 갱신한다.

## 1. 변하지 않는 운영·제품 결정

- 사용자 승인 임시 이름 정책: 한국어 정식 한글명, **일본어 가타카나**, **대만 번체 중국어 로마자(영문)**. 한자를 임의 확정하지 않는다. Canonical Character ID는 언어와 무관하게 유지.
- 사주 계산·명리학적 해석 권위는 `gycha0109-beep/Saju` 및 승인된 source-owned Reading/Claim에 있다. 명하는 사용자 경험·Reader·구매·기록·권한 연결을 담당한다.
- 관상 측정/판정/해석의 권위는 관상 source-owned 계약. 웹 관상 사진 준비 UI를 분석 결과가 실제 서비스 제공 중인 것처럼 취급하지 않는다.
- `ClaimNarrativeProfile`과 `FaceNarrativeProfile`의 언어별 템플릿은 **판단 생성 권한이 아닌 표현 계층**이다. 기존 주장, 불확실성, limitation, method attribution, semanticKey/provenance를 그대로 보존한다.
- Reader의 개성은 선택·순서·말투에만 관여한다. 권한 밖 Reading 조회, 새로운 사주/관상 주장, 관계/메모리/결제 권한 승격 금지.
- 사용자·Reader 대화 원문, 과거 공식 Reading 원문, 결제 기록을 단순 UI 번역으로 덮어쓰거나 기존 완료 이력을 새 언어의 공식 보고서라고 주장하지 않는다.
- `Accept-Language` 전송은 이미 존재하나 **서버가 선택 언어로 답변한다는 계약이 아님**. API/Runtime의 실제 수용·우선순위·검증은 별도 작업.
- 사용자가 지시한 운영 규칙: 검증을 위한 검증 금지, 외부 문의 금지, 새 작업 발명 금지, Work 모드 금지, 이미지 생성 금지. **해당 트랙의 통합 CI가 실행되면 즉시 세션을 중단하고 상태 보고**.
- Watchtower는 브랜치명에 `frontend-integration`, PR 본문과 주요 커밋에 `Watchtower-Track: frontend-integration`를 사용. 기존 공통 CI 사용, 전용 workflow 남발 금지.

## 2. 확인된 구현 현황 및 증거

| 상태 | 범위 | 근거 |
|---|---|---|
| 완료·병합 | 한국어/일본어/번체 중국어 고정 UI, pre-paint 언어 적용, 오류문구 및 오늘의 운세 | PR #2368, #2373 |
| 완료·병합 | 캐릭터 임시 표기, Reader/채팅 화면 공통 명칭, 언어 헤더 및 ClaimNarrativeProfile *선택기(출력 공개 승인 아님)* | PR #2400 |
| 완료·병합 | 사주 계산 명식의 년·월·일·시주/오행/음양/미확정 상태의 언어별 **표시** | PR #2401 |
| 완료·병합 | 관상 Reader 선택창 및 공식 기록의 Reader 이름 언어별 표시 | PR #2403 |
| 완료·병합·운영 READY | 채팅 기록 발신자 이름·시각을 언어 변경 시 재표시; 메시지 본문 보존 | **PR #2406**, merge `2f61559bf842adfdf98f054760e1145421f7b92c` |
| 미완료 | 생성형 Reader 대화의 JA/ZH-TW 응답, 공식 사주·관상 해석문의 JA/ZH-TW, 글로벌 출생 계산 지원 | 구현 완료 증거 없음; 별도 게이트 |

주의: 위 표는 문서 갱신 시점의 스냅샷이다. PR #2406은 **GitHub merged 및 Vercel production READY 확인됨**. 새 세션은 최신 상태를 확인하되 이미 완료된 PR을 다시 병합하지 않는다.

## 3. 실행 순서 — 선행 조건이 충족된 항목만

### I18N-01 — 대화 기록 이름·시각 언어 전환 (완료 / 재작업 금지)

1. PR #2406이 여전히 OPEN인지, 현재 HEAD와 통합 CI `success`가 동일한 SHA인지 확인한다.
2. PASS이고 mergeable이면 저장소 관례에 따라 squash merge한다. 실패/HEAD 변경/충돌 시 실제 원인만 처리한다.
3. 병합 커밋과 Vercel production `READY`·실제 Git SHA·alias를 확인한다. 다른 개발 트랙의 최신 main 변경을 덮어쓰지 않는다.
4. 결론: 기존 대화 메시지의 본문은 그대로이고 이름·시각만 언어 전환에 반응한다. **챗봇이 다국어로 응답한다고 보고하지 않는다.**

**실제 결과:** PR #2406 merged (commit `2f61559bf842adfdf98f054760e1145421f7b92c`), 본 HEAD의 통합 CI PASS, Vercel production `dpl_CrMqbsHuzuXvc2SL3zAJ2piBJMqK` READY. 다음 단계 I18N-02로 이동. 다시 병합하거나 재실행하지 않는다.

### I18N-02 — 남은 정적·동적 UI 표현 정리 (승인 없이 가능한 범위)

1. `apps/web/reading-character.js`, `records-page.js`, `face-reading-shell.js`, `chat-runtime-client.js`의 **UI가 작성한 안내·상태·버튼·메타 텍스트만** 대상 언어로 표시한다. 실제 공식 해석문의 `step.primary`, `step.structure`, `step.supporting`, 저장된 원본 Reading/채팅 `bodyText`는 번역하지 않는다.
2. `ui-i18n.js` 및 `apps/mobile/src/ui/mobile-ui-copy.ts`의 공유 번역 계약을 유지한다. 중복 사전·모바일 불일치가 발생하지 않도록 변경 범위만 확인한다.
3. 캐릭터 이름은 공통 `character-display-locale.js`와 `reader-provenance-locale.js`를 사용하며 정식 한자·영문 이름을 새로 만들어내지 않는다.
4. 해당 변경의 좁은 단위 테스트·실제 화면 회귀만 추가한다. 인증/결제/사주 판정 범위는 수정하지 않는다.

**완료 기준:** 화면 전환, 기록 열기, 오류/불완전/미지원 상태에서 한국어 UI 누출 없음. 공식 원문은 그대로. 미번역 서버-origin 텍스트는 미완료로 명시.

### I18N-03 — API/서버 언어 설정 전달의 실계약

1. 현재 웹 로케일 보관, `profiles.locale`, 헤더 `Accept-Language`, API ingress, 실제 Reading·Reader 출력 경로를 연결도 형태로 대조한다.
2. `ko-KR`/`ja-JP`/`zh-TW`만 인정할 검증 및 언어 선택·회원 설정·서버/게스트 기본값 우선순위를 **설계한 뒤** 필요한 최소 변경을 한다.
3. 이 단계에서는 locale 때문에 엔진 계산, subject, Reader, entitlement, 스레드/메시지 ID, retry/idempotency 동작을 변경하지 않는다.
4. 언어 변경 시 진행 중 작업과 과거 저장 결과의 처리 정책이 불명확하면 **사용자에게 선택지를 제시하여 승인받는다**. 임의로 기존 텍스트 재번역하거나 locale을 권한 근거로 사용하지 않는다.

**완료 기준:** 실제 런타임까지 전달·검증되는 언어 계약을 테스트로 확인. `Accept-Language` 단순 존재를 지원 완료로 과장하지 않음.

### I18N-04 — 공식 사주 해석 JA/ZH-TW 출력 (source-owner 전제)

1. `Saju` 측 승인된 Claim/Interpretation/Reading 템플릿·semanticKey·disclosure 자료를 확인한다. `packages/domain/src/claim-narrative-locale-v1.ts`의 선택기는 **템플릿 선택만 가능**하며 실제 보고서 출력을 허가하지 않는다.
2. source-owner가 확정한 `ClaimNarrativeProfile` + 언어별 `templateKey` + limitation/attribution + 승인된 용어집을 기준으로 문장 렌더링 경계 연결.
3. 선택한 locale의 템플릿 또는 semantic preservation admission이 없으면 **미지원/보류**로 처리한다. 임의 LLM 번역, 한국어를 현지어 공식 해석으로 위장, 시간/결론/확실성 강화 금지.
4. Reading의 구매·접근 권한, 동일 interpretation signature, 원래 기록·source refs 및 캐릭터 간 같은 사실 보존.

**게이트/승인:** 공식 일본어/번체 중국어 명리 용어·용어집 및 source-owned 템플릿/동등 의미 검수 필요. Saju repository의 준비가 안 되어 있으면 BLOCKED로 남김.

### I18N-05 — 공식 관상 결과 JA/ZH-TW 출력 (source-owner와 서비스 준비도 전제)

1. 관상 엔진의 실제 서비스 공개/판정 및 `FaceNarrativeProfile` 언어별 템플릿 준비 상태 확인.
2. source-owned semanticKey / bounded claim scope / template language / required scope phrase의 표현 계층만 연결. 사진 준비 UI를 관상 분석 가동으로 오인하게 만들지 않는다.
3. source 범위가 비어 있거나 provider/semantic admission이 없으면 명시적 HOLD.

**게이트/승인:** 관상 source·템플릿의 production admission과 현지어 용어 검수. 승인 전에는 분석 제공 상태를 바꾸지 않음.

### I18N-06 — Reader AI 다국어 응답 (별도 언어·화법 게이트)

1. 현재 `apps/api/src/seyeon-character-runtime-v2.ts` 렌더러에는 **Korean honorific 출력 지시가 하드코딩**되어 있다. 한국어 고정 규칙을 임의로 치환하지 말고, source-bound 런타임 인터페이스·semantic reviewer·최종 Output Guard를 함께 설계.
2. 승인된 범위부터 캐릭터별 화법을 JA/ZH-TW로 표현하며, persona/관계/기억/리딩 접근·출처·제한은 언어와 무관하게 동일하게 강제.
3. 언어 변경 시 대화 재시도·idempotency 및 기존 대화 기록 언어 정책을 확정. 번역된 발화가 새로운 Reading claim이 되지 않도록 guard.
4. 허용된 캐릭터/세션만 단계적으로 배포. 다른 Reader의 채팅 활성화나 제품 권한 개방과 혼동 금지.

**게이트/승인:** 캐릭터별 현지어 높임말·호칭·말투 및 언어 변경 시 이전 기록 취급 정책, 서버 semantic guard 준비. 승인 없이 전 캐릭터 활성화 금지.

### I18N-07 — 통합 수용 및 배포 (위 게이트를 통과한 범위만)

- 실제 배포된 지원 기능만 KO/JA/ZH-TW 언어 선택/리로드/동일 세션/기록 재열람/오류 경로에서 좁게 회귀.
- 동일 계산·해석 출처, 결과의 의미·불확실성·소유자 경계, 구매 권한, 다국어 캐릭터 이름, 모바일/웹 번역 동기화 확인.
- 미구현 공식 보고서나 AI 출력은 지원 완료라고 표시하지 않음. 사용자 승인 없이 해외 출생 시간대·역법·해외 상거래 기능을 이 범위에 끼워 넣지 않음.

## 4. 승인이 필요한 결정과 미해결 의존성

1. **공식 명리·관상 용어집**의 일본어/번체 중국어 대응과 검수 주체. 간지(甲子 등) 표기와 원뜻은 임의 수정 금지.
2. **저장된 공식 해석의 타 언어 재열람 정책**: 동일 source에서 새 언어 렌더를 허용하는지, 별도 버전된 artifact가 필요한지, 불가 시 어떤 안내를 할지.
3. **Reader 언어별 화법**: 일어 호칭·존경어, 번체 중국어의 말투, 원 캐릭터 성격과 금지선, 출력 guard의 검수 기준.
4. **서버 언어 우선순위**: 회원 프로필 설정/게스트 브라우저 선택/`Accept-Language` 중 무엇을 우선할지. 실제 계약 미확정이면 서버 변경 전 중단하고 제안.
5. **엔진 별 production readiness**: Source 템플릿/Face provider/semantics 미확정 시 기능을 잠금, 지금 활성화하지 않음.
6. **해외 출생시간·역법·국가 상거래 정책**은 다국어 UI와 별개; 명시적 지시 전 포함하지 않는다.

## 5. 다음 세션의 실제 시작점

1. **먼저** GitHub `main`, PR #2406 open/merged 상태, HEAD 기반 CI, Vercel 배포를 조회한다. 이 문서와 실상 불일치 시 최신 사실로 갱신하되 별도 트랙에 침범하지 않는다.
2. **I18N-01은 완료**되었으므로 PR #2406의 재병합·재배포를 수행하지 않는다. 이미 완료된 동작을 유지한다.
3. 실제 다음 구현은 **I18N-02**부터 진행. 출처 문장은 변경하지 않고 UI authored copy만 처리한다. 성급히 I18N-04/05/06을 진행하지 않는다.
4. PR마다 `frontend-integration` 키를 고정. **해당 트랙 통합 CI가 시작되는 순간 실제 작업을 중단하고 상태 보고**; 다음 사용자 지시를 받으면 재개.
5. 완료 보고는 각각 정확히 1줄: **한 것 / 남은 것 / 다음에 할 것 / 블로커 및 승인사항**. 추상 단계명만 읽는 사람이 알아들을 수 없는 보고 금지.

## 6. 참고 권위 문서

- `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md` — ClaimNarrativeProfile / semantic preservation.
- `MyeongHa_Saju_Product_Interpretation_Architecture_v1.2_FINAL_REVIEWED(1).md` — Saju vs MyeongHa 소유 경계.
- `MyeongHa_Face_Reading_Engine_Architecture_v0.3_THIRD_REVIEWED(1).md` — FaceNarrativeProfile / semantic authority.
- `MyeongHa_Character_Saju_Rendering_Architecture_v1.1_REVIEWED(1).docx` — Reader rendering / meaning preservation.
- `MyeongHa_UX_Reading_Reader_Knowledge_Spec_v1.1(1).md` — Reading 구매/기록/Reader Knowledge isolation.
- `GitHub_Actions_CI_Watchtower_운영_규칙(1).md` — CI 귀속 및 즉시 중단 규칙.
