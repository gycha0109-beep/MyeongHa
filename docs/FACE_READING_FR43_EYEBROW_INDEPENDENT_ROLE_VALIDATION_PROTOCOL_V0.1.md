# FACE READING FR-43 — Independent Eyebrow Component-Role Validation Protocol v0.1

## Status

**Protocol defined / no reviewed validation dataset / provider anatomical role mapping remains blocked**

FR-42 established one exact real-runtime observation: on the pinned fixture, MediaPipe eyebrow serialization component 2 is image-upper by mean normalized `y` on both provider-labeled sides.

FR-43 does not promote that observation into anatomical truth. It defines the validation experiment required to test the hypothesis independently.

## Core rule

The validation ground truth must be created **before** MediaPipe provider output is exposed to the annotator or scoring process.

The following are explicitly forbidden as ground truth:

- MediaPipe component ordinal 1/2
- the FR-42 `component_2_image_upper` observation
- provider landmark indices
- provider-predicted upper/lower roles
- traditional physiognomy semantics

## Independent anatomical target

FR-43 reuses only the neutral geometry target already reviewed in FR-41:

- medial eyebrow endpoint
- lateral eyebrow endpoint
- anatomical upper eyebrow rim
- anatomical lower eyebrow rim

Pinned evidence refs:

- `evidence.fr41.fagertun_2014_3d_landmark_variability`
- `evidence.fr41.windhager_2019_upper_lower_brow_rims`
- `evidence.fr41.kleisner_2025_facedig_brow_curves`

Annotators must be blinded to provider component indices and provider predictions. Ground truth must be frozen before provider execution is admitted into the scored dataset.

## Controlled capture strata

A structurally complete FR-43 validation dataset must represent four distinct capture strata:

1. `neutral_frontal_baseline`
2. `repeat_neutral_capture`
3. `pose_perturbation`
4. `expression_perturbation`

The protocol requires:

- same-subject linkage
- immutable image digest
- capture timestamp
- positive image dimensions
- device reference
- neutral instruction attestation for baseline/repeat captures
- explicit pose label for pose perturbations
- explicit expression label for expression perturbations
- ground-truth lock before provider run

FR-43 intentionally does **not** invent minimum subject counts or minimum captures per stratum. Those remain `null` until a reviewed validation/calibration design supplies authority for them.

## Dataset manifest

`fr43-dataset-v1` separates three record classes:

### Subject

- stable `subjectRef`
- `independentSubject: true`

### Capture

- `captureRef`
- linked `subjectRef`
- capture stratum
- canonical asset digest
- capture time
- width / height
- device reference
- neutral / pose / expression attestations
- ground-truth lock ordering
- provider role prediction, which may remain `null` until after freeze

### Independent ground truth

- capture reference
- annotator reference
- blinded-to-provider attestation
- upper-rim annotation reference
- lower-rim annotation reference
- medial endpoint annotation reference
- lateral endpoint annotation reference
- explicit assertion that provider serialization order was not used as ground truth

## Evaluation dimensions

The eventual reviewed dataset must support separate scoring of:

1. provider component-role mapping
2. left/right mapping reproducibility
3. repeated-capture repeatability
4. pose stability
5. expression stability
6. calibration error thresholds

These dimensions remain separate. A good result in one dimension cannot silently satisfy another.

## Threshold policy

All acceptance thresholds remain unset in FR-43:

- provider role accuracy: `null`
- left/right agreement: `null`
- repeatability error: `null`
- pose error: `null`
- expression error: `null`

The protocol validator rejects pre-populated thresholds. Numeric thresholds must come from a later reviewed calibration/evaluation slice rather than being chosen to make the current hypothesis pass.

## Readiness behavior

With no dataset:

- protocol defined: `true`
- independent annotation protocol defined: `true`
- controlled capture protocol defined: `true`
- validation dataset present: `false`
- provider component-role mapping validated: `false`
- research candidate admitted: `false`

With a structurally complete manifest:

- required strata can become present
- repeated-neutral evidence can become present
- independent ground truth can become complete
- freeze ordering can become proven

But mapping, stability, repeatability and calibration still remain unvalidated until their actual scores and reviewed thresholds exist.

## Authority boundary

All remain false:

- FR-42 image-upper signal may define anatomical ground truth
- provider serialization order may define ground truth
- protocol definition means role mapping validated
- a single annotator record alone grants final ground-truth authority
- unlabeled pose capture may satisfy pose stability
- unlabeled expression capture may satisfy expression stability
- thresholds may be invented before dataset review
- provider component-role mapping authorization
- neutral brow geometry authorization
- brow-midline algorithm authorization
- production Three Divisions metric
- production F1
- production F6

## Result

FR-43 converts the next eyebrow step from an informal research intention into a deterministic, machine-validated evidence protocol.

It does **not** close `provider_component_role_mapping` yet. The next legitimate step is to acquire or construct a provider-blinded validation dataset under this protocol, then score it without moving the acceptance criteria after seeing the result.
