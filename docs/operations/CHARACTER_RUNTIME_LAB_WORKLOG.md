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


## 2026-11-08 — GLM / GPT-6 Luna 144-case experiment completed and reviewed

- PR #3140 merged as `959a766d756416778b840ba231f2f4398e828d6e`, integration run #42417713223 SUCCESS.
- Main-only experiment [#42418325224](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42418325224) SUCCESS: 144/144 requests completed, `failure=null`, provider-reported cost **$0.01097541** against $0.20 bound; 212,573 ms total duration. The reported cost is not an invoice reconciliation.
- Result raw JSON archive: [GitHub Actions artifact #13592572074](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42418325224/artifacts/13592572074) (14-day retention). Durable complete 144-response comparative record: `docs/character-runtime-lab/taegyeom-language-ab-results-v1.md`.
- 24 responses each for six model×prompt variants. GLM average latency baseline 1368 ms, language 1555 ms, examples 1042 ms; Luna baseline 1740 ms, language 1600 ms, examples 1552 ms. GLM has more detailed character-boundary reasoning but sometimes exhibits speaker confusion and nonexistent conversational context; Luna is usually terser and natural but sometimes over-initiates intimacy or slips into generic AI meta-language.
- Both models invent unsupported daily experiences in some responses. Two single-turn repetitions per case do not establish multi-turn authenticity or statistically conclusive superiority. Sampling is not strictly identical: GLM temp=0.7, Luna provider default because Luna endpoints did not advertise temperature.
- Decision: **no automatic production promotion**. The approved isolated synthetic evaluation is now complete. Quality selection and any product changes remain separate owner decisions; no new experiment has been authorized.
