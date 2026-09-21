# FE038 — Fail-Closed Criterion / Structured Claim / Narrative Interface Shell

Watchtower-Track: face-reading

## Purpose

FE038 introduces the governed seam after the existing neutral observation pipeline without admitting any physiognomy interpretation authority.

The intended long-term order is:

`Neutral Observation -> Criterion Admission -> Structured Claim -> Narrative Permission`.

FE038 implements that order as a locked interface only.

## V1 authority state

The only admitted runtime state is:

- `criterion.state = not_admitted`;
- `claims = []`;
- `narrative.allowed = false`.

The contract cannot represent an admitted criterion, a non-empty claim set, or an enabled narrative.

## Neutral observation bridge

The web bridge accepts a successful FE031 one-shot neutral observation and an opaque observation reference.

It forwards only bounded provenance:

- source contract version;
- source projection schema version;
- metric count;
- region count;
- opaque observation reference.

Metric names, metric values, unavailable-surface details, raw geometry, provider traces, images, and biometric identity material are not copied into the FE038 shell.

## Positive admission

`admitFaceInterpretationShellFE038` accepts only the exact V1 fail-closed shape.

It rejects:

- criterion admission;
- methodology, operationalization, rule, or source authority references;
- non-empty structured claims;
- narrative enablement or narrative text;
- score, rank, classification, or arbitrary extra fields;
- LLM semantic authority;
- production authority.

This is allow-list validation rather than a keyword-only deny list.

## Product boundary

FE038 does not change the physiognomy page UI and does not widen the current public result projection.

No LLM call, deterministic narrative renderer, traditional interpretation mapping, score, ranking, classifier, or fortune claim is introduced.

## Privacy

FE038 adds no persistence of raw images, canonical images, raw landmarks, geometry, face embeddings, or identity templates.

## CI

FE038 uses existing shared CI only.

No FE038-specific workflow is created. Existing package/web path routing causes the shared gates, including the existing Face Reading browser regression path, to run when relevant.

## Next authority step

A future version may add admitted criterion states only after source-backed methodology, operationalization, rule, and provenance authority are separately established and versioned. That must be a new contract version rather than silently widening FE038 V1.
