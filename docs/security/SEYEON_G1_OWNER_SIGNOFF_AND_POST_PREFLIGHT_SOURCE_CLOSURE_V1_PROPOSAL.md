# 세연 G1 운영 이관 계약 — G0 D-02 Post-Preflight Source Closure / D-03·D-06 DB 인수안 v1

> Watchtower-Track: security
>
> **DESIGN CANDIDATE — OWNER APPROVAL OPEN · NOT A PRODUCTION MIGRATION** (2026-10-13)
>
> [Draft PR #1985](https://github.com/gycha0109-beep/MyeongHa/pull/1985) · [G0 원본 Grant/파생 공개 계약](./SEYEON_G0_PERSONAL_SOURCE_AND_DERIVED_DISCLOSURE_CONTRACT_V1_PROPOSAL.md) · [G0 D-03/G1 DB 구현 Blueprint](./SEYEON_G0_D03_G1_POSITIVE_PIN_DB_BLUEPRINT_V1_PROPOSED.md) · [R0~R8 로드맵](../operations/SEYEON_G0_D03_G1_TO_G6_IMPLEMENTATION_ROADMAP_V1.md) · [#1843](https://github.com/gycha0109-beep/MyeongHa/issues/1843) · [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866) · [운영 계보/DR #1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887).

## 0. 실제 소스에서 확인된 구조와 새로운 미결 사항

현재 `runSeyeonProductionChatExecutionV1()`은 `persistencePort.markContextReady()`에서 1640 **Zero-Only** DB Pin을 먼저 저장한 뒤 `resolveTurnGovernance()`와 `runSeyeonCharacterTurnV2()`를 호출합니다. 실제 `runSeyeonCharacterTurnV2()` 내부 순서:

1. **governed Preflight:** `runCharacterGovernedPreflightV1()`에서 Integrity / Disclosure 분류 실행은 `Promise.all`로 병렬. 각 classifier의 Native Provider payload는 **현재 사용자의 발화 텍스트만** 포함합니다.
2. **Preflight source retrieval:** 분류 후 `retrieveAllowedCharacterDisclosureSourcesV2()`가 추가 private source를 가져올 수 있습니다. 현재 기본 Production `createSeyeonProductionGovernanceV1()`의 retriever는 항상 빈 배열을 반환하지만, 다른 governance Port와 미래 Reader/Saju 연동도 동일하다고 가정할 수 없습니다.
3. **relationship semantics:** `relationship !== null`일 때 별도 `relationshipSemantics.resolve()`가 호출됩니다. 모델 문맥의 의미 파생값이므로 원본 Relationship Event 권한 계보가 필요합니다.
4. **post-Preflight assembly:** `assembleSeyeonRuntimeContextV2()`는 원래 입력에 `integrity.decisions`, `disclosure.decision`, `retrievedPrivateSources`, `relationshipSemantics`, Bible slices/behavior policy를 더합니다.
5. **실제 세 모델 요청:** `buildSeyeonTurnInterpreterRequestV2()` → Guard/causality → `buildSeyeonRendererRequestV2()` → Guard → `buildSeyeonSemanticReviewRequestV2()`. Interpreter와 Renderer의 자체 생성 산출물 역시 이전 원본 Personal Memory의 **파생 출처**를 상속합니다.

**중요한 시간적 모순:** 첫 Provider보다 먼저 **모든 단계의 최종 요청 Bytes**를 Pin할 수는 없습니다. Preflight·Interpreter·Renderer 결과가 아직 없기 때문입니다. 따라서 G1 Pin에 **미래의 실제 Request Digest가 이미 존재한다**고 주장하면 틀린 계약입니다. 아래의 **불변 원본 SourceSet + 단방향 단계별 Request Receipt**를 대안 후보로 제안합니다. 이 후보는 Owner 서명 전 Production 기능이 아닙니다.

## 1. 제안 D-02-PF S0 한정 계약 — 결정 전까지 STRICT HOLD

**S0 Source Closure = {현재 user message, Owner가 공개 승인한 Bible release, exact Original Grant를 가진 직접 Memory 1개}**. Source class가 무엇인지 추정하지 않고 DB Owner가 최초 source edge 1개만 Pin해야 합니다. `shared_detail/memory-v1` 합성 fixture가 실제 SRC-25 승인 타입을 의미하지는 않습니다.

| 단계 | 합성 S0에서 임시 허용되는 관측 | 거부/HOLD | 운영 이관 시 요구 |
| --- | --- | --- | --- |
| DB G1 positive Pin | 현재 canonical Subject+Thread+Turn+Attempt, exact Original Grant/Record 1개, approved type/schema, immutable edge, server-selected digest | stale/reissued Grant, unknown source, late/duplicate Record, zero+positive Pin | SRC-25, D-03 codec, D-06 atomic RPC/role/ACL, 실제 DB apply 승인 |
| Integrity classification | current user text / Se-yeon ID만 포함한 입력, `classification.claims=[]`, `decisions=[]` | user/assistant 과거 history, 새 `USER_SELF_REPORT`도 현재 S0는 미승인 source promotion이므로 HOLD | Preflight 결과 identity/message ID·schema 대조, 미래 USER_ASSERTED 지원은 별도 파생 정책 |
| Disclosure classification/retrieval | `status='not_sensitive'`, `topicKey=null`, `source/decision/factAuthority=null`, `retrievedPrivateSources=[]` | sensitive/private/Reader retrieval, 새 Fact Authority 또는 hidden cached source | Source retrieval 0을 **반환값 실제 검증**으로 증명. “기본 retriever=[]”만으로 인증 금지 |
| Relationship semantics | `relationship=null` 및 `relationshipSemantics=null` | event replay, relationship derived state, inferred trust bands | SRC-22/Relationship Owner 원본 event closure, S0 축소승인 전 미지원 |
| Interpreter boundary | Preflight 결과 적용 후 **실제 Native Context**와 처음의 S0 synthetic finalContext로 재구성한 Context 전체 동일 | Integrity decisions / Reader / history / Relationship / Bible release/policy 변경·추가 source | Server-owned immutable Context + stage-specific Provider request receipt |
| Renderer/Reviewer | Native packet/draft의 verified stage predecessor+source identity, 병렬 모델 호출 금지 | 추가 memoryRefs/private refs, 드래프트에서 무단 source promotion | 파생 lineage(parent source set) + exact provider wire bytes 연속 검증 |
| G2 Commit / G3 reveal/history | 아직 Positive 실제 경로 불가 | unsigned receipt나 generated text만으로 publication/replay | 같은 DB Tx 재검증과 D-04 reveal linearization Owner 승인 |

**Preflight 비용 상한:** 두 classification이 `Promise.all`로 병렬이므로 하나가 실패해도 이미 시작한 다른 호출의 비용이 발생할 수 있습니다. “Preflight 실패면 Provider 비용 0”이라고 기술하지 않습니다. **필수 목표는 DB Pin 실패 시 최초 모델 호출 0**, 새 source 출현 시 **이후 Interpreter/Renderer/Reviewer 0**, 최종 사용자 본문 0 및 정산/환불 의미는 Cost/Commerce Owner가 별도 승인하는 것입니다.

## 2. 버전이 있는 Owner Authority Snapshot / Stage Receipt 제안

### 2.1 최초 G1 핀 — Model 이전의 유일한 원본 인가 기준

**불변 SourceSet (Proposal):** `attemptId, subjectId, threadId, turnId, characterId=seyeon, policyVersion, schemaAllowlistVersion, sourceSetVersion, sources[{ordinal=0,kind='memory',recordId,originalGrantId,recordType,schemaVersion,originalGrantedAt,pgPayloadDigest}], appSelectionDigest, pinnedAt`.

- `appSelectionDigest`는 Node `canonicalJson` 대상, `pgPayloadDigest`는 DB `content_jsonb::text` 대상. 다른 원문/코덱이므로 **상호 비교 금지**. DB own FK + exact Grant/current Record validation은 hash보다 우선.
- 서명/DB transaction 없는 클라이언트·Model SourceRef·HTTP body/커넥터 관측값은 Owner SourceSet으로 승격할 수 없습니다.
- DB transaction이 original Grant & Record를 잠그고 source edge를 생성하여 `context_ready`로 전이. Commit될 때까지 첫 Model/Preflight Provider 호출 금지. 새 paid provider 호출은 별도 비용 ledger policy 적용.
- Retry/new Attempt는 동일 source set 재사용으로 자동 이어가지 않음. Original Grant 취소 후 old Pin 고정 ID가 남아도 current rights가 없으면 HOLD.

### 2.2 이후 Stage Receipt — 원본 SourceSet을 다시 쓰지 않는 파생 증거

**Append-only StageReceipt 제안:** `attemptId, sourceSetVersion, stageOrdinal, stageKey, stagePurpose, nativeRequestSchemaVersion, providerAdapterVersion, providerKey, modelKey, nativeRequestDigest, finalProviderWireDigestOrAttestation, effectiveSourceSetDigest, priorStageReceiptDigest, submittedAt, runtimeActor`.

- `stageKey` 허용 순서: `integrity_classification`·`disclosure_classification`의 병렬 완료 → `post_preflight_context_seal` → `turn_interpretation` → `dialogue_render` → `semantic_review`.
- 네트워크 실제 전송 Payload는 **Provider Adapter가 서버측에 생성한 바이트**를 해시하거나 내부 검증 가능한 증거로 결속해야 합니다. API가 아무 문자열 digest를 전달해도 그 자체는 인증이 아닙니다. DB Owner와 Platform Security의 trust-boundary 검토가 필요합니다.
- Preflight 분류는 완료 직후 결과 구조·SourceSet 동일성 검사. 예를 들어 `USER_SELF_REPORT` 결과 자체는 현재 사용자 입력에서 유래했더라도 운영 S0에서 그 **사실화/파생 기록**을 추가 승인하기 전에는 Interpreter 차단.
- `post_preflight_context_seal`의 실제 Context 전체가 예상된 S0 baseline에서 변한 경우 **기존 Pin을 수정하지 않고 HOLD**. “SourceSet은 그대로인데 Context만 바뀌어도 괜찮다”는 예외 없음. 관계/Reader/source expansion은 새로운 버전의 Owner 정책이 필요합니다.
- Interpreter/Renderer/Reviewer stage는 이전 요청과 생성 출력의 **파생 ancestry**를 유지. `rendererDraft.privateSourceRefsMentioned=[]`만으로 민감 원본을 삭제 처리하지 않습니다.
- D-03 결정 전 특정 codec/json byte encoder·wire equality를 “최종”이라고 고정하지 않습니다. **이 표는 요구 컬럼 후보이지 적용 DDL이 아닙니다.**

### 2.3 R2 새 격리 테스트 결과의 지위

`apps/api/src/seyeon-offline-r2-post-preflight-closure-v1.ts`와 `test/seyeon-offline-r2-post-preflight-closure-v1.test.ts`는 실제 `runCharacterGovernedPreflightV1()`의 Integrity/Disclosure 반환을 입력받아 첫 SourceSet 후보로 native `assembleSeyeonRuntimeContextV2()`를 **재조립**하고 실제 Context 전체와 비교합니다. 기존 `buildSeyeonTurnInterpreterRequestV2()`를 생성하여 이미 구현된 R2 source audit에 통과할 때만 합성 delegate를 허용합니다.

차단 케이스: 새 분류 Claim/Integrity Decision, 민감 주제/사유·private Source, 다른 message ID, Reader history, 관계 semantics, Bible/behavior 정책 drift, Memory 교체·추가, Context 조립 이후 mutable object 변경, Provider 재호출. **합성 코드의 Verdict는 `permitsProductionProvider:false`, `permitsProductionReveal:false`**이며 현재 Production `runSeyeonCharacterTurnV2()`에 설치되어 있지 않습니다. 유료 AI·운영 DB 사용 0. 별도 CI SHA 성공 확인 전 PASS가 아님.

## 3. Owner가 수락하거나 반려해야 하는 G1 최소 실행 계약

| ID / 담당 승인자 | 채택 후보 | 동의되지 않으면 |
| --- | --- | --- |
| D-01 SRC-25 / Source Authority+Character | 실제 S0 Memory type/schema/projector의 정확한 등록 및 데이터 관리 정책 | Positive memory_projectors=[] 유지 |
| D-02-PF / Character+Security+Product | Preflight classification 출력도 출처 없는 실제 사실·관계 지식으로 모델에 승격 금지; S0 empty result only. 나중에 verified facts 도입은 새 승인 버전 | Any new Preflight/Reader/Relationship source→HOLD |
| D-03-A~D / DB+Security+Character | DB jsonb payload digest와 Node selection/context digest 분리; 단계별 wire receipt codec/version/upgrade golden | Server digest는 테스트 checksum만, 운영 Provider 승인 금지 |
| D-04 / DB+Security+Product | Reveal 선형화 시점·동시 revoke·late network bytes 및 non-streaming | First/replay/history 공개 0 |
| D-05/D-09 / Product+Security+DB | Legacy Attempt/History/Relationship의 미입증 source 처리: S0 reject, old NULL pin≠empty | Old transcript/derived reuse HOLD |
| D-06 / DB+Security | 본문 G1 RPC와 기존 1640 zero-only Trigger, G2 v2 same-Tx Commit/Outbox, legacy EXECUTE 봉쇄, lock graph | 실제 positive DDL 적용/Commit 차단 |
| D-07 / DB+Source Authority | revoke, regrant, supersession, subject merge/delete propagation & retention | Current-rights validation 실패는 HOLD |
| D-08 / Reader+Commerce+Saju+Security | Reader/knowledge/Saju/private related model ingress는 S0에서 전부 제외. 별도 권한 승격 없음 | Unapproved Reader/Saju→HOLD |
| D-10 / DB+Ops+Security | 실제 운영 migration ancestry/DR backup-restore, actor ACL·StageReceipt storage/privacy | Production migration/route 적용 금지 |

**서명 기록 형식(초안 작성자가 대신 APPROVE하지 않음):**
`{decisionId, decision: APPROVE|REVISE|OUT_OF_SCOPE+FAIL_CLOSED, policyVersion, authorizedScope, sourceSchemaVersion, approverNameOrTeam, reviewedPrHeadSha, reviewedDbCatalogSha, evidenceUrls, signedAt}`.

**현재:** 모든 항목 Owner 승인 OPEN. 위 단계를 순차로 기술한 것은 **Owner 계약이 확정됐다는 의미가 아니며**, 새 Production migration, 1640/1500 기존 migration 덮어쓰기, 긍정 Projector 활성화, public route 또는 유료 Provider 호출을 허용하지 않습니다.

## 4. DB 실행 패키지와 출구 조건 — Owner 승인 후만

1. **실 카탈로그 READ-ONLY 기준선:** DB Owner가 `chat_turn_attempts`, `chat_turns`, `record_access_grants`, `memory_items`, `subjects`, `conversation_threads`의 FK/UNIQUE/INDEX/RLS/ALTER privileges·`cmd_*_v1/v2` EXECUTE grants 및 원격 migration history/#1887 동일 백업 Restore를 증명. MAIN 대비 PR diff/정확한 SHA 재정합 포함.
2. **Forward-only Migration A (G1):** 원본 1640 zero-proof/immutability 그대로 보존하고 positive Parent+Edge/Scope Registry, atomic owner-controlled `cmd_mark_*_positive_pinned`와 same transaction `context_ready`; attempt lock은 Zero UPDATE와 동일행 충돌. Subject-first revoke lock order와 original Grant FOR SHARE/current version 확인. 신규 Browser/anon DML/EXECUTE 0.
3. **Migration B (G2과 일체로 심사):** `validated→committed`의 기존 1640 zero-only 강제를 무작정 해제하지 않고, Owner-approved `zero XOR positive exact Grant`를 트리거 및 Commit RPC에 동일하게 반영. **old v1/v2/Core SQL EXECUTE** 우회·API fallback을 막고, v2→v1→Chat Core Commit+Outbox는 same DB transaction 유지. 기존 Zero Regression 통과 필수.
4. **Stage Boundary:** Provider Adapter의 실제 Wire serialization/version을 서버 소유 Sealed Context/Grant SourceSet과 결속하며, Preflight·후속 모든 Provider 단계 직전에 current Grant + source closure 재검증. 비용 zero-before-pin 및 이후 비인가 재시도 0.
5. **G3 Owner Disclosure:** First, replay, GET history, 이후 Assistant transcript/Worker/Relationship Reader가 원본 Parent closure를 상속. revoke-first / commit-first / reveal-first + late arrival D-04 test 및 no partial pages.
6. **G5/G6:** disposable exact Production-equivalent SQL 2/3-session, real HTTP/Provider fake, privilege matrix, failure+rollback, PG15/PG17 deterministic fixtures, current production migration ancestry/DR, isolated canary evidence. 모두 PASS 후에만 Owner들이 공개 여부 별도 결정.

**현재 종료 조건:** R2 Post-Preflight synthetic-only 검증 B(정확한 최신 CI PASS 시). G1 운영 상세 기술설계는 검토/승인 요청이 가능한 수준으로 구체화했으나 **Owner Approval C/HOLD**. R1/R2 synthetic PASS를 실제 Positive G1 구현·출시로 보고하지 않습니다.
