# FR-55 — Threshold-free Menton-side candidate to reference-trace raw join

## Status

FR-54 defines a provider-blind, traditional-label-blind and endpoint-candidate-blind raw polyline observation for the FR-51-selected:

`central_inferior_soft_tissue_chin_boundary`

FR-52 preserves bilateral Menton-side as the strongest currently reproducible endpoint **research candidate**, not a final endpoint.

FR-55 defines the first non-circular geometric join between those two independently acquired observations.

Authority state:

`threshold_free_raw_candidate_to_trace_geometry_join_defined_membership_endpoint_and_production_authority_blocked`

## 1. Input identity binding

FR-52 and FR-54 derived outputs intentionally do not carry sufficient subject/capture identity for a safe cross-observation join.

Therefore FR-55 does not accept only the derived outputs.

It accepts:

1. the original `CentralChinInferiorReferenceTraceAnnotationFR54V1`; and
2. the original `IndependentCentralChinScaffoldAnnotationFR50V1` from which the FR-52 Menton-side candidate pair is derived.

Before any geometry is compared, FR-55 requires exact equality of:

```text
subjectId
captureId
```

A cross-subject or cross-capture join fails closed.

Annotator identities are preserved in the result but FR-55 does not invent a rule requiring the two annotators to be different.

## 2. Anti-circularity remains inherited from FR-54

The FR-54 trace is validated and frozen first.

Its contract requires that Menton-side, soft-tissue Mt, provider output and traditional labels were invisible during trace annotation, and that the trace was frozen before candidate annotation or comparison.

FR-55 relies on that explicit contract attestation.

It does **not** claim that the attestation is cryptographic or independently timestamp-proven chronology.

Authority boundary:

`attestedFreezeOrderMeansCryptographicChronologyProof = false`

## 3. Mathematical operation

For each source-labelled candidate:

- `left_menton_side`;
- `right_menton_side`;

FR-55 evaluates every consecutive segment of the frozen FR-54 raw polyline.

For a candidate point `P` and raw segment endpoints `A`, `B`, it computes the ordinary Euclidean projection parameter:

```text
t_raw = dot(P - A, B - A) / ||B - A||²
t = clamp(t_raw, 0, 1)
Q = A + t(B - A)
```

and reports:

```text
squared distance = ||P - Q||²
distance         = sqrt(squared distance)
```

This is neutral normalized-image geometry, not an anatomical or empirical classification.

The unit is:

`normalized_image_coordinate_euclidean_distance`

It is not millimetres and is not promoted to physical distance.

## 4. Exact ties are preserved

A candidate may be exactly nearest to a raw polyline vertex shared by two adjacent segments.

FR-55 does not silently choose the lower segment index or another arbitrary winner.

Tie policy:

`preserve_all_exact_minimum_segment_projections`

All segment projections whose computed squared distance exactly equals the minimum are retained.

No epsilon is invented.

No near-tie tolerance is invented.

The raw segment indices mean only positions in the annotator's stored draw sequence:

`raw_draw_order_segment_index_not_anatomical_side`

They are not anatomical left/right identifiers.

## 5. Distance is not membership

FR-55 returns raw numbers only.

For each candidate:

```text
minimumSquaredDistance
minimumDistance
closestProjections[]
membershipDecision = null
endpointDecision   = null
```

Even these cases do not receive stronger interpretation:

- distance `0`;
- projection on an interior trace vertex;
- projection on the first or last coverage vertex;
- both candidates having equal distances;
- one candidate being much closer than the other.

In particular:

```text
zero distance != exact FR-35 endpoint
closest trace point != anatomical endpoint
trace coverage boundary != anatomical endpoint
```

## 6. Midline Menton observations remain independent

FR-54 and the FR-50/52 candidate annotation each contain a soft-tissue Menton observation.

FR-55 does not require those coordinates to be identical.

It reports their Euclidean offset as:

`cross_annotation_midline_anchor_offset_only_no_agreement_threshold`

with:

`agreementDecision = null`

and:

`anchorAgreementTolerance = null`.

This avoids silently assuming two independent annotations share an identical coordinate while also avoiding an invented agreement threshold.

## 7. No interpolation or smoothing

FR-55 projects only onto the finite straight segments already implied by the stored raw polyline representation.

It does not create a spline, smooth the trace, resample it, densify it or extrapolate past its first/last coverage points.

Accordingly:

```text
interpolationMethod = null
smoothingMethod = null
```

The line segments are the literal geometry of the stored raw polyline, not an authorized reconstructed dense anatomical contour.

## 8. Deliberately unresolved

FR-55 leaves all of these `null`:

- membership threshold;
- midline-anchor agreement tolerance;
- endpoint-selection rule;
- candidate-equivalence tolerance;
- interpolation method;
- smoothing method;
- empirical acceptance criterion.

No threshold is fitted from the synthetic contract fixtures or from the observed join output.

## 9. Real evidence status

The code and synthetic fixtures can validate:

- identity binding;
- segment-projection mathematics;
- exact-tie preservation;
- fail-closed semantics.

They do not establish a real empirical result.

Current FR-55 readiness therefore remains:

```text
realReferenceTraceDatasetPresent = false
realPairedJoinDatasetPresent     = false
reviewedReferenceStandardReady   = false
membershipDecisionReady          = false
endpointSelectionReady           = false
productionGeometryReady          = false
```

## 10. Explicitly not authorized

FR-55 does not authorize:

- raw distance -> trace membership;
- zero distance -> FR-35 endpoint;
- nearest projection -> anatomical endpoint;
- raw segment index -> anatomical laterality;
- candidate left/right label -> trace draw direction;
- cross-annotation Menton offset -> agreement/disagreement class;
- normalized image distance -> physical distance;
- FR-54 trace -> reviewed reference standard;
- freeze attestation -> cryptographic chronology proof;
- raw 2D join -> canonical automated image extraction;
- Menton-side -> exact FR-35 endpoint;
- MediaPipe/provider mapping;
- traditional 地閣 equivalence;
- empirical validation;
- production 三停 / F1 / F6 / geometry.

## 11. Next evidence

The next material step is empirical acquisition, not another threshold invention:

1. collect real FR-54 raw reference traces;
2. separately collect real FR-50/52 Menton-side annotations on the same subject/capture identities;
3. run the FR-55 raw join;
4. preserve raw distances, exact ties and unresolved cases;
5. only then design a separately justified/preregistered validation protocol if a membership or endpoint-selection claim is needed.
