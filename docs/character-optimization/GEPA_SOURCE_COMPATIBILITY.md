# GEPA source/API compatibility — verified source, runtime still pending

Checked 2026-11-11 (upstream source inspection, no model API calls).

- PyPI latest listed `gepa==0.1.4` (2026-07-15): tag `v0.1.4` has `src/gepa/optimize_anything.py`, with legacy `optimize_anything(..., config: GEPAConfig | None)`. It lacks the newer `OptimizeAnythingConfig` and `test_set`. **Do not use 0.1.4 as a verified lock for architecture v0.3.**
- Upstream main commit `ce5b0d6e3d6af6c6dbec6de2c54536bbb961d309` (2026-11-09) has `src/gepa/oa/config.py` with `OptimizeAnythingConfig`. This is an **unverified candidate revision**, not an approved dependency lock. Current official docs describe this new interface.
- MyeongHa `runner.py` rejects incompatible installed API signatures instead of silently downgrading to the legacy API. `gepa_api_contract.py` builds new-API-shaped arguments with an injected mock configuration class, without running GEPA or OpenRouter.
- Next: install a fully pinned revision/dependency set in an isolated fake-evaluation environment; prove signature, callback behavior, private output, holdout isolation, and spend controls. No production or paid execution until then.

Sources:
- https://github.com/gepa-ai/gepa/blob/v0.1.4/src/gepa/optimize_anything.py
- https://github.com/gepa-ai/gepa/blob/ce5b0d6e3d6af6c6dbec6de2c54536bbb961d309/src/gepa/oa/config.py
- https://gepa-ai.github.io/gepa/api/optimize_anything/OptimizeAnythingConfig/
