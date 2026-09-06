# 명하 Saju Product Interpretation Inventory V1

> Repository: `gycha0109-beep/MyeongHa`  
> Status: **GENERAL NATAL EXACT INVENTORY / NOT PRODUCT AUTHORITY / P0-CM-03 OPEN / NO-BUILD**  
> MyeongHa observed main: `a8891d621734cdd45a0344fc9654a545aec2e9ef`  
> Saju observed main: `4e4d94f22a0ec02da6f0fda1615bd5164e07634c`  
> Product interpretation authority: `MyeongHa_Saju_Product_Interpretation_Architecture_v1.2_FINAL_REVIEWED(1).md`  
> Saju production audit: `gycha0109-beep/Saju/docs/product/22-production-interpretation-authority-audit.md`

---

## 1. Verdict

The repository now contains multiple concrete General Natal T8 **research candidates**, but no General Natal interpretation registry satisfies the production authorization gate.

```text
Reading profile / selection authorization = EXISTS
General Natal research semantics          = EXISTS
Production methodology authority          = NO
Production rule authority                 = NO
Production interpretation pack            = NO
Domain ReviewAttestation                   = NO
Reviewer trust grant                       = NO
General Natal production preflight PASS    = NO
General Natal browser/API production E2E   = NO

General Natal saleable                     = NO
P0-CM-03                                   = OPEN
Production Payment                         = HOLD
Decision                                   = NO_BUILD
```

The latest Saju commit after the previous inventory baseline is Relationship/Spouse research-only and does not change General Natal semantics. General Natal was nevertheless re-inventoried from the exact current main above.

---

## 2. Authority classification vocabulary

Every item below uses exactly one of these states.

```text
EXISTS + PRODUCTION AUTHORIZED
EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE
MISSING
```

`active` claim state inside a research interpretation execution is not production authorization.

`coverageState=complete` is also not production authorization. It only means the selected Reading Profile requirements were satisfied by the claims present in that execution.

---

## 3. General Natal Reading Profile authority

Current Saju source resolves:

```text
profileId              = myeonghwa-reading-profile-general-natal-v1
profileVersion         = 1.0.0
profileRegistryVersion = myeonghwa-reading-profile-registry-v1
profileContentHash     = 682bb733efd0ed07623e8477527be321515fa58c6a409f02b6d0ee213d307cb3
requiredEvidenceGroup  = NATAL_DOMAIN_SYNTHESIS_CLAIM_REQUIRED
selector               = tier T8 + category general
domain/category        = general
temporal scope          = natal
```

The profile is present in `READING_PROFILE_SELECTION_AUTHORIZATIONS`, but that authorization is explicitly scoped to `reading_evidence_selection_only` and sets all semantic promotion capabilities to `false`.

```text
profile exists / selection authorized
!=
interpretation semantics authorized
```

### Important coverage limitation

The current profile requires only one required group matching any active `T8 + category=general` claim. The structural-summary research test proves that one narrow, explicitly non-conclusive month-branch structural claim can make General Natal `coverageState=complete`.

Therefore:

```text
Reading Profile complete
!=
minimum useful paid General Natal artifact proven
```

A saleability decision must not use profile coverage alone as a product-quality proxy.

---

## 4. Exact General Natal research candidates

### 4.1 Structural-summary candidate

| Authority Object | Repository Path | Identifier / Version | Lifecycle | Production Authorized? | Evidence / Gap |
|---|---|---|---|---|---|
| methodology | `Saju/src/research/general-natal-t8-structural-summary-candidate.ts` | `M-GENERAL-NATAL-MONTH-BRANCH-STRUCTURAL-SUMMARY@0.1.0-research` | `research` | NO | General T8 wrapper over I18A month-branch evidence; `reviewerStatus=unreviewed` |
| upstream methodology | `Saju/src/research/i18a-month-branch-strength-evidence.ts` | `M-STRENGTH-FUYI-MONTH-BRANCH-EVIDENCE@0.1.0-research` | `research` | NO | T2 month-branch relation only; explicitly not final strength classification |
| rule set | same | `RULE-GENERAL-NATAL-T8-MONTH-BRANCH-{PEER,RESOURCE,OUTPUT,WEALTH,OFFICER}` | `research` | NO | five deterministic mappings; `fixture_matrix`, `multi_source_supported`, `contested`, `unreviewed` |
| pack | same | `PACK-GENERAL-NATAL-T8-STRUCTURAL-SUMMARY-CANDIDATE@0.1.0-research` | `research` | NO | production composition rejects it with `INTERPRETATION_PACK_NOT_PRODUCTION` |
| T8 claim | same | `GENERAL_NATAL_MONTH_BRANCH_STRUCTURAL_CONTEXT` | runtime claim may be `active` | NO | intentionally neutral/non-conclusive; no personality/event/career/wealth/relationship/fortune conclusion authorized |
| inputs | same | `DAY_MASTER_MONTH_BRANCH_EVIDENCE` + `DAY_MASTER_MONTH_BRANCH_SCOPE_GUARD` | scenario-preserving | NO | exact rule inputs exist; candidate methodology still research |
| ReviewAttestation | candidate registry | none supplied | — | NO | `createRuleRegistrySnapshot()` receives rules/methodologies/sources only |
| claim contract | candidate registry | no candidate `ClaimTypeDefinition` / value schema supplied | — | NO | strict production-grade semantic value contract not established for this claim |

**Assessment:** useful bounded upstream/general structural context, but by design too narrow to authorize the paid General Natal artifact by itself.

### 4.2 Minimum-useful-reading candidate

| Authority Object | Repository Path | Identifier / Version | Lifecycle | Production Authorized? | Evidence / Gap |
|---|---|---|---|---|---|
| methodology | `Saju/src/research/general-natal-useful-reading-candidate.ts` | `M-TEN-GOD-CONSUMER-THEME-YUANHAI@0.1.0-research` | `research` | NO | source = Yuanhai Ziping Wikisource transcription/cross-reference; `secondary_only`, `contested`, `unreviewed` |
| methodology | same | `M-GENERAL-NATAL-USEFUL-SYNTHESIS-YUANHAI@0.1.0-research` | `research` | NO | General T8 synthesis candidate; same source/governance limitations |
| T5 rules | same | 10 `RULE-GENERAL-NATAL-T5-{FAMILY}-{VISIBLE_STEMS|BRANCHES}` rules | `research` | NO | whole-chart Ten-God family/channel themes |
| T8 rules | same | 5 day-master baseline + 10 family/channel theme + 1 scope guard | `research` | NO | 16 T8 rules; fixture matrix only |
| pack | same | `PACK-GENERAL-NATAL-USEFUL-READING-CANDIDATE@0.1.0-research` | `research` | NO | production composition explicitly blocked |
| source | same | `SRC-GENERAL-NATAL-YUANHAI-SEMANTICS-WIKISOURCE` | `cross_reference` | NO | locator: `論日為主 / 論性情 / 十神...`; transcription/cross-reference, not production primary-supported provenance |
| inputs | same | `derivedFacts.tenGods`, `derivedFacts.dayMaster`, T5 claim dependencies | deterministic | NO | rule-level inputs exist; methodology does not provide a promoted production input-contract/review record |
| claim contract | candidate registry | no candidate `ClaimTypeDefinition` / value schema supplied | — | NO | claim values are not bound to a candidate Claim Type Registry |
| ReviewAttestation | candidate registry | none supplied | — | NO | no exact-content domain attestation |

Candidate T8 claim family includes:

```text
GENERAL_NATAL_DAY_MASTER_BASELINE
GENERAL_NATAL_{PEER|RESOURCE|OUTPUT|WEALTH|OFFICER}_{VISIBLE_STEMS|BRANCHES}_THEME
GENERAL_NATAL_USEFUL_READING_SCOPE-GUARD
```

**Additional semantic/governance debt:** claim values currently embed `headline`, `summary`, and `consumerSection` consumer copy. That is research implementation material, not the desired production separation of structured semantic claim from versioned narrative profile. T8 theme rules also generally lift one T5 theme into one T8 theme rather than establishing a reviewed multi-evidence domain synthesis.

### 4.3 Conclusion-synthesis candidate

| Authority Object | Repository Path | Identifier / Version | Lifecycle | Production Authorized? | Evidence / Gap |
|---|---|---|---|---|---|
| methodology | `Saju/src/research/general-natal-conclusion-synthesis-candidate.ts` | `M-GENERAL-NATAL-CONCLUSION-SYNTHESIS-SAMYEONG-V1@0.2.0-research` | `research` | NO | `secondary_only`, `contested`, `unreviewed` |
| rules | same | 5 family-presence rules + 10 conclusion rules | `research` | NO | multi-family synthesis exists only as research |
| pack | same | `PACK-GENERAL-NATAL-CONCLUSION-SYNTHESIS-CANDIDATE@0.2.0-research` | `research` | NO | imports useful-reading research rules and remains production-blocked |
| source | same | `SRC-SAMYEONG-TONGHOE-V5-FOUR-LIBRARIES-TENGOD-RELATIONS` | `cross_reference` | NO | `三命通會（四庫全書本）卷五`, section `論古人立印食官財名義`; no promoted primary witness/review chain |
| second source | imported | `SRC-GENERAL-NATAL-YUANHAI-SEMANTICS-WIKISOURCE` | `cross_reference` | NO | same research-only transcription limitation |
| conclusion claim producer | same | ten General T8 conclusion rules | `research` | NO | conclusion kinds include `core`, `strength`, `tension`, `work`, `money`, `relationship` |
| ReviewAttestation | candidate registry | none supplied | — | NO | no exact-content domain attestation |
| claim contract | candidate registry | no candidate `ClaimTypeDefinition` / value schema supplied | — | NO | no production claim schema authority |

**Atomic-product conflict:** this candidate intentionally emits General-category conclusions whose semantic kinds include `work`, `money`, and `relationship`. The current paid product contract says General Natal is **not** an implicit Career + Wealth + Relationship synthesis. Therefore this candidate cannot be promoted as-is merely by changing lifecycle/review metadata. Its scope must first be reconciled with the atomic General Natal contract, or cross-domain content must remain independently authorized atomic readings/composite Saju authority.

---

## 5. 22-point production authority inventory

| # | Authority / Verification Item | Classification | Exact finding | Required next action |
|---:|---|---|---|---|
| 1 | methodologyId | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | three General Natal candidate methodology families exist; all are research | choose/revise an atomic General Natal methodology candidate based on qualifying source semantics |
| 2 | methodology lifecycle/status | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | `research` | domain review before `active`; no label-only promotion |
| 3 | source provenance | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | Wikisource `cross_reference`; useful/conclusion rules declare `secondary_only`; structural candidate inherits multi-source I18A | acquire/qualify source evidence appropriate to promoted semantics |
| 4 | scholarly/primary source locators | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | section-level locators exist; no General Natal production primary-witness/review chain proven | source acquisition / witness qualification for exact propositions |
| 5 | required input contract | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | deterministic rule inputs exist and use scenario-preserving behavior; production methodology input-contract authority not promoted | bind exact allowed/required facts/claims to reviewed methodology |
| 6 | ruleId | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | deterministic candidate rule sets exist | retain only rules within approved atomic General Natal scope |
| 7 | rule lifecycle/status | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | all General Natal candidate rules are `research` | domain review + source/quality requirements before `active` |
| 8 | interpretationPackId | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | three candidate packs exist | production pack only after exact authority chain closes |
| 9 | pack lifecycle/status | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | all three are `research` | do not promote until preconditions close |
| 10 | T8 claim type | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | candidate T8 claim types exist | define production ClaimTypeDefinition/value schemas for chosen semantics |
| 11 | claim producer | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | deterministic research rules produce T8 general claims | production producer must come from production-authorized registry |
| 12 | claim metadata/state | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | runtime candidate claims may be `active`; this is execution state only | production registry/content-addressed semantic contracts required |
| 13 | evidence group compatibility | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | candidate `T8 + category=general` claims satisfy `NATAL_DOMAIN_SYNTHESIS_CLAIM_REQUIRED`; tests can report `complete` | add minimum-useful-product semantics beyond thin profile completeness before saleability |
| 14 | ReviewAttestation | **MISSING** | candidate registries supply no General Natal methodology/rule attestations | obtain exact-content domain review and create attestations |
| 15 | reviewer identity / trust grant | **MISSING** | candidate rule quality says `unreviewed`; no trust grant pins candidate attestation hashes | establish external reviewer trust context only after real attestations exist |
| 16 | fixtures | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | synthetic/structural inline fixtures exist in three candidate tests | retain synthetic provenance and extend for promoted rules |
| 17 | negative tests | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | missing guard, forbidden deterministic outcomes, career isolation, and production-block tests exist | extend against final promoted semantic contract |
| 18 | ambiguity tests | **MISSING** | no dedicated General Natal candidate test proves unknown-time/multi-scenario semantics end-to-end | add General Natal ambiguity/scenario matrix |
| 19 | boundary tests | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | scope guards and career isolation exist | add atomic General Natal cross-domain boundary tests for final rule set |
| 20 | execution preflight | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | generic production gate exists; every current candidate is intentionally blocked with `INTERPRETATION_PACK_NOT_PRODUCTION` | successful `buildInterpretationExecutionPlan()` on real General Natal production pack required |
| 21 | browser/API runtime reachability | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | generic ProductHost/HTTP integration exists, but its MVP test uses test-only calculation/interpretation fixtures rather than General Natal production authority | wire exact authorized General Natal production registry and run real request path |
| 22 | production E2E evidence | **MISSING** | no General Natal production ProductHost/browser/API E2E exists | add exact-head production E2E only after semantic authorization passes |

---

## 6. Test evidence currently present

Current Saju main contains:

```text
test/general-natal-t8-structural-summary-candidate.test.ts
test/general-natal-useful-reading-candidate.test.ts
test/general-natal-conclusion-synthesis-candidate.test.ts
```

These prove useful research properties:

```text
research-only lifecycle is preserved
synthetic deterministic execution works
General Natal profile can select candidate T8 claims
career intent does not borrow General Natal claims
scope guards block unsupported deterministic fortune/outcome semantics
production composition fails closed
```

They do **not** prove:

```text
production methodology authority
domain-reviewed rules
ReviewAttestation / reviewer trust
minimum useful paid artifact quality
successful production execution preflight
General Natal production API/browser E2E
```

The generic `product-host-mvp.test.ts` is also test-fixture based and injects test-only claims; it is infrastructure evidence, not General Natal semantic authority.

---

## 7. Production authorization gate — exact impact

Current Saju production composition requires a `production` pack before it even attempts the interpretation execution-plan preflight.

For production packs, execution-plan authorization further requires materially:

```text
methodology.status = active
rule.status        = active
rule reviewer      = domain_reviewed
rule test coverage = fixture_matrix or regression_suite
rule provenance    = primary_supported or multi_source_supported
production-allowed source tiers
externally supplied ReviewerTrustContext
trusted approved domain ReviewAttestation bound to exact content hash
```

Current General Natal candidates fail before this chain is complete. Changing `status` strings alone would create false authority and is forbidden.

---

## 8. Atomic General Natal semantic decision

Current paid product boundary remains:

```text
나의 명식 — 깊이 읽기
= General Natal atomic product
```

Therefore:

```text
General Natal
!= implicit Career + Wealth + Relationship synthesis
```

### Candidate disposition

```text
Structural-summary candidate
→ KEEP AS RESEARCH INPUT/CANDIDATE
→ semantically bounded but insufficient alone for paid artifact

Useful-reading candidate
→ RESEARCH REWORK REQUIRED BEFORE PROMOTION
→ useful breadth exists
→ consumer prose currently embedded in claims
→ single-upstream T8 theme lifting requires methodology review

Conclusion-synthesis candidate
→ DO NOT PROMOTE AS-IS
→ work/money/relationship conclusion kinds conflict with atomic product boundary
```

This is a semantic-scope gap, not only a reviewer-status gap. Therefore the correct path is **not** to create ReviewAttestations for the current conclusion pack unchanged.

---

## 9. Product / Commerce impact

```text
P1 General Natal product concept    = PROCEED
General Natal semantic authority    = BLOCKED
General Natal saleable              = NO
P0-CM-03                            = OPEN
actual SKU seed                     = FORBIDDEN
actual price                        = FORBIDDEN
actual entitlement grant            = FORBIDDEN
PSP/provider binding                = FORBIDDEN
Production Payment                  = HOLD
```

Product Layer, Character Layer, or LLM may not fill the missing General Natal semantics.

---

## 10. Smallest honest unblock path

The narrowest next frontier is now more specific than the previous first-pass inventory:

```text
1. Freeze atomic General Natal semantic scope.
2. Reuse only source-backed candidate propositions compatible with that scope.
3. Acquire/qualify stronger source witnesses for the selected propositions where current cross-reference evidence is insufficient.
4. Move consumer prose out of semantic claim values for the production path.
5. Define ClaimTypeDefinition + value schemas for the selected General Natal T8 claims.
6. Define reviewed methodology input contract and deterministic multi-evidence synthesis where required.
7. Build synthetic fixture + negative + ambiguity + boundary matrix.
8. Obtain real domain review for exact content-addressed methodology/rules.
9. Create ReviewAttestations and reviewer trust grants pinned to exact attestation hashes.
10. Build a production interpretation pack and pass `buildInterpretationExecutionPlan()`.
11. Verify `NATAL_DOMAIN_SYNTHESIS_CLAIM_REQUIRED` plus minimum useful paid-reading coverage.
12. Run General Natal ProductHost/API/browser production E2E.
13. Only then reconsider `P0-CM-03`.
```

No Commerce/provider implementation is authorized by this inventory update.
