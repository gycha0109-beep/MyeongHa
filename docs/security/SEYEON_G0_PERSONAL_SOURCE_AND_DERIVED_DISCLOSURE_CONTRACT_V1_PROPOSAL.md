# 세연 G0 — 개인기록 출처·파생 Context·취소/공개 선형화 계약 v1 제안

> Watchtower-Track: security
>
> **Status: PROPOSED / OWNER SIGN-OFF REQUIRED — Production authority 아님**
>
> 작성 기준: 2026-10-12 KST · `main@5ec469a89f89197eef2ef8df12cf8482b4d1a755` 관측, Draft [#1985](https://github.com/gycha0109-beep/MyeongHa/pull/1985) 후보 코드 참조
>
> 상위 원장: [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866) · P0 권한 [#1843](https://github.com/gycha0109-beep/MyeongHa/issues/1843) · 구매 기반 Reader [#1827](https://github.com/gycha0109-beep/MyeongHa/issues/1827) · 운영 계보 [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887)

## 0. 결론과 적용 제한

기존 `docs/security/SEYEON_AI_SECURITY_COMPLETION_GATES_V1.md`, `docs/SEYEON_ATOMIC_COMMIT_OWNER_INTEGRATION_CANDIDATE_V1.md`, `docs/RELATIONSHIP_MEMORY_POLICY_SPEC.md`와 Draft #1985는 **방향과 시험 가능한 Port**를 정의했지만, DB/Character/Security 3자 승인까지 받은 **G0 세부 실행 계약은 없다**.

이에 아래 **제안 정책**, 데이터/트랜잭션 계약, 후보 API, 반례 테스트 및 결재 대상을 하나의 결정 문서로 고정한다. **제안 ≠ 승인**. 오너가 서명 전이면 현재 코드의 `SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1=[]`, 0건 전용 Pin, `routeMounted:false`, `WRITE_DARK`, 유료 Provider/ENFORCE/외부 공개 OFF를 그대로 둔다. 운영용 DDL/ACL/배포/프로덕션 DB는 변경하지 않는다.

## 1. 이미 확인된 사실 / 제안 / 미확정 구분

| 항목 | 저장소에서 확인한 현재 계약 | G0 제안 | 최종 결정 |
| --- | --- | --- | --- |
| 개인 출처 | `memory_items`, `life_facts`, `record_access_grants`에 원본 및 active Grant | **정확한 기존 Grant ID**를 모델 입력과 공개까지 불변으로 결속 | DB + Character |
| 허용 스키마 | SRC-25 positive type/version schema registry 미확정 | 등록되지 않은 `recordType/schemaVersion`은 사용 금지. 예시 타입을 운영 허가로 간주 금지 | Source Authority + Character |
| 모델 입력 선택 | `selectSeyeonRuntimeRetrievedMemoriesV2`의 최종 정렬/상한과 G1-B1 선택 후보 | 실제 모델/Preflight 요청에 들어갈 **전체 텍스트와 출처의 closure**에 Pin | Character + Security |
| 0건 Pin | `1640`의 0건 전용 `seyeon_personal_source_pin_jsonb`, Trigger/RPC 존재 | Positive 용 별도 versioned 저장 경로; 기존 0건 데이터를 재해석하거나 덮어쓰지 않음 | DB |
| 원본 digest | 앱 `canonicalJson`의 `sha256:v1`, 오프라인 PG `sha256:pg-jsonb:v1`은 다른 직렬화 | DB raw digest와 앱 projection/context digest **용도·알고리즘 분리** | DB + Character |
| Commit | `cmd_commit_seyeon_chat_turn_runtime_v2`; 현재 positive original Grant 재검증 없음 | **동일 함수/동일 트랜잭션**에서 원본 Pin 읽고 lock+current state 검증 후 실제 Assistant/Outbox Commit | DB |
| Reveal/replay | Draft #1985 HTTP Port fail-closed, 실제 Owner adapter 없음 | 매 공개와 매 replay에서 DB-current-rights 재검증, 모델 원문 직송 금지 | Security + API + DB |
| 과거/파생 데이터 | recent messages, relationship events/states, Reader/grounding, 다른 worker에 간접 출처 있음 | lineage 미식별/미완결이면 **전체 문맥/페이지 HOLD**, 단순 `personal=[]`로 취급 금지 | Character + Security + Reader |
| 공개 vs 취소 경합 | 합성 PostgreSQL row-lock 경합 PASS, 실제 Commit/Reveal 규약 미승인 | Versioned 공개 선형화 규약 결정(§6), 개인기록 답변 스트리밍 기본 OFF | Security + DB + Product |

### Authority 불변

`record_access_grants`의 Character visibility는 **행 단위**이며 `current_characters` 승인 시점 스냅샷에서 새 캐릭터가 자동 추가되지 않는다. `private`는 0 Grant, `session_only`는 durable record 자체가 아니다. `Character forget`은 그 Character Grant만 취소하고 다른 Character의 Record를 암묵 삭제하지 않는다. `Life Fact` supersession/revoke와 `Conversation delete`/Account deletion은 다른 authority여서 단일 취소 UI로 합치지 않는다. Reader의 구매 Grant/환불·취소는 #1827 소유이며 `record_access_grants`로 대체하지 않는다.

## 2. 직접/파생 Source Closure 설계

### 2.1 출처 부류와 기본 처리 — **제안**

| Source class | 모델 투입 | 최초 공개·Replay·과거 조회 | 허가 원천/미승인 시 처리 |
| --- | --- | --- | --- |
| `current_user_turn` | 같은 검증 Member의 현재 요청 범위에서만 허용 | 해당 Turn 자체·Subject 권한 | 기존 Member/Thread authority. **미래 턴의 durable memory는 아님** |
| `memory_item` | approved schema + original active exact Grant + 원본 DB provenance Pin 전용 | 원본 Grant와 Record의 current 상태 재검사 | 원본 `record_access_grants`; 구 Grant 취소 후 새 ID로 구 턴 재활성 금지 |
| `life_fact` | approved schema + 같은 exact Grant; valid/supersession/revoke 검사 | current 상태·기간·후계 사실 규칙 재검사 | `life_facts`; SRC-25 및 supersession 의미 미승인 시 HOLD |
| `historical_user_message` | 새로운 동의 없는 자유로운 재사용 금지. **provenance coverage 입증될 때만 후보** | conversation deletion / visibility 정책 별도 | 이전 메시지에 개인기록 출처 추적 없음→initial positive lane에서는 **HOLD** |
| `historical_assistant_message` | 생성 당시 Attempt의 transitive closure가 유효한 경우에만 | 전체 사용 원본 Grant와 Record 현재 유효할 때만 | 단순 body/메시지 Sender/문구와 Grant를 짝짓지 않음 |
| `relationship_event` / `user_character_state` | event→원천 메시지·Memory·Fact closure 추적 증명 필요 | 파생 요약/수치도 동일 취소 효력 전파 | SRC-22 관계 정책과 이벤트 출처 미완결 시 HOLD |
| `reader_knowledge` / `official_reading` | 구매/발행·Reader entitlement + Saju 출처 검증 **별도** | 원본 purchase-backed 권한 + 연결된 개인기록 권한 모두 필요 | #1827 및 Saju owner 미승인 시 HOLD; no implicit entitlement |
| `preflight_web` / `peer_character` / `tool_output` | 명시적 경계·신뢰 태그 필요, 텍스트는 권한 아닌 DATA | 만약 개인 파생 시 권한 상속 | provenance 누락/다른 Subject 발견 시 HOLD |
| `character_bible_public` | 승인된 versioned Character bundle에 한해 사용 | 개인 Grant 불필요; content release pin은 필요 | 원본 approved bundle 서명/해시 |
| `unknown` / `unattributed` | **HOLD**, empty/0으로 대체 금지 | **HOLD**, 페이지에서 조용히 제거하고 성공 반환 금지 | 추적 불가능한 자산은 공개 권한 없음 |

**핵심 원칙: 출처의 권한은 파생 결과로 축소되지 않는다.** A·B를 함께 참고해 한 답변/관계 이벤트를 만들면 그 결과의 source closure는 `A ∪ B`. 뒤늦게 A Grant가 취소되면 과거 결과 전체의 공개·재투입을 막는다. 원문 일부를 숨긴다고 나머지 파생 문장에 대한 사용 허가가 생성되지 않는다. 과거 정보에 새 Grant가 발급돼도 **원래 Grant ID의 권한은 복원되지 않는다**.

### 2.2 제안하는 데이터 계약

모든 Positive 모델 입력·Assistant·Relationship/후속 Worker 산출물은 다음 식별자를 DB Owner가 관리한다. 암호학적/접근제어의 source of truth는 서버·DB이고, HTTP·LLM·사용자 본문은 어떤 필드도 발급할 수 없다.

```typescript
type OriginalSourceRefV1 =
  | {
      sourceClass: 'memory_item' | 'life_fact';
      subjectId: string; characterId: 'seyeon';
      recordId: string; originalGrantId: string;
      recordType: string; schemaVersion: string;
      dbRawDigest: string; projectorVersion: string;
      projectionDigest: string;
    }
  | {
      sourceClass: 'historical_message' | 'relationship_event'
        | 'reader_knowledge' | 'tool_output';
      originId: string;
      authorityDomain: 'chat' | 'relationship' | 'reader' | 'external';
      inheritedSourceSetId: string; // owner DB closure, no client-provided proof
    };

type ModelInputSourceSetV1 = {
  schemaVersion: 'seyeon-g0-model-source-set-v1';
  canonicalSubjectId: string; threadId: string; turnId: string;
  attemptId: string; characterId: 'seyeon';
  recordState: 'explicit_zero' | 'positive_verified' | 'blocked_unknown';
  sourceClosure: readonly OriginalSourceRefV1[]; // sorted, no duplicates
  finalContextDigest: string; projectedInputDigest: string;
  policyVersion: string; pinnedBeforeProviderAt: string;
};
```

- `sourceClosure`는 **모델이 실제 받는 입력 전체**에 대한 transitive provenance이다. raw read 후보 전체도 아니고 `personalRecordAdmissions` 전체도 아니다. Final cap/정렬/Context조립, Preflight, recent messages, relationship summary/Reader 추가를 마친 후 **한 번만** 서버 생성하며 상한 내 source-closure 누락 검사를 통과해야 한다.
- `explicit_zero`는 closure가 완전하다는 증명을 포함한다. `blocked_unknown` 또는 unsupported schema·독립 Reader authority 불명은 `explicit_zero`로 승격 불가. `positive_verified`만 positive 경로 후보이며 SRC-25 승인 전 불가.
- 원본 항목마다 동일 `recordId + originalGrantId` 및 정확한 `recordType/schemaVersion` 결속, canonical Subject/Character/Thread/Turn/Attempt를 보관한다. 새 Grant ID로 Pin을 바꿀 수 없다.
- **양수 Pin은 기존 1640 0건 제약을 고쳐 우회하지 않는다.** 새 Versioned sidecar(후보: `seyeon_chat_attempt_source_sets_v1`, `seyeon_chat_attempt_source_edges_v1`)를 마련하고 배타적 `0건 또는 positive` 상태를 Owner RPC가 검사하도록 한다. 운영 DB 마이그레이션 번호/DDL 확정은 DB owner 결정.
- 양수 provenance의 최초 작성만 Owner 실행, immutable Trigger, no API direct UPDATE, DB row source read + admitted server selection ↔ finalContextDigest 일치. 모델 출력·요청에 실린 Grant 값은 서명/권한이 아님. 정확한 데이터/서명 보유 경계가 불분명하면 positive 모델 호출 **0회**.

### 2.3 원본·투영·최종 문맥 Digest를 혼동하지 않는다

| 항목 | 대상 | 후보 생성 주체 | 제안 비교 시점 |
| --- | --- | --- | --- |
| `dbRawDigest` | 원본 `memory_items.content_jsonb` / `life_facts.value_jsonb` + record kind/type/schema 등 DB authority envelope | DB Owner만 계산·재계산 | Pre-Provider Pin, 동일 DB Commit/Revoke, Reveal/Replay. 버전/tag 필수 |
| `projectionDigest` | 원본으로부터 Character projector가 만든 모델 메모리 구조 | Character server; DB는 값 자체를 권한으로 인정하지 않음 | Pin 입력 ↔ 실제 최종 선택 구조/버전 비교 |
| `finalContextDigest` | recent messages/relationship/preflight 포함 **실제 Provider 경계 최종 context** | Character server | Pin 저장 성공 후 Provider로 전달한 바이트와 동일한지 검증 |
| `sourceClosureDigest` | 정렬·중복 제거된 전체 원본 Grant/Record 및 파생 경로 | DB Owner의 영속 closure | Commit/Reveal/Replay/History, 추후 Worker·Saju 연계 |

**미결 기술 결정 D-03:** 현재 앱 `sha256:v1`는 `canonicalJson` 결과, 시험 DB `sha256:pg-jsonb:v1`는 PG `jsonb::text` UTF-8의 SHA-256이다. **동등하지 않다.** DB 재검증에 사용하는 버전은 DB 내부 일관성/원본 컬럼을 기준으로 하고, Node projection/context digest는 별도 체크한다. 운영 이전에 양쪽의 정규화 규칙(숫자/유니코드/키 순서/널/타입), PG15↔PG17 전환, domain separation, 재계산 비용, tamper 불가 저장과 교차언어 golden vector를 Owner가 확정해야 한다. 제3자가 제출한 `sha256` 문자열만으로 사용 허가 불가.

## 2.4 단계별 승인 Scope — 과도한 일괄 구현 방지

**최초 운영 활성화 후보 S0(아직 미승인):** 기존 과거사 재투입 및 Reader/Relationship 파생 권한을 한꺼번에 구현하지 않는다. 모델 입력은 `current_user_turn` + 고정된 승인 Character bundle + **단일 승인 schema/type에 속하는 직접 Memory 한 건 이하**로 한정하는 소규모 내부 Cohort부터 출발한다. Life Fact·여러 개 Memory·과거 Assistant/User 문맥·Relationship 이벤트·Reader/Saju/외부 검색·다른 캐릭터 원문은 데이터가 없다는 뜻이 아니라 **이 Scope에서는 제외하고 재조회/모델 추가를 차단**한다.

- 이 제한이 실제 `runSeyeonProductionChatExecutionV1`의 기존 Context/Preflight/History 기능을 바꿀 수 있으므로 **Character + Product 기능 축소 승인**이 먼저 필요하다. 범위 밖 데이터를 silent filter 후 기존 답변처럼 재생성하거나 `explicit_zero`로 세탁해서는 안 된다.
- S0 승인 후 G1 단일 Record/Grant → G2 동일 트랜잭션 실제 Commit → G3 최초 공개/Replay/History의 그 단일 Original Grant 재검사로 끝까지 관통한 뒤 N건/혼합·파생 정보 Scope를 **별도 버전**으로 확장한다. 새 Source Class 추가 시 최초 S0의 Pin 형식을 재사용하더라도 별도 데이터/권한 정책 승인 필요.
- D-08(Reader), Saju/Face/peer가 S0에 등장하지 않으면 해당 Owner가 `OUT_OF_SCOPE + Fail-Closed`로 **명시 서명**할 수 있다. 서명 없는 `OPEN`은 임의 범위 제외로 인정되지 않는다.
- 위 S0는 **업무 우선순위 제안**이며 정식 승인/활성화가 아니다. 기존 프로젝트의 전체 세연 대화 UX를 무단 축소하지 않는다.

### S0 오프라인 코드 검증 (Owner 미승인, Provider 사용 허가 아님)

- `apps/api/src/seyeon-offline-s0-context-admission-v1.ts`는 **오프라인 후보**로 S0 source-closure 범위를 실행 가능한 조건으로 검사합니다. `productionContext`와 현재 발화가 결속된 `finalContext`가 함께 제공되고, **단일 Memory source**의 Original Grant·원본 스키마·Projector 결과·최종 선택 digest가 기존 `selectSeyeonExactModelPersonalSourcesV1`과 정확히 같아야 합니다.
- 과거 user/assistant 메시지 또는 Relationship history/event/state/revision, 추가 Memory/Life Fact, Reader/Disclosure/Peer/Preflight/External 출처, 누락된 출처 부류·Schema 불일치·Grant 변경·최종 Selection 변경이 발견되면 **Pin 호출·합성 Provider 호출 전에 HOLD**입니다. 과거 데이터를 스스로 필터링해서 `0건` 증명으로 바꾸지 않습니다.
- `runSeyeonOfflineS0ScopedTurnV1`은 이 후보 검증을 기존 **off-line synthetic** `pinBeforeModel → generateSyntheticText → commitWithGrantRecheck → revealCommitted` 순서 앞에 놓습니다. 후보의 반환은 `eligible_offline_synthetic_only`·`permitsProductionProvider:false`·`permitsProductionReveal:false`이며 어느 시점에도 Production 허용 토큰이 아닙니다.
- `test/seyeon-offline-s0-context-admission-v1.test.ts`는 오프라인 긍정/과거 메시지/관계/Reader/타 ingress/Grant tamper/Pre-Pin 중단을 검증합니다. `test/seyeon-offline-s0-real-context-shape-v1.test.ts`는 **실제 `composeSeyeonProductionContextV1`와 `bindSeyeonProductionCurrentUserTurnV1`** 출력을 사용해 Grant 값이 Memory 본문 안의 위조 ID가 아니라 서버 행에서 오는지, 원래의 history가 있으면 후보 거부되는지 증명합니다.
- **증거 한계**: 소스가 별도로 추가되는 실제 `resolveTurnGovernance`, `runSeyeonCharacterTurnV2`의 disclosure/integrity 결정, post-turn worker 및 앞으로의 Reader/Saju Preflight는 합성 빈 ingress 선언만으로 커버되었다고 주장할 수 없습니다. 서버 소유 *완전한* source-closure 추적 포트와 Owner 정책이 승인되기 전에는 이 검사를 Production 실행 경로에 연결하지 않습니다. 시험용 `syntheticApprovedSchema` 역시 SRC-25 허가가 아닙니다.

## 3. 실제 실행 경로 — G1/G2/G3 후보

```text
Verified member → canonical Subject / single Seyeon Thread / pinned Bundle
   ├─ owner-governed source reads + explicit Grant + SRC-25 schema admission
   ├─ recent/history/Relationship/Reader/Preflight source-closure coverage
   ├─ final context selection / cap / source graph closure / two digests
   ├─ G1: Owner DB exact positive Pin + context_ready atomic transaction
   │       failure/unknown/unsupported → Provider 0 calls
   ├─ governed Provider(s) → Output Guard → validated stage
   ├─ G2: SAME transaction within actual Se-yeon runtime commit
   │       lock immutable Pin / canonical scope / exact grants and records
   │       check schema,digest,validity,supersession,deletion,entitlement
   │       → existing assistant message/outbox Commit OR full rollback
   └─ G3: owner-scoped current-Grant reveal transaction
           first response == committed replay == historical history pages
           valid closure → only DB-returned committed text, no streaming
           invalid/error/timeout/unknown → full HOLD, no partial body

Separate worker/next turn:
   read original closure → current authorizations → permit or HOLD
   (never infer rights from the generated text itself)
```

### Owner SQL/Adapter 이관 제안 (미실행)

- **G1:** Candidate SQL in Draft #1985는 한 Memory만 있는 시험 sidecar이다. 실제 설계는 `0/1/N` mixed Memory+Life Fact, intermediate derived edges, deterministic sort, SourceSet Version, immutable per-Attempt envelope, exact digest check가 필요하다. 이미 존재하는 1640 zero-only pin과 충돌하지 않는 새 forward-only migration 필수.
- **G2:** `cmd_commit_seyeon_chat_turn_runtime_v2`의 실제 원자 저장 동작을 유지하면서 동일 PostgreSQL 트랜잭션 내부 Owner assertion을 수행한다. ① pin/Subject/Thread/Turn/Attempt 잠금 ② exact original Grant/Record 쌍의 current validity/DB digest 검증 ③ 실제 기존 commit + outbox ④ rollback-on-any-error. 단순 `commit_test_v1` 또는 별도 SELECT-before-COMMIT을 최종 코드로 복사 금지. v2 함수 내부 변경과 v3 전환 + legacy EXECUTE 회수 중 안전한 선택은 DB Owner 서명 필요.
- **G3:** 새 `cmd_reveal_seyeon_committed_message_current_grant_v1`(후보)와 `qry_seyeon_chat_history_current_grant_v1`(후보)에서 원본 Attempt/Assistant message 관계를 **DB가 역조회**해야 한다. 앱이 구성한 scope/id를 그대로 신뢰하지 않는다. 0건 기존 대화의 legacy handling도 owner 결정 전 무허가 positive 증거로 간주하지 않는다.
- **Executor ACL:** `myeongha_api_executor`에는 승인된 함수 EXECUTE만, sidecar 테이블에 직접 INSERT/UPDATE/DELETE 및 browser `anon/authenticated/service_role` 실행 불가. 승인 Owner Role/SEARCH_PATH/해당 환경의 RLS/함수/뷰 의존성 감사. 새로운 bypass function은 실질적으로 revoke하지 않으면 배포 불가.
- **Deadlock/timeout:** source row lock 순서를 전체 Revoke 함수와 교차 검토해 동일 순서로 고정해야 한다. `FOR SHARE`/엄격한 `FOR UPDATE` 선택, `lock_timeout`/statement timeout, retry/idempotency, COMMIT reply loss, deadlock SQLSTATE error mapping을 DB Owner가 결정한다. 로그에 개인 원문이나 raw digest 원본값 출력하지 않는다.

## 4. 권한 취소와 HTTP 공개의 시간 계약 — G0 결정 요구

**제안 선형화 규칙 (미승인)**

1. `Commit`은 동일 DB 트랜잭션 내 exact Grant+Record의 마지막 상태 검사/잠금과 Assistant Commit을 한 원자 작업으로 묶는다. 먼저 Grant Revoke가 commit되면 G2 거부. Commit이 먼저 lock을 획득하면 Revoke는 Commit 종료까지 대기한다.
2. `Reveal`은 최초 응답·Replay·History page마다 별도 DB transaction에서 **원본 전체 closure의 현재 상태**를 확인하며 잠금을 보유하고, **허가된 Reveal DB transaction의 성공적인 COMMIT을 공개 선형화 지점**으로 제안한다. 이 commit보다 먼저 확정된 Revoke는 공개를 막는다. Revoke가 그 뒤에 확정되면 그 전에 승인된 한 응답이 네트워크 지연으로 나중에 도착할 수 있다. 이는 회수 불가능한 이미 승인된 전송으로 정의할지 **Product + Security 공동 결정**이 필요하다.
3. Source closure 중 **하나라도 무효**이면 모든 생성 텍스트·payload·`latestCharacterMessage`·파생 Relationship을 반환하지 않는다. 페이지 일부를 비밀스럽게 drop하면서 `hasMore`로 유출하지 않는다. 재생성/다시 유료 Provider 호출/partial streaming 금지.
4. 최초 개인기록 활용 release에서는 스트리밍 **OFF 제안**. 전송 중 별도 바이트 단위 revoke를 보장하는 정책이 필요하다면 네트워크 ACK/transaction lock 보유/queue lease 등 설계 범위가 달라지므로 지금 경로를 그대로 공개할 수 없다.
5. `deleted/redacted` historical turn, 계정 삭제·Subject merge, 멤버 재인증·다른 Reader 허가 변경은 원래 상위 authority를 따라야 한다. 다른 계정의 Grant를 ID 교체하여 낡은 closure를 “복구”하지 않는다.

> **필수 Owner 선택 D-04**: “Reveal DB-Commit 선형화 + 사후 네트워크 배송 인정” vs “실제 송신 직전까지 취소가 우선해야 함(추가 동기화 필요)”. 아무도 선택하지 않은 상태는 **HOLD**이다.

## 5. 과거 Context/파생 데이터에 대한 구체적 보완 순서

1. **S0 Inventory**: `composeSeyeonProductionContextV1`의 `readRecentMessages`, `readRelationshipHistory`, `readPersonalRecords`, `resolveTurnGovernance` 및 `runSeyeonCharacterTurnV2`로 들어가는 외부/Reader/Preflight까지 전수 source graph를 작성한다. “직접 개인기록 배열이 비었다”는 것만으로 positive-free 판정 불가.
2. **S1 Provenance**: `conversation_messages`, `relationship_events`, `user_character_states`에서 출처 집합과 발행 Attempt/행 ID를 server-owned link로 연결하는 설계 및 Existing/Legacy null 처리 방침. 한 파생물이 복수 Grant를 상속할 수 있으므로 single `grant_id` 컬럼만 두지 않는다.
3. **S2 Read Admission**: 새 Owner History/RecentMessage/Relationship read adapter는 `sourceClosure` 전체 재검증. `chat-read-http.ts` (Draft #1985)의 현재 Port 없는 503/Relationship=null을 성공 경로로 승격하기 전 S0/S1/S2가 필요하다.
4. **S3 New model Context**: 최근 메시지/Relationship summary를 모델에 다시 투입하기 **전에** 원래 Attempt closure의 현재 Grant를 확인하고 현재 model Attempt 출처 closure에 **전이 Pin**. 과거 History HTTP가 막혔다고 모델 Context까지 자동으로 보호되는 것은 아니다.
5. **S4 Cross-domain**: Reader의 purchase entitlement, Official Reading/Saju grounding, 미래 Face/peer input은 각 도메인 Owner의 verified provenance와 conjunction해야 한다. Character/Memory Grant가 Saju 정당성이나 Reader 결제 허가를 발급할 수 없다.
6. **S5 Retention/deletion**: `SRC-05` proposal payload retention이 장기 저장에 오염을 일으키지 않도록 격리. `session_only`는 프로필/일반 Memory 재사용 금지; 계정 삭제·merge·forget은 provenance 링크가 stale/held로 귀결되고 History export 등 우회 경로도 정책 동일.

## 6. 오너가 서명해야 할 결정 원장

| ID | 결정할 항목 | 제출 후보/기본 안전값 | 승인 책임 | 상태 |
| --- | --- | --- | --- | --- |
| D-01 | Positive Record Type/Schema allowlist (SRC-25), projection semantics | 미등록 모두 거부; 기존 예시 타입 승인 간주 금지 | Source Authority + Character | **OPEN** |
| D-02 | 출처 closure 범위: message/event/state/Reader/Preflight/worker | 누락/unknown 전체 HOLD, 0건 강제 승격 금지 | Character + Security + Reader | **OPEN** |
| D-03 | DB raw vs Node projected/context canonical digest, 비교/서명/버전 | raw DB 재검증과 Node 선택 바이트 분리, PG15/17 vector 필수 | DB + Character + Security | **OPEN** |
| D-04 | Reveal↔Revoke 선형화, HTTP 송신 지연과 이미 승인된 바이트 의미 | non-streaming / DB Reveal successful COMMIT point 제안 | Security + DB + Product | **OPEN** |
| D-05 | Legacy 기존 메시지·Attempt의 provenance NULL / Migration | **소급으로 긍정 증명 만들지 않음; HOLD** | DB + Security + Product | **OPEN** |
| D-06 | 원자 Commit RPC 교체·legacy EXECUTE 회수·DB lock order | 기존 v2 실제 Commit 보존, 동일 transaction assertion 필수 | DB + Security | **OPEN** |
| D-07 | Memory·Life Fact revoke/supersede/valid interval·delete/merge | 기존 Grant ID 불변; 모든 source current-valid 필수 | DB + Character | **OPEN** |
| D-08 | Reader entitlement·Saju Grounding 결합과 환불/재방문 | 별도 #1827 승인 전 Reader 파생자료 HOLD | Reader/Commerce + Saju + Security | **OPEN** |
| D-09 | History page/relationship/current context 변경 UX 및 오류 | full page HOLD/503/no-store, 유료 재생성 금지 | Product + API + Security | **OPEN** |
| D-10 | Owner Role/ACL/RLS + production migration lineage/DR 선행 | API direct DML 0, test-only schema 운영 설치 금지 | DB + Ops + Security | **OPEN** |

**서명 기록**: 각 D-ID마다 `{decision, policy_version, owner_team, approving_actor, recorded_at, PR_or_issue_url, exact_commit_sha, negative_test_urls, status}`를 남긴다. AI가 문서를 작성했다는 사실은 어떠한 Owner 승인도 아니다. **해당 활성화 Scope에 관한 ID가 하나라도 OPEN이면 positive Projector/Route 활성화를 계속 거부한다.** 범위에서 제외되는 D-ID는 담당 Owner가 `OUT_OF_SCOPE + FAIL_CLOSED`로 명시 승인·검증해야 하며, 누락되었다고 자동 면제되지 않는다.

## 7. 검증 매트릭스와 G1→G6 완료 요건

| 테스트 | 인가 기대 | 비인가/취소 기대 | 증거 수준 |
| --- | --- | --- | --- |
| Memory 1건, Life Fact 1건, 혼합 N건, 모델 최종 cap 변화 | 정확히 선택된 집합만 pre-Provider Pin | projection, finalContext mismatch→provider 0 | 실제 Owner RPC + selection integration |
| 원본 Memory/Fact revoke, schema/digest 변경, supersede | 새 현재 valid Grant만 새 Attempt 대상 | 기존 Attempt Commit/Reveal/replay/history 모두 HOLD | 실제 PostgreSQL + HTTP |
| Grant 먼저 Revoke vs Commit 먼저 Lock | 올바른 시점에서 1 Commit | 다른 시점 unauthorized Commit 0 | 독립 PG 2세션 **실제 v2 또는 승인된 대체 RPC** |
| Revoke 중 Reveal, 뒤늦은 새 Grant, 과거 User/Assistant 재입력 | D-04 시간계약대로만 공개 | 구 Attempt 재활성 0 / 파생 재투입 0 | DB 2세션 + 실제 HTTP + Context |
| Relationship Event/state, Reader refund, deletion/merge | approved provenance closure가 모두 현재 유효할 때만 | 미식별·다른 Subject·다른 Reader·Reader revoke 즉시 HOLD | Cross-owner fixture + Integration |
| DB 오류, lock timeout, deadlock, 잘못된 role, lost COMMIT reply | 격리·멱등·재조회 증명 | 모델 재호출 0, 원문 로그 0, 반쪽 Commit 0 | Prod-equivalent Executor·PostgreSQL |
| Client/model `grantId` 위조·instruction injection | 데이터와 authority 분리 | 사설 지시·무단 SQL/Grant 0 | adversarial + positive/negative controls |

**G1:** Owner-approved 데이터 모델과 forward-only 실제 positive immutable Pin. **G2:** 실제 `cmd_commit_seyeon_chat_turn_runtime_v2` 또는 승인된 대체 함수의 한 트랜잭션 Grant-locked Commit. **G3:** DB Owner current-rights first/replay/history + model-context provenance + 선형화 증명. **G4:** Governor 운영 심사 별도. **G5:** 적어도 위 실패/경합 매트릭스 전체와 exact SHA Integration. **G6:** 운영 계보/복원, 롤백, privacy-safe 로그/알림, 명시적 단계 공개 승인. 모든 Gate는 [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866) 원장에 각각 따로 기록한다.

### 실행 핸드오프 (Owner 승인 후, 운영은 별도 승인)

1. Security + Character: D-01/D-02/D-03/D-05/D-07의 **전체 출처 graph + positive registry** 확정.
2. DB Owner: G1 positive schema/RPC/ACL, G2 실제 Commit, D-03/D-04/D-06 linearisability, PG15/17 및 원격 계보 단위 검증.
3. API/Character: `markContextReady` Port, `controlledDisclosurePort`, `seyeonHistoryDisclosurePort`, `readRecentMessages`을 승인된 Owner 함수에 연결; 모델 Input final exact closure가 먼저 Pin되어야 함.
4. Security + QA: same-transaction 2-session Revoke/Commit/Reveal, replay, legacy, cross-subject, multigrant, model-context leakage, no-charge, non-streaming 검증.
5. Ops/Integration: #1887 원격 이력/후속 복구 및 DR 승인 완료 후 별도 G6 적정 범위 승인; 최초 공개 여부 결정.

**종료 조건**: 이 문서 작성 및 PR CI 성공은 `G0=PROPOSAL PREPARED`로만 기록한다. D-01~D-10 Owner 선택/서명 전 `G0=APPROVED`, G1/G2/G3 Production PASS 또는 운영 활성화를 선언하지 않는다.
