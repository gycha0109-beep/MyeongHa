# 명하 Release / Observability Specification v0.5 — Source Aligned

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.5**  
> Date: **2026-08-29**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: source가 결정하지 않은 implementation-critical 사항은 `OPEN-P0` 또는 numbered source-authority gap으로 남기며 Pack이 새 authority를 만들지 않는다.

---

## 1. 목적

DB/API/AI/content/mobile이 서로 다른 속도로 배포되어도 provenance, compatibility, rollback/disable 경계를 유지한다.

## 2. Version / Provenance Set

실행/리포트에서 source-backed 범위로 기록:

```text
apiContractVersion
clientCapability
contentReleaseId
contentBundleVersion/hash
character bundle pin
prompt/planner/renderer/guard versions
relationshipPolicyVersion
sajuEngineVersion
readingContractVersion
groundingVersion
commerce product / offer identity where applicable
Purchase Intent immutable minimal offer mapping snapshot/hash where applicable
source-gap/P0 status for blocked commerce transitions
notification logical delivery / provider-attempt stored provenance where applicable
source-gap status for blocked notification preference/inbox/provider-routing/scheduler decisions
```

Source에 없는 commerce fulfillment-definition version/hash를 release provenance로 요구하지 않는다.

Notification에서도 stored logical delivery/attempt provenance는 기록할 수 있지만, `SRC-12`, `SRC-13`, `SRC-31`, `SRC-32` 해결 전 missing preference default, final inbox composition, provider-routing policy version, scheduler-policy artifact/version을 존재하는 release provenance처럼 요구하거나 합성하지 않는다.

## 3. Release Units

- DB migrations
- API server
- Web client
- iOS / Android clients
- content bundle
- content release policy
- Saju Engine/package/service
- AI runtime/prompt policy
- relationship policy
- commerce product/offer/provider-provenance components
- relationship/usage/experiment policy registries that have source authority
- notification stored delivery/attempt persistence components

한 release unit 변경이 과거 provenance를 rewrite하지 않는다. 동일 `(policyKey,version)` artifact content도 immutable하다.

Commerce의 Product→grant mapping은 `SRC-18`, entitlement event→grant→logical-entitlement transition/aggregation은 `SRC-21` 해결 전 source-backed release unit/registry가 존재한다고 가정하지 않는다.

Notification provider-routing registry/policy는 `SRC-31`, autonomous scheduler policy/registry는 `SRC-32` 해결 전 source-backed release unit이 존재한다고 가정하지 않는다. Stored notification/delivery/attempt persistence component가 존재한다는 사실은 이 두 policy authority의 존재를 뜻하지 않는다.

## 4. Content Rollout

`content_bundles` immutable, `content_releases` deterministic rollout.

- existing thread binding 유지
- new thread/session은 governed resolver result pin
- explicit content transition만 existing thread bundle 변경
- forced safety upgrade는 transition reason/provenance 기록
- retired release의 bundle artifact는 existing pinned thread/progress가 continuable한 동안 삭제하지 않음

Subject-specific rollout resolver semantics는 `SRC-16` boundary를 따른다.

## 5. Character / Episode Operational Disable Gap

`SRC-01` 미해결. 현재 ERD v0.6만 기준으로 보장 가능한 것은 **bundle/content-release level disable/rollback**이다.

따라서 source가 operational override authority를 결정하기 전에는:

```text
❌ independent character kill switch guaranteed
❌ independent episode kill switch guaranteed
```

라고 문서/운영 runbook에 쓰지 않는다.

SRC-01 해결 후 별도 operational override 또는 mutable runtime authority가 생기면 이 spec과 DDL을 동시 갱신한다.

## 6. DB Migration Release

- forward-only default
- expand → compatible code deploy → backfill/verify → contract/drop
- destructive drop 전 usage/compatibility evidence
- backup/restore/retention window = `OPEN-P0: P0-PR-01`
- migration version + schema catalog hash 기록

## 7. Mobile Compatibility

- minimum supported client capability
- additive API 우선
- remote content minClientCapability gate
- unknown required action/cue → fallback/hide/update-required
- server는 old client에 해석 불가능한 mandatory action을 강제로 보내지 않음

## 8. Observability

기본 telemetry:

- API/request latency + normalized error
- chat turn/attempt state latency
- AI planner/renderer/guard latency/tokens/status
- Saju transport + contract/grounding failures
- DB command revision/idempotency conflict
- outbox backlog/lease/retry
- push delivery/attempt failure from stored delivery/attempt state
- commerce receipt/provider event lag
- Purchase Intent offer mapping snapshot/provenance mismatch
- current entitlement projection inconsistency / overgrant-prevention signal
- source-authoritative entitlement recompute failure **only after `SRC-21` is resolved and that mutation is enabled**
- deletion job age/failure

Do not emit telemetry that assumes an invented fulfillment registry/version or an unimplemented entitlement recompute policy.

For notification, stored delivery/attempt status and failures are observable now. Telemetry that labels a provider choice as the authoritative routing decision requires `SRC-31`; telemetry that claims scheduler eligibility/cadence/frequency-cap/dedupe/template decisions were evaluated by the authoritative production policy requires `SRC-32`. Missing preference defaults and final inbox membership must likewise not be synthesized as resolved telemetry dimensions before `SRC-12` / `SRC-13`.

## 9. Privacy in Telemetry

일반 telemetry에 raw Birth/full transcript/raw receipt/token/account/service secret 금지. Stable ref/versioned fingerprint 사용. Raw AI trace가 필요하면 restricted store + `OPEN-P0: P0-PR-01`.

## 10. Product Analytics Contract

상세 event schema/experiment assignment/privacy는 `ANALYTICS_EXPERIMENT_SPEC.md`가 구현 owner다.

최소 versioned events:

```text
LANDING_VIEWED
ENTERED_HALL
CHARACTER_SELECTED
BIRTH_RECORD_STARTED
BIRTH_RECORD_COMPLETED
FIRST_READING_DELIVERED
MEMORY_PROPOSED
MEMORY_ACCEPTED
RELATIONSHIP_STAGE_CHANGED
READING_PURCHASED
RETURN_PUSH_OPENED
```

Analytics payload에 Saju semantic output/원문 chat을 기본 포함하지 않는다. A/B 실험이 Saju semantic authority를 바꾸면 안 된다.

## 11. Alert Classes

### SEV candidate

- cross-user authorization anomaly
- entitlement over-grant
- deletion requested인데 active personalization access 지속
- Saju protected segment/grounding guard bypass
- Saju public contract drift not recognized by adapter (`SRC-08`/`SRC-09`)
- material ambiguity flattening regression
- corrupted content bundle/hash mismatch

### High operational

- chat duplicate/turn stuck spike
- outbox lease backlog
- Saju/AI sustained failure
- push provider degradation observed from stored provider-attempt outcomes
- commerce webhook lag
- content capability mismatch spike

A provider-attempt failure spike can be alerted from stored provenance. `SRC-31` 해결 전 그 alert 자체를 provider-routing resolver correctness evidence로 해석하지 않는다.

## 12. Kill Switches — Currently Supported

Source/ERD 현재 기준으로 독립 보장 가능:

- Saju domain availability (`saju_domain_runtime`)
- entire content release/bundle rollout
- commerce offer enabled state
- AI feature path at API/runtime policy layer

Character/episode 개별 emergency override는 `SRC-01`.

Notification category/service scheduler policy kill switch는 `SRC-32` 해결 전 source-backed capability로 보장하지 않는다. Provider-routing/failover kill switch도 `SRC-31` 해결 전 source-backed capability로 보장하지 않는다. Device Installation owner revoke와 account-deletion notification blocking은 별도 lifecycle controls이며 global notification policy kill switch와 동일하지 않다.

Kill switch는 과거 ledger/provenance 삭제가 아니다.

## 13. Incident Evidence

- affected versions/release IDs
- affected subject scope count, privacy-minimized
- violated invariant ID
- first/last occurrence
- disable/rollback action
- repair necessity
- regression test ID added
- relevant source-gap/P0 status when an affected path is blocked or partially enabled

Notification incident evidence may include stored logical notification/delivery/attempt identifiers/status and already-recorded provider provenance. It must not invent scheduler policy version, provider-routing configuration version, missing preference defaults, or final inbox membership authority before the corresponding source gaps are resolved.

## 14. Release Gate

Production 전:

```text
source blockers required for enabled feature = CLOSED
P0-dependent feature decision = DECIDED
DB migration/RLS/security tests = PASS
API compatibility = PASS
client capability = confirmed
content hash/manifest = valid
Saju protected narrative boundary = PASS
AI runtime contract/eval = PASS
rollback/disable path = known and actually supported
```

Commerce gate는 enabled slice별로 분리한다.

```text
Purchase Intent create
→ immutable minimal offer mapping snapshot + idempotency/concurrency evidence

provider-specific payment/receipt/restore rail
→ P0-CM-01 DECIDED + provider evidence

purchased Product → concrete entitlement/grant target
→ SRC-18 resolved

authoritative entitlement event → grant mutation → logical entitlement recompute
→ SRC-21 resolved + transition/aggregation/concurrency evidence

full purchase → effective access
→ all applicable gates above PASS
```

Notification gate도 enabled slice별로 분리한다.

```text
stored notification / delivery / provider-attempt persistence and read projections
→ existing ownership/state/dedupe/concurrency/catalog evidence

effective preference defaults/materialization/mutation
→ SRC-12 resolved

final user-visible notification inbox projection
→ SRC-13 resolved

Device Installation register/re-register/token rotation
→ SRC-19 resolved

production provider routing / provider selection
→ SRC-31 resolved

autonomous scheduler trigger/cadence/frequency-cap/dedupe/template/materialization
→ SRC-32 resolved

automatic delivery retry timing/backoff/max-attempt/provider-error taxonomy/failover
→ explicit source authority required; stored allocator/finalizer mechanics alone are insufficient
```

Source에 없는 `fulfillmentDefinitionVersion`, `commerce fulfillment registry`, fulfillment snapshot/hash를 PASS condition으로 사용하지 않는다.

Notification에서도 stored delivery/attempt provenance를 missing preference-default, final inbox, provider-routing, scheduler, or automatic retry-policy PASS evidence로 대체하지 않는다.

## 15. P0 / Source Dependencies

P0:

- `P0-SA-01`: Saju deploy/retry/runbook
- `P0-CM-01`: rail/webhook/restore/refund runbook
- `P0-AI-01`: provider/model/fallback/eval
- `P0-AGE-01`: content/marketing gate
- `P0-PR-01`: logs/backup/deletion retention
- `P0-AUTH-01`: DB execution identity/RLS runbook

Relevant source gaps include:

- `SRC-12`: Notification Preference default / materialization / mutation authority
- `SRC-13`: final Notification Inbox status membership/history/order authority
- `SRC-18`: purchased Product → entitlement/grant mapping
- `SRC-19`: Device Installation registration lifecycle
- `SRC-20`: Share Artifact create/public projection lifecycle
- `SRC-21`: entitlement event apply / logical aggregation
- `SRC-31`: Notification Delivery provider-resolution/routing authority
- `SRC-32`: Notification Scheduler cadence/frequency/dedupe/template/materialization authority

P0 결정은 별도 source gap을 자동으로 닫지 않는다.
