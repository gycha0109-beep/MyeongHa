# 세연 R2 — 실제 OpenAI Responses Adapter의 JSON/UTF-8 전송 경계 격리 검증 v1

> Watchtower-Track: security
>
> **Status: OFFLINE MOCK-FETCH EVIDENCE CANDIDATE / OWNER TECHNICAL SIGN-OFF HOLD**
>
> 날짜: 2026-10-13. Draft [#1985](https://github.com/gycha0109-beep/MyeongHa/pull/1985), [R0~R8 로드맵](../operations/SEYEON_G0_D03_G1_TO_G6_IMPLEMENTATION_ROADMAP_V1.md), [G0 D-03/G1 Owner 후보](./SEYEON_G1_OWNER_SIGNOFF_AND_POST_PREFLIGHT_SOURCE_CLOSURE_V1_PROPOSAL.md), [제품 정책 승인](./SEYEON_G0_PRODUCT_OWNER_POLICY_APPROVAL_2026-10-13.md).
>
> **S0 1건 Memory 합성 데이터 전용.** Production Positive Projector / 공개 Route / Provider 실 API / 운영 DB / 결제·비용 정책 / Owner G0~G6 서명 변경 없음.

## 1. 실제 조사에서 확인한 전송 경로

- 실제 Provider 구현: `apps/api/src/openai-seyeon-structured-provider-v1.ts`의 `createOpenAiSeyeonStructuredProviderV1`. `production-seyeon-chat-runtime-v1.ts`는 이 Adapter 또는 Cost Ledger의 `createPersistingSeyeonAiProviderV1` 경유 Provider를 선택합니다.
- Native `SeyeonStructuredProviderRequestV2`의 `instructions`, `input`, `responseSchema`, `purpose`를 받아 실제 Adapter가 `JSON.stringify`로 **Responses body 문자열**을 생성합니다. `input`은 별도의 `JSON.stringify(request.input)`를 거친 다음 user `input_text`에 문자열로 들어갑니다.
- Provider는 `beforeDispatch(metadata)`와 `meteredBeforeDispatch(metadata, requestBody)`를 **await**한 뒤 동일한 **requestBody 문자열**을 `fetchImpl(..., {body: requestBody})`에 전달합니다. `metadata.requestBodyBytes`는 `TextEncoder`의 UTF-8 길이입니다.
- 이 문자열은 UTF-8 요청 body의 모의 전송 관측을 가능하게 하지만, 네트워크/TLS/서버 수신 바이트나 DB 권한의 독립 증명은 아닙니다. 또한 unkeyed SHA-256만으로 SourceSet Grant 권한이나 진실성을 부여할 수 없습니다.

## 2. 이번 격리 테스트의 실제 범위

신규 `test/seyeon-offline-r2-openai-wire-boundary-v1.test.ts`:

1. 기존 Product 승인 정책과 별개의 **synthetic S0** `candidate`를 생성; `runCharacterGovernedPreflightV1` + 실제 Production Governance의 `createIntegrityClassifier`·`createDisclosureClassifier`로 두 분류의 Native Request를 만듭니다.
2. 실제 `createOpenAiSeyeonStructuredProviderV1`에 가짜 API 키, `fetchImpl` 테스트 스텁, 내부 `meteredBeforeDispatch`를 구성합니다. **실 API endpoint 호출 0**.
3. `meteredBeforeDispatch`에서 요청 시점 Native 객체의 fingerprint·현재 S0 source closure와 실제 Provider JSON 구조를 확인합니다. 모델, 목적별 schema name, instructions+untrusted-data boundary, 현재 source text의 `input_text`, schema, 추가 역할/도구/필드 부재, JSON roundtrip의 무손실 여부, UTF-8 byte length를 검증합니다.
4. `fetchImpl`에서 `x-client-request-id`로 입장 허가를 다시 매칭하고 실제 수신한 `init.body` 문자열과 직전 Hook의 UTF-8 byte SHA-256 및 본문을 **정확하게 비교**합니다. 실제 Adapter가 보내는 값이므로 임의 테스트 구현체가 전송 형식을 대체하지 않습니다.
5. 같은 Provider로 synthetic Interpreter 출력 → 실제 Domain `guardSeyeonTurnInterpretationV2` / Causality → `buildSeyeonRendererPacketV2` → Renderer 출력 guard → 실제 Reviewer Request → Semantic guard를 연결합니다. 두 분류와 세 본문 단계 **총 5개 native Provider dispatch** 각각의 전송 바이트를 관찰합니다.
6. 매 Stage에 호출한 응답은 로컬 `Response.json` fixture이며 실 모델 추론·사용자 개인정보 처리·유료 요금 청구는 없습니다. Stage lineage Receipt도 **테스트 메모리 안의 비서명 관측값**입니다.

### 부정 검증

- `beforeDispatch`가 끝나기 전에 S0 원본 메시지가 변경되면, Source closure 재검증이 `meteredBeforeDispatch` 단계에서 막아 추가 `fetchImpl` 호출이 발생하지 않아야 합니다.
- 요청 `instructions`가 이미 JSON body 생성 후 바뀌면 Native Request 지문이 불일치하여 미전송 HOLD.
- 모델 요청 `input`에 `undefined`가 섞이면 `JSON.stringify`가 이를 조용히 누락합니다. 별도 strict `canonicalJson` 확인이 이를 오류로 간주하여 `fetchImpl` 이전 차단해야 합니다.
- Body Digest/Byte Length 관측이 일치하지 않으면 Provider `PRE_DISPATCH_REJECTED`를 반환하고, 이후 네트워크 모의 전송을 실행하지 않아야 합니다.
- 최종 Native Provider 바이트가 일치해도 복제되지 않은 원본 Grant/Owner receipt, 이전 Attempt의 권한 철회 여부가 해결됐다고 취급하지 않습니다.

## 3. 기존 R2 및 D-03과 계약상 충돌 방지

| 레이어 | 실제 증거 | **보장하지 않는 것** |
| --- | --- | --- |
| G0 S0 후보 | 합성 Context/SourceSet 구조 및 1개 Memory Selection 검사 | Production SRC-25/Owner 승인 |
| R2 Post-Preflight | 실제 분류 반환 + Interpreter 전 문맥 재조립 동일성 | 전이 파생물의 DB Authority |
| R2 Derived Output | Guarded Interpreter→Renderer→Reviewer Native 생성 의존성 | 실제 Provider byte payload |
| **이번 R2 Wire Test** | **실제 OpenAI Adapter 생성 raw JSON/UTF-8 body와 fake fetch 수신 문자열 일치** | 서버 인증/DB 권한/실수신 네트워크 바이트/지속 receipt |
| G1→G3 | (아직 구현·운영 인수 아님) DB positive immutable Pin, 동일 Tx Commit 및 current-rights Reveal | G4~G6 운영 검증·배포 |

`canonicalJson`-기반 요청 비교, Provider Adapter의 실 `JSON.stringify`, PostgreSQL `jsonb::text` 기반 payload digest는 **서로 다른 바이트 규격**입니다. 이 테스트 결과를 D-03 공식 codec 서명이나 1640 트리거 호환성의 증거로 전용하지 않습니다.

## 4. 남은 실운영 인수 사항 (차단 유지)

1. DB Owner가 발급한 **원본 Original Grant + Record + SourceSet** immutable receipt와 현재 stage의 bytes/digest를 같은 Attempt에 server-side bind.
2. Preflight 두 분류의 동시 비용 처리, Interpreter/Renderer/Reviewer 출력 계보의 authenticated append-only stage receipt. 실제 Provider Adapter에 Hook를 설치할 책임 주체와 비용 Ledger/Governor와의 조합 정책 확정.
3. RequestBody Hook 검증·실제 송신 직전 철회 경합의 최종 선형화 계약, 비인가 호출/재시도 차단. `fetchImpl` Test Double 검증은 Provider 공급자 서버의 실제 수신 바이트 attestation이 아님.
4. Legacy, Reader/Saju, Relationship, worker, 과거 History 등 전이 출처 closure의 추가 허가. `unknown`을 0건으로 취급하지 않음.
5. #1887 운영 DB migration 계보/DR, D-01~D-10 담당 기술 오너 사인오프, G1~G6 별도 Gate.

**판정:** 현재 문서는 *R2 실제 Adapter 직렬화 경계를 사용하는 격리 증거 후보*입니다. 정확한 최종 GitHub HEAD의 Character/DB Authority/CI 성공 확인 전까지 이 테스트의 PASS를 선언하지 않습니다. 성공하더라도 Production 개인기록 Projector `[]`, 공개 Route OFF, 실 Provider 비인가, PR Draft/미병합 및 G0 기술 계약 HOLD를 유지합니다.
