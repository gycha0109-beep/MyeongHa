# 명하 Relationship / Life Record / Memory Policy v0.3 — Full Audit

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.3**  
> Date: **2026-08-25**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: source가 결정하지 않은 implementation-critical 사항은 `OPEN-P0`, 비차단 선택은 `CANDIDATE`, source 간 충돌은 `SOURCE_AUTHORITY_GAPS.md`에 기록한다.

---

## 1. 목적

캐릭터 관계, 현세록(Life Fact), Character Memory, session-only context의 authority를 분리한다.

## 2. Authority Split

```text
Birth Profile Revision → 출생 입력
Life Fact              → 현재 삶의 구조화 사실 history
Character Memory       → 관계/대화 회상 durable record
Session-only Context   → 현재 thread/turn에서만 쓰는 비영속 context
Relationship Event     → 관계 변화 source ledger
User Character State   → 관계 current projection
```

## 3. Life Fact

Current overwrite 금지. 변경은 same-type supersession append.

필수 provenance:

- fact_type / schema_version
- valid_from/to
- source kind/message/merge action
- supersedes_fact_id
- confirmed_at / revoked_at

Fact type는 `SHARED_DOMAIN_CONTRACTS_SPEC.md`의 versioned registry를 통과한다.

## 4. Character Memory

구조화된 회상용 durable record. Birth input 또는 confirmed Life Fact 전체를 무조건 복사하지 않는다.

Memory type/schema도 versioned registry를 사용한다.

## 5. Session-only Context

Use Case의 `이 대화에서만` 선택은 **durable Life Fact/Memory table에 저장하지 않는다.**

허용 구현:

```text
current request context
thread-scoped ephemeral cache with bounded TTL
client re-supplied transient state signed/validated by server
```

어느 방식을 쓰더라도:

- account record 화면에 durable fact처럼 나타나지 않음
- future thread/character에 자동 전달되지 않음
- AI execution log가 원문을 shadow memory로 보존하면 안 됨

## 6. Memory Proposal Resolution

AI/Character는 proposal만 생성.

```text
pending
→ accept_long_term
   → exactly one Life Fact OR Memory create
   → explicit grants or private(0 grants)

→ session_only
   → no durable Life Fact/Memory row

→ reject
   → no durable record
```

동일 turn retry는 proposal_dedupe_key로 중복 생성 금지. terminal resolution은 1회만.

`SRC-05` 해결 전에는 `session_only/reject` 후 `memory_proposals.proposed_value_jsonb`의 장기 보존을 privacy baseline으로 승인하지 않는다. proposal staging payload retention은 Memory authority를 우회하는 shadow record가 되어서는 안 된다.

## 7. Access Grants

Durable character visibility는 active `record_access_grants`로만 표현.

```text
character_only      → one explicit grant
current_characters  → 승인 시점 eligible set snapshot grants
private             → durable record, character grant 0
session_only        → durable record 자체 없음
```

새 캐릭터가 과거 `current_characters` 선택을 자동 상속하지 않는다.

## 8. Relationship State

```text
closeness
trust
friction
relationship_stage
last_interaction_at
revision
policy_version
```

숫자 bounds와 stage transition은 `SHARED_DOMAIN_CONTRACTS_SPEC.md`의 immutable `RelationshipPolicyDefinition` authority가 소유한다. `policy_version` 문자열만 같고 실제 rule content가 바뀌는 구현은 금지한다.

## 9. Relationship Event Registry

LLM/free-form string이 event authority가 아니다.

```text
FIRST_MEETING
RETURN_VISIT
SHARED_PERSONAL_FACT
COMPLETED_READING
FINISHED_EPISODE
CONFLICT_EVENT
RECONCILIATION_EVENT
...
```

실제 allowed event set은 `policy_version + event_schema_version` registry로 고정한다. unknown candidate → no mutation.

## 10. Atomic Apply

```text
lock user_character_state
→ validate candidate/source/dedupe/policy
→ calculate deterministic delta/stage
→ append relationship_event(before r, after r+1)
→ update projection revision
→ outbox
→ commit
```

LLM이 delta를 직접 정하지 않는다.

## 11. Anti-Farming

- same event retry once
- same source action repeated beyond policy window no farming
- message spam만으로 무한 상승 금지
- distinct events same revision DB deny
- inactivity alone automatic degradation 금지

## 12. Character-to-Character Awareness

다른 캐릭터 언급은:

```text
same pinned bundle canon relation
+ actual user interaction state if referenced
+ record grant/privacy
→ allowed context
```

Canon에 없는 공식 과거사 생성 금지.

## 13. Forget / Delete Semantics

```text
Conversation delete
→ conversation deletion workflow

Character forget
→ 그 캐릭터의 active record_access_grants revoke
→ shared memory item 자체를 다른 캐릭터에게서 삭제하지 않음

Life Record delete
→ Life Fact revoke/supersede

Account delete
→ account deletion graph
```

한 action이 다른 authority를 암묵적으로 파괴하지 않는다.

## 14. Guest Merge

Historical relationship ledger raw reparent 금지. canonical member current projection이 필요하면 explicit merge action + policy version으로 import/merge하고 provenance를 남긴다.

## 15. Policy Versioning

과거 event는 당시 `policy_version + policy content hash`의 의미를 보존한다. 정책 변경으로 ledger rewrite 금지. 동일 version key의 policy content mutation도 금지한다.

## 16. Verification

- future character old grant → deny
- revoked memory context retrieval → deny
- session-only resolution → durable record count unchanged
- private record → character context excluded
- duplicate proposal resolution → once
- unknown relationship event → no mutation
- duplicate relationship event → once
- concurrent same revision → one wins
- spam farming → blocked by policy
- source message/turn mismatch → DB deny
- Life Fact type mismatch supersede → deny
- double supersede race → one wins
