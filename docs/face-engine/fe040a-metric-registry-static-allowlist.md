# FE040A — Canonical Metric Registry Bridge & Static Observation Allowlist

Watchtower-Track: face-reading

## Discovery

The MyeongHa runtime currently pins the immutable FE024 `@myeongha/face-reading` artifact from Saju distribution commit `1f80c30f5c829ce8d0d839cdd5816dad943c5afd`.

That artifact predates FE035B and exposes the preview engine only. It does not expose the FE035B canonical product-neutral observation contract.

The canonical FE035B source currently exists at:

- repository: `gycha0109-beep/Saju`
- commit: `0f7de13b18a9dd9966074f371cbfd9554490f0ef`
- source blob: `c9ed7dfb347144759694056e89d571c433d4dfc8`
- contract: `FE035B-PRODUCT-NEUTRAL-OBSERVATION-CONTRACT-v1`
- cardinality: 13 total / 8 required / 5 conditional

## Authority decision

FE040A does **not** copy those 13 definitions into MyeongHa and does not create a parallel registry.

The upstream Saju contract remains the sole metric-definition authority.

MyeongHa only pins the upstream source identity and attempts to load the future package subpath:

`@myeongha/face-reading/product-neutral-observation-contract-fe035b`

With the currently installed FE024 artifact this load must fail closed with:

`canonical_registry_export_unavailable`.

## Canonical registry admission

A future immutable artifact may be admitted only if its exported FE035B contract:

- reports the exact FE035B contract version;
- passes the upstream FE035B assertion function;
- contains exactly 4 canonical regions in canonical order;
- contains 13 unique metrics;
- contains exactly 8 required and 5 conditional metrics;
- preserves region/unit/presence/unavailable-surface shape;
- keeps every metric semantic boundary closed;
- keeps contract authority and evolution policies closed.

The admitted registry is fingerprinted with SHA-256 and branded in-process. Structurally forged objects do not count as issued registry admissions.

## Static observation allowlist

Only these input surface kinds are permitted:

- neutral metric;
- region availability.

The exact-shape boundary rejects extra surfaces including:

- dynamic appearance / `colorAppearance`;
- raw geometry / landmarks;
- raw image bytes;
- identity or embedding material;
- user/account metadata;
- traditional terms;
- thresholds;
- scores/ranks;
- narrative.

A static observation cannot be admitted until a canonical registry admission has actually been issued.

## Required / conditional semantics

Once the upstream registry becomes available, FE040A preserves its definitions generically:

- every required metric must be present;
- a conditional metric must be absent exactly when its registered unavailable surface is present;
- unknown metric refs, unit drift, region drift, duplicate metrics, or unknown unavailable surfaces reject.

No quality judgment or retake decision is inferred from metric absence.

## FE038 / FE039 boundary

FE040A does not connect metrics to FE039 Criterion Candidates.

FE038 remains:

- `criterion.state = not_admitted`
- `claims = []`
- `narrative.allowed = false`

No operationalization, traditional binding, classification, score, ranking, structured claim, narrative, or production interpretation authority is issued.

## Next step

FE040B must provide an immutable upstream distribution artifact that actually exports the FE035B canonical registry. Only then should MyeongHa update the pinned dependency and exercise the positive canonical-registry/static-observation admission path.
