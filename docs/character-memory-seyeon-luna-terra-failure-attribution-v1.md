# Se-yeon Luna/Terra public synthetic evaluation: failure attribution correction

**Track:** `character-memory` · **scope:** experiment-only instrumentation, no new paid model dispatch or production route changes.

## Evidence and root cause candidates

- Original failed run [39705998598](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39705998598): 0 reservations, first Luna provider metric `NETWORK_FAILURE` in approximately 1 ms; deterministic stage-prefix extraction bug caused a locally thrown error.
- Corrected rerun [39715402328](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39715402328): one Luna reservation ($0.02 maximum), provider metric `NETWORK_FAILURE` after approximately 4,328 ms, no recorded HTTP status, usage or final dialogue; Terra and GLM not attempted. Provider invoice remains unreconciled.
- Static code investigation found an **unbound variable**: `stage` was declared inside the `meteredBeforeDispatch` callback, then referenced inside the independent `fetchImpl` callback when composing the `observed` record and stage counter. This is a `ReferenceError` if the response reaches this section; the generic OpenAI provider catches any fetch-hook exception and reports `NETWORK_FAILURE`. This defect is consistent with the second failed run, but historic logs cannot prove whether the request reached that point.
- The same model (`gpt-5.6-luna`) returned HTTP 200 on older successful comparison run [39352712484](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39352712484). No persistent unsupported-model conclusion is justified.

## Implemented change

1. Use the allowlisted `expectedStage` binding in post-response accounting; preserve existing three approved stage names and per-stage limits.
2. Instrument the experiment's OpenAI request wrapper with explicit, non-overlapping failure phases:
   `provider_origin`, `transport`, `http_status`, `response_parse`, `usage_validation`, `cost_validation`, `observation_write`.
3. Emit a single fixed-vocabulary `SEYEON_TERRA_GLM_QUALITY_TRIO_FAILURE` event and a numeric-only artifact's `failureDiagnostic` on a failed observed call. The event includes controlled case/stage/model/route, provider HTTP status **only if received**, a predefined reason code, and an optional allowlisted underlying transport cause code. It never serializes exception messages/stacks, HTTP headers, provider response bodies, generated replies, prompts, credentials, or private memories.
4. On failed observation writes, emit a separate fixed persistence warning. A failure cannot be reclassified as a successful guard result; partial pair replies are not exposed.
5. Regression tests cover the unbound stage, all failure phases, allowed versus arbitrary cause codes, numeric HTTP status, and secret-bearing exceptions.

## Budget and execution

This PR does **not** add a workflow trigger and does **not** re-execute either paid one-shot job. The approved comparative design and limits remain N06/N10/N21, Luna 1 + Terra 2 against GLM 3 per case, no retries/fallback, max 18 requests if separately authorized, 5,000 KRW cumulative ceiling, no production promotion. Previous reserved amounts are **not** invoices; OpenAI charged amount remains unverified. The actual error underlying prior `NETWORK_FAILURE` cannot be recovered retroactively.
