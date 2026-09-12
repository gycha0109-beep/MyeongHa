# 명하 Saju Product Interpretation Inventory — PR #441 Authority Sync

> Repository: `gycha0109-beep/MyeongHa`  
> Purpose: delta sync after `SAJU_PRODUCT_INTERPRETATION_INVENTORY_SYNC_PR436_20260912.md`  
> Status: **GENERAL NATAL OBSERVATION SUBSTRATE DELTA / RESEARCH-ONLY / P0-CM-03 OPEN / NO-BUILD**  
> MyeongHa base main: `2053ac73ef4965113778acca7c0276e2baa3bd20`  
> Saju merged main: `d40411901863521a7e74f27b1813a1fd7778ad8a`  
> Authority delta input: Saju PR `#441` — `research(general-natal): materialize month-order transparency observations`

---

## 1. Verdict

Saju PR `#441` materializes a research-only canonical observation substrate for the next Gyeokguk candidate-derivation frontier.

It newly makes two operations executable and testable:

```text
1. enumerate canonical 月令 hidden-stem membership from derivedFacts.hiddenStems.month;
2. record exact visible heavenly-stem occurrence positions for each enumerated month hidden stem.
```

This is **observation authority only**. It does not authorize a generalized 透干 selection verdict, Gyeokguk candidate construction, establishment success/failure, General Natal production semantics, ProductHost delivery, or Commerce.

```text
GENERAL_NATAL_PRODUCTION_AUTHORITY = BLOCKED

monthOrderHiddenStemMembershipEnumerationAuthorized = true
visibleExactStemOccurrenceObservationAuthorized      = true
hiddenStemStorageOrderRankingAuthorized               = false
transparencySelectionPredicateAuthorized              = false
branchMeetingSelectionEffectAuthorized                = false
multipleCandidateRepresentationAuthorized             = false
candidateDerivationAuthorized                         = false
establishmentPredicateAuthorized                      = false
candidateFactsEmitted                                 = false
establishmentFactsEmitted                             = false

General Natal saleable = NO
P0-CM-03               = OPEN
Production Payment     = HOLD
Decision               = NO_BUILD
```

---

## 2. Canonical substrate now executable

PR `#441` reuses existing Saju canonical facts rather than introducing a second traditional-rule table:

```text
derivedFacts.hiddenStems.month
pillars.year.stem
pillars.month.stem
pillars.day.stem
pillars.hour.stem
```

For every resolved month hidden stem, the observation report may expose:

```text
stem
visibleExactStemPositions
exactVisibilityObserved
rankAssigned = false
selectionEffectEstablished = false
candidateEmitted = false
```

The implementation fails closed when the month pillar, month hidden-stem membership, or any of the four visible pillar stems is unresolved.

---

## 3. Storage-order and semantic boundary remains closed

The canonical hidden-stem array order remains **storage order only**.

The following interpretations remain forbidden:

```text
hiddenStems[0] -> 本氣 / strongest / first candidate
array index -> 中氣 / 餘氣 / strength
array order -> month-command duration
exact visible stem match -> complete 透干 selection verdict
plural exact matches -> precedence / stronger selection / multiple candidate verdict
```

PR `#441` records raw exact-occurrence positions only. It does not decide which positions count under a future generalized 透干 rule and does not attach source-semantic selection effect to an exact match.

---

## 4. Five coarse predicate-authority gaps remain OPEN

The same five blockers recorded after PR `#436` remain open:

```text
MONTH_ORDER_HIDDEN_STEM_SELECTION_PREDICATE_AUTHORITY_MISSING
VISIBLE_STEM_TRANSPARENCY_SELECTION_PREDICATE_AUTHORITY_MISSING
BRANCH_MEETING_SELECTION_EFFECT_AUTHORITY_MISSING
MULTIPLE_GEJU_CANDIDATE_REPRESENTATION_AUTHORITY_MISSING
GEJU_ESTABLISHMENT_SUCCESS_FAILURE_PREDICATE_AUTHORITY_MISSING
```

PR `#441` reduces the uncertainty beneath the first two blockers by providing governed canonical observation inputs, but does **not** close either blocker because selection semantics are still absent.

---

## 5. Inventory delta

| Inventory item | State after PR #436 | State after Saju PR #441 | Production impact |
|---|---|---|---|
| 月令 hidden-stem membership enumeration | canonical substrate existed, not frontier-materialized | **executable research observation** | none |
| exact visible-stem position observation | generic repository precedent only | **executable for 月令 hidden stems** | none |
| hidden-stem storage-order ranking | unauthorized | **still unauthorized** | blocked |
| generalized 透干 selection predicate | missing | **still missing** | blocked |
| 會支 selection/effect predicate | missing | **still missing** | blocked |
| zero/one/multiple candidate representation | missing | **still missing** | blocked |
| `GEJU_CANDIDATE` producer | unauthorized | **still unauthorized** | blocked |
| establishment predicate | unauthorized | **still unauthorized** | blocked |
| real-chart source-condition facts | unavailable | **unchanged** | blocked |
| General Natal production authority | blocked | **blocked** | blocked |
| Commerce | HOLD | **HOLD** | no build |

---

## 6. Saju verification evidence

Saju PR `#441` exact head:

```text
221cea98d7e2e2a9553d726b2c09383a120a52fe
```

Exact-head gates:

```text
CI #2619                               = SUCCESS
Production Calculation Container #674 = SUCCESS
PIE Prospective Shadow #973            = SUCCESS
```

Squash-merged Saju main:

```text
d40411901863521a7e74f27b1813a1fd7778ad8a
```

Merged-main gates:

```text
CI #2621                               = SUCCESS
Production Calculation Container #676 = SUCCESS
```

These gates prove repository integrity and deterministic observation behavior only. They do not upgrade semantic or commercial authority.

---

## 7. Product / API / Commerce boundary

MyeongHa must continue to treat the new report as research substrate only.

It must **not** use ProductHost, Character, LLM, API presentation, browser UX, SKU, price, PSP, payment, entitlement, refund, or Commerce logic to infer any missing rule.

```text
General Natal research progress          = YES
Canonical observation substrate progress = YES
Product semantic authority               = NO
General Natal product/runtime authority  = NO
Commerce implementation                  = HOLD
```

---

## 8. Smallest honest next frontier

The next evidence-bearing Saju frontier is a source-backed **generalized 透干 selection predicate** beyond raw exact-stem occurrence observation.

It must resolve, without overreach:

```text
1. positional scope: which pillar positions are semantically admissible for 透干 selection;
2. whether exact stem equality is sufficient, necessary, or only an observation input;
3. zero / one / plural visible matches;
4. conflict / coexistence / precedence semantics;
5. boundary between 透干 selection and later 會支 effects.
```

Until those predicates are source-governed, all five coarse Gyeokguk authority gaps remain open and `GENERAL_NATAL_PRODUCTION_AUTHORITY = BLOCKED` remains mandatory.
