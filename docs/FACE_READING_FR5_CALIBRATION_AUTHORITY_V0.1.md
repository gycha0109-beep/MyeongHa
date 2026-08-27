# Face Reading FR-5 — Calibration Evidence Authority v0.1

Status: **executable authority foundation / no production threshold seed / no production physiognomy promotion**

## 1. Goal

FR-5 defines the authority boundary between a traditional qualitative statement and the numeric threshold used to operationalize it against modern face geometry.

```text
Traditional source
→ methodology
→ traditional criterion

separate evidence path:

neutral geometry metric
→ repeat-capture stability evidence
→ blinded expert operationalization evidence
→ threshold-selection method
→ calibration definition
→ issued calibration authorization
→ criterion classifier
```

The invariant is:

```text
traditional text != numeric threshold
synthetic metric fixture != threshold ground truth
raw calibration object != runtime authorization
```

## 2. Why FR-5 is required

FR-4 can measure a source-neutral geometric quantity such as:

```text
neutral.nose.bridge.centerline_rms_deviation@0.1.0
```

A traditional passage may describe the nose bridge as `梁柱端直`.

Neither statement supplies a justified numeric boundary such as:

```text
RMS <= 0.02 → 梁柱端直
```

Without FR-5, a developer could silently invent that threshold and turn implementation intuition into semantic authority.

FR-5 makes that impossible in the supported path.

## 3. Evidence classes

Calibration evidence is intentionally separate from the traditional source corpus.

### 3.1 synthetic_metric_fixture

Purpose:

- verify the metric implementation
- prove expected monotonic/discriminating behavior
- catch numerical or geometry regressions

It may not establish the human morphology boundary.

Participant policy:

```text
no_human_subjects
```

Current research seed:

```text
evidence.nose_bridge.synthetic_discriminating@0.1.0
```

This is reviewed metric evidence only.

### 3.2 repeat_capture_stability

Purpose:

- measure whether the same face under acceptable repeated captures produces stable metric values
- quantify pose/camera/capture sensitivity before a semantic boundary is used

Required participant policy:

```text
consented_deidentified
```

No production evidence is seeded in FR-5.

### 3.3 blinded_expert_operationalization

Purpose:

- independently label whether the traditional morphology criterion is met without seeing the candidate metric threshold
- provide an empirical target for threshold selection

Required:

```text
consented_deidentified
reviewProtocolRef
```

No production evidence is seeded in FR-5.

## 4. Production calibration requirements

A calibration with `status=production_authorized` must satisfy all of the following:

```text
known neutral metric
known traditional criterion
known methodology
traditional source declared by that methodology
traditional source >= scan_checked
methodology = production_authorized
explicit non-empty calibration dataset version
explicit threshold-selection method
explicit decision rule
repeat_capture_stability evidence
blinded_expert_operationalization evidence
all consumed calibration evidence >= reviewed
```

Synthetic metric evidence may be included, but it cannot substitute for either empirical evidence class.

## 5. Duplicate-reference hardening

FR-5 rejects duplicate references in:

- evidence metric refs
- evidence criterion refs
- evidence provenance refs
- calibration traditional source refs
- calibration evidence refs

This prevents a single evidence artifact from being repeated to create the appearance of multiple supporting authorities.

## 6. Metric-specific decision-rule hardening

Generic threshold syntax is not enough.

For:

```text
neutral.nose.bridge.centerline_rms_deviation@0.1.0
+
criterion.discernment.bridge_straight
```

FR-5 requires:

```text
kind = max_inclusive
threshold >= 0
```

because RMS deviation is non-negative and lower values correspond to a straighter centerline.

Therefore these are rejected:

```text
threshold = -0.001
kind = min_inclusive
```

Metric-specific calibration semantics must be explicit rather than inferred from a generic threshold union.

## 7. Runtime authorization boundary

A structurally valid calibration definition still does not go directly into a classifier.

Runtime path:

```text
validateFaceCalibrationDefinition()
→ authorizeFaceCalibration()
→ FaceCalibrationAuthorization
→ classifyNoseBridgeStraightness()
```

`authorizeFaceCalibration()` validates the entire FR-5 authority chain before issuing the authorization.

The active process records issued authorization object identities in a private runtime `WeakSet`.

A caller cannot create a look-alike object and pass it to the classifier:

```text
const forged = { ...issuedAuthorization }
→ rejected
```

This prevents a parallel raw-threshold authority from reappearing at the runtime seam.

## 8. Test-only calibration fixtures are not authority seeds

The tests construct synthetic examples with values such as:

```text
threshold = 0.02
status = production_authorized
```

These objects exist only inside test files to exercise the full validation/authorization/classification path.

They are deliberately named with `test-only` / `test-fixture` version and dataset identifiers.

The exported production package contains:

```text
no production FaceCalibrationDefinition
no production numeric threshold
no production repeat-capture evidence
no production expert-label evidence
```

The only exported calibration evidence seed is the reviewed synthetic metric fixture, which cannot authorize a production calibration by itself.

## 9. Relation to source authority

Traditional evidence and calibration evidence answer different questions.

```text
traditional source:
What morphology concept is the historical method asserting?

calibration evidence:
How can that concept be reproducibly represented with this modern metric/extractor/capture pipeline?
```

A strong traditional source does not justify a numeric threshold.

A strong calibration dataset does not create traditional meaning that is absent from the source corpus.

Production requires both chains to meet.

## 10. Privacy boundary

Human calibration evidence requires:

```text
participantPolicy = consented_deidentified
```

FR-5 does not authorize:

- training reuse of raw face images
- identity embeddings
- cross-session identity matching
- third-party face capture
- indefinite raw image retention

Calibration dataset storage/retention policy remains a separate implementation review before real human calibration collection.

## 11. Current promotion state

| Layer | State |
|---|---|
| synthetic bridge metric evidence | reviewed |
| repeat-capture evidence | absent |
| blinded expert operationalization evidence | absent |
| traditional 審辨官 source | research / production gate not closed |
| production calibration definition | absent |
| production numeric threshold | absent |
| issued runtime production authorization | possible only in test-complete authority fixture |
| real F2 `梁柱端直` claim | blocked |
| `審辨官成` | blocked |

## 12. Verification matrix

FR-5 tests verify:

1. reviewed synthetic evidence registry is valid
2. human evidence without `consented_deidentified` is rejected
3. blinded expert evidence requires a review protocol
4. duplicate evidence/source refs are rejected
5. unknown neutral metrics are rejected
6. metric-incompatible bridge threshold rules are rejected
7. research-only methodology cannot support production calibration
8. unverified traditional source cannot support production calibration
9. synthetic fixture cannot replace repeat-capture evidence
10. repeat-capture alone cannot replace blinded expert evidence
11. complete structural evidence can validate only in an explicit test fixture
12. raw forged runtime authorization is rejected
13. research calibration cannot issue runtime authorization
14. no threshold is seeded in the exported research registry

## 13. Next

FR-6 should not invent a production threshold.

The next implementation/research work should be:

1. define a real calibration dataset protocol
2. define repeat-capture acceptance conditions and stability statistics
3. define blinded morphology-labeling instructions tied to scan-checked source language
4. decide how many independent reviewers and what agreement rule are required
5. define threshold-selection/evaluation split to avoid fitting and evaluating on the same subjects
6. only then collect consented data and estimate a candidate bridge threshold
7. keep `準圓庫起` blocked until depth/fullness evidence exists
