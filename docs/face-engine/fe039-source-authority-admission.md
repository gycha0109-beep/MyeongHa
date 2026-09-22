# FE039 — Source Authority & Criterion Candidate Admission Foundation

Watchtower-Track: face-reading

## Purpose

FE039 creates the source-authority admission boundary that must exist before any traditional face-reading criterion can be operationalized.

The authority chain introduced here is:

`Source Work -> Witness -> Passage -> Methodology Statement -> Source Authority Admission -> Criterion Candidate`.

FE039 intentionally stops before metric operationalization, executable rules, structured claims, or narrative.

## Contracts

### Source Work

Identifies the work independently from a particular edition or scan.

### Source Witness

Identifies the exact edition/digital witness used for provenance.

Witness status is one of:

- `candidate`
- `verified`
- `deprecated`

A deprecated witness is never admitted.

### Source Passage

Carries an exact passage from one witness.

Passage verification is one of:

- `unverified_ocr`
- `scan_checked`
- `double_checked`

`unverified_ocr` may be admitted for research only. A production candidate requires every included passage to be at least `scan_checked`.

### Source Lineage

Records quotation/adaptation/derivation relationships without converting source count into evidence strength.

No source-count score or strength tier is generated.

### Methodology Statement

Preserves a source-backed traditional/methodological statement as a reviewed semantic research unit.

It is not a metric threshold and is not consumer prose.

## Admission states

FE039 separates:

- `research_admitted`
- `production_candidate`

`production_candidate` does **not** mean `production_authorized`.

Production-candidate admission requires:

- verified witness;
- all passages `scan_checked` or `double_checked`;
- all methodology statements `reviewed`;
- complete in-bundle provenance references.

## Deterministic fingerprint

A normalized authority bundle is SHA-256 fingerprinted.

Ordering noise in title/author/reference lists does not alter the fingerprint. Runtime timestamps, CI IDs, and random identifiers are not included.

## Criterion Candidate

A source authority admitted as `production_candidate` may create a Criterion Candidate with the fixed state:

`source_supported_not_operationalized`.

The candidate is forced to carry:

- `operationalizationRef = null`
- `ruleRef = null`
- `productionCriterionAdmitted = false`

It cannot contain thresholds, comparison bands, classifications, score/rank, structured claims, traditional interpretation output, narrative authority, or LLM semantic authority.

## FE038 remains locked

FE039 does not modify the FE038 interpretation-shell authority state.

The runtime interpretation shell remains:

- `criterion.state = not_admitted`
- `claims = []`
- `narrative.allowed = false`

## Fixtures

All FE039 tests use explicitly synthetic, non-authoritative source material.

No real traditional source passage, real threshold, real classification rule, or real physiognomy claim is admitted in FE039.

## Privacy boundary

FE039 is source-governance infrastructure only.

It accepts no raw images, landmarks, geometry, account IDs, user IDs, capture IDs, face embeddings, or identity material.

## CI

FE039 uses existing shared CI only. No FE039-specific workflow is created.

## Next step

The next authority layer should introduce a bounded observation/metric registry before any operationalization contract can map traditional source-backed methodology onto measurable neutral observations.
