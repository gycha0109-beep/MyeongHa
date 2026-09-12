# 명하 Saju Product Interpretation Inventory V1

> Repository: `gycha0109-beep/MyeongHa`  
> Status: **CROSS-DOMAIN AUTHORITY INVENTORY / NOT PRODUCT AUTHORITY / NO PRODUCTION SKU READY**  
> MyeongHa observed main: `cbc52fe7e5b61cb8cf2d4381efc4d0f9c5af42d2`  
> Saju observed main: `27479502607207cd3af2dc3b21118d81fa163d42`  
> Cross-domain readiness authority: `docs/SAJU_PRODUCT_VERTICAL_SLICE_READINESS_AUDIT_20260913.md`  
> General Natal authority sync inputs: Saju PR `#332` + PR `#335` + PR `#339`  
> Product interpretation authority: `MyeongHa_Saju_Product_Interpretation_Architecture_v1.2_FINAL_REVIEWED(1).md`  
> Saju production audit: `gycha0109-beep/Saju/docs/product/22-production-interpretation-authority-audit.md`  
> Source-conditioned topology authority: `gycha0109-beep/Saju/docs/research/general-natal-t8-source-conditioned-topology-20260907.md`  
> Source-conditioned lower-tier producer: `gycha0109-beep/Saju/src/research/general-natal-source-conditioned-lower-tier-producer.ts`

---

## 1. Cross-domain verdict

This inventory consolidates the current product-readiness boundary for General, Career, Wealth, Relationship, T9 annual/monthly, T10 Compatibility, T11 Question-Specific, and life-stage/Daewoon while retaining the General Natal deep-dive below as supporting detail.

The governing invariant is:

```text
Reading Profile / selector exists
!= InterpretationClaim exists
!= governed producer exists
!= production interpretation authority exists
!= MyeongHa product runtime is saleable
!= Commerce is authorized
```

The latest Saju drift after the `#723` readiness audit is non-promotional Relationship/Spouse evidence work. It does not admit a new production producer or change the readiness verdict.

Current decision:

```text
NEXT_PRODUCTION_SKU       = NONE
DOWNSTREAM_SKU_ACTIVATION = BLOCKED
MISSING_AUTHORITY_OWNER   = SAJU
COMMERCE                  = HOLD
```

No row below may be promoted merely because a profile, selector, research candidate, calculation helper, generic runtime, or payment capability exists.

---

## 2. Authority classification vocabulary

The three readiness dimensions are deliberately separate:

```text
SAJU_SEMANTIC_READY
= the exact interpretation semantics have governed production authority

MYEONGHA_PRODUCT_READY
= a production consumer/runtime can consume that governed authority fail-closed

COMMERCE_READY
= the product may honestly be represented as saleable and connected to price/payment/entitlement
```

For supporting objects, this inventory uses:

```text
EXISTS + PRODUCTION AUTHORIZED
EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE
MISSING / NOT ESTABLISHED
```

Additional non-equivalences remain binding:

```text
active claim state
!= production authorization

coverageState=complete
!= minimum useful paid product proven

research producer exists
!= production-authorized producer exists

calculation output exists
!= interpretation authority exists

profile selection authorization
!= semantic promotion authorization
```

---

## 3. Cross-domain readiness ledger

| Surface | Selector / profile | Source producer / claim surface | MyeongHa provider / runtime | SAJU_SEMANTIC_READY | MYEONGHA_PRODUCT_READY | COMMERCE_READY | Production readiness / primary blocker | Evidence path |
|---|---|---|---|---|---|---|---|---|
| **General Natal (T8)** | `general -> general-natal`; T8 `category=general` selection contract exists | General-Natal research candidates exist; PR `#339` adds a strict research-only T3 source-condition producer, but the canonical resolver and reviewed production T8 semantic chain remain incomplete | Generic Reading/ProductHost infrastructure exists; reachability cannot substitute for missing semantic authority | **NO** | **NO** | **NO** | `NOT_PRODUCTION_READY` / `SAJU_AUTHORITY_DEPENDENCY`; P0-CM-03 remains open | this document §§4–7; `docs/SAJU_PRODUCT_VERTICAL_SLICE_READINESS_AUDIT_20260913.md` §§3–4; `Saju/src/research/general-natal-source-conditioned-lower-tier-producer.ts` |
| **Career Natal (T8)** | Career T8 selector/profile exists | `Saju/src/research/career-natal-reading-candidate.ts`; research candidate/pack; authority quality remains `secondary_only`, `fixture_matrix`, `contested`, `unreviewed`, `status=research` | Research path exists; no production product claim may be inferred from reachability | **NO** | **NO** | **NO** | `NOT_PRODUCTION_READY` / `SAJU_AUTHORITY_DEPENDENCY`; historical Career T8 synthesis authority gaps remain open | `docs/SAJU_PRODUCT_VERTICAL_SLICE_READINESS_AUDIT_20260913.md` §§3,5 |
| **Wealth Natal (T8)** | Wealth T8 selector/profile exists | `Saju/src/research/wealth-natal-reading-candidate.ts`; research-only and cumulatively dependent on unresolved General/Career research authority | Research path exists; no production product guarantee established | **NO** | **NO** | **NO** | `NOT_PRODUCTION_READY` / `SAJU_AUTHORITY_DEPENDENCY` | `docs/SAJU_PRODUCT_VERTICAL_SLICE_READINESS_AUDIT_20260913.md` §§3,6 |
| **Relationship (T8)** | Relationship-General and Relationship-Spouse selectors/profiles exist | General: `Saju/src/research/relationship-natal-reading-candidate.ts` research-only. Spouse: separately governed T8 ledger remains `2/5 CLOSED`, `3/5 OPEN`, `spouseT8ProducerReady=false` | Research/selection paths exist; no production Relationship product guarantee established | **NO** | **NO** | **NO** | `NOT_PRODUCTION_READY` / `SAJU_AUTHORITY_DEPENDENCY`; Spouse production remains HOLD | `docs/SAJU_PRODUCT_VERTICAL_SLICE_READINESS_AUDIT_20260913.md` §§3,7–8; current Saju Spouse T8 ledger/evidence chain |
| **T9 Annual / Monthly** | Domain annual/monthly composition requires domain Natal T8 + period T9 evidence | Career/Wealth/Relationship-General annual/monthly research candidates/E2E research paths exist; no authority promotion follows from those paths | Research path exists; no independently saleable period product established | **NO** | **NO** | **NO** | `NOT_PRODUCTION_READY`; production-authorized Natal T8 foundation is absent and period research cannot bypass it | `docs/SAJU_PRODUCT_VERTICAL_SLICE_READINESS_AUDIT_20260913.md` §§3,9 |
| **T10 Compatibility** | Compatibility Reading profile selects T10 evidence | No admitted production T10 interpretation producer identified; `SRC-08` remains unresolved | Production ingress is intentionally fail-closed: target Birth and `domain=compatibility` return `CAPABILITY_UNAVAILABLE` before trusted Reading ID allocation/persistence | **NO** | **NO** | **NO** | `NOT_PRODUCTION_READY` / `CAPABILITY_UNAVAILABLE` + unresolved `SRC-08` | `docs/SAJU_PRODUCT_VERTICAL_SLICE_READINESS_AUDIT_20260913.md` §10; MyeongHa PR `#688` |
| **T11 Question-Specific** | `question_specific` selection contract targets T11 / `QUESTION_SPECIFIC_CLAIM_REQUIRED` | No dedicated governed production T11 producer established by the audited Saju tree | No production Question-Specific product path established by the audited evidence | **NO** | **NO** | **NO** | `NOT_PRODUCTION_READY` / `SAJU_PRODUCT_BINDING_MISSING`; selector presence is selection-only authority | `docs/SAJU_PRODUCT_VERTICAL_SLICE_READINESS_AUDIT_20260913.md` §§11,13 |
| **Life-stage / Daewoon** | `life_stage` profile selects T9 `life_stage` evidence | No dedicated governed life-stage/Daewoon interpretation producer established; calculation-level luck-cycle capability, if present, is a separate authority surface | No production Daewoon interpretation product path established | **NO** | **NO** | **NO** | `NOT_PRODUCTION_READY` / `SAJU_PRODUCT_BINDING_MISSING`; helper/calculation capability cannot act as interpretation guarantor | `docs/SAJU_PRODUCT_VERTICAL_SLICE_READINESS_AUDIT_20260913.md` §§12–13 |

### 3.1 Fail-closed reading of this ledger

The table records the strongest state supported by current evidence. It intentionally does **not** infer a producer from a selector, infer semantics from a generic LLM path, infer interpretation from calculation output, or infer saleability from payment infrastructure.

For Career, Wealth, and Relationship-General annual/monthly products:

```text
period product completeness
= production-authorized domain Natal T8
+ production-authorized period T9
```

Current research coverage on either side does not satisfy that equation.

For T10/T11/Daewoon:

```text
selector/config/helper present
-X-> governed production interpretation producer present
-X-> production MyeongHa product present
-X-> Commerce authorized
```

---

# General Natal supporting deep-dive

The following General Natal inventory remains the point-level supporting analysis. The current cross-domain ledger above controls the top-level readiness statement; the older General-specific research lineage remains useful evidence rather than a separate release decision.

## 4. General Natal Reading Profile authority

Current Saju source resolves a General Natal Reading Profile whose required evidence selects T8 `category=general` claims. The profile is selection-authorized under a selection-only boundary.

```text
profile exists / selection authorized
!=
interpretation semantics authorized
```

A narrow structural research claim can satisfy the thin selector without proving a minimum-useful paid General Natal artifact.

```text
Reading Profile complete
!=
minimum useful paid General Natal artifact proven
```

Saleability must therefore not use profile coverage alone as a product-quality or semantic-authority proxy.

---

## 5. Exact General Natal research candidates

### 5.1 Structural-summary candidate

| Authority Object | Repository Path | Lifecycle | Production Authorized? | Evidence / Gap |
|---|---|---|---|---|
| methodology / rules / pack | `Saju/src/research/general-natal-t8-structural-summary-candidate.ts` | `research` | NO | bounded General T8 wrapper over month-branch evidence; intentionally neutral/non-conclusive |
| upstream methodology | `Saju/src/research/i18a-month-branch-strength-evidence.ts` | `research` | NO | T2 month-branch relation only; explicitly not final strength classification |
| ReviewAttestation | candidate registry | — | NO | no exact-content domain attestation |
| production claim contract | candidate registry | — | NO | production semantic value contract absent |

### 5.2 Minimum-useful-reading candidate

| Authority Object | Repository Path | Lifecycle | Production Authorized? | Evidence / Gap |
|---|---|---|---|---|
| methodology / T5 / T8 rules / pack | `Saju/src/research/general-natal-useful-reading-candidate.ts` | `research` | NO | broad whole-chart Ten-God family/channel themes are not a lossless representation of qualified classical source conditions |
| inputs | same | deterministic research input | NO | `derivedFacts.tenGods` / broad family presence is insufficient authority for the exact source-conditioned propositions |
| ReviewAttestation / production claim schema | candidate registry | — | NO | not supplied |

Required disposition remains:

```text
RESEARCH REWORK REQUIRED BEFORE PROMOTION
```

### 5.3 Conclusion-synthesis candidate

| Authority Object | Repository Path | Lifecycle | Production Authorized? | Evidence / Gap |
|---|---|---|---|---|
| methodology / rules / pack | `Saju/src/research/general-natal-conclusion-synthesis-candidate.ts` | `research` | NO | source/governance and atomic-product scope remain unresolved |
| conclusion surface | same | research | NO | includes `work`, `money`, `relationship` conclusion kinds under General taxonomy; conflicts with atomic General product boundary |
| ReviewAttestation / production claim schema | candidate registry | — | NO | not supplied |

Required disposition remains:

```text
DO NOT PROMOTE AS-IS
```

### 5.4 Source-conditioned lower-tier producer

Saju PR `#339` adds a real research-only source-condition-preserving lower-tier producer:

```text
path        = Saju/src/research/general-natal-source-conditioned-lower-tier-producer.ts
methodology = M-GEJU-SOURCE-CONDITION-NORMALIZATION@0.1.0-research
claimType   = GEJU_SOURCE_CONDITION_STATE@0.1.0-research
schema      = SCHEMA-GEJU-SOURCE-CONDITION-STATE@0.1.0-research
pack        = PACK-GENERAL-NATAL-SOURCE-CONDITION-LOWER-TIER-CANDIDATE@0.1.0-research
claim tier  = T3 / category=gyeokguk / subcategory=source_condition
contract    = registered_required
review      = unreviewed / no ReviewAttestation
```

Its source-condition contract deliberately rejects the shortcut from generic Ten-God presence to consumer semantics:

```text
sourceConditionPreserved    = true
rawTenGodPresenceSufficient = false
consumerMeaningAuthorized   = false
```

The producer emits only from explicitly resolved source-condition facts and does not establish those conditions itself from raw pillars or `derivedFacts.tenGods`.

Therefore:

```text
RESEARCH_SOURCE_CONDITION_CLAIM_PRODUCER = EXISTS
UPSTREAM_SOURCE_CONDITION_RESOLVER       = MISSING
PRODUCTION_AUTHORIZED_GEJU_CHAIN         = MISSING
BOUNDED_REVIEWED_GENERAL_T8_SEMANTICS    = MISSING
GENERAL_NATAL_PRODUCTION_AUTHORITY       = BLOCKED
```

---

## 6. General Natal 22-point production authority inventory

| # | Authority / Verification Item | Classification | Exact finding | Required next action |
|---:|---|---|---|---|
| 1 | methodologyId | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | General Natal T8 research methodologies exist and PR #339 adds `M-GEJU-SOURCE-CONDITION-NORMALIZATION@0.1.0-research` | implement/review the upstream source-condition resolver and then select only bounded General Natal semantic methodologies |
| 2 | methodology lifecycle/status | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | relevant General Natal and PR #339 methodologies remain `research`; PR #339 rules are `unreviewed` | domain review before any production admission; no label-only promotion |
| 3 | source provenance | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | PR #332/#335 provide acquisition/locator evidence; PR #339 binds a Kanripo source object to four research rules but does not create production primary-witness promotion | complete production witness qualification and review for the exact resolver→rule chain |
| 4 | scholarly/primary source locators | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | `[005-49a]`, `[005-56b]`, `[005-81b]/[005-82a]`, `[005-84b]` are bound to exact research source-condition rules | retain those qualifiers through the upstream resolver and domain review; locator presence alone is not production authority |
| 5 | required input contract | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | PR #339 has a strict required-fact contract for four `derivedFacts.generalNatalSourceConditions.*` paths and forbids substitution by broad Ten-God presence; the canonical calculation layer does not currently supply those facts | implement a governed canonical source-condition resolver with ambiguity-preserving outputs matching or superseding this contract |
| 6 | ruleId | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | four explicit source-condition rules exist: Pian-Cai-Ge, Yin-Shou applicable, Shang-Guan-Shang-Jin, Shi-Shen qualified | review exact resolver predicates and only then add bounded downstream semantic rules |
| 7 | rule lifecycle/status | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | PR #339 rules are deterministic `research / unreviewed / fixture_matrix` | genuine domain review + exact-content attestation required before promotion |
| 8 | interpretationPackId | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | `PACK-GENERAL-NATAL-SOURCE-CONDITION-LOWER-TIER-CANDIDATE@0.1.0-research` exists with `registered_required` claim contracts | retain research isolation until resolver, semantic T8 rules, review, and preflight close |
| 9 | pack lifecycle/status | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | source-condition pack and existing General Natal candidate packs are `research` | no production pack until full authorized chain exists |
| 10 | T8 claim type | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | existing General Natal T8 candidate claim types remain research; PR #339 adds a governed **T3** claim contract, not a bounded reviewed T8 semantic contract | define/review exact T8 semantic ClaimTypeDefinition/value schemas sourced from authorized lower-tier claims |
| 11 | claim producer | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | PR #339 provides a strict source-condition-preserving **research T3 producer**; the upstream resolver is missing and no production-authorized producer chain exists | implement the upstream resolver, then connect only reviewed bounded semantic/T8 producers; do not regress to broad Ten-God presence |
| 12 | claim metadata/state | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | PR #339 schema enforces `sourceConditionPreserved=true`, `rawTenGodPresenceSufficient=false`, `consumerMeaningAuthorized=false`; runtime `active` remains execution state only | retain strict schema boundary through review/production contracts and keep consumer copy outside semantic authority |
| 13 | evidence group compatibility | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | PR #339 emits T3 only and therefore does not itself satisfy General Natal `T8 + category=general`; existing research T8 claims can still satisfy the thin selector | require minimum-useful semantics from authorized source-conditioned T8 claims before saleability |
| 14 | ReviewAttestation | **MISSING** | no General Natal exact-content domain attestation closes the source-conditioned production chain | obtain genuine domain review after resolver and downstream semantic rule content are finalized; pin attestations to exact hashes |
| 15 | reviewer identity / trust grant | **MISSING** | no trust grant pins a General Natal source-conditioned attestation set | establish reviewer trust only after genuine attestations exist |
| 16 | fixtures | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | PR #339 adds exact-condition positives and partial-qualifier negatives for the T3 normalizer | add canonical resolver fixtures proving how real chart facts establish/not-establish each condition; keep provenance-clean |
| 17 | negative tests | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | PR #339 proves incomplete qualifiers do not emit and ordinary `derivedFacts.tenGods` cannot substitute for source condition | extend negatives to upstream resolver and downstream semantic/T8 layers |
| 18 | ambiguity tests | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | PR #339 preserves ambiguous source-condition input as `skipped_ambiguous_input`; canonical resolver ambiguity/scenario E2E is absent | add end-to-end resolver/scenario matrices for disputed or unresolved establishment/qualification states |
| 19 | boundary tests | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | strict claim schema rejects consumer-domain fields and production composition remains fail-closed | extend cross-domain boundary tests to future T8 semantic layer and ProductHost presentation path |
| 20 | execution preflight | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | generic production gate exists and research pack correctly fails production composition | successful `buildInterpretationExecutionPlan()` on the exact authorized General Natal production registry/pack required |
| 21 | browser/API runtime reachability | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | generic ProductHost/HTTP infrastructure exists, but no authorized General Natal production registry is wired through it | wire exact source-conditioned production authority only after preflight succeeds; do not use test-only claim injection as semantic evidence |
| 22 | production E2E evidence | **MISSING** | no General Natal production ProductHost/browser/API E2E proves the complete authorized resolver→T3→T8 chain | add exact-head production E2E only after semantic authorization passes |

---

## 7. General Natal smallest honest unblock path

The remaining sequence is:

```text
1. Implement a governed canonical upstream resolver for the required source conditions.
2. Preserve candidate/established/applicable/qualified and ambiguous states without collapsing them to generic Ten-God presence.
3. Add resolver-level positive, negative, ambiguity, and adversarial fixtures.
4. Define bounded General Natal semantic claim types/T8 synthesis separate from consumer prose and adjacent domains.
5. Bind exact source locators/provenance and approved resolver outputs to downstream semantic rules.
6. Define exact production ClaimTypeDefinition/value schemas for bounded T8 propositions.
7. Obtain genuine domain review and content-addressed ReviewAttestation.
8. Establish reviewer trust for the exact approved attestation set.
9. Promote only the reviewed methodology/rules required by the atomic General Natal path.
10. Build a production pack with registered-required claim contracts.
11. Pass production execution preflight on the exact registry snapshot.
12. Verify ProductHost/API/browser E2E for the General Natal profile.
13. Only then reconsider P0-CM-03 and Commerce work.
```

The paid product boundary remains atomic:

```text
General Natal
!= implicit Career + Wealth + Relationship bundle
```

Consumer wording belongs in the governed narrative/presentation layer and cannot substitute for semantic claim authority.

---

## 8. Cross-domain closure decision

The current inventory does **not** identify a production-ready Saju SKU.

```text
General Natal            -> upstream semantic authority incomplete
Career                    -> research-only T8 + historical authority gaps
Wealth                    -> research-only + cumulative upstream dependency
Relationship-General      -> research-only + cumulative upstream dependency
Relationship-Spouse       -> 2/5 authority ledger; producer not ready
T9 Annual / Monthly       -> research paths cannot bypass non-authorized Natal T8
T10 Compatibility         -> selector only; runtime CAPABILITY_UNAVAILABLE; SRC-08 unresolved
T11 Question-Specific     -> selector present; production producer not established
Life-stage / Daewoon      -> selector present; product interpretation producer not established
```

Therefore:

```text
MyeongHa downstream productization expansion = STOP
Saju upstream authority work                 = CONTINUE
General Natal authority frontier             = PRIMARY
Career T8 authority-gap progress             = SECONDARY
Commerce for these Saju surfaces             = HOLD
```

No ProductHost, Character, LLM, API adapter, SKU mapper, calculation helper, pricing layer, PSP, entitlement path, or narrative surface may manufacture the missing Saju semantic authority.

This inventory update authorizes **no SKU activation, price activation, PSP/payment implementation, entitlement promotion, semantic mapper, or authority promotion**.