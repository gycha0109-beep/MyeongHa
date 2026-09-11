# 명하 Saju Product Interpretation Inventory — PR #341 / #348 Authority Sync

> Repository: `gycha0109-beep/MyeongHa`  
> Purpose: delta sync for `docs/SAJU_PRODUCT_INTERPRETATION_INVENTORY_V1.md`  
> Status: **GENERAL NATAL AUTHORITY DELTA / NOT PRODUCT AUTHORITY / P0-CM-03 OPEN / NO-BUILD**  
> MyeongHa observed main: `818f7f1b3903285d59590b6e0e75c771fa012ce9`  
> Saju observed main: `6109b3167767479281368ef481a34aa6d27bf18d`  
> Authority delta inputs: Saju PR `#341` + PR `#348`  
> Prior inventory baseline: Saju PR `#332` + PR `#335` + PR `#339`

---

## 1. Verdict

Saju PR `#341` and PR `#348` materially improve the **research visibility of the missing General Natal source-condition resolver**, but they do not create a canonical source-condition resolver and do not authorize production semantics or Commerce.

The current chain remains:

```text
exact source condition
→ governed canonical structural / pattern / qualification resolution   [BLOCKED]
→ schema-bound lower-tier source-condition claim                      [RESEARCH PRODUCER EXISTS]
→ bounded reviewed semantic proposition                               [NOT AUTHORIZED]
→ authorized General Natal T8 synthesis                               [NOT AUTHORIZED]
→ ProductHost / API production delivery                               [NOT AUTHORIZED]
→ Commerce                                                            [HOLD]
```

Current authority verdict:

```text
GENERAL_NATAL_PRODUCTION_AUTHORITY = BLOCKED

RESEARCH_SOURCE_CONDITION_CLAIM_PRODUCER       = EXISTS
RESOLVER_READINESS_FRONTIER                    = EXISTS
CANONICAL_SOURCE_CONDITION_RESOLVER             = NOT_AUTHORIZED
SOURCE_CONDITION_FACTS_FROM_REAL_CHART           = UNAVAILABLE
SOURCE_SCOPED_BRANCH_BREAK_RESEARCH_SUBSTRATE    = EXISTS
SOURCE_SCOPED_BRANCH_BREAK_ADMISSION_AUTHORITY   = MISSING
NO_CLASH_BREAK_QUALIFICATION_AUTHORITY           = MISSING
GEJU_PRODUCER_AUTHORITY_READY                    = false

General Natal saleable = NO
P0-CM-03               = OPEN
Production Payment     = HOLD
Decision               = NO_BUILD
```

The following equivalences remain forbidden:

```text
unavailable source condition != false source condition

branch_break membership
!= 無衝破 qualification

absence of emitted source-scoped branch_break membership
!= authorized no-break verdict

research substrate exists
!= canonical derived fact exists

canonical calculation facts exist
!= source-condition predicate authority exists
```

---

## 2. PR #341 — resolver-readiness frontier

Saju PR `#341` introduced:

```text
src/research/general-natal-source-condition-resolver-frontier.ts
```

Merged Saju commit:

```text
b7018e44ddf201771fdaf2113f580489aab6032a
```

The frontier deliberately emits:

```text
status                      = blocked_authority_gap
canonicalResolverAuthorized = false
sourceConditionFactsEmitted = false
```

It observes existing canonical substrate but refuses to derive any of the four PR `#335` source-condition facts from raw chart material.

Target facts remain:

```text
derivedFacts.generalNatalSourceConditions.pianCaiGe
derivedFacts.generalNatalSourceConditions.yinShouGeApplicable
derivedFacts.generalNatalSourceConditions.shangGuanShangJin
derivedFacts.generalNatalSourceConditions.shiShenGeQualified
```

The frontier makes the remaining predicate gaps executable and inspectable instead of leaving them as prose-only TODOs.

Current gap vocabulary after PR `#348` refinement is:

```text
GEJU_CANDIDATE_DERIVATION_AUTHORITY_MISSING
GEJU_ESTABLISHMENT_PREDICATE_AUTHORITY_MISSING
SOURCE_APPLICABLE_CONTEXT_PREDICATE_AUTHORITY_MISSING
SHANG_GUAN_SHANG_JIN_QUALIFICATION_AUTHORITY_MISSING
DAY_MASTER_FLOURISHING_CLASSIFICATION_AUTHORITY_MISSING
FOOD_GOD_FLOURISHING_CLASSIFICATION_AUTHORITY_MISSING
NO_CLASH_BREAK_QUALIFICATION_AUTHORITY_MISSING
SOURCE_SCOPED_BRANCH_BREAK_ADMISSION_AUTHORITY_MISSING
```

PR `#341` therefore changes the inventory classification from an undifferentiated:

```text
UPSTREAM_SOURCE_CONDITION_RESOLVER = MISSING
```

to the more precise:

```text
RESOLVER_READINESS_FRONTIER        = EXISTS
CANONICAL_SOURCE_CONDITION_RESOLVER = NOT_AUTHORIZED
SOURCE_CONDITION_FACTS_FROM_REAL_CHART = UNAVAILABLE
```

It does **not** make a positive or negative source-condition verdict.

### PR #341 verification evidence

```text
exact head = 7a1f5e8364325ca0d0f04f57e84011fcc15c0b69
CI #2231                                = SUCCESS
Production Calculation Container #286   = SUCCESS
PIE Prospective Shadow #571              = SUCCESS

merged Saju/main = b7018e44ddf201771fdaf2113f580489aab6032a
merged-main CI #2233                     = SUCCESS
merged-main Production Container #288   = SUCCESS
```

---

## 3. PR #348 — source-scoped branch-break research substrate

Saju PR `#348` introduced:

```text
src/research/general-natal-source-scoped-branch-break.ts
```

and refined the resolver frontier to version:

```text
GENERAL_NATAL_SOURCE_CONDITION_RESOLVER_FRONTIER_VERSION = 0.2.0-research
```

Merged Saju commit:

```text
d1678a3a9fd068e821dc30b402d6919a9aa2f128
```

The research helper is explicitly scoped to:

```text
sanming_tonghui_v3_po_sha_direct_list
```

It records only the four direct positive pairs preserved by the selected `三命通會（四庫全書本）卷三 / 總論諸神煞 / 破煞` passage:

```text
卯午 = 묘 / 오
丑辰 = 축 / 진
子酉 = 자 / 유
未戌 = 미 / 술
```

Common modern extension pairs such as:

```text
寅亥
巳申
```

are not silently promoted into this source scope. They are negative fixtures for this source-specific research helper, not universal rejection claims about every tradition.

Every materialized research candidate remains bounded by:

```text
structuralMatchOnly                  = true
sourceScopedMembershipOnly          = true
universalBranchBreakAuthorized      = false
relationEffectAuthorized            = false
noClashBreakQualificationEstablished = false
consumerMeaningAuthorized           = false
```

Therefore PR `#348` closes only the previous statement that no branch-break research substrate was modeled.

It replaces the imprecise gap:

```text
BRANCH_BREAK_RELATION_NOT_MODELED
```

with:

```text
SOURCE_SCOPED_BRANCH_BREAK_ADMISSION_AUTHORITY_MISSING
```

while retaining:

```text
NO_CLASH_BREAK_QUALIFICATION_AUTHORITY_MISSING
```

### Canonical isolation

PR `#348` deliberately does **not** add `branch_break` to canonical `StructuralRelationKind` and does not modify production calculation semantics.

Current canonical structural-relation evidence is still insufficient to conclude:

```text
無衝破 = true
```

or:

```text
無衝破 = false
```

for the qualified 食神格 condition.

### PR #348 verification evidence

Final exact head after fresh-main synchronization:

```text
aafa336d7a564b2f401ea959ef9a384929829e5f
```

Exact-head gates:

```text
CI #2266                                = SUCCESS
Production Calculation Container #321   = SUCCESS
PIE Prospective Shadow #606              = SUCCESS
```

Merged Saju/main:

```text
d1678a3a9fd068e821dc30b402d6919a9aa2f128
```

Merged-main gates:

```text
CI #2271                                = SUCCESS
Production Calculation Container #326   = SUCCESS
```

---

## 4. Fresh Saju main revalidation

At this sync, Saju main is:

```text
6109b3167767479281368ef481a34aa6d27bf18d
```

The current `general-natal-source-condition-resolver-frontier.ts` still reports:

```text
reportVersion               = 0.2.0-research
status                      = blocked_authority_gap
canonicalResolverAuthorized = false
sourceConditionFactsEmitted = false
```

and still carries the source-scoped branch-break research substrate with:

```text
canonicalDerivedFact                 = false
universalBranchBreakAuthorized       = false
noClashBreakQualificationAuthorized  = false
```

The latest observed Saju main commit is Relationship research and does not itself grant General Natal production authority.

Accordingly this sync does not infer authority changes merely from repository head movement.

---

## 5. Updated authority inventory delta

| Inventory item | Previous V1 state | State after PR #341 / #348 | Production impact |
|---|---|---|---|
| Source-condition T3 normalizer / producer | EXISTS, research-only | unchanged | none |
| Canonical source-condition resolver | MISSING | **NOT AUTHORIZED; explicit readiness frontier EXISTS** | blocked |
| Resolver gap decomposition | prose-level / partial | **EXISTS as deterministic frontier report** | none |
| Real-chart four-condition facts | unavailable | **still unavailable** | blocked |
| Branch-break research substrate | not modeled | **EXISTS, source-scoped research-only** | none |
| Canonical branch-break derived fact | missing | **still missing / not admitted** | blocked |
| Universal 六破 authority | absent | **explicitly not authorized** | none |
| `無衝破` qualification | missing | **still missing** | blocked |
| Gyeokguk candidate derivation | missing authority | unchanged | blocked |
| Gyeokguk establishment predicate | missing authority | unchanged | blocked |
| `傷官傷盡` qualification | missing authority | unchanged | blocked |
| 日主生旺 classification | missing authority | unchanged | blocked |
| 食神生旺 classification | missing authority | unchanged | blocked |
| bounded reviewed General Natal T8 semantic proposition | missing | unchanged | blocked |
| General Natal production pack / preflight | missing | unchanged | blocked |
| General Natal ProductHost/API/browser production E2E | missing | unchanged | blocked |
| Commerce | HOLD | **HOLD** | no build |

---

## 6. Corrected interpretation of the old `UPSTREAM_SOURCE_CONDITION_RESOLVER = MISSING` line

The old inventory wording is now too coarse if read literally.

The correct post-PR `#341` / `#348` state is:

```text
A production/canonical resolver that can derive the four required facts = MISSING / NOT AUTHORIZED

A deterministic research object that inventories why the resolver cannot yet emit = EXISTS

A source-scoped research substrate for one sub-problem (branch-break membership) = EXISTS
```

These must not be collapsed into either:

```text
resolver exists
```

or:

```text
nothing exists upstream
```

The first would overstate authority; the second would discard real research progress.

---

## 7. Smallest honest next unblock path

The next work must reduce an actual predicate-authority gap rather than create product copy or Commerce infrastructure.

Current remaining sequence:

```text
1. Govern Gyeokguk candidate derivation.
2. Govern Gyeokguk establishment predicates for the relevant source-conditioned patterns.
3. Govern source-applicable-context predicates where required.
4. Govern 傷官傷盡 qualification.
5. Govern 日主生旺 classification.
6. Govern 食神生旺 classification.
7. Decide whether/how the source-scoped branch-break substrate may be admitted into a governed canonical qualification vocabulary.
8. Govern the compound 衝/破 effect predicate required by 無衝破; membership alone is insufficient.
9. Emit the four source-condition facts from real canonical chart execution only after those predicate authorities are closed.
10. Define bounded reviewed semantic propositions from those governed lower-tier facts.
11. Obtain exact-content review/attestation/trust.
12. Promote only the required production methodology/rules/claim schemas/pack.
13. Pass General Natal production preflight.
14. Verify ProductHost/API/browser production E2E.
15. Only then reconsider P0-CM-03 and Commerce.
```

The next likely high-leverage authority family remains Gyeokguk candidate/establishment because it is shared by `偏財格`, `印綬` applicable pattern context, and qualified `食神格`.

---

## 8. Product / API / Commerce impact

This delta does not authorize saleability.

```text
General Natal engine research progress = YES
Product semantic authority             = NO
ProductHost/API production wiring      = NOT YET AUTHORIZED FOR GENERAL NATAL
Commerce implementation                = HOLD
```

Infrastructure may exist generically, but ProductHost, Character, LLM, API presentation, or Commerce layers must not synthesize the missing semantic authority.

Forbidden until General Natal authority closes:

```text
actual SKU seed
actual price
PSP/provider binding
payment implementation
entitlement implementation
refund behavior changes
consumer copy presented as authoritative replacement for missing predicates
```

This sync therefore preserves the architecture rule:

```text
engine/research authority
→ reviewed semantic authority
→ production pack/preflight
→ ProductHost/API E2E
→ Commerce
```

not the reverse.