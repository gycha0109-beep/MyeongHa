# RR-02 — Saju Grounding V1 Source Integrity & Domain Readiness Audit

**Owned by:** reader-runtime (read/guard-only); Saju owns meaning and source projection.  
**Authority snapshots inspected:** `MyeongHa/main d867eeacf415309a831cf9020ef5df40832709df`; `Saju/main 3cb3b6f9c880c81c69ff4ec26a599796e09697ad`.  
**Runtime status:** public Official Reader Chat **OFF**. No Saju method, DB, Commerce, approved Product or public route altered.

## 1. Producer–consumer compatibility contract

| Boundary | Saju authoritative implementation | MyeongHa current consumer | RR-02 disposition |
| --- | --- | --- | --- |
| Current HTTP Character Grounding | `src/host/character-grounding-http.ts` → `buildCharacterGroundingBundleV1` | `apps/api/src/saju-character-grounding-http-adapter.ts` → V1 admission | Structural/version contract admitted for V1 only |
| Schema/projection/axis registry | `src/reading/character-grounding.ts` V1 | `character-saju-insight-selector.ts` / Grounding V2 consumer | Exact version equality, Fail Closed |
| Stable Unit | `grounding_unit_<24hex>` with sourceBlockRefs | Same V1 ID shape, full groundingHash and official Reading match | RR-02 requires non-empty sourceBlockRefs, as producer does |
| New Saju semantic projection | `src/reading/character-grounding-v2.ts` schema V2, projection v3, `grounding_unit_v2_<24hex>`, sourceSemanticHash | **No V2 consumer** in Official Reader Chat | Do NOT cast/alias V2 IDs to V1; explicit migration/review required |
| Domain | Nine `ReadingDomain` enum values | Nine `SajuDomain` values + Product/Grant ownership | Vocabulary compatibility only, not Product readiness |
| Cross-service E2E | Authenticated V1 HTTP host | `test/saju-character-grounding-cross-service.e2e.test.ts` | General-domain real service fixture exists; conditional on E2E env and cannot certify 9 domains or Production |

V1 Saju projections accept delivered / delivered_with_fallback Product Reading and reject unapproved input. A valid bundle version is not proof of a committed Official Reading, active Grant, approved Product, active Reader, or a saleable SKU. Those checks remain the MyeongHa A2/A3 authority and actual DB/Commerce E2E.

## 2. Nine domain audit

`general`, `family`, `relationship`, `compatibility`, `career`, `business`, `wealth`, `life_stage`, `question_specific`.

| Decision axis | Assessment |
| --- | --- |
| Contract enum present in both repositories | **PASS** — exact nine domain token set |
| Synthetic V1 hash + identity admission per token | **PASS if RR-02 contract tests pass** |
| Live Saju generation of a meaningful ProductReadingResponse in each domain | **UNVERIFIED** — fixtures from one domain cannot certify all |
| Product rule, approved policy revision, purchased grant, approved Reader per domain | **HOLD per case** unless server authority proves it |
| Unbounded first question from free-text across many independent roots | **HOLD** — first-question requires unique closed root |
| Specific official Scene segment with approved one-Unit focus | Candidate only, require same server-minted Guarded Scene + current Saju Unit closure |
| Temporal scopes Annual/Monthly/Daewoon | Not silently mapped into the nine domains: separate Saju Product/ReadingIntent authority required |

**Operational matrix rule:** For each Reader×Domain, assign one of `AUTHORIZED_LIVE`, `POLICY_HOLD`, `SOURCE_UNVERIFIED`, or `UNSUPPORTED` only after actual source/product checks. A `domain` string or a synthetic hash is never `AUTHORIZED_LIVE`. No blanket "9 × 9 PASS" claim.

## 3. Verified integrity gap and implementation

Saju V1's source producer requires every Unit to contain non-empty `sourceBlockRefs`, while MyeongHa's shape reader had accepted an empty array if a caller recalculated `groundingHash`. RR-02 aligns this with the source constraint without altering source meaning.

Another gap affected **all three Chat evidence selectors**: Saju V1 may project `calculationSummary.ambiguity` as a bundle-level calculation ambiguity without attaching it to any `unit.ambiguityRef`. Unit-only disclosure/ambiguity collection could drop that source-owned warning after narrowing to a single explanation, accidentally creating a stronger claim.

`closeCharacterStandardReaderSourceFocusV1` now centralizes companion closure, exact grounded scope, 12-Unit selection limit, source ref presence, and retains **all bundle-level disclosures and ambiguities**. A global ambiguity upgrades selected output to `protected_only` / `protected_only_candidate`, not an unconstrained paraphrase. It is used by:
- A3-κ first-question selector
- RR-01 server-guarded Scene handoff
- A3-η committed-answer follow-up evidence selector

The closure does **not** decide intent, create a new Root, validate an untrusted browser Scene, call a model, or grant Commit/Reveal. Source claims remain Saju-owned.

## 4. Test gates and next owner

- Contract tests: nine lexical domains, schema/projection mismatch (including V2), tampered hash, missing `sourceBlockRefs`.
- Reader Chat tests: global calculation ambiguity & source disclosure survive first and follow-up source narrowing; prior negative access and protected fallback cases remain green.
- E2E gate **not yet fulfilled**: real Saju Domain sample corpus + approved Product/Reader/Grant for each launched domain, actual PostgreSQL current-state and Production role.
- **Next RR-03 (DB Owner):** add immutable guarded Assistant provenance writer with transaction-atomic final Commit; `qry_official_reader_followup_anchor_runtime_v1` depends on it. RR-05/06 Reader bounded Chat can be designed independently.
- **Stop condition:** any V1→V2 implicit cast, source ambiguity dropped, cross-Reader leakage, unverified Product support claimed ready.

**RR-02 closeout:** Source-contract and regression PASS when exact-head Integration CI/merged-main checks succeed. Full 9×9 live-domain acceptance remains RR-13, not RR-02.
