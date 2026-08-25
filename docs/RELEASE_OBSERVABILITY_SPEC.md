# 명하 Release / Observability Specification v0.3 — Full Audit

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.3**  
> Date: **2026-08-25**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: source가 결정하지 않은 implementation-critical 사항은 `OPEN-P0`, 비차단 선택은 `CANDIDATE`, source 간 충돌은 `SOURCE_AUTHORITY_GAPS.md`에 기록한다.

---

## 1. 목적

DB/API/AI/content/mobile이 서로 다른 속도로 배포되어도 provenance, compatibility, rollback/disable 경계를 유지한다.

## 2. Version Set

실행/리포트에서 가능한 범위로 기록:

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
fulfillmentDefinitionVersion where commerce applies
```

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
- commerce fulfillment registry
- relationship/usage/notification/experiment policy registries

한 release unit 변경이 과거 provenance를 rewrite하지 않는다. 동일 `(policyKey,version)` artifact content도 immutable하다.

## 4. Content Rollout

`content_bundles` immutable, `content_releases` deterministic rollout.

- existing thread binding 유지
- new thread/session은 resolver result pin
- explicit content transition만 existing thread bundle 변경
- forced safety upgrade는 transition reason/provenance 기록
- retired release의 bundle artifact는 existing pinned thread/progress가 continuable한 동안 삭제하지 않음

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
- push delivery/attempt failure
- commerce receipt/provider event lag
- fulfillment snapshot/version mismatch
- entitlement recompute failure/overgrant prevention
- deletion job age/failure

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
- push provider degradation
- commerce webhook lag
- content capability mismatch spike

## 12. Kill Switches — Currently Supported

Source/ERD 현재 기준으로 독립 보장 가능:

- Saju domain availability (`saju_domain_runtime`)
- entire content release/bundle rollout
- commerce offer enabled state
- notification category/service scheduler policy
- AI feature path at API/runtime policy layer

Character/episode 개별 emergency override는 `SRC-01`.

Kill switch는 과거 ledger/provenance 삭제가 아니다.

## 13. Incident Evidence

- affected versions/release IDs
- affected subject scope count, privacy-minimized
- violated invariant ID
- first/last occurrence
- disable/rollback action
- repair necessity
- regression test ID added

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
commerce fulfillment snapshot gate = PASS if commerce enabled
rollback/disable path = known and actually supported
```

## 15. P0 Dependencies

- `P0-SA-01`: Saju deploy/retry/runbook
- `P0-CM-01`: rail/webhook/restore/refund runbook
- `P0-AI-01`: provider/model/fallback/eval
- `P0-AGE-01`: content/marketing gate
- `P0-PR-01`: logs/backup/deletion retention
- `P0-AUTH-01`: DB execution identity/RLS runbook
