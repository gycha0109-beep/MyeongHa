# FR-DATA-09 — Provider Run Identity Binding

## Purpose

FR-DATA-07 records a `providerRunRef` for each validation capture, while FR-DATA-06 emits one provider observation report containing report-level runtime provenance and per-capture provider observations.

Before FR-DATA-09, those two surfaces were only joined by dataset/capture/digest evidence in FR-DATA-08. The `providerRunRef` itself was not bound to one exact FR-DATA-06 report instance.

FR-DATA-09 closes that specific evidence-identity gap without claiming external process attestation or human-face validity.

## Canonical report identity

FR-DATA-09 canonicalizes the supplied FR-DATA-06 report using:

`sorted_object_keys_preserve_array_order_json_v1`

Rules:

- object keys are sorted lexicographically at every level;
- array order is preserved;
- strings and booleans use JSON encoding;
- numbers must be finite;
- `undefined`, functions, symbols, bigint, and non-plain objects fail closed.

The canonical JSON bytes are hashed with SHA-256 and recorded as:

`sha256:<64 lowercase hex>`

This is a digest of the supplied FR-DATA-06 report content. It is **not** a reconstruction of FR-DATA-06 from FR-DATA-01..05 prerequisites.

## Canonical providerRunRef

Each capture receives a deterministic locator:

`frdata06-report-instance:<reportDigest>:capture:<encodedCaptureRef>`

This intentionally binds two identities:

1. the exact logical FR-DATA-06 report content;
2. the exact capture observation inside that report.

FR-DATA-09 requires the FR-DATA-07 `providerRunRef` to match this locator exactly.

An arbitrary run label, GitHub run ID, timestamp, or provider-generated identifier cannot substitute for the canonical binding.

## Prerequisites inherited from FR-DATA-08

FR-DATA-09 first executes the FR-DATA-08 raw join contract. Therefore it also requires:

- exact datasetRef equality;
- exact capture-ref set equality;
- exact encoded asset digest equality;
- a frozen FR-DATA-07 annotation ledger;
- provider runs recorded after annotation freeze;
- provider observation coverage for every capture;
- calibration/holdout partition preservation;
- all semantic/performance/production authority in FR-DATA-08 to remain fail-closed.

## Additional temporal consistency check

FR-DATA-09 requires each FR-DATA-07 `providerRunStartedAt` to be no later than the FR-DATA-06 report-level `providerProvenance.verificationTimestamp`.

This proves only timestamp consistency between the two records.

It does **not** externally attest that:

- the provider process really started at that timestamp;
- the GitHub Actions run metadata identifies the external process;
- the external process executed exactly once;
- an operating-system process or browser session was independently witnessed.

Those remain separate evidence problems.

## What becomes true

A successful FR-DATA-09 report may state:

- the FR-DATA-06 report content received a canonical SHA-256 digest;
- every FR-DATA-07 `providerRunRef` matches the exact report digest plus capture locator;
- every bound capture matches the exact encoded asset digest already validated by FR-DATA-08;
- every recorded provider-run start is temporally consistent with the report verification timestamp.

## What remains false

FR-DATA-09 does not validate or authorize:

- external provider process identity;
- external GitHub run identity;
- externally verified process start timestamps;
- provider detection construct validity;
- provider candidate ↔ human-face identity;
- face presence;
- single-human-face validity;
- capture-level consensus ground truth;
- inter-annotator adjudication authority;
- TP/FP/TN/FN or classification metrics;
- thresholds or acceptance criteria;
- holdout tuning;
- near-duplicate / burst / transformed-image partition leakage exclusion;
- capture-quality authority;
- anatomical landmark authority;
- Menton / 地閣 equivalence;
- FR-35 contour binding;
- FR-36 promotion;
- 三停 / F1 / F6 production authorization;
- production geometry.

## Synthetic CI boundary

The dedicated tests use synthetic typed metadata to prove deterministic hashing, exact locator matching, mismatch rejection, timestamp consistency checks, and fail-closed authority behavior.

Synthetic metadata is a contract self-test only. It is not empirical human-face evidence and does not attest a real provider process.

## Next step

After exact report-instance identity is bound, the next unresolved authority problem is independent human-label adjudication: how multiple provider-blind annotations become a reviewed capture-level evaluation label, if at all.

That adjudication rule must be preregistered and reviewed separately rather than invented from provider outputs or tuned on holdout behavior.
