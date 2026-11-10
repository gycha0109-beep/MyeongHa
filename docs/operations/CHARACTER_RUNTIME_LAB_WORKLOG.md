# Character Runtime Lab — WORKLOG

> Watchtower-Track: character-runtime-lab
> Repository: gycha0109-beep/MyeongHa
> Track scope: isolated, synthetic Character language/model experiments; not the character-memory work track
> Status: DIAGNOSTIC FIX PROPOSED / PAID EXPERIMENT RETRY NOT YET VERIFIED

## 2026-11-08 — Taegyeom GLM/Luna A/B failure diagnosis and safe main-only retry

**Goal:** Diagnose the reported RED GitHub Actions run without treating an independent Character Runtime Lab experiment as the Character Memory PR. Preserve protected main/environment and existing fixed model, privacy, request-count, token and USD budget controls.

**Failure evidence:** [Taegyeom language A/B run #42412622575](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42412622575), main HEAD `a699f532158da7369496b20fcb57a20d56f61dc2`, attempt 1 evaluate job `128523822240`, and attempt 2 evaluate job `128525820264`: each completed FAILURE in the isolated model experiment step with `LANGUAGE_AB_OPAQUE_FAILURE`, `attempted=1`, `completed=0`, reported cost USD 0. Both dependency install and TypeScript build succeeded. The generated report for attempt 1 is [artifact #13589289021](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42412622575/artifacts/13589289021) and for attempt 2 [artifact #13590840909](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42412622575/artifacts/13590840909). This evidence confirms two failed attempts, not a successful repeat or settled invoice cost.

**Cause and limits of proof:** At the original commit, the HTTP non-2xx handler constructs `LANGUAGE_AB_HTTP_<status>_<model_slug>` with lower-case model slug, but the outer failure sanitizer only accepts `/^LANGUAGE_AB_[A-Z0-9_]+$/`. Therefore an HTTP rejection is reported as OPAQUE. No HTTP status or provider rejection reason can be reconstructed from the original artifacts/logs; the external provider defect itself is **not** established or repaired by this diagnostic change. Network/timeout exceptions are also sanitized.

**Implementation / changed files:** Existing [PR #3137](https://github.com/gycha0109-beep/MyeongHa/pull/3137), branch `fix/character-runtime-lab-language-ab-diagnostics`, code parent `f32fbc066ef59b6688c1dd42a8fe0faead4c03a3`:
- `scripts/run-taegyeom-language-model-ab-v1.mjs`: uppercase the model slug in the safe HTTP error identifier; preserve limited timeout/reset categories, never emit provider error bodies, API keys or private prompts.
- `.github/character-runtime-taegyeom-language-ab-v1.trigger`: prepare one new main-only retry after protected merge; retains the preexisting no-fallback, ZDR/data-collection restrictions and max 144 calls / USD 0.20 reported-cost stop.
- `docs/operations/CHARACTER_RUNTIME_LAB_WORKLOG.md`: this evidence and status entry; this is a new track-specific WORKLOG because none existed at this path.

**Completed:** Original and repeated failure logs compared, deterministic sanitizer bug identified, safe error-code patch and main-only trigger proposed. PR #3137 parent-head CI [#42412916008](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42412916008), [Governance #42412915966](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42412915966), and [Web Domain #42412916127](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42412916127) completed success; [integration #42413470725](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42413470725) was PENDING when the evidence was checked. PR description reports local `node --check` and `git diff --check` succeeded. These results apply to commit `f32fbc0` **before this WORKLOG commit**.

**Incomplete / blockers:** The patched script has **not yet** run against OpenRouter; model availability/status, actual cost and 144-case completion cannot be inferred. PR requires its exact new HEAD checks, protected main merge and the **new** one-shot experiment's output artifact. A main-only production-environment secret and external Provider acceptance remain necessary, but secret value must not be printed or modified. No Character production activation is approved by this diagnostic patch.

**Next:** Verify the WORKLOG child HEAD CI / protected integration and enable existing PR auto-merge when allowed. Once merged, inspect the newly triggered main-only Taegyeom experiment and report its actual safe HTTP failure code or successful case count; if the provider still rejects, maintain HOLD without trying other models or bypassing privacy/cost gates. Keep the independent character-memory PR #3068 and its CI verdict separate.


## 2026-11-08 — Luna parameter routing diagnosis after protected merge

- PR #3137 merged as `089486fc8957698f0b3b07a0960849223d43c82e`. Its exact-head integration #42414311360 succeeded.
- Main-only experiment run #42415462720 failed at **attempted=1, successful=0** with `LANGUAGE_AB_HTTP_404_OPENAI_GPT_6_LUNA`. This is an actual OpenRouter routing rejection, NOT evidence the named model is absent.
- Public OpenRouter Models API returned `openai/gpt-6-luna` in the general and ZDR catalogs; its endpoint supported parameter lists include JSON schema, reasoning, max_tokens but do **not** list `temperature`. GLM endpoints do list `temperature`.
- The script had `provider.require_parameters=true`, `temperature:0.7` for Luna. The 404 is consistent with a no-eligible-route result, but the exact provider message was deliberately not logged; the routing cause is therefore strongly suspected, not proven.
- Fix: omit unsupported `temperature` for Luna, retain it for GLM; explicitly record the sampling mismatch in output metadata. Keep model IDs, strict JSON schema, ZDR, deny data collection, no fallback, 144-call maximum, USD 0.20 reported-cost hold, production isolation unchanged.
- Once protected CI and integration succeed, one main-only trigger runs the corrected experiment. Report actual counts, original replies and model-specific token/cost/latency; no claims of success before artifact inspection.


## 2026-11-08 — Yeoul matched GLM / GPT-6 Luna 144-reply synthetic experiment proposed

- User selected Yeoul after reviewing 144 Taegyeom responses; retain the fixed two-model, 12-question × 2-repeat × 3-prompt-shape experimental structure and USD 0.20 provider-reported budget cap.
- Source of truth: `CHARACTER_RUNTIME_AUTHORING_V1` with characterId `yeoul`. Approved Yeoul character is a gentle, perceptive emotional observer with nuanced feelings, open conclusions, slow deepening, and soft boundaries, not Taegyeom's strict principles.
- New script `scripts/run-yeoul-language-model-ab-v1.mjs` and main-only GitHub workflow `character-runtime-yeoul-language-ab-v1.yml`; 12 character-adapted synthetic prompts, baseline core persona JSON vs natural-language advice vs four distinct fictional conversational examples, 144 possible calls, ZDR/deny/no-fallback, $0.20 provider-reported cap.
- Node syntax, TypeScript build, responsibility map and Actions security checks passed locally. No real model calls or production character changes have been made yet.
- Next: merge only after exact-head PR CI/integration is successful; inspect one-shot experiment and preserve all raw replies, provider-reported cost, latency, persona differences and fabrication cases. No automatic production promotion.


## 2026-11-08 — Correct Yeoul persona regression against her Bible / Runtime Draft

- Root cause: `packages/character-content/src/runtime-authoring-v1.ts` summarized Yeoul as a gentle poetic emotional observer, while `docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md` and `docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md` define **quick reactions, prickly-but-not-cold politeness, care leaking before verbal admission, embarrassment when caught, potentially jealous indirect probing supported only by real relationship evidence, and eventual direct admission on deep trust**. Earlier 144-call experiment tested the incorrect prompt concept, so its character-fidelity ranking is invalid though raw API metrics remain valid.
- Change: restore Yeoul's characteristic fast teasing, response attention, action-first care, embarrassment/short denial, and direct boundaries in the runtime authoring profile/behavior. Ordinary replies must not all sound like denial; no immediate jealousy, confession or invented history. Do not change Saju semantic authorities, protected disclosures, or production relationship/memory.
- Corrected isolated runner `scripts/run-yeoul-language-model-ab-v1.mjs`: 12 prompts target Yeoul-specific personality, three alternatives retain original 2×3×2 144 request matrix and model, no-fallback, ZDR and $0.20 strict stop settings. No one-shot trigger update, so **no new paid calls automatically run**. The earlier report remains historically accurate as an invalid-persona baseline.
- Validation: syntax check, 12 local tests across Yeoul alignment and general runtime authoring, TS build, diff whitespace check all passed. Review against Bible and Runtime Draft as **source-aligned development**, not a claim of independent immutable production canon publication.
- Next: exact-head required CI + integration before protected merge. No new paid experiment or production character promotion without separate approved next action.

## 2026-11-10 — Yeoul offline quality preparation from 288 direct ratings
- Resume from verified `main@4de4e050e1e9393850a34eb68f8fa60973dc9f63`; original 288-call workflow run #42572722295 succeeded, archived response artifact still unexpired. Locate cleaned user evaluation in private library, parse all 288 rows: no duplicate matrix key; 94 good, 194 other, 117 free-form notes, 11 good-with-caveat, all discrimination fields unevaluated. No repeated paid calls or user review.
- Add isolated, explicit-input research parser `scripts/character-runtime-lab/yeoul-quality-offline-v1.mjs`: validates matrix/ratings/cost and source preservation, diagnoses user labels vs unconfirmed note heuristics separately, emits only private-file outputs with SHA-256 provenance, holds pairwise as observational candidates, prepares unapproved teacher packets.
- Add reviewed-only and exact-relationship-gated few-shot selector, four offline prompt plan shapes with pinned anchor requirement, 10 separate synthetic holdout scenarios, and 6 executable local Node tests (PASS). Source drafts are not production publication authority. No production API/model/prompt/Canon/DB/relationship/memory changes.
- Pending: direct binary-copy execution of the user's cleaned export in a local Node environment (Library source is searchable/readable but not materializable in this container), prompt/teacher candidate review, paid benchmark requiring separate approval, new holdout performance evidence and operational publication. Do not declare `ROADMAP_COMPLETE`.

## 2026-11-10 — Yeoul offline evaluation boundary and cost reconciliation
- Expanded independent research-only tooling on PR #3187: feedback-tagged rule suggestions (pending review, not automatically promoted), four candidate prompt preflight shapes, historical-cost-only benchmark estimate, and strict comparison aggregation for independently human-reviewed results. Local Node total now 12 PASS.
- Hardened example retrieval and prompt composition: explicit reviewed source references, exact relationship/history/approved-fact match, and no zero-similarity example fallback. No unapproved example can enter research prompt plans; no runtime/DB/Canon changes.
- Re-read the exact private cleaned 288 evaluation JSON from Library (288 rows, unique keys 288, 117 notes, 83 clean-positive candidates, all discrimination unevaluated). Found real provenance discrepancy: run metadata cost USD 0.04236847 vs sum of row cost USD 0.0423234848 (difference ~0.0000449852); cause unknown. Fixed validator to preserve both numbers and flag costReconciled=false rather than rejecting source or rewriting its user ratings.
- Raw original source remains private and is not committed; this container does not have authorized direct byte materialization for the file, so complete local CLI invocation with the original physical file is still pending. No fresh paid calls, GEPA execution, human reevaluation, production routing, or reported quality gain. Next milestone: private original-file CLI execution when file access is available and separately approved new-scenario benchmark.

- Follow-up offline teacher-result staging: new stageTeacherSuggestion accepts only the legacy development split, pinned Yeoul draft-source references and existing Yeoul Runtime action IDs; rejects unapproved fact IDs, unsupported shared history/relationship and reserved holdout inputs. Even successfully parsed proposals stay pending human/Canon review and never become production replies. Local tests now 13 PASS. No API usage.
