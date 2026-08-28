# 명하 Spec Pack — Source Authority Validation Report v0.4

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.4 Source Alignment**  
> Date: **2026-08-28**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Saju Public Contract Audit Pin: `gycha0109-beep/Saju@7102dc8fe8483c0875f6a093a4fd585b0df51f8b`

---

## 1. Verdict

```text
PACK STRUCTURE                 = PASS
SOURCE-BOUND IMPLEMENTATION    = CONDITIONAL PASS
FINAL DDL / PRODUCTION         = BLOCKED BY OPEN SOURCE GAPS / P0s
```

Pack 문서가 source를 구체화할 수는 있지만 source에 없는 implementation-critical authority를 새 product rule로 만들 수 없다.

## 2. Authority Rule

```text
Saju semantics/methodology
→ Saju architecture + actual exported Product contract

Product journey / world behavior
→ Use Case

Relational persistence
→ ERD v0.6

Implementation contracts
→ Pack specs, bounded by the above source authorities
```

Source끼리 직접 충돌하거나 source가 구현 필수 authority를 제공하지 못하면 Pack이 임의 결정하지 않고 `SOURCE_AUTHORITY_GAPS.md` 또는 `docs/source-authority-gaps/`의 numbered gap 문서로 등록한다.

## 3. Current Structural Baseline

- ERD public base tables: **59**.
- DDL/catalog tests continue to assert the 59-table baseline.
- API/DB mutation surfaces remain command-oriented rather than raw CRUD wrappers.
- P0-AUTH-01 unresolved 동안 DB functions use `SECURITY INVOKER` and PUBLIC EXECUTE remains revoked for newly exposed command/query surfaces.
- Content/canon projections remain explicit bundle-pinned where source does not authorize hidden current selection.

Machine validation values recorded in older v0.3 reports are historical snapshots; this report does not silently reuse stale counts as evidence for the current repository state. Current CI/action runs are the execution evidence.

## 4. Source-Alignment Corrections

### 4.1 Existing corrections retained

The Pack continues to preserve explicit blockers rather than converting ambiguity into invented behavior. Examples include:

- API/RLS database identity → `P0-AUTH-01`
- memory proposal staging/privacy → `SRC-05`
- Birth/Target deletion vs Reading provenance → `SRC-06`
- Saju target-birth adapter → `SRC-08`
- Saju grounding guard metadata → `SRC-09`
- record grant create/regrant → `SRC-10`
- Episode current progress bundle selection → `SRC-11`
- notification defaults/materialization → `SRC-12`
- notification inbox status → `SRC-13`
- conversation delete duplicate transcript authority → `SRC-14`
- subject-specific content rollout resolver → `SRC-16`
- Episode transition evaluator → `SRC-17`

### 4.2 Commerce fulfillment overreach removed — `SRC-18`

A new source audit found that earlier Pack revisions introduced a `ProductFulfillmentDefinition` contract that does not exist in any of the three primary source-authority documents.

The invented layer included:

```text
ProductFulfillmentDefinition registry
fulfillmentDefinitionVersion
normalized grant definitions
GLOBAL | REQUEST_RESOURCE | FIXED scope resolver
one_off | subscription | promo_compatible grant class
required fulfillment version/hash in Purchase Intent evidence
```

Primary source instead defines:

```text
Product stable identity
Product Offer immutable provider/platform/external-product/product mapping
Purchase Intent immutable minimal mapping snapshot + digest
Receipt/provider-event provenance
Entitlement grant/event/projection structures
Entitlement apply transaction skeleton after a grant target is known
```

Primary source does **not** define the mapping from a purchased product to the concrete entitlement key/scope/grant semantics. This is now `SRC-18`.

Therefore current Pack baseline is:

```text
Purchase Intent minimal offer mapping snapshot = IMPLEMENTABLE
verified provider provenance persistence        = schema/provenance boundary implementable
purchase/provider source → concrete grant       = BLOCKED by SRC-18
provider-specific commerce rail                 = additionally OPEN-P0 P0-CM-01
```

The previous claim that a source-controlled `ProductFulfillmentDefinition` is already authoritative is superseded and must not be used for implementation.

## 5. Current Saju Public Contract Boundary

Pinned public contract:

```text
gycha0109-beep/Saju
@ 7102dc8fe8483c0875f6a093a4fd585b0df51f8b
```

Current public boundary supports one Birth input plus reading text/optional target person reference and returns `ProductReadingResponse`.

The Pack does not fabricate second-Birth compatibility input or semantic guard fields absent from the exported public contract. `SRC-08` and `SRC-09` remain the applicable blockers.

## 6. Commerce Validation Boundary After SRC-18

Source-complete verification may assert:

- guest/deletion-pending purchase deny;
- active-member Purchase Intent creation;
- same-key/same-request replay;
- same-key/different-request conflict;
- concurrent retry convergence;
- immutable minimal offer mapping snapshot;
- provider account link owner/provider/status checks;
- no receipt/provider-event/entitlement side effects from Purchase Intent create;
- receipt/provider event relational provenance/dedupe constraints;
- current entitlement projection from already-authoritative grants.

It must **not** claim the following are source-complete:

- exact purchased product → entitlement key/scope mapping;
- purchase-derived `grant_key` policy;
- resource-scope resolver semantics;
- historical fulfillment registry version replay;
- restore creating missing concrete grants from an invented mapping definition.

Those become valid only after `SRC-18` is source-resolved.

## 7. OPEN-P0 Register

Current production decisions include:

| ID | Decision |
|---|---|
| `P0-SA-01` | Saju transport |
| `P0-CM-01` | Web / Apple / Google commerce rail matrix |
| `P0-AI-01` | AI provider/model/fallback/validation implementation |
| `P0-AGE-01` | minimum age / character content policy |
| `P0-PR-01` | retention / backup / legal retention |
| `P0-AUTH-01` | API→PostgreSQL execution identity / RLS enforcement model |

`P0-CM-01` and `SRC-18` are independent:

```text
P0-CM-01 = which provider/platform rail is used
SRC-18    = what entitlement a verified purchased product authoritatively grants
```

One does not close the other.

## 8. Promotion Gate

No feature is called `production-ready`, `migration-complete`, or `final authority` solely because tables/functions exist.

```text
relevant source gap closed or affected behavior explicitly disabled
+ relevant P0 decided
+ clean migration/catalog evidence
+ positive/negative authorization/integrity tests
+ concurrency/idempotency evidence
+ command atomicity/failure recovery
+ public dependency contract evidence
+ client/E2E evidence where applicable
= promotion candidate
```

For commerce purchase→grant specifically:

```text
Purchase Intent DB authority PASS
≠ full commerce PASS

full purchase→entitlement path
requires P0-CM-01 + SRC-18 resolution + provider/restore evidence
```

## 9. Final Classification

```text
SPEC PACK STRUCTURE       = PASS
SOURCE TRACEABILITY       = PASS WITH EXPLICIT BLOCKERS
ERD → DDL BASELINE        = ACTIVE / 59 TABLES
IMPLEMENTATION START      = ALLOWED FOR SOURCE-COMPLETE SLICES
FINAL PRODUCTION BASELINE = BLOCKED WHERE SOURCE/P0 REMAINS OPEN
```

### Final statement

> Pack은 source authority를 구현 가능하게 구체화하는 문서이지 source에 없는 product semantics를 발명하는 authority가 아니다. `SRC-18` 발견으로 기존 commerce fulfillment registry 가정은 폐기되었고, Purchase Intent의 immutable minimal offer mapping boundary와 실제 product→entitlement mapping authority를 분리한다.
