# MyeongHa Face Reading — FR-17 Neutral Derivation Registry v0.1

Status: **Research-only derivation authority**

## 1. Purpose

FR-17 closes the gap between:

```text
provider topology exists
```

and:

```text
MyeongHa is authorized to emit a provider-neutral point / curve / region
```

These are not equivalent.

The merged FR-16 provider evidence established:

```text
eyes  = closed cycles
brows = disconnected open chains
nose  = branched graph
```

but deliberately refused to invent convex hulls, bridges, centerlines, or traditional face regions.

FR-17 turns the remaining unresolved transformations into versioned authority records.

## 2. Current K_beauty runtime finding

Pinned repository inspection at:

```text
gycha0109-beep/K_beauty
commit = 81c3b4139efdffc785439da005557dc38a6b4873
```

shows that the canonical unified vision runtime currently uses:

```text
image
→ OpenAI image-bearing chat completion
→ bounded qualitative observation JSON
→ FaceLab observation normalizer/projector
```

The current FaceLab observation contract contains bounded visible-structure enums such as:

```text
face shape
forehead/jaw width relation
jaw angularity/taper
eye direction/length/openness
vertical balance
feature layout
straight/curve balance
contour definition
```

It does **not** expose a stable runtime landmark-coordinate contract or reviewed neutral brow/nose geometry derivation.

Therefore:

```text
@mediapipe/tasks-vision dependency exists
!=
current FaceLab runtime geometry authority exists
```

FR-17 keeps the bridge blocked.

## 3. Required derivations

FR-17 must resolve exactly the four derivation references left by FR-16:

```text
derivation.neutral.nose_region.pending
derivation.neutral.left_brow_curve.pending
derivation.neutral.right_brow_curve.pending
derivation.neutral.brow_midline.pending
```

No extra hidden derivation is permitted in v0.1.

## 4. Review states

```text
blocked_unresolved
→ transformation itself is not authorized

blocked_dependency
→ output depends on other unresolved neutral derivations

research_candidate
→ deterministic algorithm exists and has evidence/calibration, but is not reviewed

reviewed
→ algorithm and dependencies are reviewed and may become executable under later provider activation gates
```

Current v0.1 state:

```text
nose             = blocked_unresolved
left brow curve  = blocked_unresolved
right brow curve = blocked_unresolved
brow midline     = blocked_dependency
```

## 5. Algorithm authority

A derivation cannot become executable merely by setting:

```text
reviewState = reviewed
algorithmRef = arbitrary string
```

FR-17 has a separate Algorithm Definition Registry.

Current registry intentionally contains:

```text
0 authorized algorithms
```

Therefore every current derivation is structurally non-executable.

A future algorithm definition must pin:

```text
algorithmRef
version
input topology class
output geometry kind
deterministic = true
transformation specification
evidence refs
calibration refs
review state
```

A derivation may reference only an algorithm actually present in that registry.

## 6. Nose region

Provider evidence class:

```text
branched_graph
```

Desired neutral output:

```text
region
```

No reviewed rule currently states which cycle/subgraph or derived perimeter constitutes the neutral nose region.

Forbidden shortcuts:

```text
convex_hull
bounding_box
manual_provider_index_subset
hand_drawn_polygon
```

Failure semantics:

```text
unavailable
```

Never:

```text
missing derivation
→ assume average nose
→ negative/positive evidence
```

## 7. Brow curves

Provider evidence class:

```text
disconnected_open_chains
```

Desired neutral output:

```text
one curve per brow
```

Forbidden shortcuts:

```text
first_chain_only
second_chain_only
bridge_disconnected_chains
pointwise_average_without_correspondence_authority
bezier_smoothing
```

A future derivation must explicitly define which representation is neutral and why.

## 8. Brow midline

Desired output:

```text
point
```

The midline depends on both left and right neutral brow representations.

Current dependencies:

```text
left brow curve
right brow curve
```

The following are forbidden:

```text
fixed provider landmark index
manual pixel midpoint
midpoint of unreviewed brow representations
```

The derivation remains dependency-blocked until its dependencies are reviewed.

## 9. Evidence resolution

FR-17 does not accept provenance-shaped free strings.

Every derivation `evidenceRef` must resolve in the FR-17 evidence registry.

Current evidence records pin:

1. merged FR-16 topology structure authority;
2. K_beauty FaceLab qualitative observation contract;
3. K_beauty canonical unified runtime provider path.

This prevents an accidental typo from looking like source-backed authority.

## 10. Neutral-only target boundary

A derivation may target only anchors present in the FR-14 neutral binding profile.

Rejected examples:

```text
shangen / 山根
tiancang / 天倉
jianmen / 奸門
leitang / 淚堂
```

Those are traditional methodology anchors and belong after neutral observation, through explicit traditional operationalization.

Correct architecture:

```text
provider evidence
→ neutral derivation
→ FR-15 neutral observation
→ traditional operationalization
→ source-governed Face rule
```

Forbidden:

```text
provider index
→ traditional anchor
→ fortune claim
```

## 11. Dependency safety

Derivation dependencies form a bounded directed graph.

Validation rejects:

```text
unknown dependency
self/cyclic dependency
missing FR-16 required derivation
wrong neutral consumer slot
wrong output geometry kind
```

A reviewed derivation is executable only when:

```text
its algorithm exists and is reviewed
+
all dependency derivations are executable
```

## 12. Current readiness

```text
productionReady = false
executableDerivationRefs = []
blockedDerivationRefs = 4
unresolvedRequiredRefs = []
```

`unresolvedRequiredRefs=[]` means FR-16's required refs are registered, **not** that their transformations are solved.

All four definitions remain blocked.

## 13. Product impact

This strict pre-diagnosis boundary is compatible with the product direction that diagnosed sections should be decisive.

```text
before diagnosis
→ strict observation / source / derivation validation

after diagnosis is governed
→ assertive consumer wording
```

A stronger user-facing tone does not justify weaker geometry authority.

## 14. Next

FR-18 should focus on **neutral derivation research/calibration**, not traditional physiognomy polygons.

Possible bounded workstreams:

```text
A. exact release-attestation for the provider topology actually used
B. controlled synthetic/annotated brow representation study
C. neutral nose-region representation study
D. controlled laterality/orientation fixture
```

Only a reviewed deterministic derivation may populate the FR-17 algorithm registry.

Traditional 十二宮/山根/天倉 geometry remains a separate downstream operationalization problem.
