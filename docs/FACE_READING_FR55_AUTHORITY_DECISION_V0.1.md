# FR-55 authority decision

## Decision

FR-55 authorizes a **threshold-free raw geometric join** between:

- a frozen FR-54 provider/traditional/candidate-blind central-inferior chin reference trace annotation; and
- a bilateral Menton-side research candidate derived from an independent FR-50 annotation under the FR-52 Zupan definition.

It does not authorize membership, endpoint selection, a reviewed reference standard, empirical validation, provider mapping, traditional equivalence or production geometry.

## Identity safety

The join operates from the source annotations rather than identity-free derived outputs.

Required before geometry:

```text
referenceTrace.subjectId == candidateAnnotation.subjectId
referenceTrace.captureId == candidateAnnotation.captureId
```

Otherwise the join fails closed.

## Geometry

For each source-labelled Menton-side candidate, FR-55 computes closest-point Euclidean projection against every consecutive segment of the frozen raw polyline.

Reported values are raw normalized-image geometry only:

- minimum squared distance;
- minimum distance;
- every exact-minimum segment projection;
- raw segment indices;
- projection parameter and point.

Exact ties are preserved. No epsilon or segment-index priority is introduced.

## Midline anchor

The independently annotated Menton coordinates from the trace and candidate annotation are allowed to differ.

Their offset is reported numerically with:

```text
agreementDecision = null
anchorAgreementTolerance = null
```

## Null / undefined

```text
membershipThreshold          = null
anchorAgreementTolerance     = null
endpointSelectionRule        = null
candidateEquivalenceTolerance = null
interpolationMethod          = null
smoothingMethod              = null
empiricalAcceptanceCriterion = null
```

## Fail-closed interpretations

```text
raw distance -> membership                         false
zero distance -> exact FR-35 endpoint              false
nearest projection -> anatomical endpoint          false
raw segment index -> anatomical laterality         false
coverage boundary -> anatomical endpoint           false
candidate labels -> trace direction                false
Menton offset -> agreement/disagreement class      false
normalized image distance -> physical distance     false
exact tie -> index-priority winner                  false
FR-54 raw trace -> reviewed reference standard     false
freeze attestation -> cryptographic chronology     false
raw 2D join -> canonical automated extraction      false
Menton-side -> exact FR-35 endpoint                 false
provider mapping                                   false
traditional 地閣 equivalence                       false
empirical validation                               false
production geometry                                false
```

## Current blocker

The mathematical join is research-executable, but no real paired FR-54/FR-50 annotations exist in this slice.

The blocker is now:

`real same-capture candidate/reference observations and an independently justified empirical validation protocol are absent`.

Synthetic tests validate computation and contract behavior only.
