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

## 0. Cross-domain readiness ledger

This top-level ledger consolidates the current product-readiness boundary while retaining the existing General Natal deep-dive below as supporting detail.

```text
Reading Profile / selector exists
!= InterpretationClaim exists
!= governed producer exists
!= production interpretation authority exists
!= MyeongHa product runtime is saleable
!= Commerce is authorized
```

The three readiness dimensions remain separate:

```text
SAJU_SEMANTIC_READY
= exact interpretation semantics have governed production authority

MYEONGHA_PRODUCT_READY
= a production consumer/runtime can consume that governed authority fail-closed

COMMERCE_READY
= the product may honestly be represented as saleable and connected to price/payment/entitlement
```

| Surface | Selector / profile | Source producer / claim surface | MyeongHa provider / runtime | SAJU_SEMANTIC_READY | MYEONGHA_PRODUCT_READY | COMMERCE_READY | Primary blocker | Evidence path |
|---|---|---|---|---|---|---|---|---|
| **General Natal (T8)** | `general -> general-natal`; T8 `category=general` selection contract exists | General-Natal research candidates exist; PR `#339` adds a strict research-only T3 source-condition producer, but canonical resolver + reviewed production T8 chain remain incomplete | Generic Reading/ProductHost infrastructure exists; reachability is not semantic authority | **NO** | **NO** | **NO** | `SAJU_AUTHORITY_DEPENDENCY`; P0-CM-03 open | this document §§1–11; `docs/SAJU_PRODUCT_VERTICAL_SLICE_READINESS_AUDIT_20260913.md` §§3–4; `Saju/src/research/general-natal-source-conditioned-lower-tier-producer.ts` |
| **Career Natal (T8)** | Career T8 selector/profile exists | `Saju/src/research/career-natal-reading-candidate.ts`; research-only (`secondary_only`, `fixture_matrix`, `contested`, `unreviewed`) | Research path exists; no production product guarantee follows from reachability | **NO** | **NO** | **NO** | `SAJU_AUTHORITY_DEPENDENCY`; historical Career T8 gaps remain open | readiness audit §§3,5 |
| **Wealth Natal (T8)** | Wealth T8 selector/profile exists | `Saju/src/research/wealth-natal-reading-candidate.ts`; research-only and cumulatively dependent on unresolved General/Career research authority | Research path exists; no production product guarantee established | **NO** | **NO** | **NO** | `SAJU_AUTHORITY_DEPENDENCY` | readiness audit §§3,6 |
| **Relationship (T8)** | Relationship-General and Relationship-Spouse selectors/profiles exist | General: `Saju/src/research/relationship-natal-reading-candidate.ts` research-only. Spouse: governed ledger remains `2/5 CLOSED`, `3/5 OPEN`, `spouseT8ProducerReady=false` | Selection/research paths exist; no production Relationship product guarantee established | **NO** | **NO** | **NO** | `SAJU_AUTHORITY_DEPENDENCY`; Spouse production HOLD | readiness audit §§3,7–8; current Saju Spouse-T8 ledger |
| **T9 Annual / Monthly** | Domain annual/monthly composition requires domain Natal T8 + period T9 evidence | Career/Wealth/Relationship-General annual/monthly research candidates and E2E research paths exist; no production promotion | Research path exists; no independently saleable period product established | **NO** | **NO** | **NO** | production-authorized Natal T8 foundation absent; T9 research cannot bypass it | readiness audit §§3,9 |
| **T10 Compatibility** | Compatibility Reading profile selects T10 evidence | No admitted production T10 interpretation producer identified; `SRC-08` unresolved | target Birth and `domain=compatibility` fail closed with `CAPABILITY_UNAVAILABLE` before trusted Reading ID allocation/persistence | **NO** | **NO** | **NO** | `CAPABILITY_UNAVAILABLE` + unresolved `SRC-08` | readiness audit §10; MyeongHa PR `#688` |
| **T11 Question-Specific** | `question_specific` selects T11 / `QUESTION_SPECIFIC_CLAIM_REQUIRED` | No dedicated governed production T11 producer established by the audited Saju tree | No production Question-Specific product path established | **NO** | **NO** | **NO** | `SAJU_PRODUCT_BINDING_MISSING`; selector presence is selection-only authority | readiness audit §§11,13 |
| **Life-stage / Daewoon** | `life_stage` selects T9 `life_stage` evidence | No dedicated governed life-stage/Daewoon interpretation producer established; calculation-level luck-cycle capability is a separate authority surface | No production Daewoon interpretation product path established | **NO** | **NO** | **NO** | `SAJU_PRODUCT_BINDING_MISSING`; calculation/helper capability cannot act as interpretation guarantor | readiness audit §§12–13 |

For Career, Wealth, and Relationship-General annual/monthly products:

```text
period product completeness
= production-authorized domain Natal T8
+ production-authorized period T9
```

Current research coverage does not satisfy that equation.

The inherited readiness decision remains:

```text
NEXT_PRODUCTION_SKU       = NONE
DOWNSTREAM_SKU_ACTIVATION = BLOCKED
MISSING_AUTHORITY_OWNER   = SAJU
COMMERCE                  = HOLD
```

The Saju drift after the `#723` readiness audit consists of non-promotional Relationship/Spouse evidence work and does not change this verdict.

---

## 2026-11-13 — 현행 상용 해석 적격성 정정 (과거 표·PIN 보존)

> 이 문서의 2026-09 원국·T9·T10 및 `Domain ReviewAttestation`·`Reviewer trust grant` 상태는 **당시 고정한 감사 증거**다. 최신 상용 해석 판단은 [내부 서비스 채택·발급 인계](SAJU_INTERNAL_COMMERCIAL_INTERPRETATION_HANDOFF_20261113.md) 및 Saju [7단계 로드맵](https://github.com/gycha0109-beep/Saju/blob/feat/saju-pin-reading-period-20261109/docs/ROADMAP.md)과 [T10 5단계 로드맵](https://github.com/gycha0109-beep/Saju/blob/feat/saju-cross-chart-structural-evidence-20261109/docs/research/compatibility-t10-product-ready-research-roadmap-20261111.md)을 따른다.

- 전문가·학술기관·추가 문헌의 독립 승인이 없다는 사실은 **상용 해석 전역 HOLD의 근거가 아니다**. 명하가 채택한 규칙에 대해 계산→명식/기간/상대→Claim·Rule→고객 문장의 실제 실행·재현·모순 방지 검사로 해석 적격성을 판단한다.
- `source`, `authority`, `proof`, `grounding`, `signature`에 해당하는 원국/기간/해석 버전, 서명·구매·Consent·Offer·Grant·Reader·환불·개인정보·복구는 **필수 무결성 장치로 유지한다**.
- 새 Saju PR #2762/#2763은 내부 해석 후보의 실제 구현/검증 작업이고 MyeongHa #3174는 별도 보호 발급·운영 계약이다. 각 CI Green은 전체 판매 승인이 아니다. 문서의 과거 `NO_BUILD` 행을 현재의 모든 명하 내부 의미 규칙 미승인으로 일반화하지 않는다.

## 1. Verdict

The repository now contains both concrete General Natal T8 research candidates and an explicit source-condition-preserving lower-tier research producer introduced by Saju PR `#339`. This is a real authority-graph improvement over the previous inventory baseline, but it does **not** authorize General Natal production semantics or Commerce.

The decisive path is now:

```text
exact source condition
→ governed upstream structural / pattern / qualification resolution
→ schema-bound lower-tier source-condition claim
→ bounded reviewed semantic proposition
→ authorized General Natal T8 synthesis
```

PR `#339` closes the **research lower-tier normalization/claim-contract/test** portion of that path. It does not close the upstream resolver or downstream reviewed semantic/production portions.

The following shortcut remains inadmissible:

```text
raw whole-chart Ten-God family presence
→ consumer personality / work / money / relationship meaning
```

Current authority verdict:

```text
GENERAL_NATAL_PRODUCTION_AUTHORITY = BLOCKED
Reading profile / selection authorization = EXISTS
General Natal research semantics          = EXISTS
Research source-condition T3 producer     = EXISTS
Upstream source-condition resolver        = MISSING
Production methodology authority          = NO
Production rule authority                 = NO
Production interpretation pack            = NO
Domain ReviewAttestation                   = NO
Reviewer trust grant                       = NO
General Natal production preflight PASS    = NO
General Natal browser/API production E2E   = NO

CURRENT_WHOLE_CHART_TEN_GOD_PRESENCE_TO_T8_PROMOTION = NOT_ADMISSIBLE_AS_IS
SOURCE_CONDITIONED_LOWER_TIER_TOPOLOGY_REQUIRED       = true
RESEARCH_SOURCE_CONDITION_CLAIM_PRODUCER              = EXISTS
UPSTREAM_SOURCE_CONDITION_RESOLVER                     = MISSING
GEJU_PRODUCER_AUTHORITY_READY                          = false

General Natal saleable                     = NO
P0-CM-03                                   = OPEN
Production Payment                         = HOLD
Decision                                   = NO_BUILD
```

The observed repository heads moved after the previous inventory baseline. The MyeongHa delta through `ac47522c...` is authentication/test work and does not change General Natal semantics. The Saju delta is materially relevant: PR `#339` adds a strict research T3 source-condition normalizer with registered claim contracts and exact-condition tests. It deliberately remains research-only and fail-closed because the canonical upstream source-condition resolver is still absent.

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

Likewise:

```text
source object located
!= source proposition production-authorized

exact source proposition located
!= source condition derivable from the canonical chart

research source-condition normalizer exists
!= upstream source-condition resolver exists

research strict ClaimTypeDefinition/value schema exists
!= production-authorized semantic claim contract exists

research producer exists
!= production-authorized producer exists
```

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

The profile is present in `READING_PROFILE_SELECTION_AUTHORIZATIONS`, but that authorization is explicitly scoped to `reading_evidence_selection_only` and sets semantic promotion capabilities to `false`.

```text
profile exists / selection authorized
!=
interpretation semantics authorized
```

### Important coverage limitation

The current profile requires only one required group matching an active `T8 + category=general` claim. A narrow structural research claim can therefore satisfy the profile selector without proving a minimum-useful paid General Natal artifact.

```text
Reading Profile complete
!=
minimum useful paid General Natal artifact proven
```

Saleability must not use profile coverage alone as a product-quality or semantic-authority proxy.

---

## 4. Exact General Natal research candidates

### 4.1 Structural-summary candidate

| Authority Object | Repository Path | Identifier / Version | Lifecycle | Production Authorized? | Evidence / Gap |
|---|---|---|---|---|---|
| methodology | `Saju/src/research/general-natal-t8-structural-summary-candidate.ts` | `M-GENERAL-NATAL-MONTH-BRANCH-STRUCTURAL-SUMMARY@0.1.0-research` | `research` | NO | General T8 wrapper over I18A month-branch evidence; `reviewerStatus=unreviewed` |
| upstream methodology | `Saju/src/research/i18a-month-branch-strength-evidence.ts` | `M-STRENGTH-FUYI-MONTH-BRANCH-EVIDENCE@0.1.0-research` | `research` | NO | T2 month-branch relation only; explicitly not final strength classification |
| rule set | same | `RULE-GENERAL-NATAL-T8-MONTH-BRANCH-{PEER,RESOURCE,OUTPUT,WEALTH,OFFICER}` | `research` | NO | deterministic mappings; research evidence only |
| pack | same | `PACK-GENERAL-NATAL-T8-STRUCTURAL-SUMMARY-CANDIDATE@0.1.0-research` | `research` | NO | production composition rejects non-production pack |
| T8 claim | same | `GENERAL_NATAL_MONTH_BRANCH_STRUCTURAL_CONTEXT` | runtime claim may be `active` | NO | intentionally neutral/non-conclusive |
| inputs | same | `DAY_MASTER_MONTH_BRANCH_EVIDENCE` + `DAY_MASTER_MONTH_BRANCH_SCOPE_GUARD` | scenario-preserving | NO | precise inputs exist, but this candidate is not the source-conditioned semantic chain |
| ReviewAttestation | candidate registry | none supplied | — | NO | no exact-content domain attestation |
| claim contract | candidate registry | no candidate production Claim Type Registry/value schema | — | NO | production semantic value contract absent |

**Assessment:** useful bounded upstream/general structural context, but insufficient by design to authorize a paid General Natal artifact.

### 4.2 Minimum-useful-reading candidate

| Authority Object | Repository Path | Identifier / Version | Lifecycle | Production Authorized? | Evidence / Gap |
|---|---|---|---|---|---|
| methodology | `Saju/src/research/general-natal-useful-reading-candidate.ts` | `M-TEN-GOD-CONSUMER-THEME-YUANHAI@0.1.0-research` | `research` | NO | current semantic projection is broader than the source-condition boundary |
| methodology | same | `M-GENERAL-NATAL-USEFUL-SYNTHESIS-YUANHAI@0.1.0-research` | `research` | NO | General T8 synthesis candidate remains research-only |
| T5 rules | same | 10 `RULE-GENERAL-NATAL-T5-{FAMILY}-{VISIBLE_STEMS|BRANCHES}` rules | `research` | NO | whole-chart Ten-God family/channel themes; not a lossless representation of the qualified classical conditions |
| T8 rules | same | day-master baseline + family/channel theme + scope guard | `research` | NO | generally lifts broad theme evidence upward; not source-conditioned production synthesis |
| pack | same | `PACK-GENERAL-NATAL-USEFUL-READING-CANDIDATE@0.1.0-research` | `research` | NO | intentionally production-blocked |
| inputs | same | `derivedFacts.tenGods`, `derivedFacts.dayMaster`, T5 dependencies | deterministic | NO | raw/broad Ten-God presence is not sufficient input authority for PR #335 propositions |
| claim contract | candidate registry | no candidate production Claim Type Registry/value schema | — | NO | semantic values not production-governed |
| ReviewAttestation | candidate registry | none supplied | — | NO | no exact-content domain attestation |

Candidate T8 family includes:

```text
GENERAL_NATAL_DAY_MASTER_BASELINE
GENERAL_NATAL_{PEER|RESOURCE|OUTPUT|WEALTH|OFFICER}_{VISIBLE_STEMS|BRANCHES}_THEME
GENERAL_NATAL_USEFUL_READING_SCOPE-GUARD
```

**Required disposition:** `RESEARCH REWORK REQUIRED BEFORE PROMOTION`.

The current consumer-theme path cannot be upgraded merely by adding a stronger source reference or changing lifecycle labels. Its upstream input topology must first preserve the source condition that licenses each bounded semantic proposition.

### 4.3 Conclusion-synthesis candidate

| Authority Object | Repository Path | Identifier / Version | Lifecycle | Production Authorized? | Evidence / Gap |
|---|---|---|---|---|---|
| methodology | `Saju/src/research/general-natal-conclusion-synthesis-candidate.ts` | `M-GENERAL-NATAL-CONCLUSION-SYNTHESIS-SAMYEONG-V1@0.2.0-research` | `research` | NO | source/governance and atomic-product scope remain unresolved |
| rules | same | family-presence + conclusion rules | `research` | NO | broad family-presence materialization remains upstream of conclusions |
| pack | same | `PACK-GENERAL-NATAL-CONCLUSION-SYNTHESIS-CANDIDATE@0.2.0-research` | `research` | NO | imports research-only useful-reading path |
| source | same | `SRC-SAMYEONG-TONGHOE-V5-FOUR-LIBRARIES-TENGOD-RELATIONS` | research provenance | NO | PR #332/#335 materially improve source location/condition knowledge, but do not authorize this pack as-is |
| conclusion claim producer | same | General T8 conclusion rules | `research` | NO | includes `work`, `money`, `relationship` conclusion kinds under General taxonomy |
| ReviewAttestation | candidate registry | none supplied | — | NO | no exact-content domain attestation |
| claim contract | candidate registry | no candidate production Claim Type Registry/value schema | — | NO | no production claim schema authority |

**Required disposition:** `DO NOT PROMOTE AS-IS`.

The candidate has two independent blockers:

1. its source-to-producer path still collapses qualified conditions into broad Ten-God-family presence; and
2. `work`, `money`, and `relationship` conclusions conflict with the atomic General Natal product boundary.

### 4.4 `gyeokguk` substrate and PR #339 source-condition producer

The older research methodology catalog contains:

```text
M-GEJU-MONTH-ORDER@0.1.0-research
family = gyeokguk
status = research
```

Its declared namespace distinguishes:

```text
GEJU_CANDIDATE
GEJU_ESTABLISHMENT_STATE
GEJU_TRANSFORMATION_STATE
GEJU_FUNCTIONAL_USE
```

PR `#339` adds the first explicit source-condition-preserving lower-tier producer for the four General Natal conditions identified by PR `#335`:

```text
path        = Saju/src/research/general-natal-source-conditioned-lower-tier-producer.ts
methodology = M-GEJU-SOURCE-CONDITION-NORMALIZATION@0.1.0-research
claimType   = GEJU_SOURCE_CONDITION_STATE@0.1.0-research
schema      = SCHEMA-GEJU-SOURCE-CONDITION-STATE@0.1.0-research
pack        = PACK-GENERAL-NATAL-SOURCE-CONDITION-LOWER-TIER-CANDIDATE@0.1.0-research
claim tier  = T3 / category=gyeokguk / subcategory=source_condition
contract    = registered_required
rules       = 4
review      = unreviewed / no ReviewAttestation
```

Its four required fact paths are explicit:

```text
derivedFacts.generalNatalSourceConditions.pianCaiGe
derivedFacts.generalNatalSourceConditions.yinShouGeApplicable
derivedFacts.generalNatalSourceConditions.shangGuanShangJin
derivedFacts.generalNatalSourceConditions.shiShenGeQualified
```

The output schema is deliberately non-consumer-facing:

```text
sourceConditionPreserved    = true
rawTenGodPresenceSufficient = false
consumerMeaningAuthorized   = false
```

The producer emits only when the corresponding source-condition fact is explicitly `resolved` and all rule-specific qualifiers are satisfied. It does not infer pattern establishment from raw pillars or `derivedFacts.tenGods`.

This closes the previous claim that no explicit research source-condition producer existed. It does **not** close production authority because the canonical calculation layer still does not produce the four `derivedFacts.generalNatalSourceConditions.*` facts.

```text
GEJU namespace exists
+
research T3 source-condition normalizer exists
!=
upstream source-condition resolver exists
!=
production-authorized GEJU producer exists
!=
bounded reviewed T8 semantic proposition exists
!=
General Natal semantic proposition is authorized
```

Therefore:

```text
RESEARCH_SOURCE_CONDITION_CLAIM_PRODUCER = EXISTS
UPSTREAM_SOURCE_CONDITION_RESOLVER       = MISSING
GEJU_PRODUCER_AUTHORITY_READY            = false
```

---

## 5. Source-conditioned proposition boundary — PR #332 / #335 / #339 sync

### 5.1 PR #332 — acquisition improved, authority still bounded

Saju PR `#332` recorded stronger source acquisition evidence and narrowed the directly supported classical proposition.

Key acquisition records include:

```text
Harvard-Yenching 三命通會 volume 5 scan object
National Library of China-derived full scan object
Kanripo KR3g0042/WYG/005 exact edition-native section surface
Wikisource / CText only as cross-check surfaces
```

It also records an important semantic guard:

```text
classical Ten-God relation/name
!=
automatic modern psychology / aptitude authority
```

PR `#332` therefore closes part of source discovery, but it intentionally does **not** promote the useful-reading or conclusion-synthesis candidates.

### 5.2 PR #335 — exact source conditions are the producer contract

PR `#335` establishes that the relevant temperament-like statements are conditional propositions.

| Source proposition | Exact condition that must be preserved | Explicitly not equivalent to |
|---|---|---|
| `偏財格` — Kanripo `KR3g0042/WYG/005 [005-49a]` | established/applicable `偏財格` context | generic `偏財` or Wealth-family presence anywhere in the chart |
| `印綬` — `[005-56b]` | `此格` in the preceding 印綬/month-context examples; applicable pattern context must be represented | generic `偏印/正印` or Resource-family presence |
| `傷官傷盡` — `[005-81b] / [005-82a]` | qualified `傷官傷盡` state, with surrounding distinctions preserved | generic `傷官/食神` or Output-family presence |
| `食神格` — `[005-84b]` | pattern context + `日主食神俱生旺` + `無衝破` | generic `食神` presence |

The required architecture is therefore:

```text
source witness / locator
→ exact source condition
→ governed lower-tier structural / pattern / qualification claim
→ bounded reviewed semantic proposition
→ authorized General Natal T8 synthesis
```

A source citation attached to an over-broad producer does not repair semantic loss.

### 5.3 PR #339 — research lower-tier claim production now exists

PR `#339` implements the source-condition normalization layer without pretending to implement the missing establishment resolver.

Exact behaviors proven by its fixture matrix:

```text
four exact-condition positive mappings                  = EXISTS
partial-qualifier negative mappings                     = EXISTS
generic derivedFacts.tenGods non-substitution           = EXISTS
ambiguous source-condition propagation                  = EXISTS
real-run missing-upstream fail-closed behavior          = EXISTS
strict schema rejection of consumer-domain fields       = EXISTS
production composition remains blocked                  = EXISTS
```

The producer is intentionally T3-only and research-only:

```text
GEJU_SOURCE_CONDITION_STATE
materialForNarrative = false
consumerMeaningAuthorized = false
pack.status = research
reviewerStatus = unreviewed
ReviewAttestation = none
```

Exact-head and merged-main evidence:

```text
PR #339 exact head = 2e010b1c2f494f56f1557110005683182a8662f1
CI #2227                               = SUCCESS
Production Calculation Container #282 = SUCCESS
PIE Prospective Shadow #565            = SUCCESS

merged Saju/main = 9cd79b11b5e79016fb7c8b266c95c53286587f48
merged-main CI #2228                    = SUCCESS
merged-main Production Container #283  = SUCCESS
```

What PR `#339` does **not** do:

```text
raw pillars / Ten-God facts
→ establish 偏財格 / 印綬 applicable context / 傷官傷盡 / qualified 食神格
```

The current real execution therefore emits zero `GEJU_SOURCE_CONDITION_STATE` claims unless an explicit resolved source-condition fact is supplied.

---

## 6. 22-point production authority inventory

| # | Authority / Verification Item | Classification | Exact finding | Required next action |
|---:|---|---|---|---|
| 1 | methodologyId | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | General Natal T8 research methodologies exist and PR #339 adds `M-GEJU-SOURCE-CONDITION-NORMALIZATION@0.1.0-research` | implement/review the upstream source-condition resolver and then select only bounded General Natal semantic methodologies |
| 2 | methodology lifecycle/status | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | relevant General Natal and PR #339 methodologies remain `research`; PR #339 rules are `unreviewed` | domain review before any production admission; no label-only promotion |
| 3 | source provenance | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | PR #332/#335 provide acquisition/locator evidence; PR #339 binds a Kanripo source object to four research rules but marks it `cross_reference` and explicitly not a production primary-witness promotion | complete production witness qualification and review for the exact resolver→rule chain |
| 4 | scholarly/primary source locators | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | `[005-49a]`, `[005-56b]`, `[005-81b]/[005-82a]`, `[005-84b]` are now bound to exact research source-condition rules | retain those qualifiers through the upstream resolver and domain review; locator presence alone is not production authority |
| 5 | required input contract | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | PR #339 has a strict required-fact contract for four `derivedFacts.generalNatalSourceConditions.*` paths and forbids substitution by broad Ten-God presence; the canonical calculation layer does not currently supply those facts | implement a governed canonical source-condition resolver with ambiguity-preserving outputs matching or superseding this contract |
| 6 | ruleId | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | four explicit source-condition rules now exist: Pian-Cai-Ge, Yin-Shou applicable, Shang-Guan-Shang-Jin, Shi-Shen qualified | review exact resolver predicates and only then add bounded downstream semantic rules |
| 7 | rule lifecycle/status | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | PR #339 rules are deterministic `research / unreviewed / fixture_matrix` | genuine domain review + exact-content attestation required before promotion |
| 8 | interpretationPackId | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | `PACK-GENERAL-NATAL-SOURCE-CONDITION-LOWER-TIER-CANDIDATE@0.1.0-research` now exists with `registered_required` claim contracts | retain research isolation until resolver, semantic T8 rules, review, and preflight close |
| 9 | pack lifecycle/status | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | source-condition pack and existing General Natal candidate packs are `research` | no production pack until full authorized chain exists |
| 10 | T8 claim type | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | existing General Natal T8 candidate claim types remain research; PR #339 adds a governed **T3** claim contract, not a bounded reviewed T8 semantic contract | define/review exact T8 semantic ClaimTypeDefinition/value schemas sourced from authorized lower-tier claims |
| 11 | claim producer | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | PR #339 now provides a strict source-condition-preserving **research T3 producer** for `GEJU_SOURCE_CONDITION_STATE`; the upstream resolver that derives its required facts is missing, and no production-authorized producer chain exists | implement the upstream resolver, then connect only reviewed bounded semantic/T8 producers; do not regress to broad Ten-God presence |
| 12 | claim metadata/state | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | PR #339 schema enforces `sourceConditionPreserved=true`, `rawTenGodPresenceSufficient=false`, `consumerMeaningAuthorized=false`; runtime `active` remains execution state only | retain strict schema boundary through review/production contracts and keep consumer copy outside semantic authority |
| 13 | evidence group compatibility | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | PR #339 emits T3 only and therefore does not itself satisfy the General Natal `T8 + category=general` Reading Profile requirement; existing research T8 claims can still satisfy the thin selector | require minimum-useful semantics from authorized source-conditioned T8 claims before saleability |
| 14 | ReviewAttestation | **MISSING** | PR #339 intentionally supplies no ReviewAttestation; no General Natal exact-content domain attestation closes the source-conditioned production chain | obtain genuine domain review after resolver and downstream semantic rule content are finalized; pin attestations to exact hashes |
| 15 | reviewer identity / trust grant | **MISSING** | no trust grant pins a General Natal source-conditioned attestation set | establish reviewer trust only after genuine attestations exist |
| 16 | fixtures | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | PR #339 adds four exact-condition positive fixtures and partial-qualifier negatives for the T3 normalizer | add canonical **resolver** fixtures proving how real chart facts establish/not-establish each condition; keep provenance-clean |
| 17 | negative tests | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | PR #339 proves incomplete qualifiers do not emit and ordinary `derivedFacts.tenGods` cannot substitute for any source condition | extend negatives to the upstream resolver and downstream semantic/T8 layers |
| 18 | ambiguity tests | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | PR #339 explicitly preserves ambiguous source-condition input as `skipped_ambiguous_input`; canonical resolver ambiguity/scenario E2E is still absent | add end-to-end resolver/scenario matrices for disputed or unresolved establishment/qualification states |
| 19 | boundary tests | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | PR #339 strict claim schema rejects consumer-domain fields and production composition remains fail-closed; prior career/general isolation remains | extend cross-domain boundary tests to the future T8 semantic layer and ProductHost presentation path |
| 20 | execution preflight | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | generic production gate exists and PR #339 research pack correctly fails production composition | successful `buildInterpretationExecutionPlan()` on the exact authorized General Natal production registry/pack required |
| 21 | browser/API runtime reachability | **EXISTS BUT GOVERNANCE/AUTHORITY INCOMPLETE** | generic ProductHost/HTTP infrastructure exists, but there is no authorized General Natal production registry wired through it | wire exact source-conditioned production authority only after preflight succeeds; do not use test-only claim injection as semantic evidence |
| 22 | production E2E evidence | **MISSING** | no General Natal production ProductHost/browser/API E2E proves the complete authorized resolver→T3→T8 chain | add exact-head production E2E only after semantic authorization passes |

---

## 7. Current evidence and what it does not prove

Current research evidence now proves more than the previous baseline.

PR `#339` specifically proves:

```text
strict research-only T3 source-condition producer exists
registered ClaimTypeDefinition/value schema exists
four exact source-condition mappings exist
partial-condition negatives exist
generic Ten-God presence non-substitution exists
ambiguous source-condition input remains ambiguous/no-claim
missing canonical upstream input remains no-claim
consumer-domain fields are rejected by the T3 schema
research pack remains production-blocked
```

Saju PR `#332` records acquisition/proposition evidence, PR `#335` records the exact source-conditioned topology decision, and PR `#339` implements the bounded research normalization edge.

They still do **not** prove:

```text
canonical upstream source-condition resolver
production methodology authority
production-authorized source-condition producer chain
bounded reviewed General Natal T8 semantic proposition
production T8 ClaimTypeDefinition/value schema for those propositions
domain-reviewed rules
ReviewAttestation / reviewer trust
minimum useful paid artifact quality
successful General Natal production preflight
General Natal production API/browser E2E
```

The generic ProductHost path is infrastructure evidence only. It cannot replace General Natal semantic authorization.

---

## 8. Production authorization gate — exact impact

Current Saju production composition remains correctly fail-closed.

Material requirements include:

```text
production registry exists
pack.status = production
methodology/rule lifecycle admitted for production
registered claim contracts exist
production-allowed provenance exists
review requirements are satisfied
reviewer trust context participates in preflight
exact registry snapshot passes execution-plan authorization
```

The Reading layer additionally forbids:

```text
LLM missing-evidence filling
research-authority promotion
implicit conflict/scenario resolution outside authority
```

PR `#339` confirms that the generic registry/schema/production gate infrastructure can express the required boundary. The blocker has moved forward: the missing pieces are now primarily the **canonical source-condition resolver**, the **bounded reviewed semantic/T8 projection**, and the **production review/trust/preflight/E2E chain**.

Changing `status` strings, attaching a stronger source citation to broad presence rules, injecting source-condition facts only in tests, or creating product copy cannot close those gaps.

---

## 9. Atomic General Natal semantic boundary

Current paid product boundary remains:

```text
General Natal
!= implicit Career + Wealth + Relationship bundle
```

Even a correctly established source condition authorizes only the bounded proposition actually admitted through review.

Adjacent classical prose is not imported automatically, including:

```text
health / illness
body or appearance
lifespan
wealth magnitude
rank / office
spouse or child outcome
future event or timing
fortune polarity
historical social-role assumptions
```

Likewise:

```text
source condition established
!= consumer paragraph authorized
```

Consumer wording belongs in the governed narrative/presentation layer, not as a substitute for semantic claim authority.

---

## 10. Smallest honest unblock path

PR `#339` closes the old foundational tasks of creating a strict research lower-tier normalizer, T3 claim schema, four-condition fixture matrix, generic-presence negative, ambiguity guard, and consumer-field schema boundary. The remaining sequence is:

```text
1. Implement a governed canonical upstream resolver for the required source conditions.
2. Preserve candidate/established/applicable/qualified and ambiguous states without collapsing them to generic Ten-God presence.
3. Add resolver-level positive, negative, ambiguity, and adversarial fixtures for all four conditions.
4. Define bounded General Natal semantic claim types/T8 synthesis separate from consumer prose and adjacent domains.
5. Bind exact source locators/provenance and the approved resolver outputs to the downstream semantic rules.
6. Define exact production ClaimTypeDefinition/value schemas for the bounded T8 propositions.
7. Obtain genuine domain review and content-addressed ReviewAttestation for the exact resolver + semantic rule content.
8. Establish reviewer trust for the exact approved attestation set.
9. Promote only the reviewed methodology/rules required by the atomic General Natal path.
10. Build a production pack with registered-required claim contracts.
11. Pass production execution preflight on the exact registry snapshot.
12. Verify ProductHost/API/browser E2E for the General Natal profile.
13. Only then reconsider P0-CM-03 and Commerce work.
```

---

## 11. Product / Commerce impact

No product-commerce authority is created by PR `#339` or this sync.

```text
GENERAL_NATAL_PRODUCTION_AUTHORITY = BLOCKED
Research source-condition T3 producer = EXISTS
Upstream source-condition resolver     = MISSING
General Natal saleable                 = NO
P0-CM-03                               = OPEN
Production Payment                     = HOLD
Decision                               = NO_BUILD

actual SKU seed                    = FORBIDDEN
actual price                       = FORBIDDEN
PSP/provider binding               = FORBIDDEN
payment implementation             = FORBIDDEN
entitlement implementation         = FORBIDDEN
```

Product Layer, Character Layer, or LLM may not fill the missing resolver or General Natal semantics.

This inventory update authorizes no SKU, price, PSP, payment, entitlement, refund, or Commerce behavior change.

---

## 2026-11-24 — 11개 독립 해석 영역 및 현재 상품 카탈로그 재대조

> 이 절은 기존 2026-09 및 2026-11-13 감사 기록을 보존하는 최신 스냅샷이다. 아래 표를 2026-11-24 현재의 전체 메뉴 인벤토리로 사용한다.

### 1. 관측 기준점

| 저장소 | 관측 기준 |
|---|---|
| Saju | main @ 9e9231b181b4c848b26be6eec1ef4a55a17debf9 |
| MyeongHa | main @ 5e27103e2fa98cb860bdcd1fe93d1a6998e8725c |
| Saju 전역 Production Interpretation | docs/product/22: PRODUCTION_RUNTIME_BLOCKED_BY_INTERPRETATION_AUTHORITY_GAPS |
| 내부 상용 해석 정책 | Saju docs/product/43 및 MyeongHa docs/SAJU_INTERNAL_COMMERCIAL_INTERPRETATION_HANDOFF_20261113 |
| Reading Profile 선택 | Saju src/reading/reading-profile-authorization.ts: 19개 intent shape 등록. 선택 권한은 의미 Claim·생성·Production 권한이 아님 |
| 승인 상품 카탈로그 | MyeongHa packages/contracts/src/approved-saju-catalog.ts, 2026-11-06 고객 카탈로그 |

**판정 원칙**

- 11개 항목은 독립적으로 상태를 조사해야 하는 해석 영역이다. 11개가 모두 판매 SKU라는 뜻은 아니다.
- Reading Profile authorized는 기존 Claim 선택 권한일 뿐, 해당 의미의 존재·정확성·Production 승인을 뜻하지 않는다.
- 계산 가능, Preview 가능, 연구용 Claim 존재, 서명된 Source 발급, Official Reading, Reader 재열람, 실제 판매 가능을 서로 다른 상태로 기록한다.
- 외부 학술기관·전문가의 추가 승인은 전역 출시 선행 조건이 아니다. 다만 명하가 채택한 내부 규칙의 정확성, 입력·기간·상대 결속, 발급·서명·구매·동의·Reader·환불·복구 무결성은 필수다.

### 2. 11개 해석 영역 인벤토리

| 독립 해석 영역 | 계산·기존 자산 | 방법론·Rule·Claim 상태 | Profile / 실제 Runtime | 실측·통합 근거 | 2026-11-24 판정 및 남은 것 |
|---|---|---|---|---|---|
| **1. 직업·커리어 T8** | Canonical 명식 및 T5 십신 계산, career-natal-multifactor-report.ts, career-natal-reading-candidate.ts | 후보 0.5.0-research; Methodology/Pack/Rule 연구 상태, reviewer unreviewed | career:natal 선택 프로필. 연구 Preview 보고서 존재 | 기존 500건 MUR: 114 complete / 364 partial / 22 insufficient. #2812는 main 기반 미병합 PR, 후속 #2819/#2820 회귀에 포함 | 연구·Preview 가능, Production 의미 권한 없음. 직업 결론별 T5/T6 연결, 지원·제약 조건 및 공식 발급 경로가 남음 |
| **2. 사업 T8** | Canonical 명식, business-natal-multifactor-report.ts, business-natal-reading-candidate.ts | 후보 0.8.0-research; Methodology/Pack/Rule 연구 상태, reviewer unreviewed | business:natal 선택 프로필. 사업 전용 Preview 보고서 존재 | 기존 500건 MUR: 257 complete / 237 partial / 6 insufficient. #2813은 #2815 위에 쌓인 미병합 PR이며 #2819/#2820 회귀에 포함 | 연구·Preview 가능, Production 의미 권한 없음. 운영·교환·자원·의사결정 질문에 필요한 독립 결론과 공식 발급이 남음 |
| **3. 재물 T8** | Canonical 명식, wealth-natal-multifactor-report.ts, 지장간 별도 관측 채널 | 후보 0.4.0-research; 지장간 방법론·Pack·Rule 연구 상태, reviewer unreviewed | wealth:natal 선택 프로필. 재물 Preview 보고서 존재 | 500건 최신 기록: 498개 재물 섹션(428 complete / 70 partial), 2건은 재성 근거 자체가 없어 insufficient. #2816 미병합 | 연구·Preview 가능, Production 의미 권한 없음. 무근거 2건을 채우지 않고 자원 형성·교환·유지·배분을 실제 근거에 맞춰 공식 발급하는 작업이 남음 |
| **4. 나의 인연·관계 T8** | relationship-natal-reading-candidate.ts, relationship-natal-multifactor-report.ts; 제한된 관계 일반 규칙 및 승인 문구 프로필 | 연구 후보가 존재. 별도로 relationship:natal:general 전용 서명 발급기가 정확한 Claim·Rule·문구·근거 프로필을 검사 | relationship:natal:general 선택 프로필 및 Preview. Saju #2808 일반 연애운 서명 Source 경로가 main에 병합됨 | 기존 500건 MUR: 162 complete / 334 partial / 4 insufficient. MyeongHa #3402가 본인 T8과 T10 독립 발급·Reader/보관함을 격리 PG17에서 검증해 main 병합. #3403의 10,000건 Source 요청 CI 통과 | 현재 가장 구체적인 단일 명식 서명 발급·Reader 연결 범위. 좁은 Release를 전역 Production Authority나 실제 공개 판매 승인으로 확대 해석하지 않음. 결제·운영 배포·전체 판매는 별도 HOLD |
| **5. 가족 T8 — 부모·자녀** | family-birth-research-runtime.ts, 부모/자녀 관측 Preview, 기존 Family 연구 자료 | 가족 결과를 주장하는 승인 T8 Claim/Production Pack은 확인되지 않음. Runtime은 mayClaimFamilyOutcome=false, familyMeaningStatus=family_t8_source_authority_not_established | 부모·자녀 scope 선택 프로필 존재. Runtime은 계산 사실 및 연구 불가 사유만 제공 | 부모/자녀 scope와 입력·동의 검사는 존재하나 가족 결과 해석의 공식 발급 증거 없음 | 계산 사실·연구만 가능. 부모·자녀 관계 결과를 임의 추론하지 않으며 각 범위의 독립 T8 의미·근거·Claim 권한 미완료 |
| **6. 배우자 T8** | 배우자 위치·일지 연구 자료, relationship-spouse-t8-engine-producer.ts, spouse 전용 Production candidate/delivery 경로 | 제한된 위치 기반 후보가 존재하나 전체 배우자 해석 권한으로 확정되지 않음 | spouse 선택 프로필 및 제한된 후보 경로 존재 | production-spouse-official-reading-candidate-authority.ts에서 implementationAuthorized=true이나 Production transport/semantic delivery/persistence/public/commerce 권한은 모두 false, production=HOLD | 제한적 구현 후보만 허용. 배우자 역할·성별·관계 결과를 미확정 규칙으로 단정하지 않으며 공식 전달 권한 미완료 |
| **7. 연간 T9** | general-annual-reading-candidate.ts, 연간 Narrative Profile, 서울 달력연도·입춘·대운 구간 계산 | 후보 0.1.0-research; 내부 정책 Source, Methodology/Rule/Pack 연구 상태, reviewer unreviewed | general:annual 선택 프로필. annual-monthly-birth-research-runtime.ts는 internal_research_only, mayPublish=false, maySell=false, mayGrantOfficialAuthority=false | 기존 500/3,000건 기간 회귀 및 #2762 기간·서명 연결 PR 존재. #2762는 open | 기간 계산·연구 해설 가능, 공식 연간 의미 미완료. 연간 결론별 원국·대운·세운 근거, 문장·기간 일치 및 정식 Reader 발급 검증 필요 |
| **8. 월간 T9** | general-monthly-reading-candidate.ts, 월별 Narrative Profile, 절입 전후 구간 및 월주 계산 | 후보 0.1.0-research; 내부 정책 Source, Methodology/Rule/Pack 연구 상태, reviewer unreviewed | general:monthly 선택 프로필. 두 절입 구간을 분리하는 연구 Runtime 존재 | 기존 500/3,000건 기간 회귀 및 #2762 기간·서명 연결 PR 존재. #2762는 open | 절입 구간별 계산·연구 해설 가능, 공식 월간 의미 미완료. 요청 월·두 절입 구간·적용 시점·원국 접점의 정확한 문장 및 재열람 검증 필요 |
| **9. 궁합 T10** | 두 Canonical 명식, 일간·일지·타주 관계 관측, compatibility-two-birth-research-runtime.ts | 명하 내부 채택 T10 규칙 및 조건부 관계 설명 구현. 결혼 성공·이별·외도 등 결과 예언은 허용되지 않음 | compatibility:natal 선택 프로필 및 두 명식 연구 Runtime. 별도 두 명식 Source·Reader 경로 존재 | Saju #2763 및 #2808/#2809 병합. #2809는 T10 내부 5단계 해석·발급·Reader 통합 트랙 완료 기록. MyeongHa #3402는 세 비교 구성의 독립 발급·Reader·동의/환불 경계를 격리 PG17에서 검증. #3403의 10,000건 합성 Source 요청 검증 통과 | 내부 T10 해석·서명 Source·Reader 통합 검증 완료 범위. #2809 완료는 T10 내부 트랙 한정이며 실제 결제·운영 배포·판매 활성화는 별도 HOLD |
| **10. 질문별 T11** | question-related-natal-reading.ts; 기존 다섯 원국 보고서에서 질문과 일치하는 이미 존재하는 T8 근거 문단 선택 | 독립 T11 질문 해석 Claim/Rule/Production Pack은 확인되지 않음. 질문 라우팅은 의미를 새로 만들지 않음 | question_specific:natal 선택 프로필. 기존 근거 범위 제한 Preview | 질문별 연구 Preview 및 기존 T8 Claim 연결 검사 존재 | 기존 T8 근거의 질문별 재배치만 가능. 질문 자체로 새 명리 의미를 만들거나 T11 공식 풀이로 취급할 수 없음 |
| **11. 대운·인생 단계** | life-stage-birth-research-runtime.ts, 현재·다음 대운 구간 계산 및 표시 | 계산된 대운 구간과 실제 사건·성과·길흉 해석은 별개. 전용 T9 life_stage Production 의미 Producer 미확인 | life_stage 선택 프로필. Runtime은 internal_research_only, interpretationStatus=source_authority_not_established, 게시·판매 권한 없음 | 실제 기준 시각과 대운 구간 계산을 검사하는 연구 Runtime 존재 | 대운 계산 사실만 가능. 사건·길흉·성과를 해석하는 독립 의미·근거·공식 발급 미완료 |

### 3. 공통 원국 기반과 메뉴 수의 구분

General Natal은 직업·사업·재물·관계 등 분야별 원국 해석을 위한 공통 기반이다. 폐지된 단독 General 유료 상품을 재출시하거나 공통 원국 판단을 11개 독립 해석 영역 중 하나 또는 별도 SKU로 세지 않는다.

2026-11-24 현재 Saju main의 general-natal-integrated-reading-registry.ts는 기존 General T8 자산을 모은 연구 Pack이며 status=research다. #2817~#2820의 공통 원국 판단도 별도 Production 엔진이 아니라 연구 전용 후보 체인이다.

### 4. 2026-11-06 승인 고객 카탈로그 — 해석 영역과 별도 관리

MyeongHa main packages/contracts/src/approved-saju-catalog.ts는 2026-11-06 승인 고객 카탈로그를 코드로 보존한다. 총 14개 Offer다.

| 구분 | Offer ID | 고객 상품명 | 가격 |
|---|---|---|---:|
| 단품 | career | 직업·커리어운 | 9,900원 |
| 단품 | business | 사업운 | 9,900원 |
| 단품 | wealth | 재물운 | 9,900원 |
| 단품 | relationship | 나의 인연·관계운 | 9,900원 |
| 단품 | year | 올해의 사주 | 7,900원 |
| 단품 | month | 이번 달의 사주 | 4,900원 |
| 관계 비교 | first-counterpart | 첫 번째 상대방과 관계 비교 | 12,900원 |
| 관계 비교 | additional-counterpart | 두 번째 이후 상대방 1명당 | 9,900원 |
| 관계 비교 결합 | relationship-plus-first | 나의 인연·관계운 + 첫 관계 비교 | 19,900원 |
| 패키지 | career-economy | 커리어·경제 패키지 | 24,900원 |
| 패키지 | basic | 전체 사주 기본 | 29,900원 |
| 패키지 | basic-year | 전체 사주 + 올해 | 35,800원 |
| 패키지 | basic-month | 전체 사주 + 이번 달 | 33,800원 |
| 패키지 | basic-year-month | 전체 사주 + 올해 + 이번 달 | 39,700원 |

카탈로그 그룹은 단품 6종, 관계 비교 3종, 패키지 5종이다. 각 Offer는 필요한 Reading component의 조합을 나타낼 뿐 실제 Charge나 Entitlement Grant 권한을 부여하지 않는다.

다음 구분을 고정한다.

- **11개 해석 영역:** Career, Business, Wealth, Relationship, Family, Spouse, Annual, Monthly, Compatibility, Question-specific, Daewoon.
- **14개 승인 구매 Offer:** 위 카탈로그 표.
- **19개 Reading Intent/Profile shape:** 소비자 요청에 따라 기존 Claim을 선택하는 계약이며 실제 Claim·해석 권한과 동일하지 않음.
- **General Natal:** 공통 기반이며 별도 단독 유료 SKU가 아님. basic은 Career + Business + Wealth + Relationship 네 Reading의 패키지다.
- Family, Spouse, Question-specific, Daewoon은 현재 승인 카탈로그의 독립 구매 Offer로 등록되어 있지 않다. 연구·선택 Profile 존재만으로 판매 상품을 만들지 않는다.

구형 docs/PAID_PRODUCT_CATALOG_V1.md의 saju.general_natal.deep.v1 및 9,900원 General 단독 상품 정의는 SUPERSEDED / HISTORICAL이며 현행 카탈로그 권한으로 사용하지 않는다.

### 5. 관련 PR·검증의 현재 상태

#### Saju

| PR | 범위 | 현재 상태 |
|---|---|---|
| #2762 | 연·월운 기간 고정 및 보호된 Source 연결 | OPEN. 기간 해석·정식 발급 연결의 남은 검증 대상 |
| #2763 | 두 명식 구조 근거 및 T10 | MERGED. T10 내부 5단계 완료 기록은 #2809에 한정 |
| #2808 | 본인 일반 연애운 T8 서명 발급기 | MERGED. 좁은 relationship:natal:general Release |
| #2809 | T10 내부 발급·Reader 5단계 인수 | MERGED. 실제 결제·공개 판매 완료 아님 |
| #2812 → #2816 → #2814 → #2815 → #2813 → #2817 → #2818 → #2819 → #2820 | 직업·재물·기간·관계·사업 및 공통 원국 판단의 순차 구현 체인 | 전부 OPEN / 미병합. #2812~#2816은 비-Draft, #2817~#2820은 Draft |
| #2821 | 여섯 메뉴 해석 완성 설계 초안 | OPEN / Draft. 아래 정합성 검토 전 병합 금지 |

#2819의 500건·10,000건·메뉴 및 발급 회귀(run 45307584481)와 #2820의 동일 회귀(run 45345809083)는 각각 전체 성공이다. 두 실행은 해당 시점의 순차 PR 체인에 대한 검사이며 미병합 PR을 main에 반영한 것으로 간주하지 않는다. #2812~#2818의 개별 HEAD에는 GitGuardian 검사만 확인되었고, 후속 #2819/#2820의 전체 회귀가 해당 선행 변경을 포함한다.

#2821은 현재 6개 메뉴를 하나의 완성 범위로 설명하지만, 본 인벤토리의 11개 독립 해석 영역과 14개 승인 구매 Offer를 대체하지 않는다.
- 여섯 메뉴는 구현 작업 범위일 수 있지만 전체 제품 메뉴 목록이 아니다.
- 사업은 승인 카탈로그의 단품이지만, 그 사실만으로 #2821의 사업 해석 후보가 Production 의미 권한을 얻지는 않는다.
- #2821은 #2820 최신 HEAD 2a335dec63c6bdf7c36b73d7376fef144ce139b6보다 이전인 8ed2d3125872513b6bc14e9b829949cdb79c3624를 base로 사용한다.
- 따라서 #2821은 11개 영역·현재 카탈로그·최신 공통 판단 체인과 정합성을 맞춘 뒤 별도 처리한다.

#### MyeongHa

| PR / Issue | 현재 상태 | 이번 인벤토리에서의 의미 |
|---|---|---|
| #3402 | MERGED to main | 본인 T8 + T10 독립 발급, 격리 PG17 보관함·Reader·동의 철회·환불 검증 |
| #3403 | OPEN, 필수 CI 3/3 SUCCESS | 합성 입력 10,000건의 T8/T10 Source 서명 요청 검증. 운영 구매/DB 쓰기 10,000건이나 실제 결제 증거는 아님 |
| #3159 | OPEN, 문서 전용 | 승인 카탈로그와 Reader Preview 추적 문서. 카탈로그 코드 자체는 main에 존재 |
| #3131 | OPEN | 보호된 상담형 AI 생성 및 Reader 비교 Shadow. 실모델 유료 실행·공개 기능이 아님 |
| #3207 | OPEN | GEPA 오프라인 공통 계약. 실제 GEPA 최적화·유료 탐색·운영 승격 아님 |
| #3295 | OPEN | 6개 캐릭터 Chat/Reader 출시 범위 정렬. 공개 활성화 아님 |
| #932 | OPEN Issue | Character Saju Rendering 공유 Grounding 구현의 상위 추적 항목 |

현재 main 기준 주요 미완료 운영·권리 이슈:
- #1034 — 유료 Product와 정확한 Reading artifact 결속 및 실제 구매/재열람 검증
- #1887 — Production migration-history 정합성 및 DR 복구 증거
- #2200 — Seyeon Production Chat 500 오류와 보류된 DB RPC 연결
- #2318 — 유료 해설 보호 본문·파생 기록의 보관/삭제/복원 인수
- #2503 — Legal & Compliance L1~L5
- #2025 — Vercel Hobby 상업 이용 제한 해소 결정
- #1871 — 격리 스테이징 인프라·운영 권한 및 R01–R14 실증

#3402의 격리 검증 및 #3403의 10,000건 Source 요청 CI 통과는 실제 결제, Production DB 배포, 상업 운영, 공개 판매의 증거가 아니다. 운영 판매 HOLD는 유지한다.

### 6. 현재 결론과 다음 실행 경계

| 항목 | 현재 판정 |
|---|---|
| 11개 독립 해석 영역 인벤토리 | 현재 기준으로 분리 완료 |
| 14개 승인 Offer 카탈로그 | main 코드에서 확인 |
| 19개 Reading Profile shape | 선택 계약 존재 |
| Saju 기존 7단계 기술 검증 | 기존 범위 VERIFIED, 불필요한 재실행 금지 |
| Saju 전체 Production Authority | BLOCKED |
| Relationship T8 좁은 서명 경로 | 존재, 전체 권한으로 확대 금지 |
| T10 내부 해석·발급·Reader | #2809 범위 완료 |
| Career / Business / Wealth T8 | 연구·Preview, 공식 발급 미완료 |
| Family / Spouse T8 | 범위별 의미 권한 미완료 |
| Annual / Monthly T9 | 연구 및 기간 계약, 공식 의미 미완료 |
| Question-specific T11 | 기존 근거 선택, 독립 T11 의미 미완료 |
| Daewoon | 계산 사실, 독립 기간 해석 미완료 |
| MyeongHa actual sale | HOLD |

다음 구현은 새 엔진이나 추가 메뉴를 만들지 않는다. 우선 최신 미병합 Saju 체인(#2812~#2820)의 선행 관계·전체 회귀·연구 권한 경계를 유지하면서, 각 메뉴가 실제로 소비하는 기존 T5/T6/T8/T9 근거와 한국어 문단의 의미 연결을 완성한다. #2821은 위 상품·메뉴 구분과 최신 HEAD 정합성을 수정한 뒤 처리한다.

이 갱신은 카탈로그 가격·상품·결제·Entitlement·Production 권한을 변경하지 않는다.
