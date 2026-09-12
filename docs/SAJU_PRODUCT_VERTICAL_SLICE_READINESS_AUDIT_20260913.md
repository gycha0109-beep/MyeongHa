# MyeongHa Saju Product Vertical-Slice Readiness Audit — 2026-09-13

> Repository: `gycha0109-beep/MyeongHa`  
> Issue: `#722`  
> MyeongHa audit base: `9485546252cd3c70511275a52af2dea97bc75b1b`  
> Saju authority main: `532ae28db30d4c37ae1cc16b3035f1691fe22726`  
> Status: **NO PRODUCTION-AUTHORIZED SAJU VERTICAL SLICE IDENTIFIED / UPSTREAM AUTHORITY WORK REQUIRED**

Fresh-Saju drift note:

```text
previous audited Saju semantic anchor = 80502139f16ca93255a8e5dd3f70e6a11ea66103
fresh Saju main                      = 532ae28db30d4c37ae1cc16b3035f1691fe22726
net changed files                    = 4 Face Reading / FR170 files only
Saju product-interpretation semantic diff affecting this audit = 0
```

The `8050213... -> 532ae28...` compare contains only FR170 C2PA external trust-root provisioning workflow/package/research files. The General Natal #473 result and the Career/Wealth/Relationship/product-reading authority surfaces audited below are unchanged by that drift.

---

## 1. Purpose

This audit answers one narrow productization question after the Saju `#473` candidate-identity review and MyeongHa `#720` authority sync:

```text
Which Saju vertical slice can honestly move next from governed semantic authority
into a production MyeongHa product?
```

The audit deliberately separates seven different states that must not be collapsed:

```text
Reading Profile selector exists
!= InterpretationClaim exists
!= governed producer exists
!= research candidate pack exists
!= production interpretation authority exists
!= runtime ingress is reachable
!= saleable Commerce capability exists
```

No ProductHost, Character, LLM, API adapter, SKU mapper, pricing layer, PSP, entitlement, or narrative surface may manufacture missing Saju semantic authority.

---

## 2. Executive verdict

No audited Saju surface is currently eligible for honest production SKU activation.

The closest implementation-rich surfaces are Career, Wealth, and Relationship-General because they already have research Natal candidates plus annual/monthly period work and ProductHost-oriented E2E research paths. They are **not** production-authorized interpretations.

The current decision is therefore:

```text
NEXT_PRODUCTION_SKU = NONE
DOWNSTREAM_SKU_ACTIVATION = BLOCKED
PRODUCT_CAPABILITY_SEED_ACTIVATION = BLOCKED
OFFER_PRICE_ACTIVATION = BLOCKED
PAYMENT_ENTITLEMENT_ACTIVATION = BLOCKED
MISSING_AUTHORITY_OWNER = SAJU
DECISION = CONTINUE_UPSTREAM_AUTHORITY_WORK
```

---

## 3. Readiness matrix

| Surface | Profile selector | Producer / claim surface | Authority quality | Runtime reachability | Production interpretation authority | Product decision |
|---|---|---|---|---|---|---|
| General Natal | T8 selector exists | General-Natal research/evidence surface exists, but canonical Gyeokguk candidate + establishment facts are not emitted | Candidate bridge and establishment authority remain unresolved | Selection contract exists; semantic completion blocked | **BLOCKED** | `SAJU_AUTHORITY_DEPENDENCY` / `NO_BUILD` |
| Career Natal | T8 selector exists | `career-natal-reading-candidate.ts` research candidate + pack/composition | `secondary_only`, `fixture_matrix`, `contested`, `unreviewed`, status `research`; historical Career T8 synthesis gaps remain open | Research path exists | **NOT AUTHORIZED** | HOLD |
| Career Annual / Monthly | T8 + T9 required | Annual/monthly research candidates and E2E research paths exist | Research-only; no authority promotion | Research path exists | **NOT AUTHORIZED** because domain Natal T8 is not production-authorized | HOLD |
| Wealth Natal | T8 selector exists | `wealth-natal-reading-candidate.ts` research candidate + pack | `secondary_only`, `fixture_matrix`, `contested`, `unreviewed`, status `research`; cumulative dependency on General/Career research | Research path exists | **NOT AUTHORIZED** | HOLD |
| Wealth Annual / Monthly | T8 + T9 required | Annual/monthly research candidates and E2E research paths exist | Research-only; no authority promotion | Research path exists | **NOT AUTHORIZED** because Wealth Natal T8 is not production-authorized | HOLD |
| Relationship-General Natal | T8 selector exists | `relationship-natal-reading-candidate.ts` research candidate + pack | `secondary_only`, `fixture_matrix`, `contested`, `unreviewed`, status `research`; cumulative General/Career/Wealth research dependency | Research path exists | **NOT AUTHORIZED** | HOLD |
| Relationship-General Annual / Monthly | T8 + T9 required | Annual/monthly research candidates and E2E research paths exist | Research-only; no authority promotion | Research path exists | **NOT AUTHORIZED** because Relationship-General Natal T8 is not production-authorized | HOLD |
| Relationship-Spouse Natal | T8 selector exists | Separate governed Spouse-T8 research ledger | `2/5 CLOSED`, `3/5 OPEN`; `spouseT8ProducerReady=false` | No production spouse-T8 producer admitted | **HOLD** | HOLD |
| Compatibility | T10 selector exists | No admitted production T10 interpretation producer identified | SRC-08 unresolved | Direct Reading-create rejects target Birth and `domain='compatibility'` before trusted ID/persistence | **BLOCKED** | `CAPABILITY_UNAVAILABLE` |
| Question-Specific | T11 selector exists | No governed T11 producer identified in current Saju main | Profile authorization is selection-only | No production path established by the evidence audited here | **NOT ESTABLISHED** | HOLD / NO_BUILD |
| Life-stage / Daewoon interpretation | T9 `life_stage` selector exists | No dedicated governed `life_stage` / Daewoon interpretation producer identified in current Saju main | Selector existence is not claim/producer authority | No production interpretation path established by the evidence audited here | **NOT ESTABLISHED** | HOLD / NO_BUILD |

---

## 4. General Natal remains the central semantic dependency

Saju `#473` exact-head review and merge established a bounded negative result:

```text
SOURCE_USE_AND_PATTERN_WORDING_OBSERVED_PRE_ESTABLISHMENT_CANONICAL_CANDIDATE_STAGE_NOT_DEFINED
```

The following remain false / unauthorized:

```text
sourceUseToCanonicalCandidateBridgeAuthorized = false
sourcePatternWordingToPreEstablishmentCandidateBridgeAuthorized = false
canonicalCandidateStageDefinitionAuthorized = false
semanticUseDeduplicationIntoCandidateAuthorized = false
candidateIdentityAuthorized = false
multipleCandidateRepresentationAuthorized = false
candidateDerivationAuthorized = false
establishmentPredicateAuthorized = false
```

Therefore:

```text
GEJU_CANDIDATE = NOT_EMITTED
GEJU_ESTABLISHMENT_STATE = NOT_EMITTED
GENERAL_NATAL_PRODUCTION_AUTHORITY = BLOCKED
P0-CM-03 = OPEN
Commerce = HOLD
```

This blocks any downstream attempt to represent General Natal as complete merely because source-use wording, named pattern wording, or formation wording has been observed.

The five coarse authority gaps remain OPEN:

```text
MONTH_ORDER_HIDDEN_STEM_SELECTION_PREDICATE_AUTHORITY_MISSING
VISIBLE_STEM_TRANSPARENCY_SELECTION_PREDICATE_AUTHORITY_MISSING
BRANCH_MEETING_SELECTION_EFFECT_AUTHORITY_MISSING
MULTIPLE_GEJU_CANDIDATE_REPRESENTATION_AUTHORITY_MISSING
GEJU_ESTABLISHMENT_SUCCESS_FAILURE_PREDICATE_AUTHORITY_MISSING
```

---

## 5. Career is implementation-rich, not production-ready

Current Saju main contains:

```text
src/research/career-natal-reading-candidate.ts
```

The audited candidate identifies itself as research and exposes quality metadata equivalent to:

```text
provenance = secondary_only
testCoverage = fixture_matrix
methodologyStability = contested
reviewerStatus = unreviewed
status = research
```

The Natal candidate also consumes upstream General-Natal research rules; it is not an independent production authority island.

Saju PRs `#257` and `#259` add annual/monthly Career research paths, T9 candidate work, packs, and ProductHost-oriented E2E coverage. Their scope explicitly does **not** promote research authority.

The older governed Career authority program also remains materially open. Its recorded state includes:

```text
historical Career T8 synthesis authority gaps = 6 OPEN
executable authority-admission lanes = 0
personalized Career production promotion = HOLD
production impact = NONE
```

Examples of that frozen lineage include the global Career research hold in PR `#92`, the product-critical gap ordering in PR `#154`, and the candidate review in PR `#156`, which still reports zero admission-ready/current-method-compatible direct bridge candidates for the selected first gap.

Later Career annual/monthly productization research does not silently close those T8 authority gaps.

The important distinction is:

```text
Career implementation coverage = comparatively high
Career production semantic authority = absent
Career production-promotion preconditions = not satisfied
```

Accordingly, Career is a useful future vertical-slice target **only after** the relevant T8 authority gaps and promotion preconditions are separately closed. Activating a Career SKU now would turn research coverage into an unauthorized production claim.

---

## 6. Wealth is downstream of unresolved research authority

Current Saju main contains:

```text
src/research/wealth-natal-reading-candidate.ts
```

Its audited authority quality remains:

```text
provenance = secondary_only
testCoverage = fixture_matrix
methodologyStability = contested
reviewerStatus = unreviewed
status = research
```

The implementation composes a cumulative research chain rather than creating an independent production authority boundary:

```text
General research
-> Career research
-> Wealth research
```

Saju PRs `#262` and `#263` add annual/monthly Wealth research paths but do not promote production authority.

Therefore Wealth cannot bypass the unresolved authority below it merely because more domain-specific code exists.

---

## 7. Relationship-General is also a cumulative research surface

Current Saju main contains:

```text
src/research/relationship-natal-reading-candidate.ts
```

Its quality remains research-only:

```text
provenance = secondary_only
testCoverage = fixture_matrix
methodologyStability = contested
reviewerStatus = unreviewed
status = research
```

Its cumulative research dependency is broader again:

```text
General research
-> Career research
-> Wealth research
-> Relationship-General research
```

Saju PRs `#266` and `#269` add annual/monthly Relationship-General research paths and E2E surfaces, but again do not promote semantic authority.

Relationship-General therefore must not be mistaken for the separately governed Relationship-Spouse authority ledger.

---

## 8. Relationship-Spouse remains 2/5 HOLD

Fresh Saju spouse research continues to state:

```text
QUALIFYING_PRIMARY_WITNESS = CLOSED
INDEPENDENT_NORMATIVE_PROVENANCE = CLOSED
EXPLICIT_ROLE_NEUTRAL_NATAL_MAPPING = OPEN
CURRENT_GOVERNED_SEMANTIC_CORRESPONDENCE = OPEN
RELATIONSHIP_T6_INPUT = OPEN

authorityGapsClosed = 2/5
authorityGapsOpen = 3/5
authorityAdmissionReady = false
spouseT8ProducerReady = false
productionPromotionReady = false
Production = HOLD
```

Recent acquisition/discovery work remains deliberately non-promotional. Direct-body compatibility evidence may be positive for dyadic methods while still being negative or insufficient for the required single-native, role-neutral spouse selector.

No cross-source semantic stitching is authorized to manufacture the missing selector.

---

## 9. Annual / Monthly research does not bypass Natal T8

The profile composition contract requires both the domain Natal T8 evidence and the period T9 evidence for Career, Wealth, and Relationship-General annual/monthly readings.

Conceptually:

```text
Annual/Monthly domain product completeness
= production-authorized Natal T8
+ production-authorized period T9
```

A rich T9 research path cannot make the product complete while its T8 domain foundation is still research-only.

Therefore the existing annual/monthly work is valuable coverage, but it does not create a saleable product independently.

---

## 10. Compatibility T10 is intentionally fail-closed

The Reading profile registry admits a Compatibility profile that selects T10 evidence. That is selector authority only.

MyeongHa PR `#688` re-confirmed the current production ingress boundary:

```text
target Birth request
-> CAPABILITY_UNAVAILABLE

domain = compatibility
-> CAPABILITY_UNAVAILABLE
```

The rejection occurs before:

```text
trusted Session/Reading ID allocation
persistence authority execution
```

PR `#688` also explicitly keeps `SRC-08` unresolved and does not admit:

```text
second Birth snapshot
compatibility Reading creation
Product Reading transport
interpretation
```

Therefore Compatibility is not an incomplete-but-callable SKU. It is deliberately unavailable until its missing subject/semantic authority is implemented and governed.

---

## 11. Question-Specific T11 is profile-only under the audited evidence

The current Saju `reading-intent-composition.ts` defines:

```text
question_specific
-> temporalScope = natal
-> QUESTION_SPECIFIC_CLAIM_REQUIRED
-> taxonomy tier T11
```

The profile registry therefore knows how to select a T11 claim **if one exists**.

Current Saju main audit found no dedicated Question-Specific/T11 producer file in `src/reading`, no dedicated Question-Specific producer path in the repository tree, and no separately governed production promotion identified by the associated PR search.

The only honest conclusion from the audited evidence is:

```text
QUESTION_SPECIFIC_PROFILE_SELECTOR = PRESENT
QUESTION_SPECIFIC_PRODUCTION_T11_PRODUCER = NOT_ESTABLISHED
QUESTION_SPECIFIC_PRODUCT_READY = false
```

Absence of an identified governed producer must not be replaced by a generic LLM answer path and then relabeled as T11 authority.

---

## 12. Life-stage / Daewoon selection is not Daewoon product interpretation authority

The current profile composition includes a `life_stage` intent that selects T9 category `life_stage` evidence.

That proves only the shape of the selection contract:

```text
life_stage profile
-> T9 life_stage claim selector
```

The current Saju repository tree audit found no dedicated file path named for `life_stage`, `daewoon`, or `luck` interpretation producer, and no separately governed product-interpretation promotion was identified.

Accordingly:

```text
LIFE_STAGE_PROFILE_SELECTOR = PRESENT
DAEWOON_PRODUCT_INTERPRETATION_PRODUCER = NOT_ESTABLISHED
DAEWOON_PRODUCT_READY = false
```

Any existing calculation-level luck-cycle capability, if present elsewhere in the calculation engine, is a different authority surface:

```text
Daewoon calculation
!= Daewoon InterpretationClaim production
!= Daewoon consumer Reading product
```

This audit does not infer the absence of calculation functionality; it records that calculation cannot substitute for a governed interpretation producer.

---

## 13. Reading Profile existence remains selection-only authority

Current Saju `reading-profile-authorization.ts` admits the profile registry under:

```text
reading_evidence_selection_only
```

That boundary is decisive for this audit.

For every profile:

```text
profile exists
-> selector contract is admitted

profile exists
-X-> required InterpretationClaim exists
-X-> producer is production-authorized
-X-> runtime is reachable
-X-> SKU is saleable
```

The product layer must consume the actual resulting coverage state and governed authority; it may not derive saleability from a profile ID alone.

---

## 14. Why no vertical slice may be activated now

Every candidate fails at least one mandatory authority layer:

```text
General Natal
-> unresolved canonical candidate / establishment semantics

Career
-> research-only, secondary-only, contested, unreviewed T8
-> historical Career T8 synthesis authority gaps remain open

Wealth
-> research-only + upstream General/Career research dependency

Relationship-General
-> research-only + cumulative General/Career/Wealth research dependency

Relationship-Spouse
-> 2/5 authority ledger; producer not ready

Compatibility
-> T10 selector only + SRC-08 + runtime CAPABILITY_UNAVAILABLE

Question-Specific
-> T11 selector present; production producer not established

Life-stage / Daewoon
-> T9 selector present; product interpretation producer not established
```

Therefore there is no honest downstream-only implementation that can convert the current inventory into a saleable Saju Reading without crossing an authority boundary.

---

## 15. Next honest frontier

The next step belongs upstream in Saju, not in MyeongHa Commerce.

### Primary frontier — General Natal semantic authority

Continue only source-backed work on one of the unresolved bridges already frozen by Saju `#473`:

1. generalized month-order hidden-stem selection predicate;
2. complete visible-stem transparency selection predicate, including slot admissibility;
3. branch-meeting selection/effect semantics distinct from structural formation;
4. a source that explicitly distinguishes pre-establishment candidate identity from established `格` identity; or
5. generalized establishment success/failure semantics with all required interaction-settlement inputs.

### Secondary frontier — Career authority prerequisites, not immediate promotion

Career is the most implementation-rich domain candidate, but its older governed authority lineage still reports six historical Career T8 synthesis gaps open and no production promotion.

Therefore an immediate `research -> production` flip or promotion review that assumes semantic completeness is **not** authorized.

A future promotion review becomes meaningful only after the relevant Career T8 authority gaps have separately progressed and must then cover at minimum:

```text
provenance quality
methodology stability
reviewer status
historical Career T8 gap closure state
upstream General dependency
production rule/claim admission
pack/narrative grounding
```

Existing research code, fixtures, narrative reachability, annual/monthly paths, and E2E coverage are verification assets; they are not promotion evidence by themselves.

---

## 16. Downstream prohibition

Until upstream authority changes are merged and synchronized, MyeongHa must not use any of the following as a substitute:

```text
ProductHost-generated missing semantics
Character-generated missing semantics
LLM-generated missing selectors or claims
profile IDs as proof of claim existence
research packs as production packs
calculation output as interpretation authority
API reachability as semantic authority
payment success as interpretation authority
entitlement grant as interpretation authority
```

No Product/Capability seed, Offer/Price row, PSP path, entitlement grant, paid Reading finalization, `reading_refs`, or grounded narrative should represent these blocked surfaces as production-authorized.

---

## 17. Closure decision

This audit does not identify a production-ready Saju SKU.

It does identify the correct next work boundary:

```text
MyeongHa downstream productization expansion = STOP
Saju upstream authority work = CONTINUE
General Natal authority frontier = PRIMARY
Career T8 authority-gap progress = SECONDARY
Career production-promotion review = DEFERRED UNTIL PREREQUISITES CHANGE
Commerce = HOLD FOR THESE SAJU SURFACES
```

This is a readiness decision, not an abandonment of the existing research implementation. The existing Career/Wealth/Relationship period work remains useful evidence and future integration coverage; it is simply not promoted beyond the authority it currently owns.
