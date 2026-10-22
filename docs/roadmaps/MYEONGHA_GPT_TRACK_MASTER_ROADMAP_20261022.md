# 명하 GPT 14개 트랙 — 통합 실행 로드맵 (2026-10-22)

> **성격:** 기존 실행 로드맵의 상호 의존성과 GPT 대화방별 인수 범위를 맞추는 **총괄 진행표**. Source/semantic/Character Bible/DB/Privacy/Commerce/Release의 승인 문서가 아니다.
>
> **기준 코드:** MyeongHa \`main@9d94a753a6cb4c57f69f6f712ceec546a233e863\`, Saju \`main@df35ecf42fd809343a885141a832469ed5512aab\`. 이 SHA는 문서 작성 기준이지 최신 배포·운영 증빙이 아니다.
>
> **우선 적용 규칙:** 실제 현재 작업 상태는 각 트랙의 최신 \`main\`·개별 PR·소유자 문서가 우선한다. 이 표의 대화방 제목이나 숫자로 새 기능의 권한/완료/독립 개발 소유권을 만들지 않는다. 기존 상충 PR의 내용은 병합 전에 reconcile한다.
>
> **범위:** 기존 구현·PR 보존, 문서/인계 로드맵만 동기화. GPT 채팅방 자체 변경·삭제·이관, 런타임/마이그레이션/실서비스/LLM 사용료 변경은 포함하지 않는다.

## 1. 제품 종료 목표와 고정 계약

이미 선택·구현된 UX 분기를 다시 결정하지 않는다.

1. **구매 직후 요약:** 선택 Reader가 승인된 Official Reading에서 핵심을 짧게 전달.
2. **Reader 후속 대화:** Reader는 정확히 허용된 사용자 Official Reading과 사용자가 동의한 관계·기억 맥락을 활용하여 대화. 일반 대화·고민 상담에 매번 사주 RAG 답변을 강요하지 않음.
3. **기록:** Official Reading의 장문 보고서를 저장·재조회. 동일 Reading을 Reader마다 새 공식 해석으로 복제하지 않음.

고정 경계: **사주의 의미 = Saju**, **공식 원본·접근권한 = MyeongHa DB/Product**, **캐릭터의 전달·대화 = Reader Runtime/Character**, **안전·공개 = Security/Operations**. Reader는 새로운 명리 결론을 만들지 않으며, 자유 재서술 확대는 기존 Semantic Guard/권한 정책의 명시적 변경 없이 실시하지 않는다.

- 기존 제품 근거: [Reader Knowledge 제품 사양](../MyeongHa_UX_Reading_Reader_Knowledge_Spec_v1.1.md), [Master Specification Index](../MASTER_SPEC_INDEX.md).
- **사주 트랙의 전체 종료 목표는 12개 화면 메뉴**. 원국 5개 natal만 완성하면 완료가 아니다: [Saju 실행 로드맵](https://github.com/gycha0109-beep/Saju/blob/main/docs/ROADMAP.md).
- Saju의 5개 natal \`detailed\` **표현 기반 동결**과 **Production interpretation authority 충족**은 별개다: [SA-6X](https://github.com/gycha0109-beep/Saju/blob/main/docs/implementation/sa6x-official-reading-detailed-product-completion-freeze-v1.md), [운영 권한 감사](https://github.com/gycha0109-beep/Saju/blob/main/docs/product/22-production-interpretation-authority-audit.md).

## 2. GPT 대화방 14개와 실제 작업 소유권 대응

화면에 표시된 순서/이름을 그대로 사용한다. 제목 끝의 숫자는 **GPT 대화방 식별용 표시로만 취급**한다. 동일 주제의 대화방이 둘이라고 별도의 semantic owner나 데이터 권한을 생성하지 않는다.

| GPT 대화방 표시명 | 기존 소스·실행 트랙 | 맡길 일 / 현재 인수 기준 | 아직 확정하거나 대신하지 않는 것 |
| --- | --- | --- | --- |
| **사주 엔진 23** | \`gycha0109-beep/Saju\`, [12메뉴 로드맵](https://github.com/gycha0109-beep/Saju/blob/main/docs/ROADMAP.md) | A 원국 5분야의 실질적인 명식별 풀이와 B 시기·C 관계·D 질문형 병렬 수직 개발, E 다국어 표현 인터페이스 인수 | 해석 품질·Production 승격을 Preview UI/CI 성공으로 선언하지 않음 |
| **사주 연구 23** | Saju 기존 Research/Methodology·provenance | 개별 메뉴에서 정말 필요한 T8/T9/T10/T11 근거·불확실성·방법론 누락을 Source Owner 경로로 보강; 엔진 작업을 전체 대기시키지 않음 | 새로운 병렬 명리 권위 신설 금지 |
| **사주 해석 분석** | Saju의 ProductReading 품질 점검·Saju 엔진 인수 | 5 natal/12 메뉴의 **실제 해석 내용**(원국 특이성, 복수 근거, 중복 설명, 시간 조건, 읽을 가치) 평가 → 구체적 Saju 엔진/Research 보완 항목으로 전달 | 보고서의 부족한 의미를 Character/LLM이 독자 보강하도록 승인하지 않음; 이 제목 자체는 현재 저장소의 별도 canonical 트랙이 아님 |
| **상품 제작 및 결제 13** | MyeongHa \`commerce\` / \`commerce-payment\` / \`db-authority-core\`, [유료 Reader S0–S8](../architecture/OFFICIAL_READER_PAID_CHAT_INTEGRATION_ROADMAP_20261012_V1.md) | 승인된 상품·Charge Terms → PortOne V2 확인 → Receipt/Grant/Reader 결속 → 환불·회수 → Records 재진입; DB의 S2/S4/S5 인계 조건을 공동 관리 | Product/PSP 결정과 실제 유료 판매 활성화는 다름; [P0-CM-03](../P0_DECISION_REGISTER.md)은 활성화 OPEN |
| **사주 브릿지 27** | \`saju-bridge\`, [8C-2B-2D 로드맵](../SAJU_HELD_STAGING_COMPLETION_ROADMAP_8C2B2D.md) | 기존 Auth/Subject/Birth → Saju Calculation/Preview/Official 원본 인계·Response contract/출처/버전 보존, 명하 Records/Reader와의 통합 | Preview를 Official로 승격 금지; 기존 V2 경로와 중단된 S3A 신규 DB 역할 프로브 혼합 금지 |
| **명하 영상 제작 정리** | 별도 마케팅/콘텐츠 대화방; 현재 두 저장소의 구현 소유자 근거 없음 | 캐릭터·화면·사주 해설의 **승인된 공개 상태**에 부합하는 영상 소재/표현을 관리할 수 있음. 실제 작업 로드맵·승인자는 별도 인계 필요 | 현재 PR/기능 완료·영상 제작 완료를 이 문서로 주장하거나 코드 트랙으로 편입하지 않음 |
| **캐릭터 설계 4** | \`topic-character\` / \`packages/character-content\`, [캐릭터 Runtime](../AI_CHARACTER_RUNTIME_SPEC.md) | 발행된 Bible/voice/관계 authority를 유지하고 Reader별 표현 차이·콘텐츠 버전/roster 인수 | 최초 6인 출시 제안 [#2115](https://github.com/gycha0109-beep/MyeongHa/pull/2115) OPEN. 전체 9인 컨셉 삭제·6인 운영 배포 완료 추정 금지 |
| **다국어화 2** | \`frontend-integration\`, [I18N v2 PR #2430](https://github.com/gycha0109-beep/MyeongHa/pull/2430) | 화면 언어와 Saju 의미·Reader 화법의 소유권 분리, KO 기준과 JA/ZH-TW Reader voice delta/guard 단계; #2431/#2432/#2435 병렬 계약 유지 | PR은 OPEN. 비한국어 Reader 공식 해설의 운영 활성화 및 미승인 캐릭터 번역 화법 금지 |
| **Cloudflare 이관 2** | \`ops\` / \`security\`, [Ops 계획 #2381](https://github.com/gycha0109-beep/MyeongHa/pull/2381) | 기존 Auth/DB/요청 격리, Worker Router의 차단 경계·롤백·운영 인계. [#2384](https://github.com/gycha0109-beep/MyeongHa/pull/2384)·[#2420](https://github.com/gycha0109-beep/MyeongHa/pull/2420) Draft와 reconcile | Workers 설계/오프라인 코드 = 운영 전환 완료 아님. 새 비용·권한·운영 DB 변경 임의 실행 금지 |
| **챗봇 메모리 엔진 23** | \`character-memory\` / 세연 C07·C08, [비용·평가 로드맵](../character-memory-seyeon-cost-c07-evidence-closeout-and-c08-roadmap-v1.md) | 동의 기반 회상·관계 맥락, 기존 질문 분류/생성/의미검토 실모델 호출 구조와 C08 효율/자연스러움 확인; 공식 Reading을 Memory에 복제·재권위화하지 않음 | C08 Shadow 비교·합성 3회 Provider 경로를 운영 일반 Chat 완료로 오인 금지 |
| **AI 보안 20** | \`security\` + Character/Reader Output Guard | 사용자 질문의 복합 위험 신호, 프롬프트 인젝션·부적절 사주 단정·출처 오염 보호; Planner 의도 분류와 Security 허용판정 분리 | 위험/사주/일상을 네 가지 중 하나로만 나누는 단일 분류기 도입, 별도 4번째 LLM 호출 확정 금지 |
| **보안 4** | \`security\` / \`db-authority-core\`, [세연 G0–G6](../operations/SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V2_20261016.md) | original Grant→G1 Pin→G2 Commit→G3 공개/철회 동시성, DB Owner ACL·개인정보·DR. #2422/#2426/#2428 Draft 및 [#2434](https://github.com/gycha0109-beep/MyeongHa/pull/2434) OPEN | 다른 GPT 보안 대화와 권한 체계 중복 신설 금지. positive Production/public/paid HOLD 유지 |
| **사주 연구 22** | Saju 기존 Research, **사주 연구 23과 동일한 최종 Source Authority** | 별도 GPT 세션으로 유지하되 자신이 맡은 **현재 진행 중 연구 이슈·PR**을 명시하여 서로 중복 연구하지 않도록 인계. 정확한 세션별 작업 경계는 저장소 자료만으로 미확정 | 제목 숫자만으로 독립된 연구 코드/검토자/방법론 권위 추정 금지 |
| **앱화 18** | \`applizing\` / \`apps/mobile\`, [모바일 로드맵 #2327](https://github.com/gycha0109-beep/MyeongHa/pull/2327) | 기존 3갈래 Reading 흐름과 실제 Android API/기록/Reader 대화 UX, OAuth 및 시스템 인셋 이슈 | [OAuth #2209](https://github.com/gycha0109-beep/MyeongHa/issues/2209), [세연 Chat #2200](https://github.com/gycha0109-beep/MyeongHa/issues/2200) OPEN. 화면 연결만으로 유료 Reader 공개 금지 |

**보충:** 관상/Face는 기존 별도 Source/엔진 작업축을 유지한다. 첨부 14개 GPT 대화방에 관상이라는 이름이 없다는 이유로 기존 Face 트랙을 삭제하거나 사주 트랙에 병합하지 않는다.

## 3. 제품 흐름별 실행 책임 및 인수 순서

| 순서/결과 | Owner | 정확히 인수할 산출 | 의존·HOLD |
| --- | --- | --- | --- |
| **공식 사주 의미와 상세 보고서** | Saju 엔진/Research/해석 분석 | 기존 \`ProductReadingResponse\`·정식 근거·조건·부분지원과 \`detailed\` 적용 범위 | 12개 메뉴는 병렬. 5개 natal detailed 표현과 Production 권한은 별개 |
| **공식 Reading 전달·저장** | Saju Bridge → DB Authority | 현재 Subject/Birth 기반 source-admitted 응답, immutable ref/hash, Official/Preview 명시 | 운영 Saju 의미 권한/실서비스 origin·DB 반영·출처 인증 필수 |
| **요약·Scene** | Reader Runtime / Character → UX | 공식 의미를 새로 만들지 않는 짧은 전달, Reader의 승인 voice | Source/Reader/Product Grant 확인; 기존 분기 보존 |
| **후속 Reader 대화** | Reader Runtime / DB / Character Memory / Security | 기존 RR-01~15; RR-05 질문 scope, RR-03/04 official provenance/Anchor, RR-06/08 guarded 대화·연속성 | [RR 종료 로드맵](../architecture/READER_RUNTIME_V2_TRACK_CLOSEOUT_ROADMAP.md). RR-09/10 Commit, RR-11/12 HTTP·화면이 추후 인수 |
| **기록 재진입** | DB / UX·Mobile | 공식 Report 1개 + Reader별 접근·해설·동일 캐릭터 채팅방으로 연결 | S4 보호 원문 분리·동의 기억의 권한·환불 후 재주입 차단 |
| **구매/권한 수명주기** | Commerce / DB | S2 scope lock + verified Receipt→Grant→Reader Bind→Refund/Revocation; S5 최종 확정과 통합 | [#2299](https://github.com/gycha0109-beep/MyeongHa/pull/2299), [#2301](https://github.com/gycha0109-beep/MyeongHa/pull/2301) DRAFT, [Privacy #2318](https://github.com/gycha0109-beep/MyeongHa/issues/2318) OPEN |
| **서비스 공개** | Security/Ops/총괄 | 현재 권한, 개인정보 파기/복원, 배포 원본 SHA, 실제 E2E, 공개 플래그·롤백 | CI 녹색은 Production/Public/Sale 승인 아님 |

### Reader 대화의 기능 경계 (이번 논의 반영, *구현 승인 아님*)

- **질문 의미/대화 모드:** Reader의 기존 Scope/Planner가 \`사주 관련 질문 / 일반 대화 / 고민 상담 / 불명확\`을 구분할 책임. 상담은 가능성 검토 중인 UX/운영 방식이며 별도 제품 기능으로 확정하지 않는다.
- **위험/AI 공격/접근권한:** 독립적인 Security Signal과 서버 Gate로 판단. 사주 질문이면서 위험 신호가 있는 중첩 입력을 허용하는 다축 신호 모델로 취급.
- **공식 사주 조회:** 정식 Reading·Reader Grant·Source Unit·Disclosure를 서버에서 필요할 때만 선택. 일반 대화의 모든 턴에 문서 검색을 강요하지 않는다.
- **기억:** 사용자 발화, 개인 기억, 캐릭터 관계와 Official Saju를 서로 다른 출처로 유지. \`사용자가 사업을 못한다고 말함\`을 \`사주가 사업 실패를 확정함\`으로 승격 금지.
- **호출 비용:** 기존 세연 C08 다단계 Provider 흐름의 실제 코드/비용·정확도/Guard를 먼저 사용. **새 분류 전용 LLM 호출을 로드맵에 신설하지 않는다.** 3회→2회 감축도 현재 요구사항으로 확정하지 않는다.
- **안전한 출력:** 원본 semantic drift, 범위 초과, 권한 상실 시 제한/차단. 보수적 현재 재서술 금지 정책을 임의로 해제하지 않는다.

## 4. 지금부터 진행할 로드맵 작업 (기존 ID·작업 재사용)

1. **Saju 엔진·연구·해석 분석 병렬:** [Saju 12메뉴 A/B/C/D/E](https://github.com/gycha0109-beep/Saju/blob/main/docs/ROADMAP.md) 계속. 2026-10-22 열린 \`#267x\` 계열처럼 각 메뉴의 실제 한국어 본문/구조 근거/입력 연결의 구체적인 사용자 결과를 우선하며, 연구 후보를 Production으로 승격하지 않는다.
2. **Bridge·Reader 데이터 인수:** 기존 V2 제품 연결을 활용하여 승인된 Official Reading의 Source·hash·조건을 Reader/Records에 정확히 전달. RR-03/04/09~12의 DB 및 Reader 기술 경계를 그대로 사용하고 새 Writer/LLM 해석 엔진을 병렬 제작하지 않는다.
3. **Commerce·DB·Privacy:** [S0–S8](../architecture/OFFICIAL_READER_PAID_CHAT_INTEGRATION_ROADMAP_20261012_V1.md)의 S2/S4/S5와 기존 Draft를 reconcile. 판매가 아니라 **정확한 구매권에 귀속된 인수 가능한 결과**를 목표로 한다.
4. **Character·Memory·AI 보안·보안:** 기존 세연 G0–G6 HOLD와 C08 문맥 경계를 유지하면서, 캐릭터 말투/공식 사주 근거/동의 기억/위험 신호의 분리·협력 계약을 명시. 현재 개인정보 positive Provider/Reply는 승인 없이 열지 않는다.
5. **Web·Mobile·I18N·Cloudflare:** 기존 구매 3분기/화면을 바꾸지 않고 연결. 각 로케일, 실제 Android OAuth, 운영 Worker Router는 별도 현재 PR/승인 단계에 따라 진행하며 사주·유료 Reader의 Source Gate를 우회하지 않는다.
6. **마케팅/영상:** 승인된 화면/문구/공개상태로부터만 영상 소재를 작성. 해당 GPT 세션의 실제 제작 작업과 인수 기준은 별도 작업 문서가 나오기 전까지 **미확정**으로 둔다.

독립 진행 허용: 12메뉴 사용자용 부분 읽기/공식 근거 보강, 캐릭터 바이블, 앱 UI/다국어 화면, Memory 오프라인 효율 연구 등은 **다른 트랙의 CI가 실행됐다는 이유로** 중단하지 않는다. 선행 승인에 묶인 **특정 기능의 Production/public/paid**만 HOLD한다.

## 5. 현재 공개·상용화 전 필수 블로커 (2026-10-22 스냅샷)

- **Saju Product semantic Production:** [권한 감사](https://github.com/gycha0109-beep/Saju/blob/main/docs/product/22-production-interpretation-authority-audit.md) \`BLOCKED\`. SA-6X 5개 natal 상세 **표현** 완성을 일반 Production semantic 승인으로 해석하지 않는다.
- **유료 Reader Chat:** [RR-01~15](../architecture/READER_RUNTIME_V2_TRACK_CLOSEOUT_ROADMAP.md) \`CONTINUE / PUBLIC OFF\`; 공식 RR-03/04 DB Writer/Anchor·최종 답변 원자 Commit/Reveal·HTTP/Records E2E 연결의 실제 승인 필요.
- **Commerce/Privacy:** [#2318](https://github.com/gycha0109-beep/MyeongHa/issues/2318) OPEN. \`P0-PR-02\`는 **제품 정책만 승인**; DB 보호 본문, 파기·복원, 법무/운영 활성화는 미완료. \`P0-CM-03\` 판매 활성화 OPEN.
- **AI/연령:** [P0 결정 원장](../P0_DECISION_REGISTER.md)의 \`P0-AI-01\`(provider/model/fallback) 및 \`P0-AGE-01\`(연령/콘텐츠 정책) OPEN. 기존 임시/격리 유료 모델 호출을 Production 승인으로 간주 금지.
- **세연 개인정보 기반 응답:** [G0–G6](../operations/SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V2_20261016.md) positive personal Memory/Source Pin→Atomic Commit→Reveal/History/Replay/철회 대응 HOLD. #2422·#2426·#2428 Draft, #2434 OPEN.
- **운영 세연 Chat 장애 인수:** [#2200](https://github.com/gycha0109-beep/MyeongHa/issues/2200) OPEN. 10/16의 구 RPC 증거와 10/19~22 운영 DB 이력 관찰은 시점이 다르므로 동일 장애가 현재 지속/해소되었다고 추정하지 않는다.
- **로스터/다국어/모바일/Cloudflare:** [#2115](https://github.com/gycha0109-beep/MyeongHa/pull/2115), [#2430](https://github.com/gycha0109-beep/MyeongHa/pull/2430), [#2327](https://github.com/gycha0109-beep/MyeongHa/pull/2327), [#2381](https://github.com/gycha0109-beep/MyeongHa/pull/2381) 등의 각 OPEN/Draft 결과를 병합/운영 적용과 구분한다.

## 6. 앞으로의 트랙 인계·진척 보고 규칙

한 트랙의 완료는 다른 트랙의 공개 허가를 의미하지 않는다. 후속 GPT 대화방을 시작할 때 아래 네 항목만 실제 관련 변경 기준으로 갱신한다.

- **한 것:** 해당 트랙이 소유한 기존 로드맵 ID와 main 병합 코드/문서, 실제 사용 가능한 결과.
- **남은 것:** 누락된 사용자 경험·본선 연결과 이미 열려 있는 이슈/PR.
- **다음에 할 것:** 기존 로드맵에서 실제로 이어질 구체적 구현(선행조건과 수신 트랙 명시).
- **블로커 및 승인사항:** 의미 원본, 권한, 개인정보, 모델 비용, 환경/배포의 HOLD를 구분.

병합은 원칙적으로 **auto-merge**를 사용한다. 이 세션이 직접 생성한 PR/커밋과 명확히 연결된 CI가 다음 필수 작업을 막을 때만 현재 트랙의 대기 조건으로 삼는다. 무관한 main/타 트랙 CI는 중단 사유가 아니다. 본 문서만으로 새 승인이나 릴리스를 발행하지 않는다.

## 7. 트랙별 정본과 이 문서의 위치

- [MyeongHa Master Spec](../MASTER_SPEC_INDEX.md), [P0 Decisions](../P0_DECISION_REGISTER.md), [Saju Integration](../SAJU_INTEGRATION_SPEC.md)
- [Saju 12메뉴 Product Roadmap](https://github.com/gycha0109-beep/Saju/blob/main/docs/ROADMAP.md) — **엔진의 실행 우선순위 정본**
- [Reader Runtime RR-01~15](../architecture/READER_RUNTIME_V2_TRACK_CLOSEOUT_ROADMAP.md) — **Reader Chat의 기술 종료 정본**
- [유료 Reader Chat S0–S8](../architecture/OFFICIAL_READER_PAID_CHAT_INTEGRATION_ROADMAP_20261012_V1.md) — **DB/Commerce/Reader의 공유 인수 정본**
- [Saju Bridge](../SAJU_HELD_STAGING_COMPLETION_ROADMAP_8C2B2D.md), [Se-yeon AI Security](../operations/SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V2_20261016.md)
- [Memory C07/C08](../character-memory-seyeon-cost-c07-evidence-closeout-and-c08-roadmap-v1.md), [Reader Knowledge](../READER_KNOWLEDGE_OFFICIAL_READING_SOURCE_V1.md)
- 다국어/모바일/Cloudflare의 아직 미병합인 로드맵은 해당 PR 원문을 우선하며 이번 문서에 완료/승인으로 복사하지 않는다.
