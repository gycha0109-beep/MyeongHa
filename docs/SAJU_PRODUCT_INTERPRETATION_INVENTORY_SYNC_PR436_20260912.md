# 명하 Saju Product Interpretation Inventory — PR #436 Authority Sync

> Repository: `gycha0109-beep/MyeongHa`  
> Purpose: delta sync for `docs/SAJU_PRODUCT_INTERPRETATION_INVENTORY_V1.md` and the prior PR `#341/#348` General Natal authority sync  
> Status: **GENERAL NATAL AUTHORITY DELTA / RESEARCH-ONLY / P0-CM-03 OPEN / NO-BUILD**  
> MyeongHa base main: `eac64637fdeb172fde1d68dbdb3eaa0b1aa4deec`  
> Saju merged main: `b6550a3a9d88e00eb296b7b02bc6e29af1115c0a`  
> Authority delta input: Saju PR `#436` — `research(general-natal): bind Gyeokguk candidate source frontier`

---

## 1. Verdict

Saju PR `#436` records a source-backed research boundary for Gyeokguk candidate selection around `月令`, `透干`, and `會支`, and makes the remaining candidate/establishment predicate gaps more precise.

It does **not** authorize an actual Gyeokguk candidate producer, establishment verdict, General Natal production semantics, ProductHost delivery, or Commerce.

```text
GENERAL_NATAL_PRODUCTION_AUTHORITY = BLOCKED

RESEARCH_SOURCE_CONDITION_CLAIM_PRODUCER = EXISTS
RESOLVER_READINESS_FRONTIER              = EXISTS
GEJU_CANDIDATE_SOURCE_BOUNDARY           = EXISTS
CANONICAL_SOURCE_CONDITION_RESOLVER      = NOT_AUTHORIZED
SOURCE_CONDITION_FACTS_FROM_REAL_CHART   = UNAVAILABLE

candidateDerivationAuthorized            = false
establishmentPredicateAuthorized         = false
candidateFactsEmitted                    = false
establishmentFactsEmitted                = false
GEJU_PRODUCER_AUTHORITY_READY            = false

General Natal saleable = NO
P0-CM-03               = OPEN
Production Payment     = HOLD
Decision               = NO_BUILD
```

---

## 2. Source-backed boundary added by Saju PR #436

The research frontier records only the following bounded source observations:

```text
1. 月令 is a primary organizing context for Gyeokguk structure.
2. 月令所藏 may be plural; hidden-stem storage order is not ranking authority.
3. 透干 / 會支 are source-observed candidate-selection axes.
4. A source may permit plural/coexisting selections.
5. Candidate selection and later 成敗 / establishment judgment are separate stages.
```

The source review therefore permits the architecture to represent a candidate-selection surface, but not to invent a universal executable selection algorithm.

The following shortcuts remain forbidden:

```text
hiddenStems[0] -> main qi / candidate priority
month branch identity -> established Gyeokguk
Ten-God presence -> GEJU_CANDIDATE
raw structural relation membership -> governed 會支 selection/transformation effect
candidate -> GEJU_ESTABLISHMENT_STATE=true
```

---

## 3. New refined predicate gaps

PR `#436` refines the existing umbrella gaps:

```text
GEJU_CANDIDATE_DERIVATION_AUTHORITY_MISSING
GEJU_ESTABLISHMENT_PREDICATE_AUTHORITY_MISSING
```

into the following executable research frontier:

```text
MONTH_ORDER_HIDDEN_STEM_SELECTION_PREDICATE_AUTHORITY_MISSING
VISIBLE_STEM_TRANSPARENCY_SELECTION_PREDICATE_AUTHORITY_MISSING
BRANCH_MEETING_SELECTION_EFFECT_AUTHORITY_MISSING
MULTIPLE_GEJU_CANDIDATE_REPRESENTATION_AUTHORITY_MISSING
GEJU_ESTABLISHMENT_SUCCESS_FAILURE_PREDICATE_AUTHORITY_MISSING
```

The umbrella blockers remain open until governed runtime predicates can actually emit the relevant facts.

---

## 4. Existing resolver interaction remains fail-closed

PR `#436` does not change the authority status of the four source-condition facts required by the existing General Natal research producer:

```text
derivedFacts.generalNatalSourceConditions.pianCaiGe            = unavailable
derivedFacts.generalNatalSourceConditions.yinShouGeApplicable  = unavailable
derivedFacts.generalNatalSourceConditions.shangGuanShangJin    = unavailable
derivedFacts.generalNatalSourceConditions.shiShenGeQualified   = unavailable
```

The existing resolver frontier therefore remains:

```text
GENERAL_NATAL_SOURCE_CONDITION_RESOLVER_FRONTIER_VERSION = 0.2.0-research
canonicalResolverAuthorized = false
sourceConditionFactsEmitted = false
```

A fully resolved canonical chart is still insufficient to emit a Gyeokguk verdict merely because canonical pillars, hidden stems, Ten-Gods, or structural relations exist.

---

## 5. Inventory delta

| Inventory item | Prior state | State after Saju PR #436 | Production impact |
|---|---|---|---|
| Gyeokguk candidate source boundary | coarse blocker only | **EXISTS, research-only** | none |
| 月令 organizing-context evidence | not executable as a bounded frontier | **recorded** | none |
| hidden-stem candidate selection predicate | missing | **still missing; refined gap** | blocked |
| 透干 selection predicate | missing | **still missing; refined gap** | blocked |
| 會支 selection/effect predicate | missing | **still missing; refined gap** | blocked |
| zero/one/multiple candidate representation | missing | **still missing; refined gap** | blocked |
| candidate derivation producer | missing authority | **still not authorized** | blocked |
| establishment success/failure predicate | missing authority | **still not authorized** | blocked |
| real-chart source-condition facts | unavailable | **still unavailable** | blocked |
| bounded reviewed General Natal T8 semantics | missing | unchanged | blocked |
| General Natal production pack/preflight | missing | unchanged | blocked |
| ProductHost/API/browser General Natal E2E | missing | unchanged | blocked |
| Commerce | HOLD | **HOLD** | no build |

---

## 6. Verification evidence

Saju PR `#436` exact head:

```text
7bf0480c532718e15be67dd154b128177114f32b
```

Exact-head gates observed before merge:

```text
CI #2610                                = SUCCESS
Production Calculation Container #665   = SUCCESS
PIE Prospective Shadow #966              = SUCCESS
```

Squash-merged Saju main:

```text
b6550a3a9d88e00eb296b7b02bc6e29af1115c0a
```

This verification proves repository integrity only. It does not upgrade semantic authority.

---

## 7. Smallest honest next frontier

The next Saju work should continue to reduce predicate authority gaps rather than create product or Commerce surface.

Ordered frontier:

```text
1. Govern month-order hidden-content selection inputs without using storage order as rank.
2. Govern visible-stem 透干 matching / selection semantics.
3. Govern branch-meeting selection / transformation effect semantics.
4. Govern zero / one / multiple Gyeokguk candidate representation and precedence/conflict policy.
5. Only then govern establishment success/failure predicates.
```

The first practical executable target is therefore the **GEJU candidate derivation predicate family**, starting with source-scoped month-order hidden-content enumeration/selection inputs plus visible-stem transparency matching, while keeping establishment authority closed.

---

## 8. Product / API / Commerce impact

This delta is inventory/governance synchronization only.

```text
General Natal research progress        = YES
Product semantic authority             = NO
General Natal product/runtime authority = NO
Commerce implementation                = HOLD
```

Until General Natal authority closes, MyeongHa must not use ProductHost, Character, LLM, API presentation, SKU, price, PSP, payment, entitlement, or refund behavior to synthesize the missing predicates.
