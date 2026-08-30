# FR-DATA-07 — Independent Human Face-Count Ground Truth Protocol

## Purpose

FR-DATA-06 records what the pinned MediaPipe Face Landmarker runtime returns for an image. It does **not** establish whether a human face is actually present, whether exactly one human face is present, or whether a provider candidate corresponds to a human subject.

FR-DATA-07 defines the next required authority boundary: a provider-blind, independently frozen human face-count annotation ledger that can later be compared with FR-DATA-06 observations.

This slice defines a protocol and dataset contract only. It does not claim that a reviewed validation dataset exists.

## Independent label space

Human annotation uses exactly four labels:

- `zero_human_faces`
- `one_human_face`
- `multiple_human_faces`
- `indeterminate`

The first three are required evaluation labels. `indeterminate` is an explicit ambiguity state and cannot be silently coerced into a binary positive/negative class.

These labels are human-observation labels. MediaPipe `faceLandmarks.length`, candidate ordinal, landmark count, provider result shape, provider indices, or provider model output may not define them.

## Required blinding

For every annotation record:

- provider output is hidden;
- provider candidate count is hidden;
- provider landmarks are hidden;
- provider result-shape summaries are hidden;
- provider output is not used to choose the label;
- annotators do not perform subject-identity inference;
- the annotation is frozen before provider scoring.

The annotation asset digest must exactly match the capture asset digest.

## Freeze order

The annotation ledger may be scored only after it is frozen.

A frozen ledger requires:

- an immutable canonical SHA-256 ledger digest;
- a parseable freeze timestamp;
- all included annotations recorded no later than the freeze timestamp.

If provider runs are present, every provider run must begin at or after the ledger freeze and each capture must explicitly record that the provider run occurred after annotation freeze.

## Calibration / holdout separation

Each capture is assigned to exactly one partition:

- `calibration`
- `holdout`

The exact same canonical asset digest may not appear in both partitions.

This prevents exact-byte leakage only. FR-DATA-07 does **not** claim that near-duplicate, burst-frame, transformed, or semantically equivalent image leakage has been excluded. That remains an explicit blocker.

The holdout partition may not tune labels or decision thresholds.

## Intentionally unset empirical values

FR-DATA-07 does not invent:

- minimum captures per partition;
- minimum captures per evaluation label;
- minimum independent annotators per capture;
- inter-annotator agreement threshold;
- provider candidate decision threshold;
- acceptable false-positive rate;
- acceptable false-negative rate.

All remain `null` until reviewed empirical design/data supports them.

## Authority boundary

Even a structurally complete FR-DATA-07 dataset does **not** establish:

- provider detection construct validity;
- provider-candidate ↔ human-face identity validity;
- human-face presence verification;
- single-human-face verification;
- capture-quality authority;
- anatomical landmark authority;
- Menton / 地閣 equivalence;
- FR-35 contour binding;
- FR-36 vertical-reference promotion;
- 三停 / F1 / F6 production authorization.

Those claims remain fail-closed.

## What the dedicated self-test proves

The dedicated workflow uses synthetic metadata records only to prove that the contract:

1. accepts a correctly ordered, provider-blind frozen ledger shape;
2. rejects exact asset leakage across calibration/holdout;
3. rejects digest drift;
4. rejects provider-visible annotation;
5. rejects provider scoring before ledger freeze;
6. keeps all downstream authority flags false.

Synthetic metadata used by CI is not empirical face-presence validation evidence.

## Next step

The next appropriate slice is a preregistered scoring contract that joins reviewed FR-DATA-07 labels to FR-DATA-06 provider observations without tuning on holdout data. That scoring slice must still avoid inventing acceptance thresholds until real validation data has been reviewed.
