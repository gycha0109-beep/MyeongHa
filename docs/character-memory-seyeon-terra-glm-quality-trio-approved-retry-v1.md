# Character-memory Luna+Terra vs GLM — approved one-shot correction

## Failed original execution

- Original PR: #2423; exact merged SHA: `0a85ca73516f653f1d0dcb8afcb654f4a63ac771`.
- Original experiment run: [39705998598](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39705998598), completed failure, attempt 1.
- Original numeric evidence: `NETWORK_FAILURE`, 0 reserved/model attempts, 0 guarded dialogue pairs, OpenRouter account usage delta $0. OpenAI invoice was **not** reconciled.
- Actual cause in wrapper: `name.slice(8,-3)` mistakenly treats nine-character prefix `myeongha_` as eight characters; the first schema name `myeongha_unified_preflight_shadow_v2` becomes `_unified_preflight_shadow`. Validation rejected the request **before dispatch**. The general provider incorrectly labeled that thrown fetch-hook exception `NETWORK_FAILURE`.

## Corrected implementation

- Exact equality `myeongha_${expectedStage}_v2`, with an explicit allowlist for three stages. No substring-based parser.
- Validation and durable reservation are moved into `meteredBeforeDispatch`, before any paid model request. Rejected requests now surface as `PRE_DISPATCH_REJECTED` instead of implying external connectivity failure.
- Remaining `fetchImpl` meters outcomes and enforces token costs and response conditions.
- One separate retry workflow `seyeon-terra-glm-quality-trio-retry-v1.yml`, triggered only by its dedicated main-branch marker and never by `workflow_dispatch`. Admission pins original failed run and enforces exact one-run, first-attempt, main-only, baseline checks.

## Unchanged restrictions

- Fixed public synthetic inputs: N06, N10 and N21, four synthetic Census reads per route.
- Per case: Luna 1 + Terra 2 versus OpenRouter GLM 3. Maximum **18** additional paid requests total; no fallback or automatic replays.
- New worst-case reservation USD 0.54 = 1,350 KRW at 2,500 KRW/USD; prior conservative reservation USD 0.976554 = 2,441.385 KRW, cumulative ceiling 3,791.385 KRW, within the 5,000 KRW owner limit.
- Reservation ceilings do not represent actual invoices. OpenAI actual billed amounts cannot be asserted without invoice reconciliation.
- No production promotion, private source access, or generated content artifacts. Only final public, guard-approved replies may appear in experiment logs.
- If a request has uncertain provider/billing state or any guard fails, stop. This approved retry is lifetime once.
